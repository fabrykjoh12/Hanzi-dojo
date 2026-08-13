import { TYPE } from './typeScale'
import { RADIUS, ELEVATION } from './shape'
import { languageTheme, inkWarm } from './languageTheme'
import { Button } from './controls'
import { buildGuide, guideContextLine, upcomingLabel, STATUS } from './homeGuide'
import { NAV_GLYPHS } from './navGlyphFamily'
import RedPacket from './RedPacket'
import { PACKET_CONCEPTS, PACKET_NOTES } from './redPacketFamily'
import { OPEN_PHASES, storyboardFrames, packetFrame } from './redPacketOpen'
import { VITALITY_STATES, VITALITY_WIDTHS } from './homeVitalityFixtures'
import bgChinese from './assets/bg-chinese.webp'

// ── P14-5D: Home's vertical rhythm, in the settled visual language ──────────
//
// DEV-ONLY. Mounted on /dev, deleted when a variant is migrated.
//
// ── Round 1 and 2: which material makes the screen live (settled) ─────────
//
// Three treatments of one layout, varying marker, object, CTA material,
// connector, atmosphere and completion mark. What they settled, and what is now
// COMMON to everything below rather than a variable:
//
//   · The lacquer button wins on sight. Zoomed 4x, the material CTA has a lit
//     top edge, a body and a turned-away lower edge; the flat fill of the same
//     colour is a sticker.
//   · The identity object at 108px is the image a Cards day does not otherwise
//     have — and it costs no container, because it is an SVG and not a card.
//   · A boxed numeral is a form field. Bare numeral ahead, bare vermilion tick
//     behind.
//   · The completion mark was a checkbox. It is a chop now: the lacquer plate
//     with 成 reversed out of it, pressed three degrees off square, once per
//     earned day.
//
// ── Round 3: the one thing that survived — vertical rhythm ────────────────
//
// The lab's own finding was that roughly the lower third of a Cards day is
// empty, and that none of the six material levers closes it. So this round holds
// the visual language completely still and varies ONLY how the sequence occupies
// the page:
//
//   V1  distributed   — the three steps spread across the usable height
//   V2  previews      — the quiet steps carry a little real content
//   V3  journey       — minimal content, but the sequence travels the page
//
// The rule that outranks all of it: nothing may be added because a gap exists.
// Every extra mark has to say Cards first → Story next → Practice after.

const CHINESE = languageTheme('chinese')

function tint(accentHex, pct, base = 'var(--surface)') {
  return 'color-mix(in srgb, ' + accentHex + ' ' + pct + '%, ' + base + ')'
}

// ── Marks ─────────────────────────────────────────────────────────────────

// A numeral while it is ahead of you, a brush tick in warm vermilion once it is
// behind you, and no container around either.
function StepMark({ step, accentHex }) {
  const done = step.status === STATUS.done
  const off = step.status === STATUS.unavailable
  return (
    <span style={{ width: '26px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      {done ? (
        <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1.6 6.2 4.6 9.4l6-7.4" stroke={inkWarm(accentHex)} strokeWidth="2.1"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span style={{
          ...TYPE.titleSection, fontVariantNumeric: 'tabular-nums',
          color: off ? 'var(--text-faint)' : 'var(--text-muted)',
        }}>
          {step.number}
        </span>
      )}
    </span>
  )
}

// The one mark that is not a tick: the chop a finished day gets.
//
// A rounded square with a tick inside it is a checkbox, and a checkbox is what
// every productivity app in the store looks like. This is a plate of lacquer
// instead, with 成 — "accomplished" — reversed out of it and pressed a couple of
// degrees off square, the way a real seal lands on paper.
function Chop({ accentHex, langFont, size = 68 }) {
  return (
    <span aria-hidden style={{
      width: size + 'px', height: size + 'px', flexShrink: 0,
      display: 'grid', placeItems: 'center', transform: 'rotate(-3deg)',
      borderRadius: RADIUS.sm + 'px',
      backgroundImage: 'linear-gradient(158deg, ' + tint(accentHex, 78, 'var(--surface)') + ' 0%, '
        + accentHex + ' 46%, ' + tint(accentHex, 74, 'var(--text)') + ' 100%)',
      boxShadow: ELEVATION.raised + ', inset 0 1px 0 var(--inset-highlight)',
    }}>
      <span style={{ ...TYPE.display, fontFamily: langFont, color: '#fff', lineHeight: 1 }}>成</span>
    </span>
  )
}

// ── The connector ─────────────────────────────────────────────────────────
//
// One line down the left of the quiet steps: vermilion where the day has already
// been, warm neutral for what is still ahead.
//
// It is drawn PER STEP rather than once down the container, for one reason that
// only showed up on screen: a single absolutely-positioned rail in a column that
// distributes its rows runs past the last mark and hangs into the empty space
// below it, which reads as a line that has broken rather than a journey that has
// arrived. A segment belonging to a step ends where that step's mark is.
//
// Absent on a finished day: round 2 rendered it and the full-length rail plus
// three ticks plus the chop read as a checklist.
function Rail({ weight, accentHex, done, last, markY }) {
  if (!weight) return null
  return (
    <span aria-hidden style={{
      position: 'absolute', left: (13 - weight / 2) + 'px', top: 0,
      bottom: last ? 'auto' : 0, height: last ? markY : undefined,
      width: weight + 'px', borderRadius: RADIUS.pill,
      background: done ? inkWarm(accentHex) : 'var(--divider)',
      // A travelled segment is a trace, not a progress bar. At full ink the
      // stretch above a finished step is the loudest mark on a screen whose one
      // loud thing is meant to be the step you are on.
      opacity: done ? 0.5 : 1,
    }} />
  )
}

// ── The active step — identical in all three variants ─────────────────────

const GLYPH = Object.fromEntries(NAV_GLYPHS.map(g => [g.key === 'study' ? 'cards' : g.key, g.Glyph]))

function ActiveStep({ step, ctx }) {
  const { accentHex, langFont } = ctx
  const isStory = step.key === 'story' && step.story
  // Cards gets the packet; the story's own artwork is already its object; and
  // Practice keeps the navigation glyph, which P14-5E does not reopen.
  const isCards = step.key === 'cards'
  const Glyph = isStory || isCards ? null : GLYPH[step.key]
  return (
    <div style={{ marginTop: '22px' }} data-vitality-active={step.key}>
      <span style={{ ...TYPE.eyebrow, color: inkWarm(accentHex) }}>
        {step.number} · {step.title}
      </span>

      {isStory && (
        <div data-story-cover="" style={{
          position: 'relative', marginTop: '13px', width: '100%', aspectRatio: '16 / 9',
          borderRadius: RADIUS.card + 'px', overflow: 'hidden', boxShadow: ELEVATION.raised,
          background: 'var(--surface-2)',
        }}>
          <img src={step.story.coverUrl} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: isStory ? '15px' : '9px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {step.metric ? (
            <>
              <div style={{ ...TYPE.display, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                {step.metric.value}
              </div>
              <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginTop: '2px' }}>
                {step.metric.label}
              </div>
            </>
          ) : (
            <div style={{
              ...TYPE.titleScreen, color: 'var(--text)',
              fontFamily: isStory ? langFont : undefined,
            }}>
              {step.detail}
            </div>
          )}
          {step.facts.length > 0 && (
            <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '7px' }}>
              {step.facts.join(' · ')}
            </div>
          )}
        </div>
        {/* The identity object the navigation family already taught, at a size
            where it is an object and not an icon. Never beside the story —
            there the artwork already is the object. */}
        {Glyph && (
          <span style={{ margin: '0 -4px -6px 0', flexShrink: 0 }}>
            <Glyph size={108} active />
          </span>
        )}
        {isCards && (
          <span style={{ margin: '0 2px -4px 0', flexShrink: 0 }}>
            <RedPacket concept={ctx.packet} size={116} />
          </span>
        )}
      </div>

      {step.cta && (
        <div style={{ marginTop: '20px' }}>
          <Button variant="lacquer" size="lg">{step.cta}</Button>
        </div>
      )}
    </div>
  )
}

// ── The quiet steps — the only thing that varies ──────────────────────────
//
// `preview` is V2's question: does a step that is still ahead earn a little more
// than its name? Everything it shows is already on this screen's own data — the
// artwork of the chapter cards will unlock, the drill the existing
// recommendation picked, and where the step sits in the sequence.
function QuietStep({ step, guide, ctx, v, last }) {
  const { preview } = v
  const done = step.status === STATUS.done
  const art = step.key === 'story' && step.story ? step.story : null
  const Glyph = GLYPH[step.key]
  const queued = upcomingLabel(guide.steps, step.key)
  const line = [step.detail, step.unlockHint || queued].filter(Boolean).join(' · ')
  const showArt = art && !done
  // A preview row is tall, and a numeral centred against a 16:9 still floats in
  // the middle of the artwork instead of marking where the step begins.
  const top = preview && showArt
  return (
    <div style={{
      display: 'flex', gap: '14px', padding: v.padY + 'px 0', position: 'relative',
      alignItems: top ? 'flex-start' : 'center',
      flex: v.distribute ? 1 : undefined,
    }}>
      <Rail
        weight={v.connector} accentHex={ctx.accentHex} done={done} last={last}
        markY={top ? (v.padY + 13) + 'px' : '50%'}
      />
      <StepMark step={step} accentHex={ctx.accentHex} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...TYPE.titleCard, display: 'block', color: done ? 'var(--text-muted)' : 'var(--text)' }}>
          {step.title}
        </span>
        {line && (
          <span style={{
            ...TYPE.caption, color: 'var(--text-faint)', display: 'block', marginTop: '2px',
            fontFamily: art ? ctx.langFont : undefined,
          }}>
            {line}
          </span>
        )}
        {/* The reward, at the ratio it was painted, small enough to stay quiet.
            No overlay, no badge, no % pill — the sentence above it already says
            what it is and why it is not open yet. */}
        {preview && showArt && (
          <span data-story-cover="" style={{
            display: 'block', marginTop: '9px', width: '62%', maxWidth: '208px',
            aspectRatio: '16 / 9', borderRadius: RADIUS.control + 'px', overflow: 'hidden',
            position: 'relative', background: 'var(--surface-2)', opacity: 0.93,
          }}>
            <img src={art.coverUrl} alt="" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            }} />
          </span>
        )}
      </span>
      {/* V2 gives a non-story step its own object too, at a bit over a third of
          the active one's size and in the family's quiet state — near enough to
          read as the same thing waiting its turn, far enough not to compete.
          The colour has to be passed: the glyphs draw in `currentColor`, so an
          inactive one inherits body text and lands on a warm page as a black
          blob. */}
      {preview && !art && Glyph && !done && (
        <span style={{ flexShrink: 0 }}><Glyph size={40} color="var(--text-faint)" /></span>
      )}
      {!preview && art && (
        <span data-story-cover="" style={{
          width: '96px', flexShrink: 0, aspectRatio: '16 / 9', display: 'block',
          borderRadius: RADIUS.control + 'px', overflow: 'hidden', opacity: done ? 0.5 : 1,
          position: 'relative', background: 'var(--surface-2)',
        }}>
          <img src={art.coverUrl} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          }} />
        </span>
      )}
    </div>
  )
}

function Complete({ guide, ctx }) {
  return (
    <div style={{ marginTop: '24px' }} data-vitality-active="complete">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.titleScreen, color: 'var(--text)' }}>{guide.summary.headline}</div>
          {guide.summary.parts.length > 0 && (
            <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '8px' }}>
              {guide.summary.parts.join(' · ')}
            </div>
          )}
          <div style={{ marginTop: '18px' }}>
            <Button variant="secondary" size="md">Practise anyway</Button>
          </div>
        </div>
        {guide.summary.earned && <Chop accentHex={ctx.accentHex} langFont={ctx.langFont} />}
      </div>
    </div>
  )
}

function LevelFoot({ ctx }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: '30px', paddingRight: '58px' }}>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)' }}>HSK 1 · 128 / 200 words</div>
      <div style={{
        marginTop: '7px', height: '3px', borderRadius: RADIUS.pill,
        background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden',
      }}>
        <div style={{ width: '64%', height: '100%', borderRadius: RADIUS.pill, background: inkWarm(ctx.accentHex) }} />
      </div>
    </div>
  )
}

function Variant({ guide, v, ctx }) {
  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown) || null
  const others = guide.steps.filter(s => s !== active)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)' }}>Today&rsquo;s training</span>
        {!guide.complete && (
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>{guideContextLine(guide)}</span>
        )}
      </div>

      {guide.complete
        ? <Complete guide={guide} ctx={ctx} />
        : <ActiveStep step={active} ctx={ctx} />}

      <div style={{
        position: 'relative', marginTop: v.gap + 'px', borderTop: '1px solid var(--divider)',
        // V1's whole idea: the quiet steps take the height that is going spare
        // instead of stacking under the button and leaving the page to end early.
        flex: v.distribute ? 1 : undefined,
        minHeight: v.distribute ? 0 : undefined,
        display: v.distribute ? 'flex' : undefined,
        flexDirection: v.distribute ? 'column' : undefined,
      }}>
        {others.map((s, i) => (
          <QuietStep
            key={s.key} step={s} guide={guide} ctx={ctx}
            v={guide.complete ? { ...v, connector: 0 } : v}
            last={i === others.length - 1}
          />
        ))}
      </div>

      <LevelFoot ctx={ctx} />
    </div>
  )
}

// ── The composition, settled ──────────────────────────────────────────────
// V2 — meaningful previews, approved. Held completely still by P14-5E; the only
// thing that varies below is which packet stands on the Cards step.
const V2 = {
  gap: 26, padY: 10, connector: 1, distribute: true, preview: true,
}

const FOLD = 780

function Frame({ width, concept, stateKey, children }) {
  return (
    <div
      data-vitality-frame={concept} data-vitality-state={stateKey} data-frame-width={String(width)}
      style={{
        position: 'relative', width: width + 'px', flexShrink: 0, minHeight: FOLD + 'px',
        borderRadius: RADIUS.card + 'px', overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--bg)',
      }}
    >
      <img src={bgChinese} alt="" aria-hidden="true" className="hd-bg" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 'var(--bg-image-opacity)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative', padding: '22px 16px 40px', minHeight: (FOLD - 66) + 'px',
        display: 'flex', flexDirection: 'column',
      }}>
        {children}
      </div>
      <div aria-hidden style={{
        position: 'absolute', left: '12px', right: '12px', top: (FOLD - 66) + 'px', height: '60px',
        borderRadius: RADIUS.card + 'px', background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: ELEVATION.floating, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        ...TYPE.eyebrow, color: 'var(--text-faint)',
      }}>
        <span>Home</span><span>Stories</span><span>Cards</span><span>Practice</span><span>More</span>
      </div>
    </div>
  )
}

// ── The packet on its own, and the packet opening ─────────────────────────

// Each concept at the size Home actually draws it, plus a 2x study, so a detail
// that only survives at 2x can be identified as a detail that will not ship.
function PacketPlate({ concept, ctx }) {
  return (
    <div data-packet-plate={concept} style={{
      display: 'flex', alignItems: 'flex-end', gap: '26px', padding: '18px 20px',
      borderRadius: RADIUS.card + 'px', background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      <RedPacket concept={concept} size={116} />
      <RedPacket concept={concept} size={232} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>{concept}</div>
        <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '4px' }}>
          {PACKET_NOTES[concept]}
        </div>
        <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '8px' }}>
          Home draws it at 116px tall — the left one. {ctx.accentHex}
        </div>
      </div>
    </div>
  )
}

// The storyboard: one still per phase boundary, so the gesture can be reviewed
// as drawing rather than as prose. The numbers come from redPacketOpen.js, which
// is the same module a production implementation would drive the frames from.
function Storyboard({ concept }) {
  const stops = storyboardFrames()
  return (
    <div data-storyboard={concept} style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
      {stops.map(ms => {
        const frame = packetFrame(ms)
        const beat = OPEN_PHASES.filter(p => ms >= p.start && ms <= p.end).map(p => p.label).join(' + ')
        return (
          <div key={ms} data-storyboard-frame={String(ms)} style={{
            width: '132px', padding: '14px 10px 10px', textAlign: 'center',
            borderRadius: RADIUS.control + 'px', background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ height: '148px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <RedPacket concept={concept} size={116} phase={ms} />
            </div>
            <div style={{ ...TYPE.eyebrow, color: 'var(--text)', marginTop: '10px' }}>{ms}ms</div>
            <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '2px', minHeight: '30px' }}>
              {beat || 'Session'}
            </div>
            <div style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>
              {Math.round(frame.flapAngle)}°
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HomeVitalityLab() {
  const base = { accentHex: CHINESE.accentHex, langFont: CHINESE.font }
  return (
    <div style={{ display: 'grid', gap: '30px', width: '100%' }}>
      <div style={{ ...TYPE.bodySecondary, color: 'var(--text-muted)' }}>
        V2 — meaningful previews, exactly as approved. The only thing that varies
        is the object standing on the Cards step: three red-packet concepts, drawn
        to the icon family&rsquo;s rules at hero scale.
      </div>

      <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
        {PACKET_CONCEPTS.map(concept => <PacketPlate key={concept} concept={concept} ctx={base} />)}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginBottom: '4px' }}>
          Opening — 640ms, four overlapping beats
        </div>
        <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginBottom: '12px' }}>
          Tap → lift → flap → fan → Study. Reduced motion is a 120ms cross-fade with
          no rotation and no travel.
        </div>
        <Storyboard concept="B" />
      </div>

      {VITALITY_STATES.map(state => {
        const guide = buildGuide(state.input)
        return (
          // `minWidth: 0` on both the grid item and the scroller: a grid/flex
          // child defaults to `min-width: auto`, so nine 430px frames would
          // widen /dev itself rather than scroll inside it — and /dev is
          // measured at 390 by p14-controls.spec.js.
          <div key={state.key} style={{ minWidth: 0 }}>
            <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginBottom: '12px' }}>{state.label}</div>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px', minWidth: 0 }}>
              {PACKET_CONCEPTS.map(concept => (
                VITALITY_WIDTHS.map(width => (
                  <div key={concept + width}>
                    <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '8px' }}>
                      Packet {concept} · {width}
                    </div>
                    <Frame width={width} concept={concept} stateKey={state.key}>
                      <Variant guide={guide} v={V2} ctx={{ ...base, packet: concept }} />
                    </Frame>
                  </div>
                ))
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
