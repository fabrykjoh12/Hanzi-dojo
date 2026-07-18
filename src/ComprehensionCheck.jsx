import { Check, X } from 'lucide-react'
import { scoreComprehension } from './comprehension'

// The shared "Check your understanding" block: multiple-choice questions with
// immediate right/wrong feedback. Presentational — the reader owns the `answers`
// state and passes `onAnswer(questionId, optionIndex)`. Used by both the classic
// reader and the new shared-engine finish screen so they can't drift.
export default function ComprehensionCheck({ questions, answers = {}, onAnswer }) {
  if (!questions || questions.length === 0) return null
  const { answered, correct } = scoreComprehension(questions, answers)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px', textAlign: 'left', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Check your understanding</span>
        {answered > 0 && (
          <span style={{ fontSize: '13px', fontWeight: 700, color: correct === questions.length ? 'var(--success)' : 'var(--text-muted)' }}>
            {correct}/{questions.length}
          </span>
        )}
      </div>
      {questions.map((q, qi) => {
        const chosen = answers[q.id]
        const isAnswered = chosen !== undefined
        return (
          <div key={q.id} style={{ marginTop: qi === 0 ? '14px' : '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text)', marginBottom: '9px', lineHeight: 1.5 }}>
              {qi + 1}. {q.question}
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index
                const isChosen = oi === chosen
                let bc = 'var(--border)', bg = 'var(--surface)'
                if (isAnswered && isCorrect) { bc = 'var(--success)'; bg = 'var(--success-bg)' }
                else if (isAnswered && isChosen) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
                return (
                  <button
                    key={oi}
                    onClick={() => { if (!isAnswered && onAnswer) onAnswer(q.id, oi) }}
                    disabled={isAnswered}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                      textAlign: 'left', padding: '11px 14px', borderRadius: '11px',
                      border: '1.5px solid ' + bc, background: bg, color: 'var(--text)',
                      cursor: isAnswered ? 'default' : 'pointer', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <span>{opt}</span>
                    {isAnswered && isCorrect && <Check size={17} strokeWidth={2.4} color="var(--success)" />}
                    {isAnswered && isChosen && !isCorrect && <X size={17} strokeWidth={2.4} color="#DC2626" />}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
