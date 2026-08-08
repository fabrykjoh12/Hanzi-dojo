import { useState } from 'react'
import { Check } from 'lucide-react'
import { BRAND_INK } from './brand'
import { ink } from './languageTheme'
import {
  stepAt, isCorrect, isLastStep, progressLabel, TASTE_STEPS,
} from './tasteSteps'

// The pre-signup wow moment. Content and rules live in characterTaste.js;
// this is presentation and one piece of local state.
//
// Deliberately silent. The old version required tapping words to hear them,
// which fails on a phone in a pocket, on mute, or in public — the three
// situations someone actually installs an app in.
//
// A wrong answer is not punished: the correct option is marked, the
// explanation appears anyway, and the button says Next. Getting 山 wrong is
// not a failure to correct, it is a guess that did not land, and the
// explanation is the reward either way.

export default function CharacterTaste({ onComplete, onSkip, onAnswer }) {
  const [index, setIndex] = useState(0)
  const [choice, setChoice] = useState(null)

  const step = stepAt(index)
  if (!step) return null

  const answered = choice !== null
  const right = isCorrect(step, choice)

  const pick = (i) => {
    if (answered) return
    setChoice(i)
    if (onAnswer) onAnswer({ id: step.id, correct: isCorrect(step, i) })
  }

  const next = () => {
    if (isLastStep(index)) { onComplete(); return }
    setIndex(index + 1)
    setChoice(null)
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', gap: '6px' }} aria-hidden="true">
        {TASTE_STEPS.map((s, i) => (
          <span key={s.id} style={{
            flex: 1, height: '4px', borderRadius: '999px',
            background: i <= index ? BRAND_INK : 'var(--border)',
            transition: 'background 240ms ease',
          }} />
        ))}
      </div>

      {/* The character itself, given the room a thing worth looking at needs. */}
      <div
        lang="zh-Hans"
        style={{
          fontFamily: "'Noto Sans SC', sans-serif",
          fontSize: step.hanzi.length > 1 ? '68px' : '84px',
          lineHeight: 1.15, color: ink(BRAND_INK), textAlign: 'center',
          letterSpacing: step.hanzi.length > 1 ? '0.04em' : 0,
        }}
      >
        {step.hanzi}
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 650, color: 'var(--text)', lineHeight: 1.4 }}>
          {step.question}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600 }}>
          {progressLabel(index)}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {step.options.map((label, i) => {
          const isAnswer = i === step.answer
          // After answering, the right option is always marked — including
          // when they missed it. They came for the answer, not a verdict.
          const show = answered && (isAnswer || i === choice)
          const good = answered && isAnswer
          return (
            <button
              key={label}
              onClick={() => pick(i)}
              disabled={answered}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                minHeight: '54px', padding: '10px 16px',
                borderRadius: '14px', cursor: answered ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'Inter, sans-serif',
                fontSize: '16px', fontWeight: 650,
                color: 'var(--text)',
                border: '1px solid ' + (show ? (good ? BRAND_INK : 'var(--border)') : 'var(--border)'),
                background: good
                  ? 'color-mix(in srgb, ' + BRAND_INK + ' 10%, var(--surface))'
                  : 'var(--surface)',
                opacity: answered && !show ? 0.45 : 1,
                transition: 'background 160ms ease, opacity 160ms ease, border-color 160ms ease',
              }}
            >
              <span style={{ flex: 1 }}>{label}</span>
              {good && <Check size={19} strokeWidth={2.4} color={ink(BRAND_INK)} />}
            </button>
          )
        })}
      </div>

      {answered && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* role=status so a screen reader hears the explanation, which is
              the entire content of this screen, rather than only the taps. */}
          <p role="status" style={{
            margin: 0, fontSize: '14.5px', lineHeight: 1.6,
            color: 'var(--text)', textAlign: 'center',
          }}>
            <strong style={{ color: ink(BRAND_INK) }}>
              {step.hanzi} · {step.pinyin}
            </strong>
            {right ? ' — got it. ' : ' — '}
            {step.reveal}
          </p>

          <button
            onClick={next}
            style={{
              width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
              background: 'var(--text)', color: 'var(--bg)',
              fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            {isLastStep(index) ? 'Start learning' : 'Next'}
          </button>
        </div>
      )}

      {!answered && (
        <button
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', color: 'var(--text-faint)',
            fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', padding: '6px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Skip
        </button>
      )}
    </div>
  )
}
