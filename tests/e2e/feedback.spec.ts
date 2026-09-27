import { expect, test } from '@playwright/test';

test('capture feedback, allow teammate replies and votes, and restrict edits to the creator', async ({
  page,
  browser,
}, testInfo) => {
  const title = `Element feedback ${testInfo.project.name} ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Select an element', exact: true }).click();
  await page.getByRole('heading', { name: 'Tokyo, after hours' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave your mark' });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  const canvas = dialog.getByLabel('Screenshot annotation canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width)).toBeGreaterThan(1);
  await dialog.getByRole('button', { name: 'Text', exact: true }).click();
  await dialog.getByLabel('Annotation text').fill('Please review');
  await canvas.click({ position: { x: 10, y: 20 } });
  await expect(dialog.getByText('1/50 marks', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(dialog.getByText('0/50 marks', { exact: false })).toBeVisible();
  await canvas.click({ position: { x: 10, y: 20 } });
  await dialog.getByRole('button', { name: 'Hide area', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8, { steps: 3 });
  await page.mouse.up();
  await expect(dialog.getByText('2/50 marks', { exact: false })).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) =>
        Array.from(
          el
            .getContext('2d')!
            .getImageData(Math.floor(el.width * 0.4), Math.floor(el.height * 0.5), 1, 1).data,
        ).slice(0, 3),
      ),
    )
    .toEqual([17, 17, 26]);
  await dialog.getByLabel('Your name').fill('Dave');
  await dialog.getByLabel('Short title').fill(title);
  await dialog
    .getByLabel('Comment', { exact: true })
    .fill('הכותרת צריכה יותר מקום. Keep the screenshot for context.');
  await dialog.getByLabel('Priority', { exact: true }).selectOption('high');
  await page.screenshot({
    path: testInfo.outputPath('feedback-annotation.png'),
    fullPage: true,
    scale: 'css',
  });
  await dialog.getByRole('button', { name: 'Send to shared board' }).click();
  await expect(page.getByText('Feedback shared with the team.', { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'Open report' });
  const href = await link.getAttribute('href');
  expect(href).toContain('/feedback?item=');
  const saved = await (await page.request.get('/api/feedback/' + href!.split('item=')[1])).json();
  expect(saved.target.excerpt).toBe('');
  expect(saved.target.label).toBe('Redacted selection');
  expect(saved.hasScreenshot).toBe(true);
  const other = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport:
      testInfo.project.name === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
  });
  const teammate = await other.newPage();
  await teammate.goto(href!);
  const detail = teammate.getByRole('dialog', { name: title });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('הכותרת צריכה יותר מקום.', { exact: false })).toBeVisible();
  await expect(detail.getByAltText(`Annotated screenshot: ${title}`)).toBeVisible();
  await detail.getByLabel('Your name').fill('Teammate');
  await detail.getByLabel('Reply', { exact: true }).fill('I can take this issue.');
  await detail.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(detail.getByText('I can take this issue.', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'I noticed this too', exact: true }).click();
  await expect(detail.getByRole('button', { name: /You also noticed this/ })).toBeVisible();
  await expect(detail.getByLabel('Status', { exact: true })).toHaveCount(0);
  await expect(detail.getByLabel('Assignee', { exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
  await teammate.screenshot({
    path: testInfo.outputPath('feedback-shared-detail.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.goto(href!);
  const original = page.getByRole('dialog', { name: title });
  await expect(original.getByText('I can take this issue.', { exact: true })).toBeVisible();
  await original.getByLabel('Status', { exact: true }).selectOption('in-progress');
  await original.getByLabel('Assignee', { exact: true }).fill('Teammate');
  await original.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(original.getByText('Your report was updated.', { exact: true })).toBeVisible();
  await expect(original.getByLabel('Assignee', { exact: true })).toHaveValue('Teammate');
  await original.getByRole('button', { name: 'Close feedback dialog' }).click();
  await page.getByLabel('Search feedback').fill(title);
  await expect(page.locator('.feedback-list-item')).toHaveCount(1);
  await expect(page.locator('.feedback-list-item')).toContainText('in progress');
  await page.screenshot({
    path: testInfo.outputPath('feedback-board.png'),
    fullPage: true,
    scale: 'css',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const reportId = href!.split('item=')[1];
  await page.request.post('/api/v1/mock/reset');
  await expect
    .poll(async () => (await page.request.get(`/api/feedback/${reportId}`)).status())
    .toBe(200);
  await other.close();
});

test('capture a section and submit a general note without a screenshot', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tokyo, after hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Capture a section', exact: true }).click();
  await page.mouse.move(30, 180);
  await page.mouse.down();
  await page.mouse.move(280, 350, { steps: 6 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Leave your mark' });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByLabel('Screenshot annotation canvas')).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove screenshot' }).click();
  await expect(dialog.getByText('No screenshot attached.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close feedback dialog' }).click();
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Write a general note' }).click();
  await dialog.getByLabel('Your name').fill('Tester');
  await dialog.getByLabel('Short title').fill(`General note ${testInfo.project.name}`);
  await dialog.getByLabel('Comment', { exact: true }).fill('A shared idea without any screenshot.');
  await dialog.getByLabel('Type', { exact: true }).selectOption('idea');
  await dialog.getByRole('button', { name: 'Send to shared board' }).click();
  await expect(page.getByText('Feedback shared with the team.', { exact: true })).toBeVisible();
});
