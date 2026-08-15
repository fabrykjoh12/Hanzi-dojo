import { useEffect, useState } from 'react'
import { HomeGlyph, PracticeGlyph, StoriesGlyph } from './HomeV2NavGlyphs'
import { HOME_MOTION } from './homePresentation'
import { languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const GLYPHS = { stories: StoriesGlyph, practice: PracticeGlyph }

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = event => setReduced(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function Tray() {
  return (
    <svg aria-hidden="true" viewBox="0 0 366 76" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', filter: 'drop-shadow(0 5px 9px rgba(52,37,31,0.08))', pointerEvents: 'none' }}>
      <path d="M18 14H132C142 14 147 10 151 5C155 0 160 -2 166 -2H200C206 -2 211 0 215 5C219 10 224 14 234 14H348C358 14 364 20 364 30V58C364 68 358 74 348 74H18C8 74 2 68 2 58V30C2 20 8 14 18 14Z" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
      <path d="M19 15H131C142 15 148 11 152 6C156 1 161 -1 167 -1H199C205 -1 210 1 214 6C218 11 224 15 235 15H347" fill="none" stroke="var(--hairline)" strokeWidth="1" />
    </svg>
  )
}

function SideTab({ item, active, accent, motionMs, onNavigate }) {
  const Glyph = GLYPHS[item.key]
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.key)} className="hd-press" style={{
      minWidth: 0, minHeight: '60px', marginTop: '12px', padding: '8px 0 5px', border: 0, background: 'transparent',
      color: active ? accent : 'var(--text-muted)', fontFamily: UI_FONT,
      '--primary-bright': active ? '#E66A52' : 'var(--text-faint)', '--primary-fill': active ? accent : 'var(--text-muted)',
      '--primary-pressed': active ? '#8F2D1D' : 'var(--text-muted)', '--plum': active ? accent : 'var(--text-muted)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', transition: 'color ' + motionMs + 'ms ' + EASE,
    }}>
      <span aria-hidden="true" style={{ width: '34px', height: '27px', display: 'grid', placeItems: 'center', transform: active ? 'translateY(-1px)' : 'none', opacity: active ? 1 : 0.82, filter: active ? 'saturate(1)' : 'saturate(0.55)', transition: 'transform ' + motionMs + 'ms ' + EASE + ', opacity ' + motionMs + 'ms ' + EASE }}>
        <Glyph size={item.key === 'stories' ? 25 : 24} active={active} color="currentColor" />
      </span>
      <span style={{ height: '12px', fontSize: '11.5px', lineHeight: '12px', fontWeight: active ? 760 : 610 }}>{item.label}</span>
    </button>
  )
}

function HomeTab({ active, accent, motionMs, reduced, onNavigate }) {
  const [pressed, setPressed] = useState(false)
  const lift = active && !reduced ? -2 : 0
  return (
    <button type="button" aria-current={active ? 'page' : undefined} aria-label="Home" onClick={() => onNavigate('home')}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{ minWidth: 0, height: '76px', padding: 0, border: 0, background: 'transparent', fontFamily: UI_FONT, position: 'relative' }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: '40px', left: '50%', width: '66px', height: '16px', marginLeft: '-33px', borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(57,31,23,0.2) 0%, rgba(57,31,23,0.07) 46%, transparent 75%)', filter: 'blur(1.5px)', opacity: active ? 0.78 : 0.12, pointerEvents: 'none' }} />
      <span aria-hidden="true" style={{
        position: 'absolute', top: 0, left: '50%', width: '52px', height: '54px', marginLeft: '-26px', borderRadius: '16px 16px 13px 13px', overflow: 'hidden',
        transform: 'translateY(' + (pressed ? lift + 1 : lift) + 'px)',
        background: active ? 'linear-gradient(145deg, #C84E36 0%, ' + accent + ' 48%, #92291C 100%)' : 'transparent',
        boxShadow: pressed ? '0 1px 2px rgba(71,25,18,0.15), inset 0 1px 0 var(--hairline)' : active ? '0 2px 5px -3px rgba(84,24,15,0.46), inset 0 1px 0 rgba(255,255,255,0.28)' : 'none',
        transition: 'transform ' + (pressed ? 120 : motionMs) + 'ms ' + EASE + ', box-shadow ' + (pressed ? 120 : motionMs) + 'ms ' + EASE,
      }}>
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', '--primary-bright': active ? '#FFF9EE' : 'var(--text-faint)', '--primary-fill': active ? '#F4E4C8' : 'var(--text-muted)', '--primary-pressed': active ? '#D6B991' : 'var(--text-muted)' }}>
          <HomeGlyph size={32} active color="currentColor" />
        </span>
      </span>
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: '5px', height: '12px', fontSize: '11.5px', lineHeight: '12px', fontWeight: active ? 800 : 660, color: active ? accent : 'var(--text-muted)' }}>Home</span>
    </button>
  )
}

export default function MobileNav({ view, onNavigate, language }) {
  const reduced = useReducedMotion()
  const motionMs = reduced ? HOME_MOTION.reduced : HOME_MOTION.nav
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  return (
    <nav aria-label="Primary" className="hd-mobile-nav-motion" style={{ position: 'fixed', left: '12px', right: '12px', bottom: 'max(6px, env(safe-area-inset-bottom))', zIndex: 30, height: '76px', maxWidth: '366px', margin: '0 auto', fontFamily: UI_FONT }}>
      <Tray />
      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateColumns: '1fr 94px 1fr' }}>
        <SideTab item={MOBILE_PRIMARY[0]} active={activeKey === 'stories'} accent={accent} motionMs={motionMs} onNavigate={onNavigate} />
        <HomeTab active={activeKey === 'home'} accent={accent} motionMs={motionMs} reduced={reduced} onNavigate={onNavigate} />
        <SideTab item={MOBILE_PRIMARY[2]} active={activeKey === 'practice'} accent={accent} motionMs={motionMs} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}
