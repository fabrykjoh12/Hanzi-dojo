import { useState, useEffect, useMemo, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { languageTheme, ink } from './languageTheme'
import { getSystemLabel, getLevelLabel } from './utils'
import { useIsMobile } from './useIsMobile'
import { useOnline } from './useOnline'
import { PageHeader } from './panels'
import WordLookupSheet from './WordLookupSheet'
import { readRecent, recordRecent, clearRecent } from './recentLookups'
import {
  DICT_FILTERS, filterVocab, dictionaryEmptyState, levelsInVocab, filterByLevel,
  cardStatus, hasActiveFilters,
} from './dictionaryFilters'
import { buildVocabIndex, searchVocabIndex } from './vocabIndex'
import { dictSearchReducer, dictSearchView, initialDictSearch } from './dictSearchState'
import { searchDict, getDictEntryById, getDictEntryByWord, addDictEntryToDeck, isHeadwordLookup } from './dictSearch'
import DictEntryView from './DictEntryView'
import { sheetOverlayStyle, sheetShellStyle, sheetHeaderStyle, sheetHandleStyle, sheetBodyStyle } from './sheetLayout'
import { ArrowLeft, Search, Clock, X, WifiOff, AlertCircle } from 'lucide-react'

// Built-in dictionary: search ANY word in the current language (every level, not
// just your own), hear it, and add it to your deck — the same lookup sheet the
// readers use.
//
// The async lifecycle deliberately lives in dictSearchState.js and the syllabus
// matching in vocabIndex.js: both were sources of real "feels buggy" behaviour
// (stale responses overwriting fresh ones, the list blanking on every keystroke,
// a "no results" flash before the request was even sent, typing lag over a
// multi-thousand-row list) and both are the kind of thing that only stays fixed
// if it is covered by a spec.

const MAX_ROWS = 80   // keep the DOM light; a search narrows quickly anyway
const DEBOUNCE_MS = 180

// Touch targets. Anything the thumb aims at gets a real target — the filter
// chips and the Clear link used to be 21–34px tall, which on a phone means
// missed taps that read as "the button doesn't work".
const TAP = 44

function ttsLangFor(language) {
  return language === 'japanese' ? 'ja-JP' : language === 'chinese' ? 'zh-CN' : 'ru-RU'
}

export default function Dictionary({ session, profile, track, onBack }) {
  const isMobile = useIsMobile()
  const online = useOnline()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = ink(accentHex)
  const langFont = theme.font
  const ttsLang = ttsLangFor(track.language)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [vocab, setVocab] = useState([])
  const [cardByVocab, setCardByVocab] = useState({})
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [recent, setRecent] = useState(() => readRecent(track.language))
  const [filter, setFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')

  const [scope, setScope] = useState(track.language === 'chinese' ? 'full' : 'syllabus')          // 'full' | 'syllabus'
  const [dict, dispatchDict] = useReducer(dictSearchReducer, initialDictSearch)
  const [retryTick, setRetryTick] = useState(0)
  const [entryStack, setEntryStack] = useState([])    // drill-down stack of dict entries
  const [entryBusy, setEntryBusy] = useState(false)   // a drill-down / recent tap is fetching
  const [entryError, setEntryError] = useState(null)
  const [dictInDeck, setDictInDeck] = useState(() => new Set())
  const searchRef = useRef(null)

  const term = query.trim()

  // Debounced full-dictionary search. Every response is tagged with the term it
  // answers; the reducer drops anything that no longer matches the outstanding
  // query, so a slow request landing late can never overwrite fresher results.
  useEffect(() => {
    if (scope !== 'full') return undefined
    if (!term) {
      dispatchDict({ type: 'request', term: '' })
      return undefined
    }
    if (!online) return undefined
    dispatchDict({ type: 'request', term })
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const rows = await searchDict(supabase, term, 60)
        if (!cancelled) dispatchDict({ type: 'resolve', term, rows })
      } catch {
        if (!cancelled) dispatchDict({ type: 'reject', term, error: 'Couldn’t reach the dictionary.' })
      }
    }, DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [term, scope, online, retryTick])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        // Paged — this is the whole curriculum, well past the 1000-row cap, and a
        // word list that silently stops two thirds of the way through is worse
        // than useless for looking a word up.
        const [vocabData, cards] = await Promise.all([
          fetchPagedSafe(() => supabase
            .from('vocabulary')
            .select('id, word, reading, meaning, level, sort_order')
            .eq('language', track.language)
            .eq('system', track.system)
            .eq('is_active', true)
            .not('level', 'is', null)
            .order('level', { ascending: true })
            .order('sort_order', { ascending: true })),
          getTrackCards(session.user.id, track, { columns: 'vocab_id, state, stability' }),
        ])
        if (cancelled) return
        setVocab(vocabData || [])
        const map = {}
        for (const c of (cards || [])) map[c.vocab_id] = c
        setCardByVocab(map)
      } catch {
        // A failed load used to leave the spinner turning for ever; say so
        // instead, and let the learner try again.
        if (!cancelled) setLoadError('Couldn’t load the word list.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fold every row's searchable text once, not three times per row per keystroke.
  const vocabIndex = useMemo(() => buildVocabIndex(vocab), [vocab])

  const matches = useMemo(() => {
    if (scope !== 'syllabus') return []
    const byQuery = searchVocabIndex(vocabIndex, term)
    const byLevel = filterByLevel(byQuery, levelFilter)
    return filterVocab(byLevel, v => cardStatus(cardByVocab[v.id]), filter)
  }, [vocabIndex, term, filter, levelFilter, cardByVocab, scope])

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
  const filtersOn = hasActiveFilters(filter, levelFilter)
  const showRecent = !term && !filtersOn && recentRows.length > 0

  const view = dictSearchView(dict, query, online)

  const openWord = (v) => {
    setSelected({ word: v.word, vocab: v, status: cardStatus(cardByVocab[v.id]) })
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

  const addDictToDeck = async (entry) => {
    if (!entry || dictInDeck.has(entry.id)) return
    try {
      const res = await addDictEntryToDeck(supabase, entry.id, track.language, track.system)
      if (res) setDictInDeck(prev => new Set(prev).add(entry.id))
    } catch { /* surfaced by the disabled→enabled state; no crash */ }
  }

  const systemLabel = getSystemLabel(track.system)

  const clearRecentLookups = () => {
    clearRecent(track.language)
    setRecent([])
  }

  const clearFilters = () => { setFilter('all'); setLevelFilter('all') }

  const clearQuery = () => {
    setQuery('')
    if (searchRef.current) searchRef.current.focus()
  }

  // Open a reference entry and remember it (so it shows under Recent when the
  // search box is empty — like Pleco).
  const openDict = (e) => {
    if (!e) return
    setRecent(recordRecent(track.language, {
      id: e.id, word: e.simplified, reading: e.pinyin,
      meaning: Array.isArray(e.definitions) ? e.definitions[0] : '',
    }))
    setEntryError(null)
    setEntryStack([e])
  }

  // Re-open a recent lookup by re-fetching its entry (recent stores word text,
  // not a live entry). Works whether it was first opened from full or syllabus.
  // A tap that fetches must say so and must survive a failure — silently doing
  // nothing is what made this screen feel broken.
  const openRecentDict = async (r) => {
    if (entryBusy) return
    setEntryBusy(true)
    setEntryError(null)
    try {
      const entry = await getDictEntryByWord(supabase, r.word)
      if (entry) openDict(entry)
      else setEntryError('No dictionary entry for “' + r.word + '”.')
    } catch {
      setEntryError(online ? 'Couldn’t reach the dictionary.' : 'You’re offline — reconnect to open this word.')
    } finally {
      setEntryBusy(false)
    }
  }

  // Drill down from an open entry: the character cards pass a headword, the
  // "words containing" chips pass an entry id.
  const openLinkedEntry = async (idOrWord) => {
    if (!idOrWord || entryBusy) return
    setEntryBusy(true)
    setEntryError(null)
    try {
      const next = isHeadwordLookup(idOrWord)
        ? await getDictEntryByWord(supabase, idOrWord)
        : await getDictEntryById(supabase, idOrWord)
      if (!next) { setEntryError('No dictionary entry for that word yet.'); return }
      // Keep the in-memory Recent list in step with what was written to storage
      // — it used to only record to storage, so a drilled-down word appeared
      // under Recent after a reload but not before.
      setRecent(recordRecent(track.language, {
        id: next.id, word: next.simplified, reading: next.pinyin,
        meaning: (next.definitions || [])[0],
      }))
      setEntryStack(s => [...s, next])
    } catch {
      setEntryError(online ? 'Couldn’t reach the dictionary.' : 'You’re offline — reconnect to open this word.')
    } finally {
      setEntryBusy(false)
    }
  }

  const closeEntry = () => { setEntryStack([]); setEntryError(null) }

  // Escape closes the entry sheet — one level of the drill-down at a time,
  // keyboard parity with the backdrop tap, the same as every other overlay in
  // the app. This sheet was the only one you could not get out of by keyboard.
  const entryDepth = entryStack.length
  useEffect(() => {
    if (entryDepth === 0) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setEntryError(null)
      setEntryStack(s => (s.length > 1 ? s.slice(0, -1) : []))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entryDepth])

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
    minHeight: TAP + 'px', padding: '13px 16px', borderRadius: '14px', cursor: 'pointer',
    background: 'var(--surface)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif',
  }

  const renderRow = (v) => {
    const inDeck = Boolean(cardByVocab[v.id])
    return (
      <button key={v.id} onClick={() => openWord(v)} style={rowStyle}>
        <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{v.word}</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          {v.reading && <span style={{ fontSize: '12.5px', color: accentInk, fontWeight: 600 }}>{v.reading}</span>}
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
    <button key={e.id} onClick={() => openDict(e)} style={rowStyle}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{e.simplified}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '12.5px', color: accentInk, fontWeight: 600 }}>{e.pinyin}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {Array.isArray(e.definitions) ? e.definitions.join('; ') : ''}
        </span>
      </span>
    </button>
  )

  const renderRecentDictRow = (r) => (
    <button key={r.id} onClick={() => openRecentDict(r)} style={rowStyle}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: langFont + ', Inter, sans-serif', flexShrink: 0 }}>{r.word}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        {r.reading && <span style={{ fontSize: '12.5px', color: accentInk, fontWeight: 600 }}>{r.reading}</span>}
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meaning}</span>
      </span>
    </button>
  )

  const renderRecentSection = (children, style) => (
    <section aria-label="Recent lookups" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Clock size={14} strokeWidth={2} color="var(--text-muted)" /> Recent
        </span>
        <button onClick={clearRecentLookups} style={linkBtn}>Clear</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </section>
  )

  const notice = (icon, text, action) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '38px 12px', textAlign: 'center' }}>
      {icon}
      <span style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, maxWidth: '38ch' }}>{text}</span>
      {action}
    </div>
  )

  const shell = { maxWidth: '760px', margin: '0 auto', padding: isMobile ? '20px 16px 56px' : '38px 32px 72px' }

  const tintFor = (active) => (active
    ? 'color-mix(in srgb, ' + accentHex + ' 11%, var(--surface))'
    : 'var(--surface)')

  return (
    <div style={shell}>
      <button onClick={onBack} style={ghostBtn}>
        <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Practice
      </button>

      <PageHeader
        title="Look up any word"
        meta="Dictionary"
        style={{ margin: '10px 0 8px' }}
      />
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
        Search every {systemLabel} word, hear it, and save it to your deck.
      </p>

      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <Search size={17} strokeWidth={2} color="var(--text-faint)" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          ref={searchRef}
          // Deliberately "text", not "search": the browser's own clear button
          // on type=search would sit on top of ours.
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); clearQuery() } }}
          placeholder="Search word, reading, or meaning"
          aria-label="Search the dictionary"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: query ? '14px 46px 14px 42px' : '14px 16px 14px 42px',
            borderRadius: '14px',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            fontSize: '16px', fontFamily: 'Inter, sans-serif',
          }}
        />
        {query && (
          <button
            onClick={clearQuery}
            aria-label="Clear search"
            style={{
              position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
              width: TAP + 'px', height: TAP + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', borderRadius: '12px',
            }}
          >
            <X size={17} strokeWidth={2} color="var(--text-faint)" />
          </button>
        )}
      </div>

      {track.language === 'chinese' && (
        <div role="group" aria-label="Search scope" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {['full', 'syllabus'].map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              style={{
                flex: 1, minHeight: TAP + 'px', borderRadius: '12px', cursor: 'pointer',
                border: '1px solid ' + (scope === s ? accentHex : 'var(--border)'),
                background: tintFor(scope === s),
                color: scope === s ? accentInk : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              }}
            >
              {s === 'full' ? 'Full dictionary' : 'My syllabus'}
            </button>
          ))}
        </div>
      )}

      {/* One live region for both scopes, so a screen reader hears the result
          count change instead of silence. */}
      <div aria-live="polite" style={SR_ONLY}>
        {scope === 'full'
          ? (view.mode === 'results' ? view.rows.length + ' results' : '')
          : (loading || term === '' ? '' : matches.length + ' results')}
      </div>

      {scope === 'full' ? (
        <>
          {view.mode === 'idle' && (
            recent.length > 0
              ? renderRecentSection(recent.map(renderRecentDictRow))
              : notice(null, 'Search the full dictionary by word, pinyin, or meaning.')
          )}

          {view.mode === 'loading' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px' }}>Searching…</div>
          )}

          {view.mode === 'offline' && notice(
            <WifiOff size={20} strokeWidth={1.8} color="var(--text-faint)" />,
            'You’re offline. The full dictionary needs a connection — your syllabus words are still searchable.',
            track.language === 'chinese'
              ? <button onClick={() => setScope('syllabus')} style={pillBtn(accentHex, accentInk)}>Search my syllabus</button>
              : null,
          )}

          {view.mode === 'error' && notice(
            <AlertCircle size={20} strokeWidth={1.8} color="var(--text-faint)" />,
            view.error,
            <button onClick={() => setRetryTick(n => n + 1)} style={pillBtn(accentHex, accentInk)}>Try again</button>,
          )}

          {view.mode === 'empty' && notice(null, 'No words match “' + view.term + '”.')}

          {(view.mode === 'results' || view.mode === 'refreshing') && (
            <div
              // Keep the previous answer on screen, faintly, while the next one
              // is fetched — the list no longer blanks on every keystroke.
              style={{
                display: 'flex', flexDirection: 'column', gap: '8px',
                opacity: view.mode === 'refreshing' ? 0.55 : 1,
                transition: 'opacity 120ms ease',
              }}
            >
              {view.rows.map(renderDictRow)}
            </div>
          )}
        </>
      ) : (
        <>
          {levelOptions.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <label htmlFor="dict-level" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>Level</label>
              <select
                id="dict-level"
                aria-label="Filter by level"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{
                  minHeight: TAP + 'px', padding: '0 12px', borderRadius: '12px',
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
                    minHeight: TAP + 'px', padding: '0 16px', borderRadius: '999px', cursor: 'pointer',
                    border: '1px solid ' + (active ? accentHex : 'var(--border)'),
                    background: tintFor(active),
                    color: active ? accentInk : 'var(--text-muted)',
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
          ) : loadError ? (
            notice(
              <AlertCircle size={20} strokeWidth={1.8} color="var(--text-faint)" />,
              loadError,
              <button onClick={() => window.location.reload()} style={pillBtn(accentHex, accentInk)}>Reload</button>,
            )
          ) : (
            <>
              {showRecent && renderRecentSection(recentRows.map(renderRow), { marginBottom: '22px' })}

              {rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '38px 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
                  <div>{term ? 'No words match “' + term + '”.' : dictionaryEmptyState(filter, false)}</div>
                  {/* A filter chip left on above a search is invisible once you
                      scroll; say so rather than letting the list look broken. */}
                  {filtersOn && (
                    <div style={{ marginTop: '12px' }}>
                      <button onClick={clearFilters} style={pillBtn(accentHex, accentInk)}>Clear filters</button>
                    </div>
                  )}
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

      {entryError && entryStack.length === 0 && (
        <div role="status" style={{
          marginTop: '14px', padding: '10px 14px', borderRadius: '12px', fontSize: '13px',
          color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)',
        }}>
          {entryError}
        </div>
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

      {/* Portaled to <body> on purpose: rendered in place the sheet lives inside
          the shell's <main>, which sets position:relative + z-index and so forms
          a stacking context — the sheet's own z-index:200 is scoped inside it
          and loses to the sibling MobileNav (z-index:30). The nav then painted
          over the sheet's bottom strip, so the last rows of a long entry were
          unreachable however far you scrolled, and taps there hit the nav.
          The header is pinned; only the entry body scrolls. */}
      {entryStack.length > 0 && typeof document !== 'undefined' && createPortal(
        <div onClick={closeEntry} className="app-overlay-viewport" style={sheetOverlayStyle()}>
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Dictionary entry"
            style={sheetShellStyle()}
          >
            <div style={sheetHandleStyle()} />
            <div style={{ ...sheetHeaderStyle(), minHeight: TAP + 'px' }}>
              {entryStack.length > 1
                ? <button onClick={() => setEntryStack(s => s.slice(0, -1))} style={ghostBtn}><ArrowLeft size={16} strokeWidth={1.85} color="var(--text-muted)" /> Back</button>
                : <span />}
              <button onClick={closeEntry} aria-label="Close entry" style={{
                width: TAP + 'px', height: TAP + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: '12px',
              }}>
                <X size={18} strokeWidth={2} color="var(--text-muted)" />
              </button>
            </div>

            <div style={sheetBodyStyle()} data-testid="dict-entry-scroll">
              {entryError && (
                <div role="status" style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-muted)' }}>{entryError}</div>
              )}

              <DictEntryView
                entry={entryStack[entryStack.length - 1]}
                accentHex={accentHex}
                langFont={langFont}
                ttsLang={ttsLang}
                canAddToDeck={true}
                inDeck={dictInDeck.has(entryStack[entryStack.length - 1].id)}
                onAddToDeck={addDictToDeck}
                onOpenEntry={openLinkedEntry}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: TAP + 'px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
  color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
}

const linkBtn = {
  display: 'inline-flex', alignItems: 'center', minHeight: TAP + 'px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
  color: 'var(--text-faint)', fontSize: '12.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
}

function pillBtn(accentHex, accentInk) {
  return {
    minHeight: TAP + 'px', padding: '0 18px', borderRadius: '999px', cursor: 'pointer',
    border: '1px solid ' + accentHex,
    background: 'color-mix(in srgb, ' + accentHex + ' 11%, var(--surface))',
    color: accentInk, fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
  }
}

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}
