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

// The pre-login guided path (owner's design, 2026-08-08): experience →
// purpose (multi) → training style → daily minutes → the assembled path →
// the 你好 micro-lesson → and only then the account. The account ask coming
// AFTER the first win is the design's central choice, so this walks all of it.
test.describe('Pre-login onboarding wizard', () => {
  test('questions → path → first lesson → account ask comes last', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // Experience — Chinese-only, so the language step is skipped.
    await expect(page.getByRole('heading', { name: /How much Chinese do you know/i })).toBeVisible();
    await page.getByRole('button', { name: /completely new/i }).click();

    // Purpose is multi-select with an explicit Continue.
    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /Study or HSK/i }).click();
    await page.getByRole('button', { name: /Travel/i }).click();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // Style arrives preselected (balanced) — continuing instantly must work.
    await expect(page.getByRole('heading', { name: /What sounds most enjoyable/i })).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // Minutes: the honest estimate for the default is on screen.
    await expect(page.getByRole('heading', { name: /Choose your daily training/i })).toBeVisible();
    await expect(page.getByText(/10 new words and one short review/i)).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // The assembled path names the real choices, then hands to the lesson.
    await expect(page.getByRole('heading', { name: /Preparing your training path/i })).toBeVisible();
    await expect(page.getByText(/HSK 1, most useful words first/i)).toBeVisible();
    await expect(page.getByText(/Study or HSK/)).toBeVisible();
    await page.getByRole('button', { name: /Begin first lesson/i }).click();

    // The first win: 你好, revealed, used once, completed.
    await page.getByRole('button', { name: /Hear it and see what it means/i }).click();
    await expect(page.getByText(/nǐ hǎo · hello/i)).toBeVisible();
    await page.getByRole('button', { name: /say hello back/i }).click();
    await expect(page.getByText(/First training complete/i)).toBeVisible();
    await page.getByRole('button', { name: /Save my progress/i }).click();

    // Only now: the account.
    await expect(page.getByText(/HSK/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });

  test('every question is skippable and the path still assembles', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    await page.getByRole('button', { name: /Skip/i }).click();          // experience → default
    await page.getByRole('button', { name: /^Continue$/ }).click();     // purpose: none picked
    await page.getByRole('button', { name: /^Continue$/ }).click();     // style: balanced default
    await page.getByRole('button', { name: /^Continue$/ }).click();     // minutes: 10 default

    await expect(page.getByRole('heading', { name: /Preparing your training path/i })).toBeVisible();
    await expect(page.getByText(/A balanced start/i)).toBeVisible();
  });

  test('Log in skips the wizard for returning users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    // Straight to the auth card (email field), no language/reason step.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toHaveCount(0);
  });
});
