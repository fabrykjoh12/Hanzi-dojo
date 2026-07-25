import { useEffect, useState } from 'react'
import InkWash from './InkWash'
import { heroGround, heroShadow, flatPanel, ON_HERO, MICRO } from './designTokens'

// ── The app's two panel types ────────────────────────────────────────────
// A screen gets ONE HeroPanel — the thing it is actually about, on a deep
// accent ground with contained atmosphere — and any number of flat Panels
// around it. That contrast is the whole design language; adding atmosphere to
// the supporting panels is what would flatten it back out.

// The lit block. Optional watermark character, contained ink-wash, and an
// accent-tinted shadow. Tappable when `onClick` is given.
// How many HeroPanels are currently mounted. A counter rather than a boolean
// because two screens can overlap for a frame during a route change, and the
// outgoing one must not clear the flag the incoming one just set.
let litCount = 0

export function HeroPanel({
  accentHex, seed = 'a', watermark, watermarkFont,
  onClick, children, padding, compact = false, style = {},
}) {
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
      className={interactive ? 'hd-press hd-rise' : 'hd-rise'}
      style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: '22px',
        padding: padding || (compact ? '20px 22px' : '26px 28px'),
        background: heroGround(accentHex),
        boxShadow: heroShadow(accentHex, hovered && interactive),
        cursor: interactive ? 'pointer' : 'default',
        color: '#fff',
        ...style,
      }}
      data-hovered={hovered ? '' : undefined}
    >
      {/* Rule 1: the atmosphere lives here and nowhere else on the screen. */}
      <InkWash seed={seed} opacity={0.09} />

      {watermark && (
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

// The call-to-action that sits inside a HeroPanel. Inverts to solid white on
// hover so the lit block has one unmistakable next step.
export function HeroAction({ label, hovered, icon: Icon, accentHex }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      marginTop: '18px', padding: '10px 16px', borderRadius: '11px',
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
export function Panel({ children, padding, radius, style = {}, className = '' }) {
  return (
    <div className={('hd-rise ' + className).trim()} style={{ ...flatPanel({ radius, padding }), ...style }}>
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
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.35 }}>
        {label}
      </div>
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
