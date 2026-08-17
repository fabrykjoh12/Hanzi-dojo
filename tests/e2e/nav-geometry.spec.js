import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The floating dock: five fixed tabs — Home · Stories · Cards · Practice ·
// Profile — icon over label, every label always printed. These tests pin the
// geometry that keeps it usable: floating clear of the edges, comfortable
// targets, no clipped labels, identical geometry whichever tab is selected —
// across widths and themes.

const WIDTHS = [320, 390, 430];
const THEMES = ['light', 'dark'];
const TAB_ORDER = ['Home', 'Stories', 'Cards', 'Practice', 'Profile'];
const DESTINATIONS = [
  { path: '/', active: 'Home' },
  { path: '/stories', active: 'Stories' },
  { path: '/practice', active: 'Practice' },
  { path: '/profile', active: 'Profile' },
];

async function readNavGeometry(page) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  return nav.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map(button => {
      const box = button.getBoundingClientRect();
      const label = button.lastElementChild;
      return {
        name: button.textContent.trim(),
        active: button.getAttribute('aria-current') === 'page',
        left: box.left,
        width: box.width,
        height: box.height,
        labelWidth: label.getBoundingClientRect().width,
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
}

async function assertMobileNavGeometry(page, active) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAccessibleName(active);

  const geometry = await readNavGeometry(page);

  // Floating: inset from both edges, and clear of the bottom of the viewport.
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.rect.left).toBeGreaterThanOrEqual(8);
  expect(geometry.rect.right).toBeLessThanOrEqual(geometry.viewportWidth - 8);
  expect(844 - geometry.rect.bottom).toBeGreaterThanOrEqual(8);

  // All five destinations, in the locked order.
  expect(geometry.buttons.map(b => b.name)).toEqual(TAB_ORDER);

  const widths = geometry.buttons.map(b => b.width);
  for (const button of geometry.buttons) {
    // Comfortable targets on every tab, resting or selected.
    expect(button.width, button.name).toBeGreaterThanOrEqual(44);
    expect(button.height, button.name).toBeGreaterThanOrEqual(44);
    // Every label is fully printed — never clipped, never hidden.
    expect(button.labelScrollWidth, button.name).toBeLessThanOrEqual(button.labelWidth + 0.5);
    expect(button.labelWidth, button.name).toBeGreaterThan(20);
  }

  // Equal columns: no tab grows because it is selected or central.
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);

  const home = nav.getByRole('button', { name: 'Home' });
  if (active === 'Home') await expect(home).toHaveAttribute('aria-current', 'page');
  else await expect(home).not.toHaveAttribute('aria-current', 'page');
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`${width}px ${theme}: dock geometry on every root`, async ({ page }) => {
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

test('changing tabs moves nothing: geometry is identical before and after', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const before = await readNavGeometry(page);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Stories' }).click();
  await page.waitForTimeout(350);
  const after = await readNavGeometry(page);
  expect(after.buttons.map(b => Math.round(b.left))).toEqual(before.buttons.map(b => Math.round(b.left)));
  expect(after.buttons.map(b => Math.round(b.width))).toEqual(before.buttons.map(b => Math.round(b.width)));
  expect(Math.round(after.rect.bottom)).toBe(Math.round(before.rect.bottom));
});

test('Home content clears the floating dock and fonts settle without reflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();
  const greeting = page.getByText('Continue your Chinese');
  const before = await greeting.boundingBox();
  await page.evaluate(() => document.fonts.ready);
  const after = await greeting.boundingBox();
  expect(await page.evaluate(() => document.fonts.check('16px "Mona Sans"'))).toBe(true);
  expect(Math.abs(before.width - after.width)).toBeLessThan(0.5);
  expect(Math.abs(before.height - after.height)).toBeLessThan(0.5);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const clearance = await page.evaluate(() => {
    const navTop = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect().top;
    const lastSection = document.querySelector('[data-home-stage] > section:last-child');
    return navTop - lastSection.getBoundingClientRect().bottom;
  });
  expect(clearance).toBeGreaterThanOrEqual(0);
});
