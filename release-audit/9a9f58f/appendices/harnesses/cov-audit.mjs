import { readFileSync } from 'fs'
const SR = await import('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/storyReading.js')
const vocab = JSON.parse(readFileSync('vocab-local.json','utf8')); const vm = {}; for (const v of vocab) if (!vm[v.word]) vm[v.word]=v
const m = SR.buildVocabMatcher(vm,'chinese'), seg = SR.segmenterFor('chinese')
const isHan = c => /\p{Script=Han}/u.test(c)
const rows=[]
for (const f of process.argv.slice(2)) for (const st of JSON.parse(readFileSync(f,'utf8'))) {
  let han=0, inVocab=0, inName=0, unmatched={}
  const names = SR.storyNamesFor(st.content, vm, 'chinese')
  for (const line of st.content.split('\n').filter(Boolean)) {
    const { text } = SR.splitSpeaker(line)
    for (const t of SR.segmentLine(text, m, names, SR.particlesFor('chinese'), seg)) {
      const h = Array.from(t.text).filter(isHan).length; han += h
      if (t.vocab) inVocab += h; else if (t.name) inName += h; else if (h) unmatched[t.text]=(unmatched[t.text]||0)+1
    }
  }
  const r = SR.calculateStoryReadability({ content: st.content, vocabMap: vm, cards: {}, language: 'chinese' })
  rows.push({ id: st.id, han, pct: Math.round(100*inVocab/han), name: Math.round(100*inName/han), unm: Object.keys(unmatched).length, ex: Object.keys(unmatched).slice(0,6).join(' '), unique: r.totalUnique })
}
rows.sort((a,b)=>a.pct-b.pct)
console.log('stories', rows.length, 'median vocab-char coverage', rows[Math.floor(rows.length/2)].pct, 'stories <90%:', rows.filter(r=>r.pct<90).length, 'with any unmatched Han token:', rows.filter(r=>r.unm>0).length)
rows.slice(0,12).forEach(r=>console.log(r.id, 'han',r.han,'vocab%',r.pct,'name%',r.name,'unmatched',r.unm, r.ex))
