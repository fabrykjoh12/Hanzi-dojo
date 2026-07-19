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

export async function addDictEntryToDeck(supabase, dictEntryId, language, system) {
  const { data, error } = await supabase.rpc('dict_add_to_deck', {
    p_dict_entry_id: dictEntryId, p_language: language, p_system: system,
  })
  if (error) throw error
  return data
}
