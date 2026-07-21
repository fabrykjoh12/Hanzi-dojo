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
// the wow-moment taste (a sentence, then its characters) before signup, and
// those choices personalize the signup screen.
test.describe('Pre-login onboarding wizard', () => {
  test('CTA → reason → taste → personalized signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // Chinese-only: the language step is skipped, straight to "why".
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /Pass an exam/i }).click();

    // Sentence taste: reveal all, confirm the wow-moment completion line.
    await page.getByRole('button', { name: /Reveal all/i }).click();
    await expect(page.getByText(/You just read your first Chinese sentence/i)).toBeVisible();
    await page.getByRole('button', { name: /Learn these characters/i }).click();

    // Character taste: step through each card (Show → Got it, tolerant of count).
    for (let i = 0; i < 5; i++) {
      const show = page.getByRole('button', { name: /^Show$/i });
      if (!(await show.isVisible().catch(() => false))) break;
      await show.click();
      await page.getByRole('button', { name: /Got it →|Done →/i }).click();
    }

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
