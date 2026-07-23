import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'
import { cleanMeaning } from './cleanMeaning'
import { languageTheme } from './languageTheme'
import { charBreakdown } from './stuckWord'
import { TONE_CLASS } from './toneColor'
import { flashcardAudio, loadTtsAudio } from './ttsAudio'
import { getDictEntryByWord } from './dictSearch'
import AudioButton from './AudioButton'
import { X, Sparkles } from 'lucide-react'

// Stuck-word coach: a calm bottom-sheet that meets a word that keeps slipping
// from a fresh angle — slow audio, the word inside a real sentence, and (for
// Chinese) a character-by-character breakdown. Recombines data we already have;
// no writes. Portaled to <body> like WordLookupSheet so it escapes the app
// shell's stacking context on mobile.
export default function StuckWordCoach({ vocab, onClose }) {
  const [tts, setTts] = useState(null)              // { id, audio } once tts_audio loads
  const [glosses, setGlosses] = useState({ word: null, map: {} })  // char -> gloss (Chinese)

  const language = vocab && vocab.language
  const isChinese = language === 'chinese'
  const theme = languageTheme(language)
  const accent = theme.accentHex

  useEffect(() => {
    if (!vocab) return
    let cancelled = false

    // Load the tts_audio rows, then record the upgraded (slow) variants. The
    // legacy word clip is available synchronously in render below, so nothing is
    // set in the effect body (the repo lints react-hooks/set-state-in-effect).
    loadTtsAudio('vocabulary', [vocab.id])
      .then(() => { if (!cancelled) setTts({ id: vocab.id, audio: flashcardAudio(vocab) }) })
      .catch(() => { /* legacy clip still renders */ })

    // Per-character glosses for the breakdown (Chinese multi-character only).
    // Keyed by word so a stale map from a previous word is ignored in render
    // rather than cleared with a synchronous setState here.
    if (isChinese) {
      const chars = [...new Set([...(vocab.word || '')])].filter(c => c.trim())
      if (chars.length > 1) {
        Promise.all(chars.map(c =>
          getDictEntryByWord(supabase, c).then(e => [c, e]).catch(() => [c, null])
        )).then(pairs => {
          if (cancelled) return
          const m = {}
          for (const [c, e] of pairs) {
            if (e && Array.isArray(e.definitions) && e.definitions.length) m[c] = e.definitions[0]
          }
          setGlosses({ word: vocab.word, map: m })
        })
      }
    }
    return () => { cancelled = true }
  }, [vocab, isChinese])

  if (!vocab) return null
  if (typeof document === 'undefined') return null

  // Legacy word clip is available synchronously; the slow/sentence variants
  // arrive once tts_audio loads (keyed by id so a prior word's clips don't leak).
  const audio = (tts && tts.id === vocab.id) ? tts.audio : flashcardAudio(vocab)
  const wordAudioUrl = audio && (audio.word_slow || audio.word)
  const sentenceAudioUrl = audio && audio.sentence
  const parts = isChinese ? charBreakdown(vocab.word, vocab.reading) : []
  const showBreakdown = isChinese && parts.length > 1
  const glossMap = glosses.word === vocab.word ? glosses.map : {}

  return createPortal(
    <div onClick={onClose} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
      <div onClick={e => e.stopPropagation()} className="hd-sheet-up" style={{ width: '100%', maxWidth: '560px', maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px', boxShadow: '0 -10px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 800, color: accent }}>
            <Sparkles size={15} strokeWidth={2} color={accent} /> A different angle
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex' }}>
            <X size={20} color="var(--text-muted)" />
          </button>
        </div>

        {/* 1. Anchor — the word, reading, meaning, slow audio */}
        <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
          <div style={{ fontSize: '46px', fontWeight: 800, fontFamily: theme.font, lineHeight: 1.15 }}>
            {isChinese
              ? parts.map((p, i) => <span key={i} className={TONE_CLASS[p.tone]}>{p.char}</span>)
              : <span style={{ color: 'var(--text)' }}>{vocab.word}</span>}
          </div>
          {vocab.reading && <div style={{ fontSize: '17px', color: '#B45309', fontWeight: 600, marginTop: '6px' }}>{vocab.reading}</div>}
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{cleanMeaning(vocab.meaning)}</div>
          {wordAudioUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
              <AudioButton url={wordAudioUrl} label={'Play ' + vocab.word + ' slowly'} icon="slow" text="Hear it slowly" accentHex={accent} preload />
            </div>
          )}
        </div>

        {/* 2. In a sentence */}
        {vocab.example_sentence && (
          <Section title="In a sentence" accent={accent}>
            <div style={{ fontSize: '19px', fontFamily: theme.font, color: 'var(--text)', lineHeight: 1.6 }}>{vocab.example_sentence}</div>
            {vocab.example_reading && <div style={{ fontSize: '13px', color: accent, marginTop: '4px', fontWeight: 600 }}>{vocab.example_reading}</div>}
            {vocab.example_translation && <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>{vocab.example_translation}</div>}
            {sentenceAudioUrl && (
              <div style={{ marginTop: '10px' }}>
                <AudioButton url={sentenceAudioUrl} label="Play the example sentence" icon="play" tone="quiet" accentHex={accent} />
              </div>
            )}
          </Section>
        )}

        {/* 3. Character by character (Chinese) */}
        {showBreakdown && (
          <Section title="Character by character" accent={accent}>
            <div style={{ display: 'grid', gap: '8px' }}>
              {parts.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className={TONE_CLASS[p.tone]} style={{ fontSize: '30px', fontWeight: 700, fontFamily: theme.font, lineHeight: 1, flexShrink: 0 }}>{p.char}</span>
                  <div style={{ minWidth: 0 }}>
                    {p.pinyin && <div style={{ fontSize: '13px', color: accent, fontWeight: 600 }}>{p.pinyin}</div>}
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{glossMap[p.char] || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, accent, children }) {
  return (
    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>{title}</div>
      {children}
    </div>
  )
}
