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

// The first-encounter flow (owner's design, 2026-08-08): flashcard →
// micro-story → completion → the three setup questions → the assembled
// path → and only then the account. Demonstration before questions,
// questions before the ask — this walks the whole loop, including a wrong
// answer in the story, because the gentle-retry behaviour is a design
// decision a tidy-up could easily "fix" into a buzzer.
test.describe('Pre-login onboarding wizard', () => {
  test('flashcard → story → completion → questions → path → account last', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();

    // The flashcard: flip it, see the meaning, head into the story.
    await expect(page.getByRole('heading', { name: /Your first flashcard/i })).toBeVisible();
    await page.getByRole('button', { name: /Reveal the meaning/i }).click();
    await expect(page.getByText('nǐ hǎo')).toBeVisible();
    await page.getByRole('button', { name: /See it in a story/i }).click();

    // The story: arrive, be greeted, answer — wrongly first, on purpose.
    await expect(page.getByText(/small tea shop/i)).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await expect(page.getByText('你好！')).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await expect(page.getByText(/What should Mei say/i)).toBeVisible();

    await page.getByRole('button', { name: '谢谢', exact: true }).click();
    await expect(page.getByText(/thank you/i)).toBeVisible();     // gentle, explains
    await page.getByRole('button', { name: '你好', exact: true }).click();
    await expect(page.getByText(/She said it/i)).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // Completion claims discovery, not mastery, then the questions begin.
    await expect(page.getByText(/You understood your first Chinese story/i)).toBeVisible();
    await page.getByRole('button', { name: /Build my training path/i }).click();

    await expect(page.getByRole('heading', { name: /How much Chinese do you know/i })).toBeVisible();
    await page.getByRole('button', { name: /completely new/i }).click();

    await expect(page.getByRole('heading', { name: /Why are you learning Chinese/i })).toBeVisible();
    await page.getByRole('button', { name: /HSK or study|Study or HSK/i }).click();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    await expect(page.getByRole('heading', { name: /train each day/i })).toBeVisible();
    await expect(page.getByText(/10 new words and one short review/i)).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/ }).click();

    // The path assembles from the answers; the account comes only now.
    await expect(page.getByRole('heading', { name: /Preparing your training path/i })).toBeVisible();
    await expect(page.getByText(/HSK 1, most useful words first/i)).toBeVisible();
    await page.getByRole('button', { name: /Save my path/i }).click();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });

  test('an accidental reload resumes the wizard instead of restarting it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start your first story/i }).click();
    await expect(page.getByRole('heading', { name: /Your first flashcard/i })).toBeVisible();
    await page.getByRole('button', { name: /Reveal the meaning/i }).click();
    await page.getByRole('button', { name: /See it in a story/i }).click();
    await expect(page.getByText(/small tea shop/i)).toBeVisible();

    await page.reload();
    // Straight back into the story step — not the marketing page.
    await expect(page.getByText(/small tea shop/i)).toBeVisible();
  });

  test.describe('on a small phone (360x640)', () => {
    test.use({ viewport: { width: 360, height: 640 } });

    test('the whole encounter stays reachable without horizontal scroll', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /Start your first story/i }).click();
      await page.getByRole('button', { name: /Reveal the meaning/i }).click();
      await page.getByRole('button', { name: /See it in a story/i }).click();
      await page.getByRole('button', { name: /^Continue$/ }).click();
      await page.getByRole('button', { name: /^Continue$/ }).click();
      await page.getByRole('button', { name: '你好', exact: true }).click();
      await expect(page.getByText(/She said it/i)).toBeVisible();
      // The page must never scroll sideways on a narrow phone.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });

  test('Log in skips the wizard for returning users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    // Straight to the auth card (email field), no language/reason step.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Which language are you learning/i })).toHaveCount(0);
  });
});
