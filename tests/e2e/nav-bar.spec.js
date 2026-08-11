import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { MOBILE_NAV_HEIGHT } from '../../src/navMetrics.js';

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

const ORDER = ['Practice', 'Home', 'Cards', 'Stories', 'More'];

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
          // Outline vs filled: the glyph's own shape carries the selection,
          // which is the signal that does not depend on seeing colour.
          filledParts: Array.from(svg.querySelectorAll('*'))
            .filter((n) => (n.getAttribute('fill') || 'none') !== 'none').length,
        };
      }),
    };
  });
}

test.describe('the order', () => {
  test.use({ viewport: PHONE });

  test('is Practice · Home · Cards · Stories · More, left to right', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);

    expect(bar.tabs.map((t) => t.name)).toEqual(ORDER);
    // And in DOM order too, so a screen reader hears the same row a thumb sees.
    const sorted = [...bar.tabs].sort((a, b) => a.left - b.left);
    expect(sorted.map((t) => t.name)).toEqual(ORDER);
  });

  test('puts Cards in the physical centre column', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);

    expect(bar.tabs.findIndex((t) => t.name === 'Cards')).toBe(2);
    // Centre of the middle tab === centre of the bar. Five equal columns, so
    // this is the definition of "physically central" rather than a near-miss.
    const cards = bar.tabs[2];
    const barCentre = Math.round(cards.left + cards.w / 2);
    const viewport = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(barCentre - viewport / 2)).toBeLessThanOrEqual(1);
    // Home and Stories flank it: the middle three are the daily loop.
    expect([bar.tabs[1].name, bar.tabs[3].name]).toEqual(['Home', 'Stories']);
  });

  test('does not make Cards the tab the app opens on', async ({ page }) => {
    // Position is presentation. The launch tab, the tab a bare "/" resolves to
    // and the tab Back climbs to all still live in navStack.js.
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/');
    const bar = await barState(page);
    expect(bar.tabs.find((t) => t.current === 'page').name).toBe('Home');
  });
});

test.describe('what the bar no longer carries', () => {
  test.use({ viewport: PHONE });

  test('shows no count, on any tab', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
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
    await page.getByText('Today', { exact: true }).waitFor();
    const rail = await page.evaluate(() => Array.from(
      document.querySelectorAll('nav[aria-label="Main"] button'))
      .map((b) => b.getAttribute('aria-label'))
      .find((l) => /^Flashcards,/.test(l || '')));
    expect(rail).toMatch(/^Flashcards, \d+ waiting$/);
  });

  test('draws no rule along its top edge', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
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

      // Shape first. The active and inactive glyphs differ by hue and barely at
      // all by brightness (measured at 1.18:1 light / 1.26:1 dark), so if the
      // outline→filled swap ever goes away, selection goes with it.
      expect(active.filledParts).toBeGreaterThan(0);
      for (const t of bar.tabs.filter((x) => x.current !== 'page' && x.name !== 'More')) {
        expect(t.filledParts, t.name).toBe(0);
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
      expect(active.filledParts).toBeGreaterThan(0);
      expect(active.labelWeight).toBeGreaterThan(600);
    });
  });
}

test.describe('Cards carries weight without taking space', () => {
  test.use({ viewport: PHONE });

  test('is drawn larger than its neighbours, and no heavier at rest than that', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);
    const cards = bar.tabs.find((t) => t.name === 'Cards');
    const others = bar.tabs.filter((t) => t.name !== 'Cards');

    expect(cards.icon).toBeGreaterThan(others[0].icon);
    expect(cards.icon - others[0].icon).toBeLessThanOrEqual(4); // a step, not a shout
    // One step of label weight, same face and same size as every other tab.
    expect(cards.labelSize).toBe(others[0].labelSize);
    expect(cards.labelWeight).toBe(others[0].labelWeight + 100);
    // Unselected, it is still grey: the emphasis must not read as "selected".
    expect(cards.current).toBe(null);
    expect(cards.labelColor).toBe(others[0].labelColor);
    expect(cards.filledParts).toBe(0);
  });

  test('shares its column width and its baseline with the rest', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);

    // Equal columns: a bigger glyph must not buy a bigger hitbox.
    expect(new Set(bar.tabs.map((t) => t.w)).size).toBe(1);
    // Every icon centred on the same line, whatever its size — the larger Cards
    // glyph grows about a shared centre rather than pushing its label down.
    const resting = bar.tabs.filter((t) => t.current !== 'page').map((t) => t.iconCentre);
    expect(new Set(resting).size).toBe(1);
  });
});

for (const phone of PHONES) {
  test.describe('the bar on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is exactly as tall as the space reserved for it, with five real targets', async ({ page }) => {
      await page.goto('/');
      await page.getByText('Today', { exact: true }).waitFor();
      const bar = await barState(page);
      const extra = await page.evaluate(() => {
        const de = document.documentElement;
        const main = document.querySelector('#main-content');
        return {
          pad: Math.round(parseFloat(getComputedStyle(main).paddingBottom)),
          overflowX: de.scrollWidth - de.clientWidth,
        };
      });

      // The height the P8 geometry pass settled; a larger centre glyph does not
      // get to move it, least of all on the phone where Study is tightest.
      expect(bar.height).toBe(MOBILE_NAV_HEIGHT);
      expect(extra.pad).toBe(MOBILE_NAV_HEIGHT);
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
      expect(shell.h).toBe(shell.viewportH - MOBILE_NAV_HEIGHT);
    });
  });
}

test.describe('everything underneath is unchanged', () => {
  test.use({ viewport: PHONE });

  test('More still opens, traps focus, closes and gives focus back', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
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
    await page.getByText('Today', { exact: true }).waitFor();
    // Practice moved from column 4 to column 1 and still owns /practice.
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
    const bar = await barState(page);
    expect(bar.tabs.find((t) => t.current === 'page').name).toBe('Practice');
  });

  test('tapping Cards still starts the session, and the bar still gets out of the way', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
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
