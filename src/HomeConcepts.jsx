import { TYPE } from './typeScale'
import { RADIUS, ELEVATION } from './shape'
import { languageTheme, ink } from './languageTheme'
import { ON_HERO, heroGround, heroShadow } from './designTokens'
import { Button } from './controls'
import { HeroAction } from './panels'
import { DeckObject } from './heroObjects'
import { buildGuide, guideContextLine, STATUS } from './homeGuide'
import { CONCEPT_STATES, FRAME_WIDTHS } from './homeConceptFixtures'
import bgChinese from './assets/bg-chinese.webp'

// ── P14-5B: three Home compositions, side by side ──────────────────────────
//
// DEV-ONLY. Mounted on /dev, never routed, deleted when a concept is migrated
// into Home.jsx. It exists because P14-5 was functionally right and still looked
// generated on a device, and the only way to answer "is this composition
// actually good" is to see three genuinely different ones at phone width, in
// both themes, in every learner state — including the boring ones.
//
// Three rules held constant across all three, so the comparison is about
// composition and nothing else:
//
//   1. **All three render the same `buildGuide()` output.** No concept knows a
//      fact the others don't, and none of them invents one.
//   2. **All three are built from the existing token scale** — TYPE roles,
//      RADIUS, ELEVATION, the accent, the neutral tokens. Not one new hex, size,
//      radius or literal shadow (designSystem.guard.test.js counts dev files
//      too, which is the point: a concept that needs a value the system cannot
//      express is a concept that cannot ship).
//   3. **Exactly one loud object.** The active step. Everything else is quiet.
//
// The dimensional objects here are drawn in BRAND tones on paper, which is the
// opposite of heroObjects.jsx (paper on brand) and for the same reason: an object
// has to contrast with the ground it sits on. Concept C, whose active step IS a
// lacquer plate, reuses heroObjects' DeckObject unchanged.

const CHINESE = languageTheme('chinese')

// ── Shared small parts ────────────────────────────────────────────────────

// The accent as a tint that mixes INTO the surface, so it survives a theme flip.
function tint(accentHex, pct, base = 'var(--surface)') {
  return 'color-mix(in srgb, ' + accentHex + ' ' + pct + '%, ' + base + ')'
}

// The top context line. Deliberately two small pieces on one row: what this is,
// and where you are in it. The brief's "do not waste the top third of Home on a
// giant greeting" is the whole design of this component.
function TopContext({ guide, right = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px',
    }}>
      <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)' }}>Today&rsquo;s training</span>
      {right && !guide.complete && (
        <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>
          {guideContextLine(guide)}
        </span>
      )}
    </div>
  )
}

// HSK progress, demoted to context: one line of type and one hairline rail. The
// brief's "something as simple as this may be enough" taken literally.
function LevelLine({ ctx, style = {} }) {
  const pct = ctx.totalWords > 0 ? Math.min(100, (ctx.learnedCount / ctx.totalWords) * 100) : 0
  // `marginTop: auto` is the whole fix for what the first render got wrong: the
  // composition ended 200px above the fold and read as an unfinished screen.
  // Progress is CONTEXT, so it belongs at the foot of the page — and once it is
  // there, the air between the sequence and it is deliberate rather than left over.
  return (
    <div style={{ marginTop: 'auto', paddingTop: '28px', ...style }}>
      <div style={{ ...TYPE.caption, color: 'var(--text-muted)' }}>
        {ctx.levelLabel} · {ctx.learnedCount} / {ctx.totalWords} words
      </div>
      <div style={{
        marginTop: '7px', height: '3px', borderRadius: RADIUS.pill,
        background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden',
      }}>
        <div style={{
          width: pct + '%', height: '100%', borderRadius: RADIUS.pill,
          background: ink(ctx.accentHex),
        }} />
      </div>
    </div>
  )
}

// The story artwork, at the ratio it was actually drawn at.
//
// Production art is 1344×756 — 16:9, characters centred, a painted scene. The
// current Home crops it into a 72px near-square, which throws away most of the
// picture and all of its composition; every concept here shows it at 16:9 and
// lets it be the one rich thing on the screen.
function Artwork({ url, radius, style = {} }) {
  return (
    <div data-story-cover="" style={{
      position: 'relative', overflow: 'hidden',
      aspectRatio: '16 / 9', width: '100%',
      borderRadius: radius, background: 'var(--surface-2)',
      ...style,
    }}>
      <img
        src={url} alt="" loading="eager"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}

// A deck of cards drawn in the brand, for a paper ground. Same light source and
// same plane logic as the navigation family: lit top-left, shaded right return.
//
// Two corrections from the first render, both the same mistake P14-3 made and
// had to measure its way out of:
//
//   · **It was too pale.** Faces mixed at 52–88% of the accent INTO the surface
//     came out as three pink rectangles with no separation between them. The
//     accent now carries the faces outright and the depth comes from mixing
//     toward --text, which is the direction that actually darkens in both themes.
//   · **The brush mark read as a pencil.** A diagonal tapered stroke on a card is
//     the compose/edit glyph — exactly the misread that killed two P14-3 Cards
//     drawings. A card's front is now blank with two ruled lines: it is a WORD
//     card, and lines say that without drawing a word.
function InkDeck({ size = 96, accentHex }) {
  const face = accentHex
  const mid = tint(accentHex, 72, 'var(--surface)')
  const back = tint(accentHex, 50, 'var(--surface)')
  const shade = tint(accentHex, 62, 'var(--text)')
  const rule = tint(accentHex, 22, 'var(--surface)')
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}>
      {[
        { x: 48, y: 12, w: 48, h: 62, r: 8, f: back },
        { x: 33, y: 27, w: 52, h: 66, r: 8, f: mid },
        { x: 17, y: 42, w: 58, h: 72, r: 8, f: face },
      ].map((c, i) => (
        <g key={c.x}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} fill={c.f} />
          {/* The right return: the face turned away from the light. */}
          <rect x={c.x + c.w - 7} y={c.y + 4} width="7" height={c.h - 8} rx="3.5" fill={shade} opacity="0.32" />
          {i === 2 && (
            <>
              {/* Two ruled lines — a word and its reading, at the size where a
                  glyph would only be noise. */}
              <rect x={c.x + 11} y={c.y + 27} width="34" height="4" rx="2" fill={rule} opacity="0.85" />
              <rect x={c.x + 11} y={c.y + 38} width="22" height="4" rx="2" fill={rule} opacity="0.6" />
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

// An open book, brand-toned, for a Story step on paper.
function InkBook({ size = 96, accentHex }) {
  const page = tint(accentHex, 80, 'var(--surface)')
  const pageBack = tint(accentHex, 58, 'var(--surface)')
  const lit = tint(accentHex, 30, 'var(--surface)')
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}>
      <path d="M64 38C50 28 32 26 18 30V96C32 92 50 94 64 104Z" fill={page} />
      <path d="M64 38C78 28 96 26 110 30V96C96 92 78 94 64 104Z" fill={pageBack} />
      <path d="M64 38C50 28 32 26 18 30V36C32 32 50 34 64 44Z" fill={lit} />
      <rect x="62" y="38" width="4" height="66" rx="2" fill={tint(accentHex, 96, 'var(--text)')} opacity="0.24" />
    </svg>
  )
}

// A seal — the completion mark, and Concept B's station glyph. A chop, not a
// tick in a circle: it is the one place gold is allowed, because a finished day
// is genuinely a reward (palette.js: gold means a reward or an unlock).
function SealObject({ size = 84, accentHex }) {
  const disc = accentHex
  const lit = tint(accentHex, 60, 'var(--surface)')
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}>
      <rect x="18" y="18" width="92" height="92" rx="18" fill={disc} />
      <path d="M18 36C18 26 26 18 36 18H92C102 18 110 26 110 36V44C110 30 98 22 84 22H36C26 22 18 28 18 36Z" fill={lit} opacity="0.7" />
      <rect x="26" y="26" width="76" height="76" rx="12" fill="none" stroke="var(--gold)" strokeWidth="2" opacity="0.85" />
      <path d="M46 66 58 78 84 50" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// The station mark for a vertical guide: filled when done, ringed when active,
// hollow when still ahead. One glyph, three states — the sequence has to be
// readable in under a second, and three shapes would not be.
function StepMark({ step, accentHex, seal = false }) {
  const done = step.status === STATUS.done
  const active = step.status === STATUS.active || step.status === STATUS.unknown
  const off = step.status === STATUS.unavailable
  const size = seal ? 26 : 13
  const common = {
    width: size + 'px', height: size + 'px', flexShrink: 0,
    borderRadius: seal ? RADIUS.sm + 'px' : RADIUS.pill,
    display: 'grid', placeItems: 'center', boxSizing: 'border-box',
  }
  if (done) {
    // A tick alone at 13px is a smudge, so the small variant draws the tick
    // WITHOUT a disc around it — the mark is the tick, at a size it can be read.
    if (!seal) {
      return (
        <span style={{ ...common, background: 'transparent' }}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.6 6.2 4.6 9.4l6-7.4" stroke={accentHex} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )
    }
    return (
      <span style={{ ...common, background: accentHex }}>
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6.4 5 9l4.5-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (active) {
    // The active seal keeps its numeral. Filled and empty read as a rendering
    // fault next to two numbered siblings — the sequence has to stay countable.
    return (
      <span style={{ ...common, background: accentHex, boxShadow: ELEVATION.raised }}>
        {seal && <span style={{ ...TYPE.eyebrow, color: '#fff', letterSpacing: 0 }}>{step.number}</span>}
      </span>
    )
  }
  return (
    <span style={{
      ...common,
      border: '2px solid ' + (off ? 'var(--border)' : 'color-mix(in srgb, ' + accentHex + ' 38%, var(--border))'),
      background: 'transparent',
    }}>
      {seal && (
        <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', letterSpacing: 0 }}>{step.number}</span>
      )}
    </span>
  )
}

// The label a step wears above its content: "1 · CARDS".
function StepEyebrow({ step, accentHex, onHero = false }) {
  return (
    <span style={{
      ...TYPE.eyebrow,
      color: onHero ? ON_HERO.eyebrow : ink(accentHex),
    }}>
      {step.number} · {step.title}
    </span>
  )
}

// One quiet line for a step that is not the current one. Same component for
// "done" and "still ahead" — the mark carries the difference, not a second
// layout. This is the anti-AI rule in one place: two states, one treatment.
function QuietStep({ step, accentHex, langFont, seal = false }) {
  const done = step.status === STATUS.done
  const art = step.key === 'story' && step.story ? step.story.coverUrl : null
  // 18px of vertical padding, not 11. A step is one of three objects on the
  // screen, and a 40px one-liner reads as a settings row — which is the note the
  // device QA actually gave. The sequence is allowed to take up the page.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 0' }}>
      {/* The number IS the mark. A dot cannot say "second", and second is the
          thing this screen exists to communicate; the tick replaces it once the
          step is behind you, which is the only moment the order stops mattering. */}
      <span style={{
        display: 'flex', width: '18px', justifyContent: 'center', flexShrink: 0,
      }}>
        {done ? (
          <StepMark step={step} accentHex={accentHex} seal={seal} />
        ) : (
          <span style={{
            ...TYPE.titleSection, ...{ fontVariantNumeric: 'tabular-nums' },
            color: step.status === STATUS.unavailable
              ? 'var(--text-faint)'
              : 'color-mix(in srgb, ' + accentHex + ' 55%, var(--text-faint))',
          }}>
            {step.number}
          </span>
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          ...TYPE.titleCard,
          color: done ? 'var(--text-muted)' : 'var(--text)',
          display: 'block',
        }}>
          {step.title}
        </span>
        {step.detail && (
          <span style={{
            ...TYPE.caption, color: 'var(--text-faint)', display: 'block', marginTop: '2px',
            fontFamily: art ? langFont : undefined,
          }}>
            {step.detail}{step.unlockHint ? ' · ' + step.unlockHint : ''}
          </span>
        )}
      </span>
      {/* The step that is COMING gets its real picture, small. "Show what comes
          after it" is in the brief, and a chapter you can see is a different
          promise from a chapter you are told about. It is the same artwork the
          step will open at full width, so nothing here is decoration. */}
      {art && (
        <Artwork url={art} radius={RADIUS.control + 'px'} style={{
          width: '96px', flexShrink: 0, opacity: done ? 0.5 : 1,
        }} />
      )}
    </div>
  )
}

// ── Concept A — Editorial Guide ───────────────────────────────────────────
// Almost no bounded surfaces. The page IS the layout: a small context line, one
// statement set in the largest type on the screen, one object, one button, then
// the rest of the sequence as quiet lines under a hairline. Whitespace does the
// work that borders were doing.

function ActiveBlockA({ step, ctx }) {
  const { accentHex, langFont } = ctx
  const isStory = step.key === 'story' && step.story
  return (
    <div style={{ marginTop: '26px' }}>
      <StepEyebrow step={step} accentHex={accentHex} />

      {isStory && (
        // Full-bleed: the artwork runs to both edges of the screen, which is what
        // makes it read as content rather than as a thumbnail in a row.
        <div style={{ margin: '14px -16px 0' }}>
          <Artwork url={step.story.coverUrl} radius="0px" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginTop: isStory ? '16px' : '10px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Type-led is this concept's whole argument, so where there is a number
              to say, it is set in `display` — the role written for "the one number
              a screen is about" — and its noun sits under it. A sentence at 26px
              wrapping to three lines is not editorial, it is just big. */}
          {step.metric ? (
            <>
              <div style={{ ...TYPE.display, ...{ fontVariantNumeric: 'tabular-nums' }, color: 'var(--text)' }}>
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
        {/* Cropped by the page edge, at a size where it is an object rather than
            an icon: 92px inside the margin read as a red notes glyph. */}
        {step.key === 'cards' && (
          <span style={{ margin: '-6px -34px 0 0', flexShrink: 0 }}>
            <InkDeck size={140} accentHex={accentHex} />
          </span>
        )}
        {step.key === 'practice' && (
          <span style={{ margin: '-4px -26px 0 0', flexShrink: 0 }}>
            <InkBook size={116} accentHex={accentHex} />
          </span>
        )}
      </div>

      {step.cta && (
        <div style={{ marginTop: '22px' }}>
          <Button size="lg">{step.cta}</Button>
        </div>
      )}
    </div>
  )
}

function CompleteBlockA({ guide, ctx }) {
  return (
    <div style={{ marginTop: '30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.titleScreen, color: 'var(--text)' }}>{guide.summary.headline}</div>
          {guide.summary.parts.length > 0 && (
            <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '8px' }}>
              {guide.summary.parts.join(' · ')}
            </div>
          )}
        </div>
        {guide.summary.earned && <SealObject size={72} accentHex={ctx.accentHex} />}
      </div>
      <div style={{ marginTop: '22px' }}>
        <span style={{ ...TYPE.label, color: ink(ctx.accentHex) }}>Explore Practice →</span>
      </div>
    </div>
  )
}

function ConceptA({ guide, ctx }) {
  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown)
  const rest = guide.steps.filter(s => s !== active)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <TopContext guide={guide} />
      {guide.complete
        ? <CompleteBlockA guide={guide} ctx={ctx} />
        : <ActiveBlockA step={active} ctx={ctx} />}

      <div style={{ position: 'relative', marginTop: '26px', borderTop: '1px solid var(--divider)', paddingTop: '4px' }}>
        {/* One connector behind the marks, so the three steps read as a sequence
            rather than as a list of rows. 6.5px is the 13px mark's centre. */}
        <div aria-hidden style={{
          position: 'absolute', left: '6px', top: '22px', bottom: '22px', width: '1px',
          background: 'var(--divider)',
        }} />
        {rest.map(s => (
          <QuietStep key={s.key} step={s} accentHex={ctx.accentHex} langFont={ctx.langFont} />
        ))}
      </div>

      <LevelLine ctx={ctx} />
    </div>
  )
}

// ── Concept B — Guided Dojo ───────────────────────────────────────────────
// The same sequence as a training-hall register: an ink rail down the left, a
// seal for each station, and the current station raised on a paper plaque with a
// lacquer spine. Material depth instead of type scale — restrained, and never
// literal woodgrain.

function PlaqueB({ step, ctx }) {
  const { accentHex, langFont } = ctx
  const isStory = step.key === 'story' && step.story
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: RADIUS.card + 'px',
      boxShadow: ELEVATION.raised,
    }}>
      {/* The lacquer spine: the plaque is a physical thing set into the rail. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: accentHex,
      }} />

      {isStory && <Artwork url={step.story.coverUrl} radius="0px" />}

      <div style={{ padding: isStory ? '15px 18px 18px' : '18px' }}>
        <StepEyebrow step={step} accentHex={accentHex} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginTop: '9px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              ...TYPE.titleSection, color: 'var(--text)',
              fontFamily: isStory ? langFont : undefined,
            }}>
              {step.detail}
            </div>
            {step.facts.length > 0 && (
              <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '6px' }}>
                {step.facts.join(' · ')}
              </div>
            )}
          </div>
          {step.key === 'cards' && (
            <span style={{ margin: '-4px -26px -10px 0', flexShrink: 0 }}>
              <InkDeck size={116} accentHex={accentHex} />
            </span>
          )}
        </div>
        {step.cta && (
          <div style={{ marginTop: '16px' }}>
            <Button full>{step.cta}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function StationB({ step, ctx, active }) {
  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <span style={{ display: 'flex', width: '26px', justifyContent: 'center', paddingTop: active ? '18px' : '12px' }}>
        <StepMark step={step} accentHex={ctx.accentHex} seal />
      </span>
      <div style={{ minWidth: 0, flex: 1, paddingBottom: '14px' }}>
        {active
          ? <PlaqueB step={step} ctx={ctx} />
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  ...TYPE.titleCard,
                  color: step.status === STATUS.done ? 'var(--text-muted)' : 'var(--text)',
                }}>
                  {step.title}
                </div>
                {step.detail && (
                  <div style={{
                    ...TYPE.caption, color: 'var(--text-faint)', marginTop: '3px',
                    fontFamily: step.key === 'story' && step.story ? ctx.langFont : undefined,
                  }}>
                    {step.detail}{step.unlockHint ? ' · ' + step.unlockHint : ''}
                  </div>
                )}
              </div>
              {step.key === 'story' && step.story && (
                <Artwork url={step.story.coverUrl} radius={RADIUS.control + 'px'} style={{
                  width: '96px', flexShrink: 0, opacity: step.status === STATUS.done ? 0.5 : 1,
                }} />
              )}
            </div>
          )}
      </div>
    </div>
  )
}

function ConceptB({ guide, ctx }) {
  const activeKey = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown)?.key
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <TopContext guide={guide} />

      <div style={{ position: 'relative', marginTop: '20px' }}>
        {/* The ink rail. It stops short at both ends so it reads as drawn rather
            than as a table border. */}
        <div aria-hidden style={{
          position: 'absolute', left: '13px', top: '18px', bottom: '26px', width: '2px',
          borderRadius: RADIUS.pill,
          background: 'color-mix(in srgb, ' + ctx.accentHex + ' 16%, transparent)',
        }} />
        {guide.complete ? (
          <>
            {guide.steps.map(step => (
              <StationB key={step.key} step={step} ctx={ctx} active={false} />
            ))}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginTop: '4px' }}>
              <span style={{ width: '26px', flexShrink: 0 }} />
              <div style={{
                flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: RADIUS.card + 'px', boxShadow: ELEVATION.raised, padding: '18px',
                display: 'flex', alignItems: 'center', gap: '14px',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...TYPE.titleSection, color: 'var(--text)' }}>{guide.summary.headline}</div>
                  {guide.summary.parts.length > 0 && (
                    <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '6px' }}>
                      {guide.summary.parts.join(' · ')}
                    </div>
                  )}
                  <div style={{ marginTop: '14px' }}>
                    <span style={{ ...TYPE.label, color: ink(ctx.accentHex) }}>Explore Practice →</span>
                  </div>
                </div>
                {guide.summary.earned && <SealObject size={56} accentHex={ctx.accentHex} />}
              </div>
            </div>
          </>
        ) : guide.steps.map(s => (
          <StationB key={s.key} step={s} ctx={ctx} active={s.key === activeKey} />
        ))}
      </div>

      <LevelLine ctx={ctx} />
    </div>
  )
}

// ── Concept C — Playful Guide ─────────────────────────────────────────────
// The strongest state change of the three: the sequence lives in a compact
// ribbon at the top, and the current step is a full lacquer plate below it. When
// a step completes, the plate is REPLACED rather than resized — the screen
// visibly moves on. Closest in energy to a consumer learning app, with the
// brand's own material instead of its palette.

function RibbonC({ guide, ctx }) {
  return (
    <div style={{ display: 'flex', gap: '7px', marginTop: '14px' }}>
      {guide.steps.map(s => {
        const done = s.status === STATUS.done
        const active = s.status === STATUS.active || s.status === STATUS.unknown
        const off = s.status === STATUS.unavailable
        return (
          <span key={s.key} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            height: '30px', borderRadius: RADIUS.pill,
            background: active ? tint(ctx.accentHex, 14) : 'var(--surface)',
            border: '1px solid ' + (active ? 'color-mix(in srgb, ' + ctx.accentHex + ' 34%, var(--border))' : 'var(--border)'),
            ...TYPE.caption,
            fontWeight: active ? 700 : 400,
            color: active ? ink(ctx.accentHex) : done ? 'var(--text-muted)' : 'var(--text-faint)',
            opacity: off ? 0.55 : 1,
          }}>
            {done ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 6.4 5 9l4.5-6" stroke={ctx.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
            {s.title}
          </span>
        )
      })}
    </div>
  )
}

function PlateC({ step, ctx, complete = false, guide = null }) {
  const { accentHex, langFont } = ctx
  const isStory = step && step.key === 'story' && step.story
  // A day with nothing waiting does not get the loud object. The lacquer plate is
  // for WORK; spending it on "nothing waiting today" is how a screen ends up
  // shouting at a learner who is simply up to date — and it was the one place
  // this concept had no quiet register at all. Paper, no facet, no seal.
  const quiet = complete && guide && !guide.summary.earned
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', marginTop: '18px',
      borderRadius: RADIUS.hero + 'px',
      background: quiet ? 'var(--surface)' : heroGround(accentHex, 'facet'),
      border: quiet ? '1px solid var(--border)' : undefined,
      boxShadow: quiet ? ELEVATION.raised : heroShadow(accentHex, false, 'facet'),
      color: quiet ? 'var(--text)' : '#fff',
    }}>
      {/* The lit facet, the same corner light the P14-5 hero uses. */}
      {!quiet && (
        <div aria-hidden style={{
          position: 'absolute', top: '-42%', left: '-18%', width: '88%', height: '124%',
          background: 'radial-gradient(closest-side, ' + ON_HERO.facet + ', transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}

      {isStory && <Artwork url={step.story.coverUrl} radius="0px" />}

      <div style={{ position: 'relative', padding: '22px 20px 26px' }}>
        {complete ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...TYPE.titleScreen }}>{guide.summary.headline}</div>
                {guide.summary.parts.length > 0 && (
                  <div style={{
                    ...TYPE.caption, marginTop: '7px',
                    color: quiet ? 'var(--text-muted)' : ON_HERO.body,
                  }}>
                    {guide.summary.parts.join(' · ')}
                  </div>
                )}
                {quiet && (
                  <div style={{ marginTop: '14px' }}>
                    <span style={{ ...TYPE.label, color: ink(accentHex) }}>Explore Practice →</span>
                  </div>
                )}
              </div>
              {/* Gold is a reward, so it appears only when one was earned. */}
              {guide.summary.earned && <SealObject size={68} accentHex={'var(--gold)'} />}
            </div>
          </>
        ) : (
          <>
            <StepEyebrow step={step} accentHex={accentHex} onHero />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '9px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {step.metric ? (
                  <>
                    <div style={{ ...TYPE.display, ...{ fontVariantNumeric: 'tabular-nums' } }}>
                      {step.metric.value}
                    </div>
                    <div style={{ ...TYPE.titleSection, marginTop: '2px' }}>{step.metric.label}</div>
                  </>
                ) : (
                  <div style={{
                    ...TYPE.titleScreen,
                    fontFamily: isStory ? langFont : undefined,
                  }}>
                    {step.detail}
                  </div>
                )}
                {step.facts.length > 0 && (
                  <div style={{ ...TYPE.caption, color: ON_HERO.body, marginTop: '7px' }}>
                    {step.facts.join(' · ')}
                  </div>
                )}
              </div>
              {step.key === 'cards' && !isStory && (
                <span style={{ margin: '0 -22px -26px 0' }}>
                  <DeckObject size={124} />
                </span>
              )}
            </div>
            {step.cta && <HeroAction label={step.cta} accentHex={accentHex} material="paper" />}
          </>
        )}
      </div>
    </div>
  )
}

function ConceptC({ guide, ctx }) {
  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown)
  const ahead = guide.steps.filter(s => s.status === STATUS.upcoming || s.status === STATUS.unavailable)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <TopContext guide={guide} right={false} />
      <RibbonC guide={guide} ctx={ctx} />

      {guide.complete
        ? <PlateC step={null} ctx={ctx} complete guide={guide} />
        : <PlateC step={active} ctx={ctx} />}

      {ahead.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          {ahead.map((s, i) => (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 2px',
              borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
            }}>
              <span style={{
                ...TYPE.titleSection, ...{ fontVariantNumeric: 'tabular-nums' },
                width: '18px', textAlign: 'center', flexShrink: 0,
                color: 'color-mix(in srgb, ' + ctx.accentHex + ' 45%, var(--text-faint))',
              }}>
                {s.number}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ ...TYPE.titleCard, color: 'var(--text)', display: 'block' }}>{s.title}</span>
                {s.detail && (
                  <span style={{
                    ...TYPE.caption, color: 'var(--text-faint)', display: 'block', marginTop: '2px',
                    fontFamily: s.key === 'story' && s.story ? ctx.langFont : undefined,
                  }}>
                    {s.detail}{s.unlockHint ? ' · ' + s.unlockHint : ''}
                  </span>
                )}
              </span>
              {s.key === 'story' && s.story && (
                <Artwork url={s.story.coverUrl} radius={RADIUS.control + 'px'} style={{ width: '96px', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}

      <LevelLine ctx={ctx} />
    </div>
  )
}

// ── The lab ───────────────────────────────────────────────────────────────

const CONCEPTS = {
  A: { title: 'A — Editorial Guide', render: ConceptA },
  B: { title: 'B — Guided Dojo', render: ConceptB },
  C: { title: 'C — Playful Guide', render: ConceptC },
}

// A phone-shaped frame with the page's real ground, Home's real padding, and a
// mock of the floating tray at the fold — so "does this belong with the new
// navigation" and "where does the fold land" are both answerable from a still.
function Frame({ width, concept, stateKey, children }) {
  const FOLD = 780 // iPhone 14/15 viewport height minus the status bar, roughly.
  return (
    <div
      data-concept-frame={concept}
      data-concept-state={stateKey}
      data-frame-width={String(width)}
      style={{
        position: 'relative', width: width + 'px', flexShrink: 0,
        // The frame is at least one phone tall, so the tray mock and the fold line
        // land where they really would; content past the fold makes it grow, which
        // is what a scrolling Home looks like.
        minHeight: FOLD + 'px',
        borderRadius: RADIUS.card + 'px', overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--bg)',
        boxShadow: ELEVATION.raised,
      }}
    >
      {/* The page's own ground, at the opacity Background.jsx uses — the token,
          not a number: it is 0.4 on paper and 0.06 in dark, and drawing it at full
          strength (which the first render did) washes a dark page light. */}
      <img src={bgChinese} alt="" aria-hidden="true" className="hd-bg" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none',
        opacity: 'var(--bg-image-opacity)',
      }} />
      <div style={{
        position: 'relative', padding: '24px 16px 40px',
        // The usable page on a 390×844 phone: viewport minus the status bar minus
        // the tray's reservation. A concept that fills THIS looks designed to the
        // screen; one that stops short of it looks unfinished, which is what the
        // first render did.
        minHeight: (FOLD - 66) + 'px',
        display: 'flex', flexDirection: 'column',
      }}>
        {children}
      </div>
      {/* Where the phone's fold falls, and the tray that floats above it. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: FOLD + 'px',
        borderTop: '1px dashed color-mix(in srgb, var(--text) 22%, transparent)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: '12px', right: '12px', top: (FOLD - 66) + 'px',
        height: '60px', borderRadius: RADIUS.card + 'px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: ELEVATION.floating,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        ...TYPE.eyebrow, color: 'var(--text-faint)',
      }}>
        <span>Home</span><span>Stories</span><span>Cards</span><span>Practice</span><span>More</span>
      </div>
    </div>
  )
}

export default function HomeConceptLab() {
  const ctx = {
    accentHex: CHINESE.accentHex,
    langFont: CHINESE.font,
    levelLabel: 'HSK 1',
    learnedCount: 128,
    totalWords: 200,
  }

  return (
    <div style={{ display: 'grid', gap: '30px' }}>
      <div style={{ ...TYPE.bodySecondary, color: 'var(--text-muted)' }}>
        Every frame renders the same <code>buildGuide()</code> output — the concepts differ
        in composition only. Artwork and story titles are production data. The dashed line is
        the fold on a 390×844 phone; the bar above it mocks the floating tray.
      </div>

      {CONCEPT_STATES.map(state => {
        const guide = buildGuide(state.input)
        const stateCtx = {
          ...ctx,
          learnedCount: state.input.counts.learnedCount,
          totalWords: state.input.counts.totalWords,
        }
        return (
          <div key={state.key} data-concept-row={state.key}>
            <div style={{ ...TYPE.titleSection, color: 'var(--text)' }}>{state.label}</div>
            <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '3px', marginBottom: '14px' }}>
              {state.note}
            </div>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
              {Object.keys(CONCEPTS).map(key => (
                FRAME_WIDTHS.map(width => (
                  <div key={key + width}>
                    <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '8px' }}>
                      {CONCEPTS[key].title} · {width}
                    </div>
                    <Frame width={width} concept={key} stateKey={state.key}>
                      {CONCEPTS[key].render({ guide, ctx: stateCtx })}
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
