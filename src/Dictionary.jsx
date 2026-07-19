import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { languageTheme } from './languageTheme'
import { getSystemLabel, getLevelLabel } from './utils'
import { useIsMobile } from './useIsMobile'
import WordLookupSheet from './WordLookupSheet'
import { readRecent, recordRecent, clearRecent } from './recentLookups'
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
    if (!q) return vocab
    return vocab.filter(v =>
      (v.word || '').toLowerCase().includes(q) ||
      (v.reading || '').toLowerCase().includes(q) ||
      (v.meaning || '').toLowerCase().includes(q))
  }, [vocab, q])
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
  const showRecent = !q && recentRows.length > 0

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
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              No words match{query ? ' “' + query.trim() + '”' : ''}.
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

      <WordLookupSheet
        selected={selected}
        theme={theme}
        accent={accentHex}
        userCards={cardByVocab}
        onAddToDeck={addToDeck}
        onSpeak={speak}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
  color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
}
