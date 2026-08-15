import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home V4 geometry: the standard bottom tab bar behaves like furniture at
// every phone width in both themes — full-width, inside the viewport, one
// active tab, comfortable tap targets, labels that never truncate — and it
// leaves focused sessions (Study) entirely.

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
        name: label.textContent.trim(),
        width: box.width,
        height: box.height,
        labelWidth: labelBox.width,
        labelScrollWidth: label.scrollWidth,
      };
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      buttons,
    };
  });

  // No horizontal scroll, and the bar spans the full width at the bottom edge
  // — a standard tab bar, not a floating tray.
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.rect.left).toBe(0);
  expect(Math.round(geometry.rect.right)).toBe(geometry.viewportWidth);
  expect(geometry.rect.bottom).toBeLessThanOrEqual(844);
  for (const button of geometry.buttons) {
    expect(button.width, button.name).toBeGreaterThanOrEqual(44);
    expect(button.height, button.name).toBeGreaterThanOrEqual(44);
    expect(button.labelScrollWidth, button.name).toBeLessThanOrEqual(button.labelWidth + 0.5);
  }
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`${width}px ${theme}: Home, Stories, and Practice nav geometry`, async ({ page }) => {
      // Three full page loads per test is a lot of dev-server work under
      // parallel workers; give the matrix a realistic budget and don't wait
      // for images/fonts (`load`) when the assertions wait for the nav anyway.
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 844 });
      for (const destination of DESTINATIONS) {
        await test.step(`${destination.active} active`, async () => {
          await page.goto(destination.path, { waitUntil: 'domcontentloaded' });
          await page.locator('body').waitFor({ state: 'visible' });
          await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
          await assertMobileNavGeometry(page, destination.active);
        });
      }
    });
  }
}

test('the tab bar leaves during a study session', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/study');
  await page.getByRole('button', { name: /flashcard.*tap to reveal/i }).waitFor({ state: 'visible' });
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
});

test('Home content clears the nav and fonts settle without reflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Today' });
  const before = await heading.boundingBox();
  await page.evaluate(() => document.fonts.ready);
  const after = await heading.boundingBox();
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
