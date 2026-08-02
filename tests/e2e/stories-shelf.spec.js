import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library follows a streaming-shelf rhythm: one featured story,
// then horizontal rows for top picks, earlier levels, practice, and the next
// locked level. One card represents a series or standalone story, with the
// useful "% known" signal preserved and tier locks kept inline.
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

test.describe('Story library — cinematic shelves', () => {
  test.describe.configure({ mode: 'serial' });
  test('leads with one feature and calm horizontal rows', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Featured for you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'More stories you can read' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Read status' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Format' })).toHaveCount(0);
  });

  test('cards carry a "% known" chip (the sort the shelf is built on)', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByText(/% known/).first()).toBeVisible();
  });

  test('practice formats sit in their own section', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Practice through stories' })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友的问题.*Practice/ })).toBeVisible();
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
    await page.getByRole('button', { name: /老朋友/ }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('a story URL survives refresh and browser Back returns to the shelf', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /公园里的下午/ }).click();
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
    await expect(page.getByRole('heading', { name: 'Coming up in HSK 3' })).toBeVisible();
    await expect(page.getByText(/Unlocks when you pass the HSK 2 test/)).toBeVisible();
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('Coming up in HSK 3')).toBeGreaterThan(headings.indexOf('Top picks for you'));
  });

  test('desktop shelves have accessible paging controls', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: 'Scroll Top picks for you right' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scroll Top picks for you left' })).toBeVisible();
  });

  test('current level has no stories of its own — a lower level still shows', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: '老朋友 · HSK 1 · Story', exact: true })).toBeVisible();
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
    await expect(page.getByRole('button', { name: '新的一年 · HSK 3 · Story', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /老朋友/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'More stories you can read' })).toBeVisible();
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const rails = page.getByTestId('story-shelf-rail');
    const railCount = await rails.count();
    expect(railCount).toBeGreaterThan(0);
    const firstRailOverflow = await rails.nth(0).evaluate(el => el.scrollWidth - el.clientWidth);
    expect(firstRailOverflow).toBeGreaterThan(0);
  });
});
