import { session, sleep } from './lib.mjs';
const s = await session({ auth: false }); const p = s.page;
await p.goto('http://localhost:5188/'); await sleep(1800);
await p.screenshot({ path: s.page.context()._o || '/dev/null' }).catch(()=>{});
await s.snap('b0-landing', true);
await p.getByText('Start your first story').first().click(); await sleep(1000);
await p.getByRole('button', { name: /Reveal the meaning/ }).click(); await sleep(600);
await p.getByRole('button', { name: 'See it in a story' }).click(); await sleep(600);
await p.getByRole('button', { name: 'Continue' }).click(); await sleep(600);
await p.getByRole('button', { name: 'Continue' }).click(); await sleep(600);
await s.step('b1-correct', () => p.getByRole('button', { name: '你好', exact: true }).click());
for (let i = 0; i < 8; i++) {
  const c = p.locator('button:visible').filter({ hasText: /\w/ }).filter({ hasNotText: /^Back$|^Hear/ }).last();
  const t = (await c.innerText().catch(() => '')).trim(); if (!t) break;
  await s.step('b2-' + i + '-' + t.slice(0, 14).replace(/\W/g, ''), () => c.click());
  if (await p.locator('input[type=email]:visible').count()) break;
}
await s.done();
