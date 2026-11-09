import { session, sleep } from './lib.mjs';
const s = await session({ fresh: true }); const p = s.page; const B = 'http://localhost:5188';
await p.goto(B + '/'); await sleep(2500);
await s.snap('c0-home-fresh');
// walk the tour
for (let i = 0; i < 8; i++) {
  const d = p.getByRole('dialog'); if (!(await d.count())) break;
  const nb = d.getByRole('button').filter({ hasText: /Next|Got it|Done|Finish|Start/i }).last();
  if (!(await nb.count())) break;
  await s.step('c1-tour-' + i, () => nb.click());
}
await s.step('c2-start-cards', async () => { await p.getByRole('button', { name: /review|start|cards|study/i }).first().click(); });
const show = p.getByRole('button', { name: /flashcard.*tap to reveal/i });
await s.step('c3-card-front', async () => { await show.waitFor({ timeout: 5000 }); });
await s.step('c4-card-back', () => show.click());
const grades = ['Good', 'Again', 'Hard', 'Easy'];
for (let i = 0; i < 60; i++) {
  if (await p.getByText('Session complete').isVisible().catch(() => false)) break;
  if (await show.isVisible().catch(() => false)) { await show.click(); await sleep(150); await p.getByRole('button', { name: new RegExp(grades[i % 4]) }).first().click().catch(e => console.log('grade fail', i, String(e).slice(0, 120))); }
  await sleep(200);
}
await s.step('c5-recap', async () => {});
await s.snap('c5-recap-full', true);
await s.done();
