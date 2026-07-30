import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// "A fresh story every day": the Stories library surfaces a calm daily pick from
// the stories the learner can already read, and it opens the reader.
test.describe('Story of the day', () => {
  test('shows a daily pick that opens into the reader', async ({ page }) => {
    await page.goto('/stories');

    const daily = page.getByRole('button', { name: /Today.s story/i });
    await expect(daily).toBeVisible();

    await daily.click();
    // Navigates into the reader: we've left the browse screen (the level rail is
    // gone). Format-agnostic, since the daily pick may be any presentation.
    await expect(page.getByRole('tab', { name: /HSK 2/ })).toHaveCount(0);
    await expect(daily).toHaveCount(0);
  });

  test('the hero says where you are on the ladder', async ({ page }) => {
    await page.goto('/stories');
    // Level and progress ride in the hero's eyebrow, so the shelf below it can
    // be nothing but stories.
    await expect(page.getByText(/hsk · HSK 2 · \d+% learned/i)).toBeVisible();
  });
});
