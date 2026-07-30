import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories LIBRARY: you pick a level on the rail, and that level's whole
// shelf is on screen at once — ordered by how much of it you can already read,
// searchable, with anything a tier hasn't opened yet shown (not hidden) at the
// bottom with the word count that opens it.
//
// Fixture: track.current_level = 2; four level-2 tier-1 stories (one paced
// narrative + three practice formats) and, at level 1, a tier-3 story (老朋友)
// and a tier-1 manhua episode.
const LEVEL_1_STORY = {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
};

// Narrow the stories table to a specific set for one test (GET only — anything
// else falls through to the shared mock).
//
// NOTE the mock ignores PostgREST filters, so BOTH of the screen's story queries
// (the open shelf, `level <= current`, and the preview shelf, `level > current`)
// receive this same list. The screen splits them client-side, which is exactly
// what the locked-level test below leans on.
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

// Move the mock track to a different current_level (GET only). Mirrors the
// wantsObject handling in mockSupabaseRoutes(), since a `.single()` query
// (Accept: pgrst.object) needs a bare object, not a one-item array.
async function serveTrackLevel(page, level) {
  await page.route('**/rest/v1/language_tracks**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const track = {
      id: 'track-1', user_id: '00000000-0000-4000-8000-000000000001', language: 'chinese',
      system: 'hsk', current_level: level, is_active: true, created_at: '2026-01-01T08:00:00.000Z',
    };
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(wantsObject ? track : [track]),
    });
  });
}

const LEVEL_2_STORY = {
  id: 'st1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '公园里的下午', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An afternoon at the park.',
  content: ['今天天气很好。', '小明：我们去公园吧！', '朋友：你看，花很好！'].join('\n'),
};
const LEVEL_3_STORY = {
  id: 'st6', language: 'chinese', system: 'hsk', level: 3, tier: 1, story_number: 1,
  title: '新的一年', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'A new year.',
  content: ['今年是新的一年。', '我们很高兴。'].join('\n'),
};

// Two level-2 stories written to sit at opposite ends of the readability sort.
// The mock deck knows 今天 天气 很 好 公园 (review) and is still learning 朋友 花,
// so EASY is 100% known and HARD is well under it.
const EASY_STORY = {
  id: 'easy1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '好天气', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'Nothing but words you know.',
  content: ['今天天气很好。', '公园很好。'].join('\n'),
};
const HARD_STORY = {
  id: 'hard1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 2,
  title: '花和朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'Flowers you have not learned yet.',
  content: ['朋友很好。', '花很好。'].join('\n'),
};
// Tier 2 at HSK 2 needs 80 learned words; the mock deck has far fewer.
const LOCKED_STORY = {
  id: 'locked1', language: 'chinese', system: 'hsk', level: 2, tier: 2, story_number: 9,
  title: '还没开的书', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'Waiting for more words.',
  content: '朋友很好。',
};

test.describe('Story library — the level rail', () => {
  test('the rail replaces the tier tabs, and opens on your own level', async ({ page }) => {
    await page.goto('/stories');
    const mine = page.getByRole('tab', { name: /HSK 2/ });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /HSK 1/ })).toBeVisible();
    // Tiers are no longer navigation.
    await expect(page.getByRole('tab', { name: /First Steps/ })).toHaveCount(0);
  });

  test('picking a level swaps the whole shelf', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    // HSK 1 is a level the learner has passed, so its stories stay open.
    await page.getByRole('tab', { name: /HSK 1/ }).click();
    await expect(panel.getByRole('button', { name: /老朋友/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toHaveCount(0);
  });

  test('practice formats keep their own section', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: 'Practice Scenarios' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 下雨天/ })).toBeVisible();
  });

  test('a story card opens straight into the reader (no list drill-in)', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('tab', { name: /HSK 1/ }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });
});

test.describe('Story library — sorted by what you know', () => {
  test('every card states how much of it you already know', async ({ page }) => {
    await serveStories(page, [EASY_STORY, HARD_STORY]);
    await page.goto('/stories');
    await expect(page.getByRole('tabpanel').getByText('100% known')).toBeVisible();
  });

  test('the shelf summary names the average', async ({ page }) => {
    await serveStories(page, [EASY_STORY, HARD_STORY]);
    await page.goto('/stories');
    await expect(page.getByText(/of these words are yours/i)).toBeVisible();
  });

  test('Easiest and Hardest flip the order of the shelf', async ({ page }) => {
    await serveStories(page, [EASY_STORY, HARD_STORY]);
    await page.goto('/stories');
    const sort = page.getByRole('group', { name: 'Sort' });
    // Story cards, not the toolbar's buttons: every card names its "% known".
    const cards = page.getByRole('tabpanel').getByRole('button', { name: /% known/ });

    await sort.getByRole('button', { name: 'Easiest' }).click();
    await expect(cards.first()).toContainText('好天气');

    await sort.getByRole('button', { name: 'Hardest' }).click();
    await expect(cards.first()).toContainText('花和朋友');
  });
});

test.describe('Story library — search and filters', () => {
  test('search narrows the shelf by English summary', async ({ page }) => {
    await serveStories(page, [EASY_STORY, HARD_STORY]);
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    await page.getByLabel('Search stories').fill('flowers');
    await expect(panel.getByRole('button', { name: /花和朋友/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /好天气/ })).toHaveCount(0);
    // Clearing it brings the shelf back.
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(panel.getByRole('button', { name: /好天气/ })).toBeVisible();
  });

  test('search matches the Chinese title too', async ({ page }) => {
    await serveStories(page, [EASY_STORY, HARD_STORY]);
    await page.goto('/stories');
    await page.getByLabel('Search stories').fill('好天气');
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /花和朋友/ })).toHaveCount(0);
  });

  test('a search with no hits says so instead of showing an empty shelf', async ({ page }) => {
    await serveStories(page, [EASY_STORY]);
    await page.goto('/stories');
    await page.getByLabel('Search stories').fill('zzzz');
    await expect(page.getByText('Nothing matches')).toBeVisible();
  });

  test('the filter row narrows by format', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // Scope to the Format group so the sidebar's "Practice" nav isn't matched.
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Practice' }).click();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toHaveCount(0);
  });
});

test.describe('Story library — what is still ahead', () => {
  test('a tier you have not opened is shown, not hidden, with the words that open it', async ({ page }) => {
    await serveStories(page, [EASY_STORY, LOCKED_STORY]);
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: 'Not open yet' })).toBeVisible();
    await expect(panel.getByText('还没开的书')).toBeVisible();
    await expect(panel.getByText(/more learned word/i)).toBeVisible();
  });

  test('a level above you is a dimmed preview, never an open shelf', async ({ page }) => {
    await serveStories(page, [LEVEL_2_STORY, LEVEL_3_STORY]);
    await page.goto('/stories');
    await page.getByRole('tab', { name: /HSK 3/ }).click();
    await expect(page.getByText(/HSK 3 opens when you get there/i)).toBeVisible();
    // Its cover is on screen — but as a preview card, not something to open.
    await expect(page.getByRole('tabpanel').getByText('新的一年')).toBeVisible();
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /新的一年/ })).toHaveCount(0);
  });
});

test.describe('Story library — edges', () => {
  test('current level has no stories of its own — the rail still opens on a full shelf', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('no stories anywhere — a calm empty state, no broken shelf', async ({ page }) => {
    await serveStories(page, []);
    await page.goto('/stories');
    await expect(page.getByText('This shelf is empty')).toBeVisible();
  });

  test('a third level joins the rail without displacing 1 or 2', async ({ page }) => {
    await serveTrackLevel(page, 3);
    await serveStories(page, [LEVEL_1_STORY, LEVEL_2_STORY, LEVEL_3_STORY]);
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // Opens on the learner's own level, which now has a story.
    await expect(panel.getByRole('button', { name: /新的一年/ })).toBeVisible();
    await page.getByRole('tab', { name: /HSK 2/ }).click();
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    await page.getByRole('tab', { name: /HSK 1/ }).click();
    await expect(panel.getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('tab', { name: /HSK 2/ })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
