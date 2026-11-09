import { session, sleep } from './lib.mjs';
const s = await session({}); const p = s.page; const B = 'http://localhost:5188';
for (const r of ['practice', 'dictionary', 'profile', 'settings', 'test', 'words', 'languages', 'listen', 'tones', 'writing', 'grammar', 'weak', 'nope-404']) {
  await p.goto(B + '/' + r); await sleep(2200); await s.snap('g-' + r);
}
await p.goto(B + '/dictionary'); await sleep(1500);
await s.step('g-dict-search', async () => { const i = p.locator('input:visible').first(); await i.fill('中'); await sleep(1200); });
await s.step('g-dict-open', () => p.getByText('中文').first().click());
await s.done();
