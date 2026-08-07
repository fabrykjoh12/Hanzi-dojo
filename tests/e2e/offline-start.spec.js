import { authedTest, anonTest, expect } from '../fixtures/mockSupabase.js';

// A cold start with no network must never white-screen.
//
// This is the first thing a store reviewer does to an app that advertises
// offline study: turn the network off and open it. A blank page there reads
// as "the app is broken" — and it is also exactly what an underground commute
// looks like to a real learner.
//
// What "offline" means for the STORE BUILD is specific, and it is what this
// spec models: the app's own assets are bundled inside the app, so they always
// load; it is the SERVER that is unreachable. (Blanket context.setOffline()
// would instead stop the test server serving index.html — a state the native
// app cannot be in, and it would test the harness rather than the product.)
//
// The bar deliberately is NOT "everything works offline". Supabase is dead, so
// data-backed screens legitimately show their offline/error states. The bar is
// that the shell renders, says something honest, and leaves a way forward.

// Kill every backend call, leaving local assets alone. Registered inside the
// test so it takes precedence over the fixture's own Supabase routes.
async function killBackend(page) {
  await page.route('**/rest/v1/**', route => route.abort());
  await page.route('**/auth/v1/**', route => route.abort());
  await page.route('**/functions/v1/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
}

authedTest.describe('offline cold start (signed in)', () => {
  authedTest('renders the app instead of a blank page', async ({ page }) => {
    await killBackend(page);
    await page.goto('/');

    // Something must be painted. A white screen fails both assertions.
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect.poll(
      async () => (await page.locator('body').innerText()).trim().length,
      { timeout: 15000 }
    ).toBeGreaterThan(0);
  });

  authedTest('says something honest rather than a false success state', async ({ page }) => {
    await killBackend(page);
    await page.goto('/');

    // One of the honest states — the offline bar, or the retry/failure copy
    // added in the navigation pass. Never a silent "all caught up".
    const honest = page.getByText(/offline|couldn['’]t (load|reach)|try again|check your connection|no connection/i);
    await expect(honest.first()).toBeVisible({ timeout: 15000 });
  });
});

anonTest.describe('offline cold start (signed out)', () => {
  anonTest('does not white-screen for a visitor with no session', async ({ page }) => {
    await killBackend(page);
    await page.goto('/');

    await expect(page.locator('#root')).not.toBeEmpty();
    await expect.poll(
      async () => (await page.locator('body').innerText()).trim().length,
      { timeout: 15000 }
    ).toBeGreaterThan(0);
  });
});
