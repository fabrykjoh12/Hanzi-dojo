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
});
