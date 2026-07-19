import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { isLearned, isMastered } from './mastery'
import { cleanMeaning } from './cleanMeaning'
import { useIsMobile } from './useIsMobile'
import { SecondaryButton } from './ui'
import WordLookupSheet from './WordLookupSheet'
import { ArrowLeft, BookA, Search } from 'lucide-react'

function ttsLangFor(language) {
  return language === 'japanese' ? 'ja-JP' : language === 'chinese' ? 'zh-CN' : 'ru-RU'
}

// Every word of the current level with its live SRS status — the deck, visible.
// Filter chips + search let learners answer "which words do I actually know?"

const STATUS = {
  new: { label: 'New', color: '#71717A' },
  learning: { label: 'Learning', color: '#D97706' },
  learned: { label: 'Learned', color: '#3E63DD' },
  mastered: { label: 'Mastered', color: '#2F9E6D' },
}

function statusOf(card) {
  if (!card) return 'new'
  if (isMastered(card)) return 'mastered'
  if (isLearned(card)) return 'learned'
  return 'learning'
}

export default function Words({ session, profile, track, onBack }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [vocab, setVocab] = useState([])
  const [cardByVocab, setCardByVocab] = useState({})
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const ttsLang = ttsLangFor(track.language)

  const speak = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }
  const addToDeck = async (v) => {
    if (!v || !v.id || cardByVocab[v.id]) return
    const row = { user_id: session.user.id, vocab_id: v.id, state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString() }
    const { error } = await supabase.from('cards').insert(row)
    if (!error) setCardByVocab(prev => ({ ...prev, [v.id]: { vocab_id: v.id, state: 'new' } }))
  }
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: vocabData }, cards] = await Promise.all([
        supabase
          .from('vocabulary')
          .select('id, word, reading, meaning, sort_order')
          .eq('language', track.language)
          .eq('system', track.system)
          .eq('level', track.current_level)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        getTrackCards(session.user.id, track, {
          level: track.current_level,
          columns: 'vocab_id, state, learned, stability, lapses',
        }),
      ])
      if (cancelled) return
      setVocab(vocabData || [])
      const map = {}
      for (const c of cards) map[c.vocab_id] = c
      setCardByVocab(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vocab
      .map(v => ({ ...v, status: statusOf(cardByVocab[v.id]) }))
      .filter(v => filter === 'all' || v.status === filter)
      .filter(v => !q
        || (v.word || '').toLowerCase().includes(q)
        || (v.reading || '').toLowerCase().includes(q)
        || (v.meaning || '').toLowerCase().includes(q))
  }, [vocab, cardByVocab, filter, query])

  const counts = useMemo(() => {
    const c = { all: vocab.length, new: 0, learning: 0, learned: 0, mastered: 0 }
    for (const v of vocab) c[statusOf(cardByVocab[v.id])] += 1
    return c
  }, [vocab, cardByVocab])

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '24px 16px 56px' : '38px 32px 72px',
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookA size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <SecondaryButton onClick={onBack} icon={ArrowLeft}>Back</SecondaryButton>

        <div style={{ margin: '24px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800 }}>
            <BookA size={17} strokeWidth={1.85} color={accentHex} /> Word list
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: isMobile ? '30px' : '36px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
            Your words
          </h1>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            {systemLabel} · {levelLabel} · {vocab.length} words
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={17} strokeWidth={2} color="var(--text-faint)" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search word, reading, or meaning"
            aria-label="Search words"
            style={{
              width: '100%', height: '46px', padding: '0 16px 0 42px',
              borderRadius: '14px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              fontSize: '14px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {[
            { key: 'all', label: 'All', color: accentHex },
            { key: 'new', ...STATUS.new },
            { key: 'learning', ...STATUS.learning },
            { key: 'learned', ...STATUS.learned },
            { key: 'mastered', ...STATUS.mastered },
          ].map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '8px 14px', borderRadius: '999px', cursor: 'pointer',
                  border: '1px solid ' + (active ? f.color + '66' : 'var(--border)'),
                  background: active ? f.color + '14' : 'var(--surface)',
                  color: active ? f.color : 'var(--text-muted)',
                  fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                }}
              >
                {f.label}
                <span style={{ fontWeight: 600, opacity: 0.75 }}>{counts[f.key]}</span>
              </button>
            )
          })}
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div style={{
            textAlign: 'center', color: 'var(--text-muted)', padding: '48px 20px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px',
          }}>
            No words match{query ? ' "' + query + '"' : ' this filter'}.
          </div>
        ) : (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '18px', overflow: 'hidden', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
          }}>
            {rows.map((v, i) => {
              const st = STATUS[v.status]
              return (
                <button key={v.id} type="button"
                  onClick={() => setSelected({ word: v.word, vocab: v, status: v.status })}
                  style={{
                  width: '100%', font: 'inherit', textAlign: 'left', cursor: 'pointer', background: 'none',
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'minmax(0,1fr) auto' : '110px minmax(0,1fr) auto',
                  gap: '14px', alignItems: 'center',
                  padding: '13px 18px',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}>
                  {isMobile ? (
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: '19px', fontFamily: langFont, color: 'var(--text)', marginRight: '10px' }}>{v.word}</span>
                      <span style={{ fontSize: '13px', color: accentHex, fontWeight: 600 }}>{v.reading}</span>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cleanMeaning(v.meaning)}
                      </div>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '20px', fontFamily: langFont, color: 'var(--text)' }}>{v.word}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: accentHex, fontWeight: 600 }}>{v.reading}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cleanMeaning(v.meaning)}
                        </div>
                      </div>
                    </>
                  )}
                  <span style={{
                    fontSize: '11.5px', fontWeight: 750, color: st.color,
                    background: st.color + '14', border: '1px solid ' + st.color + '2E',
                    padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

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
