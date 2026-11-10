import { session, sleep } from './lib.mjs';
const s = await session({}); const p = s.page; const B = 'http://localhost:5188';
await p.goto(B + '/study'); await sleep(2000);
console.log('undo disabled?', await p.getByRole('button', { name: 'Undo last grade' }).isDisabled().catch(e => 'n/a'));
const show = p.getByRole('button', { name: /flashcard.*tap to reveal/i });
const grades = ['Good', 'Again', 'Hard', 'Easy'];
let n = 0; const t0 = Date.now();
for (let i = 0; i < 120; i++) {
  if (await p.getByText('Session complete').isVisible().catch(() => false)) break;
  if (await show.isVisible().catch(() => false)) { await show.click(); await sleep(120); }
  const g = p.getByRole('button', { name: new RegExp('^' + grades[n % 4]) }).first();
  if (await g.isVisible().catch(() => false)) { await g.click(); n++; if (n === 3) await s.snap('d1-after3'); }
  await sleep(150);
}
console.log('grades', n, 'secs', (Date.now() - t0) / 1000);
await s.snap('d2-recap'); await p.screenshot({ path: s.page.url() && '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/agents/ux/shots/d2-recap-full.png', fullPage: true });
await s.step('d3-next', () => p.getByRole('button', { name: /^Read/i }).first().click());
await s.done();
