import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

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
