import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { calculateStoryReadability, buildVocabMatcher, segmentLine, namesFor, particlesFor, wordStatus } from './storyReading'
import WordLookupSheet from './WordLookupSheet'
import { track as trackEvent, EVENTS } from './analytics'
import { ArrowLeft, ScanText, Bookmark, Sparkles } from 'lucide-react'

// Known-Content Analyzer: paste any text, see how much of it you can already
// read. Reuses the exact readability engine the story reader / recap rank with
// (calculateStoryReadability), so the "% known" here matches the rest of the app.
export default function Analyzer({ session, track, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(track.language)
  const accent = theme.accentHex
  const font = theme.font
  const langName = theme.languageName

  const [vocabMap, setVocabMap] = useState(null) // null = still loading
  const [cards, setCards] = useState({})
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addedCount, setAddedCount] = useState(0)
  const [selected, setSelected] = useState(null)   // tapped word → lookup sheet

  const ttsLang = track.language === 'japanese' ? 'ja-JP' : track.language === 'chinese' ? 'zh-CN' : 'ru-RU'
  const speakWord = (t) => {
    if (!t) return
    try { const u = new SpeechSynthesisUtterance(t); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  // Tokenize the analyzed text for the tap-to-read view (same matcher the reader
  // and the % use, so highlighting ⇔ the counted status).
  const matcher = useMemo(() => (vocabMap ? buildVocabMatcher(vocabMap, track.language) : null), [vocabMap, track.language])
  const names = useMemo(() => namesFor(track.language), [track.language])
  const particles = useMemo(() => particlesFor(track.language), [track.language])
  const parsedLines = useMemo(() => {
    if (!result || !matcher) return []
    return text.split('\n').filter(l => l.trim()).map(line => ({ line, tokens: segmentLine(line, matcher, names, particles) }))
  }, [result, matcher, names, particles, text])

  // Load the track's full vocabulary + the user's cards once, mirroring the
  // Stories screen so word-matching and status are computed identically.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: vocab } = await supabase.from('vocabulary').select('*')
          .eq('language', track.language).eq('system', track.system).eq('is_active', true)
        const { data: cardRows } = await supabase.from('cards')
          .select('vocab_id, is_easy, state').eq('user_id', session.user.id)
        if (cancelled) return
        const vm = {}
        ;(vocab || []).forEach(v => { vm[v.word] = v })
        const cm = {}
        ;(cardRows || []).forEach(c => { cm[c.vocab_id] = c })
        setVocabMap(vm)
        setCards(cm)
      } catch {
        if (!cancelled) setVocabMap({})
      }
    }
    load()
    return () => { cancelled = true }
    // Load once for the active track; a language switch remounts the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const analyze = () => {
    if (!text.trim() || !vocabMap) return
    setAddedCount(0)
    const r = calculateStoryReadability({ content: text, vocabMap, cards, language: track.language })
    setResult(r)
    trackEvent(EVENTS.TEXT_ANALYZED, { known_pct: r.knownPct, total_unique: r.totalUnique, new_count: r.newCount })
  }

  const addAll = async () => {
    if (adding || !result || result.newWords.length === 0) return
    setAdding(true)
    const rows = result.newWords.map(v => ({
      user_id: session.user.id, vocab_id: v.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('cards').insert(rows)
    if (!error) {
      const added = result.newWords.length
      const next = { ...cards }
      result.newWords.forEach(v => { next[v.id] = { vocab_id: v.id, is_easy: false, state: 'new' } })
      setCards(next)
      setAddedCount(added)
      // Re-run so the breakdown reflects the just-added words (now "learning").
      setResult(calculateStoryReadability({ content: text, vocabMap, cards: next, language: track.language }))
    }
    setAdding(false)
  }

  // Add one tapped word, remembering the sentence it was read in (mining), then
  // re-run the breakdown so the % and highlights update live.
  const addOne = async (vocab, sentence) => {
    if (!vocab || !vocab.id || cards[vocab.id]) return
    const row = {
      user_id: session.user.id, vocab_id: vocab.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
      source_sentence: sentence || null,
    }
    let { error } = await supabase.from('cards').insert(row)
    if (error && /source_sentence/.test(error.message || '')) {
      const { source_sentence, ...rest } = row
      void source_sentence
      ;({ error } = await supabase.from('cards').insert(rest))
    }
    if (!error) {
      const next = { ...cards, [vocab.id]: { vocab_id: vocab.id, is_easy: false, state: 'new' } }
      setCards(next)
      setResult(calculateStoryReadability({ content: text, vocabMap, cards: next, language: track.language }))
    }
  }

  const loading = vocabMap === null
  const seg = (n) => (result && result.totalUnique ? Math.round((n / result.totalUnique) * 100) : 0)

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '24px 16px 48px' : '40px 32px 64px' }}>
      <button onClick={onBack} style={ghostBtn}>
        <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Practice
      </button>

      <div style={{ margin: '18px 0 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accent, fontSize: '13px', fontWeight: 800 }}>
          <ScanText size={17} strokeWidth={1.85} color={accent} /> Analyze text
        </div>
        <h1 style={{ margin: '8px 0 0', fontSize: isMobile ? '28px' : '34px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
          How much can you read?
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
          Paste any {langName} text — a message, an article, song lyrics — and see how much you already know, plus the words to learn next.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Paste ${langName} text here…`}
        rows={7}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: '14px',
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
          fontSize: '16px', lineHeight: 1.7, fontFamily: font + ', Inter, sans-serif', resize: 'vertical',
        }}
      />

      <button
        onClick={analyze}
        disabled={loading || !text.trim()}
        style={{
          marginTop: '14px', width: '100%', minHeight: '50px', borderRadius: '14px', border: 'none',
          background: (loading || !text.trim()) ? 'var(--border)' : accent,
          color: (loading || !text.trim()) ? 'var(--text-muted)' : '#fff',
          fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
          cursor: (loading || !text.trim()) ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
        }}
      >
        <ScanText size={18} strokeWidth={2.1} color={(loading || !text.trim()) ? 'var(--text-muted)' : '#fff'} />
        {loading ? 'Loading your vocabulary…' : 'Analyze'}
      </button>

      {result && (
        <div style={{ marginTop: '22px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px' }}>
          {result.totalUnique === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
              No {langName} words recognized in that text. Make sure you pasted {langName} — this reads it against your {langName} deck.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px' }}>
                <span style={{ fontSize: '44px', fontWeight: 850, color: accent, lineHeight: 1 }}>{result.knownPct}%</span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>of the words here, you already know</span>
              </div>

              <div style={{ display: 'flex', height: '9px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)', marginBottom: '10px' }}>
                <div style={{ width: seg(result.knownCount) + '%', background: '#2F9E6D' }} />
                <div style={{ width: seg(result.learningCount) + '%', background: '#CA8A04' }} />
                <div style={{ width: seg(result.newCount) + '%', background: accent + '66' }} />
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: result.newWords.length ? '18px' : 0 }}>
                {result.knownCount} known · {result.learningCount} learning · {result.newCount} new
                <span style={{ opacity: 0.7 }}> · {result.totalUnique} unique {langName} words</span>
              </div>

              {addedCount > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', margin: '2px 0 14px', padding: '7px 13px', borderRadius: '999px', background: accent + '12', border: '1px solid ' + accent + '2A', color: accent, fontSize: '13px', fontWeight: 700 }}>
                  <Sparkles size={14} strokeWidth={2} color={accent} /> Added {addedCount} word{addedCount === 1 ? '' : 's'} to your deck
                </div>
              )}

              {result.newWords.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text)', marginBottom: '4px' }}>
                    Words to learn next ({result.newWords.length})
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    The new words in this text, in order of appearance.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {result.newWords.slice(0, 40).map(v => (
                      <span key={v.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', padding: '5px 10px', borderRadius: '999px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <span style={{ fontFamily: font, fontSize: '15px', color: 'var(--text)' }}>{v.word}</span>
                        {v.reading && v.reading !== v.word && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.reading}</span>}
                      </span>
                    ))}
                    {result.newWords.length > 40 && (
                      <span style={{ padding: '5px 10px', fontSize: '12.5px', color: 'var(--text-muted)' }}>+{result.newWords.length - 40} more</span>
                    )}
                  </div>
                  <button
                    onClick={addAll}
                    disabled={adding}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      minHeight: '46px', padding: '0 20px', borderRadius: '13px', border: 'none',
                      background: accent, color: '#fff', cursor: adding ? 'default' : 'pointer',
                      fontSize: '14px', fontWeight: 750, fontFamily: 'Inter, sans-serif', opacity: adding ? 0.7 : 1,
                    }}
                  >
                    <Bookmark size={17} strokeWidth={2} color="#fff" />
                    {adding ? 'Adding…' : `Add ${result.newWords.length} to my deck`}
                  </button>
                </div>
              )}

              {result.newWords.length === 0 && result.newCount === 0 && (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  You already know or are learning every word here — nice.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Read it — tap any word to look it up and add it, against your known deck. */}
      {result && result.totalUnique > 0 && parsedLines.length > 0 && (
        <div style={{ marginTop: '18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px' }}>
          <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text)', marginBottom: '4px' }}>Read it — tap any word</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            New words are underlined. Tap any word to hear it, see the meaning, and add it to your deck.
          </div>
          <div style={{ fontFamily: font + ', Inter, sans-serif', fontSize: '19px', lineHeight: 2 }}>
            {parsedLines.map((pl, li) => (
              <p key={li} style={{ margin: '0 0 10px' }}>
                {pl.tokens.map((t, k) => {
                  if (!t.vocab) return <span key={k}>{t.text}</span>
                  const status = wordStatus(t.vocab.id, cards)
                  return (
                    <span
                      key={k}
                      onClick={() => setSelected({ word: t.vocab.word, vocab: t.vocab, status, sentence: pl.line })}
                      style={{
                        cursor: 'pointer', borderRadius: '4px', padding: '0 1px',
                        background: status === 'not_started' ? accent + '1f' : (status === 'learning' ? '#CA8A0422' : 'transparent'),
                        boxShadow: status === 'not_started' ? 'inset 0 -2px 0 ' + accent + '66' : 'none',
                      }}
                    >{t.text}</span>
                  )
                })}
              </p>
            ))}
          </div>
        </div>
      )}

      <WordLookupSheet
        selected={selected}
        theme={theme}
        accent={accent}
        userCards={cards}
        onAddToDeck={(v) => addOne(v, selected && selected.sentence)}
        onSpeak={speakWord}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  minHeight: '40px', padding: '0 14px', borderRadius: '12px',
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
  fontFamily: 'Inter, sans-serif', cursor: 'pointer',
}
