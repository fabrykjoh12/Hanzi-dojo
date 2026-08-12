import { useState, useEffect, useRef, useImperativeHandle } from 'react'
import { BookOpen, Check } from 'lucide-react'
import {
  initialTutorialState, view, advance, retreat, isComplete, ACTIONS,
  serializeTutorial, resumeTutorialState,
} from './tutorialScript'
import { readTutorialProgress, saveTutorialPosition } from './prelogin'
import Flashcard from './Flashcard'
import GradeRow from './GradeRow'
import { cardMarker } from './cardMarker'
import { gradePromptText } from './gradePrompt'
import { studyLayout } from './studyLayout'
import { useIsMobile } from './useIsMobile'
import { useViewportHeight } from './useViewportHeight'
import { useReadingFont } from './useReadingFont'
import { useTutorialAudio } from './useTutorialAudio'
import { languageTheme, ink, pinyinInk} from './languageTheme'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { tapFeedback, successFeedback } from './haptics'
import { prefersReducedMotion } from './splashIntro'
import { NUM } from './designTokens'
import { track, EVENTS } from './analytics'

// The onboarding tutorial: the Mini First Session.
//
// ── The boundary ────────────────────────────────────────────────────────────
// This file renders tutorialScript.js and nothing else decides anything. It may
// own two things: what is on screen, and one <audio> element. It may NOT touch
// Supabase, FSRS, the study queue, a profile, a track, a story unlock, or any
// learner progress — and it does not import a single module that could. A grade
// pressed here advances a state machine and is then forgotten; the learner's
// real first session starts later, from zero.
//
// The card and the grades are the REAL components (Flashcard.jsx, GradeRow.jsx,
// gradePalette, studyLayout), because the whole argument for this design is
// that a learner should not have to learn the control twice.
//
// Three props, and none of them is a second tutorial:
//
//   onComplete   fired when the learner finishes. Where that goes is the
//                caller's business — this file knows nothing about auth or
//                navigation.
//   resumable    remember where you got to, so a learner who closes the app
//                mid-tutorial is not made to start again. A replay passes
//                false: a replay is a look, not a position to be resumed from,
//                and it must not overwrite a real first run's place.
//   finishLabel  what the last button says. "Create account" for someone who
//                does not have one; Settings' replay says "Done", because
//                offering an account to a signed-in learner is nonsense.
//
// Replay is the same component and the same script — there is no second
// tutorial to keep in step with this one.

const MAX_WIDTH = 680

// The tutorial runs OUTSIDE the app shell, so there is no tab bar below the
// card and nothing else reserving the insets. It says so, and gets the whole
// screen (studyLayout.js).
const RESERVED_BOTTOM = 0

// Which states are worth reporting. Deliberately not one per Continue tap:
// where a learner stops is the signal, and an event for every advance buries it.
const FUNNEL = {
  'card-1-front': EVENTS.TUTORIAL_STARTED,
  'card-1-back': EVENTS.TUTORIAL_FIRST_REVEAL,
  'card-2-front': EVENTS.TUTORIAL_FIRST_GRADE,
  recap: EVENTS.TUTORIAL_SESSION_COMPLETE,
  // The payoff rendering of the scene — the same milestone the two-panel
  // story used to mark, so the funnel stays comparable across the change.
  'scene-after': EVENTS.TUTORIAL_STORY_REACHED,
  account: EVENTS.TUTORIAL_COMPLETED,
}

function Shell({ children, locked, height, onSkip }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      // Outside <main>, so both insets are this screen's own problem.
      padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(20px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Quiet, always in the same corner, on every state (P12-2). A learner
          who wants out is not made to hunt for the door — but it whispers,
          because the tutorial's whole bet is that the next ninety seconds are
          worth having. A full tap target even though it draws as small text. */}
      {onSkip && (
        <button
          onClick={onSkip}
          style={{
            position: 'absolute', zIndex: 2,
            top: 'calc(6px + env(safe-area-inset-top, 0px))', right: '6px',
            minHeight: '44px', minWidth: '44px', padding: '0 14px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '13.5px', fontWeight: 650,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Skip
        </button>
      )}
      <div style={{
        width: '100%', maxWidth: MAX_WIDTH + 'px',
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        // The card states are height-locked exactly as the real study screen
        // is; everything else is an ordinary column that can grow.
        ...(locked ? { height, maxHeight: height, justifyContent: 'space-between' } : { justifyContent: 'center' }),
      }}>
        {children}
      </div>
    </div>
  )
}

// One primary action. Every non-card state has exactly one.
function PrimaryAction({ label, onClick, accentHex }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', minHeight: '54px', borderRadius: '16px', border: 'none',
        background: accentHex, color: '#fff',
        fontSize: '16.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

// A story line with the words the learner just met marked in it.
//
// `<mark>` rather than a coloured span: the emphasis is semantic, so it survives
// a screen reader and a learner who cannot separate the accent from the text.
// It is underlined as well as tinted, because colour is never the only carrier.
function StoryLine({ text, known, accentHex, font }) {
  const parts = []
  let rest = text
  let guard = 0
  while (rest.length > 0 && guard < 50) {
    guard += 1
    // The earliest known word remaining in the line.
    let at = -1
    let hit = null
    for (const word of known) {
      const i = rest.indexOf(word)
      if (i !== -1 && (at === -1 || i < at)) { at = i; hit = word }
    }
    if (at === -1) { parts.push({ text: rest }); break }
    if (at > 0) parts.push({ text: rest.slice(0, at) })
    parts.push({ text: hit, known: true })
    rest = rest.slice(at + hit.length)
  }
  return (
    <span lang="zh-Hans" style={{ fontFamily: font, fontSize: '30px', lineHeight: 1.5, color: 'var(--text)' }}>
      {parts.map((p, i) => (p.known ? (
        <mark
          key={i}
          style={{
            background: 'none', color: ink(accentHex),
            borderBottom: '2px solid ' + accentHex + '88',
          }}
        >
          {p.text}
        </mark>
      ) : <span key={i}>{p.text}</span>))}
    </span>
  )
}

export default function Tutorial({ onComplete, onSkip = null, resumable = true, finishLabel = null, backRef = null }) {
  const [state, setState] = useState(() => {
    if (!resumable) return initialTutorialState()
    const saved = readTutorialProgress()
    // Anything unrecognised resumes from the beginning rather than half-way
    // into a tutorial that never happened (resumeTutorialState validates).
    return (saved && resumeTutorialState(saved.state)) || initialTutorialState()
  })
  const v = view(state)

  // Hardware Back (native): step one state backwards. The caller owns the ONE
  // registered back handler for the pre-login flow (Landing) and consults this
  // handle — the tutorial only answers whether it had somewhere to step. The
  // state is read through a ref (mirrored after each commit, never during
  // render) so the answer is synchronous; the handle itself goes through
  // useImperativeHandle, which also clears it on unmount.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })
  useImperativeHandle(backRef, () => () => {
    const prev = retreat(stateRef.current)
    if (prev === null) return false
    setState(prev)
    return true
  }, [])

  // Where the learner got to, written on every state change. Five plain values
  // — the position, and the grades they actually pressed. Nothing derived.
  useEffect(() => {
    if (resumable && !isComplete(state)) saveTutorialPosition(serializeTutorial(state))
  }, [state, resumable])

  const isMobile = useIsMobile()
  const viewportHeight = useViewportHeight()
  const theme = languageTheme('chinese')
  const accentHex = theme.accentHex
  const { fontFamily: charFont } = useReadingFont('chinese')
  const [reduced] = useState(() => prefersReducedMotion())

  const layout = studyLayout({ isMobile, viewportHeight, banners: 0, reservedBottom: RESERVED_BOTTOM })
  const audio = useTutorialAudio(v.card ? v.card.audioPath : null)

  // Rule 2 of the audio boundary: changing state silences whatever was playing.
  // Keyed on the state id, so it covers card → card as well as card → recap.
  const stop = audio.stop
  useEffect(() => { return () => stop() }, [v.id, stop])

  // The two moments that are worth feeling. Ordinary taps get their own tap
  // feedback where they happen, exactly as they do in a real session.
  const feltRef = useRef('')
  useEffect(() => {
    if (v.feedback === 'success' && feltRef.current !== v.id) {
      feltRef.current = v.id
      successFeedback()
    }
  }, [v.id, v.feedback])

  // The funnel: six milestones, each fired once. A replay is not a funnel, so
  // it reports nothing.
  const firedRef = useRef(null)
  useEffect(() => {
    if (!resumable) return
    if (!firedRef.current) firedRef.current = new Set()
    const event = FUNNEL[v.id]
    if (event && !firedRef.current.has(event)) {
      firedRef.current.add(event)
      track(event)
    }
  }, [v.id, resumable])

  // The handoff. The tutorial does not navigate and does not know what an
  // account is; it says it is finished.
  const done = isComplete(state)
  useEffect(() => { if (done && onComplete) onComplete() }, [done, onComplete])

  const send = (action, payload) => setState(s => advance(s, action, payload))
  const advanceOnce = () => { tapFeedback(); send(ACTIONS.CONTINUE) }

  // Skip (P12-2): a decision with an address. Which state it was pressed from
  // is the datum the milestone funnel cannot give — an abandonment is a device
  // closing, a skip is a choice — so it is reported here, where the state id
  // is known, and only on a real first run (a replay reports nothing, exactly
  // like the funnel). What skipping MEANS — mark the teaching handled, land on
  // the signup hand-off — is the caller's, same as finishing.
  const skip = onSkip ? () => {
    if (resumable) track(EVENTS.TUTORIAL_SKIPPED, { state_id: v.id })
    onSkip()
  } : null

  const coachAt = (anchor) => {
    const found = v.coach.find(c => c.anchor === anchor)
    return found ? found.text : null
  }

  // ── Card ──────────────────────────────────────────────────────────────────
  if (v.phase === 'card') {
    const marker = cardMarker(v.card)
    const cardCoach = coachAt('card')
    const gradesCoach = coachAt('grades')
    return (
      <Shell locked={layout.fixed} height={layout.shellHeight} onSkip={skip}>
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', marginBottom: layout.headerGap + 'px', minHeight: '24px',
          // Room for the Skip in the corner, so the coach line never sits
          // under it.
          paddingRight: skip ? '56px' : 0,
        }}>
          <span style={{ ...NUM, fontSize: '12.5px', fontWeight: 700, color: 'var(--text-faint)' }}>
            {v.cardNumber} / {v.cardTotal}
          </span>
          {cardCoach && (
            <span style={{
              fontSize: '13px', fontWeight: 650, color: ink(accentHex),
              fontFamily: 'Inter, sans-serif', textAlign: 'right',
            }}>
              {cardCoach}
            </span>
          )}
        </div>

        <Flashcard
          layout={layout}
          marker={marker}
          flipped={v.revealed}
          word={v.card.word}
          charFont={charFont}
          wordLabel={'Chinese flashcard — tap to reveal the answer'}
          reading={v.revealed ? v.card.reading : null}
          readingColor={pinyinInk(theme.accentVar)}
          meaning={v.card.meaning}
          accentHex={accentHex}
          audioUrl={audio.url}
          audioBroken={audio.broken}
          audioSpeed={audio.speed}
          onReplay={() => { tapFeedback(); audio.play(); send(ACTIONS.REPLAY) }}
          onCycleSpeed={() => audio.cycleSpeed()}
          audioHint={coachAt('audio')}
          // The card's own prompts, except on card 1 — where the tutorial is
          // already saying both of them, louder and in the right place ("Tap to
          // reveal" above the card, the grade question above the buttons).
          // Printing them twice is how a taught screen starts to look busy.
          footerHint={v.cardIndex === 0
            ? null
            : (v.revealed ? gradePromptText(marker.key) : 'Recall first, then reveal')}
          onReveal={v.revealed ? null : () => { tapFeedback(); send(ACTIONS.REVEAL) }}
        />

        <div style={{ marginTop: layout.gradeTopGap + 'px', flexShrink: 0 }}>
          {v.revealed && (
            <>
              {gradesCoach && (
                <div style={{
                  textAlign: 'center', marginBottom: '10px',
                  fontSize: '13.5px', fontWeight: 700, color: 'var(--text)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {gradesCoach}
                </div>
              )}
              {/* Card 1: what the grades MEAN. Cards 2–3: what a grade DOES —
                  the schedule preview, in the same slot the real row uses, so
                  "your grade decides when you see it again" is demonstrated
                  on the very next card rather than asserted (P12-3). */}
              <GradeRow
                labels={v.glosses || v.intervals || ['', '', '', '']}
                onGrade={(_grade, key) => { tapFeedback(); send(ACTIONS.GRADE, key) }}
                suggested={null}
                layout={layout}
              />
            </>
          )}
        </div>
      </Shell>
    )
  }

  // ── Everything else ───────────────────────────────────────────────────────
  // One transition, the app's own (index.css). Reduced motion drops it entirely
  // — and its keyframes are already flattened to a fade under the media query,
  // so this is belt and braces rather than a second motion system.
  const rise = reduced ? undefined : 'hd-rise-in 260ms cubic-bezier(.32,.72,.24,1) both'

  if (v.phase === 'welcome') {
    return (
      <Shell onSkip={skip}>
        <div style={{ textAlign: 'center', animation: rise }}>
          <div style={{ ...heroWordmarkStyle('34px'), marginBottom: '18px' }}>{BRAND_NAME}</div>
          <h1 style={{
            margin: '0 0 34px', fontSize: '26px', lineHeight: 1.35, fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-0.01em', textWrap: 'balance',
          }}>
            {v.copy.title}
          </h1>
          <PrimaryAction label={v.copy.cta} onClick={advanceOnce} accentHex={accentHex} />
        </div>
      </Shell>
    )
  }

  if (v.phase === 'recap' || v.phase === 'unlock') {
    const unlock = v.phase === 'unlock'
    return (
      <Shell onSkip={skip}>
        <div style={{ textAlign: 'center', animation: rise }} key={v.id}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, ' + accentHex + ' 11%, var(--surface))',
            border: '1px solid color-mix(in srgb, ' + accentHex + ' 26%, var(--border))',
          }}>
            {unlock
              ? <BookOpen size={28} strokeWidth={1.8} color={ink(accentHex)} />
              : <Check size={30} strokeWidth={2.2} color={ink(accentHex)} />}
          </div>
          <h1 style={{
            margin: '0 0 8px', fontSize: '24px', fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-0.01em',
          }}>
            {v.copy.title}
          </h1>
          <p style={{ margin: '0 0 32px', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            {v.copy.line}
          </p>
          <PrimaryAction label={v.copy.cta} onClick={advanceOnce} accentHex={accentHex} />
        </div>
      </Shell>
    )
  }

  // ── The scene, twice ────────────────────────────────────────────────────
  // The same fixture both times (TUTORIAL_SCENE — one source, two renderings).
  // Before: bare Chinese, no marks, no translations — the learner registers
  // "I can't quite read this" and nothing more. After: the learned words
  // marked, the translations shown, and the fact stated once. The payoff is
  // that the text visibly did not change; only the learner did.
  if (v.phase === 'scene-before' || v.phase === 'scene-after') {
    return (
      <Shell onSkip={skip}>
        <div style={{ width: '100%', animation: rise }} key={v.id}>
          <p style={{
            margin: '0 0 20px', padding: '12px 15px', borderRadius: '4px',
            background: 'var(--surface-2)', borderLeft: '3px solid var(--border)',
            fontSize: '14px', fontStyle: 'italic', color: 'var(--text-muted)',
            lineHeight: 1.55, textAlign: 'left',
          }}>
            {v.scene.setting}
          </p>
          <div style={{
            padding: '20px 18px', borderRadius: '18px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-1)', textAlign: 'left',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }}>
            {v.scene.lines.map(line => (
              <div key={line.id}>
                <div style={{
                  fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '10px',
                }}>
                  {line.speaker}
                </div>
                <StoryLine
                  text={line.text}
                  known={v.marked ? line.known : []}
                  accentHex={accentHex}
                  font={charFont}
                />
                {v.marked && (
                  <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.5 }}>
                    {line.translation}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{
            margin: '20px 0 0', textAlign: 'center', fontSize: '15px',
            fontWeight: 700, lineHeight: 1.5,
            color: v.marked ? ink(accentHex) : 'var(--text-muted)',
          }}>
            {v.copy.line}
          </p>
          <div style={{ marginTop: '28px' }}>
            <PrimaryAction
              label={v.marked ? (finishLabel || v.copy.cta) : v.copy.cta}
              onClick={advanceOnce}
              accentHex={accentHex}
            />
          </div>
        </div>
      </Shell>
    )
  }

  // Complete. The caller has been told; there is nothing left to show.
  return (
    <Shell>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '15px' }} data-tutorial="complete">
        {BRAND_NAME}
      </div>
    </Shell>
  )
}
