import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Signed-in Home renders profile/track/counts from the mock backend.
test.describe('Home (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    home = new HomePage(page);
    await home.goto();
  });

  test('the lit block is about the flashcard queue', async ({ page }) => {
    await expect(home.queueEyebrow).toBeVisible();
    // The queue's own breakdown lives inside the block that is about it.
    for (const label of ['New', 'Learning', 'Due']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    // Home is a coach, not a menu — no competing per-stat buttons.
    await expect(page.getByRole('button', { name: /Review now|Learn them/ })).toHaveCount(0);
  });

  test('hands off to reading beneath the hero, quietly', async () => {
    await expect(home.storyHandoff).toBeVisible();
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the hero opens Study while cards are due', async ({ page }) => {
    await home.heroAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });
});
