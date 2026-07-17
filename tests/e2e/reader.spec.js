import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { ReaderPage } from '../pages/ReaderPage.js';

test.describe('Story reader', () => {
  test('opens a story from the library', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    // The story title appears in the reader.
    await expect(page.getByText('公园里的下午').first()).toBeVisible();
  });

  test('paced reveal: starts on one tap and advances beat by beat', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();

    // Launch screen.
    const start = page.getByRole('button', { name: /Start reading/i });
    await expect(start).toBeVisible();
    await start.click();

    // First beat + progress counter.
    await expect(page.getByText('1 / 3')).toBeVisible();
    await expect(page.getByText('今天', { exact: false }).first()).toBeVisible();

    // Advance with the Next control.
    await page.getByRole('button', { name: /Next line/i }).click();
    await expect(page.getByText('2 / 3')).toBeVisible();
  });

  test('paced reveal: play control toggles', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByRole('button', { name: /^Pause$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Pause$/i }).click();
    await expect(page.getByRole('button', { name: /^Play$/i })).toBeVisible();
  });

  test('paced reveal: tap a word to look it up, then finish', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    // Tap a known vocab word on the first beat.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();           // meaning in the sheet
    await page.getByRole('button', { name: 'Close' }).click();     // dismiss sheet

    // Advance to the end → finish overlay.
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await expect(page.getByText('You read it')).toBeVisible();
  });

  test('chat reveal: reveals bubbles on tap, looks up a word, and finishes', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('朋友的问题');

    await page.getByRole('button', { name: /Start reading/i }).click();
    await expect(page.getByText('1/3')).toBeVisible();
    await expect(page.getByText('你今天好吗', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Tap anywhere to continue/i)).toBeVisible();

    // Tap a vocab word in the first bubble → shared lookup sheet shows its
    // meaning. The word span stops propagation, so this does NOT advance.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('1/3')).toBeVisible();             // still on the first bubble

    // Tap the thread (the speaker label is plain text, not a vocab span, so the
    // click bubbles to the thread's reveal-next-bubble handler) to advance.
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('2/3')).toBeVisible();
    await expect(page.getByText('我很好', { exact: false }).first()).toBeVisible();

    // Advance to the last bubble, then one more tap → shared finish overlay.
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('3/3')).toBeVisible();
    await expect(page.getByText('我们去公园', { exact: false }).first()).toBeVisible();
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('You read it')).toBeVisible();
  });
});
