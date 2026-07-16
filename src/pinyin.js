// Convert diacritic pinyin (as stored in vocabulary.reading, e.g. "wǒmen",
// "àihào", "lǜ") into the tone-numbered, syllable-segmented form Google Cloud
// Text-to-Speech expects inside an SSML <phoneme alphabet="pinyin"> tag, e.g.
// "wo3 men2", "ai4 hao4", "lu:4". This lets us pin the exact Mandarin reading
// of a word instead of letting the voice guess — the fix for polyphonic
// characters (长 cháng/zhǎng, 行 xíng/háng, 觉 jué/jiào …) being mispronounced
// when spoken in isolation as bare hanzi.
//
// Pure logic, no browser or Node APIs, so it is unit-tested directly and shared
// by the root generate-audio.mjs script. It is intentionally conservative:
// anything it can't confidently parse yields null, and the caller falls back to
// plain-text synthesis — never worse than today's behavior.

// Vowel diacritics → [base vowel(s), tone number 1-4]. ü is written "u:" — the
// spelling Google's pinyin alphabet uses. Neutral tone carries no mark.
const TONE_VOWELS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ü: ['u:', 0], ǖ: ['u:', 1], ǘ: ['u:', 2], ǚ: ['u:', 3], ǜ: ['u:', 4],
}

// The canonical inventory of valid toneless Hanyu Pinyin syllables. ü-syllables
// appear in the "u:" spelling produced by stripTones (lü → "lu:"), since that is
// what the segmenter sees and what Google expects. Kept as one flat set; the
// segmenter sorts it longest-first so greedy matching never stops short
// ("shang" is tried before "sha").
const SYLLABLES = [
  // zero-initial
  'a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er',
  'o', 'ou', 'yi', 'ya', 'yao', 'ye', 'you', 'yan', 'yin', 'yang',
  'ying', 'yong', 'yo', 'wu', 'wa', 'wo', 'wai', 'wei', 'wan', 'wen',
  'wang', 'weng', 'yu', 'yue', 'yuan', 'yun',
  // b
  'ba', 'bo', 'bai', 'bei', 'bao', 'ban', 'ben', 'bang', 'beng',
  'bi', 'bie', 'biao', 'bian', 'bin', 'bing', 'bu',
  // p
  'pa', 'po', 'pai', 'pei', 'pao', 'pou', 'pan', 'pen', 'pang', 'peng',
  'pi', 'pie', 'piao', 'pian', 'pin', 'ping', 'pu',
  // m
  'ma', 'mo', 'me', 'mai', 'mei', 'mao', 'mou', 'man', 'men', 'mang',
  'meng', 'mi', 'mie', 'miao', 'miu', 'mian', 'min', 'ming', 'mu',
  // f
  'fa', 'fo', 'fei', 'fou', 'fan', 'fen', 'fang', 'feng', 'fu',
  // d
  'da', 'de', 'dai', 'dei', 'dao', 'dou', 'dan', 'den', 'dang', 'deng',
  'dong', 'di', 'die', 'diao', 'diu', 'dian', 'ding', 'du', 'duo', 'dui',
  'duan', 'dun',
  // t
  'ta', 'te', 'tai', 'tao', 'tou', 'tan', 'tang', 'teng', 'tong',
  'ti', 'tie', 'tiao', 'tian', 'ting', 'tu', 'tuo', 'tui', 'tuan', 'tun',
  // n
  'na', 'ne', 'nai', 'nei', 'nao', 'nou', 'nan', 'nen', 'nang', 'neng',
  'nong', 'ni', 'nie', 'niao', 'niu', 'nian', 'nin', 'niang', 'ning',
  'nu', 'nuo', 'nuan', 'nu:', 'nu:e',
  // l
  'la', 'le', 'lai', 'lei', 'lao', 'lou', 'lan', 'lang', 'leng', 'long',
  'li', 'lia', 'lie', 'liao', 'liu', 'lian', 'lin', 'liang', 'ling',
  'lu', 'luo', 'luan', 'lun', 'lu:', 'lu:e', 'lo',
  // g
  'ga', 'ge', 'gai', 'gei', 'gao', 'gou', 'gan', 'gen', 'gang', 'geng',
  'gong', 'gu', 'gua', 'guo', 'guai', 'gui', 'guan', 'gun', 'guang',
  // k
  'ka', 'ke', 'kai', 'kei', 'kao', 'kou', 'kan', 'ken', 'kang', 'keng',
  'kong', 'ku', 'kua', 'kuo', 'kuai', 'kui', 'kuan', 'kun', 'kuang',
  // h
  'ha', 'he', 'hai', 'hei', 'hao', 'hou', 'han', 'hen', 'hang', 'heng',
  'hong', 'hu', 'hua', 'huo', 'huai', 'hui', 'huan', 'hun', 'huang',
  // j
  'ji', 'jia', 'jie', 'jiao', 'jiu', 'jian', 'jin', 'jiang', 'jing',
  'jiong', 'ju', 'jue', 'juan', 'jun',
  // q
  'qi', 'qia', 'qie', 'qiao', 'qiu', 'qian', 'qin', 'qiang', 'qing',
  'qiong', 'qu', 'que', 'quan', 'qun',
  // x
  'xi', 'xia', 'xie', 'xiao', 'xiu', 'xian', 'xin', 'xiang', 'xing',
  'xiong', 'xu', 'xue', 'xuan', 'xun',
  // zh
  'zha', 'zhe', 'zhi', 'zhai', 'zhei', 'zhao', 'zhou', 'zhan', 'zhen',
  'zhang', 'zheng', 'zhong', 'zhu', 'zhua', 'zhuo', 'zhuai', 'zhui',
  'zhuan', 'zhun', 'zhuang',
  // ch
  'cha', 'che', 'chi', 'chai', 'chao', 'chou', 'chan', 'chen', 'chang',
  'cheng', 'chong', 'chu', 'chua', 'chuo', 'chuai', 'chui', 'chuan',
  'chun', 'chuang',
  // sh
  'sha', 'she', 'shi', 'shai', 'shei', 'shao', 'shou', 'shan', 'shen',
  'shang', 'sheng', 'shu', 'shua', 'shuo', 'shuai', 'shui', 'shuan',
  'shun', 'shuang',
  // r
  're', 'ri', 'rao', 'rou', 'ran', 'ren', 'rang', 'reng', 'rong',
  'ru', 'rua', 'ruo', 'rui', 'ruan', 'run',
  // z
  'za', 'ze', 'zi', 'zai', 'zei', 'zao', 'zou', 'zan', 'zen', 'zang',
  'zeng', 'zong', 'zu', 'zuo', 'zui', 'zuan', 'zun',
  // c
  'ca', 'ce', 'ci', 'cai', 'cao', 'cou', 'can', 'cen', 'cang', 'ceng',
  'cong', 'cu', 'cuo', 'cui', 'cuan', 'cun',
  // s
  'sa', 'se', 'si', 'sai', 'sao', 'sou', 'san', 'sen', 'sang', 'seng',
  'song', 'su', 'suo', 'sui', 'suan', 'sun',
]
// Longest-first so greedy matching never stops short.
const SYLLABLE_SET = SYLLABLES.slice().sort((a, b) => b.length - a.length)

// Strip diacritics from a reading, returning { base, toneAt } where `base` is
// the toneless letters (ü rendered as "u:") and `toneAt` records the tone number
// keyed by its position within `base`. Returns null on any character the map
// doesn't know, so callers can fall back to plain-text synthesis.
function stripTones(reading) {
  let base = ''
  const toneAt = []
  for (const ch of reading) {
    if (Object.prototype.hasOwnProperty.call(TONE_VOWELS, ch)) {
      const [vowel, tone] = TONE_VOWELS[ch]
      if (tone > 0) toneAt.push({ pos: base.length, tone })
      base += vowel
    } else if (ch >= 'a' && ch <= 'z') {
      base += ch
    } else {
      return null // apostrophe, space, digit, or unexpected symbol
    }
  }
  return { base, toneAt }
}

// Greedy longest-match segmentation of a toneless pinyin string into syllable
// spans. Returns [{ syl, start, end }] covering the whole string, or null if any
// remainder has no valid syllable prefix.
function segment(base) {
  const spans = []
  let i = 0
  while (i < base.length) {
    let matched = null
    for (const syl of SYLLABLE_SET) {
      if (base.startsWith(syl, i)) { matched = syl; break }
    }
    if (!matched) return null
    spans.push({ syl: matched, start: i, end: i + matched.length })
    i += matched.length
  }
  return spans
}

// Convert one word's diacritic reading into space-separated tone-numbered pinyin
// syllables ("wǒmen" → "wo3 men2", "àihào" → "ai4 hao4"). Returns null when the
// reading can't be parsed, so the caller can fall back to plain text.
export function readingToPhonemes(reading) {
  if (!reading || typeof reading !== 'string') return null
  const cleaned = reading.trim().toLowerCase()
  if (!cleaned) return null

  const stripped = stripTones(cleaned)
  if (!stripped) return null
  const { base, toneAt } = stripped

  const spans = segment(base)
  if (!spans) return null

  const out = spans.map(span => {
    // A syllable owns any tone mark that falls within its span; none → neutral.
    const hit = toneAt.find(t => t.pos >= span.start && t.pos < span.end)
    const tone = hit ? hit.tone : 5
    return span.syl + tone
  })
  return out.join(' ')
}

// Build the SSML body that speaks `word` (hanzi) with the pronunciation pinned
// to `reading`'s pinyin. Falls back to plain hanzi text (no phoneme hint) when
// the reading can't be converted — never worse than today's behavior.
export function chinesePhonemeSsml(word, reading) {
  const ph = readingToPhonemes(reading)
  const safeWord = escapeXml(word)
  if (!ph) return `<speak>${safeWord}</speak>`
  return `<speak><phoneme alphabet="pinyin" ph="${escapeXml(ph)}">${safeWord}</phoneme></speak>`
}

function escapeXml(s) {
  return String(s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&apos;')
}
