import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P10-A1. Settings' rows were clipped 55px off the right edge at 320px — every
// title and description cut mid-word — and NOTHING caught it: `overflowX` was 0,
// because an ancestor was hiding the overflow rather than the document scrolling.
//
// So this spec does not ask whether the page scrolls sideways. It asks the
// question the defect actually failed: **does every element that carries
// meaning fit inside the viewport?**
//
// It runs at the three widths in the device matrix, in both themes, and it is
// deliberately strict about the one thing that must never come back.

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

// Everything in Settings that a learner reads or touches. A wrapper can legally
// be full-bleed; text and controls cannot exceed the screen.
async function overflowing(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('#main-content *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Only elements with their own text, or controls: a bare layout div that
      // happens to be wide is not what broke.
      const ownText = Array.from(el.childNodes)
        .some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      const tag = el.tagName.toLowerCase();
      const control = tag === 'button' || tag === 'select' || tag === 'input' || tag === 'label';
      if (!ownText && !control) continue;

      const pastRight = r.right > vw + 0.5;
      const pastLeft = r.left < -0.5;
      // Its own box cutting its own content off — the exact failure mode.
      const selfClipped = el.scrollWidth > el.clientWidth + 1
        && cs.overflowX !== 'visible' && ownText;
      if (pastRight || pastLeft || selfClipped) {
        out.push({
          tag,
          txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
          left: Math.round(r.left), right: Math.round(r.right), vw,
          why: selfClipped ? 'clips-its-own-text' : (pastRight ? 'past-right-edge' : 'past-left-edge'),
        });
      }
    }
    return out;
  });
}

for (const phone of PHONES) {
  for (const theme of ['dark', 'light']) {
    test.describe('Settings at ' + phone.name + ' · ' + theme, () => {
      test.use({ viewport: { width: phone.width, height: phone.height } });

      test('nothing that carries meaning leaves the screen', async ({ page }) => {
        await page.goto('/settings');
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(700);
        // Scroll through the whole page: a row further down must be as safe as
        // the first one, and Settings is ~3 viewports tall.
        for (const y of [0, 0.5, 1]) {
          await page.evaluate((f) => window.scrollTo(0, document.documentElement.scrollHeight * f), y);
          await page.waitForTimeout(200);
          const bad = await overflowing(page);
          expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
        }
      });

      test('the page itself does not scroll sideways', async ({ page }) => {
        await page.goto('/settings');
        await page.waitForTimeout(700);
        const over = await page.evaluate(() => {
          const de = document.documentElement;
          return de.scrollWidth - de.clientWidth;
        });
        expect(over).toBe(0);
      });
    });
  }
}

test.describe('Settings controls stay touchable', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('every segmented option is at least 44px tall and inside the card', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(800);
    const groups = await page.evaluate(() => {
      const vw = window.innerWidth;
      return Array.from(document.querySelectorAll('[role="group"]')).map((g) => {
        const gr = g.getBoundingClientRect();
        return {
          label: g.getAttribute('aria-label'),
          right: Math.round(gr.right), vw,
          options: Array.from(g.querySelectorAll('button')).map((b) => {
            const r = b.getBoundingClientRect();
            return {
              txt: (b.textContent || '').trim(),
              w: Math.round(r.width), h: Math.round(r.height),
              right: Math.round(r.right),
            };
          }),
        };
      });
    });

    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.right, g.label).toBeLessThanOrEqual(g.vw);
      for (const o of g.options) {
        expect(o.h, g.label + ' / ' + o.txt).toBeGreaterThanOrEqual(44);
        expect(o.right, g.label + ' / ' + o.txt).toBeLessThanOrEqual(g.vw);
        // A label must still be readable — an option squeezed to nothing is the
        // other way to "fit".
        expect(o.w, g.label + ' / ' + o.txt).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('the two-choice controls are full-width halves on a phone', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(800);
    const theme = await page.evaluate(() => {
      const g = Array.from(document.querySelectorAll('[role="group"]'))
        .find((x) => x.getAttribute('aria-label') === 'Theme');
      if (!g) return null;
      const opts = Array.from(g.querySelectorAll('button')).map((b) => b.getBoundingClientRect().width);
      return { count: opts.length, widths: opts.map((w) => Math.round(w)), group: Math.round(g.getBoundingClientRect().width) };
    });
    expect(theme).not.toBe(null);
    expect(theme.count).toBe(2);
    // Equal columns…
    expect(Math.abs(theme.widths[0] - theme.widths[1])).toBeLessThanOrEqual(1);
    // …that between them fill the control, rather than hugging their labels.
    expect(theme.widths[0] + theme.widths[1]).toBeGreaterThan(theme.group * 0.85);
  });
});
