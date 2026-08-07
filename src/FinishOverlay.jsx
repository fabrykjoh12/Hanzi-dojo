import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import ComprehensionCheck from './ComprehensionCheck'
import { trapDialogFocus } from './dialogFocus'

const SAGE = '#6E8466'
const btn = { border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', width: 'auto', padding: '12px 22px', marginTop: '14px' }

export default function FinishOverlay({ story, accent, onBack, note, core, onPractice }) {
  const questions = core && core.questions ? core.questions : []
  const hasQuiz = questions.length > 0
  // Only offer practice when enough new words have a usable example sentence to
  // build a fill-in-the-blank drill (mirrors buildFillBlankQuestions' filter).
  const practiceWords = ((core && core.readability && core.readability.newWords) || [])
    .filter(w => w.example_sentence && w.example_sentence.indexOf(w.word) !== -1)
  const canPractice = typeof onPractice === 'function' && practiceWords.length >= 4

  // This covers the whole reader, so it is a modal dialog: focus moves in on
  // mount (otherwise a screen reader is never told the story ended and stays
  // parked on the last line), Tab stays inside, and `aria-modal` takes the
  // reader behind it out of the assistive-tech tree. Same pattern as
  // WordLookupSheet — see dialogFocus.js.
  const panelRef = useRef(null)
  useEffect(() => {
    if (panelRef.current) panelRef.current.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-overlay-title"
      tabIndex={-1}
      onKeyDown={e => trapDialogFocus(e, panelRef.current)}
      style={{
        position: 'absolute', inset: 0, background: 'var(--surface)', zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: hasQuiz ? 'flex-start' : 'center', textAlign: 'center',
        padding: '34px', gap: '8px', overflowY: 'auto', outline: 'none',
      }}>
      <div style={{ width: '100%', maxWidth: '440px', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '58px', height: '58px', borderRadius: '18px', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}><Check size={28} color={accent} /></div>
        <h2 id="finish-overlay-title" style={{ fontSize: '22px', fontWeight: 800 }}>You read it</h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '260px', lineHeight: 1.6 }}>Nice — you read all of &ldquo;{story.title}&rdquo;.</p>
        {note && <p style={{ fontSize: '13px', fontWeight: 700, color: accent, marginTop: '2px' }}>{note}</p>}

        {hasQuiz && (
          <div style={{ width: '100%', marginTop: '18px' }}>
            <ComprehensionCheck questions={questions} answers={core.answers} onAnswer={core.answerQuestion} />
          </div>
        )}

        {canPractice && (
          <button onClick={() => onPractice(practiceWords)} style={{ ...btn, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            Practice the {practiceWords.length} new words
          </button>
        )}
        <button onClick={onBack} style={btn}>Back to library</button>
      </div>
    </div>
  )
}
