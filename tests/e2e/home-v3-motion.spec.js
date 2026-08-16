import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Today's locked motion timings (HOME_MOTION in homePresentation.js):
//   page  460ms — the object settles in via .hd-home-rise
//   press 160ms — it gives under the finger via .hd-press-deep
//   tab   180ms — the dock's selected destination repaints
//   nav   260ms — the dock sinks out of focused work and lifts back
// Locked here so a stray inline edit can't quietly change how the app feels.

test('uses only the locked Today motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const card = page.locator('[data-tour="home-queue"]');
  await expect(home).toBeVisible();

  // Today holds ONE object, so there is no staggered cascade to run: the object
  // settles in on the page clock and nothing else animates around it.
  expect(await card.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.46s');

  // It presses with the deep-press physics and never changes size.
  const cardDurations = (await card.evaluate(node => getComputedStyle(node).transitionDuration)).split(',');
  expect(cardDurations[0].trim()).toBe('0.16s');
  const before = await card.boundingBox();
  await card.dispatchEvent('pointerdown');
  await card.dispatchEvent('pointerup');
  const after = await card.boundingBox();
  expect(before.width).toBeCloseTo(after.width, 1);
  expect(before.height).toBeCloseTo(after.height, 1);

  // Selecting a destination is a repaint on the tab clock — and because the
  // compact dock's segments never resize, no layout property is animated at all.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const tab = await activeTab.evaluate(node => ({
    duration: getComputedStyle(node).transitionDuration,
    properties: getComputedStyle(node).transitionProperty,
  }));
  expect(tab.duration.split(',')[0].trim()).toBe('0.18s');
  expect(tab.properties).not.toContain('width');
  expect(tab.properties).not.toContain('flex');

  // The dock itself sinks and lifts on the nav clock.
  const navTransition = await nav.evaluate(node => getComputedStyle(node).transitionDuration);
  expect(navTransition.split(',')[0].trim()).toBe('0.26s');

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

test('reduced motion flattens every Today animation and transition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();

  // The catch-all in index.css collapses durations to effectively zero; assert
  // a ceiling rather than an exact value so the mechanism can evolve.
  const cardAnim = await page.locator('[data-tour="home-queue"]')
    .evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(cardAnim).toBeLessThanOrEqual(0.13);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const navTransition = await activeTab.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(navTransition).toBeLessThanOrEqual(0.13);
});
