import { anonTest as test, authedTest, expect } from '../fixtures/mockSupabase.js';

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

// FAB-19 F22: the pages must also be reachable ONCE YOU HAVE AN ACCOUNT.
// Before this, /privacy was linked only from the signup screen and the public
// landing footer — both unreachable signed-in — which is an App Store 5.1.1(i)
// rejection. Settings now carries the three links (src/legalLinks.js).
authedTest.describe('Trust pages (signed in)', () => {
  authedTest('Settings links to privacy, terms and support', async ({ page }) => {
    await page.goto('/settings');
    for (const label of ['Privacy Policy', 'Terms of Use', 'Support & Contact']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  authedTest('each link opens its page in-app and comes back', async ({ page }) => {
    const cases = [
      ['Privacy Policy', /Privacy Policy/i, /\/privacy$/],
      ['Terms of Use', /Terms of Use/i, /\/terms$/],
      ['Support & Contact', /Support/i, /\/support$/],
    ];
    for (const [label, heading, url] of cases) {
      await page.goto('/settings');
      await page.getByRole('button', { name: label }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  authedTest('the privacy policy is readable signed in, not just signed out', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
    await expect(page.getByText(/no third-party trackers/i)).toBeVisible();
  });
});
