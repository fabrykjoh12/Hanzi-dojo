import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The story shelf is CUMULATIVE: a learner at level N sees published stories
// from every level 1…N, grouped and labelled, their current level first.
// Fixture: track.current_level = 2, four level-2 stories (tier 1) and one
// level-1 story (tier 3, "老朋友").
const LEVEL_1_STORY = {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
};

// Narrow the stories table to a specific set for one test (GET only — anything
// else falls through to the shared mock). Lets a spec stage a shelf state the
// shared fixture can't, e.g. a current level with no stories of its own.
async function serveStories(page, rows) {
  await page.route('**/rest/v1/stories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(rows),
    });
  });
}

test.describe('Cumulative story shelf', () => {
  test('groups stories by level, current level first', async ({ page }) => {
    await page.goto('/stories');

    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(['HSK 2', 'HSK 1']);
    // The learner's own level is called out.
    await expect(page.getByText('Your level')).toBeVisible();
  });

  test('a lower level is gated by ITS OWN tiers — a passed level stays open', async ({ page }) => {
    await page.goto('/stories');

    // HSK 2 (the current level) gates on real progress: only "First Steps" is
    // open; "Growing" still asks for more learned words.
    await expect(page.getByText(/more learned words to unlock/).first()).toBeVisible();

    // HSK 1 is behind the learner, so its tier-3 shelf is open even though the
    // same threshold is still locked at HSK 2.
    const fluent = page.getByRole('button', { name: /Fluent/ });
    await expect(fluent).toHaveCount(2);            // one per level group
    await fluent.last().click();                    // the HSK 1 one

    await expect(page.getByRole('heading', { name: 'Fluent' })).toBeVisible();
    await expect(page.getByRole('button', { name: '老朋友' })).toBeVisible();
  });

  test('a lower level’s story opens into the reader', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /Fluent/ }).last().click();
    await page.getByRole('button', { name: '老朋友' }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('tier copy names the level it belongs to, never HSK 1 by default', async ({ page }) => {
    await page.goto('/stories');
    // The old bug: one Chinese table described "the first 100 most common HSK 1
    // words" at every level. HSK 2's shelves must talk about HSK 2.
    await expect(page.getByText(/most common HSK 2 words/)).toBeVisible();
  });

  // The production case for HSK 3–6 today: the level has vocabulary but no
  // stories of its own. The shelf must stay full and say so honestly.
  test('current level has no stories of its own — lower levels still show', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');

    await expect(page.getByText('HSK 2 stories are on the way')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'HSK 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fluent/ })).toBeVisible();
  });

  test('no stories anywhere — calm empty state, no broken shelf', async ({ page }) => {
    await serveStories(page, []);
    await page.goto('/stories');

    await expect(page.getByText('No stories yet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('heading', { level: 2, name: 'HSK 1' })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
