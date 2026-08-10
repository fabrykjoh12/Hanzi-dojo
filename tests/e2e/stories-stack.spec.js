import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Stories → Series → Reader, owned by the navigation stack.
//
// All three used to be one component with a `view` string and a boolean called
// `readerFromSeries` standing in for a stack. These specs are the difference
// that ownership makes: the shelf survives underneath, Back walks the hierarchy
// instead of a remembered hop, the URL and the model agree in both directions,
// and a cold link lands on the same screen a tap does.

const SERIES_POSTER = /月下的朋友 · HSK 1 · 3 chapters/;

function net(page) {
  const rows = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.indexOf('mock.supabase.co/rest/v1/') === -1) return;
    if (r.method() === 'OPTIONS') return;
    rows.push(r.method() + ' ' + url.split('/rest/v1/')[1].split('?')[0]);
  });
  return { reset() { rows.length = 0; }, all() { return rows.slice(); } };
}

// The bottom bar is the MOBILE chrome; desktop keeps its sidebar regardless,
// so tab-bar visibility is asserted at phone width where the rule applies.
const PHONE = { width: 390, height: 844 };
const bottomBar = (page) => page.getByRole('navigation', { name: 'Primary' });

test.describe('the Stories stack', () => {
  test('shelf → series is a push, and Back is a pop to the same shelf', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();

    await expect(page).toHaveURL(/\/stories\/series\//);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    // A pushed screen keeps the chrome, and Stories stays the selected tab.
    await expect(page.getByRole('button', { name: 'Stories' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'All stories' }).click();
    await expect(page).toHaveURL(/\/stories$/);
    // The shelf that comes back is the SAME shelf — it never unmounted, so its
    // filter chips and rails are exactly as they were.
    await expect(page.getByRole('button', { name: SERIES_POSTER }).first()).toBeVisible();
  });

  test('series → reader is a fullscreen presentation, and Back returns to the series', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/stories');
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    // A pushed screen is a normal destination: the bar stays.
    await expect(bottomBar(page)).toBeVisible();

    await page.getByRole('button', { name: /Chapter 1 · 月下的朋友/ }).click();
    await expect(page).toHaveURL(/\/stories\/[^/]+$/);
    // A flow owns the whole screen: the bar is gone.
    await expect(bottomBar(page)).toBeHidden();

    await page.goBack();
    // …and dismissing lands on the series page it was opened from, NOT the
    // shelf and certainly not Home. That is the stack answering, where a
    // boolean used to.
    await expect(page).toHaveURL(/\/stories\/series\//);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await expect(bottomBar(page)).toBeVisible();
  });

  test('browser Back and Forward walk the same hierarchy', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await expect(page).toHaveURL(/\/stories\/series\//);

    await page.goBack();
    await expect(page).toHaveURL(/\/stories$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/stories\/series\//);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
  });

  test('a cold series link seeds Stories underneath it', async ({ page }) => {
    // Learn the real URL the same way a learner would get it — then arrive at
    // it cold, with no shelf visit first. Back must still reach the library
    // rather than dropping out of the app.
    await page.goto('/stories');
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await expect(page).toHaveURL(/\/stories\/series\//);
    const url = new URL(page.url()).pathname;

    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();

    await page.getByRole('button', { name: 'All stories' }).click();
    await expect(page).toHaveURL(/\/stories$/);
    await expect(page.getByRole('button', { name: SERIES_POSTER }).first()).toBeVisible();
  });

  test('walking the stack costs nothing after the shelf has loaded', async ({ page }) => {
    const rec = net(page);
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: SERIES_POSTER }).first()).toBeVisible();
    await page.waitForTimeout(1200);

    rec.reset();
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await page.waitForTimeout(800);
    // The series page reads the same loaded data the shelf did. Extracting it
    // into its own screen must not turn one load into three.
    expect(rec.all()).toEqual([]);

    await page.getByRole('button', { name: 'All stories' }).click();
    await expect(page).toHaveURL(/\/stories$/);
    await page.waitForTimeout(800);
    expect(rec.all()).toEqual([]);
  });
});
