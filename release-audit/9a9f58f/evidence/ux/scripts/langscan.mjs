import * as h from './h.mjs';
const B = h.BASE; const b = await h.launch();
const routes = [['/', false], ['/', true], ['/study', true], ['/stories', true], ['/stories/st1', true], ['/practice', true], ['/words', true], ['/profile', true], ['/dictionary', true], ['/how-much-can-you-read', false]];
for (const [r, auth] of routes) {
  const { ctx, page: p } = await h.open(b, { auth });
  await p.goto(B + r); await h.sleep(2000);
  const res = await p.evaluate(() => { const z = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && /[一-鿿]/.test(n.textContent))); const no = z.filter(e => !e.closest('[lang^=zh]')); return z.length + ' cjk text nodes; ' + no.length + ' lack zh lang. e.g. ' + no.slice(0, 4).map(e => e.textContent.trim().slice(0, 8)).join(','); });
  console.log((auth ? 'auth ' : 'anon ') + r + ': ' + res);
  await ctx.close();
}
await b.close();
