// Audit-only: compare the reader's word-level reading against pinyin-pro's
// context reading for every vocab token in a corpus. Input: JSON file of
// [{id,title,level,content}] + vocab JSON [{id,word,reading}]. Prints flags.
import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/package.json')
const { pinyin } = require('pinyin-pro')
const SR = await import('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/storyReading.js')
const [storiesFile, vocabFile] = process.argv.slice(2)
const stories = JSON.parse(readFileSync(storiesFile, 'utf8'))
const vocab = JSON.parse(readFileSync(vocabFile, 'utf8'))
const vm = {}; for (const v of vocab) if (!vm[v.word]) vm[v.word] = v
const L = 'chinese', m = SR.buildVocabMatcher(vm, L), seg = SR.segmenterFor(L)
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zü:v]/g,'')
const toneOf = s => { const n = s.normalize('NFD'); if (/̄/.test(n)) return 1; if (/́/.test(n)) return 2; if (/̌/.test(n)) return 3; if (/̀/.test(n)) return 4; return 5 }
const flags = {}; let tokens = 0
for (const st of stories) {
  for (const line of (st.content || '').split('\n').filter(Boolean)) {
    const { text } = SR.splitSpeaker(line)
    const toks = SR.segmentLine(text, m, SR.storyNamesFor(st.content, vm, L), SR.particlesFor(L), seg)
    const ctx = pinyin(text, { type: 'array', toneType: 'symbol' })
    let pos = 0
    for (const t of toks) {
      const chars = Array.from(t.text); const c = chars.map((_, k) => ctx[pos + k]); pos += chars.length
      if (!t.vocab || !t.vocab.reading) continue
      tokens++
      const vr = pinyin(t.text, { type: 'array' }) // dictionary syllabification guide only
      const rd = t.vocab.reading.replace(/[\s'’-]+/g, '')
      const cj = c.join('')
      if (strip(rd) !== strip(cj)) {
        // syllable mismatch (true polyphone or data error)
        const k = t.text + ' ' + rd + ' vs ' + cj
        ;(flags[k] = flags[k] || { n: 0, kind: 'syllable', ex: st.id + ' ' + text.slice(0, 30) }).n++
      } else if (chars.length === 1 && !['一','不'].includes(t.text)) {
        const a = toneOf(rd), b = toneOf(cj)
        if (a !== 5 && b !== 5 && a !== b) { const k = t.text + ' ' + rd + ' vs ' + cj; (flags[k] = flags[k] || { n: 0, kind: 'tone', ex: st.id + ' ' + text.slice(0, 30) }).n++ }
      }
    }
  }
}
const rows = Object.entries(flags).sort((a, b) => b[1].n - a[1].n)
console.log('stories', stories.length, 'vocab tokens', tokens, 'distinct flags', rows.length)
for (const [k, v] of rows.slice(0, Number(process.env.TOP || 80))) console.log(v.n, v.kind, k, '|', v.ex)
