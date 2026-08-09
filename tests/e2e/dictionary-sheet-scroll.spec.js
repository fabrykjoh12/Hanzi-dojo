import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Regression: on a phone the dictionary entry sheet was rendered inline inside
// the app shell's <main>, which sets position:relative + z-index and so forms a
// stacking context. The sheet's own z-index:200 was scoped to that context, so
// the fixed MobileNav (z-index:30, ~62px + safe area) painted OVER the sheet's
// bottom strip. The sheet scrolled, but its last rows could never be brought
// clear of the nav bar — the bottom of a long entry was unreachable, and taps
// there hit the nav instead.
//
// These tests open an entry that is far taller than a phone screen and assert
// (a) the scroll container really scrolls, and (b) the last element ends up
// fully visible AND hit-testable — i.e. nothing is painted on top of it.

const LONG_DEFS = Array.from({ length: 14 }, (_, i) =>
  'Definition number ' + (i + 1) + ' — a deliberately long gloss so the entry overflows a phone screen.');

const LONG_ENTRY = {
  id: 'd1', simplified: '中文', traditional: '中文', pinyin: 'zhōng wén',
  pinyin_plain: 'zhong wen', definitions: LONG_DEFS, hsk_level: 1,
};

const CONTAINING = Array.from({ length: 12 }, (_, i) => ({
  id: 'wc' + i, simplified: '中文' + i, pinyin: 'zhōng wén', definitions: ['containing word ' + i],
}));

const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };

async function mockLongEntry(page) {
  await page.route('**/rest/v1/rpc/dict_search', (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify([LONG_ENTRY]) }));
  await page.route('**/rest/v1/rpc/dict_words_containing', (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify(CONTAINING) }));
}

async function openLongEntry(page) {
  await mockLongEntry(page);
  await page.goto('/dictionary');
  await page.getByLabel('Search the dictionary').fill('zhong');
  await page.getByRole('button').filter({ hasText: '中文' }).first().click();
  await expect(page.getByRole('tab', { name: 'Meaning' })).toBeVisible();
  // The last "words containing" chip only renders once that query resolves.
  await expect(page.locator('.dict-chip').last()).toHaveCount(1);
}

// Whatever element actually scrolls the entry — found by walking up from the
// entry itself rather than by test id, so this spec measures the real layout
// and would still hold if the sheet were restructured again.
const scroller = (page) => page.locator('.dict-entry').locator('xpath=ancestor::*[1]');

for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test.describe(size.width + 'x' + size.height, () => {
    test.use({ viewport: size });

    test('the entry sheet scrolls and its last row is reachable', async ({ page }) => {
      await openLongEntry(page);

      const box = scroller(page);
      // There is genuinely more content than fits — otherwise this proves nothing.
      const overflow = await box.evaluate(el => el.scrollHeight - el.clientHeight);
      expect(overflow).toBeGreaterThan(50);

      // The scroll container actually moves.
      await box.evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await box.evaluate(el => el.scrollTop)).toBeGreaterThan(0);

      // The bottom-most element is now fully inside the viewport…
      const last = page.locator('.dict-chip').last();
      await expect(last).toBeInViewport({ ratio: 1 });

      // …and nothing (the mobile nav bar) is painted over it. `toBeVisible`
      // does not catch occlusion, so hit-test the element's own centre.
      const reachable = await last.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!hit && (el === hit || el.contains(hit));
      });
      expect(reachable).toBe(true);

      // Clicking it really does drill down rather than hitting the nav.
      // Named precisely: the screen's own header Back exists too now (the
      // shared AppBar), and this assertion is about the SHEET's control.
      await last.click();
      await expect(page.getByRole('button', { name: 'Back to the previous entry' })).toBeVisible();
    });

    test('the close button stays pinned while the body scrolls', async ({ page }) => {
      await openLongEntry(page);
      const close = page.getByRole('button', { name: 'Close' });
      await expect(close).toBeInViewport({ ratio: 1 });

      await scroller(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(page.getByRole('tab', { name: 'Meaning' })).toHaveCount(0);
    });
  });
}
