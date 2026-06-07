import { useState } from 'react'
import {
  Home, Layers, GraduationCap, PenLine, BookOpen, Play,
  User, Settings, Globe, LogOut, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
// Placeholder logo lives at src/assets/logo.svg. Drop the real logo at
// src/assets/logo.png (or .svg) and update this import to use it.
import logo from './assets/logo.svg'

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
        background: isActive ? SAGE_BG : (hovered ? '#F4F4F2' : 'transparent'),
        color: isActive ? SAGE_TEXT : '#52525B',
        fontWeight: isActive ? 600 : 500,
        fontSize: '14px',
        transition: 'background 140ms ease, color 140ms ease',
        userSelect: 'none',
      }}
    >
      <Icon size={19} strokeWidth={1.85} color={isActive ? SAGE_TEXT : '#71717A'} style={{ flexShrink: 0 }} />
      {!collapsed && <span>{item.label}</span>}

      {/* Tooltip shown on hover when collapsed */}
      {collapsed && hovered && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 10px)', top: '50%',
          transform: 'translateY(-50%)',
          background: '#18181B', color: '#fff',
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

  return (
    <div style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: '#FFFFFF', borderRight: '1px solid #E7E5E4',
      display: 'flex', flexDirection: 'column',
      padding: '22px 16px',
      overflow: 'hidden',
      transition: 'width 200ms ease',
    }}>
      {/* Header: logo + wordmark + collapse toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', padding: '4px 8px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {/* Placeholder until logo.png is dropped in at src/assets/logo.png */}
          <img
            src={logo}
            alt="Hanzi-dojo logo"
            style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }}
          />
          {!collapsed && (
            <span style={{
              fontSize: '17px', fontWeight: 700, color: '#18181B',
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
            <ChevronsLeft size={18} strokeWidth={1.85} color="#71717A" />
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
          <ChevronsRight size={18} strokeWidth={1.85} color="#71717A" />
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

      {/* Divider */}
      <div style={{ height: '1px', background: '#E7E5E4', margin: '12px 8px' }} />

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
