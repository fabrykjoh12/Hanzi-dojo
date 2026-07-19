import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Month-in-review recap on the Profile screen. We override daily_activity for
// the current month so the enriched headline + best-day line are deterministic.
test.describe('Profile — month in review', () => {
  test('shows the calm month recap with a best day', async ({ page }) => {
    const now = new Date();
    const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const rows = [
      { activity_date: ym + '-01', studied_cards: 4 },
      { activity_date: ym + '-02', studied_cards: 12 },
    ];
    await page.route('**/rest/v1/daily_activity*', route =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-1/*' },
        body: JSON.stringify(rows),
      }));

    await page.goto('/profile');

    // The panel headline reflects days shown up out of days elapsed.
    await expect(page.getByText(/shown up 2 of \d+ days so far/i)).toBeVisible();
    // The best day is highlighted from the higher-count row.
    await expect(page.getByText(/Best day so far — 12 reviews/i)).toBeVisible();
    // The recap stays shareable.
    await expect(page.getByRole('button', { name: /Share/i })).toBeVisible();
  });
});
