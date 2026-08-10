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

      // ── The tutorial: three cards on the real flashcard.
      await expect(page.getByText('Learn Chinese through words and stories.')).toBeVisible();
      await page.getByRole('button', { name: 'Start' }).click();

      for (const word of ['你好', '谢谢', '再见']) {
        await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
        await page.getByRole('button', { name: /flashcard — tap to reveal/i }).click();
        await page.getByRole('button', { name: /^Good/ }).click();
      }
      await assertNoOldWizard(page);

      // ── The payoff.
      await expect(page.getByText('Session complete')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Story unlocked')).toBeVisible();
      await page.getByRole('button', { name: 'Read it' }).click();
      await expect(page.getByText('你好！')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();

      // ── The loop, then the account. No bridge screen between them.
      await expect(page.getByText('Learn', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByLabel('Email')).toBeVisible();
      await assertNoOldWizard(page);
    });

    test('never scrolls sideways on the way through', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /Start your first story/i }).click();
      await page.getByRole('button', { name: 'Start' }).click();
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

test.describe('Returning visitors', () => {
  test('Log in goes straight to the form — no tutorial', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
    await assertNoOldWizard(page);
  });

  test('a finished tutorial is not shown twice — the app opens on the form', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('prelogin:prefs', JSON.stringify({ tutorial: { done: true } }));
    });
    await page.reload();
    // They spent ninety seconds on the introduction and then closed the app
    // before signing up. Landing them on the welcome again would read as the
    // app having forgotten, so the account form IS the entry now.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText('Learn Chinese through words and stories.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start your first story/i })).toHaveCount(0);
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
