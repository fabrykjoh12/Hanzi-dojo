import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Home actions must be available immediately. Navigation may communicate a
// selection change, but content does not wait for a staggered entrance.

test('Home actions have no entrance delay and navigation keeps its labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.locator('[data-tour="home-queue"]');
  await expect(hero).toBeVisible();
  const entrance = await hero.evaluate(node => {
    const s = getComputedStyle(node);
    return { name: s.animationName, delay: parseFloat(s.animationDelay) };
  });
  expect(entrance.name).toBe('none');
  expect(entrance.delay).toBe(0);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const activeTab = nav.locator('[aria-current="page"]');
  const tabTransition = await activeTab.evaluate(node => getComputedStyle(node).transitionDuration);
  expect(tabTransition.split(',')[0].trim()).toBe('0.26s');
  const labelTransition = await activeTab.locator('span').last()
    .evaluate(node => getComputedStyle(node).transitionDuration);
  expect(labelTransition.split(',')[0].trim()).toBe('0s');
  await nav.getByRole('button', { name: 'Practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
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
