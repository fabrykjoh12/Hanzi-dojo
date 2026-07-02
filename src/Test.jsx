import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getTestStatus, getAttemptsToday } from './testLogic'
import { getLevelLabel, getNextLevel } from './utils'
import { languageTheme } from './languageTheme'
import { schedule } from './srs'
import { TEST_UNLOCK_MASTERY_PCT } from './mastery'
import { useIsMobile } from './useIsMobile'
import InfoTip from './InfoTip'
import {
  ArrowRight, Check, CheckCircle2, Clock, GraduationCap,
  Lock, RotateCcw, ShieldCheck, X,
} from 'lucide-react'

function generateQuestions(vocabList, allVocab, language) {
  const shuffled = [...vocabList].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(30, shuffled.length))

  return selected.map(v => {
    const type = Math.random() > 0.5 ? 'e_to_c' : 'c_to_e'
    const wrong = allVocab
      .filter(av => av.id !== v.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)

    let prompt, correctAnswer, options, promptLabel, answerLabel, optionReadings

    if (type === 'e_to_c') {
      prompt = v.meaning
      correctAnswer = v.word
      promptLabel = 'English'
      answerLabel = language === 'japanese' ? 'Japanese' : 'Chinese'
      const wordOptions = [
        { word: v.word, reading: v.reading },
        ...wrong.map(w => ({ word: w.word, reading: w.reading })),
      ].sort(() => Math.random() - 0.5)
      options = wordOptions.map(o => o.word)
      optionReadings = language === 'japanese'
        ? wordOptions.reduce((acc, o) => { acc[o.word] = o.reading; return acc }, {})
        : null
    } else {
      prompt = v.word
      correctAnswer = v.meaning
      promptLabel = language === 'japanese' ? 'Japanese' : 'Chinese'
      answerLabel = 'English'
      options = [v.meaning, ...wrong.map(w => w.meaning)].sort(() => Math.random() - 0.5)
      optionReadings = null
    }

    return { type, prompt, correctAnswer, options, optionReadings, vocab: v, promptLabel, answerLabel }
  })
}

function getLanguageDetails(profile, track) {
  const language = track.language || profile.active_language
  const t = languageTheme(language)
  return {
    isJapanese: language === 'japanese',
    accentHex: t.accentHex,
    fontFamily: t.font,
    languageName: t.languageName,
  }
}

function Shell({ children, accentHex, fontFamily, narrow }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        maxWidth: narrow ? '620px' : '760px',
        margin: '0 auto',
        padding: isMobile ? '24px 16px 56px' : '38px 32px 72px',
        position: 'relative',
        zIndex: 1,
      }}>
        {children}
      </div>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick, danger, disabled }) {
  const [hovered, setHovered] = useState(false)
  const color = danger ? '#DC2626' : 'var(--text-muted)'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid ' + (danger ? 'var(--danger-border)' : 'var(--border)'),
        background: hovered && !disabled ? (danger ? 'var(--danger-bg)' : 'var(--surface-2)') : 'var(--surface)',
        color,
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color={color} />
      {label}
    </button>
  )
}

function PrimaryButton({ onClick, children, accentHex, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minHeight: '52px',
        borderRadius: '16px',
        border: 'none',
        background: hovered ? accentHex + 'E6' : accentHex,
        color: '#fff',
        fontSize: '15px',
        fontWeight: 750,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '9px',
        transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 28px ' + accentHex + '30' : '0 5px 16px ' + accentHex + '22',
      }}
    >
      {Icon && <Icon size={18} strokeWidth={2} color="#fff" />}
      {children}
    </button>
  )
}

function GhostButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minHeight: '52px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)',
        fontSize: '15px',
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '9px',
      }}
    >
      {Icon && <Icon size={18} strokeWidth={2} color="var(--text-muted)" />}
      {children}
    </button>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      padding: '18px 20px',
      textAlign: 'center',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <div style={{ fontSize: '28px', fontWeight: 850, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', fontWeight: 650 }}>{label}</div>
    </div>
  )
}

function ProgressBar({ pct, accentHex }) {
  return (
    <div style={{ height: '7px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: pct + '%',
        borderRadius: '999px',
        background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
        transition: 'width 300ms ease',
      }} />
    </div>
  )
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
  // Two-step in-UI confirm for ending the quiz early (no native dialogs).
  const [confirmingEnd, setConfirmingEnd] = useState(false)

  const { accentHex, fontFamily, languageName } = getLanguageDetails(profile, track)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function loadStatus() {
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

  useEffect(() => {
    const timer = setTimeout(loadStatus, 0)
    return () => clearTimeout(timer)
  }, [])

  const startTest = () => {
    const qs = generateQuestions(allVocab, allVocab, profile.active_language)
    setQuestions(qs)
    setAnswers([])
    setIndex(0)
    setSelected(null)
    setWrongVocab([])
    setConfirmingEnd(false)
    setPhase('testing')
  }

  const handleSelect = (option) => {
    if (selected !== null) return
    const q = questions[index]
    const correct = option === q.correctAnswer
    setSelected(option)

    if (!correct) setWrongVocab(prev => [...prev, q.vocab])
    const newAnswers = [...answers, { vocab: q.vocab, user_answer: option, was_correct: correct }]
    setAnswers(newAnswers)

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
      const wrongVocabIds = finalWrong.map(w => w.id)
      const { data: wrongCards } = await supabase
        .from('cards')
        .select('id, vocab_id, state, due_at, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_step, last_review')
        .eq('user_id', session.user.id)
        .in('vocab_id', wrongVocabIds)

      const cardByVocabId = {}
      ;(wrongCards || []).forEach(c => { cardByVocabId[c.vocab_id] = c })

      for (const w of finalWrong) {
        const card = cardByVocabId[w.id]
        if (card) {
          const { updates } = schedule(card, 0)
          await supabase.from('cards').update(updates).eq('id', card.id).eq('user_id', session.user.id)
        }
      }
    }

    if (passed) {
      await supabase.from('level_unlocks').upsert({
        user_id: session.user.id,
        language: track.language,
        system: track.system,
        level: track.current_level,
      })

      const nextLevel = getNextLevel(track.language, track.system, track.current_level)
      if (nextLevel !== track.current_level) {
        await supabase
          .from('language_tracks')
          .update({ current_level: nextLevel })
          .eq('id', track.id)
          .eq('user_id', session.user.id)
      }
    }

    setLastResult({ passed, score: Math.round(score), wrongCount: finalWrong.length, correctCount })
    setSaving(false)
    setPhase('results')
    setAttempts(prev => ({ count: prev.count + 1, passed: prev.passed || passed }))
  }

  if (loading) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <GraduationCap size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro' && !status.testUnlocked) {
    const unlockPct = Math.round(TEST_UNLOCK_MASTERY_PCT * 100)
    const masteryPct = status.totalWords > 0 ? Math.round(status.masteredPct * 100) : 0
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={centerPanelStyle}>
          <StateIcon icon={Lock} accentHex="var(--text-faint)" />
          <h1 style={titleStyle}>{levelLabel} Test locked</h1>
          <p style={bodyTextStyle}>Master {unlockPct}% of this level's words to unlock the test.</p>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ fontSize: '34px', fontWeight: 850, color: accentHex }}>
                {status.masteredCount} / {status.totalWords}
              </div>
              <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed - mastery comes from reviewing correctly over time, across multiple days." />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '16px' }}>words mastered</div>
            <ProgressBar pct={masteryPct} accentHex={accentHex} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              Unlocks at {Math.ceil(status.totalWords * TEST_UNLOCK_MASTERY_PCT)} mastered words
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro' && attempts.count >= 3 && !attempts.passed) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={centerPanelStyle}>
          <StateIcon icon={Clock} accentHex="#D97706" />
          <h1 style={titleStyle}>No attempts left today</h1>
          <p style={bodyTextStyle}>You've used all 3 attempts. Review your words and come back tomorrow.</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro') {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={{ textAlign: 'center', margin: '34px 0 28px' }}>
          <StateIcon icon={GraduationCap} accentHex={accentHex} />
          <div style={{ color: accentHex, fontSize: '13px', fontWeight: 800, marginTop: '18px' }}>
            {languageName} level gate
          </div>
          <h1 style={{ ...titleStyle, fontSize: '32px', marginTop: '8px' }}>{levelLabel} Test</h1>
          <p style={bodyTextStyle}>
            30 multiple choice questions. You need 100% to pass and unlock the next level.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '22px' }}>
          <StatCard label="attempts today" value={attempts.count} color="var(--text)" />
          <StatCard label="remaining" value={3 - attempts.count} color={accentHex} />
          <StatCard label="questions" value="30" color="#2F9E6D" />
        </div>

        <div style={{
          ...cardStyle,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '22px',
        }}>
          <ShieldCheck size={21} strokeWidth={1.8} color={accentHex} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '5px' }}>Strict by design</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Wrong answers return to review through FSRS, so the test strengthens weak words instead of just blocking progress.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <PrimaryButton onClick={startTest} accentHex={accentHex} icon={ArrowRight}>Start test</PrimaryButton>
        </div>
      </Shell>
    )
  }

  if (phase === 'testing') {
    if (saving) {
      return (
        <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
          <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StateIcon icon={GraduationCap} accentHex={accentHex} />
          </div>
        </Shell>
      )
    }

    const q = questions[index]
    const isTargetPrompt = q.type === 'c_to_e'
    const progress = questions.length > 0 ? Math.round((index / questions.length) * 100) : 0

    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span style={{ fontWeight: 800, color: 'var(--text)' }}>{index + 1} / {questions.length}</span>
              <span style={{ marginLeft: '8px' }}>{progress}% complete</span>
            </div>
            <div style={{ width: '220px' }}><ProgressBar pct={progress} accentHex={accentHex} /></div>
          </div>
          {confirmingEnd ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Unanswered count as wrong.
              </span>
              <IconButton
                icon={X}
                label="End now"
                danger
                onClick={() => { setConfirmingEnd(false); handleEndQuiz() }}
                disabled={saving}
              />
              <IconButton
                icon={RotateCcw}
                label="Keep going"
                onClick={() => setConfirmingEnd(false)}
              />
            </div>
          ) : (
            <IconButton
              icon={X}
              label="End quiz"
              danger
              onClick={() => setConfirmingEnd(true)}
              disabled={selected !== null || saving}
            />
          )}
        </div>

        <div style={{
          ...cardStyle,
          padding: '38px 34px',
          textAlign: 'center',
          marginBottom: '18px',
          boxShadow: '0 22px 64px rgba(24,24,27,0.07)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '18px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            {q.type === 'e_to_c' ? 'Choose the target-language word' : 'Choose the English meaning'}
          </div>
          <div style={{
            fontSize: isTargetPrompt ? '58px' : '28px',
            fontWeight: 800,
            color: 'var(--text)',
            fontFamily: isTargetPrompt ? fontFamily : 'Inter, sans-serif',
            lineHeight: 1.25,
          }}>
            {q.prompt}
          </div>
          {isTargetPrompt && q.vocab.reading && (
            <div style={{ fontSize: '16px', color: accentHex, marginTop: '10px', fontWeight: 650 }}>
              {q.vocab.reading}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {q.options.map((option, optIdx) => {
            const isSelected = selected === option
            const isCorrect = option === q.correctAnswer
            const hasAnswered = selected !== null
            const isTargetOption = q.type === 'e_to_c'

            let borderColor = 'var(--border)'
            let bgColor = '#fff'
            let textColor = 'var(--text)'
            let Icon = null

            if (hasAnswered) {
              if (isCorrect) {
                borderColor = '#2F9E6D'
                bgColor = 'var(--success-bg)'
                textColor = '#2F9E6D'
                Icon = Check
              } else if (isSelected && !isCorrect) {
                borderColor = '#DC2626'
                bgColor = 'var(--danger-bg)'
                textColor = '#DC2626'
                Icon = X
              } else {
                textColor = 'var(--text-faint)'
              }
            }

            return (
              <button
                key={optIdx}
                onClick={() => handleSelect(option)}
                disabled={hasAnswered}
                style={{
                  padding: '17px 20px',
                  borderRadius: '16px',
                  border: '1.5px solid ' + borderColor,
                  background: bgColor,
                  color: textColor,
                  fontSize: isTargetOption ? '23px' : '15px',
                  fontFamily: isTargetOption ? fontFamily : 'Inter, sans-serif',
                  fontWeight: 750,
                  cursor: hasAnswered ? 'default' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 180ms ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: hasAnswered ? 'none' : '0 8px 22px rgba(24,24,27,0.045)',
                }}
              >
                {q.optionReadings && q.optionReadings[option]
                  ? (
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span>{option}</span>
                      <span style={{ fontSize: '12px', fontWeight: 550, color: hasAnswered ? textColor : 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                        {q.optionReadings[option]}
                      </span>
                    </span>
                  )
                  : <span>{option}</span>
                }
                {Icon && <Icon size={19} strokeWidth={2.2} color={textColor} />}
              </button>
            )
          })}
        </div>

        {selected !== null && (
          <div style={{
            marginTop: '18px',
            padding: '15px 18px',
            borderRadius: '16px',
            textAlign: 'center',
            background: selected === questions[index].correctAnswer ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: '1px solid ' + (selected === questions[index].correctAnswer ? 'var(--success-border)' : 'var(--danger-border)'),
          }}>
            <span style={{
              fontSize: '14px',
              fontWeight: 750,
              color: selected === questions[index].correctAnswer ? '#2F9E6D' : '#DC2626',
            }}>
              {selected === questions[index].correctAnswer
                ? 'Correct. Moving on...'
                : 'Incorrect. The correct answer is highlighted.'}
            </span>
          </div>
        )}
      </Shell>
    )
  }

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
      <div style={centerPanelStyle}>
        <StateIcon icon={lastResult.passed ? CheckCircle2 : RotateCcw} accentHex={lastResult.passed ? '#2F9E6D' : '#D97706'} />
        <h1 style={{ ...titleStyle, fontSize: '32px' }}>
          {lastResult.passed ? 'Perfect score' : lastResult.score + '%'}
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%', margin: '22px 0' }}>
          <StatCard label="Correct" value={lastResult.correctCount} color="#2F9E6D" />
          <StatCard label="Wrong" value={lastResult.wrongCount} color={lastResult.wrongCount > 0 ? '#DC2626' : 'var(--text-faint)'} />
          <StatCard label="Total" value={questions.length} color="var(--text)" />
        </div>

        <p style={bodyTextStyle}>
          {lastResult.passed
            ? 'All correct. Your next level is now unlocking.'
            : lastResult.wrongCount + ' wrong words have been returned to review. You need 100% to pass.'}
        </p>

        {!lastResult.passed && attempts.count < 3 && (
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: '0 0 18px' }}>
            Attempts remaining today: {3 - attempts.count}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          {!lastResult.passed && attempts.count < 3 && (
            <GhostButton onClick={() => { setPhase('intro'); loadStatus() }} icon={RotateCcw}>
              Try again
            </GhostButton>
          )}
        </div>
      </div>
    </Shell>
  )
}

function StateIcon({ icon: Icon, accentHex }) {
  return (
    <div style={{
      width: '68px',
      height: '68px',
      borderRadius: '22px',
      background: accentHex + '10',
      border: '1px solid ' + accentHex + '20',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto',
    }}>
      <Icon size={34} strokeWidth={1.75} color={accentHex} />
    </div>
  )
}

const centerPanelStyle = {
  minHeight: '68vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
}

const titleStyle = {
  color: 'var(--text)',
  fontSize: '26px',
  fontWeight: 850,
  lineHeight: 1.15,
  margin: '18px 0 8px',
}

const bodyTextStyle = {
  color: 'var(--text-muted)',
  fontSize: '15px',
  lineHeight: 1.65,
  margin: '0 0 24px',
  maxWidth: '520px',
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '22px',
  padding: '24px',
  boxShadow: '0 10px 32px rgba(24,24,27,0.055)',
}
