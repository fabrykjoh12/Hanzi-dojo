import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Stories covers sit on the page's own column.
//
// Reported from a device as "off-centre", and it was: every poster started 3px
// left of the heading, the subtitle and the hero above it, at every width.
//
// It was not a margin bug. The rail's padding was applied correctly — the first
// item's offsetLeft WAS the padding edge — and then the rail was scrolled 3px.
// A snapport defaults to the scrollport's BORDER edge, so snapping the first
// item's start to it costs exactly the padding. The negative-margin/padding
// pattern that keeps shadows and focus rings from being clipped and scroll-snap
// were fighting each other, and snap won. `scroll-padding-inline` moves the
// snapport to the padding edge, which is what these specs pin.

const WIDTHS = [
  { name: 'iPhone SE', width: 320 },
  { name: 'iPhone 14', width: 390 },
  { name: 'iPhone Pro Max', width: 430 },
];

async function railGeometry(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const rails = Array.from(document.querySelectorAll('[data-testid="story-shelf-rail"]'));
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      rails: rails.map((rail) => {
        const rr = rail.getBoundingClientRect();
        const pageLeft = rail.parentElement.getBoundingClientRect().left;
        const kids = Array.from(rail.children);
        const boxes = kids.map((k) => k.getBoundingClientRect());
        const first = boxes[0];
        const last = boxes[boxes.length - 1];
        const inner = kids[0].querySelectorAll('div');
        const cover = inner[0] ? inner[0].getBoundingClientRect() : null;
        const label = inner.length ? inner[inner.length - 1].getBoundingClientRect() : null;
        const gaps = boxes.slice(1).map((b, i) => Math.round(b.left - boxes[i].right));
        return {
          shelf: rail.getAttribute('data-shelf'),
          pageLeft: Math.round(pageLeft),
          scrollLeft: rail.scrollLeft,
          firstLeft: Math.round(first.left),
          firstCentre: +(first.left + first.width / 2).toFixed(1),
          coverCentre: cover ? +(cover.left + cover.width / 2).toFixed(1) : null,
          labelCentre: label ? +(label.left + label.width / 2).toFixed(1) : null,
          // What is left over past the last card, inside the scroller.
          trailing: Math.round(rail.scrollWidth - (last.right - rr.left + rail.scrollLeft)),
          gaps,
          scrolls: rail.scrollWidth > rail.clientWidth + 1,
          snapType: getComputedStyle(rail).scrollSnapType,
          count: kids.length,
        };
      }),
    };
  });
}

for (const w of WIDTHS) {
  test.describe('Stories covers at ' + w.name, () => {
    test.use({ viewport: { width: w.width, height: 844 } });

    test('start on the same column as the rest of the page', async ({ page }) => {
      await page.goto('/stories');
      await page.waitForTimeout(1400);
      const g = await railGeometry(page);
      expect(g.rails.length).toBeGreaterThan(0);

      for (const rail of g.rails) {
        // THE invariant. Not "close to" — the covers and the page text begin at
        // the same x, or the shelf reads as a column of its own.
        expect(rail.firstLeft).toBe(rail.pageLeft);
        // …and it is a genuine alignment rather than a rail parked mid-scroll.
        expect(rail.scrollLeft).toBe(0);
      }
    });

    test('put the label under the middle of its own cover', async ({ page }) => {
      await page.goto('/stories');
      await page.waitForTimeout(1400);
      const g = await railGeometry(page);
      for (const rail of g.rails) {
        expect(Math.abs(rail.coverCentre - rail.firstCentre)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(rail.labelCentre - rail.coverCentre)).toBeLessThanOrEqual(0.5);
      }
    });

    test('space every card the same, and keep the breathing room at the end', async ({ page }) => {
      await page.goto('/stories');
      await page.waitForTimeout(1400);
      const g = await railGeometry(page);
      for (const rail of g.rails) {
        if (rail.gaps.length) expect(new Set(rail.gaps).size).toBe(1);
        // The 3px each side is deliberate: it is what stops `overflow` clipping
        // a poster's shadow and focus ring. Alignment must not be bought by
        // removing it.
        //
        // Only meaningful on a rail that actually overflows. A shelf with two
        // cards on a wide phone has the rest of the row left over, and that is
        // empty space rather than breathing room.
        if (rail.scrolls) {
          expect(rail.trailing).toBeGreaterThanOrEqual(2);
          expect(rail.trailing).toBeLessThanOrEqual(6);
        }
      }
    });

    test('still snap, and never push the page sideways', async ({ page }) => {
      await page.goto('/stories');
      await page.waitForTimeout(1400);
      const g = await railGeometry(page);
      expect(g.overflowX).toBe(0);
      for (const rail of g.rails) expect(rail.snapType).toContain('x');
    });
  });
}
