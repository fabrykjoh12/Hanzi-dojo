import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library: series-first browsing, SERIES → CHAPTER → READER.
// A Continue-reading card leads (resolved by storyContinue.js), then vertical
// poster grids: the current level's series, short reads, practice (clearly
// secondary), passed levels collapsed to a two-poster preview behind See all,
// and the next level as a small locked teaser strip. A multi-chapter series
// opens a detail page with a chapter list; chapter 1 is free and later
// chapters unlock one per completed flashcard session.
//
// Fixture: track.current_level = 2; level-2 tier-1 stories (st1 + practice),
// level-1 stories (st5 tier 3, st6 manhua, the ml1–ml3 series), and one HSK 3
// manhua (the teaser).
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

// Serve story_reads rows (GET only) — the chapter/reward specs need a learner
// with history, and the shared mock's default is an empty table.
async function serveReads(page, rows) {
  await page.route('**/rest/v1/story_reads**', async (route) => {
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

// Passed levels collapse behind "See all" — a started series can sort out of
// the two-poster preview, so expand before grid lookups that need the rest.
async function expandLevels(page) {
  await page.getByTestId('poster-grid').first().waitFor({ state: 'visible' });
  for (let i = 0; i < 8; i += 1) {
    const seeAll = page.getByRole('button', { name: /See all \d+/ }).first();
    if ((await seeAll.count()) === 0) break;
    await seeAll.click();
  }
}

test.describe('Story library — poster grids', () => {
  test.describe.configure({ mode: 'serial' });
  test('leads with the Continue card and level sections — and no back button', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
    // The one object above the grids: the Continue card (Start-here state for
    // a learner with no series going).
    await expect(page.locator('button[data-continue-card]')).toBeVisible();
    // Earlier levels get their own named sections.
    await expect(page.getByRole('heading', { name: 'HSK 1', exact: true })).toBeVisible();
    // The old filter chips are gone — badges and sections carry the formats.
    await expect(page.getByRole('group', { name: 'Filter stories' })).toHaveCount(0);
    // Stories is a primary destination — the artificial back button is gone.
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  });

  test('posters carry readability in the meta line, not as a chip on the art', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByText(/% readable/).first()).toBeVisible();
    await expect(page.getByText(/% known/)).toHaveCount(0);
  });

  test('practice sits in its own clearly-secondary section with badges', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /朋友的问题/ }).first()).toBeVisible();
  });

  test('standalone manhua live in Short reads with a Manhua badge — no duplicate rail', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Short reads' })).toBeVisible();
    // The HSK 3 inkbound episode is level-2 in this fixture and standalone.
    await expect(page.getByRole('heading', { name: 'Manhua', exact: true })).toHaveCount(0);
    await expect(page.getByText('Manhua', { exact: true }).first()).toBeVisible();
  });

  test('a tier the learner has not reached locks INLINE on the card', async ({ page }) => {
    await serveStories(page, [LEVEL_2_STORY, LOCKED_TIER_STORY]);
    await page.goto('/stories');
    const lockedCard = page.getByRole('button', { name: /还没到的故事/ });
    await expect(lockedCard).toBeVisible();
    await expect(lockedCard).toBeDisabled();
    await expect(page.getByText(/Learn \d+ more words?/).first()).toBeVisible();
  });

  test('a passed level’s standalone story opens straight into the reader', async ({ page }) => {
    await page.goto('/stories');
    // st5 is HSK 1 tier 3 — locked at HSK 2’s thresholds, but the level is
    // passed, so it reads. A single story never detours through a series page.
    await page.getByTestId('poster-grid').getByRole('button', { name: /老朋友/ }).first().click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('a story URL survives refresh and browser Back returns to the shelf', async ({ page }) => {
    await page.goto('/stories');
    await page.getByTestId('poster-grid').getByRole('button', { name: /公园里的下午/ }).first().click();
    await expect(page).toHaveURL('/stories/st1');
    await page.reload();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
  });

  test('the next level appears as a locked teaser strip at the end', async ({ page }) => {
    await page.goto('/stories');
    // The fixture has an HSK 3 manhua; the learner is at HSK 2.
    await expect(page.getByRole('heading', { name: 'Coming up in HSK 3' })).toBeVisible();
    await expect(page.getByText(/Unlocks when you pass the HSK 2 test/)).toBeVisible();
    await expect(page.getByText(/1 story waiting/)).toBeVisible();
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('Coming up in HSK 3')).toBe(headings.length - 1);
  });

  test('an earlier level collapses to a preview behind See all', async ({ page }) => {
    await page.goto('/stories');
    const seeAll = page.getByRole('button', { name: /See all \d+/ });
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveAttribute('aria-expanded', 'false');
    await seeAll.click();
    await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    // The full HSK 1 set is now on the page — including the derived series.
    await expect(page.getByTestId('poster-grid').getByRole('button', { name: /月下的朋友/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Show less' }).click();
    await expect(page.getByRole('button', { name: /See all \d+/ })).toBeVisible();
  });

  test('current level has no stories of its own — a lower level still shows', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    await expect(page.getByTestId('poster-grid').getByRole('button', { name: /老朋友/ }).first()).toBeVisible();
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
    await expect(page.getByText('HSK 3', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('poster-grid').getByRole('button', { name: /新的一年/ }).first()).toBeVisible();
    await expect(page.getByTestId('poster-grid').getByRole('button', { name: /公园里的下午/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HSK 2', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HSK 1', exact: true })).toBeVisible();
  });

  test('reads on a phone-width viewport without horizontal overflow — grids, not rails', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Short reads' })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // Vertical grids: nothing scrolls sideways inside its own box.
    const grids = page.getByTestId('poster-grid');
    const gridCount = await grids.count();
    expect(gridCount).toBeGreaterThan(0);
    for (let i = 0; i < gridCount; i += 1) {
      const inner = await grids.nth(i).evaluate(el => el.scrollWidth - el.clientWidth);
      expect(inner).toBeLessThanOrEqual(1);
    }
  });
});

// The series → chapter architecture: a multi-chapter poster opens a detail
// page (never straight into the reader), chapter 1 is free, later chapters
// wait behind flashcard sessions, and the primary CTA tracks progress.
test.describe('Series detail — chapters and unlocks', () => {
  test.describe.configure({ mode: 'serial' });

  test('a series poster opens the detail page with a chapter list', async ({ page }) => {
    await page.goto('/stories');
    await page.getByTestId('poster-grid').getByRole('button', { name: /月下的朋友 · 3 chapters/ }).first().click();
    await expect(page).toHaveURL(/\/stories\/series\//);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await expect(page.getByText('3 chapters').first()).toBeVisible();
    // Chapter 1 free; 2 waits behind a session; 3 is simply locked (the hint
    // sentence appears once, on the first locked row).
    await expect(page.getByRole('button', { name: /Chapter 1 · 月下的朋友 · up next/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chapter 2 · 学校的晚上 · locked/ })).toBeDisabled();
    await expect(page.getByText('Complete a flashcard session to unlock')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Start story' })).toBeVisible();
  });

  test('chapter 1 opens into the reader; a locked chapter does not open', async ({ page }) => {
    await page.goto('/stories');
    await page.getByTestId('poster-grid').getByRole('button', { name: /月下的朋友 · 3 chapters/ }).first().click();
    // Locked chapter: inert.
    await page.getByRole('button', { name: /Chapter 2 · 学校的晚上/ }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    // Chapter 1: opens the reader (asserted by URL — the featured hero's CTA
    // can also read "Start reading", so the button alone is ambiguous).
    await page.getByRole('button', { name: /Chapter 1 · 月下的朋友/ }).click();
    await expect(page).toHaveURL('/stories/ml1');
    await expect(page.getByRole('heading', { name: 'Chapters' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start reading/i }).first()).toBeVisible();
  });

  test('with chapter 1 read, the CTA turns into the flashcard unlock and the card carries the reward', async ({ page }) => {
    await serveReads(page, [{ story_id: 'ml1', read_at: '2026-08-01T10:00:00.000Z' }]);
    // A non-empty unlocks table (some unrelated story) so the one-time
    // grandfathering seed doesn't fire and chapter 2 stays honestly locked.
    await page.route('**/rest/v1/story_unlocks**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify([{ story_id: 'st5' }]),
      });
    });
    await page.goto('/stories');
    // The Continue card is now today's story reward for the active series.
    await expect(page.locator('button[data-continue-card="session-locked"]')).toBeVisible();
    await expect(page.getByText('Complete today’s session to unlock')).toBeVisible();
    // The series page CTA points at flashcards, not a chapter. A started
    // series poster states the learner's position, not the raw size.
    await expandLevels(page);
    await page.getByTestId('poster-grid').getByRole('button', { name: /月下的朋友 · Chapter 2 of 3/ }).first().click();
    await expect(page.getByRole('button', { name: /Review flashcards to unlock chapter 2/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chapter 1 · 月下的朋友 · read/ })).toBeVisible();
  });

  test('an unlocked chapter row opens; progress reads honestly', async ({ page }) => {
    await serveReads(page, [{ story_id: 'ml1', read_at: '2026-08-01T10:00:00.000Z' }]);
    await page.route('**/rest/v1/story_unlocks**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify([{ story_id: 'ml2' }]),
      });
    });
    await page.goto('/stories');
    await expandLevels(page);
    await page.getByTestId('poster-grid').getByRole('button', { name: /月下的朋友 · Chapter 2 of 3/ }).first().click();
    await expect(page.getByText('1 / 3 chapters read')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue chapter 2/ })).toBeVisible();
    await page.getByRole('button', { name: /Chapter 2 · 学校的晚上 · up next/ }).click();
    await expect(page).toHaveURL('/stories/ml2');
    await expect(page.getByRole('button', { name: /Start reading/i }).first()).toBeVisible();
  });
});
