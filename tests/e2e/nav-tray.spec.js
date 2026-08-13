import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';
import {
  MOBILE_NAV_HEIGHT, MOBILE_NAV_RESERVE, NAV_TRAY_INSET, NAV_TRAY_FLOAT,
  NAV_TRAY_RADIUS_NAME,
} from '../../src/navMetrics.js';
import { RADIUS } from '../../src/shape.js';
import { NAV_ICON_PX } from '../../src/navEmphasis.js';

// P14-4's contract: the bar is a floating tray now.
//
// nav-bar.spec.js already owns everything about the bar that did NOT change —
// the order, Cards in the centre, five real targets, selection without colour,
// the More sheet, routing, Back. This file owns what did: that the tray is inset
// from both edges rather than spanning them, rounded on all four corners rather
// than none, solid rather than glass, floating clear of the bottom edge, and that
// every screen still keeps the whole of it clear.
//
// The two things it is really protecting:
//
//   1. **Content clearance.** A floating tray claims MORE bottom edge than a flush
//      bar (the tray plus its float), and the reservation lives in exactly one
//      place — MOBILE_NAV_SPACE, which `main`'s padding, the reader's bottom
//      offset and the feedback button all read. If a screen ever grows its own
//      per-screen padding instead, this is what notices.
//   2. **Study.** Every pixel the tray takes is a pixel the flashcard does not
//      get, and the float floor was chosen at 6px specifically so no current
//      device changes studyLayout density band. The last describe measures the
//      grade buttons on the two phones where it is tightest.

const OUT = process.env.P14_OUT || '/tmp/p14-tray';
const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];
const ORDER = ['Home', 'Stories', 'Cards', 'Practice', 'More'];
const TRAY_RADIUS = RADIUS[NAV_TRAY_RADIUS_NAME];

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

// Everything about the tray's own box, in one evaluate.
async function trayGeometry(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const round = n => Math.round(n * 100) / 100;
    return {
      left: round(r.left),
      right: round(window.innerWidth - r.right),
      top: round(r.top),
      bottomGap: round(window.innerHeight - r.bottom),
      width: round(r.width),
      height: round(r.height),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      radii: [
        cs.borderTopLeftRadius, cs.borderTopRightRadius,
        cs.borderBottomRightRadius, cs.borderBottomLeftRadius,
      ],
      background: cs.backgroundColor,
      backdropFilter: cs.backdropFilter,
      borderTopWidth: cs.borderTopWidth,
      borderBottomWidth: cs.borderBottomWidth,
      borderColor: cs.borderTopColor,
      shadow: cs.boxShadow,
      overflow: cs.overflow,
      // The page ground has to be genuinely visible around the tray, or it is
      // not a floating object — it is a bar with rounded corners.
      pageBehind: getComputedStyle(document.body).backgroundColor
        || getComputedStyle(document.documentElement).backgroundColor,
      padBottom: Math.round(parseFloat(getComputedStyle(
        document.querySelector('#main-content'),
      ).paddingBottom)),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const phone of PHONES) {
  test.describe('the tray at ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is inset from both edges, not spanning them', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const t = await trayGeometry(page);

      expect(t.left).toBe(NAV_TRAY_INSET);
      expect(t.right).toBe(NAV_TRAY_INSET);
      expect(t.width).toBe(phone.width - NAV_TRAY_INSET * 2);
      // The claim, stated the other way round: the tray does not touch either
      // edge. A full-width slab is what this replaced.
      expect(t.width).toBeLessThan(t.viewport.w);
      expect(t.overflowX).toBe(0);
    });

    test('floats clear of the bottom edge', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const t = await trayGeometry(page);

      // Chromium reports env(safe-area-inset-bottom) as 0, so this measures the
      // float FLOOR — the case that applies to every phone without a home
      // indicator. On a device with one, the inset is larger and wins the max().
      expect(t.bottomGap).toBe(NAV_TRAY_FLOAT);
      expect(t.bottomGap).toBeGreaterThan(0);
      expect(t.height).toBe(MOBILE_NAV_HEIGHT);
      // And its top is exactly one reservation up from the bottom.
      expect(t.top).toBe(phone.height - MOBILE_NAV_RESERVE);
    });

    test('is rounded on all four corners', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const t = await trayGeometry(page);

      expect(new Set(t.radii).size).toBe(1);
      expect(parseFloat(t.radii[0])).toBe(TRAY_RADIUS);
      // Not a pill, which would read as a different kind of control.
      expect(parseFloat(t.radii[0])).toBeLessThan(MOBILE_NAV_HEIGHT / 2);
      // And a border all the way round, not just along the top.
      expect(parseFloat(t.borderTopWidth)).toBe(1);
      expect(parseFloat(t.borderBottomWidth)).toBe(1);
    });

    test('gives every tab a full-size target', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const tabs = await page.evaluate(() => Array.from(
        document.querySelectorAll('nav[aria-label="Primary"] button'),
      ).map((b) => {
        const r = b.getBoundingClientRect();
        const svg = b.querySelector('svg').getBoundingClientRect();
        return {
          name: b.textContent.trim(),
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
          glyph: Math.round(svg.width * 100) / 100,
        };
      }));

      expect(tabs.map(t => t.name)).toEqual(ORDER);
      for (const t of tabs) {
        expect(t.w, t.name + ' width').toBeGreaterThanOrEqual(44);
        expect(t.h, t.name + ' height').toBeGreaterThanOrEqual(44);
      }
      // Equal columns: a bigger glyph must not buy a bigger hitbox.
      //
      // Asserted as a SPREAD, not as one identical value, and CI is why. The old
      // full-width bar divided 390 by five and got 78 exactly; the tray's content
      // box is 364 and 364/5 is 72.8, so there is a remainder for the flex row to
      // hand out. Chromium hands it out differently on different builds — five
      // identical fractional widths on the sandbox's browser, two values differing
      // in the second decimal on the CI runner — and no inset makes the width
      // divisible by five at every phone width. Half a pixel is far tighter than
      // any real inequality and far looser than an engine's rounding.
      const widths = tabs.map(t => t.w);
      expect(Math.max(...widths) - Math.min(...widths),
        'column widths: ' + JSON.stringify(widths)).toBeLessThanOrEqual(0.5);
      // Cards is the biggest glyph and More the smallest, and every size is a whole
      // pixel — a half-pixel glyph cannot centre symmetrically in the row.
      const glyphs = tabs.map(t => t.glyph);
      expect(Math.max(...glyphs)).toBe(NAV_ICON_PX.study);
      expect(Math.min(...glyphs)).toBe(NAV_ICON_PX.more);
      for (const g of glyphs) expect(Number.isInteger(g), 'glyph ' + g).toBe(true);
      // The tab is the target, never the glyph — every glyph is smaller than the
      // 44px floor and none of them is the thing being tapped.
      for (const t of tabs) expect(t.glyph, t.name + ' glyph').toBeLessThan(44);
    });

    test('reserves itself once, at the shell, and nothing hides behind it', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const t = await trayGeometry(page);
      // One reservation, the tray plus its float, on `main` — not per screen.
      expect(t.padBottom).toBe(MOBILE_NAV_RESERVE);

      // The real test of clearance: scroll to the very bottom of each tab root
      // and check that nothing interactive ends up under the tray.
      for (const path of ['/', '/stories', '/practice']) {
        await page.goto(path);
        await page.waitForTimeout(900);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(250);
        const covered = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          const nr = nav.getBoundingClientRect();
          const out = [];
          for (const el of document.querySelectorAll(
            '#main-content button, #main-content a, #main-content [role="button"]',
          )) {
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            // Off-screen entirely is fine; overlapping the tray is not.
            if (r.bottom < 0 || r.top > window.innerHeight) continue;
            const overlapY = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top);
            const overlapX = Math.min(r.right, nr.right) - Math.max(r.left, nr.left);
            if (overlapY > 2 && overlapX > 2) {
              out.push({
                what: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 32),
                bottom: Math.round(r.bottom),
                trayTop: Math.round(nr.top),
              });
            }
          }
          return out;
        });
        expect(covered, path + ' has controls behind the tray').toEqual([]);
      }
    });
  });
}

for (const theme of ['light', 'dark']) {
  test.describe('the tray surface in ' + theme, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('is solid and carries no blur', async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe(theme);
      const t = await trayGeometry(page);

      // Fully opaque: the glass slab is gone, and with it a compositing layer on
      // every scroll of every screen.
      const alpha = (t.background.match(/[\d.]+/g) || [])[3];
      expect(alpha === undefined || Number(alpha) === 1, t.background).toBe(true);
      expect(t.backdropFilter === 'none' || !t.backdropFilter).toBe(true);
      expect(t.overflow).toBe('hidden');
    });

    test('separates from the page ground it floats on', async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();

      // Sampled as pixels rather than trusted as token names: the tray's own
      // fill, the page ground just below it, and the border between them.
      const step = await page.evaluate(() => {
        const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const page_ = rgb(getComputedStyle(document.querySelector('#main-content')).backgroundColor
          .replace('rgba(0, 0, 0, 0)', getComputedStyle(document.body).backgroundColor));
        const root = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
          ? 'x' : 'x');
        const cs = getComputedStyle(nav);
        return {
          tray: rgb(cs.backgroundColor),
          border: rgb(cs.borderTopColor),
          ground: page_.length === 3 ? page_ : root,
          shadow: cs.boxShadow,
        };
      });

      // A visible step between the object and the ground, in whichever direction
      // the theme puts it — near-white on warm paper in light, a warm lift on
      // near-black in dark.
      const delta = Math.max(...[0, 1, 2].map(i => Math.abs(step.tray[i] - step.ground[i])));
      expect(delta, 'tray vs page: ' + JSON.stringify(step)).toBeGreaterThan(3);
      // …and not a dramatic one. The tray is lifted, not spotlit.
      expect(delta).toBeLessThan(40);
      // The edge is drawn, and it is a stronger step than the surface itself —
      // which is what does the separating in dark, where a black shadow on a
      // near-black page contributes nothing.
      const edge = Math.max(...[0, 1, 2].map(i => Math.abs(step.border[i] - step.ground[i])));
      expect(edge, 'border vs page').toBeGreaterThan(delta);
      // A lit top edge, for the same reason.
      expect(step.shadow).toContain('inset');
    });

    test('draws the selected tab dimensionally, the rest flat', async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/stories');
      await page.locator('nav[aria-label="Primary"]').waitFor();
      await page.waitForTimeout(600);

      const tabs = await page.evaluate(() => Array.from(
        document.querySelectorAll('nav[aria-label="Primary"] button'),
      ).map((b) => {
        const svg = b.querySelector('svg');
        // The dimensional treatment IS the tones: the selected glyph paints three
        // planes of the brand, the resting one paints its silhouette once. Both
        // draw the same shape, which is the family's whole rule — so "is it
        // selected" is a question about tone count, not about outline vs fill.
        const painted = Array.from(svg.querySelectorAll('*'))
          .filter(n => !n.closest('mask'))
          .map(n => n.getAttribute('fill'))
          .filter(Boolean);
        const label = b.children[b.children.length - 1];
        return {
          name: b.textContent.trim(),
          current: b.getAttribute('aria-current'),
          tones: new Set(painted.filter(f => f.indexOf('var(--primary') === 0
            || f.indexOf('var(--plum') === 0)).size,
          flatFills: painted.filter(f => f.indexOf('var(--text') === 0).length,
          labelWeight: Number(getComputedStyle(label).fontWeight),
        };
      }));

      const active = tabs.find(t => t.current === 'page');
      expect(active.name).toBe('Stories');
      // Three planes at least: lit, front, shaded.
      expect(active.tones).toBeGreaterThanOrEqual(3);
      expect(active.flatFills).toBe(0);
      expect(active.labelWeight).toBeGreaterThan(600);
      for (const t of tabs.filter(x => x.current !== 'page')) {
        expect(t.tones, t.name + ' is toned while resting').toBe(0);
        expect(t.flatFills, t.name + ' has no flat silhouette').toBe(1);
        expect(t.labelWeight, t.name).toBeLessThanOrEqual(600);
      }
    });

    test('keeps every resting glyph in the same ink', async ({ page }) => {
      // P14-4 dropped More's extra colour step. All four resting glyphs are one
      // tone now, which is what makes them a set.
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const inks = await page.evaluate(() => Array.from(
        document.querySelectorAll('nav[aria-label="Primary"] button'),
      ).filter(b => b.getAttribute('aria-current') !== 'page')
        .map((b) => {
          // `svg > g`, not `svg g`: the mask's own black group lives in <defs>
          // and comes first in document order.
          const g = b.querySelector('svg > g');
          return { name: b.textContent.trim(), fill: g && g.getAttribute('fill') };
        }));
      expect(inks).toHaveLength(4);
      expect(new Set(inks.map(i => i.fill)).size, JSON.stringify(inks)).toBe(1);
      expect(inks[0].fill).toBe('var(--text-muted)');
    });
  });
}

test.describe('Cards emphasis, on a solid tray', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is the largest glyph, in the centre column, without a bigger target', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const c = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const tabs = Array.from(nav.querySelectorAll('button'));
      const cards = tabs.find(b => b.textContent.trim() === 'Cards');
      const svg = cards.querySelector('svg').getBoundingClientRect();
      const shell = cards.querySelector('svg').parentElement;
      const sr = shell.getBoundingClientRect();
      return {
        index: tabs.indexOf(cards),
        glyph: Math.round(svg.width * 100) / 100,
        others: tabs.filter(b => b !== cards)
          .map(b => Math.round(b.querySelector('svg').getBoundingClientRect().width * 100) / 100),
        centreOffset: Math.abs((svg.left + svg.width / 2) - window.innerWidth / 2),
        shell: { w: Math.round(sr.width), h: Math.round(sr.height) },
        shellRadius: parseFloat(getComputedStyle(shell).borderRadius),
        // Not a floating button: the container stays inside the tray.
        insideTray: sr.top > nav.getBoundingClientRect().top
          && sr.bottom < nav.getBoundingClientRect().bottom,
      };
    });

    expect(c.index).toBe(2);
    expect(c.centreOffset).toBeLessThanOrEqual(1);
    expect(c.glyph).toBe(NAV_ICON_PX.study);
    for (const o of c.others) expect(c.glyph).toBeGreaterThan(o);
    // Restrained: the step over its loudest neighbour is small, because the
    // glyphs are all one weight and the ramp only has to express hierarchy.
    expect(c.glyph - Math.max(...c.others)).toBeLessThanOrEqual(3);
    // The container is a rounded rectangle inside the tray — not a circle, not a
    // notch, not a raised button, and it does not break the tray's silhouette.
    expect(c.shell).toEqual({ w: 42, h: 34 });
    expect(c.shellRadius).toBeLessThan(c.shell.h / 2);
    expect(c.insideTray).toBe(true);
  });

  test('lights its container only when selected', async ({ page }) => {
    await page.route('**/rest/v1/vocabulary*', route => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '[]',
    }));
    const read = () => page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('nav[aria-label="Primary"] button'))
        .find(b => b.textContent.trim() === 'Cards');
      const shell = cards.querySelector('svg').parentElement;
      const cs = getComputedStyle(shell);
      return {
        selected: cards.getAttribute('aria-current') === 'page',
        border: cs.borderTopColor,
        shadow: cs.boxShadow,
      };
    });

    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const rest = await read();
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    const on = await read();

    expect(rest.selected).toBe(false);
    expect(on.selected).toBe(true);
    // The one thing P14-4 added: a lit top edge on the selected container, so it
    // agrees with the glyph inside it about where the light is.
    expect(rest.shadow === 'none' || rest.shadow.indexOf('inset') === -1).toBe(true);
    expect(on.shadow).toContain('inset');
    expect(rest.border).not.toBe(on.border);
  });
});

test.describe('Study still gets its screen', () => {
  // Two states, and they are different problems.
  //
  // With a card on screen the tray is HIDDEN — the one documented exception in
  // NAV-MODEL §8.2 — so there is nothing to clear and the only claim is that the
  // shell is still exactly one reservation short of the viewport, which is what
  // keeps the grade band above the fold. (It is also 66px of blank screen while
  // the tray is absent: pre-existing, 58px before P14-4, and a Study fix rather
  // than a tray one. docs/BACKLOG.md carries it with the measurement.)
  //
  // On the recap the tray IS there, and that is where clearance matters.
  for (const phone of [
    { name: 'iPhone SE', width: 320, height: 568 },
    { name: 'iPhone SE 3', width: 375, height: 667 },
    { name: 'iPhone 14', width: 390, height: 844 },
  ]) {
    test(phone.name + ': the card shell is one reservation short of the viewport', async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await page.goto('/study');
      await page.waitForTimeout(1800);
      const g = await page.evaluate(() => {
        const main = document.querySelector('#main-content');
        const shell = Array.from(main.querySelectorAll('div')).find((d) => {
          const cs = getComputedStyle(d);
          return cs.overflow === 'hidden' && cs.display === 'flex'
            && cs.flexDirection === 'column' && d.style.height;
        });
        return {
          shellH: shell ? Math.round(shell.getBoundingClientRect().height) : null,
          viewportH: window.innerHeight,
          bar: Boolean(document.querySelector('nav[aria-label="Primary"]')),
          docH: document.documentElement.scrollHeight,
        };
      });

      expect(g.shellH).toBe(g.viewportH - MOBILE_NAV_RESERVE);
      // Height-LOCKED: the whole point is that nothing scrolls, so the grade
      // band cannot fall below the fold.
      expect(g.docH).toBeLessThanOrEqual(g.viewportH);

      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(OUT + '/study.' + phone.name.replace(/\s+/g, '-') + '.json',
        JSON.stringify(g, null, 1));
    });
  }

  test('the recap clears the tray, grade band and all', async ({ page }) => {
    // An empty curriculum lands Study on its recap instead of on a card, which is
    // the one way to see the Cards tab selected — and the only Study state where
    // the tray is on screen at the same time as the content.
    await page.route('**/rest/v1/vocabulary*', route => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '[]',
    }));
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);

    const covered = await page.evaluate(() => {
      const nr = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect();
      return Array.from(document.querySelectorAll('#main-content button'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return false;
          if (r.bottom < 0 || r.top > window.innerHeight) return false;
          return Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top) > 2
            && Math.min(r.right, nr.right) - Math.max(r.left, nr.left) > 2;
        })
        .map(el => (el.textContent || '').trim().slice(0, 32));
    });
    expect(covered, 'recap controls behind the tray').toEqual([]);
  });
});

// ── Nothing underneath moved ────────────────────────────────────────────────
// nav-bar.spec.js covers this in depth; these are the three that would break
// first if the tray's chrome had been built by rewriting the component rather
// than restyling it.
test.describe('the navigation model is untouched', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('More still opens a sheet with Profile in it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More menu' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Profile/ })).toBeVisible();
    // The sheet rises out of the tray, so its top corner must be at least as
    // round as the tray's. It is 22 against the tray's 18 — a pre-existing
    // mismatch P14-4 deliberately did not touch, since the brief froze the sheet;
    // docs/BACKLOG.md carries it.
    const radius = await sheet.evaluate(el => getComputedStyle(el).borderTopLeftRadius);
    expect(parseFloat(radius)).toBeGreaterThanOrEqual(TRAY_RADIUS);
  });

  test('a tab still routes to its own tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
  });

  test('the tray still gets out of the way for a flashcard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'Cards', exact: true }).click();
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });

  test('reads the same with motion turned off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/stories');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(400);
    const t = await trayGeometry(page);
    expect(t.height).toBe(MOBILE_NAV_HEIGHT);
    expect(t.left).toBe(NAV_TRAY_INSET);
    const active = await page.evaluate(() => Array.from(
      document.querySelectorAll('nav[aria-label="Primary"] button'),
    ).find(b => b.getAttribute('aria-current') === 'page').textContent.trim());
    expect(active).toBe('Stories');
  });
});
