import { cleanMeaning } from './cleanMeaning'
import { isPlaceWord } from './storyReading'

// What the word-lookup sheet says about a tapped token, as pure logic.
//
// Every word in a story is tappable, so the sheet has to explain four different
// kinds of thing and never dead-end:
//   vocab   — a word in the level's list: meaning, status, add-to-deck
//   name    — a character's name (curated or taken from the story's speakers)
//   place   — a curated country/city, which is still ordinary vocabulary
//   plain   — anything else: grammar glue, or a word beyond this level's list,
//             which the reference dictionary is asked about (Chinese only)
//
// `selected` is { word, vocab, name, status, tokenId, sentence } — vocab and
// name are both optional, and a token with neither is 'plain'.

export function lookupKind(selected, language) {
  if (!selected) return null
  if (selected.vocab) {
    const lang = selected.vocab.language || language
    return isPlaceWord(selected.vocab.word, lang) ? 'place' : 'vocab'
  }
  if (selected.name) return 'name'
  return 'plain'
}

// The word to look up in the reference dictionary, or null when something else
// already explains this token. CC-CEDICT is Chinese-only.
export function dictWordFor(selected, language, grammar) {
  if (!selected || selected.vocab || selected.name) return null
  if (grammar) return null
  if (language !== 'chinese') return null
  return selected.word || null
}

// The reading shown beside the word. A reading identical to the word itself
// (kana vocabulary stores its reading as itself) adds nothing, so it's dropped.
export function lookupReading(selected, { grammar = null, dictEntry = null } = {}) {
  if (!selected) return null
  let reading = null
  if (selected.vocab) reading = selected.vocab.reading
  else if (selected.name) reading = selected.name.reading
  else if (grammar) reading = grammar.reading
  else if (dictEntry) reading = dictEntry.pinyin
  if (!reading || reading === selected.word) return null
  return reading
}

// The chip label under the word — what KIND of word this is.
export function lookupChip(kind, { grammar = null, dictEntry = null } = {}) {
  if (kind === 'name') return 'Name'
  if (kind === 'place') return 'Place'
  if (kind === 'plain') return grammar ? 'Grammar' : (dictEntry ? 'Dictionary' : 'Word')
  return null
}

export const PLAIN_FALLBACK = 'A word beyond this level’s list — tap the speaker to hear it, or read the sentence below.'

// The explanation paragraph.
export function lookupBody(selected, kind, { grammar = null, dictDefs = [], dictLoading = false } = {}) {
  if (!selected) return ''
  if (kind === 'name') return 'Proper noun — a character’s name.'
  if (kind === 'plain') {
    if (grammar) return grammar.gloss
    if (dictDefs.length > 0) return dictDefs.join('; ')
    return dictLoading ? 'Looking it up…' : PLAIN_FALLBACK
  }
  return cleanMeaning(selected.vocab.meaning)
}
