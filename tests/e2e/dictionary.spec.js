import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Built-in dictionary: search any word, then open the lookup sheet to hear it
// and add it to the deck.
test.describe('Dictionary', () => {
  test('lists words and opens the lookup sheet on tap', async ({ page }) => {
    await page.goto('/dictionary');

    await expect(page.getByRole('heading', { name: /Look up any word/i })).toBeVisible();
    // A known seeded word appears in the list.
    const row = page.getByRole('button', { name: /朋友/ }).first();
    await expect(row).toBeVisible();

    // Tapping opens the shared lookup sheet — its unique controls confirm it.
    await row.click();
    await expect(page.getByRole('button', { name: 'Add to deck' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play audio' })).toBeVisible();
  });

  test('search narrows the list', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByLabel('Search the dictionary').fill('weather');
    // 天气 (weather) survives; an unrelated word does not.
    await expect(page.getByRole('button', { name: /天气/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友/ })).toHaveCount(0);
  });

  test('reachable from the Practice hub', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('button', { name: /Dictionary/i }).click();
    await expect(page.getByRole('heading', { name: /Look up any word/i })).toBeVisible();
  });
});
