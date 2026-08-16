import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home V4's locked motion timings (HOME_MOTION in homePresentation.js):
//   page  460ms — each section settles in via .hd-home-rise
//   press 160ms — primary actions give under the finger via .hd-press-deep
//   nav   260ms — the dock's ink pill slides between tabs
// Locked here so a stray inline edit can't quietly change how the app feels.

test('uses only the locked Home motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const hero = page.getByRole('region', { name: 'Cards' });
  const cta = page.getByRole('button', { name: 'Start cards' });
  await expect(home).toBeVisible();

  // Sections settle with the shared rise, staggered by inline delays.
  expect(await hero.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.46s');
  const delays = await home.evaluate(node =>
    [...node.querySelectorAll(':scope > .hd-home-rise')].map(el => getComputedStyle(el).animationDelay));
  expect(delays.length).toBeGreaterThanOrEqual(4);
  expect(new Set(delays).size).toBe(delays.length); // genuinely staggered

  // The primary CTA presses with the deep-press physics.
  const ctaDurations = (await cta.evaluate(node => getComputedStyle(node).transitionDuration)).split(',');
  expect(ctaDurations[0].trim()).toBe('0.16s');
  const before = await cta.boundingBox();
  await cta.dispatchEvent('pointerdown');
  await cta.dispatchEvent('pointerup');
  const after = await cta.boundingBox();
  expect(before.width).toBe(after.width);
  expect(before.height).toBe(after.height);

  // The dock indicator slides at the locked nav timing.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const indicator = nav.locator(':scope > span[aria-hidden]').first();
  const indicatorTransition = await indicator.evaluate(node => getComputedStyle(node).transitionDuration);
  expect(indicatorTransition.split(',')[0].trim()).toBe('0.26s');

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
  const heroAnim = await page.getByRole('region', { name: 'Cards' })
    .evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(heroAnim).toBeLessThanOrEqual(0.13);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const indicator = nav.locator(':scope > span[aria-hidden]').first();
  const navTransition = await indicator.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(navTransition).toBeLessThanOrEqual(0.13);
});
