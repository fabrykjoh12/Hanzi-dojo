// Word-to-World Chat Missions — a short, realistic messaging-app conversation
// built from words the learner met today. Language-agnostic by design: a mission
// object carries everything the UI needs, and per-language chat "skins" (bubble
// colors, header label) are picked by chatStyleFor(). Chinese ships first;
// Japanese (LINE-style) and Russian (Telegram-style) slot in the same way.
//
// Mission shape:
//   id                 stable string id
//   language, level    which track/level this fits
//   scenario           { title, en }  short setup shown on the intro card
//   targetWords        array of target words the chat teaches/reuses
//   messages           [{ from: 'them' | 'me', name, text }]
//   pinyin             per-message reading (same length as messages)
//   translations       per-message English (same length as messages)
//   glossary           { word: { reading, meaning } } for words/names not in the
//                      user's vocab table (names, an intentional new word) so tap
//                      lookups always resolve
//   comprehensionQuestions  [{ question, options[], answer (index) }]
//   replyChallenge     { prompt, options: [{ text, pinyin, correct }] }
//   estimatedTime      minutes (string)
//
// Runtime-only fields the UI/picker compute and never live in the bank:
//   weakWords, knownWordPercentage, completionResult.

// Per-language chat presentation. themeAccent comes from languageTheme; these are
// just the messaging-app flavor cues.
export function chatStyleFor(language) {
  if (language === 'japanese') {
    return { app: 'Chat', theirBubble: '#FFFFFF', myBubble: '#8DE055', myText: '#0B2B0B', bg: '#7CB7E8' }
  }
  if (language === 'russian') {
    return { app: 'Chat', theirBubble: '#FFFFFF', myBubble: '#EFFDDE', myText: '#0B2B0B', bg: '#8AB4C9' }
  }
  // Chinese — clean modern green messenger feel, not WeChat branding.
  return { app: 'Chat', theirBubble: '#FFFFFF', myBubble: '#A7E27E', myText: '#123', bg: '#EDE9E3' }
}

// ── Chinese HSK 1 mission bank ───────────────────────────────────────────────
const CN_HSK1 = [
  {
    id: 'cn-hsk1-coffee',
    language: 'chinese', level: 1,
    scenario: { title: '放学以后', en: 'A friend asks if you want coffee after school.' },
    targetWords: ['今天', '学校', '朋友', '想', '去', '咖啡', '现在'],
    messages: [
      { from: 'them', name: '小明', text: '你今天去学校吗？' },
      { from: 'me', name: '我', text: '去。我现在在学校。' },
      { from: 'them', name: '小明', text: '我也在学校。你想喝咖啡吗？' },
      { from: 'me', name: '我', text: '想。我们几点去？' },
      { from: 'them', name: '小明', text: '三点。我的朋友也想去。' },
    ],
    pinyin: [
      'Nǐ jīntiān qù xuéxiào ma?',
      'Qù. Wǒ xiànzài zài xuéxiào.',
      'Wǒ yě zài xuéxiào. Nǐ xiǎng hē kāfēi ma?',
      'Xiǎng. Wǒmen jǐ diǎn qù?',
      'Sān diǎn. Wǒ de péngyou yě xiǎng qù.',
    ],
    translations: [
      'Are you going to school today?',
      "Yes. I'm at school right now.",
      'I’m at school too. Do you want to get coffee?',
      'Yes. What time should we go?',
      'Three o’clock. My friend wants to come too.',
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
      '咖啡': { reading: 'kāfēi', meaning: 'coffee' },
    },
    comprehensionQuestions: [
      { question: '小明想做什么？', options: ['喝咖啡', '去医院', '买水果'], answer: 0 },
      { question: '他们几点去？', options: ['三点', '九点', '两点'], answer: 0 },
      { question: '谁也想去？', options: ['小明的朋友', '老师', '妈妈'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明说他的朋友也想去。你怎么回答？',
      options: [
        { text: '好，一起去吧！', pinyin: 'Hǎo, yìqǐ qù ba!', correct: true },
        { text: '我不是学生。', pinyin: 'Wǒ bú shì xuéshēng.', correct: false },
        { text: '这个苹果很贵。', pinyin: 'Zhège píngguǒ hěn guì.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'cn-hsk1-fruit',
    language: 'chinese', level: 1,
    scenario: { title: '去买水果', en: 'Planning to buy fruit at the store tomorrow.' },
    targetWords: ['明天', '商店', '买', '水果', '苹果', '多少', '钱'],
    messages: [
      { from: 'them', name: '小红', text: '明天你去商店吗？' },
      { from: 'me', name: '我', text: '去。我想买水果。' },
      { from: 'them', name: '小红', text: '我也想买苹果。苹果多少钱？' },
      { from: 'me', name: '我', text: '不贵。一个三块。' },
      { from: 'them', name: '小红', text: '好。我们几点去？' },
      { from: 'me', name: '我', text: '上午九点。' },
    ],
    pinyin: [
      'Míngtiān nǐ qù shāngdiàn ma?',
      'Qù. Wǒ xiǎng mǎi shuǐguǒ.',
      'Wǒ yě xiǎng mǎi píngguǒ. Píngguǒ duōshao qián?',
      'Bú guì. Yí gè sān kuài.',
      'Hǎo. Wǒmen jǐ diǎn qù?',
      'Shàngwǔ jiǔ diǎn.',
    ],
    translations: [
      'Are you going to the store tomorrow?',
      'Yes. I want to buy some fruit.',
      'I want to buy apples too. How much are apples?',
      'Not expensive. Three kuai each.',
      'Okay. What time should we go?',
      'Nine in the morning.',
    ],
    glossary: {
      '小红': { reading: 'Xiǎo Hóng', meaning: 'Xiao Hong (a name)' },
    },
    comprehensionQuestions: [
      { question: '我想买什么？', options: ['水果', '咖啡', '书'], answer: 0 },
      { question: '苹果一个多少钱？', options: ['三块', '九块', '五块'], answer: 0 },
      { question: '他们几点去？', options: ['上午九点', '下午三点', '晚上'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小红问几点去。你怎么说？',
      options: [
        { text: '上午九点。', pinyin: 'Shàngwǔ jiǔ diǎn.', correct: true },
        { text: '我不喝茶。', pinyin: 'Wǒ bù hē chá.', correct: false },
        { text: '老师很忙。', pinyin: 'Lǎoshī hěn máng.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'cn-hsk1-sick',
    language: 'chinese', level: 1,
    scenario: { title: '你怎么了？', en: 'A friend checks in because you seem unwell.' },
    targetWords: ['今天', '生病', '医院', '医生', '休息', '朋友'],
    messages: [
      { from: 'them', name: '小明', text: '你今天怎么了？' },
      { from: 'me', name: '我', text: '我生病了。' },
      { from: 'them', name: '小明', text: '你去医院吗？' },
      { from: 'me', name: '我', text: '去了。医生说要休息。' },
      { from: 'them', name: '小明', text: '好。你休息吧。' },
      { from: 'me', name: '我', text: '谢谢你。你是我的好朋友。' },
    ],
    pinyin: [
      'Nǐ jīntiān zěnme le?',
      'Wǒ shēngbìng le.',
      'Nǐ qù yīyuàn ma?',
      'Qù le. Yīshēng shuō yào xiūxi.',
      'Hǎo. Nǐ xiūxi ba.',
      'Xièxie nǐ. Nǐ shì wǒ de hǎo péngyou.',
    ],
    translations: [
      "What's wrong today?",
      "I'm sick.",
      'Are you going to the hospital?',
      'I went. The doctor said I need to rest.',
      'Okay. Get some rest.',
      "Thank you. You're a good friend.",
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
    },
    comprehensionQuestions: [
      { question: '我今天怎么了？', options: ['生病了', '很高兴', '去学校'], answer: 0 },
      { question: '医生说要做什么？', options: ['休息', '买东西', '唱歌'], answer: 0 },
      { question: '小明是谁？', options: ['我的朋友', '老师', '医生'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明让你休息。你怎么回答？',
      options: [
        { text: '谢谢你。', pinyin: 'Xièxie nǐ.', correct: true },
        { text: '苹果多少钱？', pinyin: 'Píngguǒ duōshao qián?', correct: false },
        { text: '我们几点去？', pinyin: 'Wǒmen jǐ diǎn qù?', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

const BANK = { 'chinese|1': CN_HSK1 }

// Pick the mission that best reuses the words the learner actually met today.
// Overlap with today's learned/weak/review words wins; ties and the no-overlap
// case fall back to a stable rotation so repeat sessions vary. Returns null when
// no bank exists for this language/level yet (feature simply hides itself).
export function pickMission({ language, level, dayWords = [], seed = 0 }) {
  const bank = BANK[language + '|' + level]
  if (!bank || bank.length === 0) return null
  const want = new Set(dayWords)
  let best = null, bestScore = -1
  bank.forEach((m, i) => {
    const score = m.targetWords.reduce((n, w) => n + (want.has(w) ? 1 : 0), 0)
    // Rotation tie-breaker keeps it from always showing mission 0.
    const tie = (i + seed) % bank.length
    if (score > bestScore || (score === bestScore && best && tie < best._tie)) {
      best = { ...m, _tie: tie }; bestScore = score
    }
  })
  if (!best) return null
  const clone = { ...best }
  delete clone._tie
  return clone
}

// Split a mission's target words into the three "today" buckets for highlighting.
export function classifyMissionWords(mission, { learned = [], weak = [], review = [] }) {
  const L = new Set(learned), W = new Set(weak), R = new Set(review)
  const out = { learned: [], weak: [], review: [] }
  mission.targetWords.forEach(w => {
    if (W.has(w)) out.weak.push(w)
    else if (L.has(w)) out.learned.push(w)
    else if (R.has(w)) out.review.push(w)
  })
  return out
}
