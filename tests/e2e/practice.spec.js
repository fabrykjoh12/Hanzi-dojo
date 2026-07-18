import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { PracticePage } from '../pages/PracticePage.js';

// The Practice Lab exposes the secondary drill modes.
test.describe('Practice Lab', () => {
  test('lists the practice modes', async ({ page }) => {
    const practice = new PracticePage(page);
    await practice.goto();

    await expect(practice.mode('Weak words')).toBeVisible();
    await expect(practice.mode('Listening')).toBeVisible();
    await expect(practice.mode('Speaking')).toBeVisible();
    await expect(practice.mode('Writing')).toBeVisible();
  });

  test('opens the Speaking drill', async ({ page }) => {
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.mode('Speaking').click();
    // Header renders whether or not the browser supports speech recognition.
    await expect(page.getByText('Speaking').first()).toBeVisible();
    await expect(page.getByText(/Say this aloud|isn.t supported here/i)).toBeVisible();
  });
});
