import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Signed-in dashboard renders profile/track/counts from the mock backend.
test.describe('Home dashboard (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    home = new HomePage(page);
    await home.goto();
  });

  test('renders Today\'s Dojo with the primary review action', async () => {
    await expect(home.reviewCta).toBeVisible();
    await expect(home.cardsWaiting).toBeVisible();
  });

  test('shows the New / Learning / Due count tiles', async () => {
    await expect(home.tile('New')).toBeVisible();
    await expect(home.tile('Learning')).toBeVisible();
    await expect(home.tile('Due')).toBeVisible();
  });

  test('shows the fluency panel', async () => {
    await expect(home.fluency).toBeVisible();
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the whole Today\'s Dojo card is tappable and opens Study', async ({ page }) => {
    // No separate nested button for this any more — the card itself navigates.
    await page.getByText('Today’s Dojo').click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });
});
