import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The grammar guide lists many topics; the search box narrows them so a learner
// can jump straight to the pattern they want.
test.describe('Grammar guide', () => {
  test('search narrows the topic list', async ({ page }) => {
    await page.goto('/grammar');

    await expect(page.getByRole('heading', { name: /How Chinese works/i })).toBeVisible();
    // Both topics present before searching.
    await expect(page.getByText('Measure words')).toBeVisible();
    await expect(page.getByText('Comparisons with 比')).toBeVisible();

    // Searching narrows to the matching topic.
    await page.getByLabel('Search grammar topics').fill('measure');
    await expect(page.getByText('Measure words')).toBeVisible();
    await expect(page.getByText('Comparisons with 比')).toHaveCount(0);

    // A no-match query shows the empty state.
    await page.getByLabel('Search grammar topics').fill('zzzzz');
    await expect(page.getByText(/No topics match/i)).toBeVisible();
  });
});
