import * as h from './h.mjs';
const b = await h.launch();
for (const [w, hh] of [[667, 375], [640, 400], [360, 560]]) {
  const { ctx, page: p } = await h.open(b, { w, h: hh });
  await p.goto(h.BASE + '/study'); await h.sleep(2000);
  await p.getByRole('button', { name: /flashcard.*tap to reveal/i }).click(); await h.sleep(800);
  const r = await p.evaluate(() => {
    const leaf = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && /^[一-鿿]{1,3}$/.test(e.textContent.trim())).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
    let sc = leaf.parentElement; while (sc && !['auto', 'scroll', 'hidden'].includes(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    const lr = leaf.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const before = sc.scrollTop; sc.scrollTop = 0; const t0 = leaf.getBoundingClientRect().top; sc.scrollTop = before;
    const main = document.querySelector('main'); const lastBtn = [...document.querySelectorAll('button')].filter(b => /Easy/.test(b.textContent))[0];
    return { word: leaf.textContent, fs: getComputedStyle(leaf).fontSize, leafTop: Math.round(lr.top), leafTopAtScroll0: Math.round(t0), scTop: Math.round(sr.top), scOverflow: getComputedStyle(sc).overflowY, scH: sc.clientHeight, scSH: sc.scrollHeight, justify: getComputedStyle(sc).justifyContent + '/' + getComputedStyle(leaf.parentElement).justifyContent, gradeBottom: lastBtn && Math.round(lastBtn.getBoundingClientRect().bottom), vh: innerHeight, mainPadB: getComputedStyle(main).paddingBottom };
  });
  console.log(w + 'x' + hh, JSON.stringify(r));
  await ctx.close();
}
await b.close();
