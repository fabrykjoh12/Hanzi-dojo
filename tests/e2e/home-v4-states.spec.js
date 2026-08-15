import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home V4 states: the daily rhythm is shown by emphasis, never by locks.
// Each persisted learning state produces the right panel copy and marks the
// right row as "Next" — and every control stays enabled in every state.

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

    const panel = page.getByRole('region', { name: 'Cards' });
    const upNext = page.getByRole('region', { name: 'Up next' });

    if (state === 'cards') {
      // Work waiting: the panel carries the count and no row says "Next" yet.
      await expect(panel.getByText('1 card')).toBeVisible();
      await expect(upNext.getByText('Next')).toHaveCount(0);
    } else {
      // Queue clear: the panel steps back to a quiet check.
      await expect(panel.getByText('All clear')).toBeVisible();
      await expect(panel.getByText('Nothing due right now')).toBeVisible();
    }

    if (state === 'story') {
      await expect(upNext.getByText('我们的歌')).toBeVisible();
      await expect(upNext.getByText('Next')).toHaveCount(1);
    }
    if (state === 'practice') {
      // Story read, grammar due: Practice is the marked next step.
      await expect(upNext.getByText('Read', { exact: true })).toBeVisible();
      await expect(upNext.getByText('Next')).toHaveCount(1);
    }
    if (state === 'complete') {
      await expect(upNext.getByText('Read', { exact: true })).toBeVisible();
      await expect(upNext.getByText('Next')).toHaveCount(0);
    }
    if (state === 'caught-up') {
      await expect(upNext.getByText('Open the story shelf')).toBeVisible();
    }

    // The rhythm is order, never locks: every control stays enabled.
    const buttons = home.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      await expect(buttons.nth(i)).toBeEnabled();
    }
  });
}
