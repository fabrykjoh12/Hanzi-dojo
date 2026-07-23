import { useState, useEffect } from 'react'
import { getLevelLabel, getSystemLabel } from './utils'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { grammarFor } from './grammarGuides'
import { drillsFor } from './grammarDrills'
import { pickDrillItem, buildBlankParts } from './grammarDrill'
import { getDueGrammar, gradeGrammar } from './grammarReview'
import {
  GraduationCap, ArrowLeft, Check, X, CheckCircle2, Sparkles,
} from 'lucide-react'

// Grammar spaced-practice drill. Runs the topics whose review is due (opted in
// from the Grammar guide), one authored fill-in-the-blank at a time, grading each
// pick through FSRS. A correct pick = Good, a wrong pick = Again (see grammarDrill
// / grammarReview). Mirrors FillBlank.jsx's shape and the shared ui.jsx buttons.
export default function GrammarPractice({ session, profile, track, onBack }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState([])   // [{ topicId, topic, item, row }]
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const guide = grammarFor(profile.active_language)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function load() {
    setLoading(true)
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
    let rows = []
    try { rows = await getDueGrammar({ userId: session.user.id, track, now: new Date() }) } catch { /* offline / table not migrated — empty queue */ }
    const topicMap = {}
    if (guide) for (const t of guide.topics) topicMap[t.id] = t
    const q = []
    for (const row of rows) {
      const items = drillsFor(profile.active_language, row.topic_id)
      const item = pickDrillItem(items, row.reps || 0)
      if (!item) continue   // enrolled topic whose drills were later removed — skip
      q.push({ topicId: row.topic_id, topic: topicMap[row.topic_id] || null, item, row })
    }
    setQueue(q)
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = queue[idx]

  async function choose(opt) {
    if (picked !== null) return
    setPicked(opt)
    const correct = opt === cur.item.blank
    if (correct) setCorrectCount(c => c + 1)
    // Persist the grade; a failed write just means it isn't scheduled forward —
    // the drill itself stays responsive.
    try {
      await gradeGrammar({ userId: session.user.id, track, topicId: cur.topicId, row: cur.row, correct })
    } catch { /* keep the drill moving */ }
  }

  function next() {
    if (idx + 1 >= queue.length) setDone(true)
    else { setPicked(null); setIdx(i => i + 1) }
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
            <GraduationCap size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div style={pageShell}>
        <Centered>
          <GraduationCap size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>Nothing due right now</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Open the Grammar guide and tap <strong>Practice this pattern</strong> on a topic to add it to spaced review — it’ll come back here on a schedule.
          </p>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back</PrimaryButton>
        </Centered>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / queue.length) * 100)
    return (
      <div style={pageShell}>
        <Centered wide>
          <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentHex + '10', border: '1px solid ' + accentHex + '18' }}>
            <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Grammar review done</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
            You got <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {queue.length} right. Each is scheduled to return right before you’d forget.
          </p>
          <div style={{ padding: '16px 10px', borderRadius: '14px', background: accentHex + '0D', border: '1px solid ' + accentHex + '22', marginBottom: '22px' }}>
            <div style={{ fontSize: '26px', fontWeight: 760, color: accentHex, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
          </div>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back to Practice</PrimaryButton>
        </Centered>
      </div>
    )
  }

  const item = cur.item
  const parts = buildBlankParts(item.sentence)
  const answered = picked !== null

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {queue.length}</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 750 }}>
            <GraduationCap size={17} strokeWidth={1.8} color={accentHex} /> Grammar review
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            {cur.topic ? cur.topic.title : systemLabel + ' · ' + levelLabel}
          </div>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '14px 0 22px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: accentHex, width: Math.round((idx / queue.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        {/* Sentence with the grammar word blanked out */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px 22px', marginBottom: '12px', textAlign: 'center', boxShadow: '0 10px 30px rgba(24,24,27,0.05)' }}>
          <div style={{ fontSize: isMobile ? '22px' : '26px', lineHeight: 1.7, fontFamily: langFont, color: 'var(--text)' }}>
            <span>{parts.before}</span>
            <span style={{
              display: 'inline-block', minWidth: '56px', textAlign: 'center',
              borderBottom: '2px solid ' + (answered ? '#2F9E6D' : accentHex),
              color: answered ? '#2F9E6D' : 'transparent', fontWeight: 600, padding: '0 6px',
            }}>
              {answered ? item.blank : ' '}
            </span>
            <span>{parts.after}</span>
          </div>
          {item.reading && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>{item.reading}</div>
          )}
        </div>
        {item.en && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '22px', fontStyle: 'italic' }}>
            {item.en}
          </div>
        )}

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {item.options.map(opt => {
            const isCorrect = opt === item.blank
            const isPicked = opt === picked
            let bc = 'var(--border)', bg = 'var(--surface)'
            if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
            else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
            return (
              <button key={opt} onClick={() => choose(opt)} disabled={answered} style={{
                position: 'relative', minHeight: '60px', padding: '12px 14px', borderRadius: '14px',
                border: '1.5px solid ' + bc, background: bg, cursor: answered ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 140ms ease, background 140ms ease',
              }}>
                <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text)', fontFamily: langFont, lineHeight: 1.2 }}>{opt}</span>
                {answered && isCorrect && <Check size={16} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '9px', right: '9px' }} />}
                {answered && isPicked && !isCorrect && <X size={16} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '9px', right: '9px' }} />}
              </button>
            )
          })}
        </div>

        {answered && (
          <div style={{ marginTop: '20px' }}>
            <PrimaryButton onClick={next} icon={idx + 1 >= queue.length ? CheckCircle2 : Sparkles}>
              {idx + 1 >= queue.length ? 'See results' : 'Next'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
