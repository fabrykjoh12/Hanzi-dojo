import { cleanMeaning } from './cleanMeaning'
import { isPlaceWord } from './storyReading'
import { getLevelLabel } from './utils'

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

// One learning-status palette and one set of labels for every lookup sheet, so
// the paged/chat/scene sheet and the classic reader's can't drift apart. Status
// is never conveyed by the dot alone — the label carries it too.
export const STATUS_COLOR = {
  not_started: 'var(--text-faint)',
  learning: '#CA8A04',
  review: '#3E63DD',
  mastered: '#2F9E6D',
}
export const STATUS_LABEL = {
  not_started: 'New word',
  learning: 'Learning',
  review: 'Known',
  mastered: 'Mastered',
}

// Split a sentence around the first occurrence of `word`, so the sheet can
// show the tapped word lit inside its own line — the answer to "which one did
// I tap?" without making the learner scan for it. Returns null when the word
// isn't in the sentence (a Russian token appears inflected, for instance), and
// the caller then renders the sentence plainly.
export function splitAround(sentence, word) {
  const s = String(sentence || '')
  const w = String(word || '')
  if (!s || !w) return null
  const at = s.indexOf(w)
  if (at < 0) return null
  return { before: s.slice(0, at), match: w, after: s.slice(at + w.length) }
}

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

// A reading is the first thing wanted for a word beyond the list — it is how
// you say it at all. The dictionary answers over the network, though, so the
// reading slot is held open with a placeholder while that is in flight instead
// of appearing a beat later and shoving the definition down the box.
export const READING_PENDING = '···'

// The reading row: { text, pending } | null. `pending` marks the placeholder so
// the sheet can draw it dimmed rather than as a real pronunciation.
export function lookupReadingState(selected, { grammar = null, dictEntry = null, dictLoading = false } = {}) {
  const reading = lookupReading(selected, { grammar, dictEntry })
  if (reading) return { text: reading, pending: false }
  if (dictLoading) return { text: READING_PENDING, pending: true }
  return null
}

// The chip label under the word — what KIND of word this is.
//
// A word outside the level's list says so plainly: "Unknown word". It used to
// be labelled by where the answer came from ("Dictionary"), which named a
// mechanism the learner has no reason to care about and read as though the word
// were a dictionary curiosity rather than simply one they don't have yet. The
// label is the same whether or not the reference dictionary resolves it —
// resolving only decides how much can be said about it, not what it is.
export function lookupChip(kind, { grammar = null } = {}) {
  if (kind === 'name') return 'Name'
  if (kind === 'place') return 'Place'
  if (kind === 'plain') return grammar ? 'Grammar' : 'Unknown word'
  return null
}

// The level chip beside the status pill: which level of the course this word
// comes from ("HSK 3"). Always via getLevelLabel — the label per level is the
// track's business, never this sheet's.
//
// Absent — not blank, not guessed — whenever there is nothing true to say:
//   - a name, a place or a grammar/unknown word: not curriculum vocabulary,
//   - a saved dictionary word, whose vocabulary row carries no level by design,
//   - a caller that doesn't select the column at all (the word list).
export function lookupLevel(selected, kind, language) {
  if (!selected || kind !== 'vocab' || !selected.vocab) return null
  const v = selected.vocab
  if (v.level === null || v.level === undefined || v.level === '') return null
  const level = Number(v.level)
  if (!Number.isFinite(level)) return null
  return getLevelLabel(v.language || language || null, v.system || null, level)
}

// Can this tapped word be kept — and if so, what does the bookmark look like?
//
// "Tap a word, keep a word" has to hold in every reader, not just the classic
// one. A word beyond the level's list has no vocabulary row to add, but if the
// reference dictionary resolved it there IS something to save: the dict entry,
// which the RPC turns into a level-less vocabulary row plus a card.
//
// Returns null — meaning "draw no bookmark at all" — rather than a disabled
// button whenever saving isn't a real option:
//   - the token is vocabulary, a name or a place (the sheet's own add-to-deck
//     already covers vocabulary; proper nouns aren't words to study),
//   - the grammar glossary answered, so no dictionary entry was ever fetched,
//   - the dictionary hasn't resolved (still loading, offline, or a genuine miss),
//   - the caller passed no save handler (the analyzer and the dictionary screen
//     render this sheet too, and neither wires one up).
export function dictSaveAction(selected, kind, { dictEntry = null, grammar = null, canSave = false, savedIds = null, saving = false } = {}) {
  if (!selected || kind !== 'plain') return null
  if (grammar) return null
  if (!dictEntry || !dictEntry.id) return null
  if (!canSave) return null
  const inDeck = Boolean(savedIds && savedIds.has(dictEntry.id))
  // Busy is only ever "this save is in flight" — a word already in the deck
  // reads as saved, never as pending, even while another save is running.
  const busy = Boolean(saving) && !inDeck
  return {
    entryId: dictEntry.id,
    inDeck,
    busy,
    // Idempotent by construction: once it's in the deck the button stops firing,
    // and a save in flight can't be fired again.
    disabled: inDeck || busy,
    label: inDeck ? 'In your deck' : 'Add to deck',
  }
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
