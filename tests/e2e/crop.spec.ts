import { expect, test, type Page } from '@playwright/test';

type Workspace = {
  experiences: Array<{ scenes: Array<{ social: { focus: Record<string, number> } }> }>;
};
const savedFocus = async (page: Page) =>
  ((await (await page.request.get('/api/v1/workspace')).json()) as Workspace).experiences[0]
    .scenes[0].social.focus;

test('crop editor moves and zooms the image by drag, wheel and pinch', async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === 'mobile';
  if (phone) await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  if (phone) {
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('button', { name: 'Posts', exact: true })
      .click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
  } else await page.getByRole('tab', { name: 'Social pack' }).click();
  const preview = (await page.locator('.platform-preview-image').boundingBox())!;
  await page.getByRole('button', { name: 'Adjust crop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adjust crop' });
  const zoom = dialog.getByLabel('Zoom');
  const vertical = dialog.getByLabel('Vertical position');
  const horizontal = dialog.getByLabel('Horizontal position');
  for (const target of [zoom, vertical, dialog.getByRole('button', { name: 'Done' })])
    await expect(target).toBeInViewport({ ratio: 1 });
  const stage = dialog.locator('.crop-stage');
  const frame = (await dialog.locator('.crop-frame').boundingBox())!;
  // The editor shows the crop larger than the post preview does.
  expect(frame.height).toBeGreaterThan(preview.height);
  await expect(zoom).toHaveValue('1');
  await expect(vertical).toHaveValue('45');
  // A 3:4 photo fills a 4:5 frame across, so at 1x only the vertical position can move.
  await expect(horizontal).toBeDisabled();

  const x = frame.x + frame.width / 2;
  const y = frame.y + frame.height / 2;
  if (phone) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: number[][]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })),
      });
    // One finger drags the image down, showing more of the top of the photo.
    await touch('touchStart', [[x, y]]);
    for (let step = 1; step <= 5; step++) await touch('touchMove', [[x, y + step * 8]]);
    await touch('touchEnd', []);
    await expect(stage).not.toHaveAttribute('data-moving');
    await expect.poll(async () => Number(await vertical.inputValue())).toBeLessThan(45);
    // Two fingers spreading from 60px to 120px apart zoom to 2x.
    await touch('touchStart', [
      [x - 30, y],
      [x + 30, y],
    ]);
    for (let step = 1; step <= 6; step++)
      await touch('touchMove', [
        [x - 30 - step * 5, y],
        [x + 30 + step * 5, y],
      ]);
    await touch('touchEnd', []);
    await expect(stage).not.toHaveAttribute('data-moving');
    await expect.poll(async () => Number(await zoom.inputValue())).toBeCloseTo(2, 1);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(stage).not.toHaveAttribute('data-moving');
    await expect.poll(async () => Number(await vertical.inputValue())).toBeLessThan(45);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(1.5);
  }
  // Zoomed in, the image can move sideways too, and the export shrinks rather than upscales.
  await expect(horizontal).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('crop-editor.png'), scale: 'css' });
  await expect(dialog).not.toContainText('Exports at 1080 × 1350 px');
  const chosen = {
    zoom: Number(await zoom.inputValue()),
    y: Number(await vertical.inputValue()),
  };
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Zoom ${Math.round(chosen.zoom * 100)}%`)).toBeVisible();
  // The preview scales the image from the crop position, as the export does.
  await expect(page.locator('.platform-preview-image > img')).toHaveCSS('transform', /^matrix/);

  // Cancel keeps the crop the user already chose.
  await page.getByRole('button', { name: 'Adjust crop', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(zoom).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  if (phone) await page.getByRole('button', { name: 'Write post', exact: true }).click();
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('Instagram post saved for this image.', { exact: true }),
  ).toBeVisible();
  const focus = await savedFocus(page);
  expect(focus.zoom).toBeCloseTo(chosen.zoom, 2);
  expect(Math.round(focus.y)).toBe(chosen.y);
  expect(focus.x).toBeGreaterThanOrEqual(0);
});
