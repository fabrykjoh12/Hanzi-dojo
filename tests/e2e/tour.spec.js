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
    await expect(page.getByText('Today', { exact: true })).toBeVisible();

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
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
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

    // Two marks, not three: the reward mark is gone, because the onboarding
    // tutorial ends with a session completing, a story unlocking and two lines
    // of Chinese read out of it. Saying it again here would be its third
    // telling.
    const first = page.getByRole('dialog', { name: 'Chapter one is always free' });
    await expect(first).toBeVisible();
    await first.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('dialog', { name: 'Locked stories say why' })).toBeVisible();
    // Last step finishes the tour rather than advancing into nothing.
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an established account is never toured', async ({ page }) => {
    // Default mock profile: created_at is months old — the age gate holds.
    await page.goto('/');
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a learner the tutorial already taught is never toured on Home', async ({ page }) => {
    // The redundancy the suppression exists to prevent: the tutorial ends with
    // a session completing, a story unlocking and two lines of Chinese read —
    // being then told "this is today's session" in a dimmed overlay is the
    // third telling. This could never fire before P12-0, because the done flag
    // lived inside prelogin:prefs and setup cleared that whole key on its way
    // to Home (P12 audit §3.2). The durable record survives setup; assert the
    // suppression it feeds actually holds on a brand-new account.
    await page.addInitScript(() => {
      try { localStorage.setItem('hd:tutorial-done', '1'); } catch { /* blocked */ }
    });
    await serveFreshProfile(page);
    await page.goto('/');
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
