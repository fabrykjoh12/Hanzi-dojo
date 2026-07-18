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

// The pre-login wizard: pick a language and a reason before ever seeing the
// signup form, and have those choices personalize it.
test.describe('Pre-login onboarding wizard', () => {
  test('CTA → language → reason → personalized signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // Step 1: choose a language.
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toBeVisible();
    await page.getByRole('button', { name: /Chinese/i }).click();

    // Step 2: why are you learning?
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /Pass an exam/i }).click();

    // Auth screen: Sign-up tab active + personalized, exam-aware intro.
    await expect(page.getByText(/HSK/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });

  test('language chip jumps straight to the reason step', async ({ page }) => {
    await page.goto('/');
    // The hero language chips are a shortcut into the wizard with the language set.
    await page.getByRole('button', { name: /中文/ }).click();
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
  });

  test('Log in skips the wizard for returning users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    // Straight to the auth card (email field), no language/reason step.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toHaveCount(0);
  });
});
