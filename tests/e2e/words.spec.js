import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Word list is interactive: tap a word to open the lookup sheet (hear it,
// add it to the deck) — the same sheet the readers and dictionary use.
test.describe('Word list', () => {
  test('tapping a word opens the lookup sheet', async ({ page }) => {
    await page.goto('/words');

    // Tap a seeded word row.
    await page.getByRole('button', { name: /朋友/ }).first().click();

    // The shared lookup sheet appears with its controls.
    await expect(page.getByRole('button', { name: 'Add to deck' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play audio' })).toBeVisible();
  });

  test('search matches toneless pinyin', async ({ page }) => {
    await page.goto('/words');
    // Typing without tone marks still finds 天气 (stored reading "tiānqì").
    await page.getByLabel('Search words').fill('tianqi');
    await expect(page.getByRole('button', { name: /天气/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友/ })).toHaveCount(0);
  });
});
