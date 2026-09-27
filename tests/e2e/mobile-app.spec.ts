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
  expect((await more.boundingBox())!.height).toBeLessThan(700);
  await page.screenshot({ path: testInfo.outputPath('mobile-more-sheet.png'), scale: 'css' });
  await more.getByRole('button', { name: 'Close dialog' }).click();
  await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeFocused();
  await nav.getByRole('button', { name: 'New experience', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.getByRole('button', { name: 'Dismiss sheet' }).hover();
  const screen = (await create.boundingBox())!;
  expect(screen.width).toBe(390);
  expect(screen.y).toBeGreaterThanOrEqual(24);
  expect(Math.abs(screen.y + screen.height - 844)).toBeLessThan(2);
  await expect(create).toHaveCSS('border-top-left-radius', '24px');
  await expect(create.getByRole('button', { name: 'Dismiss sheet' })).toBeVisible();
  await create.getByRole('button', { name: 'Close dialog' }).click();
  await nav.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Studio', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('tab', { name: 'Storyboard' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: testInfo.outputPath('mobile-app-home.png'), scale: 'css' });
});

test('desktop keeps the full studio navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop regression');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.greeting')).toBeVisible();
  await page.getByRole('button', { name: 'New experience', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dismiss sheet' })).toBeHidden();
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.width).toBeLessThan(page.viewportSize()!.width);
  expect(dialog.y).toBeGreaterThan(0);
});

test('phone sheets support handle dismissal and scrollable feedback in a short viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone sheet behavior');
  await page.goto('/');
  const more = page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More', exact: true });
  await more.click();
  const dialog = page.getByRole('dialog');
  const handle = dialog.getByRole('button', { name: 'Dismiss sheet' });
  await handle.hover();
  const start = (await handle.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + 22);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + 42, { steps: 4 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.move(start.x + start.width / 2, start.y + 22);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + 122, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();

  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Write a general note' }).click();
  const feedback = page.getByRole('dialog', { name: 'Leave your mark' });
  await expect(feedback).toHaveCSS('border-top-left-radius', '24px');
  await page.setViewportSize({ width: 390, height: 420 });
  const comment = feedback.getByRole('textbox', { name: 'Comment', exact: true });
  await comment.fill('Still reachable when the available height shrinks.');
  await comment.scrollIntoViewIfNeeded();
  await expect(comment).toBeInViewport();
  const send = feedback.getByRole('button', { name: 'Send to shared board' });
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  await expect(feedback.getByRole('button', { name: 'Close feedback dialog' })).toBeInViewport();
  const box = (await feedback.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(24);
  expect(Math.abs(box.y + box.height - 420)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mobile-feedback-sheet-short.png'),
    scale: 'css',
  });
  page.once('dialog', async (confirmation) => {
    expect(confirmation.message()).toBe('Discard this unsent feedback?');
    await confirmation.accept();
  });
  await page.keyboard.press('Escape');
  await expect(feedback).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});
