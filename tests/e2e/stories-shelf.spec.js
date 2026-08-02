import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library is ONE flat page of level sections (no tier tabs): the
// learner's current level first, then earlier levels, each a grid with one
// card per series / standalone story sorted most-readable first, practice
// formats in their own group, and the NEXT level as a locked teaser at the
// end. Tier locks render inline on cards ("Learn N more words"), never as a
// separate wall.
//
// Fixture: track.current_level = 2; level-2 tier-1 stories (st1 + practice),
// level-1 stories (st5 tier 3, st6 tier 1, manhua), and one HSK 3 manhua
// (the teaser).
const LEVEL_1_STORY = {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
};

// Narrow the stories table to a specific set for one test (GET only — anything
// else falls through to the shared mock). NOTE: this serves the SAME rows to
// both shelf queries (reachable levels and the next-level teaser); the teaser
// builder filters to its own level, so extra rows are ignored.
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
  id: 'st6b', language: 'chinese', system: 'hsk', level: 3, tier: 1, story_number: 1,
  title: '新的一年', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'A new year.',
  content: ['今年是新的一年。', '我们很高兴。'].join('\n'),
};
// A tier the HSK 2 learner has not reached — its card must show the inline lock.
const LOCKED_TIER_STORY = {
  id: 'st-locked', language: 'chinese', system: 'hsk', level: 2, tier: 3, story_number: 9,
  title: '还没到的故事', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'Not yet.',
  content: ['以后再看。'].join('\n'),
};

test.describe('Story library — flat shelf', () => {
  test('level sections replace the tier tabs, current level first', async ({ page }) => {
    await page.goto('/stories');
    // No tab bar anywhere.
    await expect(page.getByRole('tab', { name: /First Steps/ })).toHaveCount(0);
    // Sections: HSK 2 (current, marked) and HSK 1, in that order, each with an
    // honest read count.
    await expect(page.getByRole('heading', { name: 'HSK 2', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HSK 1', exact: true })).toBeVisible();
    await expect(page.getByText('Your level')).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ read/).first()).toBeVisible();
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('HSK 2')).toBeLessThan(headings.indexOf('HSK 1'));
  });

  test('cards carry a "% known" chip (the sort the shelf is built on)', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByText(/% known/).first()).toBeVisible();
  });

  test('practice formats sit in their own section', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Practice Scenarios' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
  });

  test('a tier the learner has not reached locks INLINE on the card', async ({ page }) => {
    await serveStories(page, [LEVEL_2_STORY, LOCKED_TIER_STORY]);
    await page.goto('/stories');
    const lockedCard = page.getByRole('button', { name: /还没到的故事/ });
    await expect(lockedCard).toBeVisible();
    await expect(lockedCard).toBeDisabled();
    await expect(page.getByText(/Learn \d+ more words?/)).toBeVisible();
  });

  test('a passed level’s story stays readable and opens straight into the reader', async ({ page }) => {
    await page.goto('/stories');
    // st5 is HSK 1 tier 3 — locked at HSK 2’s thresholds, but the level is
    // passed, so it reads. One tap, straight to the reader.
    await page.getByRole('region', { name: 'HSK 1' }).getByRole('button', { name: 'HSK 1', exact: true }).click();
    await page.getByRole('region').getByRole('button', { name: /老朋友/ }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('a story URL survives refresh and browser Back returns to the shelf', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('region').getByRole('button', { name: /公园里的下午/ }).click();
    await expect(page).toHaveURL('/stories/st1');
    await page.reload();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
  });

  test('the next level appears as a locked teaser at the end', async ({ page }) => {
    await page.goto('/stories');
    // The fixture has an HSK 3 manhua; the learner is at HSK 2.
    await expect(page.getByRole('heading', { name: 'HSK 3', exact: true })).toBeVisible();
    await expect(page.getByText(/Unlocks when you pass the HSK 2 test/)).toBeVisible();
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('HSK 3')).toBeGreaterThan(headings.indexOf('HSK 1'));
  });

  test('the filter row narrows by format', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Practice' }).click();
    await expect(page.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(page.getByRole('region').getByRole('button', { name: /公园里的下午/ })).toHaveCount(0);
  });

  test('current level has no stories of its own — a lower level still shows', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    await page.getByRole('region', { name: 'HSK 1' }).getByRole('button', { name: 'HSK 1', exact: true }).click();
    await expect(page.getByRole('region').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('no stories anywhere — a calm empty state, no broken shelf', async ({ page }) => {
    await serveStories(page, []);
    await page.goto('/stories');
    await expect(page.getByText('No stories yet')).toBeVisible();
  });

  test('a third level (HSK 3) joins the one-page shelf without displacing 1 or 2', async ({ page }) => {
    await serveTrackLevel(page, 3);
    await serveStories(page, [LEVEL_1_STORY, LEVEL_2_STORY, LEVEL_3_STORY]);
    await page.goto('/stories');
    await expect(page.getByText(/hsk · HSK 3/i)).toBeVisible();
    // ONE page, three sections — no tab switching.
    await expect(page.getByRole('region').getByRole('button', { name: /新的一年/ })).toBeVisible();
    await page.getByRole('region', { name: 'HSK 2' }).getByRole('button', { name: 'HSK 2', exact: true }).click();
    await page.getByRole('region', { name: 'HSK 1' }).getByRole('button', { name: 'HSK 1', exact: true }).click();
    await expect(page.getByRole('region').getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    await expect(page.getByRole('region').getByRole('button', { name: /老朋友/ })).toBeVisible();
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('HSK 3')).toBeLessThan(headings.indexOf('HSK 2'));
    expect(headings.indexOf('HSK 2')).toBeLessThan(headings.indexOf('HSK 1'));
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'HSK 2', exact: true })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
