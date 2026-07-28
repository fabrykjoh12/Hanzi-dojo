// Thin wrapper over the reference-dictionary RPCs. Query normalization matches
// what the SQL expects: pinyin/english folded to toneless-lowercase (so 'Zhōng'
// meets 'pinyin_plain'), hanzi passed through unchanged.
import { foldForSearch } from './searchFold'

export function normalizeQuery(raw) {
  const t = (raw || '').trim()
  if (!t) return ''
  return foldForSearch(t)
}

export async function searchDict(supabase, query, limit = 60) {
  const p_query = normalizeQuery(query)
  if (!p_query) return []
  const { data, error } = await supabase.rpc('dict_search', { p_query, p_limit: limit })
  if (error) throw error
  return data || []
}

export async function getExamples(supabase, word, limit = 4) {
  if (!word) return []
  const { data, error } = await supabase.rpc('dict_examples_for', { p_word: word, p_limit: limit })
  if (error) throw error
  return data || []
}

export async function getWordsContaining(supabase, word, id, limit = 12) {
  if (!word) return []
  const { data, error } = await supabase.rpc('dict_words_containing', { p_word: word, p_id: id, p_limit: limit })
  if (error) throw error
  return data || []
}

export async function getDictEntryById(supabase, id) {
  const { data, error } = await supabase.rpc('dict_entry', { p_id: id })
  if (error) throw error
  return data || null
}

// Open the best entry for a bare character/word (breakdown taps pass a hanzi).
export async function getDictEntryByWord(supabase, word) {
  const rows = await searchDict(supabase, word, 1)
  return rows[0] || null
}

// CJK Unified Ideographs, the main extensions, and the compatibility block.
const HAN_RANGES = [
  [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff],
  [0x20000, 0x2a6df], [0x2a700, 0x2ebef], [0x2f800, 0x2fa1f],
]

export function isHanChar(ch) {
  if (!ch) return false
  const c = ch.codePointAt(0)
  for (const [lo, hi] of HAN_RANGES) {
    if (c >= lo && c <= hi) return true
  }
  return false
}

// An entry drill-down passes either a dict-entry id (the "words containing"
// chips) or a bare headword (the character cards). One or two hanzi means it is
// a headword and must be looked up by word, not by id.
//
// Written with codePointAt rather than a `\p{Script=Han}` regex on purpose:
// CLAUDE.md §6.2 (the OXC parser chokes on complex regex literals), and
// iterating code points also stops a surrogate pair from counting as two chars.
export function isHeadwordLookup(value) {
  if (typeof value !== 'string' || !value) return false
  const chars = Array.from(value)
  if (chars.length > 2) return false
  return chars.every(isHanChar)
}

export async function addDictEntryToDeck(supabase, dictEntryId, language, system) {
  const { data, error } = await supabase.rpc('dict_add_to_deck', {
    p_dict_entry_id: dictEntryId, p_language: language, p_system: system,
  })
  if (error) throw error
  return data
}
