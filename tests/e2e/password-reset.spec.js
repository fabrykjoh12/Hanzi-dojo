import { anonTest, authedTest, expect } from '../fixtures/mockSupabase.js';

// Password recovery, end to end through the app shell.
//
// The bug this guards (reported 2026-08-09): a reset requested INSIDE the
// store app emailed a link that returned to `capacitor://localhost` — a URL
// Supabase refuses. GoTrue burned the one-time token and bounced the learner
// to the public website's welcome screen: no session, no form, no way back in.
// The redirect logic is unit-tested in nativeAuth.test.js; these cover what a
// learner actually ends up looking at.

// Supabase hands the web app its recovery tokens in the URL fragment
// (implicit flow) and fires PASSWORD_RECOVERY.
const RECOVERY_HASH = '#access_token=mock&expires_in=3600&refresh_token=mock'
  + '&token_type=bearer&type=recovery';

anonTest('a recovery link lands on the set-a-new-password screen', async ({ page }) => {
  await page.goto('/' + RECOVERY_HASH);
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save new password' })).toBeVisible();
});

// The app's own route: NativeShellBridge navigates here after exchanging the
// deep link's one-time code, so a signed-in visitor on it must get the form
// rather than the app shell (or a 404).
authedTest('the app’s recovery route shows the password form, not the app', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
});

// A reset link that cannot complete — expired, or opened on a device that
// never held the PKCE verifier — must SAY so. Silently showing the welcome
// screen is exactly the failure that got reported.
anonTest('a failed reset link explains itself on the sign-in screen', async ({ page }) => {
  await page.goto('/?auth=reset-failed');
  await expect(page.getByText(/device you requested them from/i)).toBeVisible();
  // …and drops the learner straight into the form that sends a fresh one.
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});

anonTest('an ordinary visit shows no auth warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/device you requested them from/i)).toHaveCount(0);
});
