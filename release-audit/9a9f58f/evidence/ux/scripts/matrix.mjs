import * as h from './h.mjs';
import fs from 'node:fs';
const B = h.BASE;
const SCREENS = [
  ['landing', { auth: false }, '/', null],
  ['assess', { auth: false }, '/how-much-can-you-read', null],
  ['privacy', { auth: false }, '/privacy', null],
  ['auth', { auth: false }, '/', async p => { await p.getByRole('button', { name: 'Log in' }).first().click(); }],
  ['home', {}, '/', null],
  ['study-front', {}, '/study', null],
  ['study-back', {}, '/study', async p => { await p.getByRole('button', { name: /flashcard.*tap to reveal/i }).click(); }],
  ['stories', {}, '/stories', null],
  ['story-detail', {}, '/stories/st1', null],
  ['reader-paced', {}, '/stories/st1', async p => { await p.getByRole('button', { name: /Start reading/i }).click(); }],
  ['reader-sheet', {}, '/stories/st1', async p => { await p.getByRole('button', { name: /Start reading/i }).click(); await h.sleep(500); await p.getByText('今天', { exact: true }).first().click(); }],
  ['reader-chat', {}, '/stories/st2', async p => { await p.getByRole('button', { name: /Start reading/i }).click(); }],
  ['reader-manhua', {}, '/stories/st6', null],
  ['practice', {}, '/practice', null],
  ['dictionary', {}, '/dictionary', async p => { await p.locator('input:visible').first().fill('中'); await h.sleep(800); await p.getByText('中文').first().click(); }],
  ['profile', {}, '/profile', null],
  ['settings', {}, '/settings', null],
  ['test', {}, '/test', null],
  ['words', {}, '/words', null],
  ['writing', {}, '/writing', null],
];
const VPS = (process.env.VPS || '320x640,390x844,430x932,768x1024,1280x800').split(',');
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const AXE = process.env.AXE === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const b = await h.launch();
for (const vp of VPS) for (const th of THEMES) for (const [name, o, path, act] of SCREENS) {
  if (only && !only.includes(name)) continue;
  const [w, hh] = vp.split('x').map(Number);
  const { ctx, page, log } = await h.open(b, { ...o, w, h: hh, dark: th === 'dark' });
  const r = { name, vp, th };
  try {
    await page.goto(B + path); await h.sleep(2000);
    if (act) { await act(page); await h.sleep(900); }
    Object.assign(r, await h.metrics(page));
    r.dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.screenshot({ path: h.OUT + '/shots/m-' + name + '-' + vp + '-' + th + '.png' });
    if (AXE) r.axe = await h.axe(page);
  } catch (e) { r.err = String(e).split('\n')[0].slice(0, 200); }
  r.pageerrors = log.pageerrors; r.console = log.console.filter(c => !c.includes('Failed to load resource'));
  results.push(r);
  console.log(name, vp, th, r.err || '', 'ovf=' + r.overflowX, (r.wide || []).join(';').slice(0, 200), 'small=' + (r.small || []).length, r.axe ? 'axe=' + r.axe.map(v => v.id + ':' + v.n).join(',') : '', r.pageerrors.join(';').slice(0, 200));
  await ctx.close();
}
fs.writeFileSync(h.OUT + '/matrix-' + (process.env.TAG || 'all') + '.json', JSON.stringify(results, null, 1));
await b.close();
