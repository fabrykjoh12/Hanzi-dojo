import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getTestStatus, getAttemptsToday } from './testLogic'

function generateQuestions(vocabList, allVocab) {
  const shuffled = [...vocabList].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(30, shuffled.length))

  return selected.map(v => {
    const type = Math.random() > 0.5 ? 'e_to_c' : 'c_to_e'
    const wrong = allVocab
      .filter(av => av.id !== v.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)

    let prompt, correctAnswer, options, promptLabel, answerLabel

    if (type === 'e_to_c') {
      prompt = v.meaning
      correctAnswer = v.word
      promptLabel = 'English'
      answerLabel = 'Chinese'
      options = [v.word, ...wrong.map(w => w.word)].sort(() => Math.random() - 0.5)
    } else {
      prompt = v.word
      correctAnswer = v.meaning
      promptLabel = 'Chinese'
      answerLabel = 'English'
      options = [v.meaning, ...wrong.map(w => w.meaning)].sort(() => Math.random() - 0.5)
    }

    return { type, prompt, correctAnswer, options, vocab: v, promptLabel, answerLabel }
  })
}

export default function Test({ session, profile, track, onBack }) {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [attempts, setAttempts] = useState({ count: 0, passed: false })
  const [allVocab, setAllVocab] = useState([])
  const [phase, setPhase] = useState('intro')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [index, setIndex] = useState(0)
  const [wrongVocab, setWrongVocab] = useState([])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const levelLabel = profile.active_language === 'chinese'
    ? 'HSK ' + track.current_level
    : 'N' + track.current_level
  const isJapanese = profile.active_language === 'japanese'

  useEffect(() => { loadStatus() }, [])

  const loadStatus = async () => {
    setLoading(true)
    const [s, a, vocabResult] = await Promise.all([
      getTestStatus(session.user.id, track),
      getAttemptsToday(session.user.id, track),
      supabase
        .from('vocabulary')
        .select('*')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_active', true),
    ])
    setStatus(s)
    setAttempts(a)
    setAllVocab(vocabResult.data || [])
    setLoading(false)
  }

  const startTest = () => {
    const qs = generateQuestions(allVocab, allVocab)
    setQuestions(qs)
    setAnswers([])
    setIndex(0)
    setSelected(null)
    setWrongVocab([])
    setPhase('testing')
  }

  const handleSelect = (option) => {
    if (selected !== null) return // already answered
    const q = questions[index]
    const correct = option === q.correctAnswer
    setSelected(option)

    if (!correct) setWrongVocab(prev => [...prev, q.vocab])
    const newAnswers = [...answers, { vocab: q.vocab, user_answer: option, was_correct: correct }]
    setAnswers(newAnswers)

    // Auto-advance after 1.5 seconds
    setTimeout(() => {
      setSelected(null)
      if (index + 1 < questions.length) {
        setIndex(index + 1)
      } else {
        finishTest(newAnswers, correct ? wrongVocab : [...wrongVocab, q.vocab])
      }
    }, 1500)
  }
  const handleEndQuiz = () => {
  const confirmed = window.confirm(
    'End the quiz now? Unanswered questions will be counted as wrong.'
  )

  if (!confirmed) return

  const unansweredQuestions = questions.slice(index)

  const unansweredAnswers = unansweredQuestions.map(q => ({
    vocab: q.vocab,
    user_answer: 'Skipped',
    was_correct: false,
  }))

  const finalAnswers = [...answers, ...unansweredAnswers]
  const finalWrong = [...wrongVocab, ...unansweredQuestions.map(q => q.vocab)]

  finishTest(finalAnswers, finalWrong)
}

  const finishTest = async (allAnswers, finalWrong) => {
    setSaving(true)
    const passed = finalWrong.length === 0
    const correctCount = allAnswers.filter(a => a.was_correct).length
    const score = (correctCount / questions.length) * 100

    const { data: attempt } = await supabase
      .from('test_attempts')
      .insert({
        user_id: session.user.id,
        language: track.language,
        system: track.system,
        level: track.current_level,
        score,
        total_questions: questions.length,
        correct_count: correctCount,
        passed,
      })
      .select('id')
      .single()

    if (attempt?.id) {
      await supabase.from('test_answers').insert(
        allAnswers.map(a => ({
          user_id: session.user.id,
          attempt_id: attempt.id,
          vocab_id: a.vocab.id,
          user_answer: a.user_answer,
          correct_answer: a.vocab.word,
          was_correct: a.was_correct,
        }))
      )
    }

    if (finalWrong.length > 0) {
      await supabase
        .from('cards')
        .update({ is_easy: false, due_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .in('vocab_id', finalWrong.map(w => w.id))
    }

    if (passed) {
      await supabase.from('level_unlocks').upsert({
        user_id: session.user.id,
        language: track.language,
        system: track.system,
        level: track.current_level,
      })
    }

    setLastResult({ passed, score: Math.round(score), wrongCount: finalWrong.length, correctCount })
    setSaving(false)
    setPhase('results')
    setAttempts(prev => ({ count: prev.count + 1, passed: prev.passed || passed }))
  }

  if (loading) {
    return (
      <div style={center}>
        <div style={{ fontSize: '32px', color: accentHex, fontFamily: "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  // ── LOCKED ───────────────────────────────────────────────────────────────
  if (phase === 'intro' && !status.allEasy) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>🔒</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#18181B', marginBottom: '8px' }}>
            {levelLabel} Test locked
          </h1>
          <p style={{ fontSize: '15px', color: '#71717A', marginBottom: '24px', lineHeight: 1.6 }}>
            Mark every word as <strong>Easy</strong> in flashcards to unlock the test.
          </p>
          <div style={{
            background: '#fff', borderRadius: '16px', border: '1px solid #E7E5E4',
            padding: '20px', marginBottom: '28px',
          }}>
            <div style={{ fontSize: '32px', fontWeight: 700, color: accentHex, marginBottom: '4px' }}>
              {status.easyWords} / {status.totalWords}
            </div>
            <div style={{ fontSize: '13px', color: '#71717A' }}>words marked Easy</div>
            <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden', marginTop: '14px' }}>
              <div style={{
                height: '100%', background: accentHex, borderRadius: '3px',
                width: status.totalWords > 0 ? (status.easyWords / status.totalWords * 100) + '%' : '0%',
                transition: 'width .6s ease',
              }} />
            </div>
          </div>
          <button onClick={onBack} style={primaryBtn(accentHex)}>Back home</button>
        </div>
      </div>
    )
  }

  // ── OUT OF ATTEMPTS ───────────────────────────────────────────────────────
  if (phase === 'intro' && attempts.count >= 3 && !attempts.passed) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>⏳</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#18181B', marginBottom: '8px' }}>
            No attempts left today
          </h1>
          <p style={{ fontSize: '15px', color: '#71717A', marginBottom: '28px' }}>
            You've used all 3 attempts. Review your words and come back tomorrow.
          </p>
          <button onClick={onBack} style={primaryBtn(accentHex)}>Back home</button>
        </div>
      </div>
    )
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '60px 24px' }}>
          <button onClick={onBack} style={backBtn}>← Back</button>

          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>✍️</div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#18181B', marginBottom: '8px' }}>
              {levelLabel} Test
            </h1>
            <p style={{ fontSize: '15px', color: '#71717A', marginBottom: '6px' }}>
              30 multiple choice questions — mix of English → Chinese and Chinese → English.
            </p>
            <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '28px' }}>
              You need <strong>100%</strong> to pass and unlock the next level.
            </p>

            <div style={{
              background: '#fff', borderRadius: '16px', border: '1px solid #E7E5E4',
              padding: '16px 24px', marginBottom: '28px',
              display: 'flex', justifyContent: 'space-around',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#18181B' }}>{attempts.count}</div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>attempts today</div>
              </div>
              <div style={{ width: '1px', background: '#E7E5E4' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#18181B' }}>{3 - attempts.count}</div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>remaining</div>
              </div>
              <div style={{ width: '1px', background: '#E7E5E4' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#18181B' }}>30</div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>questions</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={onBack} style={ghostBtn}>Back</button>
              <button onClick={startTest} style={{ ...primaryBtn(accentHex), flex: 2 }}>
                Start test
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── TESTING ───────────────────────────────────────────────────────────────
  if (phase === 'testing') {
    if (saving) {
      return (
        <div style={center}>
          <div style={{ fontSize: '32px', color: accentHex, fontFamily: "'Noto Sans SC'" }}>学</div>
        </div>
      )
    }

    const q = questions[index]
    const isChinesePrompt = q.type === 'c_to_e'

    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 24px 60px' }}>

          {/* Progress bar */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
}}>
  <div style={{ fontSize: '13px', color: '#71717A' }}>
    <span style={{ fontWeight: 600, color: '#18181B' }}>
      {index + 1} / {questions.length}
    </span>
    <span style={{ marginLeft: '8px' }}>
      {Math.round((index / questions.length) * 100)}% complete
    </span>
  </div>

  <button
    onClick={handleEndQuiz}
    disabled={selected !== null || saving}
    style={{
      ...endQuizBtn,
      opacity: selected !== null || saving ? 0.5 : 1,
      cursor: selected !== null || saving ? 'default' : 'pointer',
    }}
  >
    End quiz
  </button>
</div>
            <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '3px', background: accentHex,
                width: (index / questions.length * 100) + '%',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Question card */}
          <div style={{
            background: '#fff', borderRadius: '20px',
            border: '1px solid #E7E5E4',
            boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
            padding: '36px 32px', marginBottom: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#71717A', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {q.type === 'e_to_c' ? 'What is the Chinese word for?' : 'What does this mean?'}
            </div>
            <div style={{
              fontSize: isChinesePrompt ? '52px' : '26px',
              fontWeight: 700,
              color: '#18181B',
              fontFamily: isChinesePrompt ? "'Noto Sans SC'" : 'Inter, sans-serif',
              lineHeight: 1.3,
            }}>
              {q.prompt}
            </div>
            {isChinesePrompt && (
              <div style={{ fontSize: '16px', color: accentHex, marginTop: '8px', fontWeight: 500 }}>
                {q.vocab.reading}
              </div>
            )}
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {q.options.map((option, optIdx) => {
              const isSelected = selected === option
              const isCorrect = option === q.correctAnswer
              const hasAnswered = selected !== null

              let borderColor = '#E7E5E4'
              let bgColor = '#fff'
              let textColor = '#18181B'
              let icon = null

              if (hasAnswered) {
                if (isCorrect) {
                  borderColor = '#2F9E6D'
                  bgColor = '#ECFDF5'
                  textColor = '#2F9E6D'
                  icon = '✓'
                } else if (isSelected && !isCorrect) {
                  borderColor = '#DC2626'
                  bgColor = '#FEF2F2'
                  textColor = '#DC2626'
                  icon = '✗'
                } else {
                  borderColor = '#E7E5E4'
                  bgColor = '#fff'
                  textColor = '#A1A1AA'
                }
              }

              const isChinese = q.type === 'e_to_c'

              return (
                <button
                  key={optIdx}
                  onClick={() => handleSelect(option)}
                  disabled={hasAnswered}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '14px',
                    border: '2px solid ' + borderColor,
                    background: bgColor,
                    color: textColor,
                    fontSize: isChinese ? '22px' : '15px',
                    fontFamily: isChinese ? "'Noto Sans SC'" : 'Inter, sans-serif',
                    fontWeight: 600,
                    cursor: hasAnswered ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 200ms ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: hasAnswered ? 'none' : '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  <span>{option}</span>
                  {icon && (
                    <span style={{ fontSize: '18px', fontFamily: 'Inter, sans-serif' }}>{icon}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Feedback message */}
          {selected !== null && (
            <div style={{
              marginTop: '20px', padding: '14px 20px',
              borderRadius: '12px', textAlign: 'center',
              background: selected === questions[index].correctAnswer ? '#ECFDF5' : '#FEF2F2',
              border: '1px solid ' + (selected === questions[index].correctAnswer ? '#BBF7D0' : '#FECACA'),
            }}>
              <span style={{
                fontSize: '14px', fontWeight: 600,
                color: selected === questions[index].correctAnswer ? '#2F9E6D' : '#DC2626',
              }}>
                {selected === questions[index].correctAnswer
                  ? '✓ Correct! Well done.'
                  : '✗ Incorrect — correct answer highlighted above.'}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>
          {lastResult.passed ? '🎉' : '💪'}
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#18181B', marginBottom: '8px' }}>
          {lastResult.passed ? 'Perfect score!' : lastResult.score + '%'}
        </h1>

        {/* Score breakdown */}
        <div style={{
          background: '#fff', borderRadius: '16px', border: '1px solid #E7E5E4',
          padding: '20px 24px', margin: '24px 0',
          display: 'flex', justifyContent: 'space-around',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#2F9E6D' }}>
              {lastResult.correctCount}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>Correct</div>
          </div>
          <div style={{ width: '1px', background: '#E7E5E4' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: lastResult.wrongCount > 0 ? '#DC2626' : '#A1A1AA' }}>
              {lastResult.wrongCount}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>Wrong</div>
          </div>
          <div style={{ width: '1px', background: '#E7E5E4' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#18181B' }}>
              {questions.length}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>Total</div>
          </div>
        </div>

        <p style={{ fontSize: '15px', color: '#71717A', marginBottom: '28px', lineHeight: 1.6 }}>
          {lastResult.passed
            ? 'All correct! Your next level is now unlocking.'
            : lastResult.wrongCount + ' wrong words have been added back to your reviews. You need 100% to pass.'}
        </p>

        {!lastResult.passed && attempts.count < 3 && (
          <p style={{ fontSize: '13px', color: '#A1A1AA', marginBottom: '20px' }}>
            Attempts remaining today: {3 - attempts.count}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {!lastResult.passed && attempts.count < 3 && (
            <button
              onClick={() => { setPhase('intro'); loadStatus() }}
              style={ghostBtn}
            >
              Try again
            </button>
          )}
          <button onClick={onBack} style={primaryBtn(accentHex)}>
            Back home
          </button>
        </div>
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8' }

const primaryBtn = (accent) => ({
  flex: 1, padding: '13px 24px', borderRadius: '12px',
  border: 'none', background: accent, color: '#fff',
  fontSize: '15px', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
})

const ghostBtn = {
  flex: 1, padding: '13px 24px', borderRadius: '12px',
  border: '1px solid #E7E5E4', background: '#fff', color: '#71717A',
  fontSize: '15px', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}

const backBtn = {
  background: 'none', border: 'none', color: '#71717A',
  cursor: 'pointer', fontSize: '14px', padding: 0,
}
const endQuizBtn = {
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #FECACA',
  background: '#FEF2F2',
  color: '#DC2626',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
}