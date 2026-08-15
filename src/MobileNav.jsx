import { languageTheme, ink } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

// A standard bottom tab bar: full width, hairline top edge, translucent
// surface, three tabs. Navigation should be furniture — obvious, instant and
// visually silent — so there is no tray, no cutout, no raised centre tab.
// The active tab is the language accent as ink; everything else is muted.
function Tab({ item, active, accent, onNavigate }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(item.key)}
      className={'hd-press hd-tab' + (active ? ' is-active' : '')}
      style={{
        minWidth: 0, border: 0, background: 'transparent', padding: '7px 0 6px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '3px', fontFamily: UI_FONT, cursor: 'pointer',
        color: active ? ink(accent) : 'var(--text-muted)',
        transition: 'color 160ms ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden="true" className="hd-tab-icon" style={{ display: 'grid', placeItems: 'center', height: '25px' }}>
        <Icon size={23} strokeWidth={active ? 2.1 : 1.8} />
      </span>
      <span style={{ fontSize: '10.5px', lineHeight: 1, fontWeight: active ? 700 : 600, letterSpacing: '0.01em' }}>
        {item.label}
      </span>
    </button>
  )
}

export default function MobileNav({ view, onNavigate, language }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'var(--surface-glass)',
        WebkitBackdropFilter: 'saturate(1.5) blur(16px)',
        backdropFilter: 'saturate(1.5) blur(16px)',
        borderTop: '1px solid var(--border)',
        fontFamily: UI_FONT,
      }}
    >
      <div style={{ height: '56px', maxWidth: '520px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {MOBILE_PRIMARY.map(item => (
          <Tab
            key={item.key}
            item={item}
            active={activeKey === item.key}
            accent={accent}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  )
}
