import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
// The bar's height, from the module that declares it — not a literal that can
// fall out of step with the bar again (navMetrics.js).
import { MOBILE_NAV_HEIGHT, MOBILE_NAV_RESERVE, NAV_TRAY_FLOAT } from '../../src/navMetrics.js';

// Where destinations actually LAND, measured — not whether their elements exist.
//
// This file exists because a blank screen passed 142 specs. `toBeVisible()`
// asks for a non-empty bounding box, and every spec that clicks something
// scrolls to it first, so a pushed screen rendering 3,714px below an empty
// full-height pane looked entirely healthy. Nothing here trusts existence:
// every assertion is a coordinate, a height, or a difference between the two.
//
// The assertions are invariants and ranges rather than pixel values — a header
// must intersect the first viewport, a covered pane must occupy no height —
// because the point is to catch a class of mistake, not to freeze a layout.

const PHONES = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
  { name: 'Pixel', width: 412, height: 915 },
];

// One representative per navigation class. Identical drills (tones, kana,
// builder…) share a shell with FillBlank and are not re-measured.
const DESTINATIONS = [
  { label: 'root: Home', path: '/', bar: true },
  { label: 'root: Cards', path: '/study', bar: false }, // immersive from the first card
  { label: 'root: Stories', path: '/stories', bar: true },
  { label: 'root: Practice', path: '/practice', bar: true },
  { label: 'push: Words', path: '/words', bar: true },
  { label: 'push: Dictionary', path: '/dictionary', bar: true },
  { label: 'push: Analyzer', path: '/analyzer', bar: true },
  { label: 'account: Profile', path: '/profile', bar: false },
  { label: 'account: Settings', path: '/settings', bar: false },
  { label: 'account: Languages', path: '/languages', bar: false },
  { label: 'full: Test', path: '/test', bar: false },
  { label: 'full: Writing', path: '/writing', bar: false },
  { label: 'full: Speaking', path: '/speak', bar: false },
  { label: 'full: FillBlank', path: '/fillblank', bar: false },
];

const NAV_HEIGHT = MOBILE_NAV_HEIGHT;
// P14-4: the bar is a floating tray, so "how tall is it" and "how much does a
// screen reserve" are two numbers now — the tray plus the float it sits on.
const NAV_RESERVE = MOBILE_NAV_RESERVE;

async function geometry(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('#main-content');
    const heads = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
      .filter((h) => h.getBoundingClientRect().height > 0);
    const overlay = document.querySelector('[data-nav-layer="overlay"]');
    return {
      scrollY: Math.round(window.scrollY),
      viewportH: window.innerHeight,
      docH: de.scrollHeight,
      overflowX: de.scrollWidth - de.clientWidth,
      paneHeights: Array.from(document.querySelectorAll('[data-tab-root]'))
        .filter((p) => getComputedStyle(p).display === 'none')
        .map((p) => Math.round(p.getBoundingClientRect().height)),
      overlayTop: overlay ? Math.round(overlay.getBoundingClientRect().top) : null,
      padBottom: main ? Math.round(parseFloat(getComputedStyle(main).paddingBottom) || 0) : null,
      headTop: heads[0] ? Math.round(heads[0].getBoundingClientRect().top) : null,
      barPresent: Boolean(document.querySelector('nav[aria-label="Primary"]')),
      barTop: (() => {
        const n = document.querySelector('nav[aria-label="Primary"]');
        return n ? Math.round(n.getBoundingClientRect().top) : null;
      })(),
      barHeight: (() => {
        const n = document.querySelector('nav[aria-label="Primary"]');
        return n ? Math.round(n.getBoundingClientRect().height * 100) / 100 : null;
      })(),
    };
  });
}

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    for (const dest of DESTINATIONS) {
      test(dest.label + ' lands where a learner can see it', async ({ page }) => {
        await page.goto(dest.path);
        await page.waitForTimeout(900);
        const g = await geometry(page);

        // 1. The screen's own title is inside the first viewport. This is the
        //    assertion that would have caught the 3,714px bug.
        expect(g.headTop).not.toBe(null);
        expect(g.headTop).toBeGreaterThanOrEqual(0);
        expect(g.headTop).toBeLessThan(g.viewportH);

        // 2. Arriving at a destination puts you at its top.
        expect(g.scrollY).toBe(0);

        // 3. Every covered pane is out of layout entirely.
        g.paneHeights.forEach((h) => expect(h).toBe(0));

        // 4. A pushed or presented screen begins at the very top of `main`.
        if (g.overlayTop !== null) expect(g.overlayTop).toBe(0);

        // 5. The tab bar is either there and paid for, or gone and its space
        //    reclaimed. Never reserved-but-absent, never present-but-overlapping.
        expect(g.barPresent).toBe(dest.bar);
        expect(g.padBottom).toBe(dest.bar ? NAV_RESERVE : 0);
        if (dest.bar) {
          // EXACTLY as tall as it declares, and its top exactly one reservation
          // up from the bottom edge. This used to allow ±8px, which is precisely
          // why a 4.25px drift between the bar (57.75px, emergent from its
          // padding and label) and the reservation (a flat 62px) lived here
          // unseen for as long as it did. Both numbers are declared now
          // (navMetrics.js), so there is no reason for any slack at all — and
          // since P14-4 the tray no longer touches the bottom edge, which is the
          // one thing the old form of this assertion asserted by accident.
          expect(g.barHeight).toBe(NAV_HEIGHT);
          expect(g.barTop).toBe(g.viewportH - NAV_RESERVE);
          expect(g.viewportH - (g.barTop + NAV_HEIGHT)).toBe(NAV_TRAY_FLOAT);
        }

        // Deliberately NOT asserted: a document-height ceiling. Several
        // legitimate screens scroll — Writing, Languages, Profile — and any
        // number picked here would be a guess about their content rather than a
        // rule about the shell. The failure mode that number was meant to catch
        // (a flow "accidentally extending the document") is a phantom viewport
        // contributed by a covered pane, and assertion 3 catches that exactly,
        // at its source.

        // 6. Never, at any phone width.
        expect(g.overflowX).toBe(0);
      });
    }
  });
}

test.describe('the Stories stack, measured', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('series and reader land on screen, and the reader takes the whole of it', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await page.waitForTimeout(400);

    let g = await geometry(page);
    expect(g.headTop).toBeGreaterThanOrEqual(0);
    expect(g.headTop).toBeLessThan(g.viewportH);
    expect(g.overlayTop).toBe(0);
    g.paneHeights.forEach((h) => expect(h).toBe(0));
    expect(g.barPresent).toBe(true);
    expect(g.padBottom).toBe(NAV_RESERVE);
    expect(g.overflowX).toBe(0);

    await page.getByRole('button', { name: /Chapter 1 · 月下的朋友/ }).click();
    await page.waitForTimeout(900);
    g = await geometry(page);
    expect(g.overlayTop).toBe(0);
    g.paneHeights.forEach((h) => expect(h).toBe(0));
    // A flow: no bar, no reserved space, and it does not extend the document.
    expect(g.barPresent).toBe(false);
    expect(g.padBottom).toBe(0);
    expect(g.docH).toBeLessThanOrEqual(g.viewportH + 8);
    expect(g.overflowX).toBe(0);
  });
});

test.describe('the native shell on a wide viewport', () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  test('is still the app, not the website', async ({ page }) => {
    // An iPad is 768pt across, which is exactly the width breakpoint. The web
    // rule cannot answer this one — inside the native shell there is no website
    // to fall back to (useIsMobile.shellIsMobile), and this is the only way to
    // exercise that branch from a browser.
    await page.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    });
    for (const path of ['/', '/stories', '/words']) {
      await page.goto(path);
      await page.waitForTimeout(900);
      const g = await geometry(page);
      expect(g.barPresent).toBe(true);          // bottom bar, not the sidebar
      expect(g.padBottom).toBe(NAV_RESERVE);
      expect(g.overflowX).toBe(0);
      g.paneHeights.forEach((h) => expect(h).toBe(0));
    }
    // And the desktop sidebar is nowhere.
    expect(await page.getByRole('navigation', { name: 'Main' }).count()).toBe(0);
  });
});

test.describe('scroll restoration', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const y = (page) => page.evaluate(() => Math.round(window.scrollY));

  test('every entry keeps its own offset, forwards and back', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /月下的朋友/ }).first().waitFor();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
    const shelf = await y(page);
    expect(shelf).toBeGreaterThan(0);

    await page.getByRole('button', { name: /月下的朋友/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await y(page)).toBe(0);

    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    const series = await y(page);

    await page.goBack();
    await page.waitForTimeout(600);
    expect(await y(page)).toBe(shelf);

    // Forward is the case that was broken: a browser Back is a POP, not a
    // commit, so the entry it LEFT was never measured and Forward landed at the
    // top instead of where the learner had been.
    await page.goForward();
    await page.waitForTimeout(600);
    expect(await y(page)).toBe(series);
  });

  test('a second pushed class behaves identically', async ({ page }) => {
    await page.goto('/practice');
    await page.waitForTimeout(900);

    // Scroll by bringing the target into view rather than by a fixed wheel
    // distance. `click()` auto-scrolls to whatever it is clicking, so a wheel
    // of N followed by a click on something below the fold navigates from a
    // DIFFERENT offset than the one the spec measured — and then correctly
    // restores that one, which reads as a restoration bug and is not.
    const dictionary = page.getByRole('button', { name: /Dictionary/i }).first();
    await dictionary.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const practice = await y(page);
    expect(practice).toBeGreaterThan(0);

    await dictionary.click();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname).toBe('/dictionary');
    expect(await y(page)).toBe(0);

    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(700);
    expect(new URL(page.url()).pathname).toBe('/practice');
    expect(await y(page)).toBe(practice);
  });

  test('dismissing the account stack returns the tab it was opened from, where it was', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /月下的朋友/ }).first().waitFor();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
    const shelf = await y(page);

    await page.getByRole('button', { name: /More/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Settings$/ }).first().click();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname).toBe('/settings');
    expect(await y(page)).toBe(0);

    // Settings is PUSHED inside the account overlay, so Back is Profile…
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(700);
    expect(new URL(page.url()).pathname).toBe('/profile');

    // …and dismissing the overlay lands on Stories, exactly where it was left.
    await page.getByRole('button', { name: /Close|Back/ }).first().click();
    await page.waitForTimeout(700);
    expect(new URL(page.url()).pathname).toBe('/stories');
    expect(await y(page)).toBe(shelf);
  });
});
