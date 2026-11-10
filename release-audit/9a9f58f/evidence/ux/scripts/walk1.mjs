import { launch, open, metrics, BASE, OUT, sleep } from './h.mjs';
const b = await launch();
const { page, log, ctx } = await open(b, { auth: false });
const btns = async () => (await page.locator('button:visible, a:visible, input:visible').evaluateAll(els => els.map(e => e.tagName + ':' + (e.getAttribute('aria-label') || e.textContent || e.placeholder || '').trim().slice(0, 40)))).join(' | ');
const snap = async (n) => { await page.screenshot({ path: OUT + '/shots/w1-' + n + '.png', fullPage: false }); console.log('\n## ' + n + ' url=' + page.url()); console.log((await page.innerText('body')).slice(0, 700).replace(/\n+/g, ' / ')); console.log('BTNS: ' + (await btns()).slice(0, 900)); };
await page.goto(BASE + '/'); await sleep(2000);
await page.getByText('Start your first story').first().click(); await sleep(2000); await snap('01-start-story');
// try to click through
for (let i = 0; i < 6; i++) {
  const c = page.locator('button:visible').filter({ hasText: /continue|next|tap|begin|start|got it|show/i }).first();
  if (await c.count() === 0) break;
  const t = await c.innerText(); await c.click(); await sleep(1200); await snap('02-step' + i + '-' + t.slice(0, 15).replace(/\W/g, ''));
}
console.log(JSON.stringify(log));
await ctx.close(); await b.close();
