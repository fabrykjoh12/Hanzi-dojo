import { useId } from 'react'
import { TYPE } from './typeScale'
import { RADIUS, ELEVATION } from './shape'
import { languageTheme, pinyinInk, inkWarm } from './languageTheme'
import { heroGround, heroShadow, ON_HERO } from './designTokens'
import { Button } from './controls'
import { buildGuide, guideContextLine, upcomingLabel, STATUS } from './homeGuide'
import { Frame, Variant } from './HomeVitality'
import { VITALITY_STATES, HOME_RHYTHM } from './homeVitalityFixtures'
import { STYLE_FONTS, STYLE_SHAPES, SPECIMEN_ROLES } from './visualStyleAxes'
import { NAV_GLYPHS } from './navGlyphFamily'

const PRACTICE_GLYPH = (NAV_GLYPHS.find(g => g.key === 'practice') || {}).Glyph || null

// ── Visual Style V2, round 2 — life and cleanliness at once ─────────────────
//
// DEV-ONLY. Mounted on /dev, deleted when the direction ships or dies.
//
// The restrained candidate (557467e) was judged cleaner than production and too
// far toward restraint. The new target is two reference mockups' PRINCIPLES —
// roughly 70% of one, 30% of the other, and none of their literal content:
//
//   from #2 — Cards as a strong focal point, tactile material, a dimensional
//   flashcard object, richer red, an integrated CTA;
//   from #3 — editorial hierarchy, few containers, whitespace, the story
//   artwork carrying Step 2, quiet HSK progress.
//
// The synthesis this lab draws: **the Cards step becomes the screen's ONE lit
// panel** — which is not a new idea, it is the app's own design language
// (CLAUDE.md §5: one HeroPanel per screen) coming back to Home with everything
// P14-5's hero lab learned. Ground and shadow come from designTokens'
// facet material; the flashcard stack is heroObjects' paper-plane ramp with the
// one fix its own post-mortem asked for — real vocabulary on the front card, so
// it cannot read as a stack of notes; and the CTA is paper ON the red, with the
// arrow in a chip, so the action belongs to the panel instead of floating below
// it. Everything else on the page stays #3-quiet.

const CHINESE = languageTheme('chinese')
const FONT = Object.fromEntries(STYLE_FONTS.map(f => [f.key, f]))
const SHAPE = Object.fromEntries(STYLE_SHAPES.map(s => [s.key, s]))
const TIGHT = SHAPE.tight

// The candidate face is BUNDLED now (fonts.js). The lab only needs its own
// press rule; the @font-face it used to inject is gone with public/dev-fonts.
function FontFaces() {
  return (
    <style>{`
      /* The hero CTA's press: 1px of travel and the depth coming OUT of the
         shadow. Production's equivalent is the .hd-cta rule in index.css.
         (No backticks in here — this is inside a template literal.) */
      .vs-cta { box-shadow: var(--vs-cta-rest); }
      .vs-cta:active { box-shadow: var(--vs-cta-pressed); transform: translateY(1px); }
    `}</style>
  )
}

// ── The flashcard stack ───────────────────────────────────────────────────
//
// Refinement pass (round 3). The round-2 stack was three translucent planes —
// heroObjects' ramp applied literally — and the review asked for real paper.
// The fix is a hierarchy of MATERIAL, not more detail:
//
//   · The FRONT card is solid, warm off-white paper, and its word is printed in
//     the brand's own dark-red ink — which is what an actual flashcard looks
//     like, and instantly separates it from the ghost planes behind it.
//   · The two behind stay translucent paper-on-red (the hero ramp), each with a
//     hairline edge so they read as sheets rather than as glow.
//   · The front card CASTS onto the stack: one soft dark pass under it, which
//     is the card-to-card shadow the review named.
//   · Unequal tilts (4 / -3 / -8) and unequal sizes, as before. No new marks.
function FlashcardStack({ size = 122, langFont }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const blurId = 'vs-b-' + raw
  const ghosts = [
    { x: 47, y: 10, w: 50, h: 64, r: 6, face: ON_HERO.plane3, lit: null, tilt: 4 },
    { x: 33, y: 22, w: 54, h: 70, r: 6.5, face: ON_HERO.plane2, lit: ON_HERO.plane1, tilt: -3 },
  ]
  const front = { x: 14, y: 36, w: 60, h: 76, r: 7, tilt: -8 }
  const paper = 'color-mix(in srgb, #fff 94%, var(--gold))'
  const paperEdge = 'color-mix(in srgb, #fff 68%, var(--primary-pressed))'
  const ink = 'var(--primary-pressed)'
  const inkSoft = 'color-mix(in srgb, var(--primary-pressed) 60%, #fff)'
  return (
    <svg
      width={size} height={size} viewBox="0 0 128 128" fill="none"
      aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      {ghosts.map(c => (
        <g key={c.x} transform={'rotate(' + c.tilt + ' ' + (c.x + c.w / 2) + ' ' + (c.y + c.h / 2) + ')'}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} fill={c.face} />
          {/* A sheet has an edge; glow does not. */}
          <rect
            x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r}
            fill="none" stroke={ON_HERO.planeShade} strokeWidth="0.8"
          />
          {c.lit && <rect x={c.x} y={c.y} width={c.w} height="2.6" rx="1.3" fill={c.lit} />}
        </g>
      ))}
      {/* What the front card casts on the sheets behind it. */}
      <g transform={'rotate(' + front.tilt + ' ' + (front.x + front.w / 2) + ' ' + (front.y + front.h / 2) + ')'}>
        <rect
          x={front.x + 4} y={front.y + 5} width={front.w} height={front.h} rx={front.r}
          fill={ON_HERO.planeShade} filter={'url(#' + blurId + ')'}
        />
        {/* The front card: solid paper, a lit top edge, a hairline. */}
        <rect x={front.x} y={front.y} width={front.w} height={front.h} rx={front.r} fill={paper} />
        <rect
          x={front.x} y={front.y} width={front.w} height={front.h} rx={front.r}
          fill="none" stroke={paperEdge} strokeWidth="0.7"
        />
        <rect x={front.x + 1} y={front.y + 1} width={front.w - 2} height="2.4" rx="1.2" fill="#fff" />
        {/* The word in the brand's ink, its sound beneath — a flashcard, not a note. */}
        <text
          x={front.x + front.w / 2} y={front.y + 37} textAnchor="middle" fontFamily={langFont}
          fontSize="20" fontWeight="600" fill={ink}
        >
          你好
        </text>
        <text
          x={front.x + front.w / 2} y={front.y + 53} textAnchor="middle"
          fontSize="9" fontWeight="500" fill={inkSoft}
        >
          nǐ hǎo
        </text>
      </g>
    </svg>
  )
}

// ── The integrated primary action, on the hero ────────────────────────────
//
// Paper on the red, with the direction built INTO the control: the right end of
// the button is a brand-red zone, inset like a keycap and sharing the button's
// own radius — round 2's floating circular chip read as a second button pasted
// inside the first. 50px, radius 10, a restrained top highlight, a shallow
// shadow onto the panel, and a press that travels 1px while the depth comes out
// of the shadow (the .vs-cta rules in this lab's stylesheet — :active cannot be
// an inline style).
function HeroAction({ copy, height = 50, arrow = 46, top = 18 }) {
  const rest = '0 1px 2px ' + ON_HERO.planeShade + ', 0 5px 14px -8px ' + ON_HERO.planeShade
    + ', inset 0 -1px 0 ' + ON_HERO.planeShade + ', inset 0 1px 0 #fff'
  const pressed = '0 1px 2px ' + ON_HERO.planeShade
    + ', inset 0 -1px 0 ' + ON_HERO.planeShade + ', inset 0 1px 0 #fff'
  return (
    <button
      type="button" className="vs-cta"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        width: '100%', height: height + 'px', padding: '4px 4px 4px 18px', marginTop: top + 'px',
        border: 'none', borderRadius: TIGHT.control + 'px', cursor: 'pointer',
        background: 'color-mix(in srgb, #fff 93%, var(--gold))',
        '--vs-cta-rest': rest,
        '--vs-cta-pressed': pressed,
        color: 'var(--primary-pressed)',
        ...TYPE.label, fontSize: '16px',
        transition: 'transform 150ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms ease',
      }}
    >
      {copy}
      <span aria-hidden="true" style={{
        alignSelf: 'stretch', width: arrow + 'px', flexShrink: 0,
        borderRadius: (TIGHT.control - 4) + 'px',
        display: 'grid', placeItems: 'center',
        background: 'var(--primary-fill)', color: '#fff', fontSize: '17px',
        boxShadow: 'inset 0 1px 0 ' + ON_HERO.litEdge,
      }}>
        →
      </span>
    </button>
  )
}

// ── The Cards hero ────────────────────────────────────────────────────────
//
// The one lit panel, on the app's own facet material. The count and its
// breakdown in white, the stack as the object, the action on the panel. The
// step eyebrow stays OUTSIDE on the page — the sequence belongs to the page,
// the task belongs to the panel.
function HeroCards({ step, ctx, tight }) {
  const grainId = useId().replace(/[^a-zA-Z0-9]/g, '')
  ctx = { ...ctx, grainId }
  return (
    <div
      data-hero-cards=""
      style={{
        position: 'relative', marginTop: tight ? '10px' : '14px',
        padding: tight ? '16px 16px 14px' : '20px 18px 18px',
        borderRadius: RADIUS.card + 'px', overflow: 'hidden',
        background: heroGround(ctx.accentHex, 'facet'),
        boxShadow: heroShadow(ctx.accentHex, false, 'facet'),
        color: '#fff',
      }}
    >
      {/* The facet: the pool of light the panel faces, anchored outside the
          top-left corner — P14-5's finding, not a gradient fill. Two radii of
          the same token: a wide wash and a tighter core, which strengthens the
          corner without inventing a brighter value. */}
      <span aria-hidden style={{
        position: 'absolute', left: '-30%', top: '-55%', width: '90%', height: '120%',
        pointerEvents: 'none',
        background: 'radial-gradient(closest-side, ' + ON_HERO.facet + ' 0%, transparent 100%),'
          + 'radial-gradient(46% 52% at 14% 4%, ' + ON_HERO.facet + ' 0%, transparent 78%)',
      }} />
      {/* The plane turning away: the lower-right corner steps into shade, the
          same one token the objects use. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(85% 75% at 100% 105%, ' + ON_HERO.planeShade + ' 0%, transparent 62%)',
      }} />
      {/* Material information, barely: fractal grain at 4%. At this opacity it
          is felt as paper rather than seen as noise. */}
      <svg aria-hidden="true" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.04, pointerEvents: 'none',
      }}>
        <filter id={'vs-g-' + ctx.grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={'url(#vs-g-' + ctx.grainId + ')'} />
      </svg>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Proportional figures, deliberately: tabular set Mona's "1" airy, and
              a hero count is a piece of display type, not a column that needs to
              align. Tabular stays where columns genuinely do (step numerals). */}
          <div style={{ ...TYPE.display, lineHeight: 1 }}>
            {step.metric.value}
          </div>
          <div style={{ ...TYPE.titleSection, marginTop: '4px' }}>{step.metric.label}</div>
          {step.facts.length > 0 && (
            <div style={{ ...TYPE.caption, color: ON_HERO.body, marginTop: '8px' }}>
              {step.facts.join(' · ')}
            </div>
          )}
        </div>
        <FlashcardStack size={tight ? 98 : 118} langFont={ctx.langFont} />
      </div>
      {tight
        ? <HeroAction copy={step.cta} height={46} arrow={42} top={12} />
        : <HeroAction copy={step.cta} />}
    </div>
  )
}

// ── P14-5G — the Build 45 recomposition ───────────────────────────────────
//
// Physical-device QA failed Build 45's Home: the step rail runs through the 2
// and 3 numerals, the hero eats half the screen, the Feedback FAB crowds the
// HSK line, and the 0.4-opacity wash competes with Story and Practice. This
// candidate is a CLEANUP of the approved composition, not a new concept:
//
//   · No connector anywhere — the sequence is 1 / 2 / 3 plus hierarchy.
//   · The hero keeps everything and loses ~17% of its height (tight geometry).
//   · Story is number + title + status + FULL-WIDTH artwork; the painting is
//     the richness, nothing else is added.
//   · Practice is one compact row, its nav glyph quiet at the far right.
//   · The foot spans the page — the FAB's 58px notch is gone because the
//     recommendation is to move Feedback off Home entirely (More/Profile).
//   · The frame draws the wash at roughly a third strength, masked toward the
//     page's top and bottom edges (Frame's `wash="reduced"`).
function RecompNumeral({ n, off }) {
  return (
    <span style={{ width: '20px', flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
      <span style={{
        ...TYPE.titleSection, fontVariantNumeric: 'tabular-nums',
        color: off ? 'var(--text-faint)' : 'var(--text-muted)',
      }}>
        {n}
      </span>
    </span>
  )
}

function RecompStory({ step, ctx }) {
  const detail = [step.detail, step.unlockHint].filter(Boolean).join(' · ')
  return (
    <div style={{ marginTop: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <RecompNumeral n={step.number} off={step.status === STATUS.unavailable} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>{step.title}</div>
          {detail && (
            <div style={{
              ...TYPE.caption, color: 'var(--text-faint)', marginTop: '2px',
              fontFamily: ctx.langFont,
            }}>
              {detail}
            </div>
          )}
        </div>
      </div>
      {step.story && (
        <div data-story-cover="" style={{
          position: 'relative', marginTop: '11px', width: '100%', aspectRatio: '16 / 9',
          borderRadius: TIGHT.card + 'px', overflow: 'hidden',
          boxShadow: ELEVATION.raised, background: 'var(--surface-2)',
        }}>
          <img src={step.story.coverUrl} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          }} />
        </div>
      )}
    </div>
  )
}

function RecompPractice({ step, guide }) {
  const Glyph = PRACTICE_GLYPH
  const detail = [step.detail, step.unlockHint || upcomingLabel(guide.steps, step.key)]
    .filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '24px', minHeight: '44px' }}>
      <RecompNumeral n={step.number} off={step.status === STATUS.unavailable} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>{step.title}</div>
        {detail && (
          <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '2px' }}>{detail}</div>
        )}
      </div>
      {Glyph && <span style={{ flexShrink: 0 }}><Glyph size={40} color="var(--text-faint)" /></span>}
    </div>
  )
}

// The foot, full width: no 58px notch, because Feedback leaves Home. The
// paddingBottom is the breathing room the QA asked for between the rail and
// the floating tray.
function RecompFoot() {
  return (
    <div style={{ marginTop: 'auto', paddingTop: '28px', paddingBottom: '6px' }}>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)' }}>HSK 1 · 128 / 200 words</div>
      <div style={{
        marginTop: '7px', height: '3px', borderRadius: RADIUS.pill,
        background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden',
      }}>
        <div style={{ width: '64%', height: '100%', borderRadius: RADIUS.pill, background: inkWarm(CHINESE.accentHex) }} />
      </div>
    </div>
  )
}

function RecompVariant({ guide, ctx }) {
  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown) || null
  const others = guide.steps.filter(s => s !== active)
  const story = others.find(s => s.key === 'story')
  const practice = others.find(s => s.key === 'practice')
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)' }}>Today&rsquo;s training</span>
        {!guide.complete && (
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>{guideContextLine(guide)}</span>
        )}
      </div>

      {/* The recomposition is drawn for the state QA judged — a Cards day.
          The guard keeps a different fixture from crashing the lab, not from
          rendering well; the other states are not this candidate's question. */}
      {active && active.key === 'cards' && active.metric && (
        <div style={{ marginTop: '22px' }} data-vitality-active={active.key}>
          <span style={{ ...TYPE.eyebrow, color: inkWarm(ctx.accentHex) }}>
            {active.number} · {active.title}
          </span>
          <HeroCards step={active} ctx={ctx} tight />
        </div>
      )}

      {story && <RecompStory step={story} ctx={ctx} />}
      {practice && <RecompPractice step={practice} guide={guide} />}

      <RecompFoot />
    </div>
  )
}

function RecompFrame({ width, stateKey = 'cards' }) {
  const state = VITALITY_STATES.find(s => s.key === stateKey)
  const guide = buildGuide(state.input)
  const ctx = { accentHex: CHINESE.accentHex, langFont: CHINESE.font }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '6px' }}>
        recomp · {stateKey} · {width}
      </div>
      <div
        data-style-frame={'recomp-' + stateKey} data-frame-width={String(width)}
        style={{ fontFamily: FONT.mona.stack, width: width + 'px' }}
      >
        <Frame width={width} concept="recomp" stateKey={stateKey} wash="reduced">
          <RecompVariant guide={guide} ctx={ctx} />
        </Frame>
      </div>
    </div>
  )
}

// The page-level action for Story and Practice: the lacquer material with the
// arrow in the label. Quieter than the hero's by construction — it sits on
// paper, not on the brand.
function PageAction({ copy }) {
  return (
    <Button variant="lacquer" size="lg" style={{ borderRadius: TIGHT.control + 'px' }}>
      {copy + ' →'}
    </Button>
  )
}

// ── The three compositions under comparison ───────────────────────────────

const NEW_CTX = {
  accentHex: CHINESE.accentHex,
  langFont: CHINESE.font,
  shape: { control: TIGHT.control, card: TIGHT.card },
  previewWide: true,
  renderCards: (step) => <HeroCards step={step} ctx={{ accentHex: CHINESE.accentHex, langFont: CHINESE.font }} />,
  renderAction: (step) => <PageAction copy={step.cta} />,
}

// 557467e — the restrained candidate, kept in the lab as what "too far toward
// restraint" looked like.
const PREV_CTX = {
  accentHex: CHINESE.accentHex,
  langFont: CHINESE.font,
  shape: { control: TIGHT.control, card: TIGHT.card },
  renderAction: (step) => <PageAction copy={step.cta} />,
}

// Build 44 — the shipped Home: P14-5C rhythm, Inter, current shapes, flat
// primary. Rendered by the same components so the diff is language, not code.
const BASELINE_RHYTHM = { gap: 26, padY: 17, connector: 0, distribute: false, preview: false }
const BASELINE_CTX = {
  accentHex: CHINESE.accentHex,
  langFont: CHINESE.font,
  renderAction: (step) => <Button variant="primary" size="lg">{step.cta}</Button>,
}

function StyleFrame({ id, width, stateKey, font, rhythm, ctx }) {
  const state = VITALITY_STATES.find(s => s.key === stateKey)
  const guide = buildGuide(state.input)
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '6px' }}>
        {id} · {stateKey} · {width}
      </div>
      <div data-style-frame={id + '-' + stateKey} data-frame-width={String(width)} style={{ fontFamily: font.stack, width: width + 'px' }}>
        <Frame width={width} concept={id} stateKey={stateKey}>
          <Variant guide={guide} v={rhythm} ctx={ctx} />
        </Frame>
      </div>
    </div>
  )
}

function LabRow({ title, blurb, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginBottom: '4px' }}>{title}</div>
      {blurb && <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginBottom: '12px' }}>{blurb}</div>}
      {/* Wrapping, not a horizontal scroller: an element inside an overflow-x
          container can be screenshotted mid-scroll, which pastes the neighbour
          into its frame. The style spec shoots at 1700px, where every row fits
          on one line and nothing ever scrolls.
          `overflowX: 'auto'` is the floor under that, and it is not decoration:
          a frame is a FIXED 320/390/430 device width, so on a phone-width /dev
          a 430 frame cannot wrap small enough to fit and would widen the
          document itself — which is what `/dev`'s overflow contracts (the P14-1
          controls gallery, the P14-3 glyph gallery) measure. Scrolling inside
          this row keeps the lab honest without the page ever scrolling
          sideways. `overflowY: 'hidden'` only stops the paired-axis `auto` the
          spec would otherwise compute; the row's height is auto, so it clips
          nothing. */}
      <div style={{
        display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// The primary-action language on its own, at device size: the hero action with
// its chip, the two copy candidates, and the page-level lacquer beside them.
function ActionPlate() {
  return (
    <div data-style-plate="actions" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0,
      fontFamily: FONT.mona.stack,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>The primary action, at device size</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '14px' }}>
        On the hero: paper with the arrow chip. On the page: lacquer with the arrow in
        the label. Copy picked: <strong>Start cards</strong> — a verb that answers
        &ldquo;136 cards ready&rdquo;; &ldquo;Study cards&rdquo; names a place, and the
        Cards tab already is one.
      </div>
      <div style={{
        display: 'grid', gap: '12px', maxWidth: '354px', padding: '16px',
        borderRadius: RADIUS.card + 'px', background: heroGround(CHINESE.accentHex, 'facet'),
      }}>
        <HeroAction copy="Start cards" />
        <HeroAction copy="Study cards" />
      </div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
        <PageAction copy="Continue story" />
        <Button variant="primary" size="lg">Start cards</Button>
      </div>
      <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '10px' }}>
        Below: the page-level lacquer, and Build 44&rsquo;s flat primary for comparison.
      </div>
    </div>
  )
}

// The flashcard object at the size Home draws it and at 2x, on its own ground —
// an object designed for the red cannot be judged on white.
function StackPlate() {
  return (
    <div data-style-plate="stack" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>The flashcard object</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '13px' }}>
        1x (as Home draws it) and 2x. Solid paper front card with the word in the
        brand&rsquo;s ink; translucent sheets behind; one cast shadow between them.
      </div>
      <div style={{
        display: 'flex', gap: '26px', alignItems: 'flex-end', flexWrap: 'wrap',
        padding: '18px', borderRadius: RADIUS.card + 'px',
        background: heroGround(CHINESE.accentHex, 'facet'),
      }}>
        <FlashcardStack size={118} langFont={CHINESE.font} />
        <FlashcardStack size={236} langFont={CHINESE.font} />
      </div>
    </div>
  )
}

// The six roles the typography decision hangs on, in the candidate face, at 1x.
function TypePlate() {
  return (
    <div data-style-plate="type-final" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      fontFamily: FONT.mona.stack, minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>Mona Sans, the six judged roles</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '13px' }}>
        Known caveat for the device pass: with tabular figures Mona&rsquo;s &ldquo;1&rdquo; sets
        airy — both figure treatments of the count are below, tabular then proportional.
      </div>
      {SPECIMEN_ROLES.map(({ role, sample }) => (
        <div key={role} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
            {role}
          </span>
          <span style={{ ...TYPE[role], color: 'var(--text)', minWidth: 0 }}>{sample}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
          figures
        </span>
        <span style={{ ...TYPE.display, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>136</span>
        <span style={{ ...TYPE.display, color: 'var(--text)' }}>136</span>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>tabular · proportional</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
          hanzi
        </span>
        <span style={{ ...TYPE.titleScreen, fontFamily: CHINESE.font, color: 'var(--text)' }}>李明唱歌</span>
        <span style={{ ...TYPE.bodySecondary, color: pinyinInk(CHINESE.accentHex) }}>lǐ míng chàng gē</span>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>unchanged — languageTheme&rsquo;s stack</span>
      </div>
    </div>
  )
}

export default function VisualStyleLab() {
  return (
    <div style={{ display: 'grid', gap: '34px', width: '100%' }}>
      <FontFaces />
      <div style={{ ...TYPE.bodySecondary, color: 'var(--text-muted)' }}>
        Round 2: the life of reference #2, the cleanliness of #3. Cards becomes the
        screen&rsquo;s one lit panel — the app&rsquo;s own hero material, the flashcard
        stack with real vocabulary on it, the action on the panel — and every other
        step stays editorial and quiet.
      </div>

      <LabRow
        title="P14-5G — the Build 45 recomposition"
        blurb="No connector, hero −17%, full-width story artwork, Practice one row, foot full width (Feedback moves off Home), wash reduced and pushed to the edges. Judge this against the Build 45 device screenshot."
      >
        <RecompFrame width={390} />
        <RecompFrame width={320} />
        <RecompFrame width={430} />
      </LabRow>

      <LabRow
        title="The target — 390, both key states"
        blurb="Cards as the hero; the story artwork carrying Step 2. Judge these two first."
      >
        <StyleFrame id="new" width={390} stateKey="cards" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={390} stateKey="story" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
      </LabRow>

      <LabRow
        title="What it must beat"
        blurb="Build 44 (shipped) · 557467e (too restrained) · the same new candidate in Inter, because Mona is not final by default."
      >
        <StyleFrame id="build44" width={390} stateKey="cards" font={FONT.inter} rhythm={BASELINE_RHYTHM} ctx={BASELINE_CTX} />
        <StyleFrame id="prev" width={390} stateKey="cards" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={PREV_CTX} />
        <StyleFrame id="newInter" width={390} stateKey="cards" font={FONT.inter} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
      </LabRow>

      <LabRow
        title="The candidate, everywhere else"
        blurb="Widths and the remaining states — rendered because the 390 pair passed."
      >
        <StyleFrame id="new" width={320} stateKey="cards" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={320} stateKey="story" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={430} stateKey="cards" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={430} stateKey="story" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={390} stateKey="practice" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
        <StyleFrame id="new" width={390} stateKey="complete" font={FONT.mona} rhythm={HOME_RHYTHM} ctx={NEW_CTX} />
      </LabRow>

      <ActionPlate />
      <StackPlate />
      <TypePlate />
    </div>
  )
}
