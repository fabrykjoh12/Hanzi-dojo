import { TYPE } from './typeScale'
import { RADIUS } from './shape'
import { languageTheme, pinyinInk } from './languageTheme'
import { heroGround, heroShadow, ON_HERO } from './designTokens'
import { Button } from './controls'
import { buildGuide } from './homeGuide'
import { Frame, Variant } from './HomeVitality'
import { VITALITY_STATES, HOME_RHYTHM } from './homeVitalityFixtures'
import { STYLE_FONTS, STYLE_SHAPES, SPECIMEN_ROLES } from './visualStyleAxes'

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

// Mona Sans, loaded only when this lab renders. OFL, committed with its license
// under public/dev-fonts/. Inter renders the benchmark frame — the brief is
// explicit that Mona is not final just because it won the last lab.
function FontFaces() {
  return (
    <style>{`
      @font-face {
        font-family: 'Mona Sans Lab';
        src: url('/dev-fonts/mona-sans-var.woff2') format('woff2-variations');
        font-weight: 200 900; font-style: normal; font-display: block;
      }
    `}</style>
  )
}

// ── The flashcard stack ───────────────────────────────────────────────────
//
// heroObjects' DeckObject, with the fix its own retirement note asked for. That
// deck read as "a stack of notes" or the compose glyph three times in P14 — an
// abstract paper rectangle IS a note. What a note does not have is vocabulary:
// the front card carries 你好 and its pinyin, which is the one mark that makes
// a flashcard unmistakable. The paper-plane ramp, the L of light and the shaded
// return are the family's rules, unchanged; the packet lab's lesson adds the
// slight, unequal rotations — three cards at 0° are a printer tray.
function FlashcardStack({ size = 122, langFont }) {
  const cards = [
    { x: 46, y: 10, w: 50, h: 64, r: 7, face: ON_HERO.plane3, lit: null, shade: 5, tilt: 4 },
    { x: 32, y: 22, w: 54, h: 70, r: 7.5, face: ON_HERO.plane2, lit: ON_HERO.plane1, shade: 6, tilt: -3 },
    { x: 14, y: 36, w: 60, h: 76, r: 8, face: ON_HERO.plane1, lit: ON_HERO.planeLit, shade: 7, tilt: -8 },
  ]
  return (
    <svg
      width={size} height={size} viewBox="0 0 128 128" fill="none"
      aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}
    >
      {cards.map(c => (
        <g key={c.x} transform={'rotate(' + c.tilt + ' ' + (c.x + c.w / 2) + ' ' + (c.y + c.h / 2) + ')'}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} fill={c.face} />
          <rect
            x={c.x + c.w - c.shade} y={c.y} width={c.shade} height={c.h}
            rx={c.shade / 2} fill={ON_HERO.planeShade}
          />
          {c.lit && (
            <>
              <rect x={c.x} y={c.y} width={c.w} height="3" rx="1.5" fill={c.lit} />
              <rect x={c.x} y={c.y} width="2.8" height={c.h} rx="1.4" fill={c.lit} />
            </>
          )}
        </g>
      ))}
      {/* The front card's face: the word, then its sound. White at two strengths
          — ink on paper-on-red, not a second colour. */}
      <g transform="rotate(-8 44 74)">
        <text
          x="42" y="72" textAnchor="middle" fontFamily={langFont}
          fontSize="21" fontWeight="600" fill="#fff"
        >
          你好
        </text>
        <text
          x="42" y="88" textAnchor="middle"
          fontSize="9.5" fontWeight="500" fill={ON_HERO.body}
        >
          nǐ hǎo
        </text>
      </g>
    </svg>
  )
}

// ── The integrated primary action, on the hero ────────────────────────────
//
// Paper on the red — a vermilion button on a vermilion panel is a rumour — with
// the directional control IN the button: a small brand-red chip carrying the
// arrow. 50px tall, the tighter radius, a shallow shadow onto the panel, and a
// darker lower edge so the paper has thickness. Presses via the app's own
// .hd-press (1px travel).
function HeroAction({ copy }) {
  return (
    <button
      type="button" className="hd-press"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        width: '100%', height: '50px', padding: '0 7px 0 18px', marginTop: '18px',
        border: 'none', borderRadius: TIGHT.control + 'px', cursor: 'pointer',
        background: 'color-mix(in srgb, #fff 93%, var(--gold))',
        boxShadow: '0 1px 2px ' + ON_HERO.planeShade + ', 0 5px 14px -8px ' + ON_HERO.planeShade
          + ', inset 0 -1px 0 ' + ON_HERO.planeShade + ', inset 0 1px 0 #fff',
        color: 'var(--primary-pressed)',
        ...TYPE.label, fontSize: '16px',
      }}
    >
      {copy}
      <span aria-hidden="true" style={{
        width: '36px', height: '36px', borderRadius: RADIUS.pill, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--primary-fill)', color: '#fff', fontSize: '17px',
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
function HeroCards({ step, ctx }) {
  return (
    <div
      data-hero-cards=""
      style={{
        position: 'relative', marginTop: '14px', padding: '20px 18px 18px',
        borderRadius: RADIUS.card + 'px', overflow: 'hidden',
        background: heroGround(ctx.accentHex, 'facet'),
        boxShadow: heroShadow(ctx.accentHex, false, 'facet'),
        color: '#fff',
      }}
    >
      {/* The facet: the pool of light the panel faces, anchored outside the
          top-left corner — P14-5's finding, not a gradient fill. */}
      <span aria-hidden style={{
        position: 'absolute', left: '-30%', top: '-55%', width: '90%', height: '120%',
        pointerEvents: 'none',
        background: 'radial-gradient(closest-side, ' + ON_HERO.facet + ' 0%, transparent 100%)',
      }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.display, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {step.metric.value}
          </div>
          <div style={{ ...TYPE.titleSection, marginTop: '4px' }}>{step.metric.label}</div>
          {step.facts.length > 0 && (
            <div style={{ ...TYPE.caption, color: ON_HERO.body, marginTop: '8px' }}>
              {step.facts.join(' · ')}
            </div>
          )}
        </div>
        <FlashcardStack size={118} langFont={ctx.langFont} />
      </div>
      <HeroAction copy={step.cta} />
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
          into its frame. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0 }}>
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
        <div key={role} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px' }}>
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
            {role}
          </span>
          <span style={{ ...TYPE[role], color: 'var(--text)', minWidth: 0 }}>{sample}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px' }}>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
          figures
        </span>
        <span style={{ ...TYPE.display, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>136</span>
        <span style={{ ...TYPE.display, color: 'var(--text)' }}>136</span>
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>tabular · proportional</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '10px' }}>
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
      <TypePlate />
    </div>
  )
}
