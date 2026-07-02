import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { getLevelLabel, getSystemLabel, shuffle, getAudioUrl, playAudioEl } from './utils'
import { PrimaryButton, SecondaryButton } from './ui'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { markWordDue } from './practiceSignal'
import {
  ArrowLeft, Volume2, Music2, Check, X, RotateCcw, CheckCircle2, Sparkles,
} from 'lucide-react'

const ACCENT = '#B83A24'
const QUESTION_COUNT = 15
const XP_PER_CORRECT = 4

// Accented pinyin vowel → Mandarin tone number. Falls back to numeric pinyin
// ("pin1"). Neutral = 5 only when the reading explicitly says so (trailing 5,
// or diacritic-free pinyin that contains a vowel — the standard way neutral is
// written). Returns 0 when the tone genuinely can't be determined, so callers
// can exclude the word instead of asking a silently-wrong question.
const TONE1 = 'āēīōūǖ', TONE2 = 'áéíóúǘ', TONE3 = 'ǎěǐǒǔǚ', TONE4 = 'àèìòùǜ'
function toneOf(reading) {
  const r = reading || ''
  let sawVowel = false
  for (let i = 0; i < r.length; i += 1) {
    const c = r[i]
    if (TONE1.indexOf(c) !== -1) return 1
    if (TONE2.indexOf(c) !== -1) return 2
    if (TONE3.indexOf(c) !== -1) return 3
    if (TONE4.indexOf(c) !== -1) return 4
    if (c >= '1' && c <= '5') return Number(c)
    if ('aeiouü'.indexOf(c.toLowerCase()) !== -1) sawVowel = true
  }
  return sawVowel ? 5 : 0
}

// A single Chinese character is exactly one syllable — the clean unit for a
// tone-recognition drill.
function isSingleHanzi(word) {
  const w = word || ''
  if (w.length !== 1) return false
  const code = w.charCodeAt(0)
  return code >= 0x3400 && code <= 0x9FFF
}

// Two-character words drive the tone-PAIR drill (where sandhi and rhythm live).
function isTwoHanzi(word) {
  const w = word || ''
  if (w.length !== 2) return false
  for (let i = 0; i < 2; i += 1) {
    const c = w.charCodeAt(i)
    if (c < 0x3400 || c > 0x9FFF) return false
  }
  return true
}

// "nǐ hǎo" → "3·3". Requires the reading to be space-separated into exactly two
// syllables with determinable tones; anything else returns null (excluded).
function pairTones(reading) {
  const parts = (reading || '').trim().split(' ').filter(Boolean)
  if (parts.length !== 2) return null
  const t1 = toneOf(parts[0])
  const t2 = toneOf(parts[1])
  return t1 > 0 && t2 > 0 ? t1 + '·' + t2 : null
}

const MARK_OF = { 1: 'ˉ', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '·' }

const TONES = [
  { n: 1, mark: 'ˉ', label: 'high, flat' },
  { n: 2, mark: 'ˊ', label: 'rising' },
  { n: 3, mark: 'ˇ', label: 'dipping' },
  { n: 4, mark: 'ˋ', label: 'falling' },
  { n: 5, mark: '·', label: 'neutral' },
]

export default function Tones({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const isChinese = profile.active_language === 'chinese'
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(null)                       // null → picker · 'single' | 'pairs'
  const [pools, setPools] = useState({ single: [], pairs: [] })
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)
  const audioRef = useRef(null)
  const xpAwardedRef = useRef(false)

  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function load() {
    setLoading(true)
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id, word, reading, meaning, audio_path')
      .eq('language', 'chinese')
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
    const single = (vocab || [])
      .filter(v => isSingleHanzi(v.word) && v.reading)
      .map(v => ({ ...v, kind: 'single', answer: String(toneOf(v.reading)) }))
      .filter(v => v.answer !== '0')
    const pairs = (vocab || [])
      .filter(v => isTwoHanzi(v.word) && v.reading)
      .map(v => ({ ...v, kind: 'pair', answer: pairTones(v.reading) }))
      .filter(v => v.answer)
    setPools({ single, pairs })
    setLoading(false)
  }

  // Build a round for the chosen mode. Pair questions get 4 options: the answer
  // plus distinct distractor patterns from the pool (topped up with random
  // combinations when the level has few distinct patterns).
  function start(which) {
    const pool = which === 'pairs' ? pools.pairs : pools.single
    const qs = shuffle(pool).slice(0, Math.min(QUESTION_COUNT, pool.length)).map(q => {
      if (q.kind !== 'pair') return q
      const others = shuffle([...new Set(pool.map(p => p.answer))].filter(a => a !== q.answer)).slice(0, 3)
      while (others.length < 3) {
        const cand = (1 + Math.floor(Math.random() * 4)) + '·' + (1 + Math.floor(Math.random() * 4))
        if (cand !== q.answer && others.indexOf(cand) === -1) others.push(cand)
      }
      return { ...q, options: shuffle([q.answer, ...others]) }
    })
    setMode(which)
    setQuestions(qs)
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
    xpAwardedRef.current = false
  }

  useEffect(() => {
    if (!isChinese) { setLoading(false); return }
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function playAudio(path) {
    const url = getAudioUrl(path)
    if (!url) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    const el = new Audio()
    audioRef.current = el
    playAudioEl(el, url, () => {})
  }

  const q = questions[idx]

  useEffect(() => {
    if (!loading && q && picked === null) playAudio(q.audio_path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, loading])

  function choose(val) {
    if (picked !== null) return
    setPicked(val)
    if (val === q.answer) setCorrectCount(c => c + 1)
    else markWordDue(session, q.id)
  }

  function finish() {
    setDone(true)
    if (!xpAwardedRef.current) {
      xpAwardedRef.current = true
      const gain = correctCount * XP_PER_CORRECT
      if (gain > 0) {
        awardXp(session, profile, gain, onUpdate)
      }
    }
  }

  function next() {
    if (idx + 1 >= questions.length) finish()
    else { setPicked(null); setIdx(i => i + 1) }
  }

  function restart() {
    start(mode)
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  if (!isChinese) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '520px', margin: '0 auto', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '44px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)' }}>
            <Music2 size={30} strokeWidth={1.8} color={ACCENT} style={{ marginBottom: '14px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>Tone practice is for Chinese</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              Switch your active language to Chinese to drill the four tones.
            </p>
            <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '26px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px rgba(24,24,27,0.06)' }}>
            <Music2 size={34} strokeWidth={1.75} color={ACCENT} />
          </div>
        </div>
      </div>
    )
  }

  const canSingle = pools.single.length >= 4
  const canPairs = pools.pairs.length >= 4

  if (!canSingle && !canPairs) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '520px', margin: '0 auto', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '44px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)' }}>
            <Music2 size={30} strokeWidth={1.8} color={ACCENT} style={{ marginBottom: '14px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>No tone-drill words here</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              This level has no suitable words to drill tones with yet.
            </p>
            <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  // Mode picker: single syllables (the on-ramp) or tone pairs (rhythm/sandhi).
  if (!mode) {
    const choices = [
      canSingle && { key: 'single', label: 'Single syllables', desc: 'One character, one tone', sample: '好' },
      canPairs && { key: 'pairs', label: 'Tone pairs', desc: 'Two-character words — hear the rhythm', sample: '朋友' },
    ].filter(Boolean)
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '560px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '24px 0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <Music2 size={17} strokeWidth={1.8} color={ACCENT} /> Tone practice
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Which drill?</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>Hear a word, name its tone{canPairs ? 's' : ''}.</p>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {choices.map(c => (
              <button key={c.key} onClick={() => start(c.key)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 22px', borderRadius: '16px', border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                boxShadow: '0 6px 18px rgba(24,24,27,0.05)', textAlign: 'left', gap: '14px',
              }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '16px', fontWeight: 750, color: 'var(--text)' }}>{c.label}</span>
                  <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>{c.desc}</span>
                </span>
                <span style={{ fontSize: '24px', color: ACCENT, fontFamily: "'Noto Sans SC'", flexShrink: 0 }}>{c.sample}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100)
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '520px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '42px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)' }}>
            <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ACCENT + '10', border: '1px solid ' + ACCENT + '18' }}>
              <CheckCircle2 size={28} strokeWidth={1.9} color={ACCENT} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Tones complete</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
              You heard <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} tones correctly.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
              <div style={{ padding: '16px 10px', borderRadius: '14px', background: ACCENT + '0D', border: '1px solid ' + ACCENT + '22' }}>
                <div style={{ fontSize: '26px', fontWeight: 760, color: ACCENT, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
              </div>
              <div style={{ padding: '16px 10px', borderRadius: '14px', background: '#6E84660D', border: '1px solid #6E846622' }}>
                <div style={{ fontSize: '26px', fontWeight: 760, color: '#5C7155', lineHeight: 1 }}>+{correctCount * XP_PER_CORRECT}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>XP earned</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <SecondaryButton onClick={onBack} icon={ArrowLeft}>Home</SecondaryButton>
              <PrimaryButton onClick={restart} icon={RotateCcw}>Again</PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const answered = picked !== null

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {questions.length}</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
            <Music2 size={17} strokeWidth={1.8} color={ACCENT} />
            Tone practice
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{systemLabel} · {levelLabel}</div>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '14px 0 22px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: ACCENT, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        {/* Character + audio */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '92px', fontWeight: 400, color: 'var(--text)', fontFamily: "'Noto Sans SC'", lineHeight: 1.1 }}>{q.word}</div>
          {answered && (
            <div style={{ fontSize: '20px', color: ACCENT, fontWeight: 650, marginTop: '6px' }}>{q.reading}</div>
          )}
          <button onClick={() => playAudio(q.audio_path)} aria-label="Replay audio" style={{
            marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px',
            height: '42px', padding: '0 16px', borderRadius: '12px',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
          }}>
            <Volume2 size={17} strokeWidth={1.9} color="var(--text-muted)" /> Replay
          </button>
        </div>

        {/* Tone options */}
        {q.kind === 'pair' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {q.options.map(opt => {
              const isCorrect = opt === q.answer
              const isPicked = opt === picked
              let bc = 'var(--border)', bg = 'var(--surface)'
              if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
              else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
              const parts = opt.split('·').map(Number)
              return (
                <button key={opt} onClick={() => choose(opt)} disabled={answered} style={{
                  position: 'relative', minHeight: '76px', padding: '10px 4px', borderRadius: '14px',
                  border: '1.5px solid ' + bc, background: bg, cursor: answered ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  transition: 'border-color 140ms ease, background 140ms ease',
                }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', lineHeight: 1, letterSpacing: '6px' }}>
                    {MARK_OF[parts[0]]}{MARK_OF[parts[1]]}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>{opt}</span>
                  {answered && isCorrect && <Check size={15} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '7px', right: '7px' }} />}
                  {answered && isPicked && !isCorrect && <X size={15} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '7px', right: '7px' }} />}
                </button>
              )
            })}
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {TONES.map(t => {
            const isCorrect = String(t.n) === q.answer
            const isPicked = String(t.n) === picked
            let bc = 'var(--border)', bg = 'var(--surface)'
            if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
            else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
            return (
              <button key={t.n} onClick={() => choose(String(t.n))} disabled={answered} style={{
                position: 'relative', minHeight: '84px', padding: '10px 4px', borderRadius: '14px',
                border: '1.5px solid ' + bc, background: bg, cursor: answered ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                transition: 'border-color 140ms ease, background 140ms ease',
              }}>
                <span style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{t.mark}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t.n === 5 ? '·' : t.n}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{t.label}</span>
                {answered && isCorrect && <Check size={15} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '7px', right: '7px' }} />}
                {answered && isPicked && !isCorrect && <X size={15} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '7px', right: '7px' }} />}
              </button>
            )
          })}
        </div>
        )}

        {answered && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ padding: '14px 18px', borderRadius: '14px', textAlign: 'center', marginBottom: '14px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '22px', fontFamily: "'Noto Sans SC'", color: 'var(--text)' }}>{q.word}</span>
              <span style={{ fontSize: '15px', color: ACCENT, marginLeft: '10px', fontWeight: 650 }}>{q.reading}</span>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>{cleanMeaning(q.meaning)}</div>
            </div>
            <PrimaryButton onClick={next} icon={Sparkles}>{idx + 1 >= questions.length ? 'See results' : 'Next'}</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
