import { TYPE } from './typeScale'
import { RADIUS } from './shape'
import { languageTheme, inkWarm, pinyinInk } from './languageTheme'
import { Button } from './controls'
import { buildGuide } from './homeGuide'
import RedPacket from './RedPacket'
import { Frame, Variant } from './HomeVitality'
import { VITALITY_STATES, VITALITY_WIDTHS, HOME_RHYTHM } from './homeVitalityFixtures'
import {
  STYLE_FONTS, STYLE_SHAPES, STYLE_ACTIONS, STYLE_PROPOSAL, SPECIMEN_ROLES,
} from './visualStyleAxes'

const TIGHT = STYLE_SHAPES.find(s => s.key === 'tight')

// ── Visual Style V2 — the whole-app style sprint, on one screen ─────────────
//
// DEV-ONLY. Mounted on /dev, deleted when the direction is decided.
//
// The finding behind it: the Home composition is becoming good and the app's
// visual language still reads as generic. So this lab holds the approved V2
// composition completely still and varies the LANGUAGE around it — the action
// model, the typeface, the shape scale, the primary control — each on its own
// axis, plus the one proposed combination as a unit.
//
// The rule the whole sprint serves: QUIET INTERFACE, EXPRESSIVE MEANINGFUL
// OBJECTS. The packet, the artwork, the chop and the rail carry the identity;
// every surface around them gets calmer, not more styled.

const CHINESE = languageTheme('chinese')

// The two candidate faces, loaded only when this lab renders. Variable-weight
// woff2s committed under public/dev-fonts/ with their OFL licenses beside them.
function FontFaces() {
  return (
    <style>{`
      @font-face {
        font-family: 'Mona Sans Lab';
        src: url('/dev-fonts/mona-sans-var.woff2') format('woff2-variations');
        font-weight: 200 900; font-style: normal; font-display: block;
      }
      @font-face {
        font-family: 'Onest Lab';
        src: url('/dev-fonts/onest-var.woff2') format('woff2-variations');
        font-weight: 100 900; font-style: normal; font-display: block;
      }
    `}</style>
  )
}

// ── The packet as the action ──────────────────────────────────────────────
//
// One accessible control: the object and its label are a single <button>, so
// the packet stops being decoration beside an unrelated rectangle. The count
// stays OUTSIDE the button — it is information, not a control — which also
// keeps the accessible name short and imperative.
function PacketAction({ step, ctx }) {
  // One wording for the eye and the screen reader. The first render had the
  // visible label say "Open cards" while aria-label still said "Start cards" —
  // a control whose accessible name disagrees with its printed one fails the
  // label-in-name rule and voice control both.
  const label = step.cta.replace('Start cards', 'Open cards')
  return (
    <button
      type="button"
      className="hd-press"
      aria-label={label + ' — ' + step.metric.value + ' ready'}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px',
        background: 'none', border: 'none', padding: '6px 10px 8px 2px', margin: 0,
        cursor: 'pointer', minHeight: '44px',
      }}
    >
      <RedPacket direction="D2" font={ctx.langFont} size={132} />
      <span style={{
        ...TYPE.label, color: inkWarm(ctx.accentHex),
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      }}>
        {label}
        <span aria-hidden="true">→</span>
      </span>
    </button>
  )
}

// ── Type specimens ────────────────────────────────────────────────────────

function FontSpecimen({ font }) {
  return (
    <div data-style-plate={'type-' + font.key} style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      fontFamily: font.stack, minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>{font.label}</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '13px' }}>
        {font.note}
      </div>
      {SPECIMEN_ROLES.map(({ role, sample }) => (
        <div key={role} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px' }}>
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
            {role}
          </span>
          <span style={{ ...TYPE[role], color: 'var(--text)', minWidth: 0 }}>{sample}</span>
        </div>
      ))}
    </div>
  )
}

// Hanzi and pinyin are NOT an axis: every candidate keeps languageTheme's
// Chinese stack. This plate is the proof, and the place to look for collisions
// between a Latin candidate and the Hanzi beside it.
function HanziSpecimen() {
  return (
    <div data-style-plate="type-hanzi" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>Chinese — unchanged in every candidate</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '13px' }}>
        Hanzi and pinyin stay on languageTheme&rsquo;s stack; the Latin face changes around them.
      </div>
      {STYLE_FONTS.map(font => (
        <div key={font.key} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '9px', fontFamily: font.stack }}>
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)', width: '92px', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
            {font.key}
          </span>
          <span style={{ ...TYPE.titleScreen, fontFamily: CHINESE.font, color: 'var(--text)' }}>李明唱歌</span>
          <span style={{ ...TYPE.bodySecondary, color: pinyinInk(CHINESE.accentHex) }}>lǐ míng chàng gē</span>
          <span style={{ ...TYPE.bodySecondary, color: 'var(--text-secondary)', minWidth: 0 }}>Li Ming sings · 91% known</span>
        </div>
      ))}
    </div>
  )
}

// ── The primary control, compared ─────────────────────────────────────────
//
// The brief's spec for the future primary — 50-54px, 10-12 radius, vermilion
// face, top highlight, darker bottom edge, contact shadow, press movement,
// depth reduced on press — IS the P14-5D lacquer button. So this plate is the
// honest comparison: production's flat primary, the lacquer at the current
// 12px, and the lacquer on the tighter 10px, side by side and pressable.
function ButtonPlate() {
  return (
    <div data-style-plate="buttons" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>The primary action</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '14px' }}>
        Flat production primary · lacquer at 12px · lacquer at the tighter 10px.
        The secondary stays quiet: text and an arrow, or a flat surface.
      </div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" size="lg">Start cards</Button>
        <Button variant="lacquer" size="lg">Start cards</Button>
        {/* The tighter control radius comes from the axes file as NAMED data,
            never as a typed literal — the design-system guard rightly fails a
            bare '10px', and this lab is the deliberate evaluation of that value,
            not a one-off. Adopting it means changing RADIUS and the guard's
            allow-list in one owned commit. */}
        <Button variant="lacquer" size="lg" style={{ borderRadius: TIGHT.control + 'px' }}>Start cards</Button>
        <Button variant="secondary" size="md">Practise anyway</Button>
        <span style={{ ...TYPE.label, color: inkWarm(CHINESE.accentHex) }}>Open cards →</span>
      </div>
    </div>
  )
}

// ── The Home frames ───────────────────────────────────────────────────────

function styleCtx({ shape, action }) {
  return {
    accentHex: CHINESE.accentHex,
    langFont: CHINESE.font,
    direction: 'D2',
    placement: action === 'packet' ? 'fused' : 'below',
    shape: shape.key === 'current' ? null : { control: shape.control, card: shape.card },
    renderAction: action === 'packet'
      ? (step) => <PacketAction step={step} ctx={{ accentHex: CHINESE.accentHex, langFont: CHINESE.font }} />
      : null,
  }
}

function StyleFrame({ id, width, stateKey, font, shape, action, note }) {
  const state = VITALITY_STATES.find(s => s.key === stateKey)
  const guide = buildGuide(state.input)
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '6px' }}>{id} · {width}</div>
      {note && (
        <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginBottom: '6px', maxWidth: width + 'px' }}>
          {note}
        </div>
      )}
      {/* data-vitality-frame is what Frame stamps; the style spec selects on the
          wrapper's own attribute so the two harnesses never collect each other's
          frames. */}
      <div data-style-frame={id} data-frame-width={String(width)} style={{ fontFamily: font.stack, width: width + 'px' }}>
        <Frame width={width} concept={id} stateKey={stateKey}>
          <Variant guide={guide} v={HOME_RHYTHM} ctx={styleCtx({ shape, action })} />
        </Frame>
      </div>
    </div>
  )
}

function Row({ title, blurb, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginBottom: '4px' }}>{title}</div>
      {blurb && <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginBottom: '12px' }}>{blurb}</div>}
      {/* Wrapping, not a horizontal scroller: an element inside an overflow-x
          container can be screenshotted mid-scroll, which pastes the neighbour
          into its frame. A wrapped row only ever scrolls vertically, which the
          harness handles reliably. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

const FONT = Object.fromEntries(STYLE_FONTS.map(f => [f.key, f]))
const SHAPE = Object.fromEntries(STYLE_SHAPES.map(s => [s.key, s]))

export default function VisualStyleLab() {
  const proposalFont = FONT[STYLE_PROPOSAL.font]
  const proposalShape = SHAPE[STYLE_PROPOSAL.shape]
  return (
    <div style={{ display: 'grid', gap: '34px', width: '100%' }}>
      <FontFaces />
      <div style={{ ...TYPE.bodySecondary, color: 'var(--text-muted)' }}>
        Quiet interface, expressive meaningful objects. The V2 composition is held
        still; each row below varies exactly one part of the language around it,
        and the last row is the one proposed combination.
      </div>

      <Row
        title="1 · The action model"
        blurb={STYLE_ACTIONS[0].note + ' — against — ' + STYLE_ACTIONS[1].note}
      >
        <StyleFrame id="action-button" width={390} stateKey="cards" font={FONT.inter} shape={SHAPE.current} action="button" />
        <StyleFrame id="action-packet" width={390} stateKey="cards" font={FONT.inter} shape={SHAPE.current} action="packet" />
      </Row>

      <Row title="2 · Typography" blurb="Same screen four times; only the Latin face changes. Judge at 1x — the frames are actual phone width.">
        {STYLE_FONTS.map(font => (
          <StyleFrame key={font.key} id={'font-' + font.key} width={390} stateKey="cards" font={font} shape={SHAPE.current} action="packet" note={font.note} />
        ))}
      </Row>

      <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
        {STYLE_FONTS.map(font => <FontSpecimen key={font.key} font={font} />)}
        <HanziSpecimen />
      </div>

      <Row title="3 · Shape" blurb="Controls 12 → 10, cards 18 → 16, hero and pill untouched. Subtle on purpose — the question is whether selective beats ambient.">
        <StyleFrame id="shape-current" width={390} stateKey="story" font={FONT.inter} shape={SHAPE.current} action="packet" />
        <StyleFrame id="shape-tight" width={390} stateKey="story" font={FONT.inter} shape={SHAPE.tight} action="packet" />
      </Row>

      <ButtonPlate />

      <Row
        title="5 · The proposed combination"
        blurb={'Packet as the action · ' + proposalFont.label + ' · tighter shapes — as one unit, in every width and the day’s three key states.'}
      >
        {VITALITY_WIDTHS.map(width => (
          <StyleFrame key={width} id="proposal" width={width} stateKey="cards" font={proposalFont} shape={proposalShape} action="packet" />
        ))}
        <StyleFrame id="proposal" width={390} stateKey="story" font={proposalFont} shape={proposalShape} action="packet" />
        <StyleFrame id="proposal" width={390} stateKey="complete" font={proposalFont} shape={proposalShape} action="packet" />
      </Row>
    </div>
  )
}
