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
});
