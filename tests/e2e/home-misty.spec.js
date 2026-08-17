import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';

// The Misty Atmosphere Home (P1): header greeting + level pill, the
// three-step learning journey, and the Story Reward section. These pin the
// redesign's structural contract — truthful data, one primary action, no
// overflow, nothing trapped behind the floating dock — not pixels.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
  'content-range': '0-0/*',
};

test.describe('Misty Home structure', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    home = new HomePage(page);
    await home.goto();
  });

  test('renders the header greeting and the level pill on one line', async ({ page }) => {
    // Greeting: the language's hello plus the profile's real first name.
    const greeting = page.getByText('你好, Test');
    await expect(greeting).toBeVisible();
    // Pill: level + progress, one logical line, no wrap at 390px.
    const pill = page.getByText(/^HSK 2 · \d+%$/);
    await expect(pill).toBeVisible();
    const box = await pill.boundingBox();
    expect(box.height).toBeLessThan(40);
    // No streak in the pill or anywhere on Home.
    await expect(page.getByText(/streak/i)).toHaveCount(0);
  });

  test('renders Today’s Learning as a three-step journey with one current step', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Today’s Learning' })).toBeVisible();
    const steps = page.locator('[data-journey-step]');
    await expect(steps).toHaveCount(3);
    await expect(page.locator('[data-step-status="current"]')).toHaveCount(1);
    // Completed / current / upcoming are distinguishable states in the DOM.
    await expect(page.locator('[data-journey-step="cards"]')).toHaveAttribute('data-step-status', 'current');
    await expect(page.locator('[data-journey-step="story"]')).toHaveAttribute('data-step-status', 'upcoming');
    await expect(page.locator('[data-journey-step="practice"]')).toHaveAttribute('data-step-status', 'upcoming');
  });

  test('the focus card shows real session words and the honest estimate', async ({ page }) => {
    const desk = home.desk;
    await expect(desk).toBeVisible();
    // Words come from the prepared queue — wait for the sample to arrive.
    const words = desk.locator('span[lang]');
    await expect(words.first()).not.toBeEmpty();
    expect(await words.count()).toBeLessThanOrEqual(4);
    // The estimate is queue-derived ("~N min"), never a hard-coded range.
    await expect(desk.getByText(/~\d+ min/)).toBeVisible();
    // The mockup's placeholder copy never ships.
    await expect(page.getByText(/Practice stroke order/i)).toHaveCount(0);
    await expect(page.getByText(/10-15 min/)).toHaveCount(0);
    await expect(page.getByText('Unit 4')).toHaveCount(0);
  });

  test('the Story Reward section shows the real story, locked behind cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Story Reward' })).toBeVisible();
    const rewardCard = page.locator('[data-tour="home-then-read"]');
    await expect(rewardCard).toBeVisible();
    // Locked while cards are due: state, not an action.
    await expect(page.getByText('Unlocks after today’s session')).toBeVisible();
    expect(await rewardCard.evaluate(node => node.tagName)).not.toBe('BUTTON');
    // The section's chevron still reaches the shelf.
    await expect(page.getByRole('button', { name: 'Browse stories' })).toBeVisible();
  });

  test('everything scrolls above the dock — Story Reward sits fully clear of it', async ({ page }) => {
    // Bounding-rect contract, not "the page can scroll": fully scrolled, the
    // reward card's rectangle must sit completely above the dock's rectangle
    // with real breathing room (bottomBar.js CONTENT_GAP, >= 24px).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const rects = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect();
      const reward = document.querySelector('[data-tour="home-then-read"]').getBoundingClientRect();
      return { navTop: nav.top, navLeft: nav.left, navRight: nav.right, rewardBottom: reward.bottom, rewardHeight: reward.height };
    });
    // The card is genuinely on screen (not scrolled out) and wholly above the
    // dock — no intersection, and at least 24px of air between the two.
    expect(rects.rewardHeight).toBeGreaterThan(100);
    expect(rects.rewardBottom).toBeLessThanOrEqual(rects.navTop - 24);
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}×${viewport.height}: no horizontal overflow, no clipped journey`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = new HomePage(page);
    await home.goto();
    // The sample words render before we measure — they are the widest content.
    await expect(home.desk.locator('span[lang]').first()).not.toBeEmpty();
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    // The word row itself stays inside the focus card (no clipped Hanzi),
    // and the preview stays premium: with several words shown, none renders
    // below the 34px floor — narrow widths drop words instead of shrinking.
    const row = await home.desk.evaluate(node => {
      const words = [...node.querySelectorAll('span[lang]')];
      const card = node.getBoundingClientRect();
      return {
        count: words.length,
        fontSize: words.length ? parseFloat(getComputedStyle(words[0]).fontSize) : 0,
        fits: words.every(w => {
          const r = w.getBoundingClientRect();
          return r.left >= card.left && r.right <= card.right + 0.5;
        }),
      };
    });
    expect(row.fits).toBe(true);
    if (row.count > 1) expect(row.fontSize).toBeGreaterThanOrEqual(34);
    if (viewport.width <= 320) expect(row.count).toBeLessThanOrEqual(3);
  });
}

test('story stage: the reward card is the single primary action', async ({ page }) => {
  // Queue clear, story unread → the reward card unlocks and opens the story.
  const cards = [{
    id: 'c1', user_id: '00000000-0000-4000-8000-000000000001', vocab_id: 'v1',
    state: 'review', due_at: '2099-01-01T00:00:00.000Z',
    created_at: '2020-01-01T00:00:00.000Z', learned: true, is_easy: false,
    stability: 20, lapses: 0,
  }];
  const story = [{
    id: 'published-our-song', title: '6. 我们的歌', content: '我们一起唱歌。',
    level: 1, tier: 1, story_number: 12, is_published: true, cover_url: null,
  }];
  await page.route('**/mock.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
    const rows = {
      cards,
      vocabulary: [{ id: 'v1', word: '我们', reading: 'wǒmen', meaning: 'we', level: 1 }],
      stories: story,
      story_reads: [],
      grammar_reviews: [],
      daily_activity: [],
    }[table];
    if (rows === undefined) return route.fallback();
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(rows) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-home-stage', 'story');
  // No cover art → the misty fallback still renders a complete, tappable card.
  const open = page.getByRole('button', { name: /Open 我们的歌/ });
  await expect(open).toBeEnabled();
  await expect(open.locator('svg').first()).toBeVisible();
  await expect(page.getByText('Start reading')).toBeVisible();
  // Exactly one primary action on the whole screen.
  await expect(page.getByRole('button', { name: 'Start cards' })).toHaveCount(0);
  await expect(page.locator('[data-step-status="current"]')).toHaveCount(1);
  // The journey step points at the reward card rather than repeating its
  // title — the story appears as one object, not two competing cards.
  const storyStep = page.locator('[data-journey-step="story"]');
  await expect(storyStep.getByText('Story unlocked')).toBeVisible();
  await expect(storyStep.getByText('我们的歌')).toHaveCount(0);
  await expect(page.getByText('我们的歌')).toHaveCount(1);
});
