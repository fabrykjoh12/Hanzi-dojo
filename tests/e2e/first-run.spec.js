import { anonTest, authedTest, expect } from '../fixtures/mockSupabase.js';

// The product's most important end-to-end: everything a brand-new learner
// touches, in order, at the two sizes that matter — plus every way it can be
// interrupted.
//
// The old first run was nineteen states across three tutorial systems. The list
// at the bottom of this file is what must never come back; deletions rot back
// in, and a spec that only walks the happy path would not notice.

const PHONES = [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

const NEVER = [
  /How much Chinese do you know/i,
  /Why are you learning Chinese/i,
  /would you like to train each day/i,
  /Preparing your training path/i,
  /Set your daily goal/i,
  /How many new words/i,
  /Here's your daily loop/i,
  /Start First Mission/i,
  /You understood your first Chinese story/i,
  /Which language do you want to learn/i,
  /Start here each day/i,          // the Home coach mark
];

async function assertClean(page, where) {
  for (const gone of NEVER) {
    await expect(page.getByText(gone), where + ' — ' + String(gone)).toHaveCount(0);
  }
}

const startBtn = (page) => page.getByRole('button', { name: 'Start' });
const cardEl = (page) => page.getByRole('button', { name: /flashcard — tap to reveal/i });
const gradeBtn = (page, name = 'Good') => page.getByRole('button', { name: new RegExp('^' + name) });

// Welcome → three cards → recap → unlock → two panels → the loop.
async function walkTutorial(page, { replay = false } = {}) {
  await expect(page.getByText('Learn Chinese through words and stories.')).toBeVisible();
  await startBtn(page).click();

  // Card 1 is the taught one: reveal, hear it, and what the grades mean.
  await cardEl(page).click();
  await expect(page.getByText('How well did you remember it?')).toBeVisible();
  for (const gloss of ['Forgot', 'Barely', 'Remembered', 'Effortless']) {
    await expect(page.getByText(gloss, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Replay audio' }).click();
  await gradeBtn(page).click();

  // Cards 2 and 3: less, then nothing.
  await cardEl(page).click();
  await gradeBtn(page, 'Hard').click();
  await cardEl(page).click();
  await expect(page.getByText('Forgot', { exact: true })).toHaveCount(0);
  await gradeBtn(page, 'Easy').click();

  await expect(page.getByText('Session complete')).toBeVisible();
  await expect(page.getByText('3 words practiced')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Story unlocked')).toBeVisible();
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByText('你好！')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('谢谢。再见！')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Learn', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: replay ? 'Done' : 'Create account' })).toBeVisible();
}

// A signed-in page that looks like a brand-new account until setup writes.
async function asNewAccount(page) {
  const created = new Set();
  for (const table of ['profiles', 'language_tracks']) {
    await page.route('**/mock.supabase.co/rest/v1/' + table + '**', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') { created.add(table); return route.fallback(); }
      if (created.has(table)) return route.fallback();
      const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'content-range': '0-0/*' },
        body: JSON.stringify(wantsObject ? null : []),
      });
    });
  }
}

// ── The whole path, signed out through to the account form ──────────────────

for (const phone of PHONES) {
  anonTest.describe('A first install on ' + phone.name, () => {
    anonTest.use({ viewport: { width: phone.width, height: phone.height } });

    anonTest('welcome → tutorial → payoff → account, and nothing else', async ({ page }) => {
      await page.goto('/');
      await assertClean(page, 'landing');
      await page.getByRole('button', { name: /Start your first story/i }).click();

      await walkTutorial(page);
      await assertClean(page, 'tutorial');

      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByLabel('Email')).toBeVisible();
      await assertClean(page, 'account');

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

// ── Interruptions ───────────────────────────────────────────────────────────

anonTest.describe('Being interrupted', () => {
  anonTest.use({ viewport: { width: 390, height: 844 } });

  anonTest('killed mid-tutorial, it comes back to the same card', async ({ page }) => {
    await page.goto('/tutorial');
    await startBtn(page).click();
    await cardEl(page).click();
    await gradeBtn(page).click();
    await expect(page.getByText('谢谢', { exact: true }).first()).toBeVisible();

    await page.goto('/tutorial');
    await expect(page.getByText('谢谢', { exact: true }).first()).toBeVisible();
    await expect(startBtn(page)).toHaveCount(0);
  });

  anonTest('killed after the tutorial but before signup, it comes back to signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();
    await walkTutorial(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();

    // The app dies here — signup never happened.
    await page.goto('/');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start your first story/i })).toHaveCount(0);
    await assertClean(page, 'resumed signup');
  });

  anonTest('a failed signup does not send them round again', async ({ page }) => {
    await page.route('**/mock.supabase.co/auth/v1/signup**', (route) =>
      route.fulfill({
        status: 400,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'invalid', error_description: 'Signup failed' }),
      }));

    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();
    await walkTutorial(page);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Still the form, still one tap from trying again — never the tutorial.
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
  });
});

// ── After the account ───────────────────────────────────────────────────────

for (const phone of PHONES) {
  authedTest.describe('Setup and the first real session on ' + phone.name, () => {
    authedTest.use({ viewport: { width: phone.width, height: phone.height } });

    authedTest('one question, then a real card', async ({ page }) => {
      await asNewAccount(page);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: /Where should we start you/i })).toBeVisible();
      await assertClean(page, 'setup');

      await page.getByRole('radio', { name: "I'm new to Chinese" }).click();
      await page.getByRole('button', { name: 'Start learning' }).click();

      // The real study screen, with no tutorial copy on it.
      await expect(cardEl(page)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Tap to reveal')).toHaveCount(0);
      await expect(page.getByText('How well did you remember it?')).toHaveCount(0);
      await assertClean(page, 'first session');

      // …and the real grades, with real schedule previews rather than glosses.
      await cardEl(page).click();
      await expect(gradeBtn(page)).toBeVisible();
      await expect(page.getByText('Remembered', { exact: true })).toHaveCount(0);
    });
  });
}

authedTest.describe('After the account', () => {
  authedTest.use({ viewport: { width: 390, height: 844 } });

  authedTest('killed after signup before the level question resumes at setup', async ({ page }) => {
    await asNewAccount(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Where should we start you/i })).toBeVisible();
    // Relaunch: still no profile, so still the one question — never the tutorial.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Where should we start you/i })).toBeVisible();
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
  });

  authedTest('a half-written setup keeps its transitional state and can retry', async ({ page }) => {
    // The profile lands, the track fails. Setup must not report success, must
    // not clear what got the learner here, and must let them press again.
    let trackAttempts = 0;
    await asNewAccount(page);
    await page.route('**/mock.supabase.co/rest/v1/language_tracks**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fallback();
      trackAttempts += 1;
      if (trackAttempts === 1) {
        return route.fulfill({
          status: 500,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'track write failed' }),
        });
      }
      return route.fallback();
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('prelogin:prefs', JSON.stringify({ language: 'chinese', level: 2 }));
      } catch { /* blocked storage */ }
    });

    await page.goto('/');
    await page.getByRole('radio', { name: "I'm new to Chinese" }).click();
    await page.getByRole('button', { name: 'Start learning' }).click();

    // Still on setup, with the failure named…
    await expect(page.getByRole('heading', { name: /Where should we start you/i })).toBeVisible();
    // …and the reading test's estimate is still on the device.
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('prelogin:prefs') || '{}'));
    expect(kept.level).toBe(2);

    // Pressing again gets through.
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(cardEl(page)).toBeVisible({ timeout: 15000 });
  });

  authedTest('an established account never sees the tutorial or setup', async ({ page }) => {
    await page.addInitScript(() => {
      // Stale device state from someone else's first run must lose to the
      // account's own history.
      try {
        localStorage.setItem('prelogin:prefs', JSON.stringify({
          tutorial: { state: { phase: 'card', cardIndex: 0, revealed: false, storyPanel: 0 } },
        }));
      } catch { /* blocked storage */ }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Where should we start you/i })).toHaveCount(0);
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
    await page.waitForTimeout(1200);
    await assertClean(page, 'established account');
  });

  authedTest('Replay introduction is a look, and writes nothing', async ({ page }) => {
    const writes = [];
    await page.route('**/mock.supabase.co/rest/v1/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const progress = ['/cards', '/profiles', '/language_tracks', '/story_unlocks', '/daily_activity', '/rpc'];
      if (req.method() !== 'GET' && req.method() !== 'OPTIONS' && progress.some(t => url.includes(t))) {
        writes.push(url);
      }
      return route.fallback();
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: /Replay introduction/i }).click();
    await expect(page.getByText('Learn Chinese through words and stories.')).toBeVisible();
    // Settings does its own housekeeping on arrival (preferences, reminder
    // times). What is under test is what the REPLAY writes, which is nothing.
    writes.length = 0;
    await walkTutorial(page, { replay: true });
    // "Done", never "Create account", to someone who plainly has an account.
    await page.getByRole('button', { name: 'Done' }).click();

    // Back where they came from, with nothing written and no position kept.
    await expect(page.getByRole('button', { name: /Replay introduction/i })).toBeVisible();
    expect(writes).toEqual([]);
    const saved = await page.evaluate(() => localStorage.getItem('prelogin:prefs'));
    expect(saved).toBe(null);
  });
});
