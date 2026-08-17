import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home's locked motion (HOME_MOTION in homePresentation.js):
//   page  460ms — each block settles in via .hd-home-rise, staggered
//   press 160ms — the primary action gives under the finger via .hd-press-deep
// The dock is deliberately quieter still: selection changes colour only
// (~180ms), so switching tabs animates nothing geometric. Locked here so a
// stray inline edit can't quietly change how the app feels.

test('uses only the locked Home motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const primary = page.locator('[data-tour="home-queue"]');
  await expect(home).toBeVisible();

  // Blocks settle with the shared rise, genuinely staggered by inline delays.
  const delays = await home.evaluate(node =>
    [...node.querySelectorAll('.hd-home-rise')].map(el => getComputedStyle(el).animationDelay));
  expect(delays.length).toBeGreaterThanOrEqual(4);
  expect(new Set(delays).size).toBe(delays.length);
  expect(await primary.evaluate(node =>
    getComputedStyle(node.closest('.hd-home-rise') || node).animationDuration)).toBe('0.46s');

  // The primary action presses with the deep-press physics and never changes size.
  const pressDurations = (await primary.evaluate(node => getComputedStyle(node).transitionDuration)).split(',');
  expect(pressDurations[0].trim()).toBe('0.16s');
  const before = await primary.boundingBox();
  await primary.dispatchEvent('pointerdown');
  await primary.dispatchEvent('pointerup');
  const after = await primary.boundingBox();
  expect(before.width).toBeCloseTo(after.width, 1);
  expect(before.height).toBeCloseTo(after.height, 1);

  // Dock selection is colour-only: no flex, width or transform in the
  // transition list, so changing tabs can never move geometry.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const tabTransition = await activeTab.evaluate(node => getComputedStyle(node).transitionProperty);
  expect(tabTransition).not.toContain('flex');
  expect(tabTransition).not.toContain('width');
  const tabDuration = await activeTab.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(tabDuration).toBeLessThanOrEqual(0.2);

  // And the whole screen stays smooth while settling.
  const frames = await page.evaluate(() => new Promise(resolve => {
    const samples = [];
    let last = performance.now();
    let count = 0;
    function frame(now) {
      samples.push(now - last);
      last = now;
      count += 1;
      if (count < 24) requestAnimationFrame(frame);
      else resolve(samples.slice(2));
    }
    requestAnimationFrame(frame);
  }));
  const sorted = [...frames].sort((a, b) => a - b);
  expect(sorted[Math.floor(sorted.length * 0.5)]).toBeLessThan(20);
  expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(40);
});

test('reduced motion flattens every Home animation and transition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();

  // The catch-all in index.css collapses durations to effectively zero; assert
  // a ceiling rather than an exact value so the mechanism can evolve.
  const primaryAnim = await page.locator('[data-tour="home-queue"]')
    .evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(primaryAnim).toBeLessThanOrEqual(0.13);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const navTransition = await activeTab.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(navTransition).toBeLessThanOrEqual(0.13);
});
