// Harness: launches chromium against my own e2e dev server with the repo's mock.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/package.json')('@playwright/test');
import { mockSupabaseRoutes, PROFILE, SESSION, REF } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/tests/fixtures/mockSupabase.js';
export const BASE = 'http://localhost:5188';
export const OUT = '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/agents/ux';
export const AXE = OUT + '/node_modules/axe-core/axe.min.js';

export async function launch() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

// opts: {w,h,dark,auth,fresh,themePref,reduced,scale}
export async function open(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w || 390, height: opts.h || 844 },
    deviceScaleFactor: 1,
    colorScheme: opts.dark ? 'dark' : 'light',
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    hasTouch: (opts.w || 390) < 800,
    isMobile: false,
  });
  const page = await ctx.newPage();
  const log = { console: [], failed: [], pageerrors: [], external: [] };
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => log.pageerrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', r => log.failed.push(r.url().slice(0, 150) + ' ' + (r.failure() || {}).errorText));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.includes('mock.supabase.co') && !u.startsWith('data:') && !u.startsWith('blob:')) log.external.push(u.slice(0, 150)); });
  // Block real network outside localhost/mock to never hit real backends.
  await page.route(u => { const s = u.toString(); return !s.startsWith(BASE) && !s.includes('mock.supabase.co') && !s.startsWith('data:'); }, r => r.abort());
  await mockSupabaseRoutes(page);
  if (opts.auth !== false) {
    const prof = { ...PROFILE, theme: opts.themePref || (opts.dark ? 'dark' : 'light') };
    if (opts.fresh) prof.created_at = new Date().toISOString();
    if (opts.themePref === null) delete prof.theme;
    await page.route('**/rest/v1/profiles**', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') return route.fallback();
      const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(wantsObject ? prof : [prof]) });
    });
    await page.addInitScript(([ref, session]) => { try { localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify(session)); } catch {} }, [REF, SESSION]);
  }
  return { ctx, page, log };
}

export async function axe(page, include) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (inc) => {
    const r = await window.axe.run(inc ? document.querySelector(inc) || document : document, { resultTypes: ['violations'] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('').slice(0, 140)) }));
  }, include);
}

export async function metrics(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const overflowX = se.scrollWidth > window.innerWidth + 1;
    const wide = [];
    if (overflowX) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') { wide.push((el.tagName + '.' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)) + ' r=' + Math.round(r.right)); if (wide.length > 6) break; }
      }
    }
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, [role=tab], [role=switch]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
      if (r.width < 44 || r.height < 44) small.push(Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + el.tagName + ' "' + ((el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 28)) + '"');
    }
    return { scrollW: se.scrollWidth, innerW: window.innerWidth, overflowX, wide, small, lang: document.documentElement.lang, title: document.title };
  });
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
