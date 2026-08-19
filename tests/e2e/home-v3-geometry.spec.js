import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The floating dock: three equal tabs where the selected one expands into a
// labelled capsule. These tests pin the geometry that keeps it usable —
// floating clear of the edges, comfortable targets, no clipped label on the
// active tab, no overflow — across widths and themes.

const WIDTHS = [320, 390, 430];
const THEMES = ['light', 'dark'];
const DESTINATIONS = [
  { path: '/', active: 'Home' },
  { path: '/stories', active: 'Stories' },
  { path: '/practice', active: 'Practice' },
];

async function assertMobileNavGeometry(page, active) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAccessibleName(active);

  const geometry = await nav.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map(button => {
      const box = button.getBoundingClientRect();
      const label = button.lastElementChild;
      const labelBox = label.getBoundingClientRect();
      return {
        name: button.textContent.trim(),
        active: button.getAttribute('aria-current') === 'page',
        width: box.width,
        height: box.height,
        labelWidth: labelBox.width,
        labelScrollWidth: label.scrollWidth,
      };
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      rect: { left: rect.left, right: rect.right, bottom: rect.bottom },
      buttons,
    };
  });

  // Floating: inset from both edges, and clear of the bottom of the viewport.
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.rect.left).toBeGreaterThanOrEqual(8);
  expect(geometry.rect.right).toBeLessThanOrEqual(geometry.viewportWidth - 8);
  expect(844 - geometry.rect.bottom).toBeGreaterThanOrEqual(8);

  for (const button of geometry.buttons) {
    // Comfortable targets on every tab, resting or selected.
    expect(button.width, button.name).toBeGreaterThanOrEqual(44);
    expect(button.height, button.name).toBeGreaterThanOrEqual(44);
    // The selected tab shows its whole label; a resting tab keeps it clipped
    // to zero (still in the DOM for the accessible name).
    if (button.active) {
      expect(button.labelScrollWidth, button.name).toBeLessThanOrEqual(button.labelWidth + 0.5);
      expect(button.labelWidth, button.name).toBeGreaterThan(20);
    } else {
      expect(button.labelWidth, button.name).toBeLessThanOrEqual(0.5);
    }
  }

  // The selected tab is wider than a resting one, but never dominant.
  const activeTab = geometry.buttons.find(b => b.active);
  const restingTab = geometry.buttons.find(b => !b.active);
  expect(activeTab.width).toBeGreaterThan(restingTab.width);
  expect(activeTab.width).toBeLessThan(geometry.rect.right - geometry.rect.left - restingTab.width * 2 + 1);

  const home = nav.getByRole('button', { name: 'Home' });
  if (active === 'Home') await expect(home).toHaveAttribute('aria-current', 'page');
  else await expect(home).not.toHaveAttribute('aria-current', 'page');
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`${width}px ${theme}: Home, Stories, and Practice nav geometry`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const destination of DESTINATIONS) {
        await test.step(`${destination.active} active`, async () => {
          await page.goto(destination.path);
          await page.locator('body').waitFor({ state: 'visible' });
          await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
          await assertMobileNavGeometry(page, destination.active);
        });
      }
    });
  }
}

test('Home content clears the floating dock and fonts settle without reflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Today', exact: true });
  const before = await heading.boundingBox();
  await page.evaluate(() => document.fonts.ready);
  const after = await heading.boundingBox();
  expect(await page.evaluate(() => document.fonts.check('16px "Mona Sans"'))).toBe(true);
  expect(Math.abs(before.width - after.width)).toBeLessThan(0.5);
  expect(Math.abs(before.height - after.height)).toBeLessThan(0.5);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const clearance = await page.evaluate(() => {
    const navTop = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect().top;
    const lastPanel = document.querySelector('[data-tour="home-week"]');
    return navTop - lastPanel.getBoundingClientRect().bottom;
  });
  expect(clearance).toBeGreaterThanOrEqual(0);
});
