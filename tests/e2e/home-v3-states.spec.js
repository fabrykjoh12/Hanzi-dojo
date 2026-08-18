import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The daily stages of Home, each rendered from persisted learning state
// (cards / story reads / grammar reviews) — never client-side flags. The hero
// is always the flashcard queue; what changes with the stage is the hero's
// headline and action, and the "Then read" hand-off's status line.

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
    const hero = page.locator('[data-tour="home-queue"]');
    const handoff = page.locator('[data-tour="home-then-read"]');

    if (state === 'cards') {
      // The hero shows the real queue — one due review — and starts it.
      await expect(page.getByRole('button', { name: /Start reviewing — 1 card waiting/ })).toBeEnabled();
      await expect(hero.getByText('Ready to review')).toBeVisible();
      await expect(hero.getByText('1', { exact: true }).first()).toBeVisible();
      await expect(hero.getByText('card waiting')).toBeVisible();
      // The story is the locked next step, named beneath the hero — with its
      // own cover leading the row.
      await expect(handoff.getByText('Then read')).toBeVisible();
      await expect(handoff.getByText('Finish cards to unlock')).toBeVisible();
      await expect(handoff.getByText('我们的歌')).toBeVisible();
      await expect(handoff.locator('img')).toBeVisible();
    } else {
      // The queue is clear: the ✓ replaces the number and the one action is
      // reading — no reviewing button remains.
      await expect(hero.getByText('Queue clear')).toBeVisible();
      await expect(hero.getByText('all caught up')).toBeVisible();
      await expect(page.getByRole('button', { name: /Read a story/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(0);
    }
    if (state === 'story') {
      await expect(handoff.getByText('Ready to read')).toBeVisible();
    }
    if (state === 'practice' || state === 'complete') {
      await expect(handoff.getByText('Story complete')).toBeVisible();
    }
    if (state === 'caught-up') {
      // No story unlocked — the hand-off does not invent one.
      await expect(handoff).toHaveCount(0);
    }
  });
}

test('the hand-off opens today’s story directly once the queue is clear', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installHomeState(page, 'story');
  await page.goto('/');
  await page.locator('[data-tour="home-then-read"]').getByRole('button').click();
  await expect(page).toHaveURL(/\/stories/);
});
