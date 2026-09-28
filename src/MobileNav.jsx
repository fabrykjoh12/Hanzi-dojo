import { useEffect, useRef } from 'react'
import { HomeGlyph, PracticeGlyph, StoriesGlyph } from './HomeV2NavGlyphs'
import { DOCK_HEIGHT, dockBottom } from './bottomBar'
import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// Stable, labelled destinations: Stories — Home — Practice. Text remains
// visible at every width; selection never changes a tab's footprint.
const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)'
const GLYPHS = { stories: StoriesGlyph, home: HomeGlyph, practice: PracticeGlyph }

export default function MobileNav({ view, onNavigate, language, hidden = false }) {
  const dockRef = useRef(null)
  useEffect(() => {
    const node = dockRef.current
    if (!node) return undefined
    const measure = () => document.documentElement.style.setProperty('--hd-dock-height', node.getBoundingClientRect().height + 'px')
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(node)
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty('--hd-dock-height') }
  }, [])
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex

  return (
    <nav
      ref={dockRef}
      aria-label="Primary"
      data-tour="nav"
      data-nav-hidden={hidden ? '' : undefined}
      // Hidden is a STATE, not an unmount: the dock slides down and fades as the
      // session or the reader takes over, and slides back when it releases. An
      // unmounted bar would pop.
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        position: 'fixed', left: '16px', right: '16px', bottom: dockBottom(), zIndex: 30,
        minHeight: DOCK_HEIGHT + 'px', maxWidth: '440px', margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: '2px', padding: '6px',
        background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '18px',
        boxShadow: '0 10px 28px -14px rgba(24,24,27,0.30), 0 1px 2px rgba(24,24,27,0.05), inset 0 1px 0 var(--hairline)',
        fontFamily: UI_FONT,
        transform: hidden ? 'translateY(' + (DOCK_HEIGHT + 24) + 'px)' : 'none',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        visibility: hidden ? 'hidden' : 'visible',
        transition: 'transform ' + HOME_MOTION.nav + 'ms ' + EASE
          + ', opacity ' + (hidden ? 140 : 200) + 'ms ease'
          + ', visibility 0s linear ' + (hidden ? HOME_MOTION.nav : 0) + 'ms',
      }}
    >
      {MOBILE_PRIMARY.map(item => {
        const Glyph = GLYPHS[item.key]
        const active = activeKey === item.key
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => onNavigate(item.key)}
            className="hd-dock-tab"
            style={{
              flex: '1 1 0',
              minWidth: 0, minHeight: '46px', padding: '5px 3px', border: 0, borderRadius: '12px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
              background: active ? 'color-mix(in srgb, ' + accent + ' 9%, var(--surface))' : 'transparent',
              color: active ? ink(accent) : 'var(--text-muted)',
              fontFamily: UI_FONT, cursor: 'pointer',
              transition: 'background ' + HOME_MOTION.nav + 'ms ease'
                + ', color 200ms ease',
            }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
              <Glyph size={22} active={false} color="currentColor" />
            </span>
            <span
              style={{
                fontSize: '11px', lineHeight: 1.15, fontWeight: active ? 750 : 600,
                textDecoration: active ? 'underline' : 'none', textUnderlineOffset: '3px',
                overflowWrap: 'anywhere',
              }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
