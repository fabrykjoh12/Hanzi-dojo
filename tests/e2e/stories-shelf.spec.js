import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library: a poster shelf organised as SERIES → CHAPTER → READER.
// One featured hero, filter chips, then horizontal poster rails (top picks,
// earlier levels, manhua, practice, the next locked level). A multi-chapter
// series opens a detail page with a chapter list; chapter 1 is free and later
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

test.describe('Story library — poster shelves', () => {
  test.describe.configure({ mode: 'serial' });
  test('leads with one hero, filter chips, and level rows — and no back button', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Featured for you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toBeVisible();
    // Earlier levels get their own named rows now.
    await expect(page.getByRole('heading', { name: 'HSK 1', exact: true })).toBeVisible();
    // Filter chips replace the old status/format groups.
    await expect(page.getByRole('group', { name: 'Filter stories' })).toBeVisible();
    // Stories is a primary destination — the artificial back button is gone.
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  });

  // The reading share lives ON the artwork — device-reviewed twice. The old
  // floating capsule went in P10-C1; the text line under the title that replaced
  // it stacked three captions under every poster and the build-38 device review
  // rejected that too. It is now compact text over a bottom scrim: on the cover,
  // but never a pill, and the caption under the title stays two lines.
  test('cards say what share of the words the reader knows, on the artwork', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByText(/% known/).first()).toBeVisible();
    const marks = await page.evaluate(() => Array.from(
      document.querySelectorAll('#main-content *'))
      .filter((el) => (el.textContent || '').indexOf('% known') !== -1)
      .filter((el) => el.children.length === 0)
      .map((el) => {
        const cs = getComputedStyle(el);
        const cover = el.closest('[style*="aspect-ratio"]');
        return {
          radius: parseFloat(cs.borderTopLeftRadius) || 0,
          pos: cs.position,
          onCover: Boolean(cover),
        };
      }));
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      expect(m.radius).toBeLessThan(6);   // text over a scrim, never a capsule
      expect(m.pos).toBe('absolute');     // on the artwork, not a caption row
      expect(m.onCover).toBe(true);
    }
  });

  test('practice formats sit in their own section', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Practice through stories' })).toBeVisible();
    // The section heading gives the framing; the card names the actual format,
    // which is more specific than the "Practice" bucket it used to repeat.
    await expect(page.getByRole('button', { name: /朋友的问题.*Chat/ }).first()).toBeVisible();
  });

  // The format used to be announced twice on a manhua card — a capsule on the
  // artwork and a word in the meta row — and once on every prose card, which is
  // the default and needs no announcement at all (P10-C1).
  test('names a format only when it is not the usual prose', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: /《末班车》.*Manhua/ }).first()).toBeVisible();
    await expect(page.getByText(/·\s*Story\s*·/)).toHaveCount(0);
  });

  test('manhua get their own discoverable rail', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Manhua', exact: true })).toBeVisible();
  });

  test('the Manhua filter chip narrows the shelf to manhua', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('group', { name: 'Filter stories' }).getByRole('button', { name: 'Manhua' }).click();
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Manhua', exact: true })).toBeVisible();
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
    await page.getByRole('button', { name: /老朋友/ }).first().click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('a story URL survives refresh and browser Back returns to the shelf', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /公园里的下午/ }).first().click();
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
    // "· Story" left the label with the rest of the default-format noise (P10-C1);
    // the card names its level and its length, and says nothing about being prose.
    await expect(page.getByRole('button', { name: /老朋友 · HSK 1/ }).first()).toBeVisible();
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
    // Was `/hsk · HSK 3/i` — which pinned a DEFECT. The fixture's track carries
    // `system: 'hsk'`, an enum `getSystemLabel` does not recognise, and it used
    // to print that raw value into the eyebrow. It returns '' now and `metaLine`
    // drops the empty part (P10-A7), so the level stands alone.
    await expect(page.getByText(/^HSK 3$/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /新的一年 · HSK 3/ }).first()).toBeVisible();
    // .first(): the per-day featured pick may double one of these stories
    // (hero + its shelf row) — any visible instance is what's being asserted.
    await expect(page.getByRole('button', { name: /公园里的下午/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /老朋友/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top picks for you' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HSK 2', exact: true })).toBeVisible();
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

// The series → chapter architecture: a multi-chapter poster opens a detail
// page (never straight into the reader), chapter 1 is free, later chapters
// wait behind flashcard sessions, and the primary CTA tracks progress.
test.describe('Series detail — chapters and unlocks', () => {
  test.describe.configure({ mode: 'serial' });

  test('a series poster opens the detail page with a chapter list', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
    await expect(page).toHaveURL(/\/stories\/series\//);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    // Scoped to the visible one: the shelf stays MOUNTED underneath the pushed
    // series page now (it is a real navigation stack), so its copy of this text
    // is still in the DOM — hidden, and first in document order.
    await expect(page.getByText('3 chapters').filter({ visible: true }).first()).toBeVisible();
    // Chapter 1 free; 2 waits behind a session; 3 is simply locked (the hint
    // sentence appears once, on the first locked row).
    await expect(page.getByRole('button', { name: /Chapter 1 · 月下的朋友 · up next/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chapter 2 · 学校的晚上 · locked/ })).toBeDisabled();
    await expect(page.getByText('Complete a flashcard session to unlock')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Start story' })).toBeVisible();
  });

  test('chapter 1 opens into the reader; a locked chapter does not open', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
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

  test('with chapter 1 read, the CTA turns into the flashcard unlock and the hero carries the reward', async ({ page }) => {
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
    // The hero is now today's story reward for the active (most recent) series.
    await expect(page.getByRole('button', { name: /Today’s story reward/ })).toBeVisible();
    await expect(page.getByText('Complete your flashcards to unlock')).toBeVisible();
    // The series page CTA points at flashcards, not a chapter.
    await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
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
    await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
    await expect(page.getByText('1 / 3 chapters read')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue chapter 2/ })).toBeVisible();
    await page.getByRole('button', { name: /Chapter 2 · 学校的晚上 · up next/ }).click();
    await expect(page).toHaveURL('/stories/ml2');
    await expect(page.getByRole('button', { name: /Start reading/i }).first()).toBeVisible();
  });
});
