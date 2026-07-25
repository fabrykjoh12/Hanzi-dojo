import { useState } from 'react'
import { ChevronsLeft, ChevronsRight, Sun, Moon } from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import { useTheme } from './ThemeContext'
import { languageTheme, ink } from './languageTheme'
import { PRIMARY_NAV, BOTTOM_NAV, ADMIN_NAV } from './navConfig'
import { BRAND_NAME, wordmarkStyle } from './brand'

const EXPANDED_WIDTH = 232
const COLLAPSED_WIDTH = 64

// Rows are a fixed height so the sliding ink bar can be positioned from an
// index alone — no measurement, no layout effect, no jump on first paint.
const ROW_HEIGHT = 40
const ROW_GAP = 4
const ROW_PITCH = ROW_HEIGHT + ROW_GAP

const MAIN_ITEMS = PRIMARY_NAV
const BOTTOM_ITEMS = BOTTOM_NAV

// The ink bar that slides between active rows. One element for the whole list,
// so moving between items reads as a single mark travelling rather than one
// highlight blinking off and another on.
function InkBar({ index, accentHex, collapsed }) {
  const visible = index >= 0
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: collapsed ? '2px' : '-6px', width: '3px',
        top: 0, height: `${ROW_HEIGHT - 14}px`, borderRadius: '0 3px 3px 0',
        background: accentHex,
        transform: `translateY(${(visible ? index : 0) * ROW_PITCH + 7}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
        pointerEvents: 'none',
      }}
    />
  )
}

function NavItem({ item, active, collapsed, accentHex, accentInk, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const isActive = active === item.key
  const danger = item.key === 'logout'
  const tint = danger ? '#DC2626' : accentHex
  const inkColor = danger ? '#DC2626' : accentInk
  const color = isActive ? inkColor : (hovered ? 'var(--text)' : 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
      className={'hd-nav-item hd-press' + (collapsed ? ' is-collapsed' : '')}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', height: `${ROW_HEIGHT}px`, border: 'none', textAlign: 'left',
        fontFamily: 'Inter, sans-serif',
        padding: collapsed ? '0' : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '11px',
        cursor: 'pointer',
        background: isActive
          ? `color-mix(in srgb, ${tint} 11%, var(--surface))`
          : (hovered ? 'var(--surface-2)' : 'transparent'),
        color,
        fontWeight: isActive ? 650 : 500,
        fontSize: '14px',
        userSelect: 'none',
      }}
    >
      <Icon size={19} strokeWidth={isActive ? 2.1 : 1.85} color={color} style={{ flexShrink: 0 }} />
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}

      {/* Tooltip shown on hover when collapsed */}
      {collapsed && hovered && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 12px)', top: '50%',
          transform: 'translateY(-50%)',
          background: '#27272A', color: '#fff',
          fontSize: '12px', fontWeight: 550,
          padding: '6px 10px', borderRadius: '8px',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
          animation: 'hd-pop-in 160ms cubic-bezier(0.22, 1, 0.36, 1) both',
          zIndex: 20,
        }}>
          {item.label}
        </span>
      )}
    </button>
  )
}

export default function Sidebar({ view, onNavigate, onLogout, isAdmin, language }) {
  const [collapsed, setCollapsed] = useState(false)
  const [logoHovered, setLogoHovered] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // The nav carries the active language's accent, so switching language visibly
  // changes the whole shell rather than just the content area.
  const accentHex = languageTheme(language).accentHex
  const accentInk = ink(accentHex)

  const bottomItems = isAdmin ? [ADMIN_NAV, ...BOTTOM_ITEMS] : BOTTOM_ITEMS
  const mainIndex = MAIN_ITEMS.findIndex(i => i.key === view)
  const bottomIndex = bottomItems.findIndex(i => i.key === view)

  return (
    <div style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: 'var(--surface-glass)', borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column',
      padding: '22px 16px',
      overflow: 'hidden',
      transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    }}>
      {/* Header: logo + wordmark + collapse toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', padding: collapsed ? '4px 0 22px' : '4px 6px 22px',
      }}>
        <div
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}
        >
          <img
            src={logo}
            alt={BRAND_NAME + ' logo'}
            style={{
              width: collapsed ? '54px' : '42px', height: collapsed ? '54px' : '42px',
              objectFit: 'contain', flexShrink: 0,
              transform: logoHovered ? 'rotate(-7deg) scale(1.05)' : 'none',
              transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1), width 240ms ease, height 240ms ease',
            }}
          />
          {!collapsed && (
            <span style={{ ...wordmarkStyle('18px'), overflow: 'hidden' }}>
              {BRAND_NAME}
            </span>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="hd-press"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px', borderRadius: '8px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <ChevronsLeft size={18} strokeWidth={1.85} color="var(--text-muted)" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="hd-press"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          <ChevronsRight size={18} strokeWidth={1.85} color="var(--text-muted)" />
        </button>
      )}

      {/* Main navigation */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
        <InkBar index={mainIndex} accentHex={accentInk} collapsed={collapsed} />
        {MAIN_ITEMS.map(item => (
          <NavItem key={item.key} item={item} active={view} collapsed={collapsed} accentHex={accentHex} accentInk={accentInk} onClick={() => onNavigate(item.key)} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <ThemeToggle theme={theme} collapsed={collapsed} onToggle={toggleTheme} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '12px 6px' }} />

      {/* Bottom section */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
        <InkBar index={bottomIndex} accentHex={accentInk} collapsed={collapsed} />
        {bottomItems.map(item => (
          <NavItem
            key={item.key}
            item={item}
            active={view}
            collapsed={collapsed}
            accentHex={accentHex}
            accentInk={accentInk}
            onClick={() => (item.key === 'logout' ? onLogout() : onNavigate(item.key))}
          />
        ))}
      </div>
    </div>
  )
}

// Light/dark switch. The two icons cross-fade and counter-rotate so the flip
// feels like one object turning rather than two icons swapping.
function ThemeToggle({ theme, collapsed, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-press"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', height: `${ROW_HEIGHT}px`, border: 'none',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        textAlign: 'left', fontFamily: 'Inter, sans-serif',
        padding: collapsed ? '0' : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '11px', cursor: 'pointer',
        color: hovered ? 'var(--text)' : 'var(--text-muted)',
        fontSize: '14px', fontWeight: 500, userSelect: 'none',
      }}
    >
      <span style={{ position: 'relative', width: '19px', height: '19px', flexShrink: 0 }}>
        <Sun
          size={19} strokeWidth={1.85} color="currentColor"
          style={{ position: 'absolute', inset: 0, opacity: dark ? 1 : 0, transform: dark ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'opacity 240ms ease, transform 380ms cubic-bezier(0.22,1,0.36,1)' }}
        />
        <Moon
          size={19} strokeWidth={1.85} color="currentColor"
          style={{ position: 'absolute', inset: 0, opacity: dark ? 0 : 1, transform: dark ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'opacity 240ms ease, transform 380ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </span>
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
