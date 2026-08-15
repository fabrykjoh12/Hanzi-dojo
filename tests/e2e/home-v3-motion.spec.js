import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

test('uses only the locked Home V3 motion timings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const home = page.locator('[data-home-stage]');
  const hero = page.getByRole('region', { name: 'Cards' });
  const cta = page.getByRole('button', { name: 'Start cards' });
  await expect(home).toBeVisible();

  expect(await home.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.19s');
  expect(await hero.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.34s');

  await cta.dispatchEvent('pointerdown');
  expect((await cta.evaluate(node => getComputedStyle(node).transitionDuration)).split(',').every(value => value.trim() === '0.12s')).toBe(true);
  const pressed = await cta.boundingBox();
  await cta.dispatchEvent('pointerup');
  expect((await cta.evaluate(node => getComputedStyle(node).transitionDuration)).split(',').every(value => value.trim() === '0.14s')).toBe(true);
  const rested = await cta.boundingBox();
  expect(pressed.width).toBe(rested.width);
  expect(pressed.height).toBe(rested.height);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  expect(await nav.getByRole('button', { name: 'Stories' }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.21s');
  expect(await nav.getByRole('button', { name: 'Practice' }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.21s');
  const homeMedallion = nav.getByRole('button', { name: 'Home' }).locator(':scope > span').nth(1);
  expect((await homeMedallion.evaluate(node => getComputedStyle(node).transitionDuration)).split(',').every(value => value.trim() === '0.21s')).toBe(true);

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

test('reduced motion uses the approved 130ms state change', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const home = page.locator('[data-home-stage]');
  await expect(home).toBeVisible();
  expect(await home.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.13s');
  expect(await page.getByRole('region', { name: 'Cards' }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.13s');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  expect(await nav.getByRole('button', { name: 'Stories' }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.13s');
  expect(await nav.getByRole('button', { name: 'Practice' }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.13s');
  const medallionDurations = await nav.getByRole('button', { name: 'Home' }).locator(':scope > span').nth(1).evaluate(node => getComputedStyle(node).transitionDuration);
  expect(medallionDurations.split(',').every(value => value.trim() === '0.13s')).toBe(true);
});
