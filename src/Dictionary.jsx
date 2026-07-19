import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { languageTheme } from './languageTheme'
import { getSystemLabel, getLevelLabel } from './utils'
import { useIsMobile } from './useIsMobile'
import WordLookupSheet from './WordLookupSheet'
import { readRecent, recordRecent, clearRecent } from './recentLookups'
import { DICT_FILTERS, filterVocab, dictionaryEmptyState, levelsInVocab, filterByLevel } from './dictionaryFilters'
import { foldIncludes } from './searchFold'
import { searchDict, getDictEntryById, getDictEntryByWord } from './dictSearch'
import DictEntryView from './DictEntryView'
import { ArrowLeft, Search, Clock } from 'lucide-react'

// Built-in dictionary: search ANY word in the current language (every level, not
// just your own), hear it, and add it to your deck — the same lookup sheet the
// readers use. Additive: a new Practice screen, no change to existing flows.

const MAX_ROWS = 80   // keep the DOM light; a search narrows quickly anyway

function ttsLangFor(language) {
  return language === 'japanese' ? 'ja-JP' : language === 'chinese' ? 'zh-CN' : 'ru-RU'
}

function statusOf(card) {
  if (!card) return 'not_started'
  if (card.state === 'learning' || card.state === 'relearning') return 'learning'
  if (card.is_easy || (card.stability || 0) >= 21) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'not_started'
}

export default function Dictionary({ session, profile, track, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const ttsLang = ttsLangFor(track.language)

  const [loading, setLoading] = useState(true)
  const [vocab, setVocab] = useState([])
  const [cardByVocab, setCardByVocab] = useState({})
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [recent, setRecent] = useState(() => readRecent(track.language))
  const [filter, setFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')

  const [scope, setScope] = useState('full')          // 'full' | 'syllabus'
  const [dictRows, setDictRows] = useState([])
  const [dictLoading, setDictLoading] = useState(false)
  const [entryStack, setEntryStack] = useState([])    // drill-down stack of dict entries

  // Debounced full-dictionary search.
  useEffect(() => {
    if (scope !== 'full') return
    const term = query.trim()
    if (!term) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDictRows([])
      setDictLoading(false)
      return
    }
    let cancelled = false
    setDictLoading(true)
    const t = setTimeout(async () => {
      try {
        const rows = await searchDict(supabase, term, 60)
        if (!cancelled) setDictRows(rows)
      } finally {
        if (!cancelled) setDictLoading(false)
      }
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, scope])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: vocabData }, cards] = await Promise.all([
        supabase
          .from('vocabulary')
          .select('id, word, reading, meaning, level, sort_order')
          .eq('language', track.language)
          .eq('system', track.system)
          .eq('is_active', true)
          .order('level', { ascending: true })
          .order('sort_order', { ascending: true }),
        getTrackCards(session.user.id, track, { columns: 'vocab_id, state, is_easy, stability' }),
      ])
      if (cancelled) return
      setVocab(vocabData || [])
      const map = {}
      for (const c of (cards || [])) map[c.vocab_id] = c
      setCardByVocab(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const byQuery = !q ? vocab : vocab.filter(v =>
      foldIncludes(v.word, q) ||
      foldIncludes(v.reading, q) ||
      foldIncludes(v.meaning, q))
    const byLevel = filterByLevel(byQuery, levelFilter)
    return filterVocab(byLevel, v => statusOf(cardByVocab[v.id]), filter)
  }, [vocab, q, filter, levelFilter, cardByVocab])

  const levelOptions = useMemo(() => levelsInVocab(vocab), [vocab])
  const rows = matches.slice(0, MAX_ROWS)

  const vocabById = useMemo(() => {
    const m = {}
    for (const v of vocab) m[v.id] = v
    return m
  }, [vocab])

  // Recent lookups still present in the current vocab (skip anything stale, e.g.
  // a word deactivated since it was last opened).
  const recentRows = useMemo(
    () => recent.map(r => vocabById[r.id]).filter(Boolean),
    [recent, vocabById],
  )
  const showRecent = !q && filter === 'all' && levelFilter === 'all' && recentRows.length > 0

  const openWord = (v) => {
    setSelected({ word: v.word, vocab: v, status: statusOf(cardByVocab[v.id]) })
    setRecent(recordRecent(track.language, v))
  }

  const speak = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  const addToDeck = async (v) => {
    if (!v || !v.id || cardByVocab[v.id]) return
    const row = {
      user_id: session.user.id, vocab_id: v.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('cards').insert(row)
    if (!error) setCardByVocab(prev => ({ ...prev, [v.id]: { vocab_id: v.id, state: 'new' } }))
  }

  const systemLabel = getSystemLabel(track.system)

  const clearRecentLookups = () => {
    clearRecent(track.language)
    setRecent([])
  }

  const renderRow = (v) => {
    const inDeck = Boolean(cardByVocab[v.id])
    return (
      <button
        key={v.id}
        onClick={() => openWord(v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
          padding: '13px 16px', borderRadius: '14px', cursor: 'pointer',
          background: 'var(--surface)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif',
        }}
      >
        <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{v.word}</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          {v.reading && <span style={{ fontSize: '12.5px', color: accentHex, fontWeight: 600 }}>{v.reading}</span>}
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.meaning}</span>
        </span>
        <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>
          {getLevelLabel(track.language, track.system, v.level)}
        </span>
        {inDeck && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: accentHex, flexShrink: 0 }} title="In your deck" />}
      </button>
    )
  }

  const renderDictRow = (e) => (
    <button key={e.id} onClick={() => setEntryStack([e])} style={{
      display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
      padding: '13px 16px', borderRadius: '14px', cursor: 'pointer',
      background: 'var(--surface)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif',
    }}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{e.simplified}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '12.5px', color: accentHex, fontWeight: 600 }}>{e.pinyin}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {Array.isArray(e.definitions) ? e.definitions.join('; ') : ''}
        </span>
      </span>
    </button>
  )

  const shell = { maxWidth: '760px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px' }

  return (
    <div style={shell}>
      <button onClick={onBack} style={ghostBtn}>
        <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Practice
      </button>

      <div style={{ margin: '18px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800 }}>
          <Search size={17} strokeWidth={1.85} color={accentHex} /> Dictionary
        </div>
        <h1 style={{ margin: '8px 0 0', fontSize: isMobile ? '28px' : '34px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
          Look up any word
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
          Search every {systemLabel} word, hear it, and save it to your deck.
        </p>
      </div>

      <div style={{ position: 'relative', marginBottom: '18px' }}>
        <Search size={17} strokeWidth={2} color="var(--text-faint)" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search word, reading, or meaning"
          aria-label="Search the dictionary"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 42px', borderRadius: '14px',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            fontSize: '16px', fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {['full', 'syllabus'].map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            style={{
              flex: 1, minHeight: '36px', borderRadius: '10px', cursor: 'pointer',
              border: '1px solid ' + (scope === s ? accentHex : 'var(--border)'),
              background: scope === s ? accentHex + '12' : 'var(--surface)',
              color: scope === s ? accentHex : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            }}
          >
            {s === 'full' ? 'Full dictionary' : 'My syllabus'}
          </button>
        ))}
      </div>

      {scope === 'full' ? (
        dictLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px' }}>Loading…</div>
        ) : dictRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
            {q ? 'No words match “' + query.trim() + '”.' : 'Search the full dictionary by word, pinyin, or meaning.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dictRows.map(renderDictRow)}
          </div>
        )
      ) : (
        <>
          {levelOptions.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <label htmlFor="dict-level" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>Level</label>
              <select
                id="dict-level"
                aria-label="Filter by level"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{
                  minHeight: '36px', padding: '0 12px', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                  fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                }}
              >
                <option value="all">All levels</option>
                {levelOptions.map(lvl => (
                  <option key={lvl} value={lvl}>{getLevelLabel(track.language, track.system, lvl)}</option>
                ))}
              </select>
            </div>
          )}

          <div role="group" aria-label="Filter by status" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
            {DICT_FILTERS.map(f => {
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  style={{
                    minHeight: '34px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer',
                    border: '1px solid ' + (active ? accentHex : 'var(--border)'),
                    background: active ? accentHex + '12' : 'var(--surface)',
                    color: active ? accentHex : 'var(--text-muted)',
                    fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px' }}>Loading…</div>
          ) : (
            <>
              {showRecent && (
                <section aria-label="Recent lookups" style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <Clock size={14} strokeWidth={2} color="var(--text-muted)" /> Recent
                    </span>
                    <button
                      onClick={clearRecentLookups}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', color: 'var(--text-faint)', fontSize: '12.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentRows.map(renderRow)}
                  </div>
                </section>
              )}

              {rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
                  {q ? 'No words match “' + query.trim() + '”.' : dictionaryEmptyState(filter, false)}
                </div>
              ) : (
                <>
                  {showRecent && (
                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                      All words
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rows.map(renderRow)}
                  </div>
                  {matches.length > MAX_ROWS && (
                    <div style={{ textAlign: 'center', padding: '16px 0 0', color: 'var(--text-faint)', fontSize: '12.5px' }}>
                      Showing {MAX_ROWS} of {matches.length} — keep typing to narrow it down.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      <WordLookupSheet
        selected={selected}
        theme={theme}
        accent={accentHex}
        userCards={cardByVocab}
        onAddToDeck={addToDeck}
        onSpeak={speak}
        onClose={() => setSelected(null)}
      />

      {entryStack.length > 0 && (
        <div onClick={() => setEntryStack([])} className="app-overlay-viewport"
             style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ width: '100%', maxWidth: '560px', maxHeight: '92%', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px' }}>
            {entryStack.length > 1 && (
              <button onClick={() => setEntryStack(s => s.slice(0, -1))} style={ghostBtn}>← Back</button>
            )}
            <DictEntryView
              entry={entryStack[entryStack.length - 1]}
              accentHex={accentHex}
              langFont={langFont}
              ttsLang={ttsLang}
              canAddToDeck={false}
              onOpenEntry={async (idOrWord) => {
                const next = idOrWord && idOrWord.length <= 2 && /\p{Script=Han}/u.test(idOrWord)
                  ? await getDictEntryByWord(supabase, idOrWord)
                  : await getDictEntryById(supabase, idOrWord)
                if (next) { recordRecent(track.language, { id: next.id, word: next.simplified, reading: next.pinyin, meaning: (next.definitions || [])[0] }); setEntryStack(s => [...s, next]) }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
  color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
}
