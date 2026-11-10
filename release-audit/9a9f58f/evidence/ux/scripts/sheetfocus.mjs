import * as h from './h.mjs';
const b = await h.launch();
const desc = (p) => p.evaluate(() => { const a = document.activeElement; return a === document.body ? 'BODY' : a.tagName + '[' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20) + '] role=' + a.getAttribute('role'); });
for (const [w, hh] of [[390, 844], [1280, 800], [320, 640]]) {
  for (const route of ['/stories/st1', '/stories/st6']) {
  const { ctx, page: p } = await h.open(b, { w, h: hh });
  await p.goto(h.BASE + route); await h.sleep(2000);
  if (route.endsWith('st1')) await p.getByRole('button', { name: /Start reading/i }).click(); await h.sleep(600);
  const word = route.endsWith('st1') ? p.locator('span[role=button]').filter({ hasText: '今天' }).first() : p.locator('.hd-manhua-word[aria-label="学校"]').first();
  await word.focus().catch(() => {}); 
  const before = await desc(p);
  await p.keyboard.press('Enter'); await h.sleep(700);
  if (!(await p.locator('[role=dialog]').count())) { await word.click(); await h.sleep(700); }
  const d = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? 'modal=' + d.getAttribute('aria-modal') + ' vis=' + getComputedStyle(d).visibility : 'none'; });
  console.log(w + ' ' + route + ' before=' + before + ' dialog=' + d + ' focusAfterOpen=' + await desc(p));
  await ctx.close();
  }
}
await b.close();
