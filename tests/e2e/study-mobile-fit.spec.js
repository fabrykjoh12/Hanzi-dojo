import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// Regression: on a phone the whole study screen must fit one viewport. Before
// this was fixed the revealed card pushed Again/Hard/Good/Easy below the fold,
// so grading required a scroll — the single most-repeated action in the app.
const PHONES = [
  { name: 'iPhone 14 (390x844)', width: 390, height: 844 },
  { name: 'short phone (360x640)', width: 360, height: 640 },
];

for (const phone of PHONES) {
  test.describe('Study fits the viewport — ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('grade buttons are reachable without scrolling', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      await study.reveal();

      // Playwright scrolls to click; measure from the top of the page, which is
      // what the learner sees when the card is revealed.
      await page.evaluate(() => window.scrollTo(0, 0));
      const viewportHeight = await page.evaluate(() => window.innerHeight);

      // Every grade button must sit fully inside the viewport as rendered —
      // no scroll, no clipping.
      for (const button of [study.gradeAgain, study.gradeGood, study.gradeEasy]) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight);
        // Tap targets stay comfortable.
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      // ...and the page itself must not be scrollable at all.
      const scroll = await page.evaluate(() => ({
        docScroll: document.documentElement.scrollHeight,
        bodyScroll: document.body.scrollHeight,
        inner: window.innerHeight,
      }));
      expect(scroll.docScroll).toBeLessThanOrEqual(scroll.inner + 1);
      expect(scroll.bodyScroll).toBeLessThanOrEqual(scroll.inner + 1);
    });

    test('grade buttons are not hidden behind the mobile nav bar', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      await study.reveal();

      const box = await study.gradeEasy.boundingBox();
      // Hit-test the centre of the Easy button: whatever is on top there must
      // be the button itself (or its own children), never the fixed bottom nav.
      const onTop = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('button') === null ? 'no-button' : el.closest('button').textContent : 'nothing';
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(onTop).toContain('Easy');
    });
  });
}
