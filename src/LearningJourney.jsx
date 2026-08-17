import { Fragment } from 'react'
import { Check, Lock, Play } from 'lucide-react'
import MistyArt from './MistyArt'
import { SAMPLE_GAP_EM } from './homeJourney'
import { ink } from './languageTheme'

// The Misty Atmosphere learning journey — the "Today's Learning" section.
//
// A restrained segmented rail sits close to the cards: completed node →
// connector → current node → connector → upcoming node. Connectors exist only
// BETWEEN steps (no tail above the first or below the last), at hairline
// weight in a low-contrast deep blue-gray mixed into the border token so it
// themes. It reads as a journey, not task management: the nodes are state
// language (muted-jade check / small cinnabar dot / quiet outline), and the
// step content decides what the learner does, not the rail.
//
// What each step RENDERS comes from homeJourney.js (pure, tested). This file
// only draws: compact rows for done/upcoming steps, and the large current-card
// slot for the step that holds today's action.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const LIGHT_INK = '#FFFBF4'
const RAIL_LINE = 'color-mix(in srgb, #5B6474 42%, var(--border))'
// Connectors touching an upcoming step recede further than the travelled path.
const RAIL_LINE_FAINT = 'color-mix(in srgb, #5B6474 24%, var(--border))'

function RailNode({ status, accent }) {
  if (status === 'done') {
    return (
      <span style={{
        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
        border: '1.5px solid color-mix(in srgb, var(--success) 50%, var(--border))',
        background: 'color-mix(in srgb, var(--success) 9%, var(--surface))',
        color: 'color-mix(in srgb, var(--success) 80%, var(--text-muted))',
        display: 'grid', placeItems: 'center',
      }}>
        <Check size={11} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span style={{
        width: '13px', height: '13px', borderRadius: '50%', flexShrink: 0,
        background: ink(accent),
        boxShadow: '0 0 0 4px color-mix(in srgb, ' + accent + ' 15%, transparent)',
      }} />
    )
  }
  return (
    <span style={{
      width: '11px', height: '11px', borderRadius: '50%', flexShrink: 0,
      border: '1.5px solid color-mix(in srgb, var(--text-faint) 32%, var(--border))',
      background: 'transparent',
    }} />
  )
}

// The rail cell for one step. The spacers keep the node centered against its
// row; the connector is a SHORT stroke hugging the node — never a full-height
// line — so the rail reads as a journey's waypoints, not a spine.
function RailCell({ status, accent, hasPrev, hasNext }) {
  const line = status === 'upcoming' ? RAIL_LINE_FAINT : RAIL_LINE
  const spacer = (visible, side) => (
    <span style={{
      flex: 1, width: '1.5px', display: 'flex', flexDirection: 'column',
      justifyContent: side === 'top' ? 'flex-end' : 'flex-start',
    }}>
      {visible && <span style={{ width: '1.5px', height: '22px', maxHeight: '100%', borderRadius: '1px', background: line }} />}
    </span>
  )
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      {spacer(hasPrev, 'top')}
      <RailNode status={status} accent={accent} />
      {spacer(hasNext, 'bottom')}
    </span>
  )
}

// A quiet step row — completed or upcoming (and the story step when it is the
// current one: the big Story Reward card right below is its object).
function CompactStep({ step, theme }) {
  const upcoming = step.status === 'upcoming'
  const current = step.status === 'current'
  return (
    <div style={{
      background: upcoming ? 'color-mix(in srgb, var(--surface) 52%, transparent)' : 'var(--surface)',
      border: '1px solid ' + (current
        ? 'color-mix(in srgb, ' + theme.accentHex + ' 28%, var(--border))'
        : 'color-mix(in srgb, var(--border) 85%, transparent)'),
      borderRadius: '16px', padding: '13px 16px', minHeight: '44px',
      opacity: upcoming ? 0.85 : 1,
      textAlign: 'left', fontFamily: UI_FONT,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
        {upcoming && <Lock size={13} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-faint)' }} />}
        <span
          lang={step.titleIsStory ? theme.langTag : undefined}
          style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: step.titleIsStory ? theme.font + ', sans-serif' : UI_FONT,
            fontSize: '14.5px', lineHeight: 1.25, fontWeight: 640,
            color: upcoming ? 'var(--text-muted)' : 'var(--text)',
          }}
        >
          {step.title}
        </span>
      </span>
      {step.sub && (
        <span style={{ display: 'block', marginTop: '3px', fontSize: '12px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-faint)' }}>
          {step.sub}
        </span>
      )}
    </div>
  )
}

// The journey: rail column + content column. The step whose key matches
// `currentCardKey` renders the passed large card; everything else is a row.
export default function LearningJourney({ steps, currentCardKey, currentCard, theme }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '10px' }}>
      {steps.map((step, index) => (
        <Fragment key={step.key}>
          <RailCell
            status={step.status}
            accent={theme.accentHex}
            hasPrev={index > 0}
            hasNext={index < steps.length - 1}
          />
          <div
            data-journey-step={step.key}
            data-step-status={step.status}
            className="hd-home-rise"
            style={{ minWidth: 0, paddingBottom: index < steps.length - 1 ? '12px' : 0, animationDelay: (90 + index * 40) + 'ms' }}
          >
            {step.key === currentCardKey && currentCard ? currentCard : <CompactStep step={step} theme={theme} />}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

// ── The current-card variants ───────────────────────────────────────────────

// Today's session, under the approved misty treatment. The WHOLE card is the
// button (same handoff contract as before: the tapped rectangle is handed to
// Study); the Start pill inside is the affordance, not a nested control. The
// artwork is a separate aria-hidden layer — no text is baked into it.
export function CurrentSessionCard({ words, wordSizePx, queueLine, estimate, theme, onStart }) {
  return (
    <button
      type="button"
      aria-label="Start cards"
      data-tour="home-queue"
      onClick={event => onStart(event.currentTarget.getBoundingClientRect())}
      className="hd-press-deep hd-home-rise"
      style={{
        position: 'relative', width: '100%', minHeight: 'min(46vh, 380px)', padding: 0,
        borderRadius: '24px', overflow: 'hidden', cursor: 'pointer',
        border: '1px solid color-mix(in srgb, ' + theme.accentHex + ' 26%, var(--border))',
        boxShadow: 'var(--shadow-2)', background: '#39414F',
        color: LIGHT_INK, fontFamily: UI_FONT, textAlign: 'left',
        animationDelay: '90ms',
      }}
    >
      <MistyArt variant="focus" />
      <span style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', minHeight: 'min(46vh, 380px)', padding: '18px 22px 18px',
      }}>
        <span style={{
          alignSelf: 'flex-start', padding: '7px 12px', borderRadius: '999px',
          border: '1px solid color-mix(in srgb, ' + theme.accentHex + ' 60%, transparent)',
          background: 'rgba(22, 19, 17, 0.30)',
          color: 'color-mix(in srgb, ' + theme.accentHex + ' 52%, #FFFFFF)',
          fontSize: '10.5px', lineHeight: 1, fontWeight: 760, letterSpacing: '0.1em',
        }}>
          TODAY’S FOCUS
        </span>
        <span style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '21px', lineHeight: 1.25, fontWeight: 720, letterSpacing: '-0.01em', textShadow: '0 1px 14px rgba(15, 18, 26, 0.45)' }}>
            Today’s session
          </span>
          <span style={{ display: 'block', marginTop: '5px', fontSize: '12.5px', lineHeight: 1.3, fontWeight: 580, color: 'rgba(255, 251, 244, 0.82)' }}>
            {queueLine}
          </span>
          <span style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'center',
            gap: SAMPLE_GAP_EM + 'em', minHeight: '54px', marginTop: '12px',
            fontSize: wordSizePx + 'px', lineHeight: 1.15, fontWeight: 500,
            color: '#FFFFFF', textShadow: '0 2px 16px rgba(15, 18, 26, 0.5)',
            whiteSpace: 'nowrap',
          }}>
            {(words || []).map(word => (
              <span key={word} lang={theme.langTag} className="hd-fade-in" style={{ fontFamily: theme.font + ', sans-serif' }}>{word}</span>
            ))}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12.5px', lineHeight: 1.2, fontWeight: 600, color: 'rgba(255, 251, 244, 0.82)' }}>
            {estimate}
          </span>
          <span aria-hidden="true" style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '11px 17px', borderRadius: '999px',
            border: '1px solid rgba(255, 251, 244, 0.55)', background: 'rgba(20, 24, 32, 0.35)',
            fontSize: '13px', lineHeight: 1, fontWeight: 730,
          }}>
            <Play size={12} strokeWidth={2.4} fill="currentColor" />
            Start
          </span>
        </span>
      </span>
    </button>
  )
}

// Grammar practice as the current step — a quieter object than the session.
export function PracticeCard({ grammarDueCount, theme, onOpen }) {
  return (
    <button
      type="button"
      aria-label="Grammar review"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{
        position: 'relative', width: '100%', minHeight: 'min(32vh, 260px)', padding: '20px 22px',
        display: 'grid', placeItems: 'center', alignContent: 'center', gap: '8px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px',
        boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)',
        color: 'var(--text)', fontFamily: UI_FONT, cursor: 'pointer', animationDelay: '90ms',
      }}
    >
      <span style={{ fontSize: '52px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{grammarDueCount}</span>
      <span style={{ fontSize: '14.5px', lineHeight: 1, fontWeight: 620, color: 'var(--text-muted)' }}>
        {grammarDueCount === 1 ? 'grammar pattern due' : 'grammar patterns due'}
      </span>
      <span aria-hidden="true" style={{
        marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '7px',
        padding: '11px 17px', borderRadius: '999px',
        background: 'color-mix(in srgb, ' + theme.accentHex + ' 10%, var(--surface))',
        color: ink(theme.accentHex), fontSize: '13px', lineHeight: 1, fontWeight: 730,
      }}>
        <Play size={12} strokeWidth={2.4} fill="currentColor" />
        Practice
      </span>
    </button>
  )
}

// Everything is done — the day goes quiet.
export function DoneCard() {
  return (
    <div className="hd-home-rise" style={{
      padding: '30px 22px', display: 'grid', placeItems: 'center', alignContent: 'center', gap: '7px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px',
      boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)', fontFamily: UI_FONT,
      animationDelay: '230ms',
    }}>
      <span style={{ fontSize: '19px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.015em', color: 'var(--text)' }}>Done for today</span>
      <span style={{ fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>Nothing else is waiting.</span>
    </div>
  )
}

// Nothing due and no story on deck — offer the shelf.
export function ShelfCard({ onOpen }) {
  return (
    <button
      type="button"
      aria-label="Open the story shelf"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{
        width: '100%', minHeight: '150px', padding: '20px 22px',
        display: 'grid', placeItems: 'center', alignContent: 'center', gap: '7px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px',
        boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)',
        color: 'var(--text)', fontFamily: UI_FONT, cursor: 'pointer', animationDelay: '90ms',
      }}
    >
      <span style={{ fontSize: '18px', lineHeight: 1, fontWeight: 720, letterSpacing: '-0.015em' }}>Open the story shelf</span>
      <span style={{ fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>Nothing due — read anything you like.</span>
    </button>
  )
}
