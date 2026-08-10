import { Volume2, VolumeX } from 'lucide-react'
import { markerCardShadow, markerPillStyle, markerDotStyle } from './cardMarker'

// The flashcard itself, as a component.
//
// Lifted out of Study.jsx unchanged: the same surface, the same status band,
// the same header row, the same typography, the same footer prompt, all sized
// by the same studyLayout object. It moved so that the onboarding tutorial can
// show the REAL card instead of a lookalike — a lookalike is how a learner ends
// up relearning a control they were already taught.
//
// Presentation only. It owns no queue, no scheduling, no audio element and no
// network: the word arrives as props, the audio buttons call back, and
// everything answer-side that is specific to a real learner's card (the example
// sentence, the story attribution, the leech panel) is passed in as `children`
// and stays in Study.
//
//   layout      studyLayout() output — the single source of card geometry
//   marker      cardMarker() output — new vs review, and its band
//   ruby        furiganaParts() output, or null. Japanese only.
//   reading     already gated by the caller (null when it should not show)
//   audioUrl    truthy shows the audio controls once the card is revealed
//   flash       { color, id } — the post-grade feedback wash, or null
//   onReveal    null makes the card inert (it is already revealed, or the
//               caller is driving the reveal some other way)

export default function Flashcard({
  layout,
  marker,
  flipped,
  word,
  ruby = null,
  charFont,
  wordLabel,
  reading = null,
  readingColor,
  meaning,
  accentHex,
  audioUrl = null,
  audioBroken = false,
  audioSpeed = 1,
  onReplay,
  onCycleSpeed,
  footerHint = null,
  flash = null,
  onReveal = null,
  children = null,
}) {
  const charFontSize = layout.wordSize + 'px'
  const revealable = Boolean(onReveal) && !flipped

  return (
    <div
      onClick={() => { if (revealable) onReveal() }}
      aria-live="polite"
      role={revealable ? 'button' : undefined}
      tabIndex={revealable ? 0 : undefined}
      aria-label={revealable ? wordLabel : undefined}
      style={{
        width: '100%', maxWidth: '680px',
        // Desktop keeps its fixed 420px card; on mobile the card shrinks to
        // whatever is left over instead of forcing the page to overflow.
        minHeight: layout.cardMinHeight + 'px',
        ...(layout.cardFlex ? { flex: layout.cardFlex } : {}),
        background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '26px',
        // The front-of-card status band — new vs. review only, never a
        // struggling/leech signal (that would bias the recall attempt;
        // see the leech panel, which is answer-side only).
        // Geometry and tone live in cardMarker.js.
        boxShadow: markerCardShadow(marker),
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
        cursor: revealable ? 'pointer' : 'default', padding: layout.cardPadding + 'px',
        position: 'relative', perspective: '1200px',
      }}
    >
      {flash && (
        <div
          key={flash.id}
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: '26px', pointerEvents: 'none',
            ['--flash']: flash.color, zIndex: 3,
            animation: 'hd-grade-flash 460ms ease-out forwards',
          }}
        />
      )}

      {/* State pill + audio controls share one header row: the controls
          used to float absolutely over the card, which covered the word's
          furigana on narrow screens. In flow they can't cover anything. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', flexShrink: 0, position: 'relative', zIndex: 2 }}>
        {/* The band above carries the colour; this pill carries the word,
            so the state never depends on colour alone. The dot is the same
            mark the header legend uses, which is what ties the two. */}
        <span style={markerPillStyle()}>
          <span aria-hidden style={markerDotStyle(marker)} />
          {marker.label}
        </span>
        {audioUrl && flipped && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {audioBroken ? (
              <span
                title="This word's audio file couldn't be loaded"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  height: '40px', padding: '0 14px', borderRadius: '13px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-faint)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
                }}
              >
                <VolumeX size={18} strokeWidth={2} />
                No audio
              </span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onReplay() }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  height: '40px', padding: '0 14px', borderRadius: '13px',
                  background: accentHex + '10', border: '1px solid ' + accentHex + '2A', cursor: 'pointer',
                  color: accentHex, fontSize: '13px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
                }}
                title="Replay audio"
                aria-label="Replay audio"
              >
                <Volume2 size={18} strokeWidth={2} />
                Replay
              </button>
            )}
            {/* The turtle button used to sit here, playing a separately
                synthesized slow reading. Three controls for one feature —
                Replay, turtle, speed — was the clutter reported from a
                device, and two of them meant "slower". The speed control
                now owns that, and Replay uses whatever it is set to. */}
            <button
              onClick={e => { e.stopPropagation(); onCycleSpeed() }}
              style={{
                width: '48px', height: '40px', borderRadius: '13px',
                background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '12px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
              }}
              title={'Playback speed: ' + audioSpeed + '×'}
              // The label states the CURRENT rate and what tapping does,
              // because the glyph alone ("1×") reads as a value, not a
              // control, to anyone who cannot see it change.
              aria-label={'Playback speed ' + audioSpeed + '×. Tap to change.'}
            >
              {audioSpeed}×
            </button>
          </div>
        )}
      </div>

      <div
        key={flipped ? 'back' : 'front'}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: layout.contentPadding,
          transformOrigin: 'center', willChange: 'transform',
          animation: 'hd-flip-in 260ms ease',
        }}
      >
        {ruby ? (
          <div style={{
            fontSize: charFontSize, fontWeight: 400, color: 'var(--text)',
            fontFamily: charFont, lineHeight: 1.25,
          }}>
            {ruby.lead}
            <ruby>
              {ruby.core}
              <rt style={{ fontSize: '18px', color: 'var(--text-muted)' }}>{ruby.coreReading}</rt>
            </ruby>
            {ruby.trail}
          </div>
        ) : (
          <div style={{
            fontSize: charFontSize, fontWeight: 400, color: 'var(--text)',
            fontFamily: charFont, lineHeight: 1.08,
            overflowWrap: 'anywhere',
          }}>
            {word}
          </div>
        )}

        {flipped && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {reading && (
              <div style={{ fontSize: '21px', color: readingColor, marginTop: '18px', fontWeight: 650 }}>
                {reading}
              </div>
            )}
            <div style={{ fontSize: layout.meaningSize + 'px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.45, fontWeight: 550 }}>
              {meaning}
            </div>
            {children}
          </div>
        )}
      </div>

      {/* The prompt line is the first thing sacrificed on a short phone —
          the grade buttons themselves are never negotiable. */}
      {layout.showFooterHint && footerHint && (
        <div style={{
          flexShrink: 0,
          minHeight: layout.footerMinHeight + 'px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderTop: '1px solid var(--surface-2)', paddingTop: layout.footerPadTop + 'px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 650 }}>
            {footerHint}
          </span>
        </div>
      )}
    </div>
  )
}
