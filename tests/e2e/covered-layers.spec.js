import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The three properties jsdom cannot answer for: real hit-testing, real focus
// order, and real scrolling.
//
// coveredLayers.test.jsx proves the structure (a covered root is
// `display: none`; a covered pushed screen is not rendered at all). These prove
// the consequences in a browser, because "it should be inert" and "the browser
// treats it as inert" are different claims.

const SERIES_POSTER = /月下的朋友 · HSK 1 · 3 chapters/;

test.describe('a covered layer is inert', () => {
  test('its controls cannot be tapped, focused, or found by name', async ({ page }) => {
    await page.goto('/stories');
    const poster = page.getByRole('button', { name: SERIES_POSTER }).first();
    await expect(poster).toBeVisible();
    await poster.click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();

    // The shelf is still in the document, and its poster is still there…
    await expect(page.getByRole('button', { name: SERIES_POSTER }).first()).toBeHidden();
    // …but the browser will not let a pointer reach it. `force` skips
    // Playwright's own actionability checks, so what refuses here is the DOM.
    await expect(async () => {
      await page.getByRole('button', { name: SERIES_POSTER }).first().click({ force: true, timeout: 1000 });
    }).rejects.toThrow();
    // Still on the series page — nothing underneath received the tap.
    await expect(page).toHaveURL(/\/stories\/series\//);

    // Tabbing from the top cannot walk into the covered shelf. Twenty presses
    // is well past the series page's own controls.
    await page.keyboard.press('Escape');
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      const inCovered = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const pane = el.closest('[data-tab-root]');
        if (!pane) return false;
        return getComputedStyle(pane).display === 'none'
          || Boolean(el.closest('[hidden]'));
      });
      expect(inCovered).toBe(false);
    }
  });

  test('scrolling the visible layer cannot scroll the layer underneath', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: SERIES_POSTER }).first()).toBeVisible();

    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();

    // The covered pane contributes no height at all, so there is nothing of it
    // left to scroll — `display: none` takes it out of layout entirely.
    //
    // This assertion is the one that caught the real bug: <Activity> hides its
    // OWN subtree, not this wrapper, so a covered pane used to keep a full
    // `height: 100%` box and every pushed screen rendered below it (measured on
    // /words: a 3,714px empty pane, with the screen the learner opened starting
    // at y=3714). TabHost now takes the wrapper out of flow with its contents.
    const covered = await page.evaluate(() => {
      const pane = document.querySelector('[data-tab-root="stories"]');
      if (!pane) return null;
      return {
        display: getComputedStyle(pane).display,
        height: pane.getBoundingClientRect().height,
        scrollHeight: pane.scrollHeight,
      };
    });
    expect(covered.display).toBe('none');
    expect(covered.height).toBe(0);
    expect(covered.scrollHeight).toBe(0);

    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      pane: (document.querySelector('[data-tab-root="stories"]') || {}).scrollTop,
      paneHeight: (document.querySelector('[data-tab-root="stories"]') || {}).scrollHeight,
    }));
    expect(after.pane).toBe(0);
    expect(after.paneHeight).toBe(0);
  });

  test('the reader leaves exactly one screen in the accessibility tree', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    await page.getByRole('button', { name: SERIES_POSTER }).first().click();
    await page.getByRole('button', { name: /Chapter 1 · 月下的朋友/ }).click();
    await expect(page).toHaveURL(/\/stories\/[^/]+$/);

    // Series under Reader is not merely hidden — it is unmounted, so there is
    // no second copy of its chapter list to be exposed or duplicated.
    await expect(page.getByRole('heading', { name: 'Chapters' })).toHaveCount(0);
    // And the shelf underneath both is out of the tree, not just off screen.
    const exposed = await page.evaluate(() => {
      const panes = Array.from(document.querySelectorAll('[data-tab-root]'));
      return panes.filter(p => getComputedStyle(p).display !== 'none').length;
    });
    expect(exposed).toBe(0);
  });
});

test.describe('a pushed screen starts where a screen should', () => {
  test('at its own top, and Back returns to where the shelf was left', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stories');
    const poster = page.getByRole('button', { name: SERIES_POSTER }).first();
    await expect(poster).toBeVisible();

    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
    const left = await page.evaluate(() => window.scrollY);
    expect(left).toBeGreaterThan(0);

    await poster.click();
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await page.waitForTimeout(300);
    // A push is a NEW screen: it starts at its top, not at the offset the
    // previous screen happened to be scrolled to.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // …and it is actually on screen, not below an empty box.
    const box = await page.getByRole('heading', { name: 'Chapters' }).boundingBox();
    expect(box.y).toBeLessThan(844);

    await page.getByRole('button', { name: 'All stories' }).click();
    await page.waitForTimeout(400);
    // A return lands where the learner left. The document is the scroller and
    // <Activity> swaps panes out of the layout, so nothing restores this by
    // itself — useNavigation remembers it per stack entry.
    expect(await page.evaluate(() => window.scrollY)).toBe(left);
  });
});
