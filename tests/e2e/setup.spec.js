import { authedTest as test, expect, PROFILE, TRACK } from '../fixtures/mockSupabase.js';

// Setup, after the account exists — and the proof that it is now ONE question.
//
// The route override is what makes a signed-in page look like a brand-new
// account: App shows Onboarding whenever there is no profile and no track, and
// that gate is the authority on "new", not a stored flag. Registered after the
// fixture's own handler so it wins.

const PHONES = [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

async function asNewAccount(page) {
  // Empty until setup writes the row, and the real fixture afterwards — an
  // account that stayed empty after its own upsert would send the learner
  // straight back into setup, which is not what a new account does.
  const created = new Set();
  for (const table of ['profiles', 'language_tracks']) {
    await page.route('**/mock.supabase.co/rest/v1/' + table + '**', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') {
        created.add(table);
        return route.fallback();
      }
      if (created.has(table)) return route.fallback();
      const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/json',
          'content-range': '0-0/*',
        },
        body: JSON.stringify(wantsObject ? null : []),
      });
    });
  }
}

// What setup writes, so a spec can assert on it rather than on a screen.
async function captureWrites(page) {
  const writes = [];
  await page.route('**/mock.supabase.co/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' && req.method() !== 'OPTIONS') {
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { /* not json */ }
      writes.push({ url: req.url(), body });
    }
    return route.fallback();
  });
  return writes;
}

const GONE = [
  /Set your daily goal/i,
  /Here's your daily loop/i,
  /How many new words/i,
  /Start First Mission/i,
  /Which language do you want to learn/i,
  /Bring your earlier words into review/i,
];

for (const phone of PHONES) {
  test.describe('Setup on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('asks where to start, and nothing else', async ({ page }) => {
      await asNewAccount(page);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: /Where should we start you/i })).toBeVisible();
      for (const gone of GONE) {
        await expect(page.getByText(gone), String(gone)).toHaveCount(0);
      }
      // Three answers. Not six, not a tier grid up front.
      for (const label of ["I'm new to Chinese", 'I know some Chinese', 'I know my HSK level']) {
        await expect(page.getByRole('radio', { name: label })).toBeVisible();
      }
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('a beginner is set up in two taps and lands on a card', async ({ page }) => {
      await asNewAccount(page);
      const writes = await captureWrites(page);
      await page.goto('/');

      await page.getByRole('radio', { name: "I'm new to Chinese" }).click();
      await page.getByRole('button', { name: 'Start learning' }).click();

      // Straight into the real session — no "you're ready!" screen in between.
      await expect(page.getByRole('button', { name: /flashcard.*tap to reveal/i })).toBeVisible({ timeout: 15000 });

      const profile = writes.find(w => w.url.includes('/profiles'));
      const track = writes.find(w => w.url.includes('/language_tracks'));
      expect(profile.body.active_language).toBe('chinese');
      // The daily goal is seeded, never asked for.
      expect(profile.body.daily_new_cards).toBe(10);
      expect(track.body.current_level).toBe(1);
      expect(track.body.is_active).toBe(true);
    });
  });
}

test.describe('Setup', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('offers the test to someone who knows some Chinese, without imposing it', async ({ page }) => {
    await asNewAccount(page);
    await page.goto('/');
    await page.getByRole('radio', { name: 'I know some Chinese' }).click();
    // An offer, in a sentence — not a step that has to be walked.
    await expect(page.getByRole('button', { name: /Take a quick test instead/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start learning' })).toBeEnabled();
  });

  test('reveals the tiers only for someone who knows their level', async ({ page }) => {
    await asNewAccount(page);
    await page.goto('/');
    await expect(page.getByText(/Beginner|Intermediate/)).toHaveCount(0);
    await page.getByRole('radio', { name: 'I know my HSK level' }).click();
    await expect(page.getByText('Beginner')).toBeVisible();
  });

  test('never shows a first-run coach tour after the tutorial', async ({ page }) => {
    // The learner has just done a session, watched it complete, watched a story
    // open and read it. Four coach marks on arrival would be a second tutorial.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('prelogin:prefs', JSON.stringify({ tutorial: { done: true } }));
      } catch { /* blocked storage */ }
    });
    await page.goto('/');
    await page.waitForTimeout(1400);
    await expect(page.getByRole('button', { name: /Skip tour/i })).toHaveCount(0);
    await expect(page.getByText('Start here each day')).toHaveCount(0);
  });

  test('an established account with progress is never sent back through setup', async ({ page }) => {
    // Stale tutorial prefs on the device must not override the account's own
    // history — the gate is the profile and the track, not a stored flag.
    await page.addInitScript(() => {
      try { localStorage.removeItem('prelogin:prefs'); } catch { /* blocked storage */ }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Where should we start you/i })).toHaveCount(0);
    expect(PROFILE.id).toBe(TRACK.user_id);
  });
});
