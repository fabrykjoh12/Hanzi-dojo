import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import {
  pickAssessmentQuestions, buildBands, estimateKnownFrontier,
  estimateReadingPercent, levelLabelForFrontier,
} from './assessment'
import { languageTheme } from './languageTheme'
import { BRAND_NAME } from './brand'
import { track, EVENTS } from './analytics'
import { shareReadingCard } from './shareCard'
import corpus from '../data/assessment-corpus.chinese.json'

// v1: Chinese only. The corpus + copy are Chinese; the logic is data-driven so a
// later language just needs its own corpus and this constant made dynamic.
const LANGUAGE = 'chinese'
const PER_BAND = 3

// Signed-out (or signed-in) public page: a ~60-second word quiz that estimates how
// much everyday Chinese the visitor can read, then funnels to signup. Thin shell
// over the pure logic in assessment.js.
export default function HowMuchCanYouRead() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('intro')   // intro | loading | quiz | result | error
  const [vocab, setVocab] = useState([])
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState([])     // [{ bandKey, correct }]
  const [result, setResult] = useState(null)     // { pct, label }
  const [signedIn, setSignedIn] = useState(false)

  const theme = languageTheme(LANGUAGE)
  const accent = theme.accentHex

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!(data && data.session)))
    document.title = 'How much can you read? · ' + BRAND_NAME
    return () => { document.title = BRAND_NAME }
  }, [])

  async function start() {
    setPhase('loading')
    track(EVENTS.ASSESSMENT_STARTED, { language: LANGUAGE })
    try {
      const { data, error } = await supabase.rpc('public_assessment_vocab', { p_language: LANGUAGE })
      const rows = Array.isArray(data) ? data : []
      const qs = pickAssessmentQuestions(rows, { perBand: PER_BAND, language: LANGUAGE })
      if (error || qs.length < 4) {
        if (error) console.error('public_assessment_vocab RPC failed', error)
        setPhase('error')
        return
      }
      setVocab(rows)
      setQuestions(qs)
      setIdx(0)
      setAnswers([])
      setPhase('quiz')
    } catch (e) {
      console.error('assessment load failed', e)
      setPhase('error')
    }
  }

  function answer(option) {
    const q = questions[idx]
    const next = [...answers, { bandKey: q.bandKey, correct: option === q.correct }]
    if (idx + 1 < questions.length) {
      setAnswers(next)
      setIdx(idx + 1)
      return
    }
    // Last question — score it.
    const bands = buildBands(vocab)
    const { frontierIndex, knownVocabIds } = estimateKnownFrontier(next, bands)
    const pct = estimateReadingPercent(knownVocabIds, vocab, corpus, LANGUAGE)
    const label = levelLabelForFrontier(frontierIndex, bands)
    setAnswers(next)
    setResult({ pct, label })
    track(EVENTS.ASSESSMENT_COMPLETED, { language: LANGUAGE, pct, label })
    setPhase('result')
  }

  function goSignup() {
    track(EVENTS.ASSESSMENT_SIGNUP_CLICKED, { language: LANGUAGE })
    navigate('/')
  }

  async function share() {
    try {
      await shareReadingCard({
        knownPct: result.pct,
        languageName: theme.languageName,
        everyday: true,
        accentHex: accent,
        langFont: theme.font,
      })
    } catch { /* user cancelled share / clipboard — no-op */ }
  }

  const pageStyle = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: '32px 16px' }
  const cardStyle = { width: '100%', maxWidth: '560px', alignSelf: 'center' }

  if (phase === 'loading') {
    return <div style={pageStyle}><div style={{ alignSelf: 'center', color: accent, fontSize: '32px' }}>读</div></div>
  }

  if (phase === 'error') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Couldn't load the test</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Please try again in a moment.</div>
          <button onClick={start} style={ctaStyle(accent)}>Try again</button>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ color: accent, fontWeight: 700, fontFamily: 'Poppins, Inter, sans-serif', marginBottom: '24px' }}>{BRAND_NAME}</div>
          <div style={{ fontSize: '56px', marginBottom: '8px', fontFamily: theme.font + ', sans-serif' }}>读</div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 10px' }}>How much Chinese can you read?</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 28px' }}>A quick quiz — about 60 seconds — estimates how much everyday Chinese you can already read. No account needed.</p>
          <button onClick={start} style={ctaStyle(accent)}>Start the 60-second test</button>
        </div>
      </div>
    )
  }

  if (phase === 'quiz') {
    const q = questions[idx]
    const pctThrough = Math.round((idx / questions.length) * 100)
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', marginBottom: '28px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pctThrough + '%', background: accent, transition: 'width .25s' }} />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
            Question {idx + 1} of {questions.length} · {q.promptLabel} → {q.answerLabel}
          </div>
          <div style={{
            fontSize: q.big ? '40px' : '22px', fontWeight: 700, margin: '6px 0 24px',
            fontFamily: q.big ? theme.font + ', sans-serif' : 'inherit',
          }}>
            {q.prompt}
            {q.promptReading ? <span style={{ display: 'block', fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>{q.promptReading}</span> : null}
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => answer(opt)} style={{
                padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600,
                textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: q.big ? '16px' : '18px',
                fontFamily: q.big ? 'inherit' : theme.font + ', sans-serif',
              }}>
                {opt}
                {q.optionReadings && q.optionReadings[opt] ? <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>{q.optionReadings[opt]}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // result
  return (
    <div style={pageStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ color: accent, fontWeight: 700, fontFamily: 'Poppins, Inter, sans-serif', marginBottom: '20px' }}>{BRAND_NAME}</div>
        <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>You can read about</div>
        <div style={{ color: accent, fontWeight: 800, fontSize: '72px', lineHeight: 1.1 }}>~{result.pct}%</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>of everyday Chinese</div>
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '24px' }}>You're {result.label}</div>

        <button onClick={share} style={{ ...ctaStyle(accent), background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: '10px' }}>
          Share my result
        </button>
        {signedIn ? (
          <button onClick={() => navigate('/')} style={ctaStyle(accent)}>Back to {BRAND_NAME}</button>
        ) : (
          <>
            <button onClick={goSignup} style={ctaStyle(accent)}>Sign up free to learn the words you're missing</button>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '10px' }}>Free forever. We'll start you at the right level.</div>
          </>
        )}
      </div>
    </div>
  )
}

function ctaStyle(accent) {
  return { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: accent, color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }
}
