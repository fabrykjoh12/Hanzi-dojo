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

  test('leads with the unlocked story, not the card queue', async ({ page }) => {
    await expect(page.getByText(/Unlocked and waiting|Your first words/)).toBeVisible();
  });

  test('shows the queue as readouts beneath the hero', async () => {
    await expect(home.dueReadout).toBeVisible();
    await expect(home.newReadout).toBeVisible();
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    // The readouts are deliberately NOT buttons — Home is a coach, not a menu.
    await expect(page.getByRole('button', { name: /Review now|Learn them/ })).toHaveCount(0);
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the hero is tappable and opens Study while cards are due', async ({ page }) => {
    await home.heroAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });
});
