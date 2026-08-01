import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// "A fresh story every day": the Stories library surfaces a calm daily pick from
// the stories the learner can already read, and it opens the reader.
test.describe('Story of the day', () => {
  test('shows a daily pick that opens into the reader', async ({ page }) => {
    await page.goto('/stories');

    const daily = page.getByRole('button', { name: /Today.s story/i });
    await expect(daily).toBeVisible();

    await daily.click();
    // Navigates into the reader: we've left the browse screen (the tier tabs are
    // gone). Format-agnostic, since the daily pick may be any presentation.
    await expect(page.getByRole('tab', { name: /First Steps/ })).toHaveCount(0);
    await expect(daily).toHaveCount(0);
  });

  test('the shelf surfaces what comes next: the locked next-level teaser', async ({ page }) => {
    await page.goto('/stories');
    // The flat shelf's "road ahead": the next level's stories are visible but
    // locked, with the honest gate (the level test) stated inline.
    await expect(page.getByText(/Unlocks when you pass the HSK 2 test/)).toBeVisible();
  });
});
