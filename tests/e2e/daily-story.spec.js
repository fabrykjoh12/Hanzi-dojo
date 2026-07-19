import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// "A fresh story every day": the Stories category screen surfaces a calm daily
// pick from the stories the learner can already read, and it opens the reader.
test.describe('Story of the day', () => {
  test('shows a daily pick that opens into the reader', async ({ page }) => {
    await page.goto('/stories');

    const daily = page.getByRole('button', { name: /Today.s story/i });
    await expect(daily).toBeVisible();

    await daily.click();
    // Navigates into the reader: we've left the category grid (format-agnostic,
    // since the daily pick may be any presentation).
    await expect(page.getByRole('button', { name: /First Steps/ })).toHaveCount(0);
    await expect(daily).toHaveCount(0);
  });
});
