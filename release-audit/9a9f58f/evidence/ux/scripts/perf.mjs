import * as h from './h.mjs';
const b = await h.launch();
for (const [r, auth, sel] of [['/', false, 'text=Start your first story'], ['/', true, 'text=Today'], ['/stories', true, 'text=Top picks for you'], ['/stories/st6', true, 'text=我是新学生']]) {
  const { ctx, page: p } = await h.open(b, { auth });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  let n = 0, bytes = 0; p.on('response', async res => { n++; try { const l = res.headers()['content-length']; bytes += l ? +l : 0; } catch {} });
  const t0 = Date.now(); await p.goto(h.BASE + r); await p.locator(sel).first().waitFor({ timeout: 20000 }); const t = Date.now() - t0;
  await h.sleep(1500);
  const m = await p.evaluate(() => ({ dom: document.querySelectorAll('*').length, lcp: 0, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }));
  const lt = await p.evaluate(() => new Promise(res => { let tot = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => tot += e.duration)).observe({ type: 'longtask', buffered: true }); } catch {} setTimeout(() => res(Math.round(tot)), 300); }));
  console.log(r, auth ? 'auth' : 'anon', 'visible_ms=' + t, 'requests=' + n, 'dom_nodes=' + m.dom, 'heapMB=' + m.heap, 'longtask_ms=' + lt);
  await ctx.close();
}
// grading responsiveness
{ const { ctx, page: p } = await h.open(b, {}); await p.goto(h.BASE + '/study'); await h.sleep(2000);
  const times = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Space'); const t0 = Date.now(); await p.getByRole('button', { name: /^Good/ }).waitFor(); times.push(Date.now() - t0); await p.keyboard.press('3'); await h.sleep(300); }
  console.log('reveal latency ms (dev, incl. playwright overhead):', times.join(','));
  await ctx.close(); }
await b.close();
