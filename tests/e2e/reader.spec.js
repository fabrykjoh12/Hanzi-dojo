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
});
