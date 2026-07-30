import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library groups a CUMULATIVE shelf under tier tabs (First Steps /
// Growing / Fluent). Each tab shows that tier's stories across every level the
// learner has reached — grouped into arcs, with practice formats in their own
// section — and a locked tab states how many more words open it.
//
// Fixture: track.current_level = 2; four level-2 tier-1 stories (one paced
// narrative + three practice formats) and one level-1 tier-3 story ("老朋友").
const LEVEL_1_STORY = {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
};

// Narrow the stories table to a specific set for one test (GET only — anything
// else falls through to the shared mock).
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

// A level-2 tier-1 story (mirrors the default fixture's "st1") and a level-3
// (HSK 3) tier-1 story, used together to exercise a THIRD level on the
// cumulative shelf without displacing the existing level-1/level-2 coverage.
const LEVEL_2_STORY = {
  id: 'st1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '公园里的下午', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An afternoon at the park.',
  content: ['今天天气很好。', '小明：我们去公园吧！', '朋友：你看，花很好！'].join('\n'),
};
const LEVEL_3_STORY = {
  id: 'st6', language: 'chinese', system: 'hsk', level: 3, tier: 1, story_number: 1,
  title: '新的一年', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'A new year.',
  content: ['今年是新的一年。', '我们很高兴。'].join('\n'),
};

test.describe('Story library — tier tabs', () => {
  test('one tab bar replaces the old progress bar + ladder', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('tab', { name: /First Steps/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Growing/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Fluent/ })).toBeVisible();
    // The overall unlock % is a small label in the same bar, not a separate card.
    await expect(page.getByText(/% of this level unlocked/i)).toBeVisible();
  });

  test('First Steps is open by default; practice formats sit in their own section', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // The narrative story is a card.
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    // Chat / scene / reply stories are pulled out into Practice Scenarios (their
    // cards carry the "Practice" ribbon in the accessible name).
    await expect(panel.getByRole('heading', { name: 'Practice Scenarios' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 下雨天/ })).toBeVisible();
  });

  test('a locked tier shows how many more words open it', async ({ page }) => {
    await page.goto('/stories');
    // Growing is locked at HSK 2 — its tab says so, and selecting it shows the
    // locked panel rather than a dead end.
    await expect(page.getByText(/more word/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /Growing/ }).click();
    await expect(page.getByText('Keep learning to unlock')).toBeVisible();
  });

  test('cumulative shelf: a passed level’s story stays open under its tier tab', async ({ page }) => {
    await page.goto('/stories');
    // HSK 1 (behind the learner) keeps its tier-3 story readable even though the
    // same threshold is still locked at HSK 2 — reached via the Fluent tab.
    await page.getByRole('tab', { name: /Fluent/ }).click();
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('a story card opens straight into the reader (no list drill-in)', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('tab', { name: /Fluent/ }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('the filter row narrows by format', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // Format → Practice hides the narrative card, keeps the practice ones.
    // (Scope to the Format group so the sidebar's "Practice" nav isn't matched.)
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Practice' }).click();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toHaveCount(0);
  });

  test('current level has no stories of its own — a lower level still shows', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    // Default opens the tier that actually has something readable (Fluent → HSK 1).
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('no stories anywhere — a calm empty state, no broken shelf', async ({ page }) => {
    await serveStories(page, []);
    await page.goto('/stories');
    await expect(page.getByText('No stories yet')).toBeVisible();
  });

  test('a third level (HSK 3) joins the cumulative shelf without displacing 1 or 2', async ({ page }) => {
    await serveTrackLevel(page, 3);
    await serveStories(page, [LEVEL_1_STORY, LEVEL_2_STORY, LEVEL_3_STORY]);
    await page.goto('/stories');
    // The header names the learner's real current level (HSK 3), not "undefined".
    await expect(page.getByText(/hsk · HSK 3/i)).toBeVisible();
    // Tier 1 ("First Steps") is open by default and shows the new HSK 3 story,
    // grouped under its own "HSK 3" heading.
    await expect(page.getByRole('heading', { name: 'HSK 3', exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /新的一年/ })).toBeVisible();
    // The HSK 2 tier-1 story a level below is still reachable in the same tab.
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    // The HSK 1 tier-3 story two levels below is reachable via Fluent — nothing lost.
    await page.getByRole('tab', { name: /Fluent/ }).click();
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('tab', { name: /First Steps/ })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
