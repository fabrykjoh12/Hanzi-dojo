import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';
import { ReaderPage } from '../pages/ReaderPage.js';
import { NOODLESHOP_MANIFEST } from '../fixtures/manhuaManifest.js';

// Store-listing screenshot capture — NOT a regression suite. Runs only when
// STORE_SHOTS=1 so the ordinary e2e run never pays for it:
//
//   STORE_SHOTS=1 npx playwright test tests/e2e/store-screenshots.spec.js
//
// Captures the shot list from docs/STORE-LISTING.md against the mock backend
// at iPhone 6.7" geometry (430x932 logical @3x = 1290x2796 px, the exact size
// App Store Connect wants). Files land in store-screenshots/, gitignored —
// they are build artifacts of the listing, not source. Recapture after any
// visual change worth showing; the captions are added in the store console,
// not baked into the images.

const shoot = process.env.STORE_SHOTS === '1';

test.describe('store screenshots — iPhone 6.7"', () => {
  test.skip(!shoot, 'set STORE_SHOTS=1 to capture');
  test.use({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });

  const OUT = 'store-screenshots/iphone-6.7/';
  const settle = async (page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);   // let entrance animations finish
  };

  test('1 · story mid-read, word open', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    const word = page.locator('[lang="zh-Hans"] button, button[lang="zh-Hans"]').first();
    if (await word.count()) await word.click();
    await settle(page);
    await page.screenshot({ path: OUT + '1-story-reading.png' });
  });

  test('2 · stories shelf with % known', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByText(/% known|Stories/i).first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: OUT + '2-stories-shelf.png' });
  });

  test('3 · flashcard revealed with grades', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();
    await study.reveal();
    await settle(page);
    await page.screenshot({ path: OUT + '3-flashcard.png' });
  });

  test('4 · manhua panel with a balloon', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle(NOODLESHOP_MANIFEST.title);
    await settle(page);
    await page.screenshot({ path: OUT + '4-manhua.png' });
  });

  test('5 · home queue', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Ready to review|Queue clear/i)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: OUT + '5-home.png' });
  });

  test('6 · dictionary entry', async ({ page }) => {
    await page.goto('/dictionary');
    const search = page.getByRole('textbox').first();
    await search.fill('朋友');
    await page.waitForTimeout(800);
    const hit = page.getByText('朋友', { exact: true }).first();
    if (await hit.count()) await hit.click();
    await settle(page);
    await page.screenshot({ path: OUT + '6-dictionary.png' });
  });
});
