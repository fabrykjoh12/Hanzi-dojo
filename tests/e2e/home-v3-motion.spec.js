import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The Desk Home's locked motion timings (HOME_MOTION in homePresentation.js):
//   page  460ms — each block settles in via .hd-home-rise, staggered
//   press 160ms — the desk card gives under the finger via .hd-press-deep
//   nav   260ms — the dock's ink dot slides between tabs
// Locked here so a stray inline edit can't quietly change how the app feels.

test('uses only the locked Home motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const desk = page.locator('[data-tour="home-queue"]');
  await expect(home).toBeVisible();

  // Blocks settle with the shared rise, genuinely staggered by inline delays.
  expect(await desk.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.46s');
  const delays = await home.evaluate(node =>
    [...node.querySelectorAll(':scope > .hd-home-rise')].map(el => getComputedStyle(el).animationDelay));
  expect(delays.length).toBeGreaterThanOrEqual(4);
  expect(new Set(delays).size).toBe(delays.length);

  // The desk presses with the deep-press physics and never changes size.
  const deskDurations = (await desk.evaluate(node => getComputedStyle(node).transitionDuration)).split(',');
  expect(deskDurations[0].trim()).toBe('0.16s');
  const before = await desk.boundingBox();
  await desk.dispatchEvent('pointerdown');
  await desk.dispatchEvent('pointerup');
  const after = await desk.boundingBox();
  expect(before.width).toBeCloseTo(after.width, 1);
  expect(before.height).toBeCloseTo(after.height, 1);

  // The dock's ink dot slides at the locked nav timing.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const dot = nav.locator(':scope > span[aria-hidden]').first();
  const dotTransition = await dot.evaluate(node => getComputedStyle(node).transitionDuration);
  expect(dotTransition.split(',')[0].trim()).toBe('0.26s');

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
  const deskAnim = await page.locator('[data-tour="home-queue"]')
    .evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(deskAnim).toBeLessThanOrEqual(0.13);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const dot = nav.locator(':scope > span[aria-hidden]').first();
  const navTransition = await dot.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(navTransition).toBeLessThanOrEqual(0.13);
});
