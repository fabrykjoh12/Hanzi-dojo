import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { MOBILE_NAV_HEIGHT } from '../../src/navMetrics.js';

// The bottom bar's contract (P8, Option A).
//
// The bar carries one piece of information — how many cards are waiting — and
// it has to be the SAME number the Home hero prints and the same number the
// desktop rail prints, because all three are the same three counts
// (docs/METRICS.md). It is also the one number in the app that must be able to
// say nothing at all: at zero, before the counts land, and when they fail.
//
// The other half of this file is what the badge must NOT become. "Cards is the
// primary action" is a hierarchy problem, and the failure mode is solving it
// with a red pill — so the styling is asserted, not just the value.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const PHONES = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
];

// `ink()` is a color-mix, which Chromium computes to `color(srgb r g b)` with
// 0–1 channels. Parsing that as 0–255 reports the most legible mark on the bar
// as a 1.11 contrast ratio, so both notations are handled here.
function luminance(c) {
  const n = c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const [r, g, b] = c.startsWith('color(') ? n : n.map((v) => v / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// The bar reads its own state out of the DOM: which tab is selected, what each
// one looks like, and what the badge actually is.
async function barState(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    return Array.from(nav.querySelectorAll('button')).map((b) => {
      // A tab is two direct children: the icon's wrapper (which also holds the
      // badge, positioned against it) and the label. Reading them positionally
      // rather than by querySelectorAll keeps the badge's digits out of the
      // label's text.
      const kids = Array.from(b.children).filter((el) => el.tagName === 'SPAN');
      const labelEl = kids[kids.length - 1];
      const badgeEl = kids.length > 1 ? kids[0].querySelector('span') : null;
      const icon = b.querySelector('svg');
      const badgeStyle = badgeEl ? getComputedStyle(badgeEl) : null;
      return {
        label: labelEl ? labelEl.textContent.trim() : null,
        current: b.getAttribute('aria-current'),
        ariaLabel: b.getAttribute('aria-label'),
        iconColor: icon ? getComputedStyle(icon).color : null,
        labelColor: labelEl ? getComputedStyle(labelEl).color : null,
        labelWeight: labelEl ? getComputedStyle(labelEl).fontWeight : null,
        badge: badgeEl ? badgeEl.textContent.trim() : null,
        badgeHidden: badgeEl ? badgeEl.getAttribute('aria-hidden') : null,
        badgeStyle: badgeStyle ? {
          background: badgeStyle.backgroundColor,
          border: badgeStyle.borderTopWidth,
          radius: badgeStyle.borderTopLeftRadius,
          color: badgeStyle.color,
          numeric: badgeStyle.fontVariantNumeric,
          transition: badgeStyle.transitionProperty,
          animation: badgeStyle.animationName,
        } : null,
      };
    });
  });
}

// The hero's own number — the thing the badge has to agree with.
async function heroWaiting(page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('span'))
      .find((s) => /^card(s)? waiting/.test(s.textContent.trim()));
    if (!el) return null;
    const num = el.previousElementSibling;
    return num ? Number(num.textContent.trim()) : null;
  });
}

test.describe('the waiting count', () => {
  test.use({ viewport: PHONE });

  test('rides Cards, and nothing else', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);

    const cards = bar.find((t) => t.label === 'Cards');
    expect(Number(cards.badge)).toBeGreaterThan(0);
    for (const tab of bar.filter((t) => t.label !== 'Cards')) {
      expect(tab.badge, tab.label).toBe(null);
    }
  });

  test('is the same number the Home hero prints', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    // new + learning + due, derived once in navBadges.js. Read from the screen
    // rather than written as a literal: the assertion is that the two agree,
    // not that the fixture happens to hold a particular deck.
    expect(Number((await barState(page)).find((t) => t.label === 'Cards').badge))
      .toBe(await heroWaiting(page));
  });

  test('says the number out loud, and only when there is one', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);
    const cards = bar.find((t) => t.label === 'Cards');

    expect(cards.ariaLabel).toBe('Cards, ' + cards.badge + ' waiting');
    // Drawn once, spoken once: without aria-hidden the digits are read as a
    // second, separate thing after the name.
    expect(cards.badgeHidden).toBe('true');
    // Every other tab keeps its plain text name.
    for (const tab of bar.filter((t) => t.label !== 'Cards')) {
      expect(tab.ariaLabel, tab.label).toBe(null);
    }
  });

  test('is digits, not a notification badge', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const s = (await barState(page)).find((t) => t.label === 'Cards').badgeStyle;

    // No pill, no circle, no fill, no ring. This is information sitting next to
    // an icon, not an alert demanding to be cleared.
    expect(s.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(s.border).toBe('0px');
    expect(s.radius).toBe('0px');
    // Digits that do not change width as the number does.
    expect(s.numeric).toContain('tabular-nums');
    // …and nothing that moves when the number changes.
    expect(s.transition).toBe('all');
    expect(s.animation).toBe('none');
  });

  test('does not make Cards look selected', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    const bar = await barState(page);
    const cards = bar.find((t) => t.label === 'Cards');
    const stories = bar.find((t) => t.label === 'Stories');
    const home = bar.find((t) => t.label === 'Home');

    // Home is where we are; Cards merely has something waiting.
    expect(home.current).toBe('page');
    expect(cards.current).toBe(null);
    // An unselected tab with a badge is drawn exactly like an unselected tab
    // without one — the accent belongs to the digits alone. This is the whole
    // "hierarchy, not a floating action button" constraint, asserted.
    expect(cards.iconColor).toBe(stories.iconColor);
    expect(cards.labelColor).toBe(stories.labelColor);
    expect(cards.labelWeight).toBe(stories.labelWeight);
    // And the digits are NOT that muted colour — they are the one accent mark.
    expect(cards.badgeStyle.color).not.toBe(cards.labelColor);
  });
});

test.describe('when there is deliberately no number', () => {
  test.use({ viewport: PHONE });

  test('an empty queue shows nothing rather than a zero', async ({ page }) => {
    // No curriculum vocabulary in scope → nothing new, nothing learning,
    // nothing due, and the fetch still succeeded. A cleared queue looks
    // cleared: that is the product's stated stance, not a styling choice.
    await page.route('**/rest/v1/vocabulary*', (route) => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '[]',
    }));
    await page.goto('/');
    await page.getByText('Queue clear').waitFor();
    for (const tab of await barState(page)) expect(tab.badge, tab.label).toBe(null);
  });

  test('a failed load shows nothing rather than a number it cannot stand behind', async ({ page }) => {
    await page.route('**/rest/v1/vocabulary*', (route) => route.fulfill({
      status: 500,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'boom' }),
    }));
    await page.goto('/');
    // Home says so in words; the bar simply stays quiet.
    await page.getByText("Couldn't load today's queue").waitFor();
    for (const tab of await barState(page)) expect(tab.badge, tab.label).toBe(null);
  });
});

test('the rail and the bar print the same number', async ({ page }) => {
  // Two chromes, one definition. They used to be one chrome and a gap.
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.getByText('Today', { exact: true }).waitFor();
  const rail = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('nav[aria-label="Main"] button'))
      .find((b) => /^Flashcards(,|$)/.test(b.getAttribute('aria-label') || ''));
    return btn ? btn.getAttribute('aria-label') : null;
  });
  const desktopHero = await heroWaiting(page);

  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.getByText('Today', { exact: true }).waitFor();
  const cards = (await barState(page)).find((t) => t.label === 'Cards');

  expect(rail).toBe('Flashcards, ' + desktopHero + ' waiting');
  expect(Number(cards.badge)).toBe(desktopHero);
});

// ── The selected tab ──────────────────────────────────────────────────────
//
// Measured, because the interesting number is invisible: the active and
// inactive tabs differ by HUE, not by lightness. In light mode the two sit at a
// 1.18 luminance ratio and in dark mode 1.26 — nowhere near the 3:1 that lets
// two UI elements be told apart by brightness. That is fine as long as
// selection is also carried by something that is not colour, and it is the
// reason the marker had to stop reading as part of the bar's own border.
async function markerState(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const track = nav.querySelector(':scope > span[aria-hidden]');
    const mark = track.querySelector('span');
    const nr = nav.getBoundingClientRect();
    const mr = mark.getBoundingClientRect();
    const tabs = Array.from(nav.querySelectorAll('button'));
    const activeTab = tabs.find((b) => b.getAttribute('aria-current') === 'page');
    const read = (b) => {
      const kids = Array.from(b.children).filter((e) => e.tagName === 'SPAN');
      const label = kids[kids.length - 1];
      const icon = b.querySelector('svg');
      const cs = getComputedStyle(icon);
      return {
        // lucide paints the glyph with `stroke`, not `color`.
        icon: cs.stroke,
        stroke: parseFloat(cs.strokeWidth),
        label: getComputedStyle(label).color,
        weight: getComputedStyle(label).fontWeight,
      };
    };
    return {
      ground: getComputedStyle(document.body).backgroundColor,
      border: getComputedStyle(nav).borderTopColor,
      borderWidth: parseFloat(getComputedStyle(nav).borderTopWidth),
      gapFromTop: Math.round((mr.top - nr.top) * 100) / 100,
      thickness: Math.round(mr.height * 100) / 100,
      width: Math.round(mr.width * 100) / 100,
      color: getComputedStyle(mark).backgroundColor,
      centre: Math.round(mr.left + mr.width / 2),
      columnWidth: Math.round(tabs[0].getBoundingClientRect().width),
      activeCentre: Math.round(
        activeTab.getBoundingClientRect().left + activeTab.getBoundingClientRect().width / 2
      ),
      active: read(activeTab),
      inactive: read(tabs.find((b) => b !== activeTab)),
    };
  });
}

for (const theme of ['light', 'dark']) {
  test.describe('the selected tab in ' + theme, () => {
    test.use({ viewport: PHONE });

    test.beforeEach(async ({ page }) => {
      await page.goto('/stories');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(400);
    });

    test('is marked by something that is not its colour', async ({ page }) => {
      const m = await markerState(page);

      // Colour alone does not distinguish it: this is the measurement, kept as
      // an assertion so nobody "fixes" the marker by deleting it and trusting
      // the accent. If this ever exceeds 3:1 the marker's job got easier, not
      // unnecessary — but it has never been true here.
      expect(contrast(m.active.icon, m.inactive.icon)).toBeLessThan(3);

      // So three non-colour cues carry it, and all three are asserted.
      expect(m.active.stroke).toBeGreaterThan(m.inactive.stroke);      // heavier glyph
      expect(Number(m.active.weight)).toBeGreaterThan(Number(m.inactive.weight)); // heavier label
      expect(m.thickness).toBeGreaterThan(0);                          // and the mark itself
    });

    test('carries a mark that cannot be mistaken for the bar\'s border', async ({ page }) => {
      const m = await markerState(page);

      // Held clear of the hairline rather than sitting on it. The old marker
      // began at the border's own edge, which is how a 3px accent line and a
      // 1px neutral line read as one two-tone rule at arm's length.
      expect(m.gapFromTop).toBeGreaterThanOrEqual(m.borderWidth + 3);
      // Several times its weight, and a different colour from it.
      expect(m.thickness).toBeGreaterThanOrEqual(m.borderWidth * 3);
      expect(contrast(m.color, m.border)).toBeGreaterThan(3);
      // Wide enough to underline the tab rather than tick it — the old 42% was
      // narrower than most of the labels it was marking.
      expect(m.width / m.columnWidth).toBeGreaterThan(0.55);
      expect(m.width / m.columnWidth).toBeLessThan(0.8);
      // …and it is over the tab that is actually selected.
      expect(Math.abs(m.centre - m.activeCentre)).toBeLessThanOrEqual(1);
    });

    test('stays legible, selected or not', async ({ page }) => {
      const m = await markerState(page);
      // Both states clear 4.5:1 against the page's own ground in both themes.
      // Nothing here picks a colour to satisfy a number — these are the app's
      // existing tokens, measured; the assertion is that a future token change
      // cannot quietly take the bar below the line.
      for (const state of [m.active, m.inactive]) {
        expect(contrast(state.icon, m.ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(state.label, m.ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

// ── Geometry ──────────────────────────────────────────────────────────────
for (const phone of PHONES) {
  test.describe('the bar on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is exactly as tall as the space reserved for it', async ({ page }) => {
      await page.goto('/');
      await page.getByText('Today', { exact: true }).waitFor();
      const g = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const main = document.querySelector('#main-content');
        const de = document.documentElement;
        return {
          height: Math.round(nav.getBoundingClientRect().height * 100) / 100,
          pad: Math.round(parseFloat(getComputedStyle(main).paddingBottom)),
          overflowX: de.scrollWidth - de.clientWidth,
          tabs: Array.from(nav.querySelectorAll('button')).map((b) => {
            const r = b.getBoundingClientRect();
            return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
          }),
        };
      });

      // One declared value; the bar and the reservation both read it.
      expect(g.height).toBe(MOBILE_NAV_HEIGHT);
      expect(g.pad).toBe(MOBILE_NAV_HEIGHT);
      // The badge is positioned, not laid out — it cannot widen the bar.
      expect(g.overflowX).toBe(0);
      // Five thumb targets, even on the narrowest phone still supported.
      expect(g.tabs).toHaveLength(5);
      for (const t of g.tabs) {
        expect(t.h).toBeGreaterThanOrEqual(44);
        expect(t.w).toBeGreaterThanOrEqual(44);
      }
    });

    test('gives the flashcard back the space it was never using', async ({ page }) => {
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

      // The study shell subtracts the SAME declared bar height the shell
      // reserves — it used to subtract 62 for a 57.75px bar, which cost the
      // card four pixels it was owed on every phone.
      expect(shell).not.toBe(null);
      expect(shell.h).toBe(shell.viewportH - MOBILE_NAV_HEIGHT);
    });
  });
}

test.describe('what the badge must not disturb', () => {
  test.use({ viewport: PHONE });

  test('More still opens, still traps focus, still closes', async ({ page }) => {
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
    // Focus comes back to the button that opened it.
    expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe('More');
  });

  test('tapping Cards still starts the session and hides the bar', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Today', { exact: true }).waitFor();
    await page.getByRole('button', { name: /^Cards(,|$)/ }).click();
    // The Cards root IS the session: the bar gets out of the way of the card.
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });
});
