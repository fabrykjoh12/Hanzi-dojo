import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Continue card's "Start here" state uses the daily-story picker: one calm
// recommendation from what the learner can already read (never a practice
// scenario), opening into the reader or its series page.
test.describe('Story of the day', () => {
  test('shows a daily pick that opens out of the browse screen', async ({ page }) => {
    await page.goto('/stories');

    const daily = page.locator('button[data-continue-card="start-here"]');
    await expect(daily).toBeVisible();

    await daily.click();
    // Navigates out of browse (into the reader, or a series page for a
    // multi-chapter pick) — the card itself is gone either way.
    await expect(daily).toHaveCount(0);
  });

  test('the shelf surfaces what comes next: the locked next-level teaser', async ({ page }) => {
    await page.goto('/stories');
    // The flat shelf's "road ahead": the next level's stories are visible but
    // locked, with the honest gate (the level test) stated inline.
    await expect(page.getByText(/Unlocks when you pass the HSK 2 test/)).toBeVisible();
  });
});
