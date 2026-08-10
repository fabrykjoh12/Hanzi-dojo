import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// Session Complete is a completion state, not a page.
//
// Measured on a device and then here: on a 390x844 and a 430x932 phone the
// recap scrolled by exactly 62px — MOBILE_NAV_HEIGHT to the pixel. The content
// fit; the overflow was the bottom-bar reservation being added to a block that
// had asked for `minHeight: 100vh` while sitting INSIDE a <main> that already
// reserved the bar and both safe-area insets.
//
// The invariant below is that relationship, not a magic number: the completion
// screen may not be taller than the space it is actually given. 320x568 is
// exempt because the content genuinely exceeds the space there, and clipping it
// would be worse than scrolling.

async function finishSession(page) {
  const study = new StudyPage(page);
  await study.goto();
  for (let i = 0; i < 80; i += 1) {
    const good = page.getByRole('button', { name: /Good/i });
    if (!(await good.count())) {
      const card = page.getByRole('button', { name: /flashcard.*tap to reveal/i });
      if (await card.count()) { await card.click(); await page.waitForTimeout(120); continue; }
      break;
    }
    await good.first().click();
    await page.waitForTimeout(160);
  }
  await expect(page.getByText('Session complete')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
}

async function completionGeometry(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const heads = Array.from(document.querySelectorAll('h1, h2, h3'))
      .filter((h) => h.getBoundingClientRect().height > 0);
    return {
      docH: de.scrollHeight,
      viewportH: window.innerHeight,
      overflow: de.scrollHeight - window.innerHeight,
      overflowX: de.scrollWidth - de.clientWidth,
      headTop: heads[0] ? Math.round(heads[0].getBoundingClientRect().top) : null,
      headText: heads[0] ? heads[0].textContent.trim().slice(0, 24) : null,
      // Nothing may be cut off the bottom of the document.
      lowestContent: Math.round(Math.max(
        ...Array.from(document.querySelectorAll('#main-content *'))
          .map((el) => el.getBoundingClientRect().bottom + window.scrollY)
          .filter((n) => Number.isFinite(n)),
      )),
    };
  });
}

for (const phone of [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
]) {
  test.describe('Session Complete on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('fits the space it is given — no meaningless scroll', async ({ page }) => {
      await finishSession(page);
      const g = await completionGeometry(page);

      // The whole finding, as an invariant: the completion state is not taller
      // than the viewport it lives in. A 1px rounding allowance, no more.
      expect(g.overflow).toBeLessThanOrEqual(1);
      expect(g.overflowX).toBe(0);
    });

    test('shows the result and keeps a way onward, without clipping anything', async ({ page }) => {
      await finishSession(page);
      const g = await completionGeometry(page);

      expect(g.headText).toContain('Session complete');
      expect(g.headTop).toBeGreaterThanOrEqual(0);
      expect(g.headTop).toBeLessThan(g.viewportH);

      // Fitting must not have been achieved by cutting the bottom off.
      expect(g.lowestContent).toBeLessThanOrEqual(g.docH + 1);

      // And there is still something to do next.
      const next = page.getByRole('button', { name: /Read|Home|Practice|Study|Keep going|Done/i });
      expect(await next.count()).toBeGreaterThan(0);
    });
  });
}

test.describe('Session Complete on a small phone', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('may scroll — the content genuinely exceeds the screen there', async ({ page }) => {
    await finishSession(page);
    const g = await completionGeometry(page);
    // Explicitly NOT asserting it fits. What matters is that it is honest
    // scrolling of real content rather than clipping, and that the result is
    // still the first thing seen.
    expect(g.headTop).toBeLessThan(g.viewportH);
    expect(g.overflowX).toBe(0);
    expect(g.lowestContent).toBeLessThanOrEqual(g.docH + 1);
  });
});
