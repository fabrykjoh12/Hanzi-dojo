import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTestStatus, getAttemptsToday, canStartTest } from './testLogic'
import { fetchPagedResult } from './supabasePaging'
import { getLevelLabel, getNextLevel, shuffle } from './utils'
import { languageTheme, langAttr } from './languageTheme'
import { testWrongAnswerWrite, testResultSummaryLine, tallyTestReschedules, newTestCard, TEST_CARD_COLUMNS } from './testReschedule'
import { gradeCardWrite, newOpId } from './syncQueue'
import { TEST_UNLOCK_MASTERY_PCT } from './mastery'
import { useIsMobile } from './useIsMobile'
import InfoTip from './InfoTip'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, CloudOff,
  GraduationCap, Lock, RotateCcw, ShieldCheck, X,
} from 'lucide-react'

function generateQuestions(vocabList, allVocab, language) {
  const selected = shuffle(vocabList).slice(0, Math.min(30, vocabList.length))

  return selected.map(v => {
    const type = Math.random() > 0.5 ? 'e_to_c' : 'c_to_e'
    const wrong = shuffle(allVocab.filter(av => av.id !== v.id)).slice(0, 3)

    let prompt, correctAnswer, options, promptLabel, answerLabel, optionReadings

    if (type === 'e_to_c') {
      prompt = v.meaning
      correctAnswer = v.word
      promptLabel = 'English'
      answerLabel = language === 'japanese' ? 'Japanese' : 'Chinese'
      const wordOptions = shuffle([
        { word: v.word, reading: v.reading },
        ...wrong.map(w => ({ word: w.word, reading: w.reading })),
      ])
      options = wordOptions.map(o => o.word)
      optionReadings = language === 'japanese'
        ? wordOptions.reduce((acc, o) => { acc[o.word] = o.reading; return acc }, {})
        : null
    } else {
      prompt = v.word
      correctAnswer = v.meaning
      promptLabel = language === 'japanese' ? 'Japanese' : 'Chinese'
      answerLabel = 'English'
      options = shuffle([v.meaning, ...wrong.map(w => w.meaning)])
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

function Shell({ children, narrow }) {
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
  const isMobile = useIsMobile()
  return (
    <div style={{
      // Three of these sit in a `repeat(3, 1fr)` grid. Grid tracks are
      // minmax(auto, 1fr), so a label wider than its track pushes the whole grid
      // past the viewport — the tighter side padding keeps "remaining" inside
      // its ~101px column at 360px.
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      padding: isMobile ? '16px 8px' : '18px 20px',
      textAlign: 'center',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <div style={{ fontSize: '28px', fontWeight: 850, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', fontWeight: 650 }}>{label}</div>
    </div>
  )
}

function ProgressBar({ pct, accentHex, label = 'Progress' }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      style={{ height: '7px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}
    >
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
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState(null)
  const [attempts, setAttempts] = useState({ count: 0, passed: false })
  const [allVocab, setAllVocab] = useState([])
  const [phase, setPhase] = useState('intro')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [index, setIndex] = useState(0)
  const [wrongVocab, setWrongVocab] = useState([])
  const [selected, setSelected] = useState(null)
  // The 1.5s answer-feedback pause, held so End-quiz can cancel it, and a latch
  // so one attempt can only finish once. See handleAnswer / finishTest.
  const feedbackTimer = useRef(null)
  const finishing = useRef(false)
  const [saving, setSaving] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  // Two-step in-UI confirm for ending the quiz early (no native dialogs).
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [rescheduleError, setRescheduleError] = useState(null)

  const { accentHex, fontFamily, languageName } = getLanguageDetails(profile, track)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function loadStatus() {
    setLoading(true)
    setLoadError(false)
    const [s, a, vocabResult] = await Promise.all([
      getTestStatus(session.user.id, track),
      getAttemptsToday(session.user.id, track),
      // Paged: HSK 5/6 levels are past the 1000-row cap, and a truncated
      // pool would quietly test only a prefix of the level's words.
      fetchPagedResult(() => supabase
        .from('vocabulary')
        .select('*')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_active', true)
        .order('id', { ascending: true })),
    ])
    // A failed fetch must not render as a fabricated "0 / 0 words mastered"
    // locked state — surface it and let the learner retry.
    if (s.error || a.error || vocabResult.error) {
      setLoadError(true)
      setLoading(false)
      return
    }
    setStatus(s)
    setAttempts(a)
    setAllVocab(vocabResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(loadStatus, 0)
    return () => clearTimeout(timer)
  }, [])

  // Cancel a pending feedback pause if the screen goes away mid-answer, so it
  // cannot finish a test that is no longer on screen.
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current) }, [])

  const startTest = () => {
    // A new attempt may finish again.
    finishing.current = false
    // An empty pool would generate zero questions and crash on questions[0].
    if (!canStartTest(allVocab)) return
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

    // Held so End-quiz can cancel it. Without that the feedback pause is a live
    // second copy of the finish path: answer the LAST question, click "End now"
    // inside 1.5s, and this timer still fires afterwards with
    // `index + 1 === questions.length` — finishTest runs twice, writing a second
    // test_attempts row (one of three daily attempts, gone) and grading every
    // wrong word twice with two different opIds, which grade_card's
    // client_op_id de-dupe cannot collapse. Two review_logs rows and reps + 2
    // for one wrong answer: the exact history corruption this change exists to
    // stop, arriving through the change itself.
    feedbackTimer.current = setTimeout(() => {
      feedbackTimer.current = null
      setSelected(null)
      if (index + 1 < questions.length) {
        setIndex(index + 1)
      } else {
        finishTest(newAnswers, correct ? wrongVocab : [...wrongVocab, q.vocab])
      }
    }, 1500)
  }

  const handleEndQuiz = () => {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current)
      feedbackTimer.current = null
    }
    // `index` only advances inside that timer, so while an answer is on screen
    // the CURRENT question has been answered and is already in `answers` and
    // (if wrong) in `wrongVocab`. Slicing from `index` would count it a second
    // time — and for a word answered CORRECTLY that means a fabricated wrong
    // observation: with the new-card fallback it now creates a card and writes
    // a grade-0 review log for a word the learner got right.
    const answered = selected !== null
    const unansweredQuestions = questions.slice(answered ? index + 1 : index)
    const unansweredAnswers = unansweredQuestions.map(q => ({
      vocab: q.vocab,
      user_answer: 'Skipped',
      was_correct: false,
    }))

    const finalAnswers = [...answers, ...unansweredAnswers]
    const finalWrong = [...wrongVocab, ...unansweredQuestions.map(q => q.vocab)]
    finishTest(finalAnswers, finalWrong)
  }

  const finishTest = async (allAnswers, wrongList) => {
    // One finish per attempt. The timer above is cancelled by End-quiz, but a
    // latch is what makes that a guarantee rather than a race won by luck —
    // `saving` is state and does not settle before a second synchronous call.
    if (finishing.current) return
    finishing.current = true
    // Deduped by vocabulary id, at the one place every caller passes through.
    // "End quiz" is disabled while an answer is selected, but the confirm's
    // "End now" is not — so answering a question with the confirm open puts
    // that word in BOTH `wrongVocab` and the unanswered tail. It was counted
    // twice on the score card, and it would now be graded twice: two review_logs
    // rows and two opIds for one wrong answer, which is the same history
    // corruption this change exists to stop.
    const finalWrong = []
    const seenWrong = new Set()
    for (const w of wrongList || []) {
      if (!w || seenWrong.has(w.id)) continue
      seenWrong.add(w.id)
      finalWrong.push(w)
    }

    // Clear last attempt's failure before this one can set it. Without this a
    // retry that succeeds still prints "could not be returned to review" — the
    // result line claiming a failure that did not happen, which is the same
    // dishonesty as the bug this file exists to fix, inverted.
    setRescheduleError(null)
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
      const { data: wrongCards, error: lookupError } = await supabase
        .from('cards')
        .select(TEST_CARD_COLUMNS)
        .eq('user_id', session.user.id)
        .in('vocab_id', finalWrong.map(w => w.id))

      const cardByVocabId = {}
      ;(wrongCards || []).forEach(c => { cardByVocabId[c.vocab_id] = c })

      // The lookup's own error, read. It used to be dropped, and dropping it is
      // worse here than anywhere: with no rows every word looks like a word the
      // learner has no card for, so the fallback below would build a FRESH card
      // for a mature one and reset its history through the upsert. Nothing is
      // written when the lookup fails.
      let results = []
      if (lookupError) {
        console.error('[Test] could not load the wrong words\u2019 cards', lookupError)
      } else {
        // Through the canonical grade write, not a bare UPDATE. See
        // testReschedule.js: the direct write left `reps` without a review log,
        // and on a prior-knowledge claim it was rejected outright by
        // cards_unverified_claim_is_inert and the error was never read — so the
        // learner got the word wrong and the card was neither rescheduled nor
        // un-claimed.
        for (const w of finalWrong) {
          // A word with no card yet still gets one: the learner was asked and
          // answered wrong, which is exactly what a new card records.
          const card = cardByVocabId[w.id] || newTestCard(w.id)
          // The learner's retention dial, as Study.jsx passes it. Without it a
          // fresh device schedules at the default until Settings is opened once.
          const payload = testWrongAnswerWrite(card, {
            targetRetention: profile && profile.target_retention,
          })
          if (!payload) continue
          const write = await gradeCardWrite(supabase, {
            userId: session.user.id,
            ...payload,
            opId: newOpId(),
          })
          // Not swallowed. One failure here means a word the learner demonstrably
          // does not know keeps counting as known, which is worth saying out loud.
          if (!write.ok) console.error('[Test] wrong-answer reschedule failed', w.id, write.error)
          results.push(write)
        }
      }

      // The tally is a pure, tested function — it is the measurement the result
      // sentence rests on, and an unmeasured sentence is the defect this whole
      // change is about.
      const tally = tallyTestReschedules(results)
      if (tally.rescheduled < finalWrong.length) {
        setRescheduleError({ rescheduled: tally.rescheduled })
        // One line naming what actually went wrong. The screen tells the
        // learner their words did not come back; this is the only place that
        // says why, and a failure with no trace anywhere is worse than a
        // console line nobody reads until they need it.
        console.error('[Test] ' + (finalWrong.length - tally.rescheduled) + ' of '
          + finalWrong.length + ' wrong words were not rescheduled', tally.firstError)
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
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        <div role="status" style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={srOnly}>Loading the test…</span>
          <div aria-hidden="true" style={{
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

  if (loadError) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        <div style={centerPanelStyle}>
          <StateIcon icon={CloudOff} accentHex="var(--text-faint)" />
          <h1 style={titleStyle}>Couldn't load the test</h1>
          <p style={bodyTextStyle}>Your words didn't come through this time. Check your connection and try again.</p>
          <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '360px' }}>
            <GhostButton onClick={onBack} icon={ArrowLeft}>Back home</GhostButton>
            <PrimaryButton onClick={loadStatus} accentHex={accentHex} icon={RotateCcw}>Retry</PrimaryButton>
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
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
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
            <ProgressBar pct={masteryPct} accentHex={accentHex} label="Words mastered at this level" />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              Unlocks at {Math.ceil(status.totalWords * TEST_UNLOCK_MASTERY_PCT)} mastered words
            </div>
          </div>
          <div style={{ display: 'flex', width: '100%', maxWidth: '360px', marginTop: '24px' }}>
            <PrimaryButton onClick={onBack} accentHex={accentHex} icon={ArrowLeft}>Back home</PrimaryButton>
          </div>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro' && attempts.count >= 3 && !attempts.passed) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        <div style={centerPanelStyle}>
          <StateIcon icon={Clock} accentHex="#D97706" />
          <h1 style={titleStyle}>No attempts left today</h1>
          <p style={bodyTextStyle}>You've used all 3 attempts. Review your words and come back tomorrow.</p>
          <PrimaryButton onClick={onBack} accentHex={accentHex} icon={ArrowLeft}>Back home</PrimaryButton>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro') {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
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

        {!canStartTest(allVocab) && (
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', textAlign: 'center', margin: '0 0 14px' }}>
            No words are available at this level right now, so the test can't start.
          </p>
        )}
        <div style={{ display: 'flex', gap: '12px' }}>
          {canStartTest(allVocab)
            ? <PrimaryButton onClick={startTest} accentHex={accentHex} icon={ArrowRight}>Start test</PrimaryButton>
            : <GhostButton onClick={onBack} icon={ArrowLeft}>Back home</GhostButton>}
        </div>
      </Shell>
    )
  }

  if (phase === 'testing') {
    if (saving) {
      return (
        <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
          <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
          <div role="status" style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={srOnly}>Saving your result…</span>
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
        <div style={{ marginBottom: '18px' }}>
          <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        </div>
        {/* Wraps on a phone: the bar shrinks to the space left over next to the
            End-quiz button, and the two-button confirm drops to its own row. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span style={{ fontWeight: 800, color: 'var(--text)' }}>{index + 1} / {questions.length}</span>
              <span style={{ marginLeft: '8px' }}>{progress}% complete</span>
            </div>
            <div style={{ maxWidth: '220px' }}><ProgressBar pct={progress} accentHex={accentHex} label="Test progress" /></div>
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
          {/* The task line is the screen's heading while a question is up — the
              only other h1 lives in the intro / result states. */}
          <h1 style={{ margin: '0 0 18px', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            {q.type === 'e_to_c' ? 'Choose the target-language word' : 'Choose the English meaning'}
          </h1>
          <div lang={isTargetPrompt ? langAttr(track.language) : undefined} style={{
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
                // `aria-disabled`, not `disabled`: this screen auto-advances,
                // and a real `disabled` on the focused option drops keyboard
                // focus to <body> the instant the answer lands.
                // `handleSelect()` already no-ops once answered.
                aria-disabled={hasAnswered}
                lang={isTargetOption ? langAttr(track.language) : undefined}
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

        {/* This screen auto-advances after 1.5s, so the verdict is gone before a
            screen reader would reach it by navigation. The live region is
            mounted for the whole testing phase — one that appears together with
            its text announces nothing — and `assertive` because the message is
            time-boxed. The wrong answer's word is spelled out here too: on
            screen it is "highlighted", which says nothing without sight. */}
        <div role="status" aria-live="assertive" aria-atomic="true">
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
              {selected !== questions[index].correctAnswer && (
                <span style={srOnly}>
                  {' It is '}
                  <span lang={q.type === 'e_to_c' ? langAttr(track.language) : undefined}>{questions[index].correctAnswer}</span>
                  .
                </span>
              )}
            </div>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
      <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
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

        {/* role="status": on a failure this sentence is the ONLY place the
            learner is told their words did not come back, and it renders in the
            same muted body copy as the success sentence. A live region at least
            announces it. */}
        <p style={bodyTextStyle} role="status">
          {testResultSummaryLine({
            passed: lastResult.passed,
            wrongCount: lastResult.wrongCount,
            rescheduled: rescheduleError ? rescheduleError.rescheduled : undefined,
            // Only offer the retry the screen will actually give them: below,
            // both the attempts line and the Try-again button disappear at 3.
            canRetry: attempts.count < 3,
          })}
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
          {(lastResult.passed || attempts.count >= 3) && (
            <PrimaryButton onClick={onBack} accentHex={accentHex} icon={ArrowLeft}>Back home</PrimaryButton>
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

// Visually hidden, still read aloud — the house pattern (see Study.jsx).
const srOnly = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
