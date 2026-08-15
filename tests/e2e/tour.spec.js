import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// The first-run guided tour (tour.js + TourOverlay.jsx).
//
// The trigger is account age: only an account younger than
// TOUR_NEW_ACCOUNT_DAYS gets the coach marks (tour.js). The shared mock
// profile was created in January 2026, so every other spec runs on an
// "established" account and never sees the overlay — that is the real product
// rule doing the work, not a test-only escape hatch. To exercise the tour we
// serve the same profile with a fresh created_at.
async function serveFreshProfile(page) {
  await page.route('**/rest/v1/profiles**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const profile = { ...PROFILE, created_at: new Date().toISOString() };
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(wantsObject ? profile : [profile]),
    });
  });
}

test.describe('First-run tour', () => {
  test('a fresh account sees the Home tour once; Skip ends it across reloads', async ({ page }) => {
    await serveFreshProfile(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // The tour opens on its first step, as a real dialog named by the step title.
    const dialog = page.getByRole('dialog', { name: 'Start here each day' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/new words plus the reviews/)).toBeVisible();
    // The escape hatch is always on screen.
    const skip = dialog.getByRole('button', { name: 'Skip tour' });
    await expect(skip).toBeVisible();

    // Skip dismisses it — the screen is usable again.
    await skip.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The seen state lives in IndexedDB (offline.js prefs), which survives a
    // reload in the same browser context — so the tour must NOT come back.
    // Give the async prefs write a beat to commit before reloading.
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    // The trigger waits ~600ms before showing; wait past it, then assert quiet.
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // The Stories tour points at the redesigned library — the reward hero, the
  // poster shelf, the locked road ahead. Those anchors moved when Stories was
  // rebuilt around series and chapters, so this pins that they still resolve:
  // a step whose anchor is missing is dropped silently, which would otherwise
  // make a broken tour look like a short one.
  test('the Stories tour anchors onto the real shelf, step by step', async ({ page }) => {
    await serveFreshProfile(page);
    await page.goto('/stories');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();

    const first = page.getByRole('dialog', { name: 'Today’s story reward' });
    await expect(first).toBeVisible();
    await first.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('dialog', { name: 'Your library' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('dialog', { name: 'The road ahead' })).toBeVisible();
    // Last step finishes the tour rather than advancing into nothing.
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an established account is never toured', async ({ page }) => {
    // Default mock profile: created_at is months old — the age gate holds.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
