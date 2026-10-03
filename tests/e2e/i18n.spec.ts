import { test, expect } from '@playwright/test';
import { catalogs } from '../../apps/web/src/i18n/catalogs';

const copy = (locale: string, namespace: string, english: string) => {
  const key = Object.entries(catalogs.en[namespace]).find(([, value]) => value === english)?.[0];
  if (!key) throw new Error(`Uncatalogued test label: ${namespace}: ${english}`);
  return catalogs[locale][namespace][key];
};

for (const locale of ['en', 'he', 'en-XA', 'ar-XB']) {
  test.describe(locale, () => {
    test.use({ locale });
    test('first paint, studio generation, social draft and feedback', async ({
      page,
      isMobile,
    }) => {
      const translationErrors: string[] = [];
      page.on('console', (event) => {
        if (/MISSING_MESSAGE|INVALID_MESSAGE|FORMATTING_ERROR/.test(event.text()))
          translationErrors.push(event.text());
      });
      const t = (english: string) => copy(locale, 'studio', english);
      const f = (english: string) => copy(locale, 'feedback', english);
      await page.addInitScript(() => {
        const calls: { text: string; x: number; alignment: string }[] = [];
        (window as unknown as { exportTextCalls: typeof calls }).exportTextCalls = calls;
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          calls.push({ text, x, alignment: this.textAlign });
          return maxWidth === undefined
            ? fill.call(this, text, x, y)
            : fill.call(this, text, x, y, maxWidth);
        };
      });
      const response = await page.goto('/');
      const direction = locale === 'he' || locale === 'ar-XB' ? 'rtl' : 'ltr';
      expect(await response!.text()).toMatch(
        new RegExp(`<html[^>]*lang="${locale}"[^>]*dir="${direction}"`),
      );
      await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole('button', { name: t('Generate remaining'), exact: true }).click();
      await expect(
        page.locator('.scene-image-button').filter({ has: page.locator('img') }),
      ).toHaveCount(4, { timeout: 20000 });
      await expect(page.getByText(t('Creating your scene'), { exact: true })).toHaveCount(0, {
        timeout: 20000,
      });
      for (const title of ['Above the ordinary', 'The long way home']) {
        await page
          .locator('.scene-image-button')
          .filter({ has: page.getByAltText(title, { exact: false }) })
          .click();
        await page
          .getByRole('button', { name: t('Approve'), exact: true })
          .first()
          .click();
        await page.getByRole('button', { name: t('Close dialog'), exact: true }).click();
      }
      await expect(page.getByRole('button', { name: t('Export demo pack') })).toBeEnabled();
      if (isMobile)
        await page
          .getByRole('navigation', { name: copy(locale, 'common', 'Mobile navigation') })
          .getByRole('button', { name: copy(locale, 'common', 'Posts'), exact: true })
          .click();
      else await page.getByRole('tab', { name: t('Social pack'), exact: true }).click();
      await page
        .getByLabel(t('Post text'), { exact: true })
        .fill('שלום Tokyo #42 https://example.com');
      await page.getByRole('button', { name: t('Save post'), exact: true }).click();
      if (isMobile) await page.getByRole('button', { name: t('Preview'), exact: true }).click();
      const label = page.locator('.preview-disclosure');
      await expect(label).toHaveText(catalogs[locale].studio.disclosure);
      const box = await label.boundingBox();
      const image = await page.locator('.platform-preview-image').boundingBox();
      expect(box!.x - image!.x).toBeLessThan(image!.width * 0.15);
      await page.screenshot({
        path: `test-results/${locale}-${isMobile ? 'phone' : 'desktop'}-studio.png`,
        fullPage: true,
      });
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: t('Export demo pack') }).click();
      expect((await downloaded).suggestedFilename()).toBe('wishscene-tokyo-demo.zip');
      const disclosureCalls = await page.evaluate(
        (label) =>
          (
            window as unknown as {
              exportTextCalls: { text: string; x: number; alignment: string }[];
            }
          ).exportTextCalls.filter((call) => call.text === label),
        catalogs[locale].studio.disclosure,
      );
      expect(disclosureCalls).toHaveLength(4);
      expect(disclosureCalls.every((call) => call.alignment === 'left' && call.x < 100)).toBe(true);
      await page.goto('/feedback');
      await expect(
        page.getByRole('heading', { name: f('Team feedback'), exact: false }),
      ).toBeVisible();
      await expect(page.getByLabel(f('Search feedback'))).toBeVisible();
      if (isMobile) await page.getByRole('button', { name: f('Filters'), exact: false }).click();
      await page.getByLabel(f('Filter by status')).selectOption('open');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/${locale}-${isMobile ? 'phone' : 'desktop'}-feedback.png`,
        fullPage: true,
      });
      expect(translationErrors).toEqual([]);
    });
  });
}

test('language change asks before discarding a post draft and persists accepted choice', async ({
  page,
  context,
  isMobile,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  if (isMobile)
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('button', { name: 'Posts', exact: true })
      .click();
  else await page.getByRole('tab', { name: 'Social pack', exact: true }).click();
  await page.getByLabel('Post text', { exact: true }).fill('Keep this unsaved draft');
  if (isMobile) await page.getByRole('button', { name: 'More', exact: true }).click();
  let prompted = 0;
  page.once('dialog', async (dialog) => {
    prompted++;
    await dialog.dismiss();
  });
  await page.getByLabel('Language', { exact: true }).filter({ visible: true }).selectOption('he');
  expect(prompted).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await context.cookies()).find((c) => c.name === 'wishscene_locale')).toBeUndefined();
  if (isMobile) {
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
      'Keep this unsaved draft',
    );
    await page.getByRole('button', { name: 'More', exact: true }).click();
  } else
    await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
      'Keep this unsaved draft',
    );
  page.once('dialog', async (dialog) => {
    prompted++;
    await dialog.accept();
  });
  await page.getByLabel('Language', { exact: true }).filter({ visible: true }).selectOption('he');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(prompted).toBe(2);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  expect((await context.cookies()).find((c) => c.name === 'wishscene_locale')?.httpOnly).toBe(true);
});

test.describe('Hebrew gallery', () => {
  test.use({ locale: 'he-IL' });
  test('RTL gallery next and previous preserve logical image order', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Horizontal gallery controls are phone only');
    await page.goto('/');
    const gallery = page.locator('.mobile-gallery').first();
    await gallery.getByRole('button', { name: /^התמונה הבאה/ }).click();
    await expect(gallery.getByRole('status')).toHaveText('2 מתוך 4');
    await gallery.getByRole('button', { name: /^התמונה הקודמת/ }).click();
    await expect(gallery.getByRole('status')).toHaveText('1 מתוך 4');
  });
});
