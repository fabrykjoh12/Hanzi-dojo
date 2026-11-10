import { launch, open, metrics, BASE, OUT, sleep } from './h.mjs';
const b = await launch();
for (const auth of [false, true]) {
  const { page, log, ctx } = await open(b, { auth });
  await page.goto(BASE + '/'); await sleep(2500);
  await page.screenshot({ path: OUT + '/shots/smoke-' + auth + '.png' });
  console.log(auth, JSON.stringify(await metrics(page)).slice(0, 600), JSON.stringify(log).slice(0, 800));
  console.log((await page.innerText('body')).slice(0, 600));
  await ctx.close();
}
await b.close();
