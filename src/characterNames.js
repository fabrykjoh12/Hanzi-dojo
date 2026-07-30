// Curated PROPER NAMES used in the seeded stories, mapped to their reading.
// Used by the readers to make personal names tappable with a "Name" popup
// instead of mis-translating them character-by-character.
// Only real personal names belong here — role nouns (妈妈/服务员/姐姐/弟弟…) are
// ordinary vocabulary and must NOT be listed, or they'd be mislabeled "Name".
//
// This map is a floor, not the whole cast: `storyNamesFor` (storyReading.js)
// adds the names a story declares in its own speaker labels, so a story using
// a name nobody curated still reads as a name. Curated entries win, because
// they carry a reading and a derived name does not.
export const CHARACTER_READINGS = {
  chinese: {
    '李明': 'Lǐ Míng', '小花': 'Xiǎo Huā', '大力': 'Dà Lì',
    '小明': 'Xiǎo Míng', '小红': 'Xiǎo Hóng', '大毛': 'Dà Máo',
    '林雨晴': 'Lín Yǔqíng', '林小川': 'Lín Xiǎochuān', '小川': 'Xiǎochuān',
    // Historical figure, retold in the HSK 3 folk-tale season 司马光砸缸.
    '司马光': 'Sīmǎ Guāng',
    // The sea strand — one serial running HSK 1 → 2 → 3. None of these are
    // ordinary vocabulary at any of those levels, so they must be curated here
    // or the reader splits them character by character (小七 → "small" + "seven").
    '小七': 'Xiǎo Qī', '大风': 'Dà Fēng', '阿水': 'Ā Shuǐ',
    '老九': 'Lǎo Jiǔ', '阿力': 'Ā Lì',
    // The old building's caretaker (HSK 4 t1 五楼的灯). 老 is HSK 3 and 陈 is
    // in no level, so without this the reader reads him as "old" + a character
    // it cannot place.
    '老陈': 'Lǎo Chén',
    // The noodle shop, named on the page from HSK 3 t2 一个字 onward. 小李 is
    // what he calls 李明 — a real form of address, and not derivable from 李明.
    '老王': 'Lǎo Wáng', '小李': 'Xiǎo Lǐ', '小周': 'Xiǎo Zhōu',
    '阿山': 'Ā Shān', '大石': 'Dà Shí', '木青': 'Mù Qīng',
    '夜白': 'Yè Bái', '火三': 'Huǒ Sān', '张平': 'Zhāng Píng',
    '阿风': 'Ā Fēng',
    // Hanzi Dojo Stories — "The Inkbound" (HSK 1 manhua). 小雨 and 小白 are both
    // built from HSK 1 characters, so without an entry here the reader would
    // split them into 小 + 雨 ("small" + "rain") and 小 + 白. 林老师 is the
    // master's whole form of address — 老师 IS vocabulary, but "Teacher Lin" is
    // one name, and the name popup carries the reading the two parts don't.
    //
    // The ink spirit is 白 in the story bible and 小白 on the page: matchName
    // only takes candidates of two characters or more, so a one-character name
    // is unreachable by the reader — and 小白 is the natural way to say it.
    '小雨': 'Xiǎo Yǔ', '小白': 'Xiǎo Bái', '林老师': 'Lín lǎoshī',
    // Hanzi Dojo Stories — "The Rainy-Day Noodle Shop" (HSK 1 manhua, the
    // second drawn series). Same problem as above: 小美 would split into 小 +
    // 美 and 花花 into 花 + 花 ("flower flower"), which is a real reading and
    // exactly the wrong one for a cat's name. 妈妈 is deliberately NOT here —
    // it is ordinary HSK 1 vocabulary, so it resolves through the word lookup
    // and stays tappable as the word it is.
    '小美': 'Xiǎo Měi', '花花': 'Huā Huā',
  },
  // Japanese story protagonists (serial + legacy story sets). Role nouns
  // (おかあさん、おじいさん、せんせい…) are ordinary vocabulary and resolve
  // through the vocab lookup instead — do not list them here.
  japanese: { 'たかし': 'Takashi', 'はな': 'Hana', 'しろ': 'Shiro (the cat)' },
  // Russian story protagonists. Cyrillic names DECLINE (Иван → Ивана, Аня →
  // Ане), so the matcher resolves inflected forms back to these keys the same
  // way ordinary Russian vocabulary is resolved — see matchNameAt.
  russian: { 'Иван': 'Ivan', 'Аня': 'Anya', 'Маша': 'Masha', 'Саша': 'Sasha' },
}

// Curated PLACE NAMES (countries/cities) that recur across the story corpus.
// Unlike CHARACTER_READINGS, most of these ARE ordinary curriculum vocabulary
// too — they carry their own vocab card, reading and meaning like any other
// word — so a place is never routed through the name-lookup path (matchName
// only fires when a candidate ISN'T already in the vocab map). Places are
// flagged here purely so the reader can give them a distinct color; that
// color sits on top of the word's normal vocab/learning status, it doesn't
// replace it.
export const PLACE_WORDS = {
  chinese: new Set([
    '中国', '北京', '上海', '香港', '台湾', '广州', '深圳',
    '美国', '英国', '法国', '德国', '日本', '韩国', '俄罗斯', '澳大利亚', '加拿大', '纽约', '伦敦',
  ]),
  japanese: new Set([
    '日本', '東京', '大阪', '京都', '北海道', '沖縄',
    '中国', '韓国', 'アメリカ', 'フランス', 'イギリス', 'ドイツ', 'ロシア', 'ニューヨーク',
  ]),
  russian: new Set([
    'Россия', 'Москва', 'Санкт-Петербург',
    'Америка', 'Китай', 'Япония', 'Франция', 'Германия', 'Лондон',
  ]),
}
