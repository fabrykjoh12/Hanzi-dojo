import { useId } from 'react'
import { TYPE } from './typeScale'
import { heroGround, heroShadow, ON_HERO } from './designTokens'
import {
  HOME_RADIUS, HERO_CTA, HERO_GRAIN_OPACITY,
  FLASHCARD_BOX, FLASHCARD_SHEETS, FLASHCARD_FRONT, FLASHCARD_INK,
  heroCtaShadow, heroCornerLight, heroFarShade,
} from './homeHeroTokens'

// Home's Cards hero — the drawing. P14-5F.
//
// The Cards step is the screen's ONE lit panel: the app's own design language
// (CLAUDE.md §5) back on Home, carrying everything the P14-5 hero lab and the
// Visual Style sprint learned. Every value it uses is named in
// homeHeroTokens.js, which is where a change belongs.
//
// Why a panel here and type-on-page everywhere else: Cards is the only step of
// the three that has no artwork of its own, and it is the step the screen is
// usually about. Story brings a painting; Practice is a recommendation and stays
// a line. One lit object, two quiet steps — that contrast IS the language, and
// giving Story or Practice a panel too would flatten it back into a dashboard.

// ── The flashcard object ──────────────────────────────────────────────────
//
// Two translucent sheets from the hero's paper ramp, and one solid paper card in
// front with a real word printed on it in the brand's ink. That material split
// is the whole idea: the P14-5C deck was three abstract translucent rectangles
// and read as "a stack of notes" or the compose glyph, three separate times. A
// note does not have vocabulary on it.
//
// `word` and `reading` are supplied by the caller from `languageTheme`, never
// hardcoded — a Russian-track learner's Home must not show hanzi.
export function FlashcardStack({ size = 118, langFont, word, reading }) {
  const blurId = 'hh-b-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const front = FLASHCARD_FRONT
  const cx = front.x + front.w / 2
  const spin = (c) => 'rotate(' + c.tilt + ' ' + (c.x + c.w / 2) + ' ' + (c.y + c.h / 2) + ')'
  return (
    <svg
      width={size} height={size} viewBox={'0 0 ' + FLASHCARD_BOX + ' ' + FLASHCARD_BOX}
      fill="none" aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      {FLASHCARD_SHEETS.map(c => (
        <g key={c.x} transform={spin(c)}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} fill={ON_HERO[c.face]} />
          {/* A sheet has an edge; glow does not. */}
          <rect
            x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r}
            fill="none" stroke={ON_HERO.planeShade} strokeWidth="0.8"
          />
          {c.lit && <rect x={c.x} y={c.y} width={c.w} height="2.6" rx="1.3" fill={ON_HERO[c.lit]} />}
        </g>
      ))}

      <g transform={spin(front)}>
        {/* What the front card casts on the sheets behind it — the card-to-card
            shadow, and the reason the three read as a stack rather than a plan
            view of three rectangles. */}
        <rect
          x={front.x + 4} y={front.y + 5} width={front.w} height={front.h} rx={front.r}
          fill={ON_HERO.planeShade} filter={'url(#' + blurId + ')'}
        />
        <rect x={front.x} y={front.y} width={front.w} height={front.h} rx={front.r} fill={FLASHCARD_INK.paper} />
        <rect
          x={front.x} y={front.y} width={front.w} height={front.h} rx={front.r}
          fill="none" stroke={FLASHCARD_INK.edge} strokeWidth="0.7"
        />
        <rect x={front.x + 1} y={front.y + 1} width={front.w - 2} height="2.4" rx="1.2" fill="#fff" />
        <text
          x={cx} y={front.y + 37} textAnchor="middle" fontFamily={langFont}
          fontSize="20" fontWeight="600" fill={FLASHCARD_INK.word}
        >
          {word}
        </text>
        {reading && (
          <text x={cx} y={front.y + 53} textAnchor="middle" fontSize="9" fontWeight="500" fill={FLASHCARD_INK.reading}>
            {reading}
          </text>
        )}
      </g>
    </svg>
  )
}

// ── The primary action ────────────────────────────────────────────────────
//
// Cream paper on the brand red — a vermilion button on a vermilion panel is a
// rumour — with the direction built INTO the control: the right end is a
// brand-red keycap set into the face, sharing the button's radius minus its own
// inset. An earlier round floated a circular chip in there and it read as a
// second button pasted inside the first.
//
// The press is `.hd-cta` in index.css, not an inline style: `:active` cannot be
// one, and the claim is specific — the object travels 1px AND settles into its
// own shadow. Both shadow states come from `heroCtaShadow`.
function HeroAction({ copy, onGo }) {
  return (
    <button
      type="button" onClick={onGo} className="hd-cta"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        width: '100%', height: HERO_CTA.height + 'px', marginTop: '18px',
        padding: HERO_CTA.inset + 'px ' + HERO_CTA.inset + 'px ' + HERO_CTA.inset + 'px 18px',
        border: 'none', borderRadius: HOME_RADIUS.control + 'px', cursor: 'pointer',
        background: FLASHCARD_INK.paper,
        '--hd-cta-rest': heroCtaShadow(),
        '--hd-cta-pressed': heroCtaShadow({ pressed: true }),
        color: 'var(--primary-pressed)',
        ...TYPE.label, fontSize: '16px',
      }}
    >
      {copy}
      <span aria-hidden="true" style={{
        alignSelf: 'stretch', width: HERO_CTA.arrowWidth + 'px', flexShrink: 0,
        borderRadius: HERO_CTA.arrowRadius + 'px',
        display: 'grid', placeItems: 'center',
        background: 'var(--primary-fill)', color: '#fff', fontSize: '17px',
        boxShadow: 'inset 0 1px 0 ' + ON_HERO.litEdge,
      }}>
        →
      </span>
    </button>
  )
}

// ── The panel ─────────────────────────────────────────────────────────────
//
// The count and its breakdown, the object, the action. The step's eyebrow stays
// OUTSIDE on the page: the sequence belongs to the page, the task belongs to the
// panel.
export function HeroCards({ step, ctx, onGo }) {
  const grainId = 'hh-g-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div
      data-hero-cards=""
      style={{
        position: 'relative', marginTop: '14px', padding: '20px 18px 18px',
        borderRadius: HOME_RADIUS.card + 'px', overflow: 'hidden',
        background: heroGround(ctx.accentHex, 'facet'),
        boxShadow: heroShadow(ctx.accentHex, false, 'facet'),
        color: '#fff',
      }}
    >
      {/* The light the panel faces, anchored outside its top-left corner. */}
      <span aria-hidden style={{
        position: 'absolute', left: '-30%', top: '-55%', width: '90%', height: '120%',
        pointerEvents: 'none', background: heroCornerLight(),
      }} />
      {/* The plane turning away, bottom-right. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', background: heroFarShade(),
      }} />
      {/* Material information, barely. Felt as paper, not seen as noise — and if
          a device ever notices it, HERO_GRAIN_OPACITY comes DOWN. */}
      <svg aria-hidden="true" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: HERO_GRAIN_OPACITY, pointerEvents: 'none',
      }}>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={'url(#' + grainId + ')'} />
      </svg>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* PROPORTIONAL figures, deliberately: tabular set Mona's "1" airy, and
              a hero count is display type rather than a column that has to align.
              Tabular stays where columns genuinely do — the step numerals. */}
          <div style={{ ...TYPE.display, lineHeight: 1 }}>{step.metric.value}</div>
          <div style={{ ...TYPE.titleSection, marginTop: '4px' }}>{step.metric.label}</div>
          {step.facts.length > 0 && (
            <div style={{ ...TYPE.caption, color: ON_HERO.body, marginTop: '8px' }}>
              {step.facts.join(' · ')}
            </div>
          )}
        </div>
        <FlashcardStack size={118} langFont={ctx.langFont} word={ctx.sampleWord} reading={ctx.sampleReading} />
      </div>

      {step.cta && <HeroAction copy={step.cta} onGo={onGo} />}
    </div>
  )
}

