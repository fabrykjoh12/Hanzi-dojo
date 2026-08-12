import { useEffect, useRef } from 'react'
import { Check, ChevronRight, Lock, Zap } from 'lucide-react'
import ComprehensionCheck from './ComprehensionCheck'
import { trapDialogFocus } from './dialogFocus'

// P14-0: vermilion, themed. See ui.jsx.
const PRIMARY = 'var(--primary)'
const btn = { border: 'none', borderRadius: '16px', background: PRIMARY, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', width: 'auto', padding: '12px 22px', marginTop: '14px' }

// The end of a chapter must never be a dead end: it either hands the learner
// the next chapter (unlocked), points them back at flashcards (locked — the
// loop's return stroke), or seals the series (complete). Standalone stories
// keep the plain finish.
function NextChapterBlock({ next, accent, onNextChapter, onStudy }) {
  if (!next) return null
  const chapterName = (next.nativeLabel ? next.nativeLabel + ' · ' : 'Chapter ' + next.number + ' · ') + next.title

  if (next.kind === 'series-complete') {
    return (
      <div style={{
        width: '100%', marginTop: '18px', padding: '16px 18px', borderRadius: '16px',
        border: '1px solid ' + accent + '2A', background: accent + '0D', textAlign: 'left',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>
          Series complete
        </div>
        <div style={{ marginTop: '5px', fontSize: '14px', color: 'var(--text)', fontWeight: 700 }}>
          {next.seriesTitle ? 'You finished ' + next.seriesTitle + '.' : 'You finished the story.'}
        </div>
        <div style={{ marginTop: '3px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          All {next.total} chapters read. Choose your next story from the library.
        </div>
      </div>
    )
  }

  if (next.kind === 'unlocked') {
    return (
      <button
        onClick={onNextChapter}
        style={{
          width: '100%', marginTop: '18px', padding: '15px 18px', borderRadius: '16px',
          border: 'none', background: accent, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '13px', textAlign: 'left',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>
            Next
          </span>
          <span style={{ display: 'block', marginTop: '3px', fontSize: '15px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chapterName}
          </span>
        </span>
        <ChevronRight size={20} color="#fff" style={{ flexShrink: 0 }} />
      </button>
    )
  }

  // Locked: the tease that sends the loop back into flashcards.
  return (
    <div style={{
      width: '100%', marginTop: '18px', padding: '16px 18px', borderRadius: '16px',
      border: '1px solid var(--border)', background: 'var(--surface-2)', textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        <Lock size={13} strokeWidth={2.2} aria-hidden="true" /> Next
      </div>
      <div style={{ marginTop: '5px', fontSize: '14.5px', fontWeight: 750, color: 'var(--text)' }}>
        {chapterName}
      </div>
      <div style={{ marginTop: '3px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Complete your next flashcard session to continue.
      </div>
      {onStudy && (
        <button onClick={onStudy} style={{
          marginTop: '12px', minHeight: '44px', padding: '0 18px', borderRadius: '13px',
          border: 'none', background: accent, color: '#fff', cursor: 'pointer',
          fontSize: '13.5px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
        }}>
          <Zap size={15} strokeWidth={2.3} color="#fff" /> Review flashcards
        </button>
      )}
    </div>
  )
}

export default function FinishOverlay({ story, accent, onBack, note, core, onPractice, nextChapter = null, onNextChapter = null, onStudy = null }) {
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
        <h2 id="finish-overlay-title" style={{ fontSize: '22px', fontWeight: 800 }}>
          {nextChapter ? 'Chapter complete' : 'You read it'}
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.6 }}>
          Nice — you read all of &ldquo;{story.title}&rdquo;.
        </p>
        {note && <p style={{ fontSize: '13px', fontWeight: 700, color: accent, marginTop: '2px' }}>{note}</p>}

        {hasQuiz && (
          <div style={{ width: '100%', marginTop: '18px' }}>
            <ComprehensionCheck questions={questions} answers={core.answers} onAnswer={core.answerQuestion} />
          </div>
        )}

        <NextChapterBlock next={nextChapter} accent={accent} onNextChapter={onNextChapter} onStudy={onStudy} />

        {canPractice && (
          <button onClick={() => onPractice(practiceWords)} style={{ ...btn, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            Practice the {practiceWords.length} new words
          </button>
        )}
        <button
          onClick={onBack}
          style={nextChapter && nextChapter.kind === 'unlocked'
            ? { ...btn, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
            : btn}
        >
          Back to library
        </button>
      </div>
    </div>
  )
}
