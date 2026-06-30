import { useState } from 'react'
import {
  Home, Layers, BookOpen, PenLine, MoreHorizontal,
  GraduationCap, Play, Headphones, User, Globe, Settings, LogOut, X,
} from 'lucide-react'

const SAGE_BG = '#E7EDE4'
const SAGE_TEXT = '#4F6047'
const MUTED = 'var(--text-muted)'

// Primary tabs live directly in the bottom bar. Everything else goes behind the
// "More" sheet so the bar stays uncluttered on phones. (Sidebar.jsx keeps the
// full flat list for desktop.)
const PRIMARY = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Cards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'writing', label: 'Writing', icon: PenLine },
]

const MORE_ITEMS = [
  { key: 'test', label: 'Test', icon: GraduationCap },
  { key: 'listen', label: 'Listening', icon: Headphones },
  { key: 'youtube', label: 'YouTube', icon: Play },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'logout', label: 'Log out', icon: LogOut },
]

const MORE_KEYS = MORE_ITEMS.map(i => i.key)

function Tab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '3px', padding: '7px 0', minWidth: 0,
      }}
    >
      <Icon size={22} strokeWidth={active ? 2.1 : 1.85} color={active ? SAGE_TEXT : MUTED} />
      <span style={{
        fontSize: '10.5px', fontWeight: active ? 600 : 500,
        letterSpacing: '0.1px', color: active ? SAGE_TEXT : MUTED,
      }}>
        {label}
      </span>
    </button>
  )
}

export default function MobileNav({ view, onNavigate, onLogout }) {
  const [moreOpen, setMoreOpen] = useState(false)

  const go = (key) => {
    setMoreOpen(false)
    if (key === 'logout') onLogout()
    else onNavigate(key)
  }

  const moreActive = MORE_KEYS.indexOf(view) !== -1

  return (
    <>
      {/* "More" bottom sheet */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.32)', zIndex: 40 }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
            background: 'var(--surface)',
            borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
            padding: '10px 14px calc(16px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px 8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close menu"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                <X size={20} strokeWidth={1.9} color={MUTED} />
              </button>
            </div>
            {MORE_ITEMS.map(item => {
              const Icon = item.icon
              const active = view === item.key
              const danger = item.key === 'logout'
              return (
                <button
                  key={item.key}
                  onClick={() => go(item.key)}
                  style={{
                    width: '100%', background: active ? SAGE_BG : 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '13px 12px', borderRadius: '11px',
                    color: danger ? '#DC2626' : (active ? SAGE_TEXT : 'var(--text-muted)'),
                    fontSize: '15px', fontWeight: active ? 600 : 500, textAlign: 'left',
                  }}
                >
                  <Icon size={20} strokeWidth={1.85} color={danger ? '#DC2626' : (active ? SAGE_TEXT : MUTED)} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Fixed bottom navigation bar */}
      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        display: 'flex', alignItems: 'stretch',
        background: 'var(--surface-glass)', backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {PRIMARY.map(item => (
          <Tab key={item.key} icon={item.icon} label={item.label} active={view === item.key} onClick={() => go(item.key)} />
        ))}
        <Tab icon={MoreHorizontal} label="More" active={moreActive} onClick={() => setMoreOpen(o => !o)} />
      </nav>
    </>
  )
}
