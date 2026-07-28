// The cast of a story, derived from the story itself.
//
// `CHARACTER_READINGS` (characterNames.js) only knows the handful of names the
// seed prompts were told to use. Every story that reached for another name — a
// new serial character, a name the model invented, any Russian name at all
// (that map had no Russian entry) — fell through to the vocabulary matcher,
// which chopped it into single characters and rendered the pieces as ordinary
// unknown text. That is the "names don't look like names" bug: 小云 read as two
// unrelated characters, Ивана as a mystery word.
//
// A story names its own cast: dialogue lines are "Name：line", so the SPEAKER
// LABELS are the character list. A label that isn't ordinary vocabulary is a
// proper name — and once known, it is treated as a name everywhere else in the
// narration too, not just where it labels a line.
//
// Precision matters more than recall here: mislabeling a real word "Name" hides
// a word the learner should learn, while missing a name only leaves today's
// behavior. So a label has to look like a name (right script, no phrase glue,
// short) and must not be vocabulary or a known role noun.

// Role nouns that speak in these stories. Most are ordinary vocabulary and are
// rejected by the vocab check alone; these cover the case where the learner's
// track doesn't carry the word (a Chinese learner's map has no Japanese words,
// and a lower level may not include the role noun yet).
const ROLE_WORDS = {
  chinese: new Set(['妈妈', '爸爸', '哥哥', '姐姐', '弟弟', '妹妹', '爷爷', '奶奶', '老师', '医生', '服务员', '售货员', '司机', '同学', '朋友', '孩子', '儿子', '女儿', '阿姨', '叔叔']),
  japanese: new Set(['おかあさん', 'おとうさん', 'おじいさん', 'おばあさん', 'おにいさん', 'おねえさん', 'せんせい', 'みせのひと', 'てんいん', 'いしゃ', 'うんてんしゅ', 'ともだち', 'えきいん', 'おきゃくさん']),
  russian: new Set(['мама', 'папа', 'бабушка', 'дедушка', 'продавец', 'продавщица', 'учитель', 'учительница', 'врач', 'друг', 'подруга', 'брат', 'сестра', 'сын', 'дочь', 'официант']),
}

// Chinese role words are frequently written as name-shaped 2–3 character words,
// so a trailing role character is a strong "this is a job, not a person" signal
// (服务员, 售货员, 出租车司机). Given names ending in these are vanishingly rare
// in graded readers.
const ZH_ROLE_TAIL = new Set(['员', '师', '生', '者', '人', '长', '姨', '叔', '伯', '婆', '爷', '奶'])

function isCjkCode(c) { return c >= 0x3400 && c <= 0x9FFF }
function isKanaCode(c) { return c >= 0x3040 && c <= 0x30FF }
function isCyrillicCode(c) { return c >= 0x0400 && c <= 0x04FF }

// Does every character belong to the language's own script? A label carrying
// punctuation, digits, spaces or a stray latin letter is a stage direction or a
// parse artifact, never a character name.
function isPureScript(label, language) {
  if (language === 'russian') {
    for (let i = 0; i < label.length; i += 1) if (!isCyrillicCode(label.charCodeAt(i))) return false
    return true
  }
  for (let i = 0; i < label.length; i += 1) {
    const c = label.charCodeAt(i)
    if (!isCjkCode(c) && !isKanaCode(c)) return false
  }
  return true
}

// Russian proper nouns are capitalized; a lowercase label is a role noun.
function isCapitalized(label) {
  const first = label[0] || ''
  return first !== first.toLowerCase() && first === first.toUpperCase()
}

// nameFromSpeaker(speaker, vocabMap, language) → the name, or null.
//
// Rejects, in order: empty labels, phrase glue (a Japanese の label like
// みせのひと is a description), the wrong script, over-long labels (a 5+ char
// CJK label is a role phrase, not a given name), single characters (too short
// to match safely — matchName never matches one), ordinary vocabulary, and
// known role nouns.
export function nameFromSpeaker(speaker, vocabMap = {}, language) {
  const label = String(speaker || '').trim()
  if (!label) return null
  const maxLen = language === 'russian' ? 20 : 4
  if (label.length < 2 || label.length > maxLen) return null
  if (!isPureScript(label, language)) return null
  if (language === 'japanese' && label.indexOf('の') >= 0) return null
  if (language === 'russian' && !isCapitalized(label)) return null
  if (vocabMap[label]) return null
  if (language === 'russian' && vocabMap[label.toLowerCase()]) return null
  const roles = ROLE_WORDS[language]
  if (roles && (roles.has(label) || roles.has(label.toLowerCase()))) return null
  if (language === 'chinese' && ZH_ROLE_TAIL.has(label[label.length - 1])) return null
  return label
}

// collectStoryNames(speakers, vocabMap, language, curated) → { name: reading|null }
//
// The curated map, plus every speaker label that survives nameFromSpeaker.
// Curated entries are never overwritten — they carry a reading (pinyin / kana /
// romanization) and a derived name carries none, so the reader still shows a
// reading wherever one is known.
export function collectStoryNames(speakers, vocabMap = {}, language, curated = {}) {
  const names = { ...curated }
  ;(speakers || []).forEach(speaker => {
    const name = nameFromSpeaker(speaker, vocabMap, language)
    if (name && !(name in names)) names[name] = null
  })
  return names
}
