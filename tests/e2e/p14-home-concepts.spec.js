import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// P14-5B's render harness: the three Home concepts, every learner state, every
// phone width, both themes.
//
// Gated on P14_CONCEPTS so CI never runs it — it is a design instrument, not a
// contract. The contract for the guide's LOGIC is src/homeGuide.test.js; what
// this file produces is the evidence a composition decision gets made on.
//
//   P14_CONCEPTS=1 P14_OUT=/some/dir npx playwright test p14-home-concepts
//
// It screenshots each frame ELEMENT rather than the page, because the lab shows
// 45 frames at once and each one is a whole phone-height composition.

const RUN = Boolean(process.env.P14_CONCEPTS);
const OUT = process.env.P14_OUT || '/tmp/p14-concepts';

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
  test('renders every Home concept — ' + theme, async ({ page }) => {
    test.skip(!RUN, 'design harness; set P14_CONCEPTS=1 to render');
    test.setTimeout(180000);
    fs.mkdirSync(OUT, { recursive: true });

    await setTheme(page, theme);
    // Wide enough that a 430px frame lays out at its natural width, tall enough
    // that a full phone-height frame needs little scrolling to capture.
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.goto('/dev');

    const frames = page.locator('[data-concept-frame]');
    await expect(frames.first()).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    // The story artwork is a real 1344×756 webp per frame; let them all decode
    // before capturing, or a frame screenshots mid-load.
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('[data-story-cover] img')];
      return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 30000 });

    const total = await frames.count();
    const index = [];
    for (let i = 0; i < total; i += 1) {
      const frame = frames.nth(i);
      const meta = await frame.evaluate(el => ({
        concept: el.getAttribute('data-concept-frame'),
        state: el.getAttribute('data-concept-state'),
        width: el.getAttribute('data-frame-width'),
      }));
      const name = [meta.concept, meta.state, meta.width, theme].join('-') + '.png';
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: OUT + '/' + name });
      index.push({ ...meta, theme, file: name });
    }
    fs.writeFileSync(OUT + '/index-' + theme + '.json', JSON.stringify(index, null, 2));
    expect(index.length).toBeGreaterThan(0);
  });
}
