import { TYPE } from './typeScale'
import { RADIUS } from './shape'
import { languageTheme, pinyinInk } from './languageTheme'
import { Button } from './controls'
import { buildGuide } from './homeGuide'
import { Frame, Variant } from './HomeVitality'
import { VITALITY_STATES, VITALITY_WIDTHS, HOME_RHYTHM } from './homeVitalityFixtures'
import { STYLE_FONTS, STYLE_SHAPES, SPECIMEN_ROLES } from './visualStyleAxes'

// ── Visual Style V2 — the final Home candidate ──────────────────────────────
//
// DEV-ONLY. Mounted on /dev, deleted when the direction ships or dies.
//
// Device review settled the sprint's open questions, and two of its answers
// overrode the lab's own recommendation — recorded here because a lab that only
// ever confirms itself is not measuring anything:
//
//   · **The packet is parked.** Not migrated, not replaced by another
//     decorative object. The concept survives (RedPacket.jsx, redPacketOpen.js,
//     both still tested) for a later, genuinely authored asset; the Cards step
//     works with typography and the control alone.
//   · **The Welcome Back banner goes.** It repeats the Cards information and
//     puts a large bordered surface above the actual task. The gentle-return
//     CAP is untouched — studyAvailability still applies it, the guide still
//     carries `capped` — only the banner dies; if the cap needs words, they are
//     a quiet fact line inside the Cards step, not a surface.
//
// What remains is ONE candidate, compared against the shipped Build 44 Home:
// no packet, no banner, Mona Sans, the tighter shape language, the lacquer
// primary with its arrow in the label. Energy comes from typography, the real
// story artwork, active-state colour and the tactile control — not from an
// illustration.

const CHINESE = languageTheme('chinese')
const FONT = Object.fromEntries(STYLE_FONTS.map(f => [f.key, f]))
const SHAPE = Object.fromEntries(STYLE_SHAPES.map(s => [s.key, s]))
const TIGHT = SHAPE.tight

// Mona Sans only — the sprint's typography comparison is decided this far:
// Onest lost on maturity, and the native benchmark can only be judged on a
// device. The file stays under public/dev-fonts/ with its OFL license.
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

// The candidate's primary action: the lacquer material, the tighter radius, and
// the arrow INSIDE the label — one piece of typography, not a button plus an
// icon slot. The copy is an axis of its own (see CopyPlate).
function CandidateAction({ copy }) {
  return (
    <Button variant="lacquer" size="lg" style={{ borderRadius: TIGHT.control + 'px' }}>
      {copy + ' →'}
    </Button>
  )
}

const CANDIDATE_CTX = {
  accentHex: CHINESE.accentHex,
  langFont: CHINESE.font,
  shape: { control: TIGHT.control, card: TIGHT.card },
  // Every active step's own words, through one treatment — Start cards →,
  // Continue story →, Practise these →.
  renderAction: (step) => <CandidateAction copy={step.cta} />,
}

// Build 44's Home, as the comparison stand-in: the P14-5C rhythm (steps stacked
// under the active one, no distribution, no previews), Inter, current shapes,
// the flat primary. Rendered by the same components so the comparison is
// composition and language, not two codebases.
const BASELINE_RHYTHM = { gap: 26, padY: 17, connector: 0, distribute: false, preview: false }
const BASELINE_CTX = {
  accentHex: CHINESE.accentHex,
  langFont: CHINESE.font,
  renderAction: (step) => <Button variant="primary" size="lg">{step.cta}</Button>,
}

function StyleFrame({ id, width, stateKey, font, rhythm, ctx, note }) {
  const state = VITALITY_STATES.find(s => s.key === stateKey)
  const guide = buildGuide(state.input)
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '6px' }}>
        {id} · {stateKey} · {width}
      </div>
      {note && (
        <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginBottom: '6px', maxWidth: width + 'px' }}>
          {note}
        </div>
      )}
      <div data-style-frame={id + '-' + stateKey} data-frame-width={String(width)} style={{ fontFamily: font.stack, width: width + 'px' }}>
        <Frame width={width} concept={id} stateKey={stateKey}>
          <Variant guide={guide} v={rhythm} ctx={ctx} />
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
          into its frame. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

// The CTA copy question, decided where it can be seen: the two candidates on
// the real control, at real size, with the pick and the reason beside them.
function CopyPlate() {
  return (
    <div data-style-plate="cta-copy" style={{
      padding: '16px 18px', borderRadius: RADIUS.card + 'px',
      background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ ...TYPE.titleCard, color: 'var(--text)' }}>The action&rsquo;s words</div>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '3px', marginBottom: '14px' }}>
        Picked: <strong>Start cards →</strong>. &ldquo;Start&rdquo; is an unambiguous verb and
        answers the headline (&ldquo;136 cards ready&rdquo; → start them); &ldquo;Study cards&rdquo;
        reads noun-first — the label of a place, not an action — and collides with the
        Cards tab already being the place.
      </div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', fontFamily: FONT.mona.stack }}>
        <CandidateAction copy="Start cards" />
        <CandidateAction copy="Study cards" />
        <Button variant="primary" size="lg">Start cards</Button>
      </div>
      <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '10px' }}>
        Left: the two copy candidates on the candidate control. Right: Build 44&rsquo;s flat primary, for the material comparison.
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
        The final Home candidate: no packet, no Welcome Back banner, Mona Sans,
        tighter shapes, the lacquer primary with its arrow in the label. Compared
        against the shipped Build 44 composition, rendered by the same components.
      </div>

      <Row
        title="Build 44 — the shipped Home, as the control"
        blurb="P14-5C rhythm, Inter, current shapes, flat primary. What the candidate has to beat."
      >
        {VITALITY_STATES.map(state => (
          <StyleFrame
            key={state.key} id="build44" width={390} stateKey={state.key}
            font={FONT.inter} rhythm={BASELINE_RHYTHM} ctx={BASELINE_CTX}
          />
        ))}
      </Row>

      <Row
        title="The candidate — every state, every width"
        blurb="V2 rhythm · typography-led Cards step · Mona Sans · controls 10 / cards 16 · Start cards →"
      >
        {VITALITY_STATES.map(state => (
          VITALITY_WIDTHS.map(width => (
            <StyleFrame
              key={state.key + width} id="candidate" width={width} stateKey={state.key}
              font={FONT.mona} rhythm={HOME_RHYTHM} ctx={CANDIDATE_CTX}
            />
          ))
        ))}
      </Row>

      <CopyPlate />
      <TypePlate />
    </div>
  )
}
