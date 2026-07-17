import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { ReaderPage } from '../pages/ReaderPage.js';

test.describe('Story reader', () => {
  test('opens a story from the library', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    // The story title appears in the reader.
    await expect(page.getByText('公园里的下午').first()).toBeVisible();
  });
});
