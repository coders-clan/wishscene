import { expect, test, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

// Phones switch screens from the bottom navigation and show one part of Posts at a time.
async function openScreen(page: Page, testInfo: TestInfo, tab: 'Storyboard' | 'Social pack') {
  if (testInfo.project.name !== 'mobile') return page.getByRole('tab', { name: tab }).click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: tab === 'Storyboard' ? 'Studio' : 'Posts', exact: true })
    .click();
}
async function showPostView(
  page: Page,
  testInfo: TestInfo,
  view: 'Write post' | 'Preview' | 'Carousel' | 'Pack caption',
) {
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: view, exact: true }).click();
}
// Reads the pixel size from a JPEG's start-of-frame header.
function jpegSize(bytes: Buffer) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error('No JPEG frame header found.');
}
async function checkRenderedImages(zip: JSZip) {
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  for (const asset of manifest.assets) {
    const bytes = await zip.file(asset.output.filename)!.async('nodebuffer');
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(jpegSize(bytes)).toEqual({ width: asset.output.width, height: asset.output.height });
  }
  return manifest;
}

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
  // 9:16 trims the sides of a 3:4 photo; Home moves the crop to the left edge.
  await showPostView(page, testInfo, 'Preview');
  await page.getByRole('button', { name: 'Adjust crop', exact: true }).click();
  const crop = page.getByRole('dialog', { name: 'Adjust crop' });
  await crop.getByLabel('Horizontal position').press('Home');
  await expect(crop.getByLabel('Horizontal position')).toHaveValue('0');
  await crop.getByRole('button', { name: 'Done' }).click();
  await showPostView(page, testInfo, 'Write post');
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
  await showPostView(page, testInfo, 'Carousel');
  await page.getByLabel('Cover title').fill('Tokyo after dark');
  await page.getByRole('button', { name: 'Move A table for daydreams earlier' }).click();
  // The moved image is now first, so focus stays with it on its remaining arrow.
  await expect(
    page.getByRole('button', { name: 'Move A table for daydreams later' }),
  ).toBeFocused();
  await expect(
    page.getByText('A table for daydreams moved to position 1 of 4. It is now the cover.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save carousel' }).click();
  await expect(page.getByText('Carousel saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export demo pack' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('wishscene-tokyo-demo.zip');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const files = Object.values(zip.files).filter((file) => !file.dir);
  const photos = files.filter((file) => file.name.startsWith('originals/'));
  expect(photos).toHaveLength(4);
  expect(files.filter((file) => file.name.startsWith('images/'))).toHaveLength(4);
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
  const manifest = await checkRenderedImages(zip);
  expect(manifest.coverTitle).toBe('Tokyo after dark');
  expect(manifest.assets.map((asset: { title: string }) => asset.title)).toEqual([
    'A table for daydreams',
    'Neon kind of night',
    'Above the ordinary',
    'The long way home',
  ]);
  expect(manifest.assets[0]).toMatchObject({ cover: true, position: 1 });
  expect(manifest.assets[0].social.caption).toContain('creative photography');
  expect(manifest.assets[0].output).toMatchObject({ width: 1080, height: 1080 });
  expect(manifest.assets[1].social).toMatchObject({
    platform: 'instagram-story',
    focus: { x: 0, zoom: 1 },
  });
  expect(manifest.assets[1].output).toMatchObject({
    filename: 'images/02-tokyo-instagram-story.jpg',
    width: 810,
    height: 1440,
    crop: { x: 0, y: 0 },
  });
  for (const photo of photos) {
    const bytes = await photo.async('nodebuffer');
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(bytes.subarray(-2).toString('hex')).toBe('ffd9');
  }
  // Story settings live on the phone's Studio screen.
  if (testInfo.project.name === 'mobile') await openScreen(page, testInfo, 'Storyboard');
  await page.getByRole('button', { name: 'Story settings' }).click();
  await page.getByLabel('Your look').fill('Blue linen suit');
  await expect(page.getByText('Custom developer settings', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save story' }).click();
  await expect(page.getByText('v2', { exact: true })).toBeVisible();
  await openScreen(page, testInfo, 'Storyboard');
  await expect(page.getByText('Story updated', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Export demo pack' })).toBeDisabled();
  await page.getByRole('button', { name: 'Story settings' }).click();
  await page.getByRole('button', { name: 'Use Tokyo photo preset' }).click();
  await expect(page.getByLabel('Your look')).toHaveValue('Ivory jacket · charcoal trousers');
  await page.getByRole('button', { name: 'Save story' }).click();
  await expect(page.getByText('v3', { exact: true })).toBeVisible();
});

test('carousel saves stay current while a workspace refresh is in flight', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await openScreen(page, testInfo, 'Social pack');
  const carousel = page.locator('.pack-editor');
  // The cover image's preview shows the cover title before it is saved.
  await showPostView(page, testInfo, 'Carousel');
  await page.getByLabel('Cover title').fill('Draft cover');
  await showPostView(page, testInfo, 'Preview');
  await expect(page.locator('.preview-cover-title')).toHaveText('Draft cover');

  // Hold workspace reloads so a post save leaves its refresh in flight; the studio skips
  // overlapping refreshes, so the carousel saves below get no reload of their own.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/workspace', async (route) => {
    await held;
    await route.continue();
  });
  await showPostView(page, testInfo, 'Write post');
  const reload = page.waitForRequest(
    (request) => request.method() === 'GET' && request.url().endsWith('/api/v1/workspace'),
  );
  await page.getByLabel('Post text', { exact: true }).fill('Posted while the studio reloads.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await reload;
  await showPostView(page, testInfo, 'Carousel');
  await page.getByLabel('Cover title').fill('First save');
  await page.getByRole('button', { name: 'Save carousel' }).click();
  await expect(carousel.getByText('Carousel saved.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cover title')).toHaveValue('First save');
  // The second save must start from the first save's revision, not the stale workspace's.
  await page.getByLabel('Cover title').fill('Second save');
  await expect(carousel.getByText('Unsaved carousel changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save carousel' }).click();
  await expect(carousel.getByText('Carousel saved.', { exact: true })).toBeVisible();
  await expect(carousel.getByRole('alert')).toHaveCount(0);
  release();
  await showPostView(page, testInfo, 'Write post');
  await expect(page.getByText(/saved for this image\.$/)).toBeVisible();
  await expect(page.getByLabel('Cover title')).toHaveValue('Second save');

  await page.reload();
  await openScreen(page, testInfo, 'Social pack');
  await showPostView(page, testInfo, 'Carousel');
  await expect(page.getByLabel('Cover title')).toHaveValue('Second save');
});

test('exports sharp post-ready crops for illustrated fixtures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Export rendering does not depend on the viewport');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  const title = 'Illustrated export check';
  // Arrange through the same-origin API: custom settings select the SVG illustrations.
  await page.evaluate(async (title) => {
    const send = async (path: string, method: string, body: unknown) => {
      const response = await fetch(`/api/v1/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
      return response.json();
    };
    const created = await send('experiences', 'POST', {
      title,
      destination: 'Kyoto',
      outfit: 'Custom test outfit',
      mood: 'Adventure',
    });
    for (const scene of created.scenes)
      await send(`experiences/${created.id}/scenes/${scene.id}/generations`, 'POST', {
        requestKey: `${scene.id}-illustrated`,
        scenario: 'success',
      });
    await new Promise((resolve) => setTimeout(resolve, 2700));
    const workspace = await (await fetch('/api/v1/workspace')).json();
    const ready = workspace.experiences.find((item: { id: string }) => item.id === created.id);
    for (const scene of ready.scenes)
      await send(`experiences/${created.id}/scenes/${scene.id}/approval`, 'POST', {
        assetId: scene.assets[0].id,
        expectedVersion: 1,
      });
  }, title);
  await page.reload();
  // Experience selection is local UI state: open the library from the current title.
  await page.getByRole('button', { name: /Tokyo, after hours/ }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export demo pack' }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloadEvent).path())!));
  const manifest = await checkRenderedImages(zip);
  expect(manifest.assets[0].media).toBe('illustration');
  expect(manifest.assets[0].filename).toMatch(/^originals\/01-.+\.svg$/);
  expect(manifest.assets[0].output).toMatchObject({ width: 1080, height: 1350 });
  // The illustration fills the frame edge to edge: no empty (black) bars from SVG sizing.
  const second = await zip.file(manifest.assets[1].output.filename)!.async('base64');
  const edges = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [4, canvas.width - 5].map((x) => {
      const [r, g, b] = context.getImageData(x, Math.round(canvas.height / 3), 1, 1).data;
      return r + g + b;
    });
  }, `data:image/jpeg;base64,${second}`);
  for (const brightness of edges) expect(brightness).toBeGreaterThan(30);
});

test('preview platforms, retain per-image drafts, and reload saved text', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create post for Neon kind of night' }).click();
  await page.getByLabel('Platform & format').selectOption('instagram-story');
  await page.getByLabel('Post text', { exact: true }).fill('An imagined evening in Tokyo.');
  await page.getByLabel('Text on image').fill('לילה של דמיון');
  await showPostView(page, testInfo, 'Preview');
  await expect(page.getByRole('article', { name: 'Instagram Story preview' })).toContainText(
    'לילה של דמיון',
  );
  await showPostView(page, testInfo, 'Write post');
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
  await openScreen(page, testInfo, 'Social pack');
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
  await showPostView(page, testInfo, 'Preview');
  await expect(page.getByRole('article', { name: 'LinkedIn post preview' })).toContainText(
    'A separate visual concept for image two.',
  );
  await page.screenshot({
    path: testInfo.outputPath('social-feed-composer.png'),
    fullPage: true,
    scale: 'css',
  });
  await showPostView(page, testInfo, 'Write post');
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await openScreen(page, testInfo, 'Storyboard');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // A refreshed snapshot must not turn an old unsaved draft into a valid overwrite.
  await openScreen(page, testInfo, 'Social pack');
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
  await showPostView(page, testInfo, 'Pack caption');
  await page.getByLabel('Your caption', { exact: true }).fill('Refresh the workspace snapshot.');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await expect(page.getByText('Caption saved.', { exact: true })).toBeVisible();
  await showPostView(page, testInfo, 'Write post');
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
  await openScreen(page, testInfo, 'Social pack');
  await showPostView(page, testInfo, 'Pack caption');
  await page.getByLabel('Your caption').fill('A fictional daydream. #wishscene');
  await page.getByRole('button', { name: 'Save caption' }).click();
  await page.reload();
  // Experience selection is local UI state; select the new workspace after reload.
  await page.getByRole('button', { name: /Tokyo, after hours/ }).click();
  await page.getByRole('button', { name: /Kyoto at first light/ }).click();
  await openScreen(page, testInfo, 'Social pack');
  await showPostView(page, testInfo, 'Pack caption');
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

// Phones reach sign-in from the More sheet; the topbar slot belongs to the feedback button.
async function openAccount(page: Page, testInfo: TestInfo, name: string | RegExp) {
  if (testInfo.project.name !== 'mobile')
    return page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Your workspace' })
    .getByRole('button', { name: typeof name === 'string' ? 'Sign in' : /Account/ })
    .click();
}

test('sign in with an emulated magic link, then sign out', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await openAccount(page, testInfo, 'Sign in');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Sign in with a magic link.' })).toBeVisible();
  await expect(dialog.getByText(/Demo: no email is sent/)).toBeVisible();
  await dialog.getByLabel('Email address').fill('alex@example.com');
  await dialog.getByRole('button', { name: 'Email me a sign-in link' }).click();
  const inbox = dialog.getByRole('region', { name: 'Demo inbox' });
  await expect(inbox.getByText('alex@example.com')).toBeVisible();
  await inbox.getByRole('button', { name: 'Sign in to wishscene' }).click();
  await expect(dialog.getByRole('heading', { name: 'You’re signed in.' })).toBeVisible();
  await expect(dialog.getByText('alex@example.com')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await openAccount(page, testInfo, /Signed in as alex@example\.com/);
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(dialog.getByRole('heading', { name: 'Sign in with a magic link.' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Link used' })).toBeDisabled();
});

test('desktop storyboard fits the viewport without page scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop layout; phones have their own frame');
  const pageScrolls = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    );
  const titles = [
    'Neon kind of night',
    'A table for daydreams',
    'Above the ordinary',
    'The long way home',
  ];
  const exportButton = page.getByRole('button', { name: 'Export demo pack' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  // The reported screen, laptop browser heights (under toolbars), and tall monitors.
  for (const [width, height] of [
    [1890, 889],
    [1920, 1080],
    [1600, 900],
    [1536, 730],
    [1440, 790],
    [1366, 657],
    [1280, 720],
    [2560, 1300],
  ]) {
    await page.setViewportSize({ width, height });
    const size = `${width}x${height}`;
    expect(await pageScrolls(), size).toBe(false);
    for (const target of [
      page.getByRole('button', { name: 'New experience', exact: true }),
      page.getByRole('button', { name: 'Story settings' }),
      page.getByRole('button', { name: 'Generate remaining' }),
      ...titles.flatMap((title) => [
        page.getByRole('button', { name: `Review ${title}` }),
        page.getByRole('button', { name: `Create post for ${title}` }),
      ]),
      exportButton,
    ])
      await expect(target, size).toBeInViewport({ ratio: 1 });
    // The fixed Feedback button sits beside the export dock, never on its button.
    const feedback = (await page.locator('.feedback-launch-button').boundingBox())!;
    const exporter = (await exportButton.boundingBox())!;
    expect(feedback.x, size).toBeGreaterThanOrEqual(exporter.x + exporter.width);
    // Images give up height on short screens but never grow past a 3:4 portrait.
    const image = (await page.locator('.scene-image-button').first().boundingBox())!;
    expect(image.height, size).toBeGreaterThanOrEqual(130);
    expect(image.height / image.width, size).toBeLessThanOrEqual(4 / 3 + 0.02);
    // The hero keeps its row only when there is height to spare.
    const hero = (await page.locator('.greeting').boundingBox())!;
    expect(hero.height > 2, size).toBe(height >= 960);
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your imagination, in frame.');
  await page.screenshot({ path: testInfo.outputPath('desktop-fit.png') });
});
