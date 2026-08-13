import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { MOBILE_NAV_HEIGHT, MOBILE_NAV_RESERVE } from '../../src/navMetrics.js';

// The bottom bar's contract.
//
// The bar answers one question — "where do I want to go" — and the prototype
// that answers it is deliberately quieter than what came before: no waiting
// count, no accent rule along the top edge, and a five-glyph icon family drawn
// for this app rather than borrowed from a library. Cards sits in the physical
// centre because it is the action a learner repeats dozens of times a day.
//
// What is asserted here is everything a screenshot cannot tell you: the order,
// that selection survives without colour, that a bigger Cards glyph does not
// buy itself a bigger tap target or a taller bar, and that none of it moved the
// navigation model underneath.

const PHONE = { width: 390, height: 844 };
const PHONES = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
];

const ORDER = ['Home', 'Stories', 'Cards', 'Practice', 'More'];

// An empty curriculum lands Study on its recap instead of on a card, which is
// the one way to see the Cards tab SELECTED — a card on screen hides the bar.
async function emptyQueue(page) {
  await page.route('**/rest/v1/vocabulary*', (route) => route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: '[]',
  }));
}

async function barState(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    const nr = nav.getBoundingClientRect();
    return {
      height: Math.round(nr.height * 100) / 100,
      // Anything absolutely positioned directly inside the bar would be the old
      // marker: the accent rule that used to ride the top edge.
      floaters: Array.from(nav.children)
        .filter((el) => getComputedStyle(el).position === 'absolute').length,
      text: nav.textContent,
      tabs: Array.from(nav.querySelectorAll('button')).map((b) => {
        const r = b.getBoundingClientRect();
        const svg = b.querySelector('svg');
        const sr = svg.getBoundingClientRect();
        const label = b.children[b.children.length - 1];
        const ls = getComputedStyle(label);
        return {
          name: label.textContent.trim(),
          current: b.getAttribute('aria-current'),
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
          left: Math.round(r.left * 100) / 100,
          icon: Math.round(sr.width * 100) / 100,
          iconCentre: Math.round((sr.top + sr.height / 2 - nr.top) * 100) / 100,
          labelSize: ls.fontSize,
          labelWeight: Number(ls.fontWeight),
          labelColor: ls.color,
          // How many BRAND TONES the glyph paints, which is what selection is
          // since P14-4.
          //
          // It used to be outline-vs-filled, because the flat family (NavIcons.jsx)
          // drew two different shapes for the two states. The dimensional family
          // draws ONE shape and lights it: resting paints the silhouette once in
          // --text-muted, selected clips three planes of the brand to the same
          // silhouette. So the non-colour signal moved from "different outline" to
          // "three tones of visibly different luminance", and this is the count of
          // them.
          //
          // Anything inside a <mask> is skipped: a mask's black and white are
          // geometry, not paint.
          tonedParts: Array.from(svg.querySelectorAll('*'))
            .filter((n) => !n.closest('mask'))
            .map((n) => n.getAttribute('fill'))
            .filter((f) => f && (f.indexOf('var(--primary') === 0 || f.indexOf('var(--plum') === 0))
            .length,
        };
      }),
    };
  });
}

test.describe('the order', () => {
  test.use({ viewport: PHONE });

  test('is Home · Stories · Cards · Practice · More, left to right', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);

    expect(bar.tabs.map((t) => t.name)).toEqual(ORDER);
    // And in DOM order too, so a screen reader hears the same row a thumb sees.
    const sorted = [...bar.tabs].sort((a, b) => a.left - b.left);
    expect(sorted.map((t) => t.name)).toEqual(ORDER);
  });

  test('puts Cards in the physical centre column', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);

    expect(bar.tabs.findIndex((t) => t.name === 'Cards')).toBe(2);
    // Centre of the middle tab === centre of the bar. Five equal columns, so
    // this is the definition of "physically central" rather than a near-miss.
    const cards = bar.tabs[2];
    const barCentre = Math.round(cards.left + cards.w / 2);
    const viewport = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(barCentre - viewport / 2)).toBeLessThanOrEqual(1);
    // Stories and Practice flank it now. The order around Cards changed once
    // already and may change again; Cards' column is the part that does not.
    expect([bar.tabs[1].name, bar.tabs[3].name]).toEqual(['Stories', 'Practice']);
  });

  test('puts the Cards GLYPH on the viewport centre line, not just its column', async ({ page }) => {
    // The container is wider than the glyph and the glyph is bigger than its
    // neighbours', so "the column is centred" is not by itself the claim being
    // made about the bar.
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const off = await page.evaluate(() => {
      const svg = Array.from(document.querySelectorAll('nav[aria-label="Primary"] button'))
        .find((b) => b.textContent.trim() === 'Cards').querySelector('svg');
      const r = svg.getBoundingClientRect();
      return Math.abs((r.left + r.width / 2) - window.innerWidth / 2);
    });
    expect(off).toBeLessThanOrEqual(1);
  });

  test('does not make Cards the tab the app opens on', async ({ page }) => {
    // Position is presentation. The launch tab, the tab a bare "/" resolves to
    // and the tab Back climbs to all still live in navStack.js.
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/');
    const bar = await barState(page);
    expect(bar.tabs.find((t) => t.current === 'page').name).toBe('Home');
  });
});

test.describe('what the bar no longer carries', () => {
  test.use({ viewport: PHONE });

  test('shows no count, on any tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);
    // The bar is a set of destinations, not a dashboard — Home already says how
    // many cards are waiting, and better.
    expect(bar.text).toBe(ORDER.join(''));
    expect(bar.text).not.toMatch(/\d/);
  });

  test('still shows the count where it belongs', async ({ page }) => {
    // Removed from the bar, kept on the desktop rail and on Home. This is the
    // assertion that stops "remove the badge" quietly becoming "remove the
    // number from the product".
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const rail = await page.evaluate(() => Array.from(
      document.querySelectorAll('nav[aria-label="Main"] button'))
      .map((b) => b.getAttribute('aria-label'))
      .find((l) => /^Flashcards,/.test(l || '')));
    expect(rail).toMatch(/^Flashcards, \d+ waiting$/);
  });

  test('draws no rule along its top edge', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);
    // The sliding accent marker is gone. Selection is the glyph now.
    expect(bar.floaters).toBe(0);
  });
});

for (const theme of ['light', 'dark']) {
  test.describe('the selected tab in ' + theme, () => {
    test.use({ viewport: PHONE });

    test('is filled where the others are outlined', async ({ page }) => {
      await page.goto('/stories');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(400);
      const bar = await barState(page);
      const active = bar.tabs.find((t) => t.current === 'page');
      expect(active.name).toBe('Stories');

      // Tone first. The active and inactive glyphs differ by hue and barely at
      // all by average brightness, so if the flat→dimensional swap ever goes
      // away, selection goes with it. Three planes minimum: lit, front, shaded.
      expect(active.tonedParts).toBeGreaterThanOrEqual(3);
      for (const t of bar.tabs.filter((x) => x.current !== 'page')) {
        expect(t.tonedParts, t.name).toBe(0);
      }
      // Then weight, then colour.
      expect(active.labelWeight).toBeGreaterThan(600);
      expect(active.labelColor).not.toBe(bar.tabs[0].labelColor);
    });

    test('reads the same with motion turned off', async ({ page }) => {
      // Nothing about selection is animated, so a learner who has asked their
      // phone for less motion sees exactly the same bar.
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.goto('/stories');
      await page.locator('nav[aria-label="Primary"]').waitFor();
      await page.waitForTimeout(400);
      const bar = await barState(page);
      const active = bar.tabs.find((t) => t.current === 'page');
      expect(active.name).toBe('Stories');
      expect(active.tonedParts).toBeGreaterThanOrEqual(3);
      expect(active.labelWeight).toBeGreaterThan(600);
    });
  });
}

test.describe('Cards carries weight without taking space', () => {
  test.use({ viewport: PHONE });

  test('is drawn larger than its neighbours, and no heavier at rest than that', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);
    const cards = bar.tabs.find((t) => t.name === 'Cards');
    // RESTING peers only. This used to read `others[0]`, which was fine while
    // column 0 was Practice and broke the moment Home moved into it: Home is
    // the selected tab on `/`, so "one step heavier than my neighbour" started
    // measuring against a 700 and demanding 800. The claim was always about
    // tabs at rest.
    const others = bar.tabs.filter((t) => t.name !== 'Cards' && t.current !== 'page');
    expect(others.length).toBeGreaterThan(1);

    expect(cards.icon).toBeGreaterThan(others[0].icon);
    // The step went 27.5-against-21 in P8 and 26-against-22-to-24 in P14-4, and
    // the reason it could come down is that the drawings changed. The flat family
    // needed the steep ramp because its Practice grid out-inked its Cards glyph
    // (158px² to 147); the dimensional family is drawn to one weight, so the ramp
    // only has to express hierarchy. The ceiling here is what stops it becoming a
    // badge again — navEmphasis.test.js pins the whole ramp.
    expect(cards.icon - others[0].icon).toBeLessThanOrEqual(4);
    // One step of label weight, same face and same size as every other tab.
    for (const t of others) expect(t.labelWeight, t.name).toBe(500);
    expect(cards.labelSize).toBe(others[0].labelSize);
    expect(cards.labelWeight).toBe(others[0].labelWeight + 100);
    // Unselected, it is still grey: the emphasis must not read as "selected".
    // The container is a neutral surface step at rest and takes the accent only
    // when the tab actually is the one you are on.
    expect(cards.current).toBe(null);
    expect(cards.labelColor).toBe(others[0].labelColor);
    expect(cards.tonedParts).toBe(0);
  });

  test('has a container, and it is inside the bar rather than over it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const shell = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const nr = nav.getBoundingClientRect();
      const tabs = Array.from(nav.querySelectorAll('button'));
      const box = (b) => b.querySelector('svg').parentElement;
      const cards = box(tabs.find((b) => b.textContent.trim() === 'Cards'));
      const cr = cards.getBoundingClientRect();
      const cs = getComputedStyle(cards);
      return {
        w: Math.round(cr.width), h: Math.round(cr.height),
        radius: parseFloat(cs.borderRadius),
        // Above the bar's top edge would be a floating button; below its
        // bottom would be a notch. Neither is allowed.
        insetTop: Math.round((cr.top - nr.top) * 10) / 10,
        clearsBottom: cr.bottom < nr.bottom,
        painted: cs.backgroundColor,
        // Every other tab's icon box is bare — the container belongs to one tab.
        others: tabs.filter((b) => b.textContent.trim() !== 'Cards')
          .map((b) => getComputedStyle(box(b)).backgroundColor),
        // …and it is the same height as theirs, so the five glyphs share a line.
        rows: tabs.map((b) => Math.round(box(b).getBoundingClientRect().height)),
      };
    });

    expect(shell.painted).not.toBe(shell.others[0]); // the container exists at all
    expect(shell.w).toBeGreaterThanOrEqual(40);
    expect(shell.w).toBeLessThanOrEqual(44);
    expect(shell.h).toBeGreaterThanOrEqual(34);
    expect(shell.h).toBeLessThanOrEqual(38);
    // A rounded rectangle, not a circle: a FAB is the thing this is not.
    expect(shell.radius).toBeLessThan(shell.h / 2);
    expect(shell.insetTop).toBeGreaterThan(2);
    // Inside the tray's rounded box, not breaking its silhouette.
    expect(shell.insetTop).toBeLessThan(12);
    expect(shell.clearsBottom).toBe(true);
    expect(shell.painted).not.toBe('rgba(0, 0, 0, 0)');
    for (const bg of shell.others) expect(bg).toBe('rgba(0, 0, 0, 0)');
    expect(new Set(shell.rows).size).toBe(1);
  });

  // The container's whole risk: a filled box behind a tab is what Android uses
  // to mean "you are here", and Cards wears one on every screen. These measure
  // the two states as COMPOSITED PIXELS against the bar's own ground, because
  // the bar is translucent and a token name tells you nothing about what lands.
  for (const theme of ['light', 'dark']) {
    test('resting and selected containers are different objects in ' + theme, async ({ page }) => {
      const read = async () => page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const cards = Array.from(nav.querySelectorAll('button'))
          .find((b) => b.textContent.trim() === 'Cards');
        const shell = cards.querySelector('svg').parentElement;
        // A color-mix() computes to `color(srgb r g b / a)` on 0–1; a plain
        // token computes to `rgb(0–255)`. Normalise both, or the comparison is
        // between two different scales and means nothing.
        const rgba = (c) => {
          const n = (c.match(/[\d.]+/g) || []).map(Number);
          const k = c.indexOf('color(') === 0 ? 255 : 1;
          return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
        };
        const bg = rgba(getComputedStyle(nav).backgroundColor);
        const box = rgba(getComputedStyle(shell).backgroundColor);
        // Composite the container over the bar's ground and report the biggest
        // channel it moves. That number IS "how prominent is it".
        const a = box[3];
        const delta = [0, 1, 2].map((i) => Math.abs((box[i] * a + bg[i] * (1 - a)) - bg[i]));
        return {
          selected: cards.getAttribute('aria-current') === 'page',
          border: getComputedStyle(shell).borderTopColor,
          borderDrawn: getComputedStyle(shell).borderTopColor !== 'rgba(0, 0, 0, 0)',
          delta: Math.round(Math.max(...delta) * 10) / 10,
        };
      });

      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(300);
      const rest = await read();

      await emptyQueue(page);
      await page.goto('/study');
      await page.locator('nav[aria-label="Primary"]').waitFor();
      await page.waitForTimeout(900);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(300);
      const on = await read();

      expect(rest.selected).toBe(false);
      expect(on.selected).toBe(true);
      // Present at rest…
      expect(rest.delta).toBeGreaterThan(1.5);
      // …and barely. A flat --surface-2 measured ~13 here and read as selected.
      expect(rest.delta).toBeLessThan(9);
      // The selected one has to be unmistakably the stronger object.
      expect(on.delta).toBeGreaterThan(rest.delta * 1.6);
      // And it is the only one with an edge.
      expect(rest.borderDrawn).toBe(false);
      expect(on.borderDrawn).toBe(true);
    });
  }

  test('shares its column width and its baseline with the rest', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const bar = await barState(page);

    // Equal columns: a bigger glyph must not buy a bigger hitbox.
    //
    // A spread rather than one identical value since P14-4: the bar used to span the
    // viewport and divide by five exactly (390/5 = 78), and the tray's inset content
    // box does not (364/5 = 72.8), so a flex remainder exists and Chromium
    // distributes it differently on different builds. Half a pixel is tighter than
    // any inequality that could matter to a thumb.
    const widths = bar.tabs.map((t) => t.w);
    expect(Math.max(...widths) - Math.min(...widths),
      JSON.stringify(widths)).toBeLessThanOrEqual(0.5);
    // Every icon centred on the same line, whatever its size — the larger Cards
    // glyph grows about a shared centre rather than pushing its label down. This one
    // IS exact, because every glyph size is a whole number (navEmphasis.js).
    const resting = bar.tabs.filter((t) => t.current !== 'page').map((t) => t.iconCentre);
    expect(new Set(resting).size).toBe(1);
  });
});

for (const phone of PHONES) {
  test.describe('the bar on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is exactly as tall as the space reserved for it, with five real targets', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const bar = await barState(page);
      const extra = await page.evaluate(() => {
        const de = document.documentElement;
        const main = document.querySelector('#main-content');
        return {
          pad: Math.round(parseFloat(getComputedStyle(main).paddingBottom)),
          overflowX: de.scrollWidth - de.clientWidth,
        };
      });

      // The tray declares its own height, and the shell reserves the tray plus
      // its float — two numbers because the tray floats now, both from
      // navMetrics.js so they cannot drift.
      expect(bar.height).toBe(MOBILE_NAV_HEIGHT);
      expect(extra.pad).toBe(MOBILE_NAV_RESERVE);
      expect(extra.overflowX).toBe(0);

      expect(bar.tabs).toHaveLength(5);
      for (const t of bar.tabs) {
        expect(t.h, t.name).toBeGreaterThanOrEqual(44);
        expect(t.w, t.name).toBeGreaterThanOrEqual(44);
      }
      // Every label is present and spelled out — no icon-only tabs, nothing
      // abbreviated to fit 320.
      expect(bar.tabs.map((t) => t.name)).toEqual(ORDER);
    });

    test('gives the flashcard the space the old constant was wasting', async ({ page }) => {
      await page.goto('/study');
      await page.waitForTimeout(1200);
      const shell = await page.evaluate(() => {
        const main = document.querySelector('#main-content');
        const el = Array.from(main.querySelectorAll('div')).find((d) => {
          const cs = getComputedStyle(d);
          return cs.overflow === 'hidden' && cs.display === 'flex'
            && cs.flexDirection === 'column' && d.style.height;
        });
        return el ? {
          h: Math.round(el.getBoundingClientRect().height),
          viewportH: window.innerHeight,
        } : null;
      });
      expect(shell).not.toBe(null);
      expect(shell.h).toBe(shell.viewportH - MOBILE_NAV_RESERVE);
    });
  });
}

test.describe('everything underneath is unchanged', () => {
  test.use({ viewport: PHONE });

  test('More still opens, traps focus, closes and gives focus back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    const more = page.getByRole('button', { name: 'More' });
    expect(await more.getAttribute('aria-expanded')).toBe('false');

    await more.click();
    const sheet = page.getByRole('dialog', { name: 'More menu' });
    await expect(sheet).toBeVisible();
    expect(await more.getAttribute('aria-expanded')).toBe('true');

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe('More');
  });

  test('a tab still goes to its own tab, whatever column it now sits in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    // Practice has now been column 4, column 1 and column 4 again, and has
    // owned /practice throughout. That is the point of the assertion.
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
    const bar = await barState(page);
    expect(bar.tabs.find((t) => t.current === 'page').name).toBe('Practice');
  });

  test('tapping Cards still starts the session, and the bar still gets out of the way', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'Cards', exact: true }).click();
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });

  test('re-tapping the tab you are on is not a navigation', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => history.length);

    await page.getByRole('button', { name: 'Stories', exact: true }).click();
    await page.waitForTimeout(600);

    // Same URL, same tab, and — the part that matters — no history entry, so
    // Back still leaves the tab instead of undoing a tap that went nowhere.
    expect(new URL(page.url()).pathname).toBe('/stories');
    expect(await page.evaluate(() => history.length)).toBe(before);
    const bar = await barState(page);
    expect(bar.tabs.find((t) => t.current === 'page').name).toBe('Stories');
    // Deliberately not asserted: that it scrolls back to the top. It does not —
    // `reselect` scrolls the tab-root element, which is not the scroller (the
    // document is), so the call is a no-op. Pre-existing, one line, and out of
    // scope while reselect semantics are frozen. See docs/BACKLOG.md.
  });

  test('the selected tab is announced, and only one is', async ({ page }) => {
    await emptyQueue(page);
    await page.goto('/study');
    await page.waitForTimeout(900);
    const bar = await barState(page);
    const current = bar.tabs.filter((t) => t.current === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].name).toBe('Cards');
  });
});
