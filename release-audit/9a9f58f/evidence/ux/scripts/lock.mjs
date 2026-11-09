import { session, sleep } from './lib.mjs';
const s = await session({}); const p = s.page;
await p.goto('http://localhost:5188/'); await sleep(2000);
await s.step('h-then-read-click', () => p.getByRole('button', { name: /Then read/ }).click());
await s.done();
