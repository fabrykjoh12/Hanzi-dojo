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
