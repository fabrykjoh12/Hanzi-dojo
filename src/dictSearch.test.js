import { describe, it, expect, vi } from 'vitest'
import { normalizeQuery, searchDict } from './dictSearch'

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
