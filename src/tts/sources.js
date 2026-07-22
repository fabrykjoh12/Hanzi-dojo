// Turning app content into speakable units.
//
// A "unit" is one thing to say, once: an entity, a variant, the exact text, the
// voice, and any pronunciation pinning. Everything downstream works on units,
// which is why the runner does not care whether it is voicing a flashcard or a
// line of dialogue.
//
// Pure, so the mapping from a vocabulary row to four clips is unit-testable.

import { VARIANTS, OVERRIDE_VERIFICATION } from './constants.js'
import { plannedVariants } from './records.js'
import { normalizeTtsText, stripSpeakerLabel, isSpeakable } from './normalize.js'

// The word's own stored reading, used to pin its pronunciation.
//
// This is the single highest-value correction in the system: `vocabulary.reading`
// is the curriculum's authoritative pinyin for that entry, so 银行 is read
// yínháng and 长 gets the reading the lesson actually teaches - which a
// general-purpose voice cannot know for a word spoken in isolation.
//
// Labelled `inferred`, never `verified`: it is derived from data, not checked by
// a person. Only a human review may promote it.
export function readingOverride(row, { locale }) {
  if (!row || !row.word || !row.reading) return []
  return [{
    id: null,
    source_text: row.word,
    matched_text: row.word,
    pinyin: row.reading,
    context: null,
    provider_representation: null,
    locale,
    verification: OVERRIDE_VERIFICATION.INFERRED,
    reviewer_note: 'Derived from vocabulary.reading',
  }]
}

// One vocabulary row becomes up to four units: word, slow word, example
// sentence, slow example sentence.
export function vocabularyUnits(row, { locale, voices, overrides = [] }) {
  if (!row || !row.id) return []
  const word = normalizeTtsText(row.word)
  const sentence = normalizeTtsText(row.example_sentence)
  const hasSentence = isSpeakable(sentence)
  if (!isSpeakable(word)) return []

  // Word variants also carry the entry's own reading; sentence variants use only
  // the shared override table, because a whole-word pin cannot be positioned
  // reliably inside a longer sentence the entry may not appear in verbatim.
  const wordOverrides = readingOverride(row, { locale }).concat(overrides)

  return plannedVariants('vocabulary', { hasSentence }).map(variant => {
    const isWord = variant.indexOf('word') === 0
    return {
      sourceType: 'vocabulary',
      sourceId: row.id,
      variant,
      text: isWord ? word : sentence,
      locale,
      voice: voices.flashcard,
      speakingRate: VARIANTS[variant].rate,
      contentType: VARIANTS[variant].contentType,
      context: isWord ? 'word' : 'sentence',
      style: null,
      pronunciationOverrides: isWord ? wordOverrides : overrides,
      label: row.word + ' (' + variant + ')',
    }
  })
}

// One story utterance becomes a normal and a slow clip. The utterance carries
// its own voice (narrator or a character), falling back to the story voice.
export function utteranceUnits(row, { locale, voices, overrides = [] }) {
  if (!row || !row.id) return []
  const text = normalizeTtsText(stripSpeakerLabel(row.hanzi))
  if (!isSpeakable(text)) return []
  const voice = row.voice || voices.story

  return plannedVariants('story_utterance').map(variant => ({
    sourceType: 'story_utterance',
    sourceId: row.id,
    variant,
    text,
    locale,
    voice,
    // An utterance may set its own pace (a slow, deliberate line); the variant's
    // rate is the default.
    speakingRate: variant.indexOf('slow') === -1 && row.speaking_rate
      ? Number(row.speaking_rate)
      : VARIANTS[variant].rate,
    contentType: VARIANTS[variant].contentType,
    context: row.speaker_id && row.speaker_id !== 'narrator' ? 'dialogue' : 'story',
    style: row.delivery_style || null,
    pronunciationOverrides: overrides,
    label: (row.speaker_id || 'narrator') + ' #' + row.utterance_index + ' (' + variant + ')',
  }))
}

// Build every unit for a batch of rows, in a stable order so a limited run is
// reproducible rather than arbitrary.
export function unitsFor(sourceType, rows, opts) {
  const build = sourceType === 'vocabulary' ? vocabularyUnits : utteranceUnits
  const out = []
  for (const row of rows || []) out.push(...build(row, opts))
  return out
}
