import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// Visual Style V2 — the render harness for the language sprint.
//
// Gated on P14_STYLE so CI never runs it — a design instrument, not a contract:
//
//   P14_STYLE=1 P14_OUT=/some/dir npx playwright test p14-style
//
// It shoots the style lab's frames ([data-style-frame]) and plates
// ([data-style-plate]) — deliberately NOT [data-vitality-frame], so the two
// labs' harnesses never collect each other's output.

const RUN = Boolean(process.env.P14_STYLE);
const OUT = process.env.P14_OUT || '/tmp/p14-style';

async function setTheme(page, theme) {
  await page.route('**/mock.supabase.co/rest/v1/profiles**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const row = { ...PROFILE, theme };
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
        'content-range': '0-0/*',
      },
      body: JSON.stringify(wantsObject ? row : [row]),
    });
  });
}

for (const theme of ['light', 'dark']) {
  test('renders the Visual Style V2 lab — ' + theme, async ({ page }) => {
    test.skip(!RUN, 'design harness; set P14_STYLE=1 to render');
    test.setTimeout(240000);
    fs.mkdirSync(OUT, { recursive: true });

    await setTheme(page, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1700, height: 1200 });
    await page.goto('/dev');

    const frames = page.locator('[data-style-frame]');
    await expect(frames.first()).toBeVisible({ timeout: 20000 });
    // The candidates are variable fonts loaded by the lab's own @font-face; a
    // frame shot before they arrive silently renders the fallback, and the
    // typography comparison becomes four screenshots of Inter.
    await page.evaluate(async () => {
      await document.fonts.load("600 17px 'Mona Sans Lab'");
      await document.fonts.load("600 17px 'Onest Lab'");
      await document.fonts.ready;
    });
    expect(await page.evaluate(() => document.fonts.check("600 17px 'Mona Sans Lab'"))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check("600 17px 'Onest Lab'"))).toBe(true);
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('[data-style-frame] [data-story-cover] img')];
      return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 30000 });

    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

    const total = await frames.count();
    const seen = {};
    for (let i = 0; i < total; i += 1) {
      const frame = frames.nth(i);
      const id = await frame.getAttribute('data-style-frame');
      const width = await frame.getAttribute('data-frame-width');
      const key = id + '-' + width;
      seen[key] = (seen[key] || 0) + 1;
      const name = key + (seen[key] > 1 ? '-' + seen[key] : '') + '-' + theme + '.png';
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: OUT + '/' + name });
    }
    for (const plate of await page.locator('[data-style-plate]').all()) {
      const id = await plate.getAttribute('data-style-plate');
      await plate.scrollIntoViewIfNeeded();
      await plate.screenshot({ path: OUT + '/plate-' + id + '-' + theme + '.png' });
    }
    expect(total).toBeGreaterThanOrEqual(13);

    // The packet-as-action claim is accessibility, not just art direction: one
    // ≥44px control whose name says what it does.
    const action = page.getByRole('button', { name: /Open cards — 136 ready/ }).first();
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
}
