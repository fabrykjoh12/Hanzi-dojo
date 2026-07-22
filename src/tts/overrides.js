// Centralized Chinese pronunciation overrides.
//
// Mandarin's polyphones are the single biggest source of wrong-sounding TTS:
// 行 xíng/háng, 长 cháng/zhǎng, 觉 jué/jiào, 重 zhòng/chóng, 银行 as a word, plus
// names a general-purpose voice has never seen. An override pins the reading of
// one word or phrase, in context, so the fix is made once and applies to every
// flashcard, sentence and story line that contains it.
//
// Deliberately word- and phrase-level, never single ambiguous characters in
// isolation: 行 alone has no correct answer, 银行 does.
//
// Pure - matching and versioning only. Loading and persisting overrides is the
// repository's job.

import { OVERRIDE_VERIFICATION, HUMAN_ONLY_VERIFICATIONS } from './constants.js'
import { TtsRequestError } from './errors.js'

// An override the synthesis pipeline is allowed to apply. `rejected` is excluded
// (a reviewer said the correction was wrong); everything else is usable, because
// a machine-inferred reading is still better than a coin flip - it is just
// labelled honestly so a human can confirm it later.
export function isApplicable(o) {
  if (!o || !o.matched_text) return false
  return o.verification !== OVERRIDE_VERIFICATION.REJECTED
}

// Overrides that could apply to this text, longest match first so 银行 wins over
// a hypothetical 行 entry. `context` narrows an override to one kind of content
// (e.g. a name that should only be pinned inside stories); an override with no
// context applies everywhere.
export function selectOverrides(text, overrides, { locale, context = null } = {}) {
  const s = String(text || '')
  if (!s) return []
  return (overrides || [])
    .filter(isApplicable)
    .filter(o => !locale || !o.locale || o.locale === locale)
    .filter(o => !o.context || !context || o.context === context)
    .filter(o => s.indexOf(o.matched_text) !== -1)
    .slice()
    .sort((a, b) => (b.matched_text.length - a.matched_text.length)
      || (a.matched_text < b.matched_text ? -1 : 1))
}

// Split `text` into segments, wrapping every non-overlapping occurrence of an
// applicable override. Longest-first, left-to-right, and a span already claimed
// is never re-matched - so 银行 consumes its 行 and a 行 override cannot reach
// inside it.
//
// Returns [{ kind: 'text', text }, { kind: 'phoneme', text, override }] in
// document order. Callers turn that into provider-specific markup.
export function applyOverrides(text, overrides, opts = {}) {
  const s = String(text || '')
  if (!s) return []
  const chosen = selectOverrides(s, overrides, opts)
  if (chosen.length === 0) return [{ kind: 'text', text: s }]

  // claimed[i] = the override occupying character i, or null.
  const claimed = new Array(s.length).fill(null)
  for (const o of chosen) {
    const needle = o.matched_text
    let from = 0
    for (;;) {
      const at = s.indexOf(needle, from)
      if (at === -1) break
      let free = true
      for (let i = at; i < at + needle.length; i += 1) { if (claimed[i]) { free = false; break } }
      if (free) for (let i = at; i < at + needle.length; i += 1) claimed[i] = o
      from = at + 1
    }
  }

  const segments = []
  let i = 0
  while (i < s.length) {
    const owner = claimed[i]
    if (!owner) {
      let j = i
      while (j < s.length && !claimed[j]) j += 1
      segments.push({ kind: 'text', text: s.slice(i, j) })
      i = j
    } else {
      let j = i
      while (j < s.length && claimed[j] === owner) j += 1
      segments.push({ kind: 'phoneme', text: s.slice(i, j), override: owner })
      i = j
    }
  }
  return segments
}

// A stable fingerprint of the overrides that actually affected this text. It
// goes into the content hash, so editing a pronunciation marks exactly the
// affected audio stale - and editing an unrelated override marks nothing.
// 'none' (rather than an empty string) makes the "no overrides" case explicit
// and distinguishable in a stored hash input.
export function overrideVersion(segments) {
  const applied = (segments || [])
    .filter(seg => seg.kind === 'phoneme' && seg.override)
    .map(seg => seg.override.matched_text + '=' + (seg.override.pinyin || ''))
  if (applied.length === 0) return 'none'
  const unique = Array.from(new Set(applied)).sort()
  return unique.join('|')
}

// Verification-state guard. A pipeline may record what it inferred; only an
// explicit human action may promote an override to verified or rejected. This
// is the rule that keeps "we guessed" from turning into "a person checked" as
// data moves between systems.
export function assertVerificationChange(next, { byHuman = false } = {}) {
  if (HUMAN_ONLY_VERIFICATIONS.indexOf(next) !== -1 && !byHuman) {
    throw new TtsRequestError(
      'Verification state "' + next + '" may only be set by a human reviewer'
    )
  }
  return next
}

// Normalize a raw override row into the shape the matcher expects, defaulting
// an unknown verification state to the most conservative one.
export function normalizeOverride(raw) {
  if (!raw) return null
  const verification = Object.values(OVERRIDE_VERIFICATION).indexOf(raw.verification) !== -1
    ? raw.verification
    : OVERRIDE_VERIFICATION.UNREVIEWED
  return {
    id: raw.id || null,
    source_text: raw.source_text || raw.matched_text || '',
    matched_text: raw.matched_text || raw.source_text || '',
    pinyin: raw.pinyin || '',
    context: raw.context || null,
    provider_representation: raw.provider_representation || null,
    locale: raw.locale || null,
    verification,
    reviewer_note: raw.reviewer_note || null,
  }
}
