import { Check } from 'lucide-react'
import ComprehensionCheck from './ComprehensionCheck'

const SAGE = '#6E8466'
const btn = { border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', width: 'auto', padding: '12px 22px', marginTop: '14px' }

export default function FinishOverlay({ story, accent, onBack, note, core }) {
  const questions = core && core.questions ? core.questions : []
  const hasQuiz = questions.length > 0
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--surface)', zIndex: 6,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: hasQuiz ? 'flex-start' : 'center', textAlign: 'center',
      padding: '34px', gap: '8px', overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: '440px', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '58px', height: '58px', borderRadius: '18px', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}><Check size={28} color={accent} /></div>
        <h2 style={{ fontSize: '22px', fontWeight: 800 }}>You read it</h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '260px', lineHeight: 1.6 }}>Nice — you read all of &ldquo;{story.title}&rdquo;.</p>
        {note && <p style={{ fontSize: '13px', fontWeight: 700, color: accent, marginTop: '2px' }}>{note}</p>}

        {hasQuiz && (
          <div style={{ width: '100%', marginTop: '18px' }}>
            <ComprehensionCheck questions={questions} answers={core.answers} onAnswer={core.answerQuestion} />
          </div>
        )}

        <button onClick={onBack} style={btn}>Back to library</button>
      </div>
    </div>
  )
}
