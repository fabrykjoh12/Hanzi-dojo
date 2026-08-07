import { authedTest as test, expect, ACTIVE_VOCAB_COUNT } from '../fixtures/mockSupabase.js';

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
    // The guarantee is that the chart's shape is available as text, not that it
    // uses any particular role. It was role="img" while the bars were inert; now
    // each bar is a button (tapping one shows that day's count, which used to be
    // hover-only and so unreachable on a phone), and role="img" would hide those
    // buttons from assistive tech — an img's children are not exposed. The
    // summary moved to the enclosing group's accessible name.
    await expect(page.getByRole('group', { name: /Reviews over the last 30 days/i })).toBeVisible();
  });

  // The reset used to call the RPC without p_reset_streak, and that argument
  // defaulted to TRUE — so clearing one language also wiped daily_activity and
  // the account streak. These pin the scope.
  test('reset names the language it clears and leaves the others alone', async ({ page }) => {
    await page.goto('/profile');
    // Exact: the delete-account panel below also refers to "Reset a language"
    // (pointing people at the non-destructive option), so a substring match now
    // finds two nodes.
    await expect(page.getByText('Reset a language', { exact: true })).toBeVisible();
    await expect(page.getByText(/Clears flashcards, tests, story reads and unlocks for/i)).toBeVisible();
    await expect(page.getByText(/Your other\s+languages are untouched/i)).toBeVisible();
  });

  test('clearing study history is opt-in, and off by default', async ({ page }) => {
    await page.goto('/profile');
    const box = page.getByRole('checkbox', { name: /Also clear my study history and streak/i });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    // The account-wide reach is stated where the choice is made, not buried.
    await expect(page.getByText(/This one covers every language/i)).toBeVisible();
  });

  test('a plain reset does not ask the backend to clear account history', async ({ page }) => {
    const calls = [];
    await page.route('**/rest/v1/rpc/reset_language_progress', async (route) => {
      calls.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: 'null',
      });
    });

    await page.goto('/profile');
    await page.getByRole('button', { name: /^Reset$/ }).click();
    await page.getByRole('button', { name: /Confirm reset/i }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].p_language).toBe('chinese');
    expect(calls[0].p_reset_account_history).toBe(false);
  });

  test('ticking the box passes the account-history flag through', async ({ page }) => {
    const calls = [];
    await page.route('**/rest/v1/rpc/reset_language_progress', async (route) => {
      calls.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: 'null',
      });
    });

    await page.goto('/profile');
    await page.getByRole('checkbox', { name: /Also clear my study history and streak/i }).check();
    await page.getByRole('button', { name: /^Reset$/ }).click();
    await page.getByRole('button', { name: /Confirm reset/i }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].p_reset_account_history).toBe(true);
  });

  test('a second language track turns the target into a choice', async ({ page }) => {
    await page.route('**/rest/v1/language_tracks*', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') return route.fallback();
      // `.single()` (the app's own track load) must still get one object.
      const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
      const chinese = { id: 't1', user_id: 'u1', language: 'chinese', system: 'hsk', current_level: 2, is_active: true };
      const japanese = { id: 't2', user_id: 'u1', language: 'japanese', system: 'jlpt', current_level: 1, is_active: false };
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-1/*' },
        body: JSON.stringify(wantsObject ? chinese : [chinese, japanese]),
      });
    });

    await page.goto('/profile');
    const group = page.getByRole('radiogroup', { name: 'Language to reset' });
    await expect(group.getByRole('radio', { name: /Chinese/ })).toBeVisible();
    // An inactive track is still resettable — the old RPC required is_active.
    const jp = group.getByRole('radio', { name: /Japanese/ });
    await expect(jp).toBeVisible();
    await jp.click();
    await expect(page.getByText(/unlocks for\s*Japanese/i)).toBeVisible();
  });

  test('shows the known-word map with reading reach', async ({ page }) => {
    await page.goto('/profile');

    // The map heading and a readable-of-total summary render from the mock vocab.
    // 5 readable is a property of the mock DECK; the total is the size of the
    // mock curriculum, so it is read from the fixture — adding words for a new
    // story is a content change and must not fail this spec.
    const total = ACTIVE_VOCAB_COUNT;
    await expect(page.getByText('Known-word map')).toBeVisible();
    await expect(page.getByText(new RegExp('You can read 5 of ' + total + ' words so far', 'i'))).toBeVisible();
    // Its legend surfaces the buckets.
    await expect(page.getByText(/^Known \(5\)$/)).toBeVisible();
    // The level bar exposes its numbers to screen readers. This one is PER
    // LEVEL, so it keeps its literals: the mock deck's five known words are all
    // HSK 2, and that stays true however much vocabulary other levels gain.
    await expect(page.getByRole('img', { name: /HSK 2: 5 of 7 words readable/i })).toBeVisible();
  });
});
