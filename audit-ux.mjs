/* global window */
// UX audit driver — walks the mocked app at phone sizes and captures
// screenshots. NOT part of the app or test suite; run with:
//   node audit-ux.mjs [outdir]
// Requires `npm run dev:e2e` already serving on :5173.
import { chromium } from '@playwright/test';
import { mockSupabaseRoutes, SESSION, PROFILE } from './tests/fixtures/mockSupabase.js';

const OUT = process.argv[2] || 'audit-shots';
const BASE = 'http://localhost:5173';
const REF = 'mock';

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

async function preparePage(context, { dark }) {
  const page = await context.newPage();
  await mockSupabaseRoutes(page);
  if (dark) {
    // Later-registered routes win: override the profile read with theme:dark.
    await page.route(`**/${REF}.supabase.co/rest/v1/profiles**`, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fallback();
      const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
      const body = { ...PROFILE, theme: 'dark' };
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
          'content-type': 'application/json', 'content-range': '0-0/*',
        },
        body: JSON.stringify(wantsObject ? body : [body]),
      });
    });
  }
  await page.addInitScript(([ref, session]) => {
    try { window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)); } catch {}
    try { window.localStorage.setItem('hd-tour-home', 'done'); } catch {}
  }, [REF, SESSION]);
  return page;
}

async function shot(page, dir, name) {
  await page.screenshot({ path: `${OUT}/${dir}/${name}.png` });
  console.log(`  ${dir}/${name}`);
}

async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      const dir = `${vp.name}-${theme}`;
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        colorScheme: theme,
      });
      const page = await preparePage(context, { dark: theme === 'dark' });

      // Home
      await page.goto(BASE + '/');
      await settle(page, 1200);
      await shot(page, dir, '01-home');

      // Home → Cards transition frames (only at 390 to keep the run fast)
      if (vp.name === '390') {
        const start = page.getByRole('region', { name: 'Cards' }).getByRole('button');
        await start.click();
        await shot(page, dir, '02-transition-a');
        await page.waitForTimeout(120);
        await shot(page, dir, '02-transition-b');
        await page.waitForTimeout(250);
        await shot(page, dir, '02-transition-c');
        await settle(page, 600);
      } else {
        await page.goto(BASE + '/study');
        await settle(page, 900);
      }
      await shot(page, dir, '03-study-front');

      // Reveal + grade band
      const card = page.getByRole('button', { name: /flashcard.*tap to reveal/i });
      if (await card.count()) {
        await card.first().click();
        await page.waitForTimeout(450);
        await shot(page, dir, '04-study-revealed');
        const good = page.getByRole('button', { name: /Good/i });
        if (await good.count()) {
          await good.first().click();
          await page.waitForTimeout(350);
          await shot(page, dir, '05-study-after-grade');
        }
      }

      // Stories shelf
      await page.goto(BASE + '/stories');
      await settle(page, 1200);
      await shot(page, dir, '06-stories');

      // Reader (paced story st1)
      const story = page.getByText('公园里的下午').first();
      if (await story.count()) {
        await story.click();
        await settle(page, 900);
        await shot(page, dir, '07-reader');
        // Word lookup
        const word = page.getByText('天气').first();
        if (await word.count()) {
          await word.click().catch(() => {});
          await page.waitForTimeout(600);
          await shot(page, dir, '08-word-lookup');
        }
      }

      // Practice
      await page.goto(BASE + '/practice');
      await settle(page, 900);
      await shot(page, dir, '09-practice');

      // Profile
      await page.goto(BASE + '/profile');
      await settle(page, 900);
      await shot(page, dir, '10-profile');

      await context.close();
    }
  }
  await browser.close();
  console.log('done');
};

run().catch((err) => { console.error(err); process.exit(1); });
