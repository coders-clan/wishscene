import { test, expect } from '@playwright/test';

test.use({ locale: 'he-IL' });

test('Hebrew first paint, saved choice, and RTL gallery', async ({ page, context, isMobile }) => {
  const response = await page.goto('/');
  const html = await response!.text();
  expect(html).toMatch(/<html[^>]*lang="he"[^>]*dir="rtl"/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'הדמיון שלכם, בתמונה.' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
  if (isMobile) {
    const gallery = page.locator('.mobile-gallery').first();
    const next = gallery.getByRole('button', { name: /^התמונה הבאה/ });
    await expect(next).toBeVisible();
    await next.click();
    await expect(gallery.getByRole('status')).toHaveText('2 מתוך 4');
    await gallery.getByRole('button', { name: /^התמונה הקודמת/ }).click();
    await expect(gallery.getByRole('status')).toHaveText('1 מתוך 4');
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
  }
  const selector = page.getByLabel('שפה', { exact: true }).filter({ visible: true });
  await expect(selector).toBeVisible();
  await page.screenshot({
    path: `test-results/he-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  await selector.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'wishscene_locale')?.httpOnly,
  ).toBe(true);
});
