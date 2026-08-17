import { authedTest as test } from '../fixtures/mockSupabase.js';

// Phase 1 visual-evidence capture — NOT a regression suite. Runs only when
// PHASE1_SHOTS=1; screenshots land in phase1-screens/ (gitignored artifacts).

const shoot = process.env.PHASE1_SHOTS === '1';
const OUT = 'phase1-screens/';

test.describe('phase 1 evidence', () => {
  test.skip(!shoot, 'set PHASE1_SHOTS=1 to capture');

  const settle = async (page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
  };

  const homeShots = [
    ['home-390-light', 390, 844, 'light'],
    ['home-390-dark', 390, 844, 'dark'],
    ['home-320-light', 320, 844, 'light'],
    ['home-430-light', 430, 844, 'light'],
    ['home-390-short', 390, 620, 'light'],
  ];
  for (const [name, w, h, theme] of homeShots) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await settle(page);
      await page.screenshot({ path: OUT + name + '.png' });
    });
  }

  test('home-desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: OUT + 'home-desktop.png' });
  });

  for (const [name, path] of [
    ['nav-home', '/'], ['nav-stories', '/stories'],
    ['nav-practice', '/practice'], ['nav-profile', '/profile'],
  ]) {
    for (const theme of ['light', 'dark']) {
      test(`${name}-${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(path);
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        await settle(page);
        const nav = page.getByRole('navigation', { name: 'Primary' });
        const box = await nav.boundingBox();
        await page.screenshot({
          path: OUT + name + '-' + theme + '.png',
          clip: { x: 0, y: box.y - 24, width: 390, height: box.height + 48 },
        });
      });
    }
  }

  test('focus-flow: home → cards → study (dock hidden) → home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: OUT + 'flow-1-home-resting.png' });

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'Cards' }).click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: OUT + 'flow-2-entering-cards.png' });
    await page.getByText('Recall first, then reveal').waitFor();
    await settle(page);
    await page.screenshot({ path: OUT + 'flow-3-study-dock-hidden.png' });

    await page.getByRole('button', { name: 'Exit' }).click();
    await page.locator('[data-home-stage]').waitFor();
    await settle(page);
    await page.screenshot({ path: OUT + 'flow-4-back-home.png' });
  });
});
