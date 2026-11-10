import { readFileSync } from 'fs'
const SR = await import('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/storyReading.js')
const vocab = JSON.parse(readFileSync('vocab-local.json','utf8')); const vm = {}; for (const v of vocab) if (!vm[v.word]) vm[v.word]=v
const m = SR.buildVocabMatcher(vm,'chinese'), seg = SR.segmenterFor('chinese')
const files = process.argv.slice(2); const out = {}
for (const f of files) for (const st of JSON.parse(readFileSync(f,'utf8'))) for (const line of st.content.split('\n').filter(Boolean)) {
  const { text } = SR.splitSpeaker(line)
  const toks = SR.segmentLine(text, m, SR.storyNamesFor(st.content, vm, 'chinese'), SR.particlesFor('chinese'), seg)
  toks.forEach((t,k) => { if (!t.vocab) return
    const w=t.vocab.word; if(!['地','得','长','还','行','了','着','重','都','觉'].includes(w)) return
    const prev = (toks[k-1]||{}).text||'', next=(toks[k+1]||{}).text||''
    const key = w+'['+t.vocab.reading+'] '+prev.slice(-2)+'_'+next.slice(0,2)
    out[key]=(out[key]||0)+1 })
}
Object.entries(out).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(n,k))
