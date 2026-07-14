// Built-in glossary for grammar/function words that are legitimately NOT in
// the vocabulary lists (particles, the copula, conjunction glue, conjugation
// fragments). Tapping one of these in the reader used to dead-end at
// "Grammar or a word beyond this level's list" — now it teaches the grammar.
//
// Deliberately curated and small: real function words a graded-reader line can
// contain, each with a reading and a one-line, learner-friendly gloss. This is
// NOT a dictionary — content words belong in the vocabulary table.

const JA = {
  // ── Particles ──────────────────────────────────────────────────────────
  は: { reading: 'wa', gloss: 'Topic marker — "as for …". Marks what the sentence is about.' },
  が: { reading: 'ga', gloss: 'Subject marker — points at who/what does or is something.' },
  を: { reading: 'o', gloss: 'Object marker — marks what the action is done to.' },
  に: { reading: 'ni', gloss: 'Direction / time / target particle — "to", "at", "in".' },
  へ: { reading: 'e', gloss: 'Direction particle — "toward". Similar to に for movement.' },
  で: { reading: 'de', gloss: 'Place or means particle — "at/in (a place)", "by/with (a tool)".' },
  と: { reading: 'to', gloss: '"And" (between nouns) / "with (someone)" / quotation marker.' },
  も: { reading: 'mo', gloss: '"Also / too". Replaces は or が.' },
  の: { reading: 'no', gloss: 'Possessive / connecting particle — "A の B" = "A’s B".' },
  や: { reading: 'ya', gloss: '"And (among others)" — a non-exhaustive list of nouns.' },
  か: { reading: 'ka', gloss: 'Question marker — turns the sentence into a question.' },
  ね: { reading: 'ne', gloss: 'Sentence ending — "right?", seeking agreement.' },
  よ: { reading: 'yo', gloss: 'Sentence ending — adds emphasis, "you know / I tell you".' },
  な: { reading: 'na', gloss: 'Sentence ending (casual emphasis), or the な of な-adjectives.' },
  から: { reading: 'kara', gloss: '"From …" after a noun; "because …" after a clause.' },
  まで: { reading: 'made', gloss: '"Until / as far as …".' },
  より: { reading: 'yori', gloss: '"Than …" — used in comparisons.' },
  だけ: { reading: 'dake', gloss: '"Only / just".' },
  くらい: { reading: 'kurai', gloss: '"About / approximately".' },
  ぐらい: { reading: 'gurai', gloss: '"About / approximately".' },
  ながら: { reading: 'nagara', gloss: '"While doing …" — two actions at once.' },
  けど: { reading: 'kedo', gloss: '"But / though" (casual).' },
  けれども: { reading: 'keredomo', gloss: '"But / however" (polite).' },
  のに: { reading: 'noni', gloss: '"Even though / despite".' },
  ので: { reading: 'node', gloss: '"Because / since" (softer than から).' },

  // ── Copula & polite machinery ──────────────────────────────────────────
  です: { reading: 'desu', gloss: 'Polite "is / am / are".' },
  でした: { reading: 'deshita', gloss: 'Polite past "was / were".' },
  でしょう: { reading: 'deshou', gloss: '"Probably / right?" — softened guess or confirmation.' },
  じゃない: { reading: 'janai', gloss: '"Is not" (casual negative of です).' },
  ではない: { reading: 'dewanai', gloss: '"Is not" (formal negative of です).' },
  だ: { reading: 'da', gloss: 'Plain "is / am / are" (casual です).' },
  だった: { reading: 'datta', gloss: 'Plain past "was / were".' },
  ます: { reading: 'masu', gloss: 'Polite verb ending (present/future).' },
  ました: { reading: 'mashita', gloss: 'Polite past verb ending.' },
  ません: { reading: 'masen', gloss: 'Polite negative verb ending.' },
  ましょう: { reading: 'mashou', gloss: '"Let’s …" — polite suggestion.' },
  ください: { reading: 'kudasai', gloss: '"Please (do / give me) …".' },
  たい: { reading: 'tai', gloss: '"Want to …" — attaches to a verb stem (食べたい = want to eat).' },
  ない: { reading: 'nai', gloss: 'Plain negative — "not".' },
  なかった: { reading: 'nakatta', gloss: 'Plain past negative — "did not / was not".' },

  // ── Conjunctions & glue ────────────────────────────────────────────────
  そして: { reading: 'soshite', gloss: '"And then / and".' },
  それから: { reading: 'sorekara', gloss: '"After that / and then".' },
  でも: { reading: 'demo', gloss: '"But / however" (starts a sentence).' },
  しかし: { reading: 'shikashi', gloss: '"However" (formal).' },
  だから: { reading: 'dakara', gloss: '"So / that’s why".' },
  じゃあ: { reading: 'jaa', gloss: '"Well then …".' },
  もし: { reading: 'moshi', gloss: '"If" — signals a conditional.' },
  たとえば: { reading: 'tatoeba', gloss: '"For example".' },

  // ── Common fragments learners tap ──────────────────────────────────────
  こと: { reading: 'koto', gloss: 'Abstract "thing / fact" — turns a verb phrase into a noun.' },
  ん: { reading: 'n', gloss: 'Contraction of の — adds explanatory tone (…んです = "it’s that …").' },
  さん: { reading: 'san', gloss: 'Polite name suffix — Mr / Ms.' },
  ちゃん: { reading: 'chan', gloss: 'Affectionate name suffix (children, close friends).' },
  くん: { reading: 'kun', gloss: 'Name suffix, mostly for boys / younger men.' },
  たち: { reading: 'tachi', gloss: 'Plural suffix for people (私たち = we).' },
  ごろ: { reading: 'goro', gloss: '"Around (a time)" — 三時ごろ = around 3 o’clock.' },
}

const BY_LANGUAGE = { japanese: JA }

// glossaryLookup(language, token) → { reading, gloss } | null.
// Trims surrounding punctuation so tapping "でも、" still resolves.
export function glossaryLookup(language, token) {
  const table = BY_LANGUAGE[language]
  if (!table) return null
  const t = String(token || '').trim().replace(/^[、。．，,!！?？「」『』]+|[、。．，,!！?？「」『』]+$/g, '')
  return table[t] || null
}
