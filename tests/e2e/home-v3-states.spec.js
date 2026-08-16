import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The five daily stages of the "Desk" Home, each rendered from persisted
// learning state (cards / story reads / grammar reviews) — never client-side
// flags. The desk always holds the current step's real object; the other
// steps sit below as quiet status rows.

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
      // The desk holds the actual first flashcard: the prepared session's
      // opening word, the session contents in the footer, one tap to start.
      const desk = page.getByRole('button', { name: 'Start cards' });
      await expect(desk).toBeEnabled();
      await expect(desk.getByText(/1 review · /)).toBeVisible();
      await expect(desk.locator('span[lang]').first()).toHaveText('我们');
      await expect(page.getByText('Finish cards to unlock')).toBeVisible();
      await expect(page.getByText('After your story')).toBeVisible();
    } else {
      // Cards fold into a quiet done-row; no start action remains.
      await expect(page.getByRole('button', { name: 'Start cards' })).toHaveCount(0);
      await expect(page.getByText('Nothing due right now')).toBeVisible();
    }
    if (state === 'story') {
      await expect(page.getByRole('button', { name: /Open 我们的歌/ })).toBeEnabled();
      await expect(page.getByText('Start reading')).toBeVisible();
    }
    if (state === 'practice') {
      await expect(page.getByRole('button', { name: 'Grammar review' })).toBeEnabled();
      await expect(page.getByText(/grammar pattern/)).toBeVisible();
      await expect(page.getByText('Story complete')).toBeVisible();
    }
    if (state === 'complete') {
      await expect(page.getByText('Done for today')).toBeVisible();
      await expect(page.getByText('Complete for today')).toBeVisible();
    }
    if (state === 'caught-up') {
      await expect(page.getByRole('button', { name: 'Open the story shelf' })).toBeEnabled();
      await expect(page.getByText('Nothing due', { exact: true })).toBeVisible();
    }
  });
}
