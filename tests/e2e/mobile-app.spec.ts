import { expect, test } from '@playwright/test';

test('phone workspace has app navigation, compact scenes, and focused screens', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone-specific interaction model');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(nav).toBeInViewport({ ratio: 1 });
  await expect(nav.getByRole('button', { name: 'Studio', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.greeting')).toBeHidden();
  for (const width of [320, 390, 430, 600]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const cards = page.locator('.scene-card');
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x);
    for (const button of await nav.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Story details', exact: true }).click();
  await expect(page.locator('.story-detail.outfit')).toBeVisible();
  await page.getByRole('button', { name: 'Story details', exact: true }).click();
  await expect(page.locator('.story-detail.outfit')).toBeHidden();
  await nav.getByRole('button', { name: 'Posts', exact: true }).click();
  await expect(page.getByLabel('Platform & format')).toBeVisible();
  await page.getByLabel('Post text', { exact: true }).fill('My draft stays when I switch screens.');
  await nav.getByRole('button', { name: 'Studio', exact: true }).click();
  await nav.getByRole('button', { name: 'Posts', exact: true }).click();
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
    'My draft stays when I switch screens.',
  );
  await nav.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'Your workspace' });
  await expect(more.getByRole('link', { name: /Team feedback/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-more-sheet.png'), scale: 'css' });
  await more.getByRole('button', { name: 'Close dialog' }).click();
  await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeFocused();
  await nav.getByRole('button', { name: 'New experience', exact: true }).click();
  const create = page.getByRole('dialog');
  const screen = (await create.boundingBox())!;
  expect(screen.width).toBe(390);
  expect(screen.height).toBe(844);
  await create.getByRole('button', { name: 'Close dialog' }).click();
  await nav.getByRole('button', { name: 'Studio', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile-app-home.png'), scale: 'css' });
});

test('desktop keeps the full studio navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop regression');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.greeting')).toBeVisible();
});
