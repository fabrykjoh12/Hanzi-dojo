import { describe, it, expect, vi } from 'vitest'
import { normalizeQuery, searchDict, getExamples, getWordsContaining, getDictEntryById, getDictEntryByWord, addDictEntryToDeck } from './dictSearch'

describe('normalizeQuery', () => {
  it('folds pinyin tones and lowercases', () => {
    expect(normalizeQuery('  Zhōng ')).toBe('zhong')
    expect(normalizeQuery('HELLO')).toBe('hello')
  })
  it('leaves hanzi untouched', () => {
    expect(normalizeQuery('中文')).toBe('中文')
  })
})

describe('searchDict', () => {
  it('returns [] for an empty query without calling the RPC', async () => {
    const rpc = vi.fn()
    const supabase = { rpc }
    expect(await searchDict(supabase, '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
  it('calls dict_search with the normalized query', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: '1', simplified: '中文' }], error: null })
    const supabase = { rpc }
    const rows = await searchDict(supabase, 'Zhōng', 20)
    expect(rpc).toHaveBeenCalledWith('dict_search', { p_query: 'zhong', p_limit: 20 })
    expect(rows).toEqual([{ id: '1', simplified: '中文' }])
  })
})

describe('getExamples', () => {
  it('calls dict_examples_for with the word and limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ hanzi: '我学中文', english: 'I study Chinese' }], error: null })
    const rows = await getExamples({ rpc }, '中文', 4)
    expect(rpc).toHaveBeenCalledWith('dict_examples_for', { p_word: '中文', p_limit: 4 })
    expect(rows).toEqual([{ hanzi: '我学中文', english: 'I study Chinese' }])
  })
  it('returns [] for an empty word without calling the RPC', async () => {
    const rpc = vi.fn()
    expect(await getExamples({ rpc }, '')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('getWordsContaining', () => {
  it('calls dict_words_containing with word, id, and limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: '9', simplified: '中文' }], error: null })
    const rows = await getWordsContaining({ rpc }, '中', 'abc', 12)
    expect(rpc).toHaveBeenCalledWith('dict_words_containing', { p_word: '中', p_id: 'abc', p_limit: 12 })
    expect(rows).toEqual([{ id: '9', simplified: '中文' }])
  })
  it('throws when the RPC returns an error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(getWordsContaining({ rpc }, '中', 'abc')).rejects.toThrow('boom')
  })
})

describe('getDictEntryById', () => {
  it('calls dict_entry with p_id and returns data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'abc', simplified: '中文' }, error: null })
    const supabase = { rpc }
    const entry = await getDictEntryById(supabase, 'abc')
    expect(rpc).toHaveBeenCalledWith('dict_entry', { p_id: 'abc' })
    expect(entry).toEqual({ id: 'abc', simplified: '中文' })
  })
})

describe('getDictEntryByWord', () => {
  it('delegates to searchDict and returns the first row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: '1', simplified: '中' }, { id: '2', simplified: '中文' }], error: null })
    const supabase = { rpc }
    const entry = await getDictEntryByWord(supabase, '中')
    expect(rpc).toHaveBeenCalledWith('dict_search', { p_query: '中', p_limit: 1 })
    expect(entry).toEqual({ id: '1', simplified: '中' })
  })
})

describe('addDictEntryToDeck', () => {
  it('calls dict_add_to_deck with entry id, language, system', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { vocab_id: 'v1', source: 'dictionary', already_in_deck: false }, error: null })
    const res = await addDictEntryToDeck({ rpc }, 'd1', 'chinese', 'hsk_3')
    expect(rpc).toHaveBeenCalledWith('dict_add_to_deck', { p_dict_entry_id: 'd1', p_language: 'chinese', p_system: 'hsk_3' })
    expect(res).toEqual({ vocab_id: 'v1', source: 'dictionary', already_in_deck: false })
  })
  it('throws on RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('nope') })
    await expect(addDictEntryToDeck({ rpc }, 'd1', 'chinese', 'hsk_3')).rejects.toThrow('nope')
  })
})
