import { expect, test, type Page } from '@playwright/test';

type Visitor = { iosStandalone?: boolean };
type Prompted = { prompted?: number };

// The install sheet never offers itself to automated browsers, so act like a real visitor.
// iosStandalone adds Safari's navigator.standalone, which only iOS WebKit has.
async function asVisitor(page: Page, { iosStandalone }: Visitor = {}) {
  await page.addInitScript((standalone) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => false,
      configurable: true,
    });
    if (standalone !== null) {
      Object.defineProperty(Navigator.prototype, 'standalone', {
        get: () => standalone,
        configurable: true,
      });
    }
  }, iosStandalone ?? null);
}

// Stands in for Chrome deciding the app is installable.
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        const target = window as unknown as Prompted;
        target.prompted = (target.prompted ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });
    dispatchEvent(event);
  });
}

const installSheet = (page: Page) => page.getByRole('dialog', { name: 'Get the wishscene app' });

async function openMore(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Your workspace' });
}

test('ships a manifest, app icons, and an offline-only service worker', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(manifestUrl!)).json();
  expect(manifest).toMatchObject({
    name: 'wishscene',
    short_name: 'wishscene',
    start_url: '/',
    display: 'standalone',
  });
  expect(
    manifest.icons.map(
      (icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`,
    ),
  ).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  for (const src of [...manifest.icons.map((icon: { src: string }) => icon.src), appleIcon!]) {
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f5f0');

  const worker = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL,
  );
  expect(new URL(worker!).pathname).toBe('/sw.js');
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.context().setOffline(true);
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page).toHaveURL('/');
});

test('phones get an install sheet when the browser can install the app', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The sheet offers itself on phones only');
  await asVisitor(page);
  await page.goto('/');
  await offerInstall(page);
  const sheet = installSheet(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await sheet.getByRole('button', { name: 'Install app' }).click();
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as Prompted).prompted)).toBe(1);
  // The browser shows each prompt once, so More stops offering it.
  const more = await openMore(page);
  await expect(more.getByRole('button', { name: /Install app/ })).toHaveCount(0);
});

test('"Not now" stops the sheet offering itself, but More still installs', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The sheet offers itself on phones only');
  await asVisitor(page);
  await page.goto('/');
  await offerInstall(page);
  const sheet = installSheet(page);
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await expect(sheet).toBeHidden();

  await page.reload();
  await offerInstall(page);
  await page.waitForTimeout(2500);
  await expect(sheet).toHaveCount(0);
  const more = await openMore(page);
  await more.getByRole('button', { name: /Install app/ }).click();
  await expect(more).toBeHidden();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('iPhone Safari gets Add to Home Screen steps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'iPhone only');
  await asVisitor(page, { iosStandalone: false });
  await page.goto('/');
  const sheet = installSheet(page);
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByRole('listitem')).toHaveCount(3);
  await expect(sheet.getByText('Add to Home Screen')).toBeVisible();
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet).toBeHidden();
});

test('nothing is offered once opened from the home screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'iPhone only');
  await asVisitor(page, { iosStandalone: true });
  await page.goto('/');
  await page.waitForTimeout(5000);
  await expect(installSheet(page)).toHaveCount(0);
  const more = await openMore(page);
  await expect(more.getByRole('button', { name: /Install app/ })).toHaveCount(0);
});

test('desktop never opens the sheet on its own', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop browsers have their own install button');
  await asVisitor(page);
  await page.goto('/');
  await offerInstall(page);
  await page.waitForTimeout(2500);
  await expect(installSheet(page)).toHaveCount(0);
});
