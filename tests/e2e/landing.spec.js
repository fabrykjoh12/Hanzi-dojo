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
// the wow-moment taste (read a real sentence) straight to signup — no separate
// "learn the characters" replay step, since the words are already revealed by
// the taste itself. Those choices personalize the signup screen.
test.describe('Pre-login onboarding wizard', () => {
  test('CTA → reason → taste → personalized signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // Chinese-only: the language step is skipped, straight to "why".
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /Pass an exam/i }).click();

    // Sentence taste: reveal all, confirm the wow-moment completion line, then
    // go straight on — no separate character-replay screen.
    await page.getByRole('button', { name: /Reveal all/i }).click();
    await expect(page.getByText(/You just read your first Chinese sentence/i)).toBeVisible();
    await page.getByRole('button', { name: /Save these words/i }).click();

    // Auth screen: Sign-up tab active + personalized, exam-aware intro.
    await expect(page.getByText(/HSK/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });

  test('Log in skips the wizard for returning users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    // Straight to the auth card (email field), no language/reason step.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toHaveCount(0);
  });
});
