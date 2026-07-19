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

  test('shows reading achievements', async ({ page }) => {
    await page.goto('/profile');
    // The new Reading group renders its badges (locked in the mock, but present).
    await expect(page.getByText('First Story')).toBeVisible();
    await expect(page.getByText('Bookworm')).toBeVisible();
  });

  test('exposes a screen-reader summary for the review-accuracy chart', async ({ page }) => {
    const now = new Date();
    const iso = (daysAgo) => {
      const d = new Date(now); d.setDate(d.getDate() - daysAgo); return d.toISOString();
    };
    // Provide a few review logs so the 30-day chart renders (mock returns [] by default).
    await page.route('**/rest/v1/review_logs*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-2/*' },
        body: JSON.stringify([
          { grade: 3, reviewed_at: iso(0), vocabulary: { language: 'chinese', system: 'hsk' } },
          { grade: 2, reviewed_at: iso(1), vocabulary: { language: 'chinese', system: 'hsk' } },
          { grade: 0, reviewed_at: iso(1), vocabulary: { language: 'chinese', system: 'hsk' } },
        ]),
      });
    });

    await page.goto('/profile');
    await expect(page.getByRole('img', { name: /Reviews over the last 30 days/i })).toBeVisible();
  });

  test('shows the known-word map with reading reach', async ({ page }) => {
    await page.goto('/profile');

    // The map heading and a readable-of-total summary render from the mock vocab
    // (7 active words: 5 known, 2 learning → 5 readable).
    await expect(page.getByText('Known-word map')).toBeVisible();
    await expect(page.getByText(/You can read 5 of 7 words so far/i)).toBeVisible();
    // Its legend surfaces the buckets.
    await expect(page.getByText(/^Known \(5\)$/)).toBeVisible();
    // The level bar exposes its numbers to screen readers.
    await expect(page.getByRole('img', { name: /5 of 7 words readable/i })).toBeVisible();
  });
});
