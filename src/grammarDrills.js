// Authored fill-in-the-blank drills for grammar spaced practice, keyed by
// language and grammar topic id (topic ids match src/grammarGuides.js). Each
// item blanks the pattern's own word out of a short example sentence and offers
// confusable grammar tokens as distractors — hand-picked, not random vocab, so a
// wrong answer is a real grammar slip.
//
// Item shape: { sentence, blank, reading, en, options }
//   sentence : example with the blank marked '__'
//   blank    : the correct token (must be one of `options`)
//   reading  : pinyin (Chinese) / kana (Japanese) / transliteration (Russian)
//   en       : English translation (shown as scaffold + to disambiguate)
//   options  : 3–4 confusable tokens, one of which is `blank`
//
// Only topics listed here are enrollable for review; abstract topics (pure word
// order, alphabet, gender…) have no single confusable token and are omitted.

export const GRAMMAR_DRILLS = {
  chinese: {
    'measure-words': [
      { sentence: '一__人', blank: '个', reading: 'yí ge rén', en: 'one person', options: ['个', '本', '杯', '只'] },
      { sentence: '三__书', blank: '本', reading: 'sān běn shū', en: 'three books', options: ['本', '个', '张', '杯'] },
    ],
    'shi-vs-adjectives': [
      { sentence: '她__高。', blank: '很', reading: 'tā hěn gāo', en: 'She is tall.', options: ['是', '很', '的', '了'] },
      { sentence: '她__老师。', blank: '是', reading: 'tā shì lǎoshī', en: 'She is a teacher.', options: ['是', '很', '的', '在'] },
    ],
    'de-possession': [
      { sentence: '我__书', blank: '的', reading: 'wǒ de shū', en: 'my book', options: ['的', '了', '得', '地'] },
    ],
    questions: [
      { sentence: '你好__？', blank: '吗', reading: 'nǐ hǎo ma', en: 'How are you?', options: ['吗', '呢', '吧', '了'] },
    ],
    negation: [
      { sentence: '我__喝咖啡。', blank: '不', reading: 'wǒ bù hē kāfēi', en: 'I don’t drink coffee.', options: ['不', '没', '别', '无'] },
      { sentence: '我__吃饭。', blank: '没', reading: 'wǒ méi chī fàn', en: 'I didn’t eat.', options: ['没', '不', '别', '要'] },
    ],
    le: [
      { sentence: '我吃__。', blank: '了', reading: 'wǒ chī le', en: 'I’ve eaten.', options: ['了', '过', '着', '的'] },
    ],
    'you-have': [
      { sentence: '我__一只猫。', blank: '有', reading: 'wǒ yǒu yì zhī māo', en: 'I have a cat.', options: ['有', '是', '在', '和'] },
    ],
    'zai-location': [
      { sentence: '他__家。', blank: '在', reading: 'tā zài jiā', en: 'He is at home.', options: ['在', '是', '有', '到'] },
    ],
    comparison: [
      { sentence: '他__我高。', blank: '比', reading: 'tā bǐ wǒ gāo', en: 'He is taller than me.', options: ['比', '和', '跟', '是'] },
    ],
    zhengzai: [
      { sentence: '他在睡觉__。', blank: '呢', reading: 'tā zài shuì jiào ne', en: 'He’s sleeping right now.', options: ['呢', '吗', '吧', '了'] },
    ],
    'ba-numbers': [
      { sentence: '今天是五月三__。', blank: '号', reading: 'jīntiān shì wǔ yuè sān hào', en: 'Today is May 3rd.', options: ['号', '点', '月', '年'] },
      { sentence: '现在三__。', blank: '点', reading: 'xiànzài sān diǎn', en: 'It’s three o’clock.', options: ['点', '号', '分', '月'] },
    ],
  },

  japanese: {
    particles: [
      { sentence: '私__学生です。', blank: 'は', reading: 'わたしは がくせいです', en: 'I am a student.', options: ['は', 'を', 'の', 'で'] },
      { sentence: '電車__行きます。', blank: 'で', reading: 'でんしゃで いきます', en: 'I go by train.', options: ['で', 'は', 'を', 'に'] },
      { sentence: 'これは私__本です。', blank: 'の', reading: 'これは わたしの ほんです', en: 'This is my book.', options: ['の', 'は', 'を', 'に'] },
    ],
    politeness: [
      { sentence: 'これは水__。', blank: 'です', reading: 'これは みずです', en: 'This is water.', options: ['です', 'ます', 'ました', 'たい'] },
    ],
    'ka-questions': [
      { sentence: '学生です__。', blank: 'か', reading: 'がくせいですか', en: 'Are you a student?', options: ['か', 'ね', 'よ', 'の'] },
    ],
    adjectives: [
      { sentence: 'きれい__花', blank: 'な', reading: 'きれいな はな', en: 'a beautiful flower', options: ['な', 'い', 'の', 'だ'] },
    ],
    'negatives-past': [
      { sentence: '肉を食べ__。', blank: 'ません', reading: 'にくを たべません', en: 'I don’t eat meat.', options: ['ません', 'ます', 'ました', 'たい'] },
    ],
    'tai-want': [
      { sentence: '寿司を食べ__です。', blank: 'たい', reading: 'すしを たべたいです', en: 'I want to eat sushi.', options: ['たい', 'ます', 'ました', 'ません'] },
    ],
    'arimasu-imasu': [
      { sentence: '犬が__。', blank: 'います', reading: 'いぬが います', en: 'There is a dog.', options: ['います', 'あります', 'です', 'します'] },
      { sentence: '机の上に本が__。', blank: 'あります', reading: 'つくえの うえに ほんが あります', en: 'There is a book on the desk.', options: ['あります', 'います', 'です', 'したい'] },
    ],
    'mo-also': [
      { sentence: '私__学生です。', blank: 'も', reading: 'わたしも がくせいです', en: 'I am a student too.', options: ['も', 'は', 'が', 'を'] },
    ],
    'te-kudasai': [
      { sentence: '見て__。', blank: 'ください', reading: 'みてください', en: 'Please look.', options: ['ください', 'ます', 'たい', 'です'] },
    ],
    'kara-made': [
      { sentence: '九時__五時まで働きます。', blank: 'から', reading: 'くじから ごじまで はたらきます', en: 'I work from 9 to 5.', options: ['から', 'まで', 'に', 'で'] },
    ],
    suki: [
      { sentence: '音楽__好きです。', blank: 'が', reading: 'おんがくが すきです', en: 'I like music.', options: ['が', 'を', 'は', 'に'] },
    ],
    counters: [
      { sentence: '本を三__', blank: '冊', reading: 'ほんを さんさつ', en: 'three books', options: ['冊', '人', '枚', '匹'] },
    ],
  },

  russian: {
    cases: [
      { sentence: 'Я читаю __.', blank: 'книгу', reading: 'Ya chitayu knigu.', en: 'I read a book.', options: ['книгу', 'книга', 'книги', 'книге'] },
    ],
    'verb-conjugation': [
      { sentence: 'Ты __ по-русски.', blank: 'говоришь', reading: 'Ty govorish po-russki.', en: 'You speak Russian.', options: ['говоришь', 'говорю', 'говорит', 'говорят'] },
    ],
    pronouns: [
      { sentence: '__ говорите по-английски?', blank: 'Вы', reading: 'Vy govorite po-angliyski?', en: 'Do you (formal) speak English?', options: ['Вы', 'Ты', 'Он', 'Мы'] },
    ],
    'u-menya': [
      { sentence: 'У меня __ кот.', blank: 'есть', reading: 'U menya yest kot.', en: 'I have a cat.', options: ['есть', 'нет', 'был', 'быть'] },
    ],
    'past-tense': [
      { sentence: 'Она __ книгу.', blank: 'читала', reading: 'Ona chitala knigu.', en: 'She was reading a book.', options: ['читала', 'читал', 'читали', 'читает'] },
    ],
    aspect: [
      { sentence: 'Вчера я __ книгу.', blank: 'прочитал', reading: 'Vchera ya prochital knigu.', en: 'Yesterday I read (finished) the book.', options: ['прочитал', 'читал', 'читаю', 'читать'] },
    ],
    'questions-negation': [
      { sentence: 'Я __ знаю.', blank: 'не', reading: 'Ya ne znayu.', en: 'I don’t know.', options: ['не', 'нет', 'ни', 'на'] },
    ],
    motion: [
      { sentence: 'Я __ в школу пешком.', blank: 'иду', reading: 'Ya idu v shkolu peshkom.', en: 'I’m walking to school.', options: ['иду', 'еду', 'идёт', 'едет'] },
    ],
  },
}

// The drill items authored for a topic (empty array if none / not enrollable).
export function drillsFor(language, topicId) {
  const byLang = GRAMMAR_DRILLS[language]
  if (!byLang) return []
  return byLang[topicId] || []
}

// Is this topic enrollable for spaced review (does it have any drill items)?
export function hasDrills(language, topicId) {
  return drillsFor(language, topicId).length > 0
}
