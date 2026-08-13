import { TYPE } from './typeScale'
import { RADIUS, ELEVATION } from './shape'
import { languageTheme, inkWarm } from './languageTheme'
import { Button } from './controls'
import { buildGuide, guideContextLine, STATUS } from './homeGuide'
import { NAV_GLYPHS } from './navGlyphFamily'
import { VITALITY_STATES, VITALITY_WIDTHS } from './homeVitalityFixtures'
import bgChinese from './assets/bg-chinese.webp'

// ── P14-5D: three vitality treatments of ONE approved layout ────────────────
//
// DEV-ONLY. Mounted on /dev, deleted when a treatment is migrated.
//
// The composition is settled (P14-5C) and device QA agrees; what it lacks is
// LIFE. So this lab holds the layout, the copy and the sequence completely still
// and varies exactly six things:
//
//   step marker · identity object · primary CTA · connector · atmosphere ·
//   completion mark
//
// The question it is built to answer is a specific one: does the energy come
// from CONTROL MATERIAL (A), from OBJECTS (B), or from the PROGRESSION itself
// (C)? Concept B therefore keeps the flat button on purpose — if objects alone
// carry the screen, that is worth knowing before the material ships everywhere.
//
// The rule that outranks all three: the page stays calm and the current step
// comes alive. If two things glow at once, the treatment has failed.
//
// ── Round 1, and what it settled ──────────────────────────────────────────
//
// The first pass varied all six at once and three of them came back answered,
// so they are now COMMON to all three treatments rather than variables:
//
//   · The lacquer button wins on sight. Zoomed, A's CTA has a lit top edge, a
//     body and a turned-away lower edge; B's flat fill of the identical colour
//     is a sticker. Material is the single biggest source of life on the screen.
//   · The boxed numeral loses. A 26px hairline box with a numeral in it is a
//     FORM FIELD, and with a rule running through the column it read as a
//     wizard. The bare numeral, and a bare vermilion tick for a finished step,
//     is quieter and more confident. Kept.
//   · The completion mark was a checkbox. A rounded square with a tick in it is
//     the most generic mark in software — the exact "AI-generated" failure the
//     brief names. It is now a CHOP: the lacquer plate with 成 reversed out of
//     it, pressed slightly off-square. One per finished day, nowhere else.
//
// What round 2 still genuinely does not know, one per treatment:
//
//   A  material alone — is the lacquer CTA plus a hairline rule enough?
//   B  + object — does the identity object give a Cards day the image it lacks?
//   C  + depth — does a travelled ink line and a page-scale wash do more?

const CHINESE = languageTheme('chinese')

function tint(accentHex, pct, base = 'var(--surface)') {
  return 'color-mix(in srgb, ' + accentHex + ' ' + pct + '%, ' + base + ')'
}

// ── Markers ───────────────────────────────────────────────────────────────

// The step mark, settled by round 1: a numeral while it is ahead of you, a brush
// tick in warm vermilion ink once it is behind you, and no container around
// either. Nothing here is a variable any more — it is the same in all three.
function StepMark({ step, accentHex }) {
  const done = step.status === STATUS.done
  const off = step.status === STATUS.unavailable
  const active = step.status === STATUS.active || step.status === STATUS.unknown
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
          color: active ? inkWarm(accentHex) : off ? 'var(--text-faint)' : 'var(--text-muted)',
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
// every productivity app in the store looks like. This is the plate of lacquer
// instead, with 成 — "accomplished" — reversed out of it and pressed a couple of
// degrees off square, the way a real seal lands on paper. It appears once, on a
// day that was actually earned, and nowhere else in the product.
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

// ── Connectors ────────────────────────────────────────────────────────────

// A: a straight ink rule, vermilion down to the active step and warm neutral
// after it. C: the same idea drawn as a tapering stroke, so a later phase can
// animate the ink travelling down it without redrawing anything.
function Connector({ kind, accentHex, activeIndex, count }) {
  if (kind === 'none') return null
  const doneFraction = count > 1 ? Math.min(1, (activeIndex + 0.5) / count) : 0
  if (kind === 'ink') {
    // 2px, not 3: at 3 the finished portion became a red rail down the whole
    // column in dark mode, which is the loudest thing on a screen whose whole
    // premise is that only the current step is loud.
    return (
      <span aria-hidden style={{ position: 'absolute', left: '12.5px', top: '10px', bottom: '10px', width: '2px' }}>
        <svg width="2" height="100%" viewBox="0 0 2 100" preserveAspectRatio="none" fill="none">
          <path d="M1 0 L1 100" stroke="var(--divider)" strokeWidth="2" strokeLinecap="round" />
          <path d={'M1 0 L1 ' + (doneFraction * 100)} stroke={inkWarm(accentHex)}
            strokeWidth="2" strokeLinecap="round" opacity="0.75" />
        </svg>
      </span>
    )
  }
  return (
    <span aria-hidden style={{
      position: 'absolute', left: '12.5px', top: '10px', bottom: '10px', width: '1px',
      background: 'linear-gradient(180deg, ' + inkWarm(accentHex) + ' 0%, '
        + inkWarm(accentHex) + ' ' + (doneFraction * 100) + '%, var(--divider) '
        + (doneFraction * 100) + '%, var(--divider) 100%)',
    }} />
  )
}

// ── Atmosphere ────────────────────────────────────────────────────────────
//
// A diffuse pool of warmth behind the CURRENT step and nothing else. No box, no
// border, no radius — a radial gradient that has faded out before it reaches an
// edge, which is the difference between atmosphere and a gradient card.
// `deep` is the same wash asking a second question: the Cards day has no
// artwork in it, so a third of the screen below the button is empty. Does warmth
// falling THROUGH that emptiness fix it, or does emptiness need an object (B)?
function Atmosphere({ kind, accentHex }) {
  if (kind === 'none') return null
  const deep = kind === 'deep'
  return (
    <span aria-hidden style={{
      position: 'absolute', left: '-16%', right: '-16%', top: '-18%',
      bottom: deep ? '-340%' : '-6%',
      pointerEvents: 'none',
      backgroundImage: 'radial-gradient(' + (deep ? '78% 62%' : '60% 55%') + ' at 26% '
        + (deep ? '16%' : '34%') + ', '
        + tint(accentHex, deep ? 12 : 8, 'transparent') + ' 0%, transparent 72%)',
    }} />
  )
}

// ── The layout, held still ────────────────────────────────────────────────

const GLYPH = Object.fromEntries(NAV_GLYPHS.map(g => [g.key === 'study' ? 'cards' : g.key, g.Glyph]))

function ActiveStep({ step, t, ctx }) {
  const { accentHex, langFont } = ctx
  const isStory = step.key === 'story' && step.story
  const Glyph = t.objects && !isStory ? GLYPH[step.key] : null
  return (
    <div style={{ position: 'relative', marginTop: '22px' }} data-vitality-active={step.key}>
      <Atmosphere kind={t.atmosphere} accentHex={accentHex} />

      <div style={{ position: 'relative' }}>
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
          {/* B's argument: the identity object the navigation family already
              taught, at a size where it is an OBJECT and not an icon. 64px read
              as a stray toolbar glyph in round 1; at 108 it is the thing a Cards
              day has instead of artwork. Never beside the story — there the
              artwork already is the object. */}
          {Glyph && (
            <span style={{ margin: '0 -4px -6px 0', flexShrink: 0 }}>
              <Glyph size={108} active />
            </span>
          )}
        </div>

        {step.cta && (
          <div style={{ marginTop: '20px' }}>
            <Button variant={t.cta} size="lg">{step.cta}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function QuietStep({ step, ctx }) {
  const done = step.status === STATUS.done
  const art = step.key === 'story' && step.story ? step.story : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '17px 0', position: 'relative' }}>
      <StepMark step={step} accentHex={ctx.accentHex} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          ...TYPE.titleCard, display: 'block',
          color: done ? 'var(--text-muted)' : 'var(--text)',
        }}>
          {step.title}
        </span>
        {(step.detail || step.unlockHint) && (
          <span style={{
            ...TYPE.caption, color: 'var(--text-faint)', display: 'block', marginTop: '2px',
            fontFamily: art ? ctx.langFont : undefined,
          }}>
            {[step.detail, step.unlockHint].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {art && (
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

function Complete({ guide, t, ctx }) {
  return (
    <div style={{ position: 'relative', marginTop: '24px' }} data-vitality-active="complete">
      <Atmosphere kind={t.atmosphere} accentHex={ctx.accentHex} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.titleScreen, color: 'var(--text)' }}>{guide.summary.headline}</div>
          {guide.summary.parts.length > 0 && (
            <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '8px' }}>
              {guide.summary.parts.join(' · ')}
            </div>
          )}
          {/* The day is over; the way on is an offer, not an instruction. A
              vermilion link here competed with the chop for the one loud slot. */}
          <div style={{ marginTop: '18px' }}>
            <Button variant="secondary" size="md">Practise anyway</Button>
          </div>
        </div>
        {guide.summary.earned && <Chop accentHex={ctx.accentHex} langFont={ctx.langFont} />}
      </div>
    </div>
  )
}

function Treatment({ guide, t, ctx }) {
  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown) || null
  const others = guide.steps.filter(s => s !== active)
  const activeIndex = active ? guide.steps.indexOf(active) : guide.steps.length
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)' }}>Today&rsquo;s training</span>
        {!guide.complete && (
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>{guideContextLine(guide)}</span>
        )}
      </div>

      {guide.complete
        ? <Complete guide={guide} t={t} ctx={ctx} />
        : <ActiveStep step={active} t={t} ctx={ctx} />}

      <div style={{ position: 'relative', marginTop: '26px', borderTop: '1px solid var(--divider)' }}>
        <Connector kind={t.connector} accentHex={ctx.accentHex} activeIndex={activeIndex} count={guide.steps.length} />
        {others.map(s => <QuietStep key={s.key} step={s} ctx={ctx} />)}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '30px', paddingRight: '58px' }}>
        <div style={{ ...TYPE.caption, color: 'var(--text-muted)' }}>HSK 1 · 128 / 200 words</div>
        <div style={{
          marginTop: '7px', height: '3px', borderRadius: RADIUS.pill,
          background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden',
        }}>
          <div style={{ width: '64%', height: '100%', borderRadius: RADIUS.pill, background: inkWarm(ctx.accentHex) }} />
        </div>
      </div>
    </div>
  )
}

// ── The three treatments ──────────────────────────────────────────────────
// Common to all three, because round 1 settled them: bare numeral / brush tick,
// the lacquer CTA, the chop on an earned day. What is left is one added variable
// each, so a difference on screen can only have one cause.
const TREATMENTS = {
  A: {
    title: 'A — Lacquer Guide',
    note: 'Material only. Hairline rule down the sequence, a faint pool behind the step.',
    cta: 'lacquer', connector: 'rule', atmosphere: 'soft', objects: false,
  },
  B: {
    title: 'B — Object Guide',
    note: 'Material + the identity object at 108px. No line, no wash.',
    cta: 'lacquer', connector: 'none', atmosphere: 'none', objects: true,
  },
  C: {
    title: 'C — Ink & Depth Guide',
    note: 'Material + an ink line the progress travels, and warmth through the empty half.',
    cta: 'lacquer', connector: 'ink', atmosphere: 'deep', objects: false,
  },
}

const FOLD = 780

function Frame({ width, treatment, stateKey, children }) {
  return (
    <div
      data-vitality-frame={treatment} data-vitality-state={stateKey} data-frame-width={String(width)}
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

export default function HomeVitalityLab() {
  const ctx = { accentHex: CHINESE.accentHex, langFont: CHINESE.font }
  return (
    <div style={{ display: 'grid', gap: '30px', width: '100%' }}>
      <div style={{ ...TYPE.bodySecondary, color: 'var(--text-muted)' }}>
        One layout, three vitality treatments. Only the marker, identity object, CTA,
        connector, atmosphere and completion mark differ — the composition, copy and
        sequence are identical, so what is being compared is energy and nothing else.
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
              {Object.keys(TREATMENTS).map(key => (
                VITALITY_WIDTHS.map(width => (
                  <div key={key + width}>
                    <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '8px' }}>
                      {TREATMENTS[key].title} · {width}
                    </div>
                    <Frame width={width} treatment={key} stateKey={state.key}>
                      <Treatment guide={guide} t={TREATMENTS[key]} ctx={ctx} />
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
