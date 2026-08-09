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
    // `.filter({ visible: true })` because the Practice hub is a persistent tab
    // root now: it stays in the DOM behind the drill (display:none, out of the
    // accessibility tree), so its own "Speaking" tile is still matchable by
    // text. The assertion is unchanged in intent — the drill's header renders.
    // Header renders whether or not the browser supports speech recognition.
    await expect(page.getByText('Speaking').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/Say this aloud|isn.t supported here/i)).toBeVisible();
  });
});
