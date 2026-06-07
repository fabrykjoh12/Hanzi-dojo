import { useState } from 'react'
import {
  Home, Layers, GraduationCap, PenLine, BookOpen, Play,
  User, Settings, Globe, LogOut,
} from 'lucide-react'
// Placeholder logo lives at src/assets/logo.svg. Drop the real logo at
// src/assets/logo.png (or .svg) and update this import to use it.
import logo from './assets/logo.svg'

// Neutral sage green used for active-state pill (see CLAUDE.md redesign spec)
const SAGE_BG = '#E7EDE4'
const SAGE_TEXT = '#4F6047'

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

function NavItem({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const isActive = active === item.key
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderRadius: '11px',
        cursor: 'pointer',
        background: isActive ? SAGE_BG : (hovered ? '#F4F4F2' : 'transparent'),
        color: isActive ? SAGE_TEXT : '#52525B',
        fontWeight: isActive ? 600 : 500,
        fontSize: '14px',
        transition: 'background 140ms ease, color 140ms ease',
        userSelect: 'none',
      }}
    >
      <Icon size={19} strokeWidth={1.85} color={isActive ? SAGE_TEXT : '#71717A'} />
      <span>{item.label}</span>
    </div>
  )
}

export default function Sidebar({ view, onNavigate, onLogout }) {
  return (
    <div style={{
      width: '232px', flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: '#FFFFFF', borderRight: '1px solid #E7E5E4',
      display: 'flex', flexDirection: 'column',
      padding: '22px 16px',
    }}>
      {/* Header: logo + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px 22px' }}>
        {/* Placeholder until logo.png is dropped in at src/assets/logo.png */}
        <img
          src={logo}
          alt="Hanzi-dojo logo"
          style={{ width: '32px', height: '32px', objectFit: 'contain' }}
        />
        <span style={{ fontSize: '17px', fontWeight: 700, color: '#18181B', letterSpacing: '0.2px' }}>
          Hanzi-dojo
        </span>
      </div>

      {/* Main navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {MAIN_ITEMS.map(item => (
          <NavItem key={item.key} item={item} active={view} onClick={() => onNavigate(item.key)} />
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
            onClick={() => (item.key === 'logout' ? onLogout() : onNavigate(item.key))}
          />
        ))}
      </div>
    </div>
  )
}
