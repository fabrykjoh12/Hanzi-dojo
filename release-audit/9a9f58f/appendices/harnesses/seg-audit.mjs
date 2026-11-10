import { createRequire } from 'module'
const require = createRequire('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/package.json')
const { pinyin } = require('pinyin-pro')
const SR = await import('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/storyReading.js')
const a = require('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/data/hsk2-vocab-snapshot.json'), c = require('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/data/hsk3.json')
const vm = {}; let id = 1
for (const [w, r] of a) if (!vm[w]) vm[w] = { id: id++, word: w, reading: r, level: 2 }
for (const x of c) if (!vm[x.word]) vm[x.word] = { id: id++, word: x.word, reading: x.reading, level: 3 }
const L = 'chinese'
const m = SR.buildVocabMatcher(vm, L), seg = SR.segmenterFor(L)
const lines = process.argv.slice(2).length ? process.argv.slice(2) : [
 '他长大了，长得很高。', '我去银行，银行里人很多。', '这个很重要，我重新做了一次。', '我觉得我睡觉睡得很好。',
 '我了解了。', '他跑得很快。', '我得走了。', '他慢慢地走。', '这个地方很好。', '我还书了，还是你还我？', '我们都去，都市很大。',
 '今天是2026年11月9日，我有3个苹果。', 'I love 北京！你好，Tom。', '小明：「你好！」', '他行不行？我们一行人去银行。', '太阳出来了，周末去公园。',
 '我为你高兴，为了你。', '差不多，还差一点儿。', '他教我，教室很大。', '我们一起去吧。', '一个人，一天，不对，不是。', '中国人很好。',
 '大人常常告诉他们：要好好学习。', '老师：同学们好！', '她的头发很长。', '我们好好聊聊。', '他会说中文。'
]
for (const line of lines) {
  const { speaker, text } = SR.splitSpeaker(line)
  const toks = SR.segmentLine(text, m, SR.storyNamesFor(line, vm, L), SR.particlesFor(L), seg)
  const ctx = pinyin(text, { type: 'array' })
  // char index -> context pinyin
  let pos = 0; const out = []
  for (const t of toks) {
    const chars = Array.from(t.text)
    const ctxR = chars.map((_, k) => ctx[pos + k]).join('')
    pos += chars.length
    const r = t.vocab ? t.vocab.reading.replace(/\s+/g, '') : (t.name ? '(name)' : '-')
    const flag = t.vocab && r.normalize('NFC').toLowerCase() !== ctxR.normalize('NFC').toLowerCase() ? ' !!' : ''
    out.push(t.text + '[' + r + (flag ? '|pp:' + ctxR : '') + ']' + flag)
  }
  const rd = SR.calculateStoryReadability({ content: line, vocabMap: vm, cards: {}, language: L })
  console.log((speaker ? '<' + speaker + '> ' : '') + out.join(' ') + '   total=' + rd.totalUnique)
}
