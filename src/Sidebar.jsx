import { useState } from 'react'
import {
  Home, Layers, GraduationCap, PenLine, BookOpen, Play,
  User, Settings, Globe, LogOut, ChevronsLeft, ChevronsRight, Sun, Moon,
} from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import { useTheme } from './ThemeContext'

// Neutral sage green used for active-state pill (see CLAUDE.md redesign spec)
const SAGE_BG = '#E7EDE4'
const SAGE_TEXT = '#4F6047'

const EXPANDED_WIDTH = 232
const COLLAPSED_WIDTH = 64

const MAIN_ITEMS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Flashcards', icon: Layers },
  { key: 'test', label: 'Test', icon: GraduationCap },
  { key: 'writing', label: 'Writing', icon: PenLine },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'youtube', label: 'YouTube', icon: Play },
]

const BOTTOM_ITEMS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'logout', label: 'Log out', icon: LogOut },
]

function NavItem({ item, active, collapsed, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const isActive = active === item.key
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: collapsed ? '10px' : '10px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '11px',
        cursor: 'pointer',
        background: isActive ? SAGE_BG : (hovered ? 'var(--surface-2)' : 'transparent'),
        color: isActive ? SAGE_TEXT : 'var(--text-muted)',
        fontWeight: isActive ? 600 : 500,
        fontSize: '14px',
        transition: 'background 140ms ease, color 140ms ease',
        userSelect: 'none',
      }}
    >
      <Icon size={19} strokeWidth={1.85} color={isActive ? SAGE_TEXT : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
      {!collapsed && <span>{item.label}</span>}

      {/* Tooltip shown on hover when collapsed */}
      {collapsed && hovered && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 10px)', top: '50%',
          transform: 'translateY(-50%)',
          background: '#27272A', color: '#fff',
          fontSize: '12px', fontWeight: 500,
          padding: '6px 10px', borderRadius: '8px',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 20,
        }}>
          {item.label}
        </span>
      )}
    </div>
  )
}

export default function Sidebar({ view, onNavigate, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <div style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: 'var(--surface-glass)', borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column',
      padding: '22px 16px',
      overflow: 'hidden',
      transition: 'width 200ms ease',
    }}>
      {/* Header: logo + wordmark + collapse toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', padding: collapsed ? '4px 0 22px' : '4px 8px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <img
            src={logo}
            alt="Hanzi-dojo logo"
            style={{ width: collapsed ? '62px' : '44px', height: collapsed ? '62px' : '44px', objectFit: 'contain', flexShrink: 0 }}
          />
          {!collapsed && (
            <span style={{
              fontSize: '17px', fontWeight: 700, color: 'var(--text)',
              letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              Hanzi-dojo
            </span>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {MAIN_ITEMS.map(item => (
          <NavItem key={item.key} item={item} active={view} collapsed={collapsed} onClick={() => onNavigate(item.key)} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <div
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: collapsed ? '10px' : '10px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: '11px', cursor: 'pointer', color: 'var(--text-muted)',
          fontSize: '14px', fontWeight: 500, userSelect: 'none',
        }}
      >
        {theme === 'dark'
          ? <Sun size={19} strokeWidth={1.85} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          : <Moon size={19} strokeWidth={1.85} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
        {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '12px 8px' }} />

      {/* Bottom section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {BOTTOM_ITEMS.map(item => (
          <NavItem
            key={item.key}
            item={item}
            active={view}
            collapsed={collapsed}
            onClick={() => (item.key === 'logout' ? onLogout() : onNavigate(item.key))}
          />
        ))}
      </div>
    </div>
  )
}
