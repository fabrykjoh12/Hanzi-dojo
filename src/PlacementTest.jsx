import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { shuffle } from './utils'
import { PLACEMENT_QUESTION_COUNT, PLACEMENT_PASS_RATIO } from './tiers'
import { cleanMeaning } from './cleanMeaning'
import { Check, X, ShieldCheck } from 'lucide-react'

// Build up to `count` multiple-choice questions from a level's vocabulary.
// Mixes prompt→answer directions (meaning→word and word→meaning) with three
// distractors drawn from the same level, so the test really probes command of
// that level's words. Pure given its inputs (randomness aside).
function buildQuestions(vocab, language, count) {
  const usable = (vocab || []).filter(v => v.word && v.meaning)
  if (usable.length < 4) return []
  const picked = shuffle(usable).slice(0, Math.min(count, usable.length))
  return picked.map(v => {
    const wrong = shuffle(usable.filter(w => w.id !== v.id)).slice(0, 3)
    const toEnglish = Math.random() > 0.5
    if (toEnglish) {
      const options = shuffle([v, ...wrong].map(w => cleanMeaning(w.meaning)))
      return {
        prompt: v.word,
        promptReading: v.reading,
        promptLabel: language === 'japanese' ? 'Japanese' : language === 'russian' ? 'Russian' : 'Chinese',
        answerLabel: 'English',
        options,
        correct: cleanMeaning(v.meaning),
        optionReadings: null,
        big: true,
      }
    }
    const wordOptions = shuffle([v, ...wrong].map(w => ({ word: w.word, reading: w.reading })))
    return {
      prompt: cleanMeaning(v.meaning),
      promptReading: null,
      promptLabel: 'English',
      answerLabel: language === 'japanese' ? 'Japanese' : language === 'russian' ? 'Russian' : 'Chinese',
      options: wordOptions.map(o => o.word),
      correct: v.word,
      optionReadings: language === 'japanese'
        ? wordOptions.reduce((acc, o) => { acc[o.word] = o.reading; return acc }, {})
        : null,
      big: false,
    }
  })
}

// A short placement quiz shown when the user claims Intermediate/Professional.
// Passing (≥ PLACEMENT_PASS_RATIO correct) proves the level and lets onboarding
// skip ahead to it; failing keeps them from claiming a level they can't read.
export default function PlacementTest({
  language, system, level, accentHex, fontFamily, tierLabel, levelLabel,
  onPass, onCancel, onFallback,
}) {
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [phase, setPhase] = useState('quiz')   // 'quiz' | 'result' | 'unavailable'
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vocabulary')
      .select('id, word, reading, meaning')
      .eq('language', language)
      .eq('system', system)
      .eq('level', level)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        const qs = buildQuestions(data || [], language, PLACEMENT_QUESTION_COUNT)
        if (qs.length < 4) { setPhase('unavailable'); setLoading(false); return }
        setQuestions(qs)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [language, system, level])

  const q = questions[index]
  const total = questions.length
  const passThreshold = Math.ceil(total * PLACEMENT_PASS_RATIO)

  const choose = (opt) => {
    if (selected != null) return
    setSelected(opt)
    if (opt === q.correct) setCorrectCount(c => c + 1)
  }

  const next = () => {
    const wasLast = index >= total - 1
    if (wasLast) {
      const didPass = correctCount >= passThreshold
      setPassed(didPass)
      setPhase('result')
      return
    }
    setIndex(i => i + 1)
    setSelected(null)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: '30px', color: accentHex, fontFamily: "'Noto Sans SC'" }}>学</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>Preparing your placement test…</div>
      </div>
    )
  }

  if (phase === 'unavailable') {
    return (
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
          Not available yet
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
          There isn’t enough content at {levelLabel} for a placement test yet. You can start at Beginner for now.
        </p>
        <button onClick={onCancel} style={primaryBtn(accentHex)}>Back to levels</button>
      </div>
    )
  }

  if (phase === 'result') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: passed ? '#2F9E6D18' : '#DC262618',
          border: '1px solid ' + (passed ? '#2F9E6D40' : '#DC262640'),
        }}>
          {passed
            ? <ShieldCheck size={28} strokeWidth={2} color="#2F9E6D" />
            : <X size={28} strokeWidth={2.4} color="#DC2626" />}
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '6px', fontFamily: 'Inter, sans-serif' }}>
          {passed ? 'Level proven!' : 'Not quite'}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          You got <strong style={{ color: 'var(--text)' }}>{correctCount} / {total}</strong> correct
          {passed ? '' : ` — you need ${passThreshold} to pass`}.
        </p>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
          {passed
            ? `We’ll start you at ${tierLabel} (${levelLabel}). Earlier levels are treated as known.`
            : `No problem — you can start at Beginner and unlock ${levelLabel} as you go.`}
        </p>
        {passed ? (
          <button onClick={() => onPass(level)} style={primaryBtn(accentHex)}>
            Continue at {levelLabel}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onCancel} style={ghostBtn}>Choose again</button>
            <button onClick={onFallback} style={{ ...primaryBtn(accentHex), flex: 2 }}>Start at Beginner</button>
          </div>
        )}
      </div>
    )
  }

  // Quiz
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
          {tierLabel} · {levelLabel}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: accentHex }}>
          {index + 1} / {total}
        </span>
      </div>
      <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', marginBottom: '22px' }}>
        <div style={{ height: '100%', width: ((index) / total) * 100 + '%', background: accentHex, borderRadius: '999px', transition: 'width 200ms ease' }} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
          {q.promptLabel}
        </div>
        <div style={{
          fontSize: q.big ? '38px' : '22px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2,
          fontFamily: q.big ? fontFamily + ', sans-serif' : 'Inter, sans-serif',
        }}>
          {q.prompt}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {q.options.map((opt, i) => {
          const chosen = selected === opt
          const showCorrect = selected != null && opt === q.correct
          const showWrong = chosen && opt !== q.correct
          const border = showCorrect ? '#2F9E6D' : showWrong ? '#DC2626' : (chosen ? accentHex : 'var(--border)')
          const bg = showCorrect ? '#2F9E6D0D' : showWrong ? '#DC26260D' : 'var(--surface)'
          return (
            <button
              key={i}
              onClick={() => choose(opt)}
              disabled={selected != null}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                padding: '14px 16px', borderRadius: '12px', textAlign: 'left',
                border: '2px solid ' + border, background: bg,
                cursor: selected != null ? 'default' : 'pointer',
                fontFamily: q.answerLabel === 'English' ? 'Inter, sans-serif' : fontFamily + ', sans-serif',
                transition: 'all 0.15s',
              }}
            >
              <span>
                <span style={{ fontSize: q.answerLabel === 'English' ? '15px' : '19px', fontWeight: 600, color: 'var(--text)' }}>{opt}</span>
                {q.optionReadings && q.optionReadings[opt] && (
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'Inter, sans-serif' }}>
                    {q.optionReadings[opt]}
                  </span>
                )}
              </span>
              {showCorrect && <Check size={18} strokeWidth={2.4} color="#2F9E6D" />}
              {showWrong && <X size={18} strokeWidth={2.4} color="#DC2626" />}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button
          onClick={next}
          disabled={selected == null}
          style={{
            ...primaryBtn(accentHex), flex: 2,
            opacity: selected == null ? 0.5 : 1,
            cursor: selected == null ? 'not-allowed' : 'pointer',
          }}
        >
          {index >= total - 1 ? 'See result' : 'Next'}
        </button>
      </div>
    </div>
  )
}

function primaryBtn(accentHex) {
  return {
    width: '100%',
    padding: '13px',
    borderRadius: '12px',
    border: 'none',
    background: accentHex,
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  }
}

const ghostBtn = {
  flex: 1,
  padding: '13px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '15px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
}
