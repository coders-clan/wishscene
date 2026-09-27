import { expect, test } from '@playwright/test';

test('complete an experience, download it, then invalidate old approvals', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator('.scene-image-button img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('studio.png'), fullPage: true });
  await page.getByRole('button', { name: 'Generate remaining' }).click();
  await expect(page.getByText('Creating your scene', { exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
  for (const title of ['Above the ordinary', 'The long way home']) {
    await page.getByRole('button', { name: `Review ${title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Approved', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export demo pack' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('wishscene-tokyo-demo.zip');
  await page.getByRole('button', { name: 'Story settings' }).click();
  await page.getByLabel('Your look').fill('Blue linen suit');
  await page.getByRole('button', { name: 'Save story' }).click();
  await expect(page.getByText('v2', { exact: true })).toBeVisible();
  await expect(page.getByText('Story updated', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
});

test('create a fresh experience and edit the social caption', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await page.getByRole('button', { name: 'New experience', exact: true }).click();
  await page.getByLabel('Experience name').fill('Kyoto at first light');
  await page.getByLabel('Destination', { exact: true }).selectOption('Kyoto');
  await page.getByRole('button', { name: 'Create experience' }).click();
  await expect(page.getByRole('heading', { name: 'Kyoto at first light' })).toBeVisible();
  await page.getByRole('tab', { name: 'Social pack' }).click();
  await page.getByLabel('Your caption').fill('A fictional daydream. #wishscene');
  await page.getByRole('button', { name: 'Save caption' }).click();
  await page.reload();
  // Experience selection is local UI state; select the new workspace after reload.
  await page.getByRole('button', { name: /Tokyo, after hours/ }).click();
  await page.getByRole('button', { name: /Kyoto at first light/ }).click();
  await page.getByRole('tab', { name: 'Social pack' }).click();
  await expect(page.getByLabel('Your caption')).toHaveValue('A fictional daydream. #wishscene');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('simulate a failed job and reset the demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Mock mode' }).click();
  await page.getByLabel('Generation scenario').selectOption('failure');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByText('Try again', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Mock mode' }).click();
  await page.getByRole('button', { name: 'Reset demo workspace' }).click();
  await expect(page.getByText('Ready to create', { exact: true })).toBeVisible();
});
