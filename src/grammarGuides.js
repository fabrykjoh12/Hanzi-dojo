// Beginner grammar guides, one set per language. Kept as plain data so the
// Grammar screen just renders it. Each topic has a short blurb and concrete
// points; points can carry an example { target, reading, en }.
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
        points: [
          { text: 'Put the doer first, then the action, then the thing.', ex: { target: '我喝水。', reading: 'wǒ hē shuǐ', en: 'I drink water.' } },
          { text: 'Time and place come near the front, before the verb.', ex: { target: '我今天去学校。', reading: 'wǒ jīntiān qù xuéxiào', en: 'I go to school today.' } },
        ],
      },
      {
        id: 'no-conjugation',
        title: 'Verbs never change',
        blurb: 'One verb form covers every subject and every tense.',
        points: [
          { text: '是 (to be) is the same for everyone — no am/is/are.', ex: { target: '我是学生。', reading: 'wǒ shì xuésheng', en: 'I am a student.' } },
          { text: 'Time is shown with words like 今天 (today) or 昨天 (yesterday), not by changing the verb.', ex: { target: '他昨天去。', reading: 'tā zuótiān qù', en: 'He went yesterday.' } },
        ],
      },
      {
        id: 'measure-words',
        title: 'Measure words',
        blurb: 'To count nouns you need a measure word between the number and the noun.',
        points: [
          { text: '个 (ge) is the general, all-purpose measure word.', ex: { target: '一个人', reading: 'yí ge rén', en: 'one person' } },
          { text: 'Some nouns have their own: 本 for books, 杯 for cups.', ex: { target: '三本书', reading: 'sān běn shū', en: 'three books' } },
        ],
      },
      {
        id: 'shi-vs-adjectives',
        title: '是 for nouns, 很 for adjectives',
        blurb: 'Use 是 to link two nouns, but drop it before an adjective.',
        points: [
          { text: 'Noun = noun uses 是.', ex: { target: '她是老师。', reading: 'tā shì lǎoshī', en: 'She is a teacher.' } },
          { text: 'With an adjective, use 很 (often just “glue”, not literally “very”).', ex: { target: '她很高。', reading: 'tā hěn gāo', en: 'She is tall.' } },
        ],
      },
      {
        id: 'de-possession',
        title: 'Possession with 的',
        blurb: '的 (de) works like apostrophe-s.',
        points: [
          { text: 'Owner + 的 + thing.', ex: { target: '我的书', reading: 'wǒ de shū', en: 'my book' } },
          { text: 'For close relationships you can drop it: 我妈妈 (my mum).', ex: { target: '我妈妈', reading: 'wǒ māma', en: 'my mum' } },
        ],
      },
      {
        id: 'questions',
        title: 'Yes/no questions with 吗',
        blurb: 'Add 吗 to the end of a statement to make it a question.',
        points: [
          { text: 'Statement + 吗？', ex: { target: '你好吗？', reading: 'nǐ hǎo ma', en: 'How are you? (Are you well?)' } },
          { text: 'For “what/where/who”, put the question word where the answer goes — no reordering.', ex: { target: '你去哪里？', reading: 'nǐ qù nǎlǐ', en: 'Where are you going?' } },
        ],
      },
      {
        id: 'negation',
        title: 'Negation: 不 and 没',
        blurb: 'Two negatives, used in different situations.',
        points: [
          { text: '不 (bù) negates the present and future, and habits.', ex: { target: '我不喝咖啡。', reading: 'wǒ bù hē kāfēi', en: 'I don’t drink coffee.' } },
          { text: '没 (méi) negates the past and the verb 有 (to have).', ex: { target: '我没吃饭。', reading: 'wǒ méi chī fàn', en: 'I didn’t eat.' } },
        ],
      },
      {
        id: 'le',
        title: '了 for completed actions',
        blurb: '了 (le) signals that something happened or changed.',
        points: [
          { text: 'Put 了 after the verb to mark a completed action.', ex: { target: '我吃了。', reading: 'wǒ chī le', en: 'I’ve eaten.' } },
          { text: 'At the end of a sentence it can mean a new situation.', ex: { target: '下雨了。', reading: 'xià yǔ le', en: 'It’s raining now.' } },
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
        points: [
          { text: 'Topic first, object next, verb last.', ex: { target: '私はりんごを食べます。', reading: 'わたしは りんごを たべます', en: 'I eat an apple.' } },
          { text: 'As long as the particles are right, word order is flexible — but the verb still comes last.' },
        ],
      },
      {
        id: 'particles',
        title: 'Particles: the little tags',
        blurb: 'Particles come after a word to show its role.',
        points: [
          { text: 'は (wa) marks the topic; が (ga) marks the subject.', ex: { target: '私は学生です。', reading: 'わたしは がくせいです', en: 'I am a student.' } },
          { text: 'を (o) marks the object; に (ni) = to/at a time or place; で (de) = by means of / at a place of action.', ex: { target: '電車で行きます。', reading: 'でんしゃで いきます', en: 'I go by train.' } },
          { text: 'の (no) links nouns like “of / ’s”.', ex: { target: '私の本', reading: 'わたしの ほん', en: 'my book' } },
        ],
      },
      {
        id: 'politeness',
        title: 'です / ます politeness',
        blurb: 'The polite forms you should learn first.',
        points: [
          { text: 'です (desu) politely ends noun and adjective sentences.', ex: { target: 'これは水です。', reading: 'これは みずです', en: 'This is water.' } },
          { text: 'ます (masu) is the polite verb ending.', ex: { target: '毎日勉強します。', reading: 'まいにち べんきょうします', en: 'I study every day.' } },
        ],
      },
      {
        id: 'adjectives',
        title: 'Two kinds of adjectives',
        blurb: 'Japanese adjectives come in い-type and な-type.',
        points: [
          { text: 'い-adjectives end in い and attach directly.', ex: { target: '高い山', reading: 'たかい やま', en: 'a tall mountain' } },
          { text: 'な-adjectives need な before a noun.', ex: { target: 'きれいな花', reading: 'きれいな はな', en: 'a beautiful flower' } },
        ],
      },
      {
        id: 'negatives-past',
        title: 'Negative and past',
        blurb: 'Change the ending, not the whole word.',
        points: [
          { text: 'ます → ません for polite negative.', ex: { target: '食べません。', reading: 'たべません', en: 'I don’t / won’t eat.' } },
          { text: 'です → でした, ます → ました for the past.', ex: { target: '楽しかったです。', reading: 'たのしかったです', en: 'It was fun.' } },
        ],
      },
      {
        id: 'counters',
        title: 'Counting needs counters',
        blurb: 'Like Chinese, numbers pair with a counter word.',
        points: [
          { text: 'The counter depends on what you’re counting (flat things, long things, people…).', ex: { target: '本を三冊', reading: 'ほんを さんさつ', en: 'three books' } },
          { text: 'People use 人 (nin): 一人 (hitori), 二人 (futari), 三人 (san-nin).' },
        ],
      },
      {
        id: 'no-articles',
        title: 'No “a”, “the”, or plurals',
        blurb: 'Japanese leaves a lot to context.',
        points: [
          { text: 'There are no words for a/the, and nouns don’t change for plural.', ex: { target: '本を読みます。', reading: 'ほんを よみます', en: 'I read a book / books.' } },
          { text: 'You can even drop the subject when it’s obvious.', ex: { target: '行きます。', reading: 'いきます', en: '(I’m) going.' } },
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
      },
      {
        id: 'gender',
        title: 'Every noun has a gender',
        blurb: 'Masculine, feminine, or neuter — usually visible from the ending.',
        points: [
          { text: 'Ends in a consonant → masculine.', ex: { target: 'стол', reading: 'stol', en: 'table (m.)' } },
          { text: 'Ends in -а / -я → feminine; -о / -е → neuter.', ex: { target: 'книга', reading: 'kniga', en: 'book (f.)' } },
        ],
      },
      {
        id: 'no-articles',
        title: 'No “a” or “the”',
        blurb: 'Russian has no articles at all.',
        points: [
          { text: 'The noun on its own covers “a”, “the”, or neither.', ex: { target: 'Это дом.', reading: 'Eto dom.', en: 'This is a/the house.' } },
          { text: 'The verb “to be” is usually dropped in the present.', ex: { target: 'Я студент.', reading: 'Ya student.', en: 'I am a student.' } },
        ],
      },
      {
        id: 'cases',
        title: 'The six cases',
        blurb: 'Endings change to show a word’s job in the sentence.',
        points: [
          { text: 'Nominative = the subject; Accusative = the direct object.', ex: { target: 'Я читаю книгу.', reading: 'Ya chitayu knigu.', en: 'I read a book. (книга → книгу)' } },
          { text: 'Genitive = of/possession, Dative = to/for, Instrumental = with/by, Prepositional = about/in (after prepositions).' },
          { text: 'You don’t need them all at once — start with nominative and accusative.' },
        ],
      },
      {
        id: 'verb-conjugation',
        title: 'Verbs conjugate by person',
        blurb: 'The ending changes for I / you / he depending on the subject.',
        points: [
          { text: 'говорить (to speak): я говорю, ты говоришь, он говорит.', ex: { target: 'Я говорю по-русски.', reading: 'Ya govoryu po-russki.', en: 'I speak Russian.' } },
          { text: 'Because the ending shows the subject, the pronoun can sometimes be dropped.' },
        ],
      },
      {
        id: 'pronouns',
        title: 'Personal pronouns',
        blurb: 'The core people words.',
        points: [
          { text: 'я (I), ты (you, informal), он/она/оно (he/she/it), мы (we), вы (you, formal/plural), они (they).', ex: { target: 'Вы говорите по-английски?', reading: 'Vy govorite po-angliyski?', en: 'Do you speak English?' } },
        ],
      },
      {
        id: 'aspect',
        title: 'Verb aspect: two verbs for one idea',
        blurb: 'Most actions have an imperfective and a perfective verb.',
        points: [
          { text: 'Imperfective = ongoing/repeated; perfective = a single completed action.', ex: { target: 'Я читал / Я прочитал', reading: 'Ya chital / Ya prochital', en: 'I was reading / I read (finished)' } },
          { text: 'You learn the pair together as you meet each verb.' },
        ],
      },
      {
        id: 'questions-negation',
        title: 'Questions and negation',
        blurb: 'Simple to form — no helper verbs.',
        points: [
          { text: 'Yes/no questions use the same words, just intonation (or add ли).', ex: { target: 'Ты дома?', reading: 'Ty doma?', en: 'Are you home?' } },
          { text: 'Negate with не before the verb.', ex: { target: 'Я не знаю.', reading: 'Ya ne znayu.', en: 'I don’t know.' } },
        ],
      },
    ],
  },
}

export function grammarFor(language) {
  return GRAMMAR[language] || null
}
