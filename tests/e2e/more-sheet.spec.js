import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// P10-C0 — who is offered a language switch.
//
// Publicly Hanzi Dojo is Chinese (CLAUDE.md §1). The More sheet used to hand
// every learner a "Language" row into a screen that offers to "start a new
// language", which is an invitation into a product that does not exist. The
// screen, the route and the tracks behind it are untouched — only the invitation
// moved, to staff.

const asAdmin = async (page) => {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const one = (req.headers()['accept'] || '').includes('pgrst.object');
    const row = { ...PROFILE, is_admin: true };
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-0/*' },
      body: JSON.stringify(one ? row : [row]),
    });
  });
};

const openMore = async (page) => {
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More menu' });
  await expect(sheet).toBeVisible();
  return sheet;
};

test.describe('the More sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('offers a public account no language switch', async ({ page }) => {
    const sheet = await openMore(page);
    await expect(sheet.getByRole('button', { name: 'Language' })).toHaveCount(0);
    await expect(sheet.getByText(/language/i)).toHaveCount(0);
    // Everything a public account had before is still there.
    for (const item of ['Profile', 'Settings', 'Log out']) {
      await expect(sheet.getByRole('button', { name: item })).toBeVisible();
    }
    // And no admin tools leaked in with the change.
    for (const item of ['Dashboard', 'Dojo HQ']) {
      await expect(sheet.getByRole('button', { name: item })).toHaveCount(0);
    }
  });

  test('keeps it for staff, beside Profile', async ({ page }) => {
    await asAdmin(page);
    const sheet = await openMore(page);
    await expect(sheet.getByRole('button', { name: 'Language' })).toBeVisible();
    const labels = await sheet.getByRole('button').evaluateAll(
      (els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean));
    expect(labels).toEqual(['Dashboard', 'Dojo HQ', 'Profile', 'Language', 'Settings', 'Log out']);
  });

  test('leaves the switcher itself reachable', async ({ page }) => {
    // The route stays open deliberately: anyone already on a paused track keeps
    // it, and closing the exit would strand such an account.
    await page.goto('/languages');
    await page.waitForTimeout(900);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

});

test.describe('the desktop rail', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a public account is told what it studies, not offered a switch', async ({ page }) => {
    // The seal is the same object in the same place — but it is a label rather
    // than a button unless the account is staff.
    await page.goto('/');
    await page.waitForTimeout(700);
    await expect(page.locator('nav[aria-label="Main"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Switch language/i })).toHaveCount(0);
    await expect(page.getByLabel(/^Studying Chinese/)).toBeVisible();
  });

  test('and staff still get the switch from the rail', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/');
    await page.waitForTimeout(700);
    await expect(page.getByRole('button', { name: /Studying Chinese.*Switch language/i })).toBeVisible();
  });
});
