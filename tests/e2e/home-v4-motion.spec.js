import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Motion V4: one shared screen-enter settle on every view change, quiet press
// feedback, and a reduced-motion path that collapses all of it.

test('every screen enters with the shared 190ms settle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const wrapper = page.locator('.hd-screen-enter');
  await expect(wrapper).toBeVisible();
  expect(await wrapper.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.19s');

  // Switching tabs re-keys the wrapper — same settle, no per-screen variants.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  expect(await page.locator('.hd-screen-enter').evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.19s');
});

test('the session panel presses down and springs back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const panel = page.getByRole('region', { name: 'Cards' }).getByRole('button');
  await expect(panel).toBeVisible();
  await panel.dispatchEvent('pointerdown');
  const pressedTransform = await panel.evaluate(node => getComputedStyle(node).transform);
  expect(pressedTransform).not.toBe('none');
  await panel.dispatchEvent('pointerup');
  // Frame sizes must not change under press — scale only, no reflow.
  const before = await panel.boundingBox();
  await panel.dispatchEvent('pointerdown');
  const during = await panel.boundingBox();
  await panel.dispatchEvent('pointerup');
  expect(Math.abs(before.width - during.width)).toBeLessThanOrEqual(before.width * 0.02 + 0.5);
  expect(Math.abs(before.height - during.height)).toBeLessThanOrEqual(before.height * 0.02 + 0.5);

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

test('reduced motion collapses the settle to a 130ms fade', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const wrapper = page.locator('.hd-screen-enter');
  await expect(wrapper).toBeVisible();
  expect(await wrapper.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.13s');
  expect(await wrapper.evaluate(node => getComputedStyle(node).transform)).toBe('none')
});
