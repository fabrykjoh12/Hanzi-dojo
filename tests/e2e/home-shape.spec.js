import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';

// P14-5C — Home's composition, as a contract.
//
// The shape has been through four rounds now. Three equal rounded cards read as a
// generated dashboard (P10). One lit card plus open sections read as unfinished
// (build 38). One lit card plus one flat surface was correct and still read, on a
// real phone, as "messy, over-designed, not useful enough" (build 43).
//
// What ships is a GUIDE: type on the page ground, one loud step, two quiet
// numbered ones, and the story artwork as the only rich object. So the contract
// this file holds is mostly a contract about what must NOT be here — because
// every previous round failed by adding, not by subtracting.
//
// The state-by-state behaviour is home-guide.spec.js; this is the drawing.

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

// Everything on the page that DRAWS ITSELF AS A BOX: a border, a radius with a
// background, or a shadow. Artwork is excluded by name — a story cover is a
// rounded, shadowed rectangle and it is content, not a container (the same
// distinction P14-5 had to teach this suite, via `data-story-cover`).
const BOXES = () => {
  const root = document.querySelector('#main-content') || document.body;
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('[data-story-cover]')) continue;
    if (el.closest('[data-tour-overlay]')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue;
    // A RULE is not a box. One hairline along the top (the editorial divider
    // above the sequence) is a drawn line; a container is bordered on at least
    // two sides. Counting a single edge made the guide's own divider read as a
    // panel, which is precisely the distinction this file exists to police.
    const edges = ['Top', 'Right', 'Bottom', 'Left']
      .filter(side => (parseFloat(cs['border' + side + 'Width']) || 0) > 0
        && cs['border' + side + 'Style'] !== 'none').length;
    const bordered = edges >= 2;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const shadowed = cs.boxShadow !== 'none';
    if (!(bordered || shadowed || (radius >= 8 && filled))) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      text: (el.textContent || '').trim().slice(0, 40),
      w: Math.round(r.width),
      h: Math.round(r.height),
      radius,
      bordered,
      shadowed,
    });
  }
  return out;
};

for (const phone of PHONES) {
  test.describe('Home composition · ' + phone.name, () => {
    let home;
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height });
      home = new HomePage(page);
      await home.goto();
      await expect(home.primaryAction).toBeVisible();
    });

    test('draws no panel around the guide — the page IS the layout', async ({ page }) => {
      const boxes = await page.evaluate(BOXES);
      // The button is a box and should be. Nothing else may be, unless the
      // returning-from-a-break notice happens to be showing.
      const unexpected = boxes.filter(b => b.tag !== 'button' && !/reviews are ready|welcome back/i.test(b.text));
      expect(unexpected, 'a container came back onto Home: ' + JSON.stringify(unexpected)).toEqual([]);
    });

    test('has one action, and the quiet steps are not competing buttons', async ({ page }) => {
      const buttons = await page.locator('#main-content button').count();
      // One: the active step's CTA. The quiet steps are role="button" rows, which
      // are reachable but drawn as text.
      expect(buttons).toBe(1);
      const rows = await page.locator('[data-guide-step]').evaluateAll((els) => els.map((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          border: parseFloat(cs.borderTopWidth) || 0,
          shadow: cs.boxShadow,
        };
      }));
      for (const r of rows) {
        expect(r.border).toBe(0);
        expect(r.shadow).toBe('none');
        expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(r.bg);
      }
    });

    test('the active step owns the largest type on the screen', async ({ page }) => {
      const sizes = await page.evaluate(() => {
        const px = (el) => parseFloat(getComputedStyle(el).fontSize) || 0;
        const leaves = [...document.querySelectorAll('#main-content *')]
          .filter(el => el.children.length === 0 && (el.textContent || '').trim());
        const active = document.querySelector('[data-guide-active]');
        const inActive = leaves.filter(el => active && active.contains(el));
        const outside = leaves.filter(el => !active || !active.contains(el));
        return {
          biggestActive: Math.max(0, ...inActive.map(px)),
          biggestOutside: Math.max(0, ...outside.map(px)),
        };
      });
      expect(sizes.biggestActive).toBeGreaterThan(sizes.biggestOutside);
    });

    test('nothing tappable is under the 44px floor', async ({ page }) => {
      const small = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('#main-content button, #main-content [role="button"]')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.height < 44) out.push((el.textContent || '').trim().slice(0, 24));
        }
        return out;
      });
      expect(small).toEqual([]);
    });

    test('scrolls vertically only, and clears the floating tray', async ({ page }) => {
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const main = document.querySelector('#main-content') || document.body;
        const tray = document.querySelector('nav[aria-label="Primary"]');
        return {
          overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
          padBottom: parseFloat(getComputedStyle(main).paddingBottom) || 0,
          hasTray: Boolean(tray),
        };
      });
      expect(m.overflowX).toBe(0);
      if (m.hasTray) expect(m.padBottom).toBeGreaterThanOrEqual(60);
    });
  });
}

test.describe('Home composition · what was removed', () => {
  test('the level context is one quiet line at the foot, not a module', async ({ page }) => {
    const home = new HomePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await home.goto();

    const foot = await page.evaluate(() => {
      const label = [...document.querySelectorAll('#main-content [role="img"]')]
        .find(el => /\d+ \/ \d+ words/.test(el.textContent || ''));
      const rail = document.querySelector('[data-level-rail]');
      if (!label || !rail) return null;
      return {
        size: parseFloat(getComputedStyle(label).fontSize),
        railHeight: Math.round(rail.getBoundingClientRect().height),
        // One rail, not the ten segments P14-5 built.
        pieces: rail.children.length,
      };
    });
    expect(foot).not.toBeNull();
    expect(foot.size).toBeLessThanOrEqual(12);
    expect(foot.railHeight).toBeLessThanOrEqual(4);
    expect(foot.pieces).toBe(1);
  });
});
