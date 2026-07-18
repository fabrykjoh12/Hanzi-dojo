import { anonTest as test, expect } from '../fixtures/mockSupabase.js';

test.describe('How much can you read? assessment', () => {
  test('anon visitor takes the quiz and sees a shareable result + signup CTA', async ({ page }) => {
    await page.goto('/how-much-can-you-read');

    // Intro → start.
    await expect(page.getByRole('heading', { name: /How much Chinese can you read/i })).toBeVisible();
    await page.getByRole('button', { name: /Start the 60-second test/i }).click();

    // Answer every question by clicking the first option, until the result shows.
    // (12 questions for the fixture vocab; loop defensively up to 20.)
    for (let i = 0; i < 20; i += 1) {
      const done = await page.getByText(/of everyday Chinese/i).isVisible().catch(() => false);
      if (done) break;
      const progress = page.getByText(/Question \d+ of \d+/i);
      if (await progress.isVisible().catch(() => false)) {
        // Click the first answer option (buttons after the progress/prompt).
        const options = page.locator('button');
        await options.nth(await firstOptionIndex(page)).click();
      } else {
        break;
      }
    }

    // Result: a percentage, a level label, and the signup CTA.
    await expect(page.getByText(/of everyday Chinese/i)).toBeVisible();
    await expect(page.getByText(/~\d+%/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign up free to learn the words/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Share my result/i })).toBeVisible();
  });
});

// The quiz renders the progress line, the prompt, then the option buttons. The
// first option is the first <button> on the page (there is no other chrome), so
// index 0 works; kept as a helper in case chrome is added later.
async function firstOptionIndex() {
  return 0;
}
