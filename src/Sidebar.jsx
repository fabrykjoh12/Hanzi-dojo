import { useState, useEffect } from 'react'
import {
  Home, Layers, GraduationCap, PenLine, BookOpen, Play,
  User, Settings, Globe, LogOut, ChevronsLeft, ChevronsRight,
  MoreHorizontal, X,
} from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import useIsMobile from './useIsMobile'

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

// Mobile bottom bar: four primary destinations plus a "More" sheet that holds
// the remaining items. Keys here are looked up in MAIN_ITEMS/BOTTOM_ITEMS.
const MOBILE_BAR_KEYS = ['home', 'study', 'stories', 'writing']
const MOBILE_MORE_KEYS = ['test', 'youtube', 'profile', 'settings', 'languages', 'logout']

const ALL_ITEMS = [...MAIN_ITEMS, ...BOTTOM_ITEMS]
const itemByKey = (key) => ALL_ITEMS.find(i => i.key === key)

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

// ── Mobile bottom navigation bar ───────────────────────────────────────────
function MobileBarItem({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 2px', color: active ? SAGE_TEXT : '#71717A',
        fontWeight: active ? 600 : 500, fontSize: '10.5px',
      }}
    >
      <Icon size={22} strokeWidth={1.85} color={active ? SAGE_TEXT : '#71717A'} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
        {item.label}
      </span>
    </button>
  )
}

function MobileNav({ view, onNavigate, onLogout }) {
  const [moreOpen, setMoreOpen] = useState(false)

  // Lock body scroll while the More sheet is open.
  useEffect(() => {
    if (!moreOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [moreOpen])

  const handle = (key) => {
    setMoreOpen(false)
    if (key === 'logout') onLogout()
    else onNavigate(key)
  }

  const moreActive = MOBILE_MORE_KEYS.includes(view)

  return (
    <>
      {/* Slide-up "More" sheet */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(24,24,27,0.32)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '18px 18px 0 0',
              padding: '10px 14px calc(14px + env(safe-area-inset-bottom))',
              boxShadow: '0 -8px 30px rgba(0,0,0,0.16)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px 10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#18181B' }}>More</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <X size={20} strokeWidth={1.85} color="#71717A" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {MOBILE_MORE_KEYS.map(key => {
                const item = itemByKey(key)
                const Icon = item.icon
                const isActive = view === key
                return (
                  <button
                    key={key}
                    onClick={() => handle(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '13px',
                      padding: '13px 12px', borderRadius: '12px',
                      background: isActive ? SAGE_BG : 'transparent',
                      border: 'none', cursor: 'pointer', width: '100%',
                      color: isActive ? SAGE_TEXT : '#3F3F46',
                      fontWeight: isActive ? 600 : 500, fontSize: '15px',
                    }}
                  >
                    <Icon size={20} strokeWidth={1.85} color={isActive ? SAGE_TEXT : '#71717A'} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        display: 'flex', alignItems: 'stretch',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        borderTop: '1px solid #E7E5E4',
        padding: '4px 4px calc(4px + env(safe-area-inset-bottom))',
      }}>
        {MOBILE_BAR_KEYS.map(key => {
          const item = itemByKey(key)
          return (
            <MobileBarItem key={key} item={item} active={view === key} onClick={() => handle(key)} />
          )
        })}
        <MobileBarItem
          item={{ key: 'more', label: 'More', icon: MoreHorizontal }}
          active={moreActive || moreOpen}
          onClick={() => setMoreOpen(o => !o)}
        />
      </nav>
    </>
  )
}

export default function Sidebar({ view, onNavigate, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useIsMobile()

  if (isMobile) {
    return <MobileNav view={view} onNavigate={onNavigate} onLogout={onLogout} />
  }

  return (
    <div style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: 'rgba(255, 255, 255, 0.85)', borderRight: '1px solid #E7E5E4',
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
