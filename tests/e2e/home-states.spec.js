import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home's five daily states, each rendered from persisted learning state
// (cards / story reads / grammar reviews) — never client-side flags. The
// primary action reflects the real queue; the story and practice rows below
// reflect their own real state.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
  'content-range': '0-0/*',
};

const VOCAB = [{ id: 'v1', word: '我们', reading: 'wǒmen', meaning: 'we', level: 1 }];
const STORY = [{
  id: 'published-our-song', title: '6. 我们的歌', content: '我们一起唱歌。',
  level: 1, tier: 1, story_number: 12, is_published: true,
  cover_url: '/story-covers/generated/hsk1-12-our-song.webp',
}];

async function installHomeState(page, state) {
  const queueWaiting = state === 'cards';
  const storyAvailable = state !== 'caught-up';
  const storyComplete = state === 'practice' || state === 'complete';
  const cards = [{
    id: 'c1', user_id: '00000000-0000-4000-8000-000000000001', vocab_id: 'v1',
    state: 'review', due_at: queueWaiting ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
    created_at: '2020-01-01T00:00:00.000Z', learned: true, is_easy: false,
    stability: 20, lapses: 0,
  }];
  const reads = storyComplete ? [{ story_id: STORY[0].id, read_at: new Date().toISOString() }] : [];
  const grammar = state === 'practice' ? [{ topic_id: 'grammar-review', state: 'new', due_at: new Date().toISOString() }] : [];

  await page.route('**/mock.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
    const rows = {
      cards,
      vocabulary: VOCAB,
      stories: storyAvailable ? STORY : [],
      story_reads: reads,
      grammar_reviews: grammar,
      daily_activity: [],
    }[table];
    if (rows === undefined) return route.fallback();
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(rows) });
  });
}

const STATES = ['cards', 'story', 'practice', 'complete', 'caught-up'];

for (const state of STATES) {
  test(`${state} renders from persisted learning state`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installHomeState(page, state);
    await page.goto('/');
    const home = page.locator('[data-home-stage]');
    await expect(home).toHaveAttribute('data-home-stage', state);

    if (state === 'cards') {
      // The primary action holds the real prepared session: the opening word
      // as a quiet preview, the session's contents, one tap to start.
      const primary = page.getByRole('button', { name: 'Continue learning' });
      await expect(primary).toBeEnabled();
      await expect(primary.getByText(/1 review · /)).toBeVisible();
      await expect(primary.locator('span[lang]').first()).toHaveText('我们');
      await expect(page.getByText('Today’s story · after your cards')).toBeVisible();
    } else {
      // The primary block goes quiet; no start action remains.
      await expect(page.getByRole('button', { name: 'Continue learning' })).toHaveCount(0);
      await expect(page.getByText('All caught up')).toBeVisible();
      await expect(page.getByText('Nothing due right now')).toBeVisible();
    }
    if (state === 'story') {
      await expect(page.getByRole('button', { name: /Open 我们的歌/ })).toBeEnabled();
      await expect(page.getByText('Ready to read')).toBeVisible();
    }
    if (state === 'practice') {
      // The story is done, practice is genuinely due — the row appears.
      await expect(page.getByText('Read today')).toBeVisible();
      await expect(page.getByRole('button', { name: /grammar pattern due/ })).toBeEnabled();
    }
    if (state === 'complete') {
      await expect(page.getByText('Read today')).toBeVisible();
      await expect(page.getByText(/grammar pattern due/)).toHaveCount(0);
    }
    if (state === 'caught-up') {
      await expect(page.getByRole('button', { name: 'Story shelf' })).toBeEnabled();
      await expect(page.getByText('Browse stories at your level')).toBeVisible();
    }
  });
}
