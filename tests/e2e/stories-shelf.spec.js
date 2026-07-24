import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories library groups a CUMULATIVE shelf under tier tabs (First Steps /
// Growing / Fluent). Each tab shows that tier's stories across every level the
// learner has reached — grouped into arcs, with practice formats in their own
// section — and a locked tab states how many more words open it.
//
// Fixture: track.current_level = 2; four level-2 tier-1 stories (one paced
// narrative + three practice formats) and one level-1 tier-3 story ("老朋友").
const LEVEL_1_STORY = {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
};

// Narrow the stories table to a specific set for one test (GET only — anything
// else falls through to the shared mock).
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

test.describe('Story library — tier tabs', () => {
  test('one tab bar replaces the old progress bar + ladder', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('tab', { name: /First Steps/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Growing/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Fluent/ })).toBeVisible();
    // The overall unlock % is a small label in the same bar, not a separate card.
    await expect(page.getByText(/% of this level unlocked/i)).toBeVisible();
  });

  test('First Steps is open by default; practice formats sit in their own section', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // The narrative story is a card.
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toBeVisible();
    // Chat / scene / reply stories are pulled out into Practice Scenarios (their
    // cards carry the "Practice" ribbon in the accessible name).
    await expect(panel.getByRole('heading', { name: 'Practice Scenarios' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Practice 下雨天/ })).toBeVisible();
  });

  test('a locked tier shows how many more words open it', async ({ page }) => {
    await page.goto('/stories');
    // Growing is locked at HSK 2 — its tab says so, and selecting it shows the
    // locked panel rather than a dead end.
    await expect(page.getByText(/more word/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /Growing/ }).click();
    await expect(page.getByText('Keep learning to unlock')).toBeVisible();
  });

  test('cumulative shelf: a passed level’s story stays open under its tier tab', async ({ page }) => {
    await page.goto('/stories');
    // HSK 1 (behind the learner) keeps its tier-3 story readable even though the
    // same threshold is still locked at HSK 2 — reached via the Fluent tab.
    await page.getByRole('tab', { name: /Fluent/ }).click();
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('a story card opens straight into the reader (no list drill-in)', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('tab', { name: /Fluent/ }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ }).click();
    await expect(page.getByRole('button', { name: /Start reading/i })).toBeVisible();
  });

  test('the filter row narrows by format', async ({ page }) => {
    await page.goto('/stories');
    const panel = page.getByRole('tabpanel');
    // Format → Practice hides the narrative card, keeps the practice ones.
    // (Scope to the Format group so the sidebar's "Practice" nav isn't matched.)
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Practice' }).click();
    await expect(panel.getByRole('button', { name: /Practice 朋友的问题/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /公园里的下午/ })).toHaveCount(0);
  });

  test('current level has no stories of its own — a lower level still shows', async ({ page }) => {
    await serveStories(page, [LEVEL_1_STORY]);
    await page.goto('/stories');
    // Default opens the tier that actually has something readable (Fluent → HSK 1).
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /老朋友/ })).toBeVisible();
  });

  test('no stories anywhere — a calm empty state, no broken shelf', async ({ page }) => {
    await serveStories(page, []);
    await page.goto('/stories');
    await expect(page.getByText('No stories yet')).toBeVisible();
  });

  test('reads on a phone-width viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('tab', { name: /First Steps/ })).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
