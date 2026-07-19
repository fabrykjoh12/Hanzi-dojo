import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Built-in dictionary: search any word, then open the lookup sheet to hear it
// and add it to the deck.
test.describe('Dictionary', () => {
  test('lists words and opens the lookup sheet on tap', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByRole('button', { name: 'My syllabus' }).click();

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
    await page.getByRole('button', { name: 'My syllabus' }).click();
    await page.getByLabel('Search the dictionary').fill('weather');
    // 天气 (weather) survives; an unrelated word does not.
    await expect(page.getByRole('button', { name: /天气/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友/ })).toHaveCount(0);
  });

  test('matches toneless pinyin', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByRole('button', { name: 'My syllabus' }).click();
    // Typing without tone marks still finds 天气 (stored reading "tiānqì").
    await page.getByLabel('Search the dictionary').fill('tianqi');
    await expect(page.getByRole('button', { name: /天气/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友/ })).toHaveCount(0);
  });

  test('reachable from the Practice hub', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('button', { name: /Dictionary/i }).click();
    await expect(page.getByRole('heading', { name: /Look up any word/i })).toBeVisible();
  });

  test('filters the list by status', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByRole('button', { name: 'My syllabus' }).click();

    // The mock deck has 今天 (v1) graduated and 朋友 (v6) still in learning.
    const filters = page.getByRole('group', { name: 'Filter by status' });
    await filters.getByRole('button', { name: 'Learning' }).click();
    await expect(page.getByRole('button', { name: /朋友/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /今天/ })).toHaveCount(0);

    // Mastered has no matches in the mock deck → encouraging, filter-aware empty state.
    await filters.getByRole('button', { name: 'Mastered' }).click();
    await expect(page.getByText(/No mastered words yet/i)).toBeVisible();

    // Back to All restores the full list.
    await filters.getByRole('button', { name: 'All' }).click();
    await expect(page.getByRole('button', { name: /今天/ })).toBeVisible();
  });

  test('filters the list by level', async ({ page }) => {
    // Add a level-1 word so the level picker appears (mock vocab is all level 2).
    await page.route('**/rest/v1/vocabulary*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-7/*' },
        body: JSON.stringify([
          { id: 'v8', word: '你好', reading: 'nǐhǎo', meaning: 'hello', level: 1, system: 'hsk', language: 'chinese', is_active: true },
          { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today', level: 2, system: 'hsk', language: 'chinese', is_active: true },
          { id: 'v2', word: '天气', reading: 'tiānqì', meaning: 'weather', level: 2, system: 'hsk', language: 'chinese', is_active: true },
        ]),
      });
    });

    await page.goto('/dictionary');
    await page.getByRole('button', { name: 'My syllabus' }).click();
    await expect(page.getByRole('button', { name: /你好/ })).toBeVisible();

    // Narrow to level 1 → only 你好 remains.
    await page.getByLabel('Filter by level').selectOption({ label: 'HSK 1' });
    await expect(page.getByRole('button', { name: /你好/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /天气/ })).toHaveCount(0);
  });

  test('remembers recently opened words', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByRole('button', { name: 'My syllabus' }).click();

    // Open a word, then close the lookup sheet.
    await page.getByRole('button', { name: /朋友/ }).first().click();
    await expect(page.getByRole('button', { name: 'Add to deck' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    // A "Recent" section now surfaces the word we just opened.
    const recent = page.getByRole('region', { name: 'Recent lookups' });
    await expect(recent).toBeVisible();
    await expect(recent.getByRole('button', { name: /朋友/ })).toBeVisible();

    // It survives a reload (persisted per-language).
    await page.reload();
    await page.getByRole('button', { name: 'My syllabus' }).click();
    await expect(page.getByRole('region', { name: 'Recent lookups' }).getByRole('button', { name: /朋友/ })).toBeVisible();

    // Clearing empties the section.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('region', { name: 'Recent lookups' })).toHaveCount(0);
  });

  test('full dictionary search shows a reference entry', async ({ page }) => {
    await page.goto('/dictionary');
    await expect(page.getByRole('button', { name: 'Full dictionary' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('Search the dictionary').fill('zhong');
    const row = page.getByRole('button').filter({ hasText: '中文' }).first();
    await expect(row).toBeVisible();

    await row.click();
    await expect(page.getByRole('tab', { name: 'Meaning' })).toBeVisible();
  });

  test('adds a reference word to the deck from the entry', async ({ page }) => {
    await page.goto('/dictionary')
    await page.getByLabel('Search the dictionary').fill('zhong')
    await page.getByRole('button').filter({ hasText: '中文' }).first().click()
    const add = page.getByRole('button', { name: 'Add to deck' })
    await expect(add).toBeVisible()
    await add.click()
    await expect(page.getByRole('button', { name: 'In your deck' })).toBeVisible()
  });
});
