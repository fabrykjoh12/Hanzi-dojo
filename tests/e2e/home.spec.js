import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';

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

  test('shows the 7-day review forecast', async ({ page }) => {
    await expect(page.getByText('Next 7 days')).toBeVisible();
    await expect(page.getByText(/reviews? a day/i)).toBeVisible();
  });
});
