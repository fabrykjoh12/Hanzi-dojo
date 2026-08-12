import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// The P14-5 render + geometry harness for Home.
//
// Gated on P14_HOME so it never runs in CI: it writes screenshots and a
// measurement dump for a human to look at, which is not a contract. The
// contracts Home actually has to keep live in home.spec.js, home-cache.spec.js
// and geometry.spec.js.
//
// What it measures is the list the P14-5 brief asks about: page height against
// the viewport, horizontal overflow, every tap target under 44px, every drawn
// box, and each leaf text's size/weight — so "did the typography actually move"
// is answerable without squinting at two screenshots.

const OUT = process.env.P14_OUT || '/tmp/p14-home';
const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

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

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const trayTop = nav ? nav.getBoundingClientRect().top : null;
    const r2 = n => Math.round(n * 100) / 100;
    const boxes = [];
    const small = [];
    const type = [];
    for (const el of document.querySelectorAll('#main-content *')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const bordered = cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none';
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none';
      const rounded = parseFloat(cs.borderTopLeftRadius) > 3;
      if ((bordered || filled) && rounded) {
        boxes.push({ w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius });
      }
      const tappable = el.tagName === 'BUTTON' || el.tagName === 'A'
        || el.getAttribute('role') === 'button';
      if (tappable && (r.height < 44 || r.width < 44)) {
        small.push({
          what: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28),
          w: r2(r.width), h: r2(r.height),
        });
      }
      const leaf = el.children.length === 0 && (el.textContent || '').trim();
      if (leaf) {
        type.push({
          t: leaf.slice(0, 26),
          size: cs.fontSize,
          weight: cs.fontWeight,
          colour: cs.color,
        });
      }
    }
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docHeight: de.scrollHeight,
      viewports: r2(de.scrollHeight / window.innerHeight),
      overflowX: de.scrollWidth - de.clientWidth,
      trayTop,
      lowestContent: (() => {
        let low = 0;
        for (const el of document.querySelectorAll('#main-content *')) {
          const r = el.getBoundingClientRect();
          if (r.height > 2 && (el.textContent || '').trim()) low = Math.max(low, r.bottom);
        }
        return Math.round(low);
      })(),
      boxes,
      smallTargets: small,
      typeStyles: [...new Set(type.map(t => t.size + '/' + t.weight))].sort(),
      texts: type,
    };
  });
}

const LABEL = process.env.P14_LABEL || 'now';

// Gated: this writes screenshots and a measurement dump for a human to read, which
// is not a contract. Home's actual contracts are home.spec.js, home-shape.spec.js,
// home-cache.spec.js and geometry.spec.js, and they run in CI.
const RUN = Boolean(process.env.P14_HOME || process.env.P14_OUT);

for (const theme of ['light', 'dark']) {
  for (const phone of PHONES) {
    test.describe('Home ' + LABEL + ' · ' + theme + ' · ' + phone.name, () => {
      test.use({ viewport: { width: phone.width, height: phone.height } });

      test('renders and measures', async ({ page }) => {
        test.skip(!RUN, 'set P14_HOME=1 to capture the render matrix');
        await setTheme(page, theme);
        await page.emulateMedia({ colorScheme: theme });
        await page.goto('/');
        await page.getByText('Today', { exact: true }).waitFor();
        // The story hand-off arrives after the counts; give it time or the
        // measurement is of a Home that is still assembling.
        await page.waitForTimeout(1600);
        const m = await measure(page);

        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(
          OUT + '/' + LABEL + '.' + theme + '.' + phone.name + '.json',
          JSON.stringify(m, null, 1),
        );
        await page.screenshot({
          path: OUT + '/' + LABEL + '.' + theme + '.' + phone.name + '.png',
          fullPage: false,
        });
        await page.screenshot({
          path: OUT + '/' + LABEL + '.' + theme + '.' + phone.name + '.full.png',
          fullPage: true,
        });

        expect(m.overflowX, 'horizontal overflow').toBe(0);
        expect(m.smallTargets, 'targets under 44px').toEqual([]);
      });
    });
  }
}
