import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The five states TODAY can rest in, each rendered from persisted learning
// state (cards / story reads / grammar reviews) — never client-side flags.
// Today holds exactly one object at a time; the other steps are reported in the
// overview sheet, not printed around it.

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
      daily_activity: [{ activity_date: new Date().toISOString().slice(0, 10), studied_cards: 7 }],
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

    // Whatever the state, navigation stays: Today is session-first, never
    // session-forced.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    if (state === 'cards') {
      // Today IS the actual first flashcard: the prepared session's opening
      // word, the session contents beneath it, one tap to start.
      const card = page.getByRole('button', { name: 'Start cards' });
      await expect(card).toBeEnabled();
      await expect(card.getByText(/1 review · /)).toBeVisible();
      await expect(card.locator('span[lang]').first()).toHaveText('我们');
    } else {
      // Cards are done and simply gone from the screen — no "✓ done" row.
      // (The caught-up state says "Nothing due right now." as its own headline,
      // which is the object Today is resting on, not a status row about cards.)
      await expect(page.getByRole('button', { name: 'Start cards' })).toHaveCount(0);
      if (state !== 'caught-up') {
        await expect(page.getByText('Nothing due right now')).toHaveCount(0);
      }
    }
    if (state === 'story') {
      await expect(page.getByRole('button', { name: /Open 我们的歌/ })).toBeEnabled();
      await expect(page.getByText('Start reading')).toBeVisible();
    }
    if (state === 'practice') {
      const prompt = page.getByRole('button', { name: /Grammar review/ });
      await expect(prompt).toBeEnabled();
      await expect(page.getByText(/pattern.* from this week’s reading/)).toBeVisible();
    }
    if (state === 'complete') {
      await expect(page.getByText('Done for today.')).toBeVisible();
      // Only what actually happened, from the day's own activity row.
      await expect(page.getByText('7 cards · 1 story')).toBeVisible();
    }
    if (state === 'caught-up') {
      await expect(page.getByRole('button', { name: /Open the story shelf/ })).toBeEnabled();
      await expect(page.getByText('Nothing due right now.')).toBeVisible();
    }
  });
}

test('the overview reports every step, whichever one Today is resting on', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installHomeState(page, 'story');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open today’s overview' }).click();
  const sheet = page.getByRole('dialog', { name: 'Today overview' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Cards')).toBeVisible();
  await expect(sheet.getByText('Done', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Up now')).toBeVisible();
  await expect(sheet.getByText('After your story')).toBeVisible();
});
