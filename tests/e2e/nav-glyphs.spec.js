import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// P14-3's browser half.
//
// navGlyphs.test.jsx proves what the family DECLARES — five glyphs, one viewBox,
// two states, no raster. Three things it cannot prove, because jsdom has no
// layout and no SVG geometry engine:
//
//   1. **Nothing overflows the viewBox.** `getBBox()` is the only honest answer,
//      and jsdom does not implement it. A path that reaches 33.4 renders clipped
//      on the bar and looks like a drawing mistake.
//   2. **Optical weight.** P8's whole finding was that equal `size` props are not
//      equal ink: Practice out-inked Cards by 11 px² and the bar read wrong on a
//      device. Same question, new family — so this spec rasterises each
//      silhouette and counts alpha, the same measurement that chose
//      NAV_ICON_PX.
//   3. **The shipping bar is untouched.** P14-3 is not allowed to change
//      MobileNav, so the last describe asserts the real bar still has its five
//      tabs, its labels, its 58px height and its own flat glyphs.
//
// Both themes, three widths. Screenshots and the ink table are written to
// P14_OUT so the report quotes measurements.

const OUT = process.env.P14_OUT || '/tmp/p14-glyphs';
const BOX = 32;
// The production bar, in shipping order — Cards is `study` and it is centred.
const NAV_KEYS = ['home', 'stories', 'study', 'practice', 'more'];
// Drawn to the same rules, deliberately not a tab.
const IDENTITY_KEYS = ['profile'];
const ALL_KEYS = [...NAV_KEYS, ...IDENTITY_KEYS];
// The family's own recommended ramp (navGlyphFamily.js NAV_GLYPH_PX), duplicated
// here so the spec can assert the ink it produces without importing app code into
// a Playwright process.
const RAMP = { study: 26, stories: 24, practice: 23.5, home: 23, more: 22 };

async function setTheme(page, theme) {
  await page.route('**/mock.supabase.co/rest/v1/profiles**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const row = { ...PROFILE, theme };
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
        'content-range': '0-0/*',
      },
      body: JSON.stringify(wantsObject ? row : [row]),
    });
  });
}

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390, 430]) {
    test.describe('P14-3 glyphs · ' + theme + ' · ' + width, () => {
      test.use({ viewport: { width, height: 900 } });

      test.beforeEach(async ({ page }) => {
        await setTheme(page, theme);
        await page.emulateMedia({ colorScheme: theme });
        await page.goto('/dev');
        await page.locator('[data-nav-glyph-gallery]').waitFor();
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
      });

      test('draws all five in both states at every size', async ({ page }) => {
        // Scoped by GRID rather than by size: the "intended navigation size" grid
        // hands every glyph a different number, so selecting on size alone would
        // sweep cells out of three different grids and count them together.
        for (const grid of ['20px', '24px', '28px', '32px', 'intended navigation size']) {
          for (const state of ['active', 'inactive']) {
            const cells = page.locator(
              '[data-glyph-grid="' + grid + '"] [data-glyph-state="' + state + '"]',
            );
            await expect(cells, grid + ' / ' + state).toHaveCount(5);
          }
        }
        // And Profile is present but kept out of every production grid.
        await expect(page.locator('[data-glyph-section="identity"] [data-glyph="profile"]'))
          .toHaveCount(6);
        await expect(page.locator('[data-glyph-section="production"] [data-glyph="profile"]'))
          .toHaveCount(0);
        // And every one of them actually drew something.
        const empty = await page.evaluate(() => {
          const bad = [];
          for (const svg of document.querySelectorAll('[data-nav-glyph-gallery] svg')) {
            const b = svg.getBBox();
            if (b.width < 4 || b.height < 4) {
              bad.push(svg.closest('[data-glyph]')?.getAttribute('data-glyph') || '?');
            }
          }
          return bad;
        });
        expect(empty, 'glyphs that drew nothing').toEqual([]);
      });

      test('no geometry escapes the 32x32 viewBox', async ({ page }) => {
        const over = await page.evaluate((box) => {
          const out = [];
          for (const svg of document.querySelectorAll('[data-nav-glyph-gallery] svg')) {
            const b = svg.getBBox();
            const cell = svg.closest('[data-glyph]');
            const who = (cell?.getAttribute('data-glyph') || '?')
              + '/' + (cell?.getAttribute('data-glyph-state') || 'strip');
            const r = (n) => Math.round(n * 100) / 100;
            if (b.x < -0.01 || b.y < -0.01 || b.x + b.width > box + 0.01 || b.y + b.height > box + 0.01) {
              out.push({ who, x: r(b.x), y: r(b.y), right: r(b.x + b.width), bottom: r(b.y + b.height) });
            }
          }
          return out;
        }, BOX);
        expect(over, 'geometry outside the viewBox').toEqual([]);
      });

      test('active and inactive share the same silhouette', async ({ page }) => {
        // The rule the whole family hangs on: selection adds light, never a
        // different drawing.
        //
        // getBBox() cannot settle this, and the reason is worth knowing — it
        // measures GEOMETRY, not what renders. The selected state paints facets
        // that deliberately overshoot and get clipped back to the silhouette
        // (Profile's lit crescent is a full-size circle nudged up-left), so its
        // geometry box is legitimately 2 units bigger than the drawing. Rasterise
        // both states instead, paint them the same flat colour, and compare the
        // alpha channels pixel by pixel.
        const diffs = await page.evaluate(async (keys) => {
          const PX = 256;
          const alpha = (markup) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = PX; c.height = PX;
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0, PX, PX);
              const d = ctx.getImageData(0, 0, PX, PX).data;
              const out = new Uint8Array(PX * PX);
              for (let i = 0; i < out.length; i += 1) out[i] = d[i * 4 + 3];
              resolve(out);
            };
            img.onerror = () => resolve(null);
            img.src = 'data:image/svg+xml;base64,' + btoa(markup);
          });
          const flat = (state, key) => {
            const cell = document.querySelector(
              '[data-glyph="' + key + '"][data-glyph-state="' + state + '"][data-glyph-size="32"]',
            );
            const svg = cell.querySelector('svg').cloneNode(true);
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('width', PX);
            svg.setAttribute('height', PX);
            // One flat colour for both states, so the comparison is about SHAPE.
            return svg.outerHTML.replace(/var\(--[a-z-]+\)|currentColor/g, '#000');
          };
          const out = {};
          for (const key of keys) {
            const [on, off] = await Promise.all([
              alpha(flat('active', key)), alpha(flat('inactive', key)),
            ]);
            // Only pixels that are SOLID in one state and EMPTY in the other
            // count. Clipping a shape by its own outline squares the edge alpha
            // (a 50% pixel becomes 25%), so every antialiased edge differs by
            // ~64/255 no matter the resolution — on Practice, whose four tiles
            // have twice the perimeter per unit area of anything else in the
            // family, that alone is 4.4% of the drawing. A real shape change moves
            // solid regions, and no amount of antialiasing turns opaque into
            // transparent.
            let differing = 0;
            let inked = 0;
            for (let i = 0; i < on.length; i += 1) {
              if (off[i] > 8) inked += 1;
              if ((on[i] > 250 && off[i] < 5) || (off[i] > 250 && on[i] < 5)) differing += 1;
            }
            out[key] = { differing, inked, pct: Math.round((differing / inked) * 1000) / 10 };
          }
          return out;
        }, ALL_KEYS);
        // What this catches, verified by breaking it: a facet that fails to cover
        // part of the silhouette (23.6% on Practice with one tile dropped) and a
        // mask applied to one state only (33.2% on Home). What it deliberately
        // cannot catch is a facet drawn too BIG — the clip path eats the overshoot,
        // which is the construction working rather than the test being weak.
        for (const key of ALL_KEYS) {
          expect(diffs[key].inked, key + ' drew nothing').toBeGreaterThan(200);
          expect(diffs[key].pct, key + ' silhouette differs by ' + diffs[key].pct + '%')
            .toBeLessThan(0.2);
        }
      });

      test('the glyph is never independently focusable or announced', async ({ page }) => {
        const bad = await page.evaluate(() => {
          const out = [];
          for (const svg of document.querySelectorAll('[data-nav-glyph-gallery] svg')) {
            if (svg.getAttribute('aria-hidden') !== 'true') out.push('not aria-hidden');
            if (svg.getAttribute('focusable') !== 'false') out.push('focusable missing');
            if (svg.hasAttribute('tabindex')) out.push('has tabindex');
            if (svg.querySelector('title, desc')) out.push('has title/desc');
          }
          return [...new Set(out)];
        });
        expect(bad).toEqual([]);
      });

      test('nothing in the gallery overflows the phone', async ({ page }) => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
      });
    });
  }
}

// ── The family measurement ─────────────────────────────────────────────────
// One run, one width — this is evidence for the report rather than a per-viewport
// contract.
for (const theme of ['light', 'dark']) {
  test.describe('P14-3 family weight · ' + theme, () => {
    test.use({ viewport: { width: 390, height: 900 } });

    test('records ink coverage and screenshots the family', async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/dev');
      await page.locator('[data-nav-glyph-gallery]').waitFor();

      // Ink coverage, P8's measurement: rasterise the silhouette and sum alpha.
      // The INACTIVE glyph is the right thing to measure — it is the union of the
      // shapes with no light on it, i.e. the family's optical weight with colour
      // taken out of the question. Painted solid black in a standalone SVG, since
      // a `var()` does not resolve outside the document.
      const ink = await page.evaluate(async (keys) => {
        const draw = (markup, px) => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = px; c.height = px;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, px, px);
            const d = ctx.getImageData(0, 0, px, px).data;
            let sum = 0;
            for (let i = 3; i < d.length; i += 4) sum += d[i] / 255;
            resolve(sum);
          };
          img.onerror = () => resolve(null);
          img.src = 'data:image/svg+xml;base64,' + btoa(markup);
        });
        const out = {};
        for (const key of keys) {
          for (const px of [22, 32]) {
            const cell = document.querySelector(
              '[data-glyph="' + key + '"][data-glyph-state="inactive"][data-glyph-size="32"]',
            );
            const svg = cell.querySelector('svg').cloneNode(true);
            svg.setAttribute('width', px);
            svg.setAttribute('height', px);
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const markup = svg.outerHTML.replace(/var\(--[a-z-]+\)/g, '#000');
            out[key + '@' + px] = Math.round(await draw(markup, px));
          }
        }
        return out;
      }, ALL_KEYS);

      // What the family looks like at the size each tab is actually drawn: the
      // number that matters, since ink scales with the square of the size.
      const atRamp = {};
      for (const key of NAV_KEYS) {
        atRamp[key] = Math.round(ink[key + '@22'] * (RAMP[key] / 22) ** 2);
      }
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(
        OUT + '/ink.' + theme + '.json',
        JSON.stringify({ perGlyph: ink, atRecommendedRamp: atRamp, ramp: RAMP }, null, 1),
      );

      // ── One scale ──────────────────────────────────────────────────────────
      // The drawings themselves are all one weight, which is the thing the first
      // family got wrong: at 22px it measured 102 to 150, and multiplying that by
      // the bar's own 27.5/20 ramp compounded into a 2.3x spread that read as one
      // icon having been designed at a different scale. Every glyph now sits
      // inside 15% of every other.
      const at22 = ALL_KEYS.map(k => ink[k + '@22']);
      for (const [i, n] of at22.entries()) expect(n, ALL_KEYS[i] + ' ink').toBeGreaterThan(40);
      expect(
        Math.max(...at22) / Math.min(...at22),
        'the drawings are no longer one scale: ' + JSON.stringify(at22),
      ).toBeLessThan(1.15);

      // ── And the hierarchy comes from the ramp ───────────────────────────────
      const ranked = NAV_KEYS.slice().sort((a, b) => atRamp[b] - atRamp[a]);
      // Cards first, More last, Stories and Practice above Home.
      expect(ranked[0], 'Cards is not the heaviest tab').toBe('study');
      expect(ranked[4], 'More is not the lightest tab').toBe('more');
      expect(atRamp.stories).toBeGreaterThan(atRamp.home);
      expect(atRamp.practice).toBeGreaterThan(atRamp.home);
      // Cards stays clearly primary — but nothing like twice anything else, which
      // is the defect this amendment fixes. P8's device-approved bar had Practice
      // at ~81% of Cards; Stories and Practice land in that region here.
      const rel = k => atRamp[k] / atRamp.study;
      expect(rel('stories'), 'Stories ' + Math.round(rel('stories') * 100) + '% of Cards')
        .toBeGreaterThan(0.72);
      expect(rel('stories')).toBeLessThan(0.92);
      expect(rel('practice')).toBeGreaterThan(0.7);
      expect(rel('more'), 'More ' + Math.round(rel('more') * 100) + '% of Cards')
        .toBeGreaterThan(0.55);
      expect(
        Math.max(...NAV_KEYS.map(k => atRamp[k])) / Math.min(...NAV_KEYS.map(k => atRamp[k])),
        'visual mass spread across the bar: ' + JSON.stringify(atRamp),
      ).toBeLessThan(1.6);

      await page.locator('[data-nav-glyph-gallery]')
        .screenshot({ path: OUT + '/family.' + theme + '.png' });
      await page.screenshot({ path: OUT + '/dev.' + theme + '.png', fullPage: true });
    });
  });
}

// ── The bar P14-3 is not allowed to touch ──────────────────────────────────
// The amendment's first finding: the production bar stays Home · Stories · Cards ·
// Practice · More, and Profile stays where it is. This is the assertion that says
// so — it fails the moment a later phase swaps More out without meaning to.
test.describe('P14-3 leaves the shipping bar alone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('still five tabs, same labels, same height, same flat glyphs', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = page.locator('nav').filter({ has: page.getByRole('button', { name: 'Cards' }) }).first();
    const shape = await bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const tabs = [...el.querySelectorAll('button')];
      return {
        height: Math.round(r.height),
        labels: tabs.map(t => (t.textContent || '').trim()),
        // The bar's own glyphs are NavIcons.jsx's 24x24 family. A 32x32 viewBox
        // down here would mean the new family had leaked onto the bar.
        viewBoxes: [...new Set(tabs.map(t => t.querySelector('svg')?.getAttribute('viewBox')))],
      };
    });
    expect(shape.labels).toEqual(['Home', 'Stories', 'Cards', 'Practice', 'More']);
    expect(shape.labels, 'Profile must not become a tab').not.toContain('Profile');
    expect(shape.height).toBe(58);
    expect(shape.viewBoxes).toEqual(['0 0 24 24']);
  });

  test('still reaches Profile through the More sheet', async ({ page }) => {
    // The routing half of the same promise. If Profile ever moves onto the bar it
    // has to leave here, and that is a navigation decision, not a visual one.
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: /Profile/ })).toBeVisible();
  });
});
