import * as h from './h.mjs';
export async function session(opts) {
  const b = await h.launch(); const s = await h.open(b, opts);
  const { page } = s;
  s.b = b;
  s.text = async (n = 800) => (await page.innerText('body')).slice(0, n).replace(/\n+/g, ' / ');
  s.btns = async () => (await page.locator('button:visible, a:visible, input:visible, [role=button]:visible, [role=tab]:visible').evaluateAll(els => els.map(e => e.tagName[0] + ':' + (e.getAttribute('aria-label') || e.textContent || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40)))).join(' | ').slice(0, 1200);
  s.snap = async (n, full) => { await page.screenshot({ path: h.OUT + '/shots/' + n + '.png', fullPage: !!full }); console.log('\n## ' + n + ' url=' + page.url().replace(h.BASE, '')); console.log('TEXT: ' + await s.text()); console.log('BTNS: ' + await s.btns()); };
  s.step = async (name, fn) => { try { await fn(); await h.sleep(900); await s.snap(name); } catch (e) { console.log('\n## ' + name + ' FAILED: ' + String(e).split('\n')[0].slice(0, 300)); } };
  s.done = async () => { console.log('\nLOG ' + JSON.stringify({ ...s.log, console: s.log.console.filter(c => !c.includes('Failed to load resource')), external: [...new Set(s.log.external.map(u => u.split('?')[0]))] })); await b.close(); };
  return s;
}
export const sleep = h.sleep;
