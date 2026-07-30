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

  test('the tier tabs surface the gap to the next unlock', async ({ page }) => {
    await page.goto('/stories');
    // The reading-ladder rung copy folded into the tab bar: a locked tier's tab
    // states how many more words open it (fixture: Growing is locked at HSK 2).
    await expect(page.getByText(/more word/i).first()).toBeVisible();
    await expect(page.getByText(/% of this level unlocked/i)).toBeVisible();
  });
});
