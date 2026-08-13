import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// P14-5D Finding 2 — the vitality lab's render harness.
//
// The visual language is settled and identical across every frame, so a
// screenshot is the only instrument that can answer the question actually left:
// how the Cards → Story → Practice sequence should occupy the page. It carries a
// labelled CONTROL (the approved build's own rhythm) so "does it still feel
// empty" has a before as well as an after — and it measures that feeling as a
// number, `largestGap`, rather than leaving it to taste.
//
// Gated on P14_VITALITY so CI never runs it — a design instrument, not a
// contract:
//
//   P14_VITALITY=1 P14_OUT=/some/dir npx playwright test p14-vitality
//
// It shoots each frame ELEMENT, not the page: the lab holds 48 phone-height
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
        // "Does the page still feel empty?" made into a number: the tallest run
        // of nothing between two pieces of content. A composition that ends
        // early shows up here as one big gap, which no amount of taste-based
        // argument can talk away.
        const marks = [];
        for (const node of el.querySelectorAll('*')) {
          const r = node.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || r.height > 300) continue;
          // Decoration is not content: the page's own background image spans the
          // whole frame, and the connector spans the whole sequence — count
          // either and every gap closes to zero.
          if (node.closest('[aria-hidden="true"]') || node.classList.contains('hd-bg')) continue;
          const own = (node.textContent || '').trim();
          const textLeaf = own && !Array.from(node.children).some(c => (c.textContent || '').trim());
          const art = node.hasAttribute('data-story-cover');
          const object = node.tagName === 'svg' && r.width >= 15;
          if (textLeaf || art || object || node.tagName === 'BUTTON') marks.push([r.top, r.bottom]);
        }
        marks.sort((a, b) => a[0] - b[0]);
        let gap = 0;
        let reach = -Infinity;
        for (const [t, b] of marks) {
          if (reach > -Infinity && t - reach > gap) gap = t - reach;
          if (b > reach) reach = b;
        }

        return {
          treatment: el.getAttribute('data-vitality-frame'),
          state: el.getAttribute('data-vitality-state'),
          width: el.getAttribute('data-frame-width'),
          largestGap: Math.round(gap),
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
    // The object on its own — at the size Home draws it and at 2x — and the
    // opening storyboard. A hero object cannot be judged only inside a
    // composition: half its job is to survive being looked at closely.
    for (const plate of await page.locator('[data-packet-plate]').all()) {
      const id = await plate.getAttribute('data-packet-plate');
      await plate.scrollIntoViewIfNeeded();
      await plate.screenshot({ path: OUT + '/packet-' + id + '-' + theme + '.png' });
    }
    const board = page.locator('[data-storyboard]').first();
    if (await board.count()) {
      await board.scrollIntoViewIfNeeded();
      await board.screenshot({ path: OUT + '/storyboard-' + theme + '.png' });
    }

    fs.writeFileSync(OUT + '/index-' + theme + '.json', JSON.stringify(index, null, 2));
    expect(index.length).toBe(36);
  });
}
