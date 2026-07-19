import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// "Read your own text": paste text → analyze → read it with tap-to-define.
test.describe('Analyze text → read it', () => {
  test('renders tappable text and looks up a tapped word', async ({ page }) => {
    await page.goto('/analyzer');

    await page.getByPlaceholder(/Paste .* text here/i).fill('今天天气很好。');
    await page.getByRole('button', { name: /^Analyze$/i }).click();

    // The tap-to-read section appears.
    await expect(page.getByText('Read it — tap any word')).toBeVisible();

    // Tapping a recognized word opens the lookup sheet with its meaning.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();
  });

  test('tapping a "word to learn next" chip opens its lookup', async ({ page }) => {
    // Trim the deck to only v1 (今天) so 天气/很/好 count as new words.
    await page.route('**/rest/v1/cards*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-0/*' },
        body: JSON.stringify([{ vocab_id: 'v1', is_easy: false, state: 'review' }]),
      });
    });

    await page.goto('/analyzer');
    await page.getByPlaceholder(/Paste .* text here/i).fill('今天天气很好。');
    await page.getByRole('button', { name: /^Analyze$/i }).click();

    // The new-words list appears; its chips are now interactive.
    await expect(page.getByText(/Words to learn next \(\d+\)/)).toBeVisible();
    await page.getByRole('button', { name: /天气/ }).first().click();
    await expect(page.getByText('weather')).toBeVisible();
  });

  // Regression: on mobile the sheet lives in the app shell's <main> (a stacking
  // context) with a fixed bottom nav; without the body portal it collapsed to a
  // ~10px sliver behind the nav. Assert it opens at a real height, near the
  // bottom of the viewport.
  test('lookup sheet opens full-height on mobile (not a sliver)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/analyzer');

    await page.getByPlaceholder(/Paste .* text here/i).fill('今天天气很好。');
    await page.getByRole('button', { name: /^Analyze$/i }).click();
    await expect(page.getByText('Read it — tap any word')).toBeVisible();

    await page.getByText('今天', { exact: true }).first().click();
    const meaning = page.getByText('today');
    await expect(meaning).toBeVisible();

    // The meaning sits in the lower portion of the screen and is not clipped to a
    // sliver: its box has real height and its bottom is within the viewport.
    const box = await meaning.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThan(8);
    expect(box.y).toBeGreaterThan(500);          // in the bottom sheet, not the body text
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  });
});
