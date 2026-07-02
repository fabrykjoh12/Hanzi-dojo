// Beginner grammar guides, one set per language. Kept as plain data so the
// Grammar screen just renders it.
//
// Topic shape:
//   id, title, blurb
//   pattern  (optional) — the formula, shown as a chip (e.g. 'A + 是 + B')
//   points   — [{ text, ex? }]
//     ex: { target, reading, en, segs? }
//       segs (Japanese only): [[text, reading|null], ...] — reading renders as
//       ruby ABOVE that segment; null segments (kana/punctuation) get no ruby.
//   find     (optional) — substrings; story lines containing any of them are
//              shown under the topic as real usage ("In your stories").
//   check    (optional) — self-check MCQs: [{ q, options: [...], correct: i }]
//
// reading = pinyin (Chinese) / kana (Japanese) / transliteration (Russian).

export const GRAMMAR = {
  chinese: {
    languageName: 'Chinese',
    intro: 'Chinese grammar is refreshingly logical: words never change their form. No conjugations, no plurals, no genders — meaning comes from word order and a handful of little helper words.',
    topics: [
      {
        id: 'word-order',
        title: 'Word order: Subject–Verb–Object',
        blurb: 'The basic sentence order is the same as English.',
        pattern: 'Subject + Verb + Object',
        points: [
          { text: 'Put the doer first, then the action, then the thing.', ex: { target: '我喝水。', reading: 'wǒ hē shuǐ', en: 'I drink water.' } },
          { text: 'Time and place come near the front, before the verb.', ex: { target: '我今天去学校。', reading: 'wǒ jīntiān qù xuéxiào', en: 'I go to school today.' } },
        ],
        find: ['我喝', '我吃', '我去'],
        check: [
          { q: 'Where does the time word 今天 (today) go?', options: ['At the very end', 'Before the verb', 'After the object', 'Anywhere at all'], correct: 1 },
          { q: 'Which is the correct order for "I drink tea"?', options: ['喝我茶', '我茶喝', '我喝茶', '茶喝我'], correct: 2 },
        ],
      },
      {
        id: 'no-conjugation',
        title: 'Verbs never change',
        blurb: 'One verb form covers every subject and every tense.',
        pattern: 'verb stays the same — time words do the work',
        points: [
          { text: '是 (to be) is the same for everyone — no am/is/are.', ex: { target: '我是学生。', reading: 'wǒ shì xuésheng', en: 'I am a student.' } },
          { text: 'Time is shown with words like 今天 (today) or 昨天 (yesterday), not by changing the verb.', ex: { target: '他昨天去。', reading: 'tā zuótiān qù', en: 'He went yesterday.' } },
        ],
        find: ['昨天', '今天', '明天'],
        check: [
          { q: 'How do you say "went" (past) in Chinese?', options: ['Change 去 to a past form', 'Add a time word like 昨天 and keep 去', 'Add -ed to the verb', 'Use a different verb entirely'], correct: 1 },
          { q: '是 changes depending on the subject (I/you/he).', options: ['True', 'False — it never changes', 'Only in questions', 'Only in the past'], correct: 1 },
        ],
      },
      {
        id: 'measure-words',
        title: 'Measure words',
        blurb: 'To count nouns you need a measure word between the number and the noun.',
        pattern: 'number + measure word + noun',
        points: [
          { text: '个 (ge) is the general, all-purpose measure word.', ex: { target: '一个人', reading: 'yí ge rén', en: 'one person' } },
          { text: 'Some nouns have their own: 本 for books, 杯 for cups.', ex: { target: '三本书', reading: 'sān běn shū', en: 'three books' } },
        ],
        find: ['一个', '两个', '三个', '一杯', '一本'],
        check: [
          { q: 'Which is correct for "two people"?', options: ['二人', '两个人', '两人个', '个两人'], correct: 1 },
          { q: 'The all-purpose measure word is…', options: ['本', '杯', '个', '张'], correct: 2 },
        ],
      },
      {
        id: 'shi-vs-adjectives',
        title: '是 for nouns, 很 for adjectives',
        blurb: 'Use 是 to link two nouns, but drop it before an adjective.',
        pattern: 'A + 是 + noun · A + 很 + adjective',
        points: [
          { text: 'Noun = noun uses 是.', ex: { target: '她是老师。', reading: 'tā shì lǎoshī', en: 'She is a teacher.' } },
          { text: 'With an adjective, use 很 (often just “glue”, not literally “very”).', ex: { target: '她很高。', reading: 'tā hěn gāo', en: 'She is tall.' } },
        ],
        find: ['很高兴', '很好', '很忙'],
        check: [
          { q: 'How do you say "He is busy"?', options: ['他是忙', '他很忙', '他忙是', '很他忙'], correct: 1 },
          { q: 'When do you need 是?', options: ['Before adjectives', 'Linking two nouns', 'Before every verb', 'Only in questions'], correct: 1 },
        ],
      },
      {
        id: 'de-possession',
        title: 'Possession with 的',
        blurb: '的 (de) works like apostrophe-s.',
        pattern: 'owner + 的 + thing',
        points: [
          { text: 'Owner + 的 + thing.', ex: { target: '我的书', reading: 'wǒ de shū', en: 'my book' } },
          { text: 'For close relationships you can drop it: 我妈妈 (my mum).', ex: { target: '我妈妈', reading: 'wǒ māma', en: 'my mum' } },
        ],
        find: ['我的', '你的', '他的', '她的'],
        check: [
          { q: '"Your cup" is…', options: ['你杯子的', '的你杯子', '你的杯子', '杯子你的'], correct: 2 },
          { q: 'When can 的 be dropped?', options: ['Never', 'With close relationships like family', 'Only in writing', 'After verbs'], correct: 1 },
        ],
      },
      {
        id: 'questions',
        title: 'Yes/no questions with 吗',
        blurb: 'Add 吗 to the end of a statement to make it a question.',
        pattern: 'statement + 吗？',
        points: [
          { text: 'Statement + 吗？', ex: { target: '你好吗？', reading: 'nǐ hǎo ma', en: 'How are you? (Are you well?)' } },
          { text: 'For “what/where/who”, put the question word where the answer goes — no reordering.', ex: { target: '你去哪里？', reading: 'nǐ qù nǎlǐ', en: 'Where are you going?' } },
        ],
        find: ['吗？', '什么', '哪里', '谁'],
        check: [
          { q: 'Turn 你喝茶 into a yes/no question:', options: ['吗你喝茶？', '你喝茶吗？', '你吗喝茶？', '喝你茶吗？'], correct: 1 },
          { q: 'In "what do you eat?", where does 什么 (what) go?', options: ['At the start, like English', 'Where the answer would go: 你吃什么？', 'Always at the very end after 吗', 'Before the subject'], correct: 1 },
        ],
      },
      {
        id: 'negation',
        title: 'Negation: 不 and 没',
        blurb: 'Two negatives, used in different situations.',
        pattern: '不 + verb (present/future) · 没 + verb (past)',
        points: [
          { text: '不 (bù) negates the present and future, and habits.', ex: { target: '我不喝咖啡。', reading: 'wǒ bù hē kāfēi', en: 'I don’t drink coffee.' } },
          { text: '没 (méi) negates the past and the verb 有 (to have).', ex: { target: '我没吃饭。', reading: 'wǒ méi chī fàn', en: 'I didn’t eat.' } },
        ],
        find: ['不是', '不去', '没有'],
        check: [
          { q: '"I don’t have money" uses…', options: ['不有', '没有', '不没', '有不'], correct: 1 },
          { q: 'Which negates a habit like "I don’t drink coffee"?', options: ['没', '不', 'Either, no difference', '了'], correct: 1 },
        ],
      },
      {
        id: 'le',
        title: '了 for completed actions',
        blurb: '了 (le) signals that something happened or changed.',
        pattern: 'verb + 了 · sentence + 了',
        points: [
          { text: 'Put 了 after the verb to mark a completed action.', ex: { target: '我吃了。', reading: 'wǒ chī le', en: 'I’ve eaten.' } },
          { text: 'At the end of a sentence it can mean a new situation.', ex: { target: '下雨了。', reading: 'xià yǔ le', en: 'It’s raining now.' } },
        ],
        find: ['了。', '了！'],
        check: [
          { q: '了 after a verb means…', options: ['Future intention', 'The action is completed', 'A question', 'Politeness'], correct: 1 },
          { q: '下雨了 means…', options: ['It will rain someday', 'It’s raining now (new situation)', 'It never rains', 'Is it raining?'], correct: 1 },
        ],
      },
      {
        id: 'you-have',
        title: '有: to have, there is',
        blurb: 'One verb covers possession and existence.',
        pattern: 'A + 有 + B · place + 有 + thing',
        points: [
          { text: 'For possession: subject + 有 + thing.', ex: { target: '我有一只猫。', reading: 'wǒ yǒu yì zhī māo', en: 'I have a cat.' } },
          { text: 'For existence: place + 有 + thing (“there is”).', ex: { target: '家里有人。', reading: 'jiā lǐ yǒu rén', en: 'There is someone at home.' } },
        ],
        find: ['我有', '有一个', '有人'],
        check: [
          { q: 'How do you negate 有?', options: ['不有', '没有', '有不', '无有'], correct: 1 },
          { q: '桌子上有书 means…', options: ['The book is a table', 'There is a book on the table', 'I have a table', 'Where is the book?'], correct: 1 },
        ],
      },
      {
        id: 'zai-location',
        title: '在: at / in / located',
        blurb: '在 marks where something is or where an action happens.',
        pattern: 'A + 在 + place (+ verb)',
        points: [
          { text: 'To say where something is: subject + 在 + place.', ex: { target: '他在家。', reading: 'tā zài jiā', en: 'He is at home.' } },
          { text: 'To say where an action happens, 在 + place comes BEFORE the verb.', ex: { target: '我在学校学习。', reading: 'wǒ zài xuéxiào xuéxí', en: 'I study at school.' } },
        ],
        find: ['在家', '在学校', '在哪'],
        check: [
          { q: '"I work in Beijing" is…', options: ['我工作在北京', '我在北京工作', '在我北京工作', '北京工作我在'], correct: 1 },
          { q: '在 + place goes ___ the verb.', options: ['after', 'before', 'instead of', 'nowhere near'], correct: 1 },
        ],
      },
      {
        id: 'want-can',
        title: 'Want and can: 想 / 要 / 会 / 能',
        blurb: 'Four helper verbs that go in front of the main verb.',
        pattern: '想 / 要 / 会 / 能 + verb',
        points: [
          { text: '想 = would like to (soft), 要 = want to / going to (firm).', ex: { target: '我想喝茶。', reading: 'wǒ xiǎng hē chá', en: 'I’d like to drink tea.' } },
          { text: '会 = can (learned skill), 能 = can (possibility/permission).', ex: { target: '我会说中文。', reading: 'wǒ huì shuō zhōngwén', en: 'I can speak Chinese.' } },
        ],
        find: ['我想', '我要', '我会', '我能'],
        check: [
          { q: '"I can swim (I learned it)" uses…', options: ['能', '会', '要', '想'], correct: 1 },
          { q: 'The softer "would like to" is…', options: ['要', '想', '会', '在'], correct: 1 },
        ],
      },
      {
        id: 'comparison',
        title: 'Comparisons with 比',
        blurb: '比 (bǐ) puts two things side by side.',
        pattern: 'A + 比 + B + adjective',
        points: [
          { text: 'A 比 B + adjective = A is more … than B. No 很 here.', ex: { target: '他比我高。', reading: 'tā bǐ wǒ gāo', en: 'He is taller than me.' } },
          { text: 'To say “much more”, add 多了 at the end.', ex: { target: '今天比昨天冷多了。', reading: 'jīntiān bǐ zuótiān lěng duō le', en: 'Today is much colder than yesterday.' } },
        ],
        find: ['比我', '比他', '比昨天'],
        check: [
          { q: '"Tea is cheaper than coffee" is…', options: ['茶比咖啡便宜', '茶咖啡比便宜', '比茶咖啡便宜', '茶便宜比咖啡'], correct: 0 },
          { q: 'In a 比 sentence, do you use 很 before the adjective?', options: ['Yes, always', 'No', 'Only for people', 'Only in questions'], correct: 1 },
        ],
      },
      {
        id: 'zhengzai',
        title: 'Right now: 在 + verb',
        blurb: 'The simple way to say an action is happening now.',
        pattern: 'subject + 在 + verb (+ 呢)',
        points: [
          { text: '在 before the verb = "-ing".', ex: { target: '我在吃饭。', reading: 'wǒ zài chī fàn', en: 'I am eating.' } },
          { text: 'Add 呢 at the end for a softer, conversational tone.', ex: { target: '他在睡觉呢。', reading: 'tā zài shuì jiào ne', en: 'He’s sleeping (right now).' } },
        ],
        find: ['在吃', '在看', '在做', '呢。'],
        check: [
          { q: '"She is reading" is…', options: ['她在看书', '她看书在', '在她看书', '她书在看'], correct: 0 },
          { q: 'The 在 of "-ing" goes…', options: ['after the verb', 'before the verb', 'at the end', 'before the subject'], correct: 1 },
        ],
      },
      {
        id: 'ba-numbers',
        title: 'Dates, times, and 号',
        blurb: 'Big-to-small: year, month, day, hour.',
        pattern: 'year 年 + month 月 + day 号 + time',
        points: [
          { text: 'Chinese always orders time from big to small.', ex: { target: '今天是五月三号。', reading: 'jīntiān shì wǔ yuè sān hào', en: 'Today is May 3rd.' } },
          { text: 'Clock time: number + 点.', ex: { target: '现在三点。', reading: 'xiànzài sān diǎn', en: 'It’s three o’clock.' } },
        ],
        find: ['点', '月', '号', '星期'],
        check: [
          { q: 'Which order is correct?', options: ['Day, month, year', 'Month, day, year', 'Year, month, day', 'Any order'], correct: 2 },
          { q: '"Five o’clock" is…', options: ['五号', '五点', '五月', '五年'], correct: 1 },
        ],
      },
    ],
  },

  japanese: {
    languageName: 'Japanese',
    intro: 'Japanese builds sentences back-to-front compared with English: the verb comes last, and small “particles” tag each word with its job. Learn the particles and the rest falls into place.',
    topics: [
      {
        id: 'word-order',
        title: 'Word order: verb goes last',
        blurb: 'Japanese is Subject–Object–Verb. The action ends the sentence.',
        pattern: 'topic は + object を + verb',
        points: [
          { text: 'Topic first, object next, verb last.', ex: { target: '私はりんごを食べます。', reading: 'わたしは りんごを たべます', en: 'I eat an apple.', segs: [['私', 'わたし'], ['はりんごを', null], ['食', 'た'], ['べます。', null]] } },
          { text: 'As long as the particles are right, word order is flexible — but the verb still comes last.' },
        ],
        find: ['ます。', 'です。'],
        check: [
          { q: 'Where does the verb go?', options: ['First', 'Second', 'Last', 'Anywhere'], correct: 2 },
          { q: 'Which is correct for "I drink water"?', options: ['飲みます私は水を', '私は水を飲みます', '水を私は飲みへ', '私は飲みます水を'], correct: 1 },
        ],
      },
      {
        id: 'particles',
        title: 'Particles: the little tags',
        blurb: 'Particles come after a word to show its role.',
        pattern: 'word + は / が / を / に / で / の',
        points: [
          { text: 'は (wa) marks the topic; が (ga) marks the subject.', ex: { target: '私は学生です。', reading: 'わたしは がくせいです', en: 'I am a student.', segs: [['私', 'わたし'], ['は', null], ['学生', 'がくせい'], ['です。', null]] } },
          { text: 'を (o) marks the object; に (ni) = to/at a time or place; で (de) = by means of / at a place of action.', ex: { target: '電車で行きます。', reading: 'でんしゃで いきます', en: 'I go by train.', segs: [['電車', 'でんしゃ'], ['で', null], ['行', 'い'], ['きます。', null]] } },
          { text: 'の (no) links nouns like “of / ’s”.', ex: { target: '私の本', reading: 'わたしの ほん', en: 'my book', segs: [['私', 'わたし'], ['の', null], ['本', 'ほん']] } },
        ],
        find: ['は', 'を', 'で'],
        check: [
          { q: 'Which particle marks the direct object?', options: ['は', 'を', 'の', 'で'], correct: 1 },
          { q: '"My book" is…', options: ['本の私', '私の本', '私本の', 'の私本'], correct: 1 },
        ],
      },
      {
        id: 'politeness',
        title: 'です / ます politeness',
        blurb: 'The polite forms you should learn first.',
        pattern: 'noun/adjective + です · verb-stem + ます',
        points: [
          { text: 'です (desu) politely ends noun and adjective sentences.', ex: { target: 'これは水です。', reading: 'これは みずです', en: 'This is water.', segs: [['これは', null], ['水', 'みず'], ['です。', null]] } },
          { text: 'ます (masu) is the polite verb ending.', ex: { target: '毎日勉強します。', reading: 'まいにち べんきょうします', en: 'I study every day.', segs: [['毎日', 'まいにち'], ['勉強', 'べんきょう'], ['します。', null]] } },
        ],
        find: ['です', 'ます'],
        check: [
          { q: 'The polite ending for verbs is…', options: ['です', 'ます', 'の', 'か'], correct: 1 },
          { q: 'です attaches to…', options: ['Verbs only', 'Nouns and adjectives', 'Particles', 'Names only'], correct: 1 },
        ],
      },
      {
        id: 'ka-questions',
        title: 'Questions with か',
        blurb: 'Add か to the end — no word-order change, no question mark needed.',
        pattern: 'polite sentence + か',
        points: [
          { text: 'Any polite statement becomes a question with か.', ex: { target: '学生ですか。', reading: 'がくせいですか', en: 'Are you a student?', segs: [['学生', 'がくせい'], ['ですか。', null]] } },
          { text: 'Question words stay in place: 何 (what), どこ (where), 誰 (who).', ex: { target: '何を食べますか。', reading: 'なにを たべますか', en: 'What will you eat?', segs: [['何', 'なに'], ['を', null], ['食', 'た'], ['べますか。', null]] } },
        ],
        find: ['か。', 'ですか', 'ますか'],
        check: [
          { q: 'Turn 行きます into a question:', options: ['か行きます', '行きますか', '行きかます', '行きます？のみ'], correct: 1 },
          { q: 'Does the word order change in questions?', options: ['Yes, always', 'No — just add か', 'Only with 何', 'Only in writing'], correct: 1 },
        ],
      },
      {
        id: 'adjectives',
        title: 'Two kinds of adjectives',
        blurb: 'Japanese adjectives come in い-type and な-type.',
        pattern: 'い-adj + noun · な-adj + な + noun',
        points: [
          { text: 'い-adjectives end in い and attach directly.', ex: { target: '高い山', reading: 'たかい やま', en: 'a tall mountain', segs: [['高', 'たか'], ['い', null], ['山', 'やま']] } },
          { text: 'な-adjectives need な before a noun.', ex: { target: 'きれいな花', reading: 'きれいな はな', en: 'a beautiful flower', segs: [['きれいな', null], ['花', 'はな']] } },
        ],
        find: ['大きい', '小さい', 'きれい'],
        check: [
          { q: 'きれい needs ___ before a noun.', options: ['い', 'な', 'の', 'nothing'], correct: 1 },
          { q: '高い attaches to a noun…', options: ['with な', 'with の', 'directly', 'it can’t'], correct: 2 },
        ],
      },
      {
        id: 'negatives-past',
        title: 'Negative and past',
        blurb: 'Change the ending, not the whole word.',
        pattern: 'ます → ません → ました → ませんでした',
        points: [
          { text: 'ます → ません for polite negative.', ex: { target: '食べません。', reading: 'たべません', en: 'I don’t / won’t eat.', segs: [['食', 'た'], ['べません。', null]] } },
          { text: 'です → でした, ます → ました for the past.', ex: { target: '楽しかったです。', reading: 'たのしかったです', en: 'It was fun.', segs: [['楽', 'たの'], ['しかったです。', null]] } },
        ],
        find: ['ません', 'ました', 'でした'],
        check: [
          { q: 'The polite past of 行きます is…', options: ['行きません', '行きました', '行くでした', '行きますた'], correct: 1 },
          { q: '"I don’t drink" (polite) is…', options: ['飲みました', '飲みます', '飲みません', '飲むない'], correct: 2 },
        ],
      },
      {
        id: 'tai-want',
        title: 'Wanting with 〜たい',
        blurb: 'Swap ます for たい to say you want to do something.',
        pattern: 'verb-stem + たいです',
        points: [
          { text: '食べます → 食べたい (want to eat). Add です to keep it polite.', ex: { target: '寿司を食べたいです。', reading: 'すしを たべたいです', en: 'I want to eat sushi.', segs: [['寿司', 'すし'], ['を', null], ['食', 'た'], ['べたいです。', null]] } },
          { text: 'たい behaves like an い-adjective: 食べたくない = don’t want to eat.' },
        ],
        find: ['たいです', 'たい。'],
        check: [
          { q: '"I want to go" is…', options: ['行きたいです', '行きますたい', '行くたい', 'たい行きます'], correct: 0 },
          { q: 'たい conjugates like…', options: ['a noun', 'an い-adjective', 'a な-adjective', 'a particle'], correct: 1 },
        ],
      },
      {
        id: 'arimasu-imasu',
        title: 'あります / います: there is',
        blurb: 'Two “to exist” verbs — one for things, one for living beings.',
        pattern: 'place に + thing が + あります／います',
        points: [
          { text: 'あります for objects and plants.', ex: { target: '机の上に本があります。', reading: 'つくえの うえに ほんが あります', en: 'There is a book on the desk.', segs: [['机', 'つくえ'], ['の', null], ['上', 'うえ'], ['に', null], ['本', 'ほん'], ['があります。', null]] } },
          { text: 'います for people and animals.', ex: { target: '犬がいます。', reading: 'いぬが います', en: 'There is a dog.', segs: [['犬', 'いぬ'], ['がいます。', null]] } },
        ],
        find: ['あります', 'います'],
        check: [
          { q: 'For "there is a cat", use…', options: ['あります', 'います', 'です', 'します'], correct: 1 },
          { q: 'For "there is a chair", use…', options: ['います', 'あります', 'たいです', 'ですか'], correct: 1 },
        ],
      },
      {
        id: 'mo-also',
        title: 'も: also / too',
        blurb: 'Replace は or が with も to say “too”.',
        pattern: 'word + も (replaces は/が/を)',
        points: [
          { text: 'も REPLACES the particle rather than adding to it.', ex: { target: '私も学生です。', reading: 'わたしも がくせいです', en: 'I am a student too.', segs: [['私', 'わたし'], ['も', null], ['学生', 'がくせい'], ['です。', null]] } },
          { text: 'With を it also replaces: パンも食べます = I eat bread too.' },
        ],
        find: ['も'],
        check: [
          { q: '"He is also a teacher": 彼___先生です', options: ['はも', 'も', 'がも', 'をも'], correct: 1 },
          { q: 'も is used together with は (はも).', options: ['True', 'False — it replaces は', 'Only in questions', 'Only in the past'], correct: 1 },
        ],
      },
      {
        id: 'te-kudasai',
        title: 'Requests with 〜てください',
        blurb: 'The polite “please do …”.',
        pattern: 'verb て-form + ください',
        points: [
          { text: 'Take the て-form of the verb and add ください.', ex: { target: '見てください。', reading: 'みてください', en: 'Please look.', segs: [['見', 'み'], ['てください。', null]] } },
          { text: 'You’ll hear it constantly: 待ってください (please wait), 言ってください (please say it).', ex: { target: 'ゆっくり話してください。', reading: 'ゆっくり はなしてください', en: 'Please speak slowly.', segs: [['ゆっくり', null], ['話', 'はな'], ['してください。', null]] } },
        ],
        find: ['ください'],
        check: [
          { q: '"Please wait" is…', options: ['待ちますください', '待ってください', '待つください', 'ください待って'], correct: 1 },
          { q: 'ください follows the verb’s…', options: ['ます-form', 'dictionary form', 'て-form', 'ない-form'], correct: 2 },
        ],
      },
      {
        id: 'kara-made',
        title: 'から / まで: from / until',
        blurb: 'Two particles for ranges of time and space.',
        pattern: 'A から B まで',
        points: [
          { text: 'から = from, まで = until/to. They work for time and places.', ex: { target: '九時から五時まで働きます。', reading: 'くじから ごじまで はたらきます', en: 'I work from 9 to 5.', segs: [['九時', 'くじ'], ['から', null], ['五時', 'ごじ'], ['まで', null], ['働', 'はたら'], ['きます。', null]] } },
          { text: 'から after a sentence also means “because”: 高いから買いません (it’s expensive, so I won’t buy it).' },
        ],
        find: ['から', 'まで'],
        check: [
          { q: '"From Tokyo to Osaka" is…', options: ['東京まで大阪から', '東京から大阪まで', '東京にから大阪', '大阪から東京から'], correct: 1 },
          { q: 'Sentence + から can also mean…', options: ['maybe', 'because', 'never', 'want to'], correct: 1 },
        ],
      },
      {
        id: 'suki',
        title: 'Likes with 〜が好きです',
        blurb: 'What you like takes が, not を.',
        pattern: 'thing + が + 好きです',
        points: [
          { text: 'The liked thing is marked with が.', ex: { target: '私は音楽が好きです。', reading: 'わたしは おんがくが すきです', en: 'I like music.', segs: [['私', 'わたし'], ['は', null], ['音楽', 'おんがく'], ['が', null], ['好', 'す'], ['きです。', null]] } },
          { text: 'Same pattern for 上手 (good at) and 下手 (bad at).' },
        ],
        find: ['好き'],
        check: [
          { q: '"I like cats" is 猫___好きです', options: ['を', 'が', 'に', 'で'], correct: 1 },
          { q: '好き takes which particle for the liked thing?', options: ['を', 'が', 'へ', 'から'], correct: 1 },
        ],
      },
      {
        id: 'counters',
        title: 'Counting needs counters',
        blurb: 'Like Chinese, numbers pair with a counter word.',
        pattern: 'thing + を + number-counter',
        points: [
          { text: 'The counter depends on what you’re counting (flat things, long things, people…).', ex: { target: '本を三冊', reading: 'ほんを さんさつ', en: 'three books', segs: [['本', 'ほん'], ['を', null], ['三冊', 'さんさつ']] } },
          { text: 'People use 人 (nin): 一人 (hitori), 二人 (futari), 三人 (san-nin).' },
        ],
        find: ['一人', '二人', '三人'],
        check: [
          { q: '"Two people" is…', options: ['ににん', 'ふたり', 'にこ', 'にまい'], correct: 1 },
          { q: 'Counters change depending on…', options: ['the verb', 'what is being counted', 'politeness', 'the season'], correct: 1 },
        ],
      },
      {
        id: 'no-articles',
        title: 'No “a”, “the”, or plurals',
        blurb: 'Japanese leaves a lot to context.',
        pattern: 'context carries a/the/plural',
        points: [
          { text: 'There are no words for a/the, and nouns don’t change for plural.', ex: { target: '本を読みます。', reading: 'ほんを よみます', en: 'I read a book / books.', segs: [['本', 'ほん'], ['を', null], ['読', 'よ'], ['みます。', null]] } },
          { text: 'You can even drop the subject when it’s obvious.', ex: { target: '行きます。', reading: 'いきます', en: '(I’m) going.', segs: [['行', 'い'], ['きます。', null]] } },
        ],
        find: [],
        check: [
          { q: 'How do you say "the"?', options: ['は', 'が', 'There is no word for it', 'の'], correct: 2 },
          { q: 'Dropping the subject is…', options: ['Rude', 'Normal when it’s obvious', 'Only for children', 'Ungrammatical'], correct: 1 },
        ],
      },
    ],
  },

  russian: {
    languageName: 'Russian',
    intro: 'Russian shows who-does-what-to-whom by changing word endings (cases) rather than word order. There are no words for “a” or “the”, and every noun has a gender. It looks daunting but it’s very regular.',
    topics: [
      {
        id: 'alphabet',
        title: 'The Cyrillic alphabet',
        blurb: 'Learn the letters first — many are “false friends”.',
        points: [
          { text: 'Some letters look Latin but sound different: В = v, Н = n, Р = r, С = s.', ex: { target: 'ресторан', reading: 'restoran', en: 'restaurant' } },
          { text: 'Once you can sound out words, reading Russian gets much easier.', ex: { target: 'спорт', reading: 'sport', en: 'sport' } },
        ],
        check: [
          { q: 'The Cyrillic letter Н sounds like…', options: ['h', 'n', 'i', 'p'], correct: 1 },
          { q: 'The Cyrillic letter В sounds like…', options: ['b', 'v', 'w', 'f'], correct: 1 },
        ],
      },
      {
        id: 'gender',
        title: 'Every noun has a gender',
        blurb: 'Masculine, feminine, or neuter — usually visible from the ending.',
        pattern: 'consonant → m. · -а/-я → f. · -о/-е → n.',
        points: [
          { text: 'Ends in a consonant → masculine.', ex: { target: 'стол', reading: 'stol', en: 'table (m.)' } },
          { text: 'Ends in -а / -я → feminine; -о / -е → neuter.', ex: { target: 'книга', reading: 'kniga', en: 'book (f.)' } },
        ],
        find: ['книга', 'стол', 'окно'],
        check: [
          { q: 'окно (window) is…', options: ['masculine', 'feminine', 'neuter', 'plural'], correct: 2 },
          { q: 'A noun ending in a consonant is usually…', options: ['feminine', 'neuter', 'masculine', 'genderless'], correct: 2 },
        ],
      },
      {
        id: 'no-articles',
        title: 'No “a” or “the”, no present “to be”',
        blurb: 'Russian sentences are leaner than English ones.',
        pattern: 'Я студент = I (am a) student',
        points: [
          { text: 'The noun on its own covers “a”, “the”, or neither.', ex: { target: 'Это дом.', reading: 'Eto dom.', en: 'This is a/the house.' } },
          { text: 'The verb “to be” is usually dropped in the present.', ex: { target: 'Я студент.', reading: 'Ya student.', en: 'I am a student.' } },
        ],
        find: ['Это', 'это'],
        check: [
          { q: '"I am a doctor" is…', options: ['Я есть доктор', 'Я доктор', 'Я быть доктор', 'Доктор есть я'], correct: 1 },
          { q: 'Russian articles (a/the) are…', options: ['always required', 'optional', 'nonexistent', 'only for feminine nouns'], correct: 2 },
        ],
      },
      {
        id: 'cases',
        title: 'The six cases',
        blurb: 'Endings change to show a word’s job in the sentence.',
        pattern: 'книга → книгу (object)',
        points: [
          { text: 'Nominative = the subject; Accusative = the direct object.', ex: { target: 'Я читаю книгу.', reading: 'Ya chitayu knigu.', en: 'I read a book. (книга → книгу)' } },
          { text: 'Genitive = of/possession, Dative = to/for, Instrumental = with/by, Prepositional = about/in (after prepositions).' },
          { text: 'You don’t need them all at once — start with nominative and accusative.' },
        ],
        find: ['читаю', 'вижу'],
        check: [
          { q: 'In Я читаю книгу, why does книга become книгу?', options: ['It’s plural', 'It’s the direct object (accusative)', 'It’s a question', 'Typo'], correct: 1 },
          { q: 'The subject of a sentence is in the ___ case.', options: ['accusative', 'nominative', 'genitive', 'dative'], correct: 1 },
        ],
      },
      {
        id: 'verb-conjugation',
        title: 'Verbs conjugate by person',
        blurb: 'The ending changes for I / you / he depending on the subject.',
        pattern: 'я говорю · ты говоришь · он говорит',
        points: [
          { text: 'говорить (to speak): я говорю, ты говоришь, он говорит.', ex: { target: 'Я говорю по-русски.', reading: 'Ya govoryu po-russki.', en: 'I speak Russian.' } },
          { text: 'Because the ending shows the subject, the pronoun can sometimes be dropped.' },
        ],
        find: ['говор'],
        check: [
          { q: '"You (informal) speak" is ты…', options: ['говорю', 'говоришь', 'говорит', 'говорим'], correct: 1 },
          { q: 'Why can pronouns be dropped?', options: ['They’re rude', 'The verb ending already shows the person', 'Russian has no pronouns', 'Only in songs'], correct: 1 },
        ],
      },
      {
        id: 'pronouns',
        title: 'Personal pronouns',
        blurb: 'The core people words.',
        pattern: 'я · ты · он/она · мы · вы · они',
        points: [
          { text: 'я (I), ты (you, informal), он/она/оно (he/she/it), мы (we), вы (you, formal/plural), они (they).', ex: { target: 'Вы говорите по-английски?', reading: 'Vy govorite po-angliyski?', en: 'Do you speak English?' } },
        ],
        find: ['Я ', 'Ты ', 'Мы '],
        check: [
          { q: 'The polite/formal "you" is…', options: ['ты', 'вы', 'он', 'мы'], correct: 1 },
          { q: '"They" is…', options: ['мы', 'вы', 'они', 'оно'], correct: 2 },
        ],
      },
      {
        id: 'u-menya',
        title: 'Having: у меня есть',
        blurb: 'Russian says “by me there is” instead of “I have”.',
        pattern: 'у + person + есть + thing',
        points: [
          { text: 'у меня есть = I have; у тебя есть = you have.', ex: { target: 'У меня есть кот.', reading: 'U menya yest kot.', en: 'I have a cat.' } },
          { text: 'To negate: у меня нет + genitive.', ex: { target: 'У меня нет времени.', reading: 'U menya net vremeni.', en: 'I have no time.' } },
        ],
        find: ['У меня', 'у меня', 'есть'],
        check: [
          { q: '"I have a dog" is…', options: ['Я имею собака', 'У меня есть собака', 'Мне собака есть', 'Собака у есть меня'], correct: 1 },
          { q: 'The negative of у меня есть is…', options: ['у меня не есть', 'у меня нет', 'нет у есть', 'не меня'], correct: 1 },
        ],
      },
      {
        id: 'past-tense',
        title: 'Past tense: -л endings',
        blurb: 'The past agrees with gender, not person.',
        pattern: 'он читал · она читала · они читали',
        points: [
          { text: 'Drop -ть, add -л (m.), -ла (f.), -ло (n.), -ли (plural).', ex: { target: 'Она читала книгу.', reading: 'Ona chitala knigu.', en: 'She was reading a book.' } },
          { text: 'The same speaker uses different endings: a man says я читал, a woman says я читала.' },
        ],
        find: ['был', 'была', 'читал'],
        check: [
          { q: 'A woman saying "I read (past)" says…', options: ['я читал', 'я читала', 'я читали', 'я читать'], correct: 1 },
          { q: 'The past tense agrees with…', options: ['person (I/you/he)', 'gender and number', 'politeness', 'time of day'], correct: 1 },
        ],
      },
      {
        id: 'aspect',
        title: 'Verb aspect: two verbs for one idea',
        blurb: 'Most actions have an imperfective and a perfective verb.',
        pattern: 'читать (process) · прочитать (result)',
        points: [
          { text: 'Imperfective = ongoing/repeated; perfective = a single completed action.', ex: { target: 'Я читал / Я прочитал', reading: 'Ya chital / Ya prochital', en: 'I was reading / I read (finished)' } },
          { text: 'You learn the pair together as you meet each verb.' },
        ],
        check: [
          { q: '"I finished reading the book" wants the ___ verb.', options: ['imperfective', 'perfective', 'reflexive', 'future'], correct: 1 },
          { q: 'Repeated habits use the…', options: ['perfective', 'imperfective', 'either', 'infinitive only'], correct: 1 },
        ],
      },
      {
        id: 'questions-negation',
        title: 'Questions and negation',
        blurb: 'Simple to form — no helper verbs.',
        pattern: 'не + verb · intonation for questions',
        points: [
          { text: 'Yes/no questions use the same words, just intonation (or add ли).', ex: { target: 'Ты дома?', reading: 'Ty doma?', en: 'Are you home?' } },
          { text: 'Negate with не before the verb.', ex: { target: 'Я не знаю.', reading: 'Ya ne znayu.', en: 'I don’t know.' } },
        ],
        find: ['не ', '?'],
        check: [
          { q: '"I don’t understand" is…', options: ['Я понимаю не', 'Я не понимаю', 'Не я понимаю', 'Я нет понимаю'], correct: 1 },
          { q: 'Yes/no questions need a helper word like "do".', options: ['True', 'False — intonation is enough', 'Only in the past', 'Only with вы'], correct: 1 },
        ],
      },
      {
        id: 'plurals',
        title: 'Plurals: -ы / -и',
        blurb: 'Most nouns take -ы or -и in the plural.',
        pattern: 'стол → столы · книга → книги',
        points: [
          { text: 'Hard consonant → -ы; after к/г/х and soft consonants → -и.', ex: { target: 'книга → книги', reading: 'kniga → knigi', en: 'book → books' } },
          { text: 'Neuter -о → -а: окно → окна (window → windows).' },
        ],
        check: [
          { q: 'The plural of стол (table) is…', options: ['стола', 'столы', 'столи', 'столов'], correct: 1 },
          { q: 'After к, the plural ending is…', options: ['-ы', '-и', '-а', '-е'], correct: 1 },
        ],
      },
      {
        id: 'motion',
        title: 'Going: идти vs ехать',
        blurb: 'Russian splits “to go” by how you travel.',
        pattern: 'идти = on foot · ехать = by vehicle',
        points: [
          { text: 'идти for walking, ехать for any transport.', ex: { target: 'Я иду в школу.', reading: 'Ya idu v shkolu.', en: 'I’m walking to school.' } },
          { text: 'With transport: Я еду на работу (I’m going to work by vehicle).', ex: { target: 'Я еду на автобусе.', reading: 'Ya yedu na avtobuse.', en: 'I’m going by bus.' } },
        ],
        find: ['иду', 'еду', 'идёт'],
        check: [
          { q: 'Going somewhere by train uses…', options: ['идти', 'ехать', 'either', 'быть'], correct: 1 },
          { q: 'Я иду means I am going…', options: ['by car', 'on foot', 'by plane', 'nowhere'], correct: 1 },
        ],
      },
    ],
  },
}

export function grammarFor(language) {
  return GRAMMAR[language] || null
}
