import { authedTest as test, expect, ACTIVE_VOCAB_COUNT, withWeakWords } from '../fixtures/mockSupabase.js';

// P10-B4: the controls are rows now — the daily goal, reset, remove and delete
// each open from a labelled row instead of occupying a panel apiece. The
// behaviour underneath is unchanged, so these specs open the row and then make
// exactly the assertions they always made.
const openControl = async (page, name) => {
  const row = page.getByRole('button', { name, expanded: false });
  await row.click();
  await expect(page.getByRole('button', { name, expanded: true })).toBeVisible();
};

const dayKey = (daysAgo) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
};

test.describe('Profile — recent progress', () => {
  // P10-B3: recent activity is ONE sentence on the progress panel. It replaced a
  // month-in-review panel (headline, best day, share button) and a 17x7 grid of
  // 115 tappable cells — three representations of the same fact. This spec pins
  // the sentence AND the fact that the others cannot come back.
  test('says the rhythm in one descriptive line, with no streak language', async ({ page }) => {
    await page.route('**/rest/v1/daily_activity*', route =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-2/*' },
        body: JSON.stringify([
          { activity_date: dayKey(0), studied_cards: 4 },
          { activity_date: dayKey(3), studied_cards: 12 },
          { activity_date: dayKey(40), studied_cards: 30 },   // outside the window
        ]),
      }));

    await page.goto('/profile');

    await expect(page.getByText('Studied 2 of the last 30 days')).toBeVisible();
    // Descriptive, never coercive (CLAUDE.md §1 — streaks were removed).
    await expect(page.getByText(/streak|consecutive|in a row|days in a row/i)).toHaveCount(0);
    // And the two panels it replaced are gone, share button included.
    await expect(page.getByText(/shown up \d+ of \d+ days so far/i)).toHaveCount(0);
    await expect(page.getByText(/Best day so far/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Share/i })).toHaveCount(0);
  });

  // P10-B1: the achievement wall is gone, by owner decision — the app shows real
  // learning progress, not badges. This spec used to assert the Reading group's
  // badges rendered; it now asserts they cannot come back, which is the claim
  // worth keeping.
  test('shows no achievement badges — the mechanic is gone', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(900);
    for (const gone of ['First Story', 'Bookworm', 'Well Read', 'First Words',
      'Building Up', 'Century', 'Sticking', 'Deep Roots', 'Locked In',
      'Habit Forming', 'Part of Life', 'Achievements', 'unlocked']) {
      await expect(page.getByText(gone, { exact: false }), gone).toHaveCount(0);
    }
  });

  // Retention used to be a whole panel: a big percentage tile plus 30 bar
  // buttons, each a 6px-wide tap target. It is now the tail of the rhythm line,
  // and it is omitted entirely rather than showing a misleading 0%.
  test('states retention as one figure, with no bar chart behind it', async ({ page }) => {
    await page.route('**/rest/v1/review_logs*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-2/*' },
        body: JSON.stringify([
          { grade: 3, vocabulary: { language: 'chinese', system: 'hsk' } },
          { grade: 2, vocabulary: { language: 'chinese', system: 'hsk' } },
          { grade: 0, vocabulary: { language: 'chinese', system: 'hsk' } },
        ]),
      });
    });

    await page.goto('/profile');

    await expect(page.getByText(/67% recalled/)).toBeVisible();   // 2 of 3 recalled
    await expect(page.getByText('Review accuracy')).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Reviews over the last 30 days/i })).toHaveCount(0);
    // No day-sized tap targets survive anywhere on the screen.
    await expect(page.getByRole('button', { name: /— \d+ reviews?$/ })).toHaveCount(0);
  });

  test('omits retention rather than reporting 0% with no data', async ({ page }) => {
    await page.goto('/profile');   // the mock returns no review_logs
    await expect(page.getByText(/recalled/i)).toHaveCount(0);
  });

  // The defect this panel was built to fix: "Words mastered" appeared twice, on
  // the current level's number and on the lifetime total, under identical words.
  // Every figure is now scoped by name and stated once.
  test('gives mastery a level-scoped label, and states it once', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByText('HSK 2 mastered')).toHaveCount(1);
    await expect(page.getByText('Words mastered', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/of \d+ words learned$/)).toHaveCount(1);
    // The bar is decoration; the numbers are readable without it.
    await expect(page.getByRole('img', { name: /\d+ of \d+ words learned, \d+ mastered at HSK 2/ }))
      .toBeVisible();
  });

  // The reset used to call the RPC without p_reset_streak, and that argument
  // defaulted to TRUE — so clearing one language also wiped daily_activity and
  // the account streak. These pin the scope.
  test('reset names the language it clears and leaves the others alone', async ({ page }) => {
    await page.goto('/profile');
    // The label names the real consequence — "Reset a language" was the wording
    // of a product that offers several. The delete-account control quotes this
    // same label when it points at the non-destructive option, so a substring
    // match finds two nodes and this one is exact.
    await expect(page.getByText('Reset Chinese progress', { exact: true })).toBeVisible();
    await expect(page.getByText(/reset a language/i)).toHaveCount(0);
    await openControl(page, /Reset Chinese progress/);
    await expect(page.getByText(/Clears your flashcards, level tests, story reads and story unlocks/i)).toBeVisible();
    // One track, so the copy says where you restart instead of which of your
    // languages survives.
    await expect(page.getByText(/starts you again at\s+HSK 1/i)).toBeVisible();
    await expect(page.getByText(/languages/i)).toHaveCount(0);
  });

  test('clearing study history is opt-in, and off by default', async ({ page }) => {
    await page.goto('/profile');
    await openControl(page, /Reset Chinese progress/);
    const box = page.getByRole('checkbox', { name: /Also clear my study history/i });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    // It says what the record is, where the choice is made, without inventing a
    // multi-language caveat for an account that has one track.
    await expect(page.getByText(/the record of which days you studied/i)).toBeVisible();
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
    await openControl(page, /Reset Chinese progress/);
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
    await openControl(page, /Reset Chinese progress/);
    await page.getByRole('checkbox', { name: /Also clear my study history/i }).check();
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
    // Two tracks, so the row cannot name one language: it goes generic and the
    // value beside it says which track is selected. Only staff accounts see this.
    await openControl(page, /^Reset progress/);
    const group = page.getByRole('radiogroup', { name: 'Language to reset' });
    await expect(group.getByRole('radio', { name: /Chinese/ })).toBeVisible();
    // An inactive track is still resettable — the old RPC required is_active.
    const jp = group.getByRole('radio', { name: /Japanese/ });
    await expect(jp).toBeVisible();
    await jp.click();
    await expect(page.getByText(/unlocks for\s*Japanese/i)).toBeVisible();
    // And there the multi-track wording is correct rather than generic.
    await expect(page.getByText(/Your other\s+tracks are untouched/i)).toBeVisible();
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

  // The rows themselves: collapsed by default, one open at a time, and an armed
  // destructive action can never be left hidden behind a closed row.
  test('every control is a collapsed row until it is asked for', async ({ page }) => {
    await page.goto('/profile');
    for (const name of [/Daily new cards/, /Reset Chinese progress/, /Delete account/]) {
      await expect(page.getByRole('button', { name, expanded: false })).toBeVisible();
    }
    // Sign out acts rather than opens, so it is not a disclosure at all.
    const signOut = page.getByRole('button', { name: /Sign out/ });
    await expect(signOut).toBeVisible();
    expect(await signOut.getAttribute('aria-expanded')).toBeNull();
    // The goal reads its current value on the row, without opening anything.
    await expect(page.getByText('10 a day')).toBeVisible();
  });

  test('opening one control closes the last', async ({ page }) => {
    await page.goto('/profile');
    await openControl(page, /Reset Chinese progress/);
    await openControl(page, /Delete account/);
    await expect(page.getByRole('button', { name: /Reset Chinese progress/, expanded: false })).toBeVisible();
    await expect(page.getByText(/Clears flashcards, tests, story reads/i)).toHaveCount(0);
  });

  test('closing a half-confirmed reset disarms it', async ({ page }) => {
    await page.goto('/profile');
    await openControl(page, /Reset Chinese progress/);
    await page.getByRole('button', { name: /^Reset$/ }).click();
    await expect(page.getByRole('button', { name: /Confirm reset/i })).toBeVisible();

    // Collapse the row, reopen it: back to the first step, not one tap from a wipe.
    await page.getByRole('button', { name: /Reset Chinese progress/, expanded: true }).click();
    await openControl(page, /Reset Chinese progress/);
    await expect(page.getByRole('button', { name: /Confirm reset/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Reset$/ })).toBeVisible();
  });

  test('deleting the account still takes a tap and a typed word', async ({ page }) => {
    const calls = [];
    await page.route('**/rest/v1/rpc/delete_my_account', async (route) => {
      calls.push(1);
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: 'null',
      });
    });

    await page.goto('/profile');
    await openControl(page, /Delete account/);
    // Scoped to the opened control: the row that opens it carries the same words.
    const body = page.locator('#profile-control-delete');
    await body.getByRole('button', { name: /^Delete account$/ }).click();

    const armed = page.getByRole('button', { name: /Delete forever/i });
    await expect(armed).toBeVisible();
    await expect(armed).toBeDisabled();          // nothing typed yet
    expect(calls).toHaveLength(0);

    await page.getByRole('textbox', { name: /to confirm account deletion/i }).fill('DELETE');
    await expect(armed).toBeEnabled();
  });

  test('the daily goal still saves, and the row closes with the new value', async ({ page }) => {
    const writes = [];
    await page.route('**/rest/v1/profiles*', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH') return route.fallback();
      // The app patches `profiles` for several reasons; only the goal is ours.
      const body = JSON.parse(req.postData() || '{}');
      if ('daily_new_cards' in body) writes.push(body);
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: '[]',
      });
    });

    await page.goto('/profile');
    await openControl(page, /Daily new cards/);
    await page.getByRole('button', { name: /Intensive/ }).click();
    await page.getByRole('button', { name: /^Save$/ }).click();

    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].daily_new_cards).toBe(15);
    await expect(page.getByRole('button', { name: /Daily new cards/, expanded: false })).toBeVisible();
    await expect(page.getByText('15 a day')).toBeVisible();
  });

  // P10-B5: the panel was six full-width cards and a third of the screen.
  test('lists at most five slipping words, worst first', async ({ page }) => {
    await withWeakWords(page, 9);
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    // 词8 has the most lapses (11), 词4 the fifth most (7).
    for (const word of ['词8', '词7', '词6', '词5', '词4']) {
      await expect(page.getByText(word, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('词3', { exact: true })).toHaveCount(0);
    // A word that has not slipped is never listed here, whatever the query returns.
    await expect(page.getByText('好', { exact: true })).toHaveCount(0);

    // And the action admits what the cap hides.
    await expect(page.getByRole('button', { name: 'Review all 9 weak words' })).toBeVisible();
  });

  test('says nothing about a total when nothing is hidden', async ({ page }) => {
    await withWeakWords(page, 3);
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Review these words' })).toBeVisible();
  });

  test('hides the panel entirely when nothing is slipping', async ({ page }) => {
    await page.goto('/profile');   // the mock deck has no stuck words
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toHaveCount(0);
    await expect(page.getByText(/keep slipping/i)).toHaveCount(0);
  });

  test('a slipping word opens the coach rather than a new screen', async ({ page }) => {
    await withWeakWords(page, 5);
    await page.goto('/profile');
    await page.getByRole('button', { name: /词4/ }).click();
    // The coach sheet, not a route change: the URL is still /profile.
    await expect(page.getByText('A different angle')).toBeVisible();
    // (The AppBar's own Close is the other one — the sheet's is outside #main-content.)
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(2);
    expect(new URL(page.url()).pathname).toBe('/profile');
  });
});
