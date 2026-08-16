import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Today's geometry: one object filling the stage between the header and the
// dock, on every width and in both themes. The dock's own geometry is pinned in
// nav-dock.spec.js; this file is about the screen it floats over.

const WIDTHS = [320, 390, 430];
const THEMES = ['light', 'dark'];

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`${width}px ${theme}: the object fills the stage and clears the dock`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);

      const card = page.locator('[data-tour="home-queue"]');
      await expect(card).toBeVisible();

      const geometry = await page.evaluate(() => {
        const card = document.querySelector('[data-tour="home-queue"]').getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect();
        const chip = document.querySelector('[aria-label="Open today’s overview"]').getBoundingClientRect();
        const avatar = document.querySelector('[aria-label="Open profile"]').getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          card, nav, chip, avatar,
        };
      });

      // Nothing scrolls: Today is a fixed stage, and every state fits it.
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);

      // The object sits below the header and above the dock, touching neither.
      expect(geometry.card.top).toBeGreaterThanOrEqual(geometry.chip.bottom);
      expect(geometry.card.top).toBeGreaterThanOrEqual(geometry.avatar.bottom);
      expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.nav.top);
      // …and it is genuinely the screen, not a widget on it.
      expect(geometry.card.height).toBeGreaterThan(geometry.viewportHeight * 0.55);

      // Comfortable targets for the two header controls.
      for (const control of ['chip', 'avatar']) {
        expect(geometry[control].height, control).toBeGreaterThanOrEqual(32);
      }
    });
  }
}

test('the fonts settle without reflowing the object', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const card = page.locator('[data-tour="home-queue"]');
  await expect(card).toBeVisible();
  const before = await card.boundingBox();
  await page.evaluate(() => document.fonts.ready);
  const after = await card.boundingBox();
  expect(await page.evaluate(() => document.fonts.check('16px "Mona Sans"'))).toBe(true);
  expect(Math.abs(before.width - after.width)).toBeLessThan(0.5);
  expect(Math.abs(before.height - after.height)).toBeLessThan(0.5);
});
