import * as h from './h.mjs';
const B = h.BASE;
const b = await h.launch();
const desc = (p) => p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName + '[' + (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50) + ']'; });
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/study'); await h.sleep(2000);
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  console.log('focused:', await desc(p));
  await p.keyboard.press('Space'); await h.sleep(500);
  const good = p.getByRole('button', { name: /^Good/ });
  console.log('Space on card reveals?', await good.isVisible().catch(() => false), 'focus:', await desc(p));
  const t1 = await p.evaluate(() => document.querySelector('main')?.innerText.slice(0, 120));
  await p.keyboard.press('3'); await h.sleep(800);
  const t2 = await p.evaluate(() => document.querySelector('main')?.innerText.slice(0, 120));
  console.log('digit 3 grades?', t1 !== t2, 'focus:', await desc(p));
  await p.keyboard.press('Space'); await h.sleep(400);
  console.log('Space (focus wherever) reveals 2nd?', await good.isVisible().catch(() => false), 'focus', await desc(p));
  if (!(await good.isVisible().catch(() => false))) { await p.keyboard.press('Tab'); console.log('tab->', await desc(p)); }
  // Tab-only grading
  const seq = []; for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); seq.push(await desc(p)); } console.log('tab seq', seq.join(' > '));
  console.log('live regions:', await p.evaluate(() => [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e => e.getAttribute('aria-live') + ':"' + e.textContent.trim().slice(0, 60) + '"').join(' || ')));
  const card = await p.evaluate(() => { const c = [...document.querySelectorAll('[role=button]')].find(e => /flashcard/i.test(e.getAttribute('aria-label') || '')); const z = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && /[一-鿿]/.test(e.textContent)); return { cardLabel: c && c.getAttribute('aria-label'), cjk: z.length, nolang: z.filter(e => !e.closest('[lang^=zh]')).map(e => e.textContent.slice(0, 10)).slice(0, 5) }; });
  console.log('study card', JSON.stringify(card));
  await ctx.close();
}
{
  const { ctx, page: p } = await h.open(b, {});
  await p.goto(B + '/stories/st1'); await h.sleep(2000);
  await p.getByRole('button', { name: /Start reading/i }).click(); await h.sleep(800);
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  console.log('focused', await desc(p));
  await p.keyboard.press('Enter'); await h.sleep(600);
  console.log('dialogs', await p.evaluate(() => [...document.querySelectorAll('[role=dialog],[role=tooltip]')].map(d => d.getAttribute('role') + ':' + (d.getAttribute('aria-label') || d.getAttribute('aria-labelledby')) + ' modal=' + d.getAttribute('aria-modal')).join(';')), 'focus:', await desc(p));
  await p.keyboard.press('Tab'); console.log('next tab in sheet:', await desc(p));
  await p.keyboard.press('Escape'); await h.sleep(400);
  console.log('after esc dialogs', await p.locator('[role=dialog]').count(), 'focus', await desc(p));
  // manhua line label
  await p.goto(B + '/stories/st6'); await h.sleep(2500);
  console.log('manhua line label:', await p.evaluate(() => document.querySelector('[aria-label^="Story line"]')?.getAttribute('aria-label')));
  const ln = p.locator('[aria-label^="Story line"]').first(); await ln.focus(); await p.keyboard.press('Enter'); await h.sleep(600);
  console.log('manhua Enter on line -> dialogs', await p.locator('[role=dialog]').count(), 'focus', await desc(p));
  await p.keyboard.press('Escape'); await h.sleep(300); console.log('esc focus', await desc(p));
  await ctx.close();
}
// reduced motion: check animations
{
  const { ctx, page: p } = await h.open(b, { reduced: true });
  await p.goto(B + '/'); await h.sleep(2000);
  const anim = await p.evaluate(() => document.getAnimations().map(a => (a.animationName || a.constructor.name) + ':' + (a.effect && a.effect.getTiming().duration)).slice(0, 10));
  console.log('reduced-motion running animations on home:', JSON.stringify(anim));
  await p.goto(B + '/study'); await h.sleep(1500);
  await p.getByRole('button', { name: /flashcard.*tap to reveal/i }).click();
  const anim2 = await p.evaluate(() => document.getAnimations().map(a => (a.animationName || a.transitionProperty || a.constructor.name) + ':' + (a.effect && a.effect.getTiming().duration)).slice(0, 10));
  console.log('reduced-motion anims on flip:', JSON.stringify(anim2));
  await ctx.close();
}
await b.close();
