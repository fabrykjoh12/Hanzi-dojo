import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { checkAnswer, getTestStatus, getAttemptsToday } from './testLogic'

export default function Test({ session, profile, onBack, onPassed }) {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [attempts, setAttempts] = useState({ count: 0, passed: false })
  const [phase, setPhase] = useState('intro') // intro | testing | results
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState([])
  const [saving, setSaving] = useState(false)

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const level = profile.active_language === 'chinese' ? profile.chinese_level : profile.japanese_level
  const levelLabel = profile.active_language === 'chinese' ? `HSK ${level}` : `JLPT N${level}`
  const isJapanese = profile.active_language === 'japanese'

  useEffect(() => { loadStatus() }, [])

  const loadStatus = async () => {
    setLoading(true)
    const s = await getTestStatus(session, profile)
    const a = await getAttemptsToday(session, profile)
    setStatus(s)
    setAttempts(a)
    setLoading(false)
  }

  const startTest = async () => {
    // Pull all vocab for this level, pick 30 random
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', profile.active_language)
      .eq('level', level)

    const shuffled = [...vocab].sort(() => Math.random() - 0.5)
    setQuestions(shuffled.slice(0, Math.min(30, shuffled.length)))
    setIndex(0)
    setAnswer('')
    setWrong([])
    setPhase('testing')
  }

  const submitAnswer = () => {
    const q = questions[index]
    const correct = checkAnswer(answer, q)
    if (!correct) setWrong(prev => [...prev, q])

    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setAnswer('')
    } else {
      finishTest(correct ? wrong : [...wrong, q])
    }
  }

  const finishTest = async (finalWrong) => {
    setSaving(true)
    const passed = finalWrong.length === 0
    const score = Math.round(((questions.length - finalWrong.length) / questions.length) * 100)

    // Record the attempt
    await supabase.from('test_attempts').insert({
      user_id: session.user.id,
      language: profile.active_language,
      level,
      score,
      passed,
    })

    // Wrong words lose Easy status and go back to the review queue
    if (finalWrong.length > 0) {
      const wrongVocabIds = finalWrong.map(w => w.id)
      await supabase
        .from('cards')
        .update({ is_easy: false, next_review: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .in('vocab_id', wrongVocabIds)
    }

    // If passed, set the test_passed flag
    if (passed) {
      const field = profile.active_language === 'chinese' ? 'chinese_test_passed' : 'japanese_test_passed'
      await supabase.from('profiles').update({ [field]: true }).eq('id', session.user.id)
    }

    setSaving(false)
    setPhase('results')
    setLastResult({ passed, score, wrongCount: finalWrong.length })
    if (passed && onPassed) onPassed()
  }

  const [lastResult, setLastResult] = useState(null)

  if (loading) {
    return <div style={center}><div style={{ fontSize: '32px', color: accent }}>学</div></div>
  }

  // LOCKED — not all words Easy yet
  if (phase === 'intro' && !status.unlocked) {
    return (
      <div style={center}>
        <div style={{ textAlign: 'center', maxWidth: '360px', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>{levelLabel} Test locked</h1>
          <p style={{ color: '#888', fontSize: '15px', marginBottom: '20px' }}>
            Mark every word as <strong>Easy</strong> in flashcards to unlock the test.
          </p>
          <div style={{ background: '#f5f5f5', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: accent }}>{status.easyWords} / {status.totalWords}</div>
            <div style={{ fontSize: '13px', color: '#888' }}>words mastered (Easy)</div>
          </div>
          <button onClick={onBack} style={{ ...btn, background: accent, color: '#fff', border: 'none' }}>Back home</button>
        </div>
      </div>
    )
  }

  // OUT OF ATTEMPTS
  if (phase === 'intro' && attempts.count >= 3 && !attempts.passed) {
    return (
      <div style={center}>
        <div style={{ textAlign: 'center', maxWidth: '360px', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>No attempts left today</h1>
          <p style={{ color: '#888', fontSize: '15px', marginBottom: '24px' }}>
            You've used all 3 attempts. Review your words and come back tomorrow.
          </p>
          <button onClick={onBack} style={{ ...btn, background: accent, color: '#fff', border: 'none' }}>Back home</button>
        </div>
      </div>
    )
  }

  // INTRO
  if (phase === 'intro') {
    return (
      <div style={center}>
        <div style={{ textAlign: 'center', maxWidth: '380px', padding: '24px' }}>
          <div style={{ fontSize: '48px', color: accent, marginBottom: '16px' }}>✍️</div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>{levelLabel} Test</h1>
          <p style={{ color: '#888', fontSize: '15px', marginBottom: '8px' }}>
            30 random words. You need <strong>100%</strong> to pass.
          </p>
          <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>
            Type the {isJapanese ? 'Japanese' : 'Chinese'} word — characters or {isJapanese ? 'romaji' : 'pinyin'} both work.
          </p>
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '24px' }}>
            Attempts today: {attempts.count} / 3
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onBack} style={{ ...btn, flex: 1, background: '#fff', border: '1px solid #e5e5e5' }}>Back</button>
            <button onClick={startTest} style={{ ...btn, flex: 2, background: accent, color: '#fff', border: 'none' }}>Start test</button>
          </div>
        </div>
      </div>
    )
  }

  // TESTING
  if (phase === 'testing') {
    const q = questions[index]
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(index / questions.length) * 100}%`, background: accent, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '8px', textAlign: 'center' }}>
            {index + 1} / {questions.length}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '12px' }}>What's the word for:</div>
          <div style={{ fontSize: '28px', fontWeight: 600, marginBottom: '32px', textAlign: 'center' }}>{q.meaning}</div>
          <input
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answer.trim() && submitAnswer()}
            placeholder="Type characters or pinyin"
            style={{
              width: '100%',
              maxWidth: '360px',
              padding: '14px 16px',
              fontSize: '18px',
              borderRadius: '12px',
              border: '1px solid #e5e5e5',
              outline: 'none',
              textAlign: 'center',
              fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
            }}
          />
          <button
            onClick={submitAnswer}
            disabled={!answer.trim()}
            style={{ ...btn, marginTop: '20px', background: accent, color: '#fff', border: 'none', opacity: answer.trim() ? 1 : 0.4, minWidth: '160px' }}
          >
            {index + 1 === questions.length ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    )
  }

  // RESULTS
  return (
    <div style={center}>
      <div style={{ textAlign: 'center', maxWidth: '380px', padding: '24px' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>{lastResult.passed ? '🎉' : '💪'}</div>
        <h1 style={{ fontSize: '26px', fontWeight: 600, marginBottom: '8px' }}>
          {lastResult.passed ? 'Perfect! You passed!' : `${lastResult.score}%`}
        </h1>
        <p style={{ color: '#888', fontSize: '15px', marginBottom: '24px' }}>
          {lastResult.passed
            ? 'All words correct. Your next level is unlocking!'
            : `${lastResult.wrongCount} wrong. They've been added back to your reviews. You need 100% to pass.`}
        </p>
        {!lastResult.passed && attempts.count + 1 < 3 && (
          <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '20px' }}>
            Attempts left today: {3 - (attempts.count + 1)}
          </p>
        )}
        <button onClick={onBack} style={{ ...btn, background: accent, color: '#fff', border: 'none' }}>Back home</button>
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const btn = { padding: '12px 24px', borderRadius: '10px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }