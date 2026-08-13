import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// P14-5D Finding 2 — the vitality lab's render harness.
//
// The layout is settled and identical across all three treatments, so a
// screenshot is the only instrument that can answer the actual question: which
// one of marker / object / material / connector makes the current step feel
// alive without making the page louder.
//
// Gated on P14_VITALITY so CI never runs it — a design instrument, not a
// contract:
//
//   P14_VITALITY=1 P14_OUT=/some/dir npx playwright test p14-vitality
//
// It shoots each frame ELEMENT, not the page: the lab holds 36 phone-height
// compositions at once.

const RUN = Boolean(process.env.P14_VITALITY);
const OUT = process.env.P14_OUT || '/tmp/p14-vitality';

// The theme lives on the ACCOUNT — App applies `profile.theme` on load and
// overwrites whatever the device remembered, so emulating the OS scheme alone
// produces a light screenshot in a directory named dark.
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

// The material's whole claim is that it responds to a finger. A still frame
// cannot show that, so this captures the same button in both states.
test('captures the lacquer button at rest and pressed', async ({ page }) => {
  test.skip(!RUN, 'design harness; set P14_VITALITY=1 to render');
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev');
  const btn = page.locator('[data-gallery-group="Button · variants"]')
    .getByRole('button', { name: 'Lacquer', exact: true });
  await btn.waitFor();
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await btn.screenshot({ path: OUT + '/lacquer-rest.png' });
  await btn.dispatchEvent('pointerdown');
  await page.waitForTimeout(120);
  await btn.screenshot({ path: OUT + '/lacquer-pressed.png' });
  // The press has to be a real state change, not a CSS hover the shot missed.
  expect(await btn.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
});

for (const theme of ['light', 'dark']) {
  test('renders every vitality treatment — ' + theme, async ({ page }) => {
    test.skip(!RUN, 'design harness; set P14_VITALITY=1 to render');
    test.setTimeout(180000);
    fs.mkdirSync(OUT, { recursive: true });

    await setTheme(page, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.goto('/dev');

    const frames = page.locator('[data-vitality-frame]');
    await expect(frames.first()).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    // Real production artwork, one 1344×756 webp per story frame — capture
    // before they decode and the richest element in the composition is missing.
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('[data-story-cover] img')];
      return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 30000 });

    // Evidence is only evidence if the theme took.
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

    const total = await frames.count();
    const index = [];
    for (let i = 0; i < total; i += 1) {
      const frame = frames.nth(i);
      // The anti-AI rule is, in the end, a rule about COUNT: how many separate
      // drawn boxes the eye has to parse. Recorded per frame so the comparison
      // is not purely a matter of taste.
      const meta = await frame.evaluate(el => {
        let boxes = 0;
        const radii = new Set();
        const shadows = new Set();
        for (const node of el.querySelectorAll('*')) {
          const r = node.getBoundingClientRect();
          if (r.width < 3 || r.height < 3) continue;
          const cs = getComputedStyle(node);
          if (cs.boxShadow !== 'none') shadows.add(cs.boxShadow);
          const rad = parseFloat(cs.borderTopLeftRadius) || 0;
          const drawn = cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
            || cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
          if (rad > 2 && drawn) { boxes += 1; radii.add(cs.borderTopLeftRadius); }
        }
        return {
          treatment: el.getAttribute('data-vitality-frame'),
          state: el.getAttribute('data-vitality-state'),
          width: el.getAttribute('data-frame-width'),
          // Minus the frame itself and its faux nav tray, which are lab chrome.
          drawnBoxes: boxes - 2,
          radii: [...radii].sort((a, b) => parseFloat(a) - parseFloat(b)),
          shadows: shadows.size,
        };
      });
      const name = [meta.treatment, meta.state, meta.width, theme].join('-') + '.png';
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: OUT + '/' + name });
      index.push({ ...meta, theme, file: name });
    }
    fs.writeFileSync(OUT + '/index-' + theme + '.json', JSON.stringify(index, null, 2));
    expect(index.length).toBe(36);
  });
}
