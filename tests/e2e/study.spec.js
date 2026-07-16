import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// The core loop: open a study session, reveal the answer, see FSRS grades.
test.describe('Study session (flashcards)', () => {
  test('reveals the answer and shows FSRS grade buttons', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    await expect(study.showAnswer).toBeVisible();
    await study.reveal();

    // ts-fsrs computes the four grades with intervals.
    await expect(study.gradeAgain).toBeVisible();
    await expect(study.gradeGood).toBeVisible();
    await expect(study.gradeEasy).toBeVisible();
  });

  // The recap must always end with a direct "do this next" action — never a
  // dead-end "Back home" — even when no story is unlocked and no chat mission
  // is offered (the mock fixtures have neither), which falls back to the story
  // hub.
  test('recap always offers a direct next step', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    const recap = page.getByText('Session complete');

    // Grade through the whole queue until the session recap appears.
    for (let i = 0; i < 80; i += 1) {
      if (await recap.isVisible().catch(() => false)) break;
      if (await study.showAnswer.isVisible().catch(() => false)) {
        await study.showAnswer.click();
        await study.gradeGood.click();
      }
      await page.waitForTimeout(100);
    }

    await expect(recap).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Recommended next/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Read a story/i })).toBeVisible();
  });
});
