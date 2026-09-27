import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

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
  await page.screenshot({ path: testInfo.outputPath('studio.png'), fullPage: true, scale: 'css' });
  await page.getByRole('button', { name: 'Generate remaining' }).click();
  await expect(page.getByText('Creating your scene', { exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
  for (const title of ['Above the ordinary', 'The long way home']) {
    await page.getByRole('button', { name: `Review ${title}`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true }).first()).toBeInViewport(
      { ratio: 1 },
    );
    if (title === 'Above the ordinary')
      await page.screenshot({
        path: testInfo.outputPath('photo-review.png'),
        fullPage: true,
        scale: 'css',
      });
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Approved', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create post for Neon kind of night' }).click();
  await page.getByLabel('Platform & format').selectOption('instagram-story');
  await page
    .getByLabel('Post text', { exact: true })
    .fill('A fictional Tokyo night, made with wishscene.');
  await page.getByLabel('Text on image').fill('Meet me in a daydream');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('Instagram Story saved for this image.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compose post for A table for daydreams' }).click();
  await page.getByLabel('Platform & format').selectOption('linkedin');
  await page
    .getByLabel('Post text', { exact: true })
    .fill('Exploring a fictional scene through creative photography.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('LinkedIn post saved for this image.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export demo pack' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('wishscene-tokyo-demo.zip');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const photos = Object.values(zip.files).filter((file) => file.name.endsWith('.jpg'));
  expect(photos).toHaveLength(4);
  const posts = Object.values(zip.files).filter(
    (file) => file.name.startsWith('posts/') && file.name.endsWith('.txt'),
  );
  expect(posts).toHaveLength(4);
  expect(
    await posts.find((file) => file.name.endsWith('-instagram-story.txt'))!.async('text'),
  ).toContain('Meet me in a daydream');
  expect(await posts.find((file) => file.name.endsWith('-linkedin.txt'))!.async('text')).toContain(
    'creative photography',
  );
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  expect(manifest.assets[0].social.platform).toBe('instagram-story');
  expect(manifest.assets[1].social.caption).toContain('creative photography');
  for (const photo of photos) {
    const bytes = await photo.async('nodebuffer');
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(bytes.subarray(-2).toString('hex')).toBe('ffd9');
  }
  await page.getByRole('button', { name: 'Story settings' }).click();
  await page.getByLabel('Your look').fill('Blue linen suit');
  await expect(page.getByText('Custom developer settings', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save story' }).click();
  await expect(page.getByText('v2', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Storyboard' }).click();
  await expect(page.getByText('Story updated', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
  await page.getByRole('button', { name: 'Story settings' }).click();
  await page.getByRole('button', { name: 'Use Tokyo photo preset' }).click();
  await expect(page.getByLabel('Your look')).toHaveValue('Ivory jacket · charcoal trousers');
  await page.getByRole('button', { name: 'Save story' }).click();
  await expect(page.getByText('v3', { exact: true })).toBeVisible();
});

test('preview platforms, retain per-image drafts, and reload saved text', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create post for Neon kind of night' }).click();
  await page.getByLabel('Platform & format').selectOption('instagram-story');
  await page.getByLabel('Post text', { exact: true }).fill('An imagined evening in Tokyo.');
  await page.getByLabel('Text on image').fill('לילה של דמיון');
  await expect(page.getByRole('article', { name: 'Instagram Story preview' })).toContainText(
    'לילה של דמיון',
  );
  await page.getByRole('button', { name: 'Compose post for A table for daydreams' }).click();
  await page.getByLabel('Platform & format').selectOption('linkedin');
  await page
    .getByLabel('Post text', { exact: true })
    .fill('A separate visual concept for image two.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('LinkedIn post saved for this image.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compose post for Neon kind of night' }).click();
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
    'An imagined evening in Tokyo.',
  );
  await expect(page.getByLabel('Text on image')).toHaveValue('לילה של דמיון');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('Instagram Story saved for this image.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Platform & format').selectOption('x');
  await page.getByLabel('Post text', { exact: true }).fill('x'.repeat(241));
  await expect(page.getByRole('button', { name: 'Save post', exact: true })).toBeDisabled();
  await expect(page.getByText(/Shorten the text to save/)).toBeVisible();
  await page.getByLabel('Writing tone').selectOption('playful');
  await page.getByRole('button', { name: 'Use suggested text' }).click();
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
    /imagination packed first/,
  );
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(page.getByText('X post saved for this image.', { exact: true })).toBeVisible();
  await page.getByLabel('Platform & format').selectOption('instagram-story');
  await expect(page.getByLabel('Text on image')).toHaveValue('לילה של דמיון');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByText('Instagram Story saved for this image.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Social pack' }).click();
  await expect(page.getByLabel('Platform & format')).toHaveValue('instagram-story');
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
    'An imagined evening in Tokyo.',
  );
  await expect(page.getByLabel('Text on image')).toHaveValue('לילה של דמיון');
  await page.screenshot({
    path: testInfo.outputPath('social-story-composer.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Compose post for A table for daydreams' }).click();
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue(
    'A separate visual concept for image two.',
  );
  await expect(page.getByRole('article', { name: 'LinkedIn post preview' })).toContainText(
    'A separate visual concept for image two.',
  );
  await page.screenshot({
    path: testInfo.outputPath('social-feed-composer.png'),
    fullPage: true,
    scale: 'css',
  });
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('tab', { name: 'Storyboard' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // A refreshed snapshot must not turn an old unsaved draft into a valid overwrite.
  await page.getByRole('tab', { name: 'Social pack' }).click();
  await page.getByLabel('Post text', { exact: true }).fill('Unsaved local copy.');
  const workspace = await (await page.request.get('/api/v1/workspace')).json();
  const current = workspace.experiences[0].scenes[1];
  const competing = await page.request.patch(
    `/api/v1/experiences/tokyo-after-hours/scenes/${current.id}/social`,
    {
      data: {
        expectedVersion: 1,
        expectedRevision: current.social.revision,
        platform: 'linkedin',
        draft: { caption: 'Saved in another tab.', overlayText: '', tone: 'understated' },
      },
    },
  );
  expect(competing.ok()).toBe(true);
  await page.getByLabel('Your caption', { exact: true }).fill('Refresh the workspace snapshot.');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await expect(page.getByText('Caption saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Per-image social composer' }).getByRole('alert'),
  ).toContainText('changed in another tab');
  await expect(page.getByLabel('Post text', { exact: true })).toHaveValue('Unsaved local copy.');
});

test('create a fresh experience and edit the social caption', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await page.getByRole('button', { name: 'New experience', exact: true }).click();
  await page.getByLabel('Experience name').fill('Kyoto at first light');
  await page.getByLabel('Destination', { exact: true }).selectOption('Kyoto');
  await expect(page.getByLabel('Your look')).toHaveValue('Sage overshirt · sand chinos');
  await expect(page.getByLabel('The feeling')).toHaveValue('Slow living');
  await page.screenshot({
    path: testInfo.outputPath('photo-preset-form.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Create experience' }).click();
  await expect(page.getByRole('heading', { name: 'Kyoto at first light' })).toBeVisible();
  await expect(page.locator('.scene-image-button img').first()).toHaveAttribute(
    'src',
    '/demo/photos/kyoto-garden.jpg',
  );
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
