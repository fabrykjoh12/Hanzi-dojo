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

// The pre-login wizard: with Chinese as the only public language, the CTA
// skips straight to the reason step (no language picker, no hero chips — see
// Landing.jsx's soloLang short-circuit). Picking a reason then leads through
// the character taste — three guesses ending in 火 + 山 — straight to signup.
// Those choices personalize the signup screen.
test.describe('Pre-login onboarding wizard', () => {
  test('CTA → reason → character taste → personalized signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // Chinese-only: the language step is skipped, straight to "why".
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /Pass an exam/i }).click();

    // Character taste. Answer each of the three, ending on the compound —
    // 火山 is the payoff, so the run is not meaningful without reaching it.
    await expect(page.getByRole('heading', { name: /more guessable than it looks/i })).toBeVisible();

    await page.getByRole('button', { name: /^A mountain$/ }).click();
    await page.getByRole('button', { name: /^Next$/ }).click();

    await page.getByRole('button', { name: /^Fire$/ }).click();
    await page.getByRole('button', { name: /^Next$/ }).click();

    await page.getByRole('button', { name: /^A volcano$/ }).click();
    await expect(page.getByText(/Fire mountain/i)).toBeVisible();
    await page.getByRole('button', { name: /Start learning/i }).click();

    // Auth screen: Sign-up tab active + personalized, exam-aware intro.
    await expect(page.getByText(/HSK/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });

  test('a wrong guess still explains and moves on — it is not a test', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();
    await page.getByRole('button', { name: /Travel/i }).click();

    await page.getByRole('button', { name: /^A river$/ }).click();
    // The right answer is marked and the explanation appears anyway.
    await expect(page.getByText(/Three peaks/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeVisible();
  });

  test('Log in skips the wizard for returning users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    // Straight to the auth card (email field), no language/reason step.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toHaveCount(0);
  });
});
