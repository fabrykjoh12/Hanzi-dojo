import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Home is an ink painting with one card resting in it. The card is the one
// control; its copy and states are specified in src/homeCard.js (unit-tested
// there) — these specs prove the rendered screen keeps those promises.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
  'content-range': '0-0/*',
};
const USER_ID = '00000000-0000-4000-8000-000000000001';

// Every vocabulary word already started and nothing due today: the queue is
// clear, with one review landing tomorrow.
async function installClearQueue(page) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  const cards = [
    { id: 'c1', user_id: USER_ID, vocab_id: 'v1', state: 'review', reps: 3, due_at: '2099-01-01T00:00:00.000Z', created_at: '2020-01-01T00:00:00.000Z', learned: true, stability: 20, lapses: 0 },
    { id: 'c2', user_id: USER_ID, vocab_id: 'v1', state: 'review', reps: 3, due_at: tomorrow.toISOString(), created_at: '2020-01-01T00:00:00.000Z', learned: true, stability: 20, lapses: 0 },
  ];
  const vocabulary = [{ id: 'v1', word: '我们', reading: 'wǒmen', meaning: 'we', level: 1 }];
  await page.route('**/mock.supabase.co/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.replace('/rest/v1/', '').split('?')[0];
    const rows = { cards, vocabulary }[table];
    if (rows === undefined) return route.fallback();
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(rows) });
  });
}

test.describe('Home (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    home = new HomePage(page);
    await home.goto();
  });

  test('one card says how many cards are waiting, how long, and the progress', async () => {
    await expect(home.card).toBeVisible();
    await expect(home.card).toHaveAttribute('data-home-card', 'ready');
    await expect(home.card.getByText(/^\d+ cards? to review$/)).toBeVisible();
    // Today's session in three counts — blue new, red learning, green review —
    // adding up to the title. No time estimate.
    for (const key of ['new', 'learning', 'review']) {
      await expect(home.card.locator('[data-queue="' + key + '"]')).toBeVisible();
    }
    const sums = await home.card.evaluate(node => ({
      title: Number(node.textContent.match(/(\d+) cards? to review/)[1]),
      parts: [...node.querySelectorAll('[data-queue]')].reduce((n, el) => n + Number(el.firstElementChild.textContent), 0),
    }));
    expect(sums.parts).toBe(sums.title);
    await expect(home.card.getByText(/minutes?$/)).toHaveCount(0);
    await expect(home.card.getByText(/^\d+ of \d+ words? to HSK \d$/)).toBeVisible();
  });

  test('the whole card is the control: one button, no label of its own', async ({ page }) => {
    const tag = await home.card.evaluate(node => node.tagName.toLowerCase());
    expect(tag).toBe('button');
    await expect(home.card.locator('button')).toHaveCount(0);
    await expect(home.card.getByText(/Start reviewing|Start review/)).toHaveCount(0);
    // Its accessible name carries the action and the whole state.
    await expect(home.card).toHaveAccessibleName(/^Start reviewing\. \d+ cards? to review: \d+ new, \d+ learning, \d+ review\./);
    await home.card.click();
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();
  });

  test('the card answers Enter from the keyboard', async ({ page }) => {
    await home.card.focus();
    await expect(home.card).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/study$/);
  });

  test('the card presses without changing its size', async () => {
    const before = await home.card.boundingBox();
    await home.card.hover();
    const after = await home.card.boundingBox();
    expect(Math.abs(before.width - after.width)).toBeLessThan(0.5);
    expect(Math.abs(before.height - after.height)).toBeLessThan(0.5);
  });

  test('the painting is decorative scenery, never a control', async () => {
    await expect(home.painting).toHaveAttribute('aria-hidden', 'true');
    const style = await home.painting.evaluate(node => {
      const cs = getComputedStyle(node);
      return { pointerEvents: cs.pointerEvents, position: cs.position, image: getComputedStyle(node, '::before').backgroundImage };
    });
    expect(style.pointerEvents).toBe('none');
    expect(style.position).toBe('fixed');
    expect(style.image).toContain('home-ink-day');
  });

  test('dark mode paints the night version of the same scene', async ({ page }) => {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const image = await home.painting.evaluate(node => getComputedStyle(node, '::before').backgroundImage);
    expect(image).toContain('home-ink-night');
  });

  test('the card rests between the mountains and the dock', async ({ page }) => {
    const box = await home.card.boundingBox();
    const navTop = await page.locator('nav[aria-label="Primary"]').evaluate(n => n.getBoundingClientRect().top);
    expect(box.y).toBeGreaterThan(844 * 0.3);
    expect(box.y + box.height).toBeLessThan(navTop - 16);
  });

  test('carries no template chrome: no eyebrows, dot strings or streaks', async ({ page }) => {
    const text = await home.card.innerText();
    expect(text).not.toContain('·');
    expect(text).not.toMatch(/~\d+ min/);
    const caps = await home.card.evaluate(node =>
      [...node.querySelectorAll('*')].some(el => getComputedStyle(el).textTransform === 'uppercase'));
    expect(caps).toBe(false);
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
    await expect(page.getByText(/fluency/i)).toHaveCount(0);
  });

  test('uses the approved three-tab primary navigation', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('button', { name: 'Stories' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Practice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Cards' })).toHaveCount(0);
  });

  test('the header profile button opens Profile', async ({ page }) => {
    await page.getByRole('button', { name: 'Open profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('fits a small phone: no overflow, card fully above the dock', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await home.goto();
    await expect(home.card).toBeVisible();
    const geometry = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      cardBottom: document.querySelector('[data-tour="home-queue"]').getBoundingClientRect().bottom,
      navTop: document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect().top,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
    expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.navTop);
  });

  test('keeps retired Cards and More deep links compatible', async ({ page }) => {
    await page.goto('/cards');
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();
    await page.goto('/more');
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('after the last card, the card turns into the way to a story', async ({ page }) => {
    test.setTimeout(90000);
    await home.card.click();
    const study = new StudyPage(page);
    const backHome = page.getByRole('button', { name: 'Back home' });
    for (let graded = 0; graded < 40; graded += 1) {
      const next = await Promise.race([
        backHome.waitFor({ state: 'visible' }).then(() => 'done'),
        study.showAnswer.waitFor({ state: 'visible' }).then(() => 'card'),
      ]);
      if (next === 'done') break;
      await study.reveal();
      await study.gradeGood.click();
    }
    await expect(backHome).toBeVisible();
    await backHome.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(home.card).toHaveAttribute('data-home-card', 'clear');
    await expect(home.card.getByText('All caught up')).toBeVisible();
    await expect(home.card).toHaveAccessibleName(/^Read a story/);
  });
});

test('a clear queue: "All caught up", tomorrow named, tap opens Stories', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClearQueue(page);
  await page.goto('/');
  const card = page.locator('[data-tour="home-queue"]');
  await expect(card).toHaveAttribute('data-home-card', 'clear');
  await expect(card.getByText('All caught up')).toBeVisible();
  await expect(card.getByText(/^\d+ cards? tomorrow\. Read a story until then\.$/)).toBeVisible();
  await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-home-stage', 'caught-up');
  await card.click();
  await expect(page).toHaveURL(/\/stories/);
});

test('a queue that failed to load never claims "all caught up"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/mock.supabase.co/rest/v1/vocabulary**', route =>
    route.fulfill({ status: 500, headers: CORS, body: '{"message":"boom"}' }));
  await page.goto('/');
  const card = page.locator('[data-tour="home-queue"]');
  await expect(card).toHaveAttribute('data-home-card', 'failed');
  await expect(card.getByText('Cards didn’t load')).toBeVisible();
  await expect(card.getByText('Try again')).toBeVisible();
  await expect(page.getByText(/caught up/i)).toHaveCount(0);
});
