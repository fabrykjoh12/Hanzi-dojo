import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// Dojo HQ is internal tooling — workspaces, invite codes, member management.
// It shipped in PRIMARY_NAV, visible to every learner, with no gate on the
// route either. These pin both halves of the fix.
//
// NOTE on the direct-URL case: this suite runs against the Vite DEV server,
// whose html-fallback resolves /hq to the standalone hq.html entry before
// React Router sees it. That entry is NOT in the public build (vite.config.js
// only adds it for the Sites target) and Vercel rewrites every path to
// index.html, so in production /hq reaches App and hits the gate below. To
// test the gate rather than the dev server, we drive the client router.
test.describe('Dojo HQ is not a learner surface', () => {
  test('does not appear in the navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await expect(page.getByRole('button', { name: /Dojo HQ/i })).toHaveCount(0);
  });

  test('the client route renders 404 for a non-admin', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();

    // Client-side navigation, so App's route gate runs (the mock profile has
    // no is_admin flag).
    await page.evaluate(() => {
      window.history.pushState({}, '', '/hq');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // None of the HQ chrome renders — not its header, not its Norwegian UI.
    await expect(page.getByText('Hanzi Dojo HQ')).toHaveCount(0);
    await expect(page.getByText(/medlemmer|arbeidsområdet/i)).toHaveCount(0);
  });
});
