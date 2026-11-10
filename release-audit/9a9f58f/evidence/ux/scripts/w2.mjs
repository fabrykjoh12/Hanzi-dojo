import { session, sleep } from './lib.mjs';
const s = await session({ auth: false }); const p = s.page;
await p.goto('http://localhost:5188/'); await sleep(1800);
await p.getByText('Start your first story').first().click(); await sleep(1200);
await s.step('a1-reveal', () => p.getByRole('button', { name: /Reveal the meaning/ }).click());
for (let i = 0; i < 10; i++) {
  const c = p.locator('button:visible').filter({ hasNotText: /^$/ }).filter({ hasNotText: /Back/ }).last();
  const t = (await c.innerText().catch(() => '')).trim();
  if (!t) break;
  await s.step('a2-' + i + '-' + t.slice(0, 12).replace(/\W/g, ''), () => c.click());
  if (/sign|create|email/i.test(await s.text(400))) break;
}
await s.done();
