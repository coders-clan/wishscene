import { expect, test, type Locator } from '@playwright/test';

test('phone workspace has app navigation, swipeable scenes, and focused screens', async ({
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
    expect(first.width).toBeGreaterThan(width * 0.75);
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
  // Phones hide the section tabs; the bottom navigation switches screens instead.
  await expect(page.getByRole('tab', { name: 'Storyboard' })).toBeHidden();
  await expect(page.getByRole('tabpanel', { name: 'Storyboard' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-app-home.png'), scale: 'css' });
});

test('phone screens fit the viewport without page scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone-specific layout');
  const pageScrolls = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    );
  // In-viewport checks cannot see a sticky row painted on top; hit-test the centre.
  const onTop = (target: Locator) =>
    target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!hit && element.contains(hit);
    });
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  const exportButton = page.getByRole('button', { name: 'Export demo pack' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  // Typical in-browser phone heights (under toolbars) and a tall phone.
  for (const [width, height] of [
    [390, 664],
    [360, 640],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await nav.getByRole('button', { name: 'Studio', exact: true }).click();
    expect(await pageScrolls()).toBe(false);
    for (const target of [
      page.getByRole('button', { name: 'Generate remaining' }),
      page.getByRole('button', { name: 'Review Neon kind of night' }),
      page.getByRole('button', { name: 'Create post for Neon kind of night' }),
      exportButton,
      nav,
    ])
      await expect(target).toBeInViewport({ ratio: 1 });
    await nav.getByRole('button', { name: 'Posts', exact: true }).click();
    await page.getByRole('button', { name: 'Write post', exact: true }).click();
    expect(await pageScrolls()).toBe(false);
    for (const target of [
      page.getByLabel('Platform & format'),
      page.getByLabel('Post text', { exact: true }),
      page.getByRole('button', { name: 'Save post', exact: true }),
      exportButton,
    ])
      await expect(target).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Instagram post preview' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'Save post', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Pack caption', exact: true }).click();
    for (const target of [
      page.getByLabel('Your caption', { exact: true }),
      page.getByRole('button', { name: 'Save caption', exact: true }),
    ])
      await expect(target).toBeInViewport({ ratio: 1 });
    expect(await pageScrolls()).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-fit-caption.png'), scale: 'css' });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole('button', { name: 'Write post', exact: true }).click();
  // Formats with on-image text scroll inside the panel; Save and status stay pinned on screen.
  await page.getByLabel('Platform & format').selectOption('instagram-story');
  const overlay = page.getByLabel('Text on image');
  await overlay.focus();
  expect(await onTop(overlay)).toBe(true);
  await overlay.fill('Meet me in a daydream');
  const save = page.getByRole('button', { name: 'Save post', exact: true });
  await expect(save).toBeInViewport({ ratio: 1 });
  expect(await onTop(save)).toBe(true);
  expect(await pageScrolls()).toBe(false);
  await save.click();
  const saved = page.getByText('Instagram Story saved for this image.', { exact: true });
  await expect(saved).toBeInViewport({ ratio: 1 });
  expect(await onTop(saved)).toBe(true);
  await nav.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Your workspace' })
    .getByRole('button', { name: /^Motion/ })
    .click();
  await expect(page.getByRole('tabpanel', { name: 'Motion' })).toBeVisible();
  expect(await pageScrolls()).toBe(false);
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: /Team feedback/ })).toBeVisible();
  expect(await pageScrolls()).toBe(false);
});

test('desktop keeps the full studio navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop regression');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.greeting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next image in Scene gallery' })).toBeHidden();
  await expect(page.locator('.scene-grid')).toHaveCSS('display', 'grid');
  const cards = page.locator('.scene-card');
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(first.width).toBeLessThan(page.viewportSize()!.width / 2);
  await page.getByRole('button', { name: 'New experience', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dismiss sheet' })).toBeHidden();
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.width).toBeLessThan(page.viewportSize()!.width);
  expect(dialog.y).toBeGreaterThan(0);
});

test('phone gallery swipes browse scenes and choices without approving them', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone-only gallery');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const gallery = page.getByRole('region', { name: 'Scene gallery', exact: true });
  await expect(gallery.getByRole('status')).toHaveText('1 of 4');
  await expect(
    gallery.getByRole('button', { name: 'Previous image in Scene gallery' }),
  ).toBeDisabled();
  await gallery.getByRole('button', { name: 'Next image in Scene gallery' }).click();
  await expect(gallery.getByRole('status')).toHaveText('2 of 4');
  const track = gallery.locator('.mobile-gallery-track');
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = Math.max(90, box.y + 80);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width * 0.85, y }],
  });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * (0.85 - step * 0.075), y }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(gallery.getByRole('status')).toHaveText('3 of 4');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
  await gallery.getByRole('button', { name: 'Next image in Scene gallery' }).click();
  await expect(gallery.getByRole('status')).toHaveText('4 of 4');
  await expect(gallery.getByRole('button', { name: 'Next image in Scene gallery' })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('mobile-swipe-gallery.png'),
    scale: 'css',
    animations: 'disabled',
  });

  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Experiences', exact: true })
    .click();
  const library = page.getByRole('region', { name: 'Experience gallery' });
  await library.getByRole('button', { name: 'Next image in Experience gallery' }).click();
  await expect(library.getByRole('status')).toHaveText('2 of 4');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'New experience', exact: true })
    .click();
  await page.getByLabel('Experience name').fill('Gallery test');
  await page.getByLabel('Your look').fill('Custom blue jacket');
  await page.getByRole('button', { name: 'Create experience', exact: true }).click();
  await expect(gallery.getByRole('status')).toHaveText('1 of 4');
  await page.locator('.scene-image-button').first().click();
  await page.getByRole('button', { name: 'Generate candidates', exact: true }).click();
  const choices = page.getByRole('region', { name: 'Image choices' });
  await expect(choices.getByRole('status')).toHaveText('1 of 2', { timeout: 15000 });
  await choices.getByRole('button', { name: 'Next image in Image choices' }).click();
  await expect(choices.getByRole('status')).toHaveText('2 of 2');
  await expect(choices.getByRole('button', { name: 'Approved', exact: true })).toHaveCount(0);
  await choices
    .locator('.candidate')
    .last()
    .getByRole('button', { name: 'Approve', exact: true })
    .click();
  await expect(choices.getByRole('button', { name: 'Approved', exact: true })).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('mobile-choice-gallery.png'),
    scale: 'css',
    animations: 'disabled',
  });
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
