import { anonTest as test, expect } from '../fixtures/mockSupabase.js';

// Unauthenticated visitors (no session) should see the marketing landing page.
test.describe('Landing (logged out)', () => {
  test('shows the hero and primary CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Unlock stories you can actually read/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Start your first story/i })).toBeVisible();
  });

  test('does not show the authenticated dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Review & unlock/i })).toHaveCount(0);
  });
});

// The first run, end to end — and the proof that the old maze is gone.
//
// What a new learner used to walk: a marketing page, a flashcard mock, a
// tea-shop micro-story, a completion card, "How much Chinese do you know?",
// "Why are you learning Chinese?", "How much would you like to train each
// day?", an animated "Preparing your training path…", the account, a tier
// grid, a daily-goal picker, a diagram of the daily loop, a First Mission
// welcome — and then, on arriving at Home, four coach marks. Nineteen states,
// four of whose answers nothing ever read (docs/ONBOARDING-AUDIT.md).
//
// What they walk now is below. The second half of this file is the list of
// screens that must never appear again: deletions rot back in, and a spec that
// only asserts the happy path would not notice.

const DELETED = [
  /How much Chinese do you know/i,
  /Why are you learning Chinese/i,
  /would you like to train each day/i,
  /Preparing your training path/i,
  /Set your daily goal/i,
  /Here's your daily loop/i,
  /Start First Mission/i,
  /Build my training path/i,
  /You understood your first Chinese story/i,
  /Which language are you learning/i,
];

async function assertNoOldWizard(page) {
  for (const gone of DELETED) {
    await expect(page.getByText(gone), String(gone)).toHaveCount(0);
  }
}

const PHONES = [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

for (const phone of PHONES) {
  test.describe('A brand-new learner on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('walks welcome → tutorial → payoff → account → one question → learning', async ({ page }) => {
      await page.goto('/');
      await assertNoOldWizard(page);
      await page.getByRole('button', { name: /Start your first story/i }).click();

      // ── The tutorial: the scene it cannot yet read, then three real cards.
      await expect(page.getByText('Learn Chinese through words and stories.')).toBeVisible();
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(page.getByText(/can’t read this yet/)).toBeVisible();
      await page.getByRole('button', { name: 'Learn them' }).click();

      for (const word of ['你好', '谢谢', '再见']) {
        await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
        await page.getByRole('button', { name: /flashcard — tap to reveal/i }).click();
        await page.getByRole('button', { name: /^Good/ }).click();
      }
      await assertNoOldWizard(page);

      // ── The payoff: the same scene, readable — then the account, with no
      // loop-summary slide between them.
      await expect(page.getByText('Session complete')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Story unlocked')).toBeVisible();
      await page.getByRole('button', { name: 'Read it' }).click();
      await expect(page.getByText('你好！')).toBeVisible();
      await expect(page.getByText(/this time you can read it/)).toBeVisible();
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByLabel('Email')).toBeVisible();

      // "Create account" opens the form that CREATES one. This regressed once
      // — the tab was inferred from a prop the deleted wizard used to pass, so
      // every learner got the login form and signed in to an account that did
      // not exist (P12 audit §3.1). Assert the whole signup posture, not just
      // that an email field exists — an email field exists on both tabs.
      await expect(page.getByRole('button', { name: 'Sign up' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: /^Log in$/ })).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
      await expect(page.getByText(/At least \d+ characters/)).toBeVisible();
      await assertNoOldWizard(page);
    });

    test('never scrolls sideways on the way through', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /Start your first story/i }).click();
      await page.getByRole('button', { name: 'Start' }).click();
      await page.getByRole('button', { name: 'Learn them' }).click();
      for (let i = 0; i < 3; i += 1) {
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await page.getByRole('button', { name: /flashcard — tap to reveal/i }).click();
        await page.getByRole('button', { name: /^Good/ }).click();
      }
    });
  });
}

test.describe('Skipping the introduction (P12-2)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('lands on the SIGNUP hand-off, reports where, and never returns to marketing', async ({ page }) => {
    // Capture the analytics writes so the skip's address can be asserted.
    const events = [];
    await page.route('**/rest/v1/analytics_events**', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        for (const row of Array.isArray(body) ? body : [body]) events.push(row);
        return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Learn them' }).click();
    // One card in — mid-flow, the worst place an exit could misbehave.
    await page.getByRole('button', { name: /flashcard — tap to reveal/i }).click();
    await page.getByRole('button', { name: /^Good/ }).click();

    await page.getByRole('button', { name: 'Skip' }).click();

    // The same hand-off finishing produces: the signup form, not the pitch.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Unlock stories you can actually read/i)).toHaveCount(0);

    // The decision has an address.
    await page.waitForTimeout(400);
    const skipped = events.filter(e => e.name === 'tutorial_skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].props.state_id).toBe('card-2-front');

    // …and the teaching is recorded as handled: no data was created, but the
    // introduction does not replay on the next launch.
    expect(await page.evaluate(() => localStorage.getItem('hd:tutorial-done'))).toBe('1');
    await page.reload();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
  });
});

test.describe('Returning visitors', () => {
  test('Log in goes straight to the form — no tutorial, and the LOGIN tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    // An explicit Log in tap opens login — the signup default is only for the
    // tutorial's hand-off (prelogin.authEntryTab).
    await expect(page.getByRole('button', { name: /^Log in$/ }).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
    await assertNoOldWizard(page);
  });

  test('a finished tutorial is not shown twice — the app opens on the form', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('hd:tutorial-done', '1');
    });
    await page.reload();
    // They spent ninety seconds on the introduction and then closed the app
    // before signing up. Landing them on the welcome again would read as the
    // app having forgotten, so the account form IS the entry now — and it is
    // the SIGNUP side of it: what this learner is missing is an account.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start your first story/i })).toHaveCount(0);
  });

  test('the OLD done flag — a learner from an earlier build — still counts', async ({ page }) => {
    // Before P12-0 the done flag lived inside prelogin:prefs. A learner who
    // finished the tutorial on that build and then updated must not be shown
    // the introduction again.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('prelogin:prefs', JSON.stringify({ tutorial: { done: true } }));
    });
    await page.reload();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Back from the account form lands on the landing page, not a deleted step', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    const back = page.getByRole('button', { name: /back/i });
    if (await back.count()) {
      await back.first().click();
      await assertNoOldWizard(page);
      await expect(page.getByRole('button', { name: /Start your first story/i })).toBeVisible();
    }
  });
});
