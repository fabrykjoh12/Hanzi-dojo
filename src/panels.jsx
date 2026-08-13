import { useEffect, useState } from 'react'
// Explicit extension: this directory also has inkWash.js (lowercase, pure
// helpers) — an extensionless specifier is ambiguous on a case-insensitive
// filesystem (Windows/macOS) and some bundlers there resolve it to the wrong
// file. Linux (production) is case-sensitive and was never affected.
import InkWash from './InkWash.jsx'
import { heroGround, heroShadow, flatPanel, ON_HERO, MICRO } from './designTokens'
import { TYPE } from './typeScale'
import { RADIUS } from './shape'

// ── The app's two panel types ────────────────────────────────────────────
// A screen gets ONE HeroPanel — the thing it is actually about, on a deep
// accent ground with contained atmosphere — and any number of flat Panels
// around it. That contrast is the whole design language; adding atmosphere to
// the supporting panels is what would flatten it back out.

// How many HeroPanels are currently mounted. A counter rather than a boolean
// because two screens can overlap for a frame during a route change, and the
// outgoing one must not clear the flag the incoming one just set.
let litCount = 0

// The lit block. Optional watermark character, contained ink-wash, and an
// accent-tinted shadow. Tappable when `onClick` is given; children may be a
// function receiving { hovered } so a CTA inside shares the panel's hover.
// `material` is P14-5's opt-in, and it is opt-in on purpose.
//
// Four screens share this panel and three of them — Stories, Practice, Profile —
// are frozen. Changing the default would have restyled all three as a side effect
// of redesigning Home, which is exactly what "P14-5 is Home only" rules out. So
// `wash` is what they keep (seeded ink ridgelines plus a watermark character,
// unchanged to the byte) and `facet` is the new material: a lit corner, no
// ridgelines, and a dimensional object instead of the watermark.
//
// When a later phase moves those screens over, the default flips and this prop
// goes away. It is a migration seam, not a feature.
export function HeroPanel({
  accentHex, seed = 'a', watermark, watermarkFont, object, material = 'wash',
  onClick, children, padding, compact = false, style = {}, dataTour,
}) {
  const facet = material === 'facet'
  const [hovered, setHovered] = useState(false)
  const interactive = typeof onClick === 'function'

  // Rule 1 again, at the page level: while a lit block is on screen the
  // page-wide background wash steps back, so the atmosphere reads as contained
  // rather than smeared behind everything.
  useEffect(() => {
    litCount += 1
    document.documentElement.setAttribute('data-lit-hero', '')
    return () => {
      litCount -= 1
      if (litCount <= 0) document.documentElement.removeAttribute('data-lit-hero')
    }
  }, [])

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive
        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }
        : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={interactive ? 'hd-press' : undefined}
      style={{
        position: 'relative', overflow: 'hidden',
        // `hero` (26), not the nearest neighbour to the 22 this was. shape.js
        // names 26 for "the hero panel, the study card, modal cards" — this is
        // the object that name was written for, and it now matches the study
        // card's corner exactly.
        borderRadius: '26px',
        padding: padding || (compact ? '20px 22px' : '26px 28px'),
        background: heroGround(accentHex, material),
        boxShadow: heroShadow(accentHex, hovered && interactive, material),
        cursor: interactive ? 'pointer' : 'default',
        color: '#fff',
        ...style,
      }}
      data-hovered={hovered ? '' : undefined}
      data-tour={dataTour}
    >
      {/* Rule 1: the atmosphere lives here and nowhere else on the screen. */}
      {!facet && <InkWash seed={seed} opacity={0.09} />}

      {/* The lit facet (P14-5). A soft pool of light anchored OUTSIDE the top-left
          corner, so the panel reads as one flat plane facing a source rather than a
          rectangle filled with a gradient. It replaces the ink ridgelines: three
          seeded ridges at 9% white were atmosphere for its own sake, and on a phone
          they read as banding across the one object the screen is about. Atmosphere
          still exists — it is the page's background image, which this panel already
          steps down. */}
      {facet && (
        <div aria-hidden style={{
          position: 'absolute', top: '-42%', left: '-18%', width: '88%', height: '124%',
          background: 'radial-gradient(closest-side, ' + ON_HERO.facet + ', transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* The dimensional identity object, cropped by the panel's own corner so it
          reads as sitting ON the plate rather than pasted into it (heroObjects.jsx).
          It takes the place of the old watermark character, which was a 112px glyph
          at 9% white — neither type nor illustration. */}
      {object && (
        <div aria-hidden style={{
          position: 'absolute', right: compact ? '-14px' : '-6px',
          bottom: compact ? '-18px' : '-12px', pointerEvents: 'none',
        }}>
          {object}
        </div>
      )}

      {/* Kept for the screens that still pass one. Home no longer does. */}
      {watermark && !object && (
        <span aria-hidden style={{
          position: 'absolute', right: compact ? '4px' : '10px',
          bottom: compact ? '-26px' : '-34px',
          fontFamily: watermarkFont, fontSize: compact ? '112px' : '146px',
          lineHeight: 0.8, fontWeight: 700, color: ON_HERO.watermark,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          {watermark}
        </span>
      )}

      <div style={{ position: 'relative' }}>
        {typeof children === 'function' ? children({ hovered }) : children}
      </div>
    </div>
  )
}

// The call-to-action that sits inside a HeroPanel.
//
// **On Home it is opaque paper (P14-5), not a translucent pill.** It was
// `rgba(255,255,255,0.14)` behind a 28% white border, inverting to solid white
// only on hover — which meant that on a phone, where there is no hover, the one
// action on Home was permanently in its weak state: a 14%-white ghost on a red
// ground. Measured in the hero lab, it was the single weakest element on the
// screen. Opaque white with the accent as its ink is the strongest button
// available on this ground, it needs no interaction to read, and it is the same
// shape as the shared `Button` (44px tall, `RADIUS.control`) rather than a
// bespoke 42px pill.
//
// Not the shared `Button` itself: that control's variants are all built to sit on
// a THEMED surface — `--primary-fill`, `--surface`, `--border` — and none of them
// is "paper on the brand". Inverting a Button onto an accent ground would mean a
// sixth variant that exists for one call site. The geometry is borrowed; the
// palette is the hero's.
//
// `material` is HeroPanel's migration seam again, and Stories and Practice are
// still on `glass`. The hover-only flaw above is just as true there, and it is
// still not this phase's to fix: P14-5 is Home. **The two materials must not
// drift into two components** — when those screens move, delete the glass branch
// rather than adding a third.
export function HeroAction({ label, hovered, icon: Icon, accentHex, material = 'glass' }) {
  const paper = material === 'paper'
  return (
    <span style={paper ? {
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      marginTop: '16px', height: '44px', padding: '0 18px',
      borderRadius: RADIUS.control + 'px',
      background: '#fff', color: accentHex,
      ...TYPE.label, fontWeight: 700,
      // A hairline of contact shadow: the button sits ON the plate.
      boxShadow: '0 1px 0 rgba(23,17,14,0.10)',
    } : {
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      marginTop: '18px', padding: '10px 16px', borderRadius: '12px',
      background: hovered ? '#fff' : 'rgba(255,255,255,0.14)',
      border: '1px solid rgba(255,255,255,0.28)',
      color: hovered ? accentHex : '#fff',
      fontSize: '13.5px', fontWeight: 700,
      transition: 'background 180ms ease, color 180ms ease',
    }}>
      {label}
      {Icon && (
        <Icon
          size={16} strokeWidth={2.4}
          style={{ transform: hovered ? 'translateX(3px)' : 'none', transition: 'transform 180ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      )}
    </span>
  )
}

// A flat supporting block. Deliberately plain — it is the quiet around the
// hero, and quiet is what makes the hero read.
export function Panel({ children, padding, radius, style = {}, className = '', dataTour }) {
  return (
    <div className={className || undefined} data-tour={dataTour} style={{ ...flatPanel({ radius, padding }), ...style }}>
      {children}
    </div>
  )
}

// A number and what it means. No button: the hero owns the screen's action,
// and extra buttons here would turn the page back into a menu.
export function Readout({ value, label, tone, first, compact = false }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: compact ? '14px 0 14px 14px' : '16px 0 16px 20px',
      borderLeft: first ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: compact ? '26px' : '30px', fontWeight: 700, lineHeight: 1,
        color: tone, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.35 }}>
        {label}
      </div>
    </div>
  )
}

// The page header every screen wears: the screen's name, and where you are, on
// one baseline.
//
// It exists because four screens had drifted into their own version — a 38px
// title under a floating tinted icon tile on Settings, a different one on Words,
// another on Profile — while Home and Stories had moved to this compact line.
// A title is not the thing a screen is about; the panel below it is. Sizing the
// title like a billboard just pushed that panel down the page.
export function PageHeader({ title, meta, style = {} }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: '12px', marginBottom: '16px', flexWrap: 'wrap', ...style,
    }}>
      <h1 style={{
        margin: 0, fontSize: '19px', fontWeight: 700,
        color: 'var(--text)', letterSpacing: '-0.02em',
      }}>
        {title}
      </h1>
      {meta && <Eyebrow>{meta}</Eyebrow>}
    </div>
  )
}

// The small-caps eyebrow, as a component so screens don't re-declare the style.
export function Eyebrow({ children, onHero = false, style = {} }) {
  return (
    <span style={{
      ...MICRO,
      color: onHero ? ON_HERO.eyebrow : 'var(--text-faint)',
      ...style,
    }}>
      {children}
    </span>
  )
}
