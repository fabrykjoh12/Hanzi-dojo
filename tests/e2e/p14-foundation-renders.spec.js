import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// P14's regression camera.
//
// The whole risk in a token phase is the one thing a token phase is not allowed
// to do: quietly redesign a screen. Every device-approved composition (Home,
// Study, Stories, Practice, Profile) has to come out of P14-0 looking like it
// went in, and the only honest way to show that is a picture plus a handful of
// measured numbers.
//
// It asserts almost nothing — an audit that fails tells you nothing new. What it
// DOES assert is the thing that would invalidate the evidence: that the capture
// is really in the theme it claims. A "dark" screenshot that came back light is
// worse than no screenshot, and that has already happened once in this project.
//
// Gated so it never runs in CI: `P14_SHOTS=1 npx playwright test p14-foundation`.
// Kept (not deleted) because P14-1 and P14-2 ask the same question every time.
const ENABLED = !!process.env.P14_SHOTS;

const OUT = process.env.P14_OUT || '/tmp/p14';
const SHOTS = OUT + '/shots';

// The theme comes from the learner's PROFILE — App applies `prof.theme` on load
// and it overwrites whatever the device remembered. Emulating the OS colour
// scheme is therefore not enough: it has to be set on the account, in front of
// the fixture's own route (Playwright runs the most recently registered handler
// first).
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

const SCREENS = [
  { id: 'home', go: async (p) => { await p.goto('/'); await p.getByText('Today', { exact: true }).waitFor(); await p.waitForTimeout(500); } },
  { id: 'stories', go: async (p) => { await p.goto('/stories'); await p.waitForTimeout(1100); } },
  { id: 'practice', go: async (p) => { await p.goto('/practice'); await p.waitForTimeout(800); } },
  { id: 'profile', go: async (p) => { await p.goto('/profile'); await p.waitForTimeout(1000); } },
  { id: 'study-front', go: async (p) => { await new StudyPage(p).goto(); await p.waitForTimeout(500); } },
  {
    id: 'study-revealed',
    go: async (p) => {
      const s = new StudyPage(p);
      await s.goto();
      await s.reveal();
      await p.waitForTimeout(500);
    },
  },
  // P14-2 widened the set: normalization touches every screen, so the check has
  // to cover more than the six P14-0 needed.
  { id: 'settings', go: async (p) => { await p.goto('/settings'); await p.waitForTimeout(800); } },
  { id: 'words', go: async (p) => { await p.goto('/words'); await p.waitForTimeout(900); } },
  { id: 'known', go: async (p) => { await p.goto('/known'); await p.waitForTimeout(900); } },
  { id: 'languages', go: async (p) => { await p.goto('/languages'); await p.waitForTimeout(800); } },
  { id: 'grammar', go: async (p) => { await p.goto('/grammar'); await p.waitForTimeout(800); } },
  { id: 'dictionary', go: async (p) => { await p.goto('/dictionary'); await p.waitForTimeout(800); } },
  { id: 'weak', go: async (p) => { await p.goto('/weak'); await p.waitForTimeout(1000); } },
  { id: 'test', go: async (p) => { await p.goto('/test'); await p.waitForTimeout(1000); } },
];

// What would move if a composition had changed underneath the tokens.
//
// P14-0 only needed box/size/radius COUNTS, because it changed colours. P14-2
// changes type, so it needs the things type actually breaks: how many LINES a
// text node wraps to, whether anything is CLIPPED by its own box, and where each
// labelled element SITS on the page. A count-only check would happily pass while
// a card grew 14px and pushed everything below it down.
async function measure(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#main-content') || document.body;
    const els = Array.from(main.querySelectorAll('*')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const sizes = new Set();
    const radii = new Set();
    const shadows = new Set();
    let boxes = 0;
    // Leaf text nodes only — a wrapper's line count is the sum of its children's
    // and tells you nothing.
    const texts = [];
    let clipped = 0;
    const clippedSamples = [];
    for (const el of els) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').trim();
      const leaf = txt && !Array.from(el.children).some((c) => (c.textContent || '').trim());
      if (txt) sizes.add(cs.fontSize);
      if (cs.boxShadow !== 'none') shadows.add(cs.boxShadow);
      const rad = parseFloat(cs.borderTopLeftRadius) || 0;
      const drawn = rad > 2
        && (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none');
      if (drawn) { boxes += 1; radii.add(cs.borderTopLeftRadius); }
      if (leaf) {
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        texts.push({
          t: txt.slice(0, 28),
          // Rounded to the nearest line — the question is "did this wrap", not
          // "is it a fraction of a pixel taller".
          lines: Math.max(1, Math.round(r.height / lh)),
          y: Math.round(r.y),
          h: Math.round(r.height),
          size: cs.fontSize,
          weight: cs.fontWeight,
        });
      }
      // Text that does not fit the box it is in. `scrollHeight > clientHeight`
      // with hidden overflow is the definition of a clipped label.
      if (txt && (cs.overflow === 'hidden' || cs.overflowY === 'hidden')
        && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0
        && cs.webkitLineClamp === 'none' && cs.textOverflow !== 'ellipsis') {
        clipped += 1;
        if (clippedSamples.length < 6) clippedSamples.push(txt.slice(0, 30) + ' (' + el.clientHeight + '<' + el.scrollHeight + ')');
      }
    }
    return {
      ground: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(main).color,
      drawnBoxes: boxes,
      typeSizes: [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
      radii: [...radii].sort((a, b) => parseFloat(a) - parseFloat(b)),
      shadowCount: shadows.size,
      // The VALUES, not just how many: P14-2 replaced one-off shadows with tokens,
      // which often keeps the count identical while changing every pixel of the
      // cast. A count-only record would have reported that as 'no change'.
      shadowValues: [...shadows].sort(),
      contentHeight: Math.round(main.getBoundingClientRect().height),
      texts,
      clipped,
      clippedSamples,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

for (const theme of ['light', 'dark']) {
  test.describe('P14-0 renders · ' + theme, () => {
    test.skip(!ENABLED, 'evidence pass — set P14_SHOTS=1 to run');
    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
    });

    for (const screen of SCREENS) {
      test(screen.id, async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
        await screen.go(page);

        // The evidence is only evidence if the theme took.
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

        const data = await measure(page);
        // And no token edit may introduce a sideways scroll.
        expect(data.scrollWidth).toBeLessThanOrEqual(390);

        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: SHOTS + '/' + screen.id + '.' + theme + '.png' });
        fs.writeFileSync(
          OUT + '/' + screen.id + '.' + theme + '.json',
          JSON.stringify({ screen: screen.id, theme, pageErrors: errors, ...data }, null, 1),
        );
      });
    }
  });
}
