import * as h from './h.mjs';
const B = h.BASE;
const b = await h.launch();
const desc = (p) => p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; const cs = getComputedStyle(a); const r = a.getBoundingClientRect(); return a.tagName + '[' + (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '] outline=' + cs.outlineStyle + '/' + cs.outlineWidth + ' shadow=' + (cs.boxShadow !== 'none' ? 'y' : 'n') + ' y=' + Math.round(r.top); });
async function tabs(p, n, label) { const out = []; for (let i = 0; i < n; i++) { await p.keyboard.press('Tab'); out.push(await desc(p)); } console.log('\n### TAB ' + label + '\n' + out.map((x, i) => i + ': ' + x).join('\n')); }
// 1. Study keyboard
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/study'); await h.sleep(2000);
  await tabs(p, 6, 'study-front');
  // Try keyboard shortcuts
  await p.keyboard.press('Space'); await h.sleep(500);
  console.log('after Space revealed?', await p.getByRole('button', { name: /^Good/ }).isVisible().catch(() => false));
  if (!(await p.getByRole('button', { name: /^Good/ }).isVisible().catch(() => false))) { await p.keyboard.press('Enter'); await h.sleep(500); console.log('after Enter revealed?', await p.getByRole('button', { name: /^Good/ }).isVisible().catch(() => false)); }
  console.log('focus after reveal:', await desc(p));
  const front1 = await p.evaluate(() => document.body.innerText.slice(0, 200));
  await p.keyboard.press('3'); await h.sleep(700);
  const front2 = await p.evaluate(() => document.body.innerText.slice(0, 200));
  console.log('key 3 graded?', front1 !== front2, '| focus now:', await desc(p));
  await tabs(p, 5, 'study-after-grade');
  // live region check
  console.log('live regions:', await p.evaluate(() => [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e => e.tagName + ' ' + e.getAttribute('aria-live') + ' "' + e.textContent.trim().slice(0, 50) + '"').join(' || ')));
  await p.screenshot({ path: h.OUT + '/shots/k-study-focus.png' });
  await ctx.close();
}
// 2. Reader keyboard
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/stories/st1'); await h.sleep(2000);
  await tabs(p, 4, 'story-detail');
  await p.getByRole('button', { name: /Start reading/i }).focus(); await p.keyboard.press('Enter'); await h.sleep(800);
  console.log('focus after start:', await desc(p));
  await tabs(p, 12, 'reader');
  // open a word via keyboard: focus first word span
  const w = p.getByText('今天', { exact: true }).first();
  await w.focus(); console.log('word focus:', await desc(p), 'tabindex=', await w.getAttribute('tabindex'), 'role=', await w.getAttribute('role'), 'lang=', await w.evaluate(e => e.closest('[lang]') && e.closest('[lang]').getAttribute('lang')));
  await p.keyboard.press('Enter'); await h.sleep(600);
  const dlg = await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(d => (d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || '?') + ' modal=' + d.getAttribute('aria-modal')).join(';'));
  console.log('sheet open after Enter:', dlg, 'focus:', await desc(p));
  await p.screenshot({ path: h.OUT + '/shots/k-reader-sheet.png' });
  await p.keyboard.press('Escape'); await h.sleep(500);
  console.log('after Esc dialogs:', await p.locator('[role=dialog]').count(), 'focus restored to:', await desc(p));
  await p.getByRole('button', { name: /Reader settings/i }).focus(); await p.keyboard.press('Enter'); await h.sleep(500);
  console.log('settings focus:', await desc(p)); await p.keyboard.press('Escape'); await h.sleep(400); console.log('after esc focus:', await desc(p));
  // arrow keys to advance?
  const c1 = await p.evaluate(() => document.body.innerText.match(/\d \/ \d/)?.[0]);
  await p.locator('body').press('ArrowRight'); await h.sleep(500);
  console.log('ArrowRight advanced:', c1, '->', await p.evaluate(() => document.body.innerText.match(/\d \/ \d/)?.[0]));
  for (let i = 0; i < 4; i++) { await p.getByRole('button', { name: /Next line/i }).click().catch(() => {}); await h.sleep(300); }
  console.log('finish focus:', await desc(p));
  await tabs(p, 6, 'finish-overlay');
  console.log('lang attrs on CJK:', await p.evaluate(() => { const els = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && /[一-鿿]/.test(e.textContent)); const nolang = els.filter(e => !e.closest('[lang^=zh]')); return els.length + ' cjk leaves, ' + nolang.length + ' without zh lang ancestor; html lang=' + document.documentElement.lang; }));
  await ctx.close();
}
// 3. Manhua word tap and lang
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/stories/st6'); await h.sleep(2500);
  console.log('manhua word spans:', await p.evaluate(() => { const s = [...document.querySelectorAll('[role=button]')].filter(e => /[一-鿿]/.test(e.textContent)).slice(0, 3); return s.map(e => e.tagName + ' tab=' + e.tabIndex + ' lbl=' + e.getAttribute('aria-label') + ' vis=' + (e.getBoundingClientRect().height > 0)).join(' | '); }));
  const sp = p.locator('[role=button]').filter({ hasText: '学校' }).first();
  await sp.click({ timeout: 5000 }).catch(e => console.log('manhua click err', String(e).split('\n')[0]));
  await h.sleep(700);
  console.log('manhua after tap dialogs:', await p.locator('[role=dialog]').count(), (await p.innerText('body')).slice(0, 0));
  await p.screenshot({ path: h.OUT + '/shots/k-manhua-tap.png' });
  await tabs(p, 10, 'manhua');
  await ctx.close();
}
// 4. Home + nav tab order
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/'); await h.sleep(2000);
  await tabs(p, 8, 'home-mobile');
  await p.keyboard.press('Shift+Tab'); 
  await ctx.close();
}
await b.close();
