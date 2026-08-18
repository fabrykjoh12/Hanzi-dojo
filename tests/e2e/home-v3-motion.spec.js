import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home's locked motion values:
//   rise  520ms — each block settles in via .hd-rise, staggered by inline
//                 animation-delays (header → hero → hand-off → week)
//   press 150ms — tappable blocks give under the finger via .hd-press
//   nav   260ms — the dock's selected capsule (HOME_MOTION.nav)
// Locked here so a stray inline edit can't quietly change how the app feels.

test('uses only the locked Home motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const hero = page.locator('[data-tour="home-queue"]');
  await expect(home).toBeVisible();
  // The hand-off panel arrives with the async daily story — wait for it so the
  // delay census below sees the full page.
  await expect(page.locator('[data-tour="home-then-read"]')).toBeVisible();

  // Blocks settle with the shared rise, genuinely staggered by inline delays.
  expect(await hero.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.52s');
  const delays = await home.evaluate(node =>
    [...node.querySelectorAll(':scope > .hd-rise')].map(el => parseFloat(getComputedStyle(el).animationDelay)));
  expect(delays.length).toBeGreaterThanOrEqual(4);
  expect(new Set(delays).size).toBe(delays.length);
  expect([...delays].sort((a, b) => a - b)).toEqual(delays);

  // The hero presses with the shared press physics.
  const heroDurations = (await hero.evaluate(node => getComputedStyle(node).transitionDuration)).split(',');
  expect(heroDurations[0].trim()).toBe('0.15s');

  // The dock's selected capsule expands/collapses at the locked nav timing.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const tabTransition = await activeTab.evaluate(node => getComputedStyle(node).transitionDuration);
  expect(tabTransition.split(',')[0].trim()).toBe('0.26s');
  // …and its label reveals on the same clock, so the two never disagree.
  const labelTransition = await activeTab.locator('span').last()
    .evaluate(node => getComputedStyle(node).transitionDuration);
  expect(labelTransition.split(',')[0].trim()).toBe('0.26s');

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
  const heroAnim = await page.locator('[data-tour="home-queue"]')
    .evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(heroAnim).toBeLessThanOrEqual(0.13);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const navTransition = await activeTab.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(navTransition).toBeLessThanOrEqual(0.13);
});
