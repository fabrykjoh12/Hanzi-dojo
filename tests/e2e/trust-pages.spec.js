import { anonTest as test, expect } from '../fixtures/mockSupabase.js';

// The public trust pages (/privacy, /terms, /support, /methodology) must be
// readable BEFORE registration — they're linked from the Landing footer and
// the signup acknowledgment. These pin that they render signed-out and that
// the Landing footer actually links them.
test.describe('Trust pages (signed out)', () => {
  test('privacy renders with its beta note', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
    await expect(page.getByText(/no third-party trackers/i)).toBeVisible();
  });

  test('terms renders with the license attributions', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: /Terms of Use/i })).toBeVisible();
    await expect(page.getByText(/CC-CEDICT/i)).toBeVisible();
  });

  test('support and methodology render', async ({ page }) => {
    await page.goto('/support');
    await expect(page.getByRole('heading', { name: /Support/i })).toBeVisible();
    await page.goto('/methodology');
    await expect(page.getByRole('heading', { name: /How Hanzi Dojo teaches/i })).toBeVisible();
    await expect(page.getByText(/spaced repetition/i).first()).toBeVisible();
  });

  test('the landing footer links to them', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible();
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
  });
});
