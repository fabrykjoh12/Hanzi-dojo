import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

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

const STATES = [
  { key: 'cards', header: /Cards first|\d+ min/ },
  { key: 'story', header: 'Story ready' },
  { key: 'practice', header: 'Practice ready' },
  { key: 'complete', header: 'Complete' },
  { key: 'caught-up', header: 'Caught up' },
];

for (const state of STATES) {
  test(`${state.key} renders from persisted learning state`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installHomeState(page, state.key);
    await page.goto('/');
    const home = page.locator('[data-home-stage]');
    await expect(home).toHaveAttribute('data-home-stage', state.key);
    await expect(home.locator('header p')).toHaveText(state.header);

    const hero = page.getByRole('region', { name: 'Cards' });
    const expectedHeight = state.key === 'cards' ? 234 : 226;
    expect(Math.round((await hero.boundingBox()).height)).toBe(expectedHeight);

    if (state.key === 'cards') {
      await expect(page.getByRole('button', { name: 'Start cards' })).toBeEnabled();
      await expect(page.getByText('Finish cards to unlock')).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Cards complete' })).toBeDisabled();
    }
    if (state.key === 'story') {
      await expect(page.getByText('Ready to read')).toBeVisible();
      await expect(page.getByRole('button', { name: /Open 我们的歌/ })).toBeEnabled();
    }
    if (state.key === 'practice') {
      await expect(page.getByText('Story complete')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Grammar review' })).toBeEnabled();
    }
    if (state.key === 'complete') await expect(page.getByText('Complete for today')).toBeVisible();
    if (state.key === 'caught-up') {
      await expect(page.getByText('Open the story shelf')).toBeVisible();
      await expect(page.getByText('Nothing due', { exact: true })).toBeVisible();
    }
  });
}
