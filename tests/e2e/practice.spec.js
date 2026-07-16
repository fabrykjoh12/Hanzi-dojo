import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { PracticePage } from '../pages/PracticePage.js';

// The Practice Lab exposes the secondary drill modes.
test.describe('Practice Lab', () => {
  test('lists the practice modes', async ({ page }) => {
    const practice = new PracticePage(page);
    await practice.goto();

    await expect(practice.mode('Weak words')).toBeVisible();
    await expect(practice.mode('Listening')).toBeVisible();
    await expect(practice.mode('Writing')).toBeVisible();
  });
});
