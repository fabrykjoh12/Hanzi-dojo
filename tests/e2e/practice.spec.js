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

// ── The level test ────────────────────────────────────────────────────────
//
// It belongs to the Practice tab, but on a phone it used to be reachable ONLY
// from the "More" sheet, filed between Profile and Log out — no screen in the
// app linked to it. The mock deck masters far fewer than 90% of the level's
// words, so the fixture's learner sees the locked state.
test.describe('the level test', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is on the Practice screen, locked, and says what opens it', async ({ page }) => {
    await page.goto('/practice');
    const row = page.getByRole('button', { name: /test — (locked|unlocked)/ });
    await expect(row).toBeVisible();

    const label = await row.getAttribute('aria-label');
    expect(label).toMatch(/test — locked\. \d+ of \d+ words mastered; unlocks at \d+\./);
    // Locked is a state, not an absence: the requirement is on screen, in words
    // and as a position, rather than the feature simply not being there.
    await expect(row.getByText(/Unlocks at \d+ mastered words/)).toBeVisible();
    await expect(row.getByText(/\d+ of \d+ words mastered/)).toBeVisible();
  });

  test('opens the test, which owns the real gate', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('button', { name: /test — locked/ }).click();
    // Practice derives the gate from the Home counts; Test derives it from its
    // own queries and also opens for anyone who already passed this level. So
    // the row never refuses — it explains, and hands over to the screen that
    // knows the whole rule.
    await expect(page.getByRole('heading', { name: /Test locked/ })).toBeVisible();
    await expect(page.getByText(/Master 90% of this level's words/)).toBeVisible();
  });

  test('is no longer in the More sheet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More menu' });
    await expect(sheet).toBeVisible();
    // What is left is the account drawer, and the test is not filed in it.
    await expect(sheet.getByRole('button', { name: 'Test' })).toHaveCount(0);
    for (const item of ['Profile', 'Language', 'Settings', 'Log out']) {
      await expect(sheet.getByRole('button', { name: item })).toBeVisible();
    }
  });

  test('its own route still works, unchanged', async ({ page }) => {
    // Moving where it is advertised must not move where it lives: `test` is
    // still a fullscreen flow owned by the Practice tab.
    await page.goto('/test');
    await expect(page.getByRole('heading', { name: /Test locked/ })).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });
});
