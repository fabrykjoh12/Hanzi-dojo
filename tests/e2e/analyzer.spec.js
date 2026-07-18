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
