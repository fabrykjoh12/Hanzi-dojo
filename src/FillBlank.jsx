import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { markWordDue } from './practiceSignal'
import {
  ArrowLeft, AlignLeft, Check, X, RotateCcw, CheckCircle2, Sparkles,
} from 'lucide-react'

const QUESTION_COUNT = 12
const XP_PER_CORRECT = 4

function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Each question blanks the target word out of its example sentence. Distractors
// are other words from the same level.
function buildQuestions(pool) {
  const usable = pool.filter(v => v.example_sentence && v.example_sentence.indexOf(v.word) !== -1)
  if (usable.length < 4) return []
  return shuffle(usable).slice(0, Math.min(QUESTION_COUNT, usable.length)).map(v => {
    // Blank EVERY occurrence of the word — if it appears twice, a visible second
    // occurrence would give the answer away. `parts` are the fragments between
    // blanks (split never misses: usable guarantees at least one occurrence).
    const parts = v.example_sentence.split(v.word)
    const distractors = shuffle(pool.filter(o => o.id !== v.id && o.word !== v.word)).slice(0, 3)
    return { vocab: v, parts, options: shuffle([v, ...distractors]) }
  })
}

export default function FillBlank({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function load() {
    setLoading(true)
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id, word, reading, meaning, example_sentence, example_reading, example_translation')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
    setQuestions(buildQuestions(vocab || []))
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = questions[idx]

  function choose(opt) {
    if (picked !== null) return
    setPicked(opt.id)
    if (opt.id === q.vocab.id) setCorrectCount(c => c + 1)
    else markWordDue(session, q.vocab.id)
  }

  function finish(finalCorrect) {
    setDone(true)
    const gain = finalCorrect * XP_PER_CORRECT
    if (gain > 0) {
      const newTotal = (profile.total_xp || 0) + gain
      supabase.from('profiles').update({ total_xp: newTotal }).eq('id', session.user.id).then(() => {})
      if (onUpdate) onUpdate({ total_xp: newTotal })
    }
  }

  function next() {
    if (idx + 1 >= questions.length) finish(correctCount)
    else { setPicked(null); setIdx(i => i + 1) }
  }

  function restart() {
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
    load()
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '26px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px rgba(24,24,27,0.06)' }}>
            <AlignLeft size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div style={pageShell}>
        <Centered>
          <AlignLeft size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>No sentences here yet</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            This level needs a few example sentences before fill-in-the-blank can run.
          </p>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
        </Centered>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100)
    return (
      <div style={pageShell}>
        <Centered wide>
          <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentHex + '10', border: '1px solid ' + accentHex + '18' }}>
            <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Sentences complete</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
            You filled <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} correctly.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
            <div style={{ padding: '16px 10px', borderRadius: '14px', background: accentHex + '0D', border: '1px solid ' + accentHex + '22' }}>
              <div style={{ fontSize: '26px', fontWeight: 760, color: accentHex, lineHeight: 1 }}>{pct}%</div>
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
        </Centered>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 750 }}>
            <AlignLeft size={17} strokeWidth={1.8} color={accentHex} /> Fill in the blank
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{systemLabel} · {levelLabel}</div>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '14px 0 22px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: accentHex, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        {/* Sentence with blank */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px 22px', marginBottom: '12px', textAlign: 'center', boxShadow: '0 10px 30px rgba(24,24,27,0.05)' }}>
          <div style={{ fontSize: isMobile ? '22px' : '26px', lineHeight: 1.7, fontFamily: langFont, color: 'var(--text)' }}>
            {q.parts.map((part, i) => (
              <span key={i}>
                {i > 0 && (
            <span style={{
              display: 'inline-block', minWidth: '64px', textAlign: 'center',
              borderBottom: '2px solid ' + (answered ? '#2F9E6D' : accentHex),
              color: answered ? '#2F9E6D' : 'transparent', fontWeight: 600, padding: '0 6px',
            }}>
              {answered ? q.vocab.word : ' '}
            </span>
                )}
                {part}
              </span>
            ))}
          </div>
        </div>
        {q.vocab.example_translation && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '22px', fontStyle: 'italic' }}>
            {q.vocab.example_translation}
          </div>
        )}

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {q.options.map(opt => {
            const isCorrect = opt.id === q.vocab.id
            const isPicked = opt.id === picked
            let bc = 'var(--border)', bg = 'var(--surface)'
            if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
            else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
            return (
              <button key={opt.id} onClick={() => choose(opt)} disabled={answered} style={{
                position: 'relative', minHeight: '64px', padding: '12px 14px', borderRadius: '14px',
                border: '1.5px solid ' + bc, background: bg, cursor: answered ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                transition: 'border-color 140ms ease, background 140ms ease',
              }}>
                <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text)', fontFamily: langFont, lineHeight: 1.2 }}>{opt.word}</span>
                {answered && (isCorrect || isPicked) && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.reading}</span>
                )}
                {answered && isCorrect && <Check size={16} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '9px', right: '9px' }} />}
                {answered && isPicked && !isCorrect && <X size={16} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '9px', right: '9px' }} />}
              </button>
            )
          })}
        </div>

        {answered && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ padding: '14px 18px', borderRadius: '14px', textAlign: 'center', marginBottom: '14px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '20px', fontFamily: langFont, color: 'var(--text)' }}>{q.vocab.word}</span>
              <span style={{ fontSize: '14px', color: accentHex, marginLeft: '10px', fontWeight: 600 }}>{q.vocab.reading}</span>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>{cleanMeaning(q.vocab.meaning)}</div>
            </div>
            <PrimaryButton onClick={next} icon={Sparkles}>{idx + 1 >= questions.length ? 'See results' : 'Next'}</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

function Centered({ children, wide }) {
  return (
    <div style={{ maxWidth: wide ? '760px' : '520px', margin: '0 auto', minHeight: '74vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '520px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '42px 36px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

function PrimaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
      width: '100%', minHeight: '52px', borderRadius: '16px', border: 'none',
      background: hovered ? '#5C7155' : '#6E8466', color: '#fff',
      fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
      transition: 'background 160ms ease, transform 160ms ease', transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
    }}>
      {Icon && <Icon size={18} strokeWidth={2.1} color="#fff" />}
      {children}
    </button>
  )
}

function SecondaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      minHeight: '44px', padding: '0 16px', borderRadius: '12px',
      border: '1px solid var(--border)', background: hovered ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
      cursor: 'pointer', transition: 'background 160ms ease',
    }}>
      {Icon && <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />}
      {children}
    </button>
  )
}
