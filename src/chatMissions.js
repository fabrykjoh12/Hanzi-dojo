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
      tiles: { answer: ['好', '，', '一起', '去', '吧'], distractors: ['不', '咖啡'] },
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
      tiles: { answer: ['上午', '九', '点'], distractors: ['明天', '买'] },
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
      tiles: { answer: ['谢谢', '你'], distractors: ['医院', '休息'] },
      options: [
        { text: '谢谢你。', pinyin: 'Xièxie nǐ.', correct: true },
        { text: '苹果多少钱？', pinyin: 'Píngguǒ duōshao qián?', correct: false },
        { text: '我们几点去？', pinyin: 'Wǒmen jǐ diǎn qù?', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'cn-hsk1-eat',
    language: 'chinese', level: 1,
    scenario: { title: '吃饭', en: 'A friend suggests grabbing something to eat.' },
    targetWords: ['吃', '饭', '菜', '茶', '水', '好吃'],
    messages: [
      { from: 'them', name: '小明', text: '你想吃饭吗？' },
      { from: 'me', name: '我', text: '想。我们吃什么？' },
      { from: 'them', name: '小明', text: '这个菜很好吃。你喝茶吗？' },
      { from: 'me', name: '我', text: '不喝茶，我喝水。' },
      { from: 'them', name: '小明', text: '好。菜来了！' },
    ],
    pinyin: [
      'Nǐ xiǎng chīfàn ma?',
      'Xiǎng. Wǒmen chī shénme?',
      'Zhège cài hěn hǎochī. Nǐ hē chá ma?',
      'Bù hē chá, wǒ hē shuǐ.',
      'Hǎo. Cài lái le!',
    ],
    translations: [
      'Do you want to eat?',
      'Yes. What should we eat?',
      'This dish is really tasty. Do you drink tea?',
      "I don't drink tea, I'll drink water.",
      'Okay. The food is here!',
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
      '好吃': { reading: 'hǎochī', meaning: 'tasty, delicious' },
    },
    comprehensionQuestions: [
      { question: '小明想做什么？', options: ['吃饭', '睡觉', '看书'], answer: 0 },
      { question: '我喝什么？', options: ['水', '茶', '咖啡'], answer: 0 },
      { question: '这个菜怎么样？', options: ['很好吃', '很贵', '不好'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明说菜来了。你怎么说？',
      tiles: { answer: ['太', '好', '了'], distractors: ['不', '茶'] },
      options: [
        { text: '太好了！', pinyin: 'Tài hǎo le!', correct: true },
        { text: '我不吃。', pinyin: 'Wǒ bù chī.', correct: false },
        { text: '苹果很贵。', pinyin: 'Píngguǒ hěn guì.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

// ── Japanese JLPT N5 mission bank (kana, LINE-style skin) ────────────────────
const JP_N5 = [
  {
    id: 'jp-n5-tea',
    language: 'japanese', level: 1,
    scenario: { title: 'えきで', en: 'A friend asks if you want tea after school.' },
    targetWords: ['きょう', 'がっこう', 'えき', 'おちゃ', 'のみます', 'ともだち', 'いま'],
    messages: [
      { from: 'them', name: 'はな', text: 'きょう、がっこうへ いきますか。' },
      { from: 'me', name: 'わたし', text: 'はい。いま、えきに います。' },
      { from: 'them', name: 'はな', text: 'わたしも えきに います。おちゃを のみますか。' },
      { from: 'me', name: 'わたし', text: 'はい。なんじに いきますか。' },
      { from: 'them', name: 'はな', text: 'さんじ。ともだちも きます。' },
    ],
    pinyin: [
      'Kyō, gakkō e ikimasu ka.',
      'Hai. Ima, eki ni imasu.',
      'Watashi mo eki ni imasu. Ocha o nomimasu ka.',
      'Hai. Nanji ni ikimasu ka.',
      'Sanji. Tomodachi mo kimasu.',
    ],
    translations: [
      'Are you going to school today?',
      "Yes. I'm at the station now.",
      "I'm at the station too. Shall we get tea?",
      'Yes. What time shall we go?',
      'Three o’clock. My friend is coming too.',
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' }, 'たかし': { reading: 'Takashi', meaning: 'Takashi (a name)' },
      'きょう': { reading: 'kyō', meaning: 'today' }, 'がっこう': { reading: 'gakkō', meaning: 'school' },
      'いきます': { reading: 'ikimasu', meaning: 'to go' }, 'はい': { reading: 'hai', meaning: 'yes' },
      'いま': { reading: 'ima', meaning: 'now' }, 'えき': { reading: 'eki', meaning: 'station' },
      'います': { reading: 'imasu', meaning: 'to be (living things)' }, 'わたし': { reading: 'watashi', meaning: 'I, me' },
      'おちゃ': { reading: 'ocha', meaning: 'tea' }, 'のみます': { reading: 'nomimasu', meaning: 'to drink' },
      'なんじ': { reading: 'nanji', meaning: 'what time' }, 'さんじ': { reading: 'sanji', meaning: 'three o’clock' },
      'ともだち': { reading: 'tomodachi', meaning: 'friend' }, 'きます': { reading: 'kimasu', meaning: 'to come' },
    },
    comprehensionQuestions: [
      { question: 'はなは なにを のみますか。', options: ['おちゃ', 'みず', 'コーヒー'], answer: 0 },
      { question: 'なんじに いきますか。', options: ['さんじ', 'くじ', 'いちじ'], answer: 0 },
      { question: 'だれが きますか。', options: ['ともだち', 'せんせい', 'おかあさん'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「ともだちも きます」と いいました。なんと こたえますか。',
      tiles: { answer: ['はい', 'いきます'], distractors: ['みず', 'たべます'] },
      options: [
        { text: 'はい、いきます。', correct: true },
        { text: 'みずを のみます。', correct: false },
        { text: 'わかりません。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'jp-n5-shop',
    language: 'japanese', level: 1,
    scenario: { title: 'かいもの', en: 'Planning to buy bread at the shop tomorrow.' },
    targetWords: ['あした', 'みせ', 'パン', 'かいます', 'すき', 'やすい', 'いくら'],
    messages: [
      { from: 'them', name: 'はな', text: 'あした、みせへ いきますか。' },
      { from: 'me', name: 'わたし', text: 'はい。パンを かいます。' },
      { from: 'them', name: 'はな', text: 'わたしも パンが すきです。いくらですか。' },
      { from: 'me', name: 'わたし', text: 'やすいです。ひとつ ひゃくえんです。' },
      { from: 'them', name: 'はな', text: 'いいですね。いっしょに いきます。' },
    ],
    pinyin: [
      'Ashita, mise e ikimasu ka.',
      'Hai. Pan o kaimasu.',
      'Watashi mo pan ga suki desu. Ikura desu ka.',
      'Yasui desu. Hitotsu hyaku en desu.',
      'Ii desu ne. Issho ni ikimasu.',
    ],
    translations: [
      'Are you going to the shop tomorrow?',
      "Yes. I'll buy bread.",
      'I like bread too. How much is it?',
      'It’s cheap. One is a hundred yen.',
      'Nice. Let’s go together.',
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' },
      'あした': { reading: 'ashita', meaning: 'tomorrow' }, 'みせ': { reading: 'mise', meaning: 'shop' },
      'いきます': { reading: 'ikimasu', meaning: 'to go' }, 'はい': { reading: 'hai', meaning: 'yes' },
      'パン': { reading: 'pan', meaning: 'bread' }, 'かいます': { reading: 'kaimasu', meaning: 'to buy' },
      'わたし': { reading: 'watashi', meaning: 'I, me' }, 'すき': { reading: 'suki', meaning: 'to like' },
      'いくら': { reading: 'ikura', meaning: 'how much' }, 'やすい': { reading: 'yasui', meaning: 'cheap' },
      'ひとつ': { reading: 'hitotsu', meaning: 'one (thing)' }, 'ひゃく': { reading: 'hyaku', meaning: 'hundred' },
      'えん': { reading: 'en', meaning: 'yen' }, 'いい': { reading: 'ii', meaning: 'good, nice' },
      'いっしょに': { reading: 'issho ni', meaning: 'together' },
    },
    comprehensionQuestions: [
      { question: 'わたしは なにを かいますか。', options: ['パン', 'みず', 'にく'], answer: 0 },
      { question: 'パンは たかいですか。', options: ['やすいです', 'たかいです', 'わかりません'], answer: 0 },
      { question: 'いつ いきますか。', options: ['あした', 'きょう', 'きのう'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「いっしょに いきます」と いいました。こたえて ください。',
      tiles: { answer: ['はい', 'いきます'], distractors: ['くるま', 'たべます'] },
      options: [
        { text: 'はい、いきます。', correct: true },
        { text: 'くるまが すきです。', correct: false },
        { text: 'いま、ねます。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'jp-n5-lunch',
    language: 'japanese', level: 1,
    scenario: { title: 'おひるごはん', en: 'A friend asks what you are having for lunch.' },
    targetWords: ['ひるごはん', 'たべます', 'なに', 'おいしい', 'おにぎり', 'いっしょに'],
    messages: [
      { from: 'them', name: 'はな', text: 'おなかが すきましたか。' },
      { from: 'me', name: 'わたし', text: 'はい。ひるごはんを たべます。' },
      { from: 'them', name: 'はな', text: 'なにを たべますか。' },
      { from: 'me', name: 'わたし', text: 'おにぎりです。おいしいです。' },
      { from: 'them', name: 'はな', text: 'いいですね。いっしょに たべましょう。' },
    ],
    pinyin: [
      'Onaka ga sukimashita ka.',
      'Hai. Hirugohan o tabemasu.',
      'Nani o tabemasu ka.',
      'Onigiri desu. Oishii desu.',
      'Ii desu ne. Issho ni tabemashō.',
    ],
    translations: [
      'Are you hungry?',
      "Yes. I'll have lunch.",
      'What will you eat?',
      "Rice balls. They're delicious.",
      "Nice. Let's eat together.",
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' },
      'おなか': { reading: 'onaka', meaning: 'stomach' }, 'すきました': { reading: 'sukimashita', meaning: 'became empty (hungry)' },
      'はい': { reading: 'hai', meaning: 'yes' }, 'ひるごはん': { reading: 'hirugohan', meaning: 'lunch' },
      'たべます': { reading: 'tabemasu', meaning: 'to eat' }, 'なに': { reading: 'nani', meaning: 'what' },
      'おにぎり': { reading: 'onigiri', meaning: 'rice ball' }, 'おいしい': { reading: 'oishii', meaning: 'delicious' },
      'いい': { reading: 'ii', meaning: 'good, nice' }, 'いっしょに': { reading: 'issho ni', meaning: 'together' },
      'たべましょう': { reading: 'tabemashō', meaning: "let's eat" }, 'わたし': { reading: 'watashi', meaning: 'I, me' },
    },
    comprehensionQuestions: [
      { question: 'わたしは なにを たべますか。', options: ['おにぎり', 'パン', 'すし'], answer: 0 },
      { question: 'おにぎりは どうですか。', options: ['おいしいです', 'たかいです', 'からいです'], answer: 0 },
      { question: 'だれと たべますか。', options: ['はな', 'せんせい', 'ひとり'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「いっしょに たべましょう」と いいました。こたえて ください。',
      tiles: { answer: ['はい', 'たべましょう'], distractors: ['みず', 'ねます'] },
      options: [
        { text: 'はい、たべましょう。', correct: true },
        { text: 'いいえ、ねます。', correct: false },
        { text: 'くるまが すきです。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'jp-n5-weekend',
    language: 'japanese', level: 1,
    scenario: { title: 'どようび', en: 'Chatting about weekend plans.' },
    targetWords: ['どようび', 'なに', 'します', 'えいが', 'みます', 'たのしい'],
    messages: [
      { from: 'them', name: 'はな', text: 'どようび、なにを しますか。' },
      { from: 'me', name: 'わたし', text: 'えいがを みます。' },
      { from: 'them', name: 'はな', text: 'いいですね。たのしいですか。' },
      { from: 'me', name: 'わたし', text: 'はい、とても たのしいです。' },
      { from: 'them', name: 'はな', text: 'わたしも みたいです。' },
    ],
    pinyin: [
      'Doyōbi, nani o shimasu ka.',
      'Eiga o mimasu.',
      'Ii desu ne. Tanoshii desu ka.',
      'Hai, totemo tanoshii desu.',
      'Watashi mo mitai desu.',
    ],
    translations: [
      'What are you doing on Saturday?',
      "I'm going to watch a movie.",
      'Nice. Is it fun?',
      "Yes, it's a lot of fun.",
      'I want to watch too.',
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' },
      'どようび': { reading: 'doyōbi', meaning: 'Saturday' }, 'なに': { reading: 'nani', meaning: 'what' },
      'します': { reading: 'shimasu', meaning: 'to do' }, 'えいが': { reading: 'eiga', meaning: 'movie' },
      'みます': { reading: 'mimasu', meaning: 'to watch, to see' }, 'いい': { reading: 'ii', meaning: 'good, nice' },
      'たのしい': { reading: 'tanoshii', meaning: 'fun, enjoyable' }, 'はい': { reading: 'hai', meaning: 'yes' },
      'とても': { reading: 'totemo', meaning: 'very' }, 'わたし': { reading: 'watashi', meaning: 'I, me' },
      'みたい': { reading: 'mitai', meaning: 'want to watch' },
    },
    comprehensionQuestions: [
      { question: 'わたしは なにを しますか。', options: ['えいがを みます', 'ほんを よみます', 'ねます'], answer: 0 },
      { question: 'えいがは たのしいですか。', options: ['はい', 'いいえ', 'わかりません'], answer: 0 },
      { question: 'いつ しますか。', options: ['どようび', 'にちようび', 'げつようび'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「みたいです」と いいました。さそって ください。',
      tiles: { answer: ['いっしょに', 'みましょう'], distractors: ['みず', 'たべます'] },
      options: [
        { text: 'いっしょに みましょう。', correct: true },
        { text: 'いいえ、だめです。', correct: false },
        { text: 'くるまが すきです。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

// ── Russian CEFR A1 mission bank (Cyrillic, Telegram-style skin) ─────────────
const RU_A1 = [
  {
    id: 'ru-a1-park',
    language: 'russian', level: 1,
    scenario: { title: 'В парке', en: 'A friend asks if you want coffee at the park.' },
    targetWords: ['парк', 'сейчас', 'кофе', 'друг', 'хочешь', 'идёшь'],
    messages: [
      { from: 'them', name: 'Аня', text: 'Привет! Ты идёшь в парк?' },
      { from: 'me', name: 'Я', text: 'Да. Я сейчас иду.' },
      { from: 'them', name: 'Аня', text: 'Хорошо. Хочешь кофе?' },
      { from: 'me', name: 'Я', text: 'Да. Во сколько?' },
      { from: 'them', name: 'Аня', text: 'В три. Мой друг тоже идёт.' },
    ],
    pinyin: [
      'Privet! Ty idyosh v park?',
      'Da. Ya seychas idu.',
      'Khorosho. Khochesh kofe?',
      'Da. Vo skolko?',
      'V tri. Moy drug tozhe idyot.',
    ],
    translations: [
      'Hi! Are you going to the park?',
      "Yes. I'm walking there now.",
      'Great. Do you want coffee?',
      'Yes. At what time?',
      'At three. My friend is coming too.',
    ],
    glossary: {
      'Аня': { reading: 'Anya', meaning: 'Anya (a name)' },
      'привет': { reading: 'privet', meaning: 'hi, hello' }, 'ты': { reading: 'ty', meaning: 'you' },
      'идёшь': { reading: 'idyosh', meaning: 'you go / are going' }, 'в': { reading: 'v', meaning: 'in, to, at' },
      'парк': { reading: 'park', meaning: 'park' }, 'да': { reading: 'da', meaning: 'yes' },
      'я': { reading: 'ya', meaning: 'I' }, 'сейчас': { reading: 'seychas', meaning: 'now' },
      'иду': { reading: 'idu', meaning: 'I go / am going' }, 'хорошо': { reading: 'khorosho', meaning: 'good, okay' },
      'хочешь': { reading: 'khochesh', meaning: 'you want' }, 'кофе': { reading: 'kofe', meaning: 'coffee' },
      'во': { reading: 'vo', meaning: 'at, in' }, 'сколько': { reading: 'skolko', meaning: 'how much, what (time)' },
      'три': { reading: 'tri', meaning: 'three' }, 'мой': { reading: 'moy', meaning: 'my' },
      'друг': { reading: 'drug', meaning: 'friend' }, 'тоже': { reading: 'tozhe', meaning: 'also, too' },
      'идёт': { reading: 'idyot', meaning: 'he/she goes / is going' },
    },
    comprehensionQuestions: [
      { question: 'Куда идёт Аня?', options: ['В парк', 'В школу', 'Домой'], answer: 0 },
      { question: 'Что хочет Аня?', options: ['Кофе', 'Воду', 'Хлеб'], answer: 0 },
      { question: 'Во сколько?', options: ['В три', 'В пять', 'В два'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'Аня спросила: «Хочешь кофе?» Что ты ответишь?',
      tiles: { answer: ['Да', 'хочу'], distractors: ['нет', 'дом'] },
      options: [
        { text: 'Да, хочу.', correct: true },
        { text: 'Я не студент.', correct: false },
        { text: 'Это дорого.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'ru-a1-store',
    language: 'russian', level: 1,
    scenario: { title: 'В магазине', en: 'Planning to buy bread at the store tomorrow.' },
    targetWords: ['магазин', 'хлеб', 'купить', 'сколько', 'завтра', 'вместе'],
    messages: [
      { from: 'them', name: 'Аня', text: 'Завтра ты идёшь в магазин?' },
      { from: 'me', name: 'Я', text: 'Да. Я хочу купить хлеб.' },
      { from: 'them', name: 'Аня', text: 'Сколько стоит хлеб?' },
      { from: 'me', name: 'Я', text: 'Недорого. Тридцать рублей.' },
      { from: 'them', name: 'Аня', text: 'Хорошо. Идём вместе.' },
    ],
    pinyin: [
      'Zavtra ty idyosh v magazin?',
      'Da. Ya khochu kupit khleb.',
      'Skolko stoit khleb?',
      'Nedorogo. Tridtsat rubley.',
      'Khorosho. Idyom vmeste.',
    ],
    translations: [
      'Are you going to the store tomorrow?',
      'Yes. I want to buy bread.',
      'How much does bread cost?',
      'Not expensive. Thirty rubles.',
      "Okay. Let's go together.",
    ],
    glossary: {
      'Аня': { reading: 'Anya', meaning: 'Anya (a name)' },
      'завтра': { reading: 'zavtra', meaning: 'tomorrow' }, 'ты': { reading: 'ty', meaning: 'you' },
      'идёшь': { reading: 'idyosh', meaning: 'you go / are going' }, 'в': { reading: 'v', meaning: 'in, to, at' },
      'магазин': { reading: 'magazin', meaning: 'shop, store' }, 'да': { reading: 'da', meaning: 'yes' },
      'я': { reading: 'ya', meaning: 'I' }, 'хочу': { reading: 'khochu', meaning: 'I want' },
      'купить': { reading: 'kupit', meaning: 'to buy' }, 'хлеб': { reading: 'khleb', meaning: 'bread' },
      'сколько': { reading: 'skolko', meaning: 'how much' }, 'стоит': { reading: 'stoit', meaning: 'costs' },
      'недорого': { reading: 'nedorogo', meaning: 'not expensive' }, 'тридцать': { reading: 'tridtsat', meaning: 'thirty' },
      'рублей': { reading: 'rubley', meaning: 'rubles' }, 'хорошо': { reading: 'khorosho', meaning: 'good, okay' },
      'идём': { reading: 'idyom', meaning: "let's go / we go" }, 'вместе': { reading: 'vmeste', meaning: 'together' },
    },
    comprehensionQuestions: [
      { question: 'Что хочет купить я?', options: ['Хлеб', 'Молоко', 'Кофе'], answer: 0 },
      { question: 'Сколько стоит хлеб?', options: ['Тридцать рублей', 'Сто рублей', 'Пять рублей'], answer: 0 },
      { question: 'Когда они идут?', options: ['Завтра', 'Сегодня', 'Сейчас'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'Аня сказала: «Идём вместе.» Что ты ответишь?',
      tiles: { answer: ['Да', 'идём'], distractors: ['нет', 'дом'] },
      options: [
        { text: 'Да, идём.', correct: true },
        { text: 'Я не хочу.', correct: false },
        { text: 'Это дорого.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'ru-a1-sick',
    language: 'russian', level: 1,
    scenario: { title: 'Ты болеешь?', en: 'A friend checks in because you seem unwell.' },
    targetWords: ['сегодня', 'болеть', 'врач', 'отдыхать', 'дома', 'друг'],
    messages: [
      { from: 'them', name: 'Аня', text: 'Как ты сегодня?' },
      { from: 'me', name: 'Я', text: 'Я болею.' },
      { from: 'them', name: 'Аня', text: 'Ты идёшь к врачу?' },
      { from: 'me', name: 'Я', text: 'Да. Врач сказал отдыхать дома.' },
      { from: 'them', name: 'Аня', text: 'Хорошо. Отдыхай. Ты мой друг.' },
    ],
    pinyin: [
      'Kak ty segodnya?',
      'Ya boleyu.',
      'Ty idyosh k vrachu?',
      'Da. Vrach skazal otdykhat doma.',
      'Khorosho. Otdykhay. Ty moy drug.',
    ],
    translations: [
      'How are you today?',
      "I'm sick.",
      'Are you going to the doctor?',
      'Yes. The doctor said to rest at home.',
      "Okay. Get some rest. You're my friend.",
    ],
    glossary: {
      'Аня': { reading: 'Anya', meaning: 'Anya (a name)' },
      'как': { reading: 'kak', meaning: 'how' }, 'ты': { reading: 'ty', meaning: 'you' },
      'сегодня': { reading: 'segodnya', meaning: 'today' }, 'я': { reading: 'ya', meaning: 'I' },
      'болею': { reading: 'boleyu', meaning: 'I am sick' }, 'идёшь': { reading: 'idyosh', meaning: 'you go / are going' },
      'к': { reading: 'k', meaning: 'to, towards' }, 'врачу': { reading: 'vrachu', meaning: 'to the doctor' },
      'да': { reading: 'da', meaning: 'yes' }, 'врач': { reading: 'vrach', meaning: 'doctor' },
      'сказал': { reading: 'skazal', meaning: 'said' }, 'отдыхать': { reading: 'otdykhat', meaning: 'to rest' },
      'дома': { reading: 'doma', meaning: 'at home' }, 'хорошо': { reading: 'khorosho', meaning: 'good, okay' },
      'отдыхай': { reading: 'otdykhay', meaning: 'rest (command)' }, 'мой': { reading: 'moy', meaning: 'my' },
      'друг': { reading: 'drug', meaning: 'friend' },
    },
    comprehensionQuestions: [
      { question: 'Что со мной сегодня?', options: ['Я болею', 'Я рад', 'Я иду в парк'], answer: 0 },
      { question: 'Что сказал врач?', options: ['Отдыхать', 'Работать', 'Идти гулять'], answer: 0 },
      { question: 'Кто такая Аня?', options: ['Мой друг', 'Врач', 'Мама'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'Аня сказала: «Отдыхай.» Что ты ответишь?',
      tiles: { answer: ['Спасибо', 'друг'], distractors: ['нет', 'парк'] },
      options: [
        { text: 'Спасибо, друг.', correct: true },
        { text: 'Сколько стоит?', correct: false },
        { text: 'Во сколько?', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'ru-a1-evening',
    language: 'russian', level: 1,
    scenario: { title: 'Вечер дома', en: 'A friend asks about your evening at home.' },
    targetWords: ['вечер', 'дома', 'чай', 'мама', 'вкусный', 'делать'],
    messages: [
      { from: 'them', name: 'Аня', text: 'Что ты делаешь вечером?' },
      { from: 'me', name: 'Я', text: 'Я дома. Пью чай.' },
      { from: 'them', name: 'Аня', text: 'С мамой?' },
      { from: 'me', name: 'Я', text: 'Да. Чай вкусный.' },
      { from: 'them', name: 'Аня', text: 'Хорошо. Приятного вечера!' },
    ],
    pinyin: [
      'Chto ty delayesh vecherom?',
      'Ya doma. Pyu chay.',
      'S mamoy?',
      'Da. Chay vkusnyy.',
      'Khorosho. Priyatnogo vechera!',
    ],
    translations: [
      'What are you doing this evening?',
      "I'm at home. Drinking tea.",
      'With your mom?',
      'Yes. The tea is tasty.',
      'Okay. Have a nice evening!',
    ],
    glossary: {
      'Аня': { reading: 'Anya', meaning: 'Anya (a name)' },
      'что': { reading: 'chto', meaning: 'what' }, 'ты': { reading: 'ty', meaning: 'you' },
      'делаешь': { reading: 'delayesh', meaning: 'you do / are doing' }, 'вечером': { reading: 'vecherom', meaning: 'in the evening' },
      'я': { reading: 'ya', meaning: 'I' }, 'дома': { reading: 'doma', meaning: 'at home' },
      'пью': { reading: 'pyu', meaning: 'I drink' }, 'чай': { reading: 'chay', meaning: 'tea' },
      'с': { reading: 's', meaning: 'with' }, 'мамой': { reading: 'mamoy', meaning: 'with mom' },
      'да': { reading: 'da', meaning: 'yes' }, 'вкусный': { reading: 'vkusnyy', meaning: 'tasty' },
      'хорошо': { reading: 'khorosho', meaning: 'good, okay' }, 'приятного': { reading: 'priyatnogo', meaning: 'pleasant' },
      'вечера': { reading: 'vechera', meaning: 'evening (of)' },
    },
    comprehensionQuestions: [
      { question: 'Что я делаю вечером?', options: ['Пью чай', 'Иду в парк', 'Работаю'], answer: 0 },
      { question: 'С кем я дома?', options: ['С мамой', 'С другом', 'Один'], answer: 0 },
      { question: 'Какой чай?', options: ['Вкусный', 'Плохой', 'Дорогой'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'Аня написала: «Приятного вечера!» Что ты ответишь?',
      tiles: { answer: ['Спасибо', 'тебе'], distractors: ['нет', 'парк'] },
      options: [
        { text: 'Спасибо тебе.', correct: true },
        { text: 'Я не дома.', correct: false },
        { text: 'Сколько стоит?', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

// ── Chinese HSK 2 mission bank ───────────────────────────────────────────────
const CN_HSK2 = [
  {
    id: 'cn-hsk2-birthday',
    language: 'chinese', level: 2,
    scenario: { title: '生日礼物', en: "A friend asks what to get for another friend's birthday." },
    targetWords: ['明天', '生日', '送', '一起', '商场', '手表'],
    messages: [
      { from: 'them', name: '小明', text: '明天是小红的生日。' },
      { from: 'me', name: '我', text: '我们送她什么好？' },
      { from: 'them', name: '小明', text: '她喜欢手表。我们一起去商场吧。' },
      { from: 'me', name: '我', text: '好。商场里的手表贵吗？' },
      { from: 'them', name: '小明', text: '不太贵。我们下午去。' },
    ],
    pinyin: [
      'Míngtiān shì Xiǎo Hóng de shēngrì.',
      'Wǒmen sòng tā shénme hǎo?',
      'Tā xǐhuan shǒubiǎo. Wǒmen yìqǐ qù shāngchǎng ba.',
      'Hǎo. Shāngchǎng lǐ de shǒubiǎo guì ma?',
      'Bú tài guì. Wǒmen xiàwǔ qù.',
    ],
    translations: [
      "Tomorrow is Xiao Hong's birthday.",
      'What should we give her?',
      "She likes watches. Let's go to the mall together.",
      'Okay. Are the watches at the mall expensive?',
      "Not too expensive. Let's go this afternoon.",
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
      '小红': { reading: 'Xiǎo Hóng', meaning: 'Xiao Hong (a name)' },
      '手表': { reading: 'shǒubiǎo', meaning: 'watch' },
      '商场': { reading: 'shāngchǎng', meaning: 'shopping mall' },
    },
    comprehensionQuestions: [
      { question: '明天是谁的生日？', options: ['小红', '小明', '老师'], answer: 0 },
      { question: '他们想买什么？', options: ['手表', '衣服', '水果'], answer: 0 },
      { question: '他们什么时候去？', options: ['下午', '上午', '晚上'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明说下午去商场。你怎么回答？',
      tiles: { answer: ['好', '，', '一起', '去', '吧'], distractors: ['不', '手表'] },
      options: [
        { text: '好，一起去吧！', pinyin: 'Hǎo, yìqǐ qù ba!', correct: true },
        { text: '我不想买。', pinyin: 'Wǒ bù xiǎng mǎi.', correct: false },
        { text: '手表很贵。', pinyin: 'Shǒubiǎo hěn guì.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'cn-hsk2-sick',
    language: 'chinese', level: 2,
    scenario: { title: '不舒服', en: 'A friend notices you look unwell.' },
    targetWords: ['今天', '身体', '舒服', '疼', '休息', '药店'],
    messages: [
      { from: 'them', name: '小明', text: '你今天怎么了？' },
      { from: 'me', name: '我', text: '我身体不舒服，头很疼。' },
      { from: 'them', name: '小明', text: '你去药店买药了吗？' },
      { from: 'me', name: '我', text: '还没有。我想先休息一下。' },
      { from: 'them', name: '小明', text: '好。多喝水，早点休息。' },
    ],
    pinyin: [
      'Nǐ jīntiān zěnme le?',
      'Wǒ shēntǐ bù shūfu, tóu hěn téng.',
      'Nǐ qù yàodiàn mǎi yào le ma?',
      'Hái méiyǒu. Wǒ xiǎng xiān xiūxi yíxià.',
      'Hǎo. Duō hē shuǐ, zǎodiǎn xiūxi.',
    ],
    translations: [
      "What's wrong today?",
      "I don't feel well, my head hurts.",
      'Did you go to the pharmacy to buy medicine?',
      'Not yet. I want to rest a bit first.',
      'Okay. Drink lots of water and rest early.',
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
      '舒服': { reading: 'shūfu', meaning: 'comfortable' },
      '疼': { reading: 'téng', meaning: 'painful, sore' },
      '药店': { reading: 'yàodiàn', meaning: 'pharmacy' },
    },
    comprehensionQuestions: [
      { question: '我今天怎么了？', options: ['身体不舒服', '很高兴', '很忙'], answer: 0 },
      { question: '我哪里疼？', options: ['头', '手', '脚'], answer: 0 },
      { question: '小明让我做什么？', options: ['多喝水，休息', '去学校', '买手表'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明让你多休息。你怎么回答？',
      tiles: { answer: ['谢谢', '你'], distractors: ['药店', '疼'] },
      options: [
        { text: '谢谢你。', pinyin: 'Xièxie nǐ.', correct: true },
        { text: '我很快乐。', pinyin: 'Wǒ hěn kuàilè.', correct: false },
        { text: '一起去吧。', pinyin: 'Yìqǐ qù ba.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'cn-hsk2-sports',
    language: 'chinese', level: 2,
    scenario: { title: '一起运动', en: 'A friend invites you to play soccer.' },
    targetWords: ['下午', '踢', '足球', '运动', '跑步', '一起'],
    messages: [
      { from: 'them', name: '小明', text: '下午我们去踢足球吧。' },
      { from: 'me', name: '我', text: '好啊！我最喜欢运动。' },
      { from: 'them', name: '小明', text: '你常常跑步吗？' },
      { from: 'me', name: '我', text: '对，我每天早上跑步。' },
      { from: 'them', name: '小明', text: '那我们一起玩吧。' },
    ],
    pinyin: [
      'Xiàwǔ wǒmen qù tī zúqiú ba.',
      'Hǎo a! Wǒ zuì xǐhuan yùndòng.',
      'Nǐ chángcháng pǎobù ma?',
      'Duì, wǒ měitiān zǎoshang pǎobù.',
      'Nà wǒmen yìqǐ wán ba.',
    ],
    translations: [
      "Let's go play soccer this afternoon.",
      'Sure! I love sports the most.',
      'Do you often go running?',
      'Yes, I run every morning.',
      "Then let's play together.",
    ],
    glossary: {
      '小明': { reading: 'Xiǎo Míng', meaning: 'Xiao Ming (a name)' },
      '踢': { reading: 'tī', meaning: 'to kick' },
      '足球': { reading: 'zúqiú', meaning: 'soccer' },
      '运动': { reading: 'yùndòng', meaning: 'sports, exercise' },
      '跑步': { reading: 'pǎobù', meaning: 'to run, jogging' },
    },
    comprehensionQuestions: [
      { question: '小明想做什么？', options: ['踢足球', '看书', '睡觉'], answer: 0 },
      { question: '我每天早上做什么？', options: ['跑步', '上课', '做饭'], answer: 0 },
      { question: '我最喜欢什么？', options: ['运动', '音乐', '画画'], answer: 0 },
    ],
    replyChallenge: {
      prompt: '小明约你下午踢足球。你怎么回答？',
      tiles: { answer: ['好', '，', '一起', '踢', '吧'], distractors: ['不', '足球'] },
      options: [
        { text: '好，一起踢吧！', pinyin: 'Hǎo, yìqǐ tī ba!', correct: true },
        { text: '我不喜欢运动。', pinyin: 'Wǒ bù xǐhuan yùndòng.', correct: false },
        { text: '我头很疼。', pinyin: 'Wǒ tóu hěn téng.', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

// ── Japanese JLPT N5 Part 2 mission bank (kana, LINE-style skin) ──────────────
const JP_N5B = [
  {
    id: 'jp-n5b-shopping',
    language: 'japanese', level: 2,
    scenario: { title: 'デパート', en: 'Planning to go shopping for shoes.' },
    targetWords: ['あした', 'デパート', 'くつ', 'かいたい', 'いっしょに', 'えき'],
    messages: [
      { from: 'them', name: 'はな', text: 'あした、デパートへ いきますか。' },
      { from: 'me', name: 'わたし', text: 'はい。くつを かいたいです。' },
      { from: 'them', name: 'はな', text: 'いいですね。わたしも いきたいです。' },
      { from: 'me', name: 'わたし', text: 'じゃあ、いっしょに いきましょう。' },
      { from: 'them', name: 'はな', text: 'なんじに えきで あいますか。' },
      { from: 'me', name: 'わたし', text: 'じゅうじに あいましょう。' },
    ],
    pinyin: [
      'Ashita, depāto e ikimasu ka.',
      'Hai. Kutsu o kaitai desu.',
      'Ii desu ne. Watashi mo ikitai desu.',
      'Jā, issho ni ikimashō.',
      'Nanji ni eki de aimasu ka.',
      'Jūji ni aimashō.',
    ],
    translations: [
      'Are you going to the department store tomorrow?',
      'Yes. I want to buy shoes.',
      'Nice. I want to go too.',
      "Then let's go together.",
      'What time shall we meet at the station?',
      "Let's meet at ten.",
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' },
      'あした': { reading: 'ashita', meaning: 'tomorrow' }, 'デパート': { reading: 'depāto', meaning: 'department store' },
      'いきます': { reading: 'ikimasu', meaning: 'to go' }, 'はい': { reading: 'hai', meaning: 'yes' },
      'くつ': { reading: 'kutsu', meaning: 'shoes' }, 'かいたい': { reading: 'kaitai', meaning: 'want to buy' },
      'いい': { reading: 'ii', meaning: 'good, nice' }, 'わたし': { reading: 'watashi', meaning: 'I, me' },
      'いきたい': { reading: 'ikitai', meaning: 'want to go' }, 'いっしょに': { reading: 'issho ni', meaning: 'together' },
      'なんじ': { reading: 'nanji', meaning: 'what time' }, 'えき': { reading: 'eki', meaning: 'station' },
      'あいます': { reading: 'aimasu', meaning: 'to meet' }, 'じゅうじ': { reading: 'jūji', meaning: 'ten o’clock' },
    },
    comprehensionQuestions: [
      { question: 'わたしは なにを かいますか。', options: ['くつ', 'ぼうし', 'かばん'], answer: 0 },
      { question: 'だれと いきますか。', options: ['はな', 'せんせい', 'ひとり'], answer: 0 },
      { question: 'どこで あいますか。', options: ['えき', 'デパート', 'がっこう'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「なんじに あいますか」と ききました。こたえて ください。',
      tiles: { answer: ['じゅうじに', 'あいましょう'], distractors: ['みず', 'たべます'] },
      options: [
        { text: 'じゅうじに あいましょう。', correct: true },
        { text: 'くるまが すきです。', correct: false },
        { text: 'いいえ、いきません。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
  {
    id: 'jp-n5b-ramen',
    language: 'japanese', level: 2,
    scenario: { title: 'さむい ひ', en: "It's cold — a friend suggests warm food." },
    targetWords: ['きょう', 'さむい', 'あたたかい', 'ラーメン', 'みせ', 'たべたい'],
    messages: [
      { from: 'them', name: 'はな', text: 'きょうは さむいですね。' },
      { from: 'me', name: 'わたし', text: 'はい。あたたかい ものが たべたいです。' },
      { from: 'them', name: 'はな', text: 'ラーメンは どうですか。' },
      { from: 'me', name: 'わたし', text: 'いいですね。たべに いきましょう。' },
      { from: 'them', name: 'はな', text: 'ちかくに おいしい みせが あります。' },
    ],
    pinyin: [
      'Kyō wa samui desu ne.',
      'Hai. Atatakai mono ga tabetai desu.',
      'Rāmen wa dō desu ka.',
      'Ii desu ne. Tabe ni ikimashō.',
      'Chikaku ni oishii mise ga arimasu.',
    ],
    translations: [
      "It's cold today, isn't it?",
      'Yes. I want to eat something warm.',
      'How about ramen?',
      "Sounds good. Let's go eat.",
      "There's a delicious place nearby.",
    ],
    glossary: {
      'はな': { reading: 'Hana', meaning: 'Hana (a name)' },
      'きょう': { reading: 'kyō', meaning: 'today' }, 'さむい': { reading: 'samui', meaning: 'cold' },
      'はい': { reading: 'hai', meaning: 'yes' }, 'あたたかい': { reading: 'atatakai', meaning: 'warm' },
      'もの': { reading: 'mono', meaning: 'thing' }, 'たべたい': { reading: 'tabetai', meaning: 'want to eat' },
      'ラーメン': { reading: 'rāmen', meaning: 'ramen' }, 'いい': { reading: 'ii', meaning: 'good, nice' },
      'たべに': { reading: 'tabe ni', meaning: 'to eat (purpose)' }, 'いきましょう': { reading: 'ikimashō', meaning: "let's go" },
      'ちかく': { reading: 'chikaku', meaning: 'nearby' }, 'おいしい': { reading: 'oishii', meaning: 'delicious' },
      'みせ': { reading: 'mise', meaning: 'shop, restaurant' }, 'あります': { reading: 'arimasu', meaning: 'there is' },
    },
    comprehensionQuestions: [
      { question: 'きょうの てんきは どうですか。', options: ['さむい', 'あつい', 'あめ'], answer: 0 },
      { question: 'なにを たべますか。', options: ['ラーメン', 'パン', 'すし'], answer: 0 },
      { question: 'おいしい みせは どこに ありますか。', options: ['ちかく', 'とおく', 'えき'], answer: 0 },
    ],
    replyChallenge: {
      prompt: 'はなが「ラーメンは どうですか」と ききました。こたえて ください。',
      tiles: { answer: ['たべに', 'いきましょう'], distractors: ['みず', 'ねます'] },
      options: [
        { text: 'たべに いきましょう。', correct: true },
        { text: 'いいえ、いきません。', correct: false },
        { text: 'くるまが ほしいです。', correct: false },
      ],
    },
    estimatedTime: '2',
  },
]

const BANK = {
  'chinese|1': CN_HSK1, 'chinese|2': CN_HSK2,
  'japanese|1': JP_N5, 'japanese|2': JP_N5B,
  'russian|1': RU_A1,
}

// Pick the mission that best reuses the words the learner actually met today.
// Overlap with today's learned/weak/review words wins; ties and the no-overlap
// case fall back to a stable rotation so repeat sessions vary. Returns null when
// no bank exists for this language/level yet (feature simply hides itself).
//
// `knownWords` (when provided) is a hard gate: a mission is eligible ONLY if
// every one of its target words is in the set — the chat reinforces what the
// learner knows, it never smuggles in unknown vocabulary. Callers should pass
// the set already alias-expanded (kanji + reading) — see missionOffer.js.
export function pickMission({ language, level, dayWords = [], knownWords = null, seed = 0 }) {
  const bank = BANK[language + '|' + level]
  if (!bank || bank.length === 0) return null
  const eligible = knownWords
    ? bank.filter(m => m.targetWords.every(w => knownWords.has(w)))
    : bank
  if (eligible.length === 0) return null
  const want = new Set(dayWords)
  let best = null, bestScore = -1
  eligible.forEach((m, i) => {
    const score = m.targetWords.reduce((n, w) => n + (want.has(w) ? 1 : 0), 0)
    // Rotation tie-breaker keeps it from always showing mission 0.
    const tie = (i + seed) % eligible.length
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
