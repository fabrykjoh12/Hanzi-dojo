import { useState } from 'react'
import { ChevronsLeft, ChevronsRight, Sun, Moon, Settings, LogOut, ChevronRight } from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import { useTheme } from './ThemeContext'
import { languageTheme, ink } from './languageTheme'
import { getLevelLabel } from './utils'
import { PRIMARY_NAV, NAV_GROUPS, ADMIN_NAV } from './navConfig'
import { BRAND_NAME, wordmarkStyle } from './brand'
import { MICRO } from './designTokens'

// ── Sidebar ───────────────────────────────────────────────────────────────
// Reworked from a flat list of nine equal rows with a 300px void in the middle.
// Now three bands:
//
//   1. NAV, in two labelled groups. The split is information, not decoration:
//      Home/Flashcards/Stories are the daily loop the product is built around;
//      Practice/Test are what you reach for deliberately. Flashcards carries the
//      only number in the rail — the same count the Home hero shows.
//   2. The LANGUAGE you are studying, as an identity card in what used to be
//      dead space — native script, level, and a tap to switch. It replaces the
//      old "Language" row and gives the empty middle a job.
//   3. An ACCOUNT footer: one row for the person (avatar + name → Profile) and
//      a strip of icon buttons for theme, settings and log out. Four equal-
//      weight rows became one row plus three small controls.
//
// Collapsed (64px) the groups drop their labels and the identity card becomes
// just the native character, so the rail stays legible.

const EXPANDED_WIDTH = 236
const COLLAPSED_WIDTH = 64

// Rows are a fixed height so the sliding ink bar positions from an index —
// no measurement, no layout effect, no jump on first paint.
const ROW_HEIGHT = 40
const ROW_GAP = 4
const ROW_PITCH = ROW_HEIGHT + ROW_GAP

function InkBar({ index, accentInk, collapsed }) {
  const visible = index >= 0
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: collapsed ? '2px' : '-6px', width: '3px',
        top: 0, height: `${ROW_HEIGHT - 14}px`, borderRadius: '0 3px 3px 0',
        background: accentInk,
        transform: `translateY(${(visible ? index : 0) * ROW_PITCH + 7}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
        pointerEvents: 'none',
      }}
    />
  )
}

function NavItem({ item, isActive, collapsed, accentHex, accentInk, badge, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const color = isActive ? accentInk : (hovered ? 'var(--text)' : 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={badge ? `${item.label}, ${badge} waiting` : item.label}
      className={'hd-nav-item hd-press' + (collapsed ? ' is-collapsed' : '')}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', height: `${ROW_HEIGHT}px`, border: 'none', textAlign: 'left',
        fontFamily: 'Inter, sans-serif',
        padding: collapsed ? '0' : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '11px', cursor: 'pointer',
        background: isActive
          ? `color-mix(in srgb, ${accentHex} 11%, var(--surface))`
          : (hovered ? 'var(--surface-2)' : 'transparent'),
        color,
        fontWeight: isActive ? 650 : 500,
        fontSize: '14px', userSelect: 'none',
      }}
    >
      <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        <Icon size={19} strokeWidth={isActive ? 2.1 : 1.85} color={color} />
        {/* Collapsed, the count has nowhere to sit, so it becomes a dot on the
            icon — still says "there is something here", takes no width. */}
        {badge && collapsed && (
          <span aria-hidden style={{
            position: 'absolute', top: '-3px', right: '-4px',
            width: '7px', height: '7px', borderRadius: '50%',
            background: accentInk, border: '1.5px solid var(--surface)',
          }} />
        )}
      </span>
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
      {!collapsed && badge && (
        <span style={{
          marginLeft: 'auto', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          fontSize: '11.5px', fontWeight: 700, lineHeight: 1,
          padding: '4px 7px', borderRadius: '7px',
          background: `color-mix(in srgb, ${accentHex} ${isActive ? 20 : 13}%, var(--surface))`,
          color: accentInk,
        }}>
          {badge}
        </span>
      )}
      {collapsed && hovered && <Tip>{badge ? `${item.label} · ${badge}` : item.label}</Tip>}
    </button>
  )
}

// Hover label for the collapsed rail.
function Tip({ children }) {
  return (
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
      {children}
    </span>
  )
}

// A small square control for the account strip: theme, settings, log out.
function IconControl({ icon: Icon, label, danger, onClick }) {
  const [hovered, setHovered] = useState(false)
  const color = danger
    ? (hovered ? '#DC2626' : 'var(--text-muted)')
    : (hovered ? 'var(--text)' : 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-press"
      style={{
        position: 'relative',
        width: '34px', height: '34px', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        border: 'none', borderRadius: '9px', cursor: 'pointer',
        background: hovered
          ? (danger ? 'color-mix(in srgb, #DC2626 10%, var(--surface))' : 'var(--surface-2)')
          : 'transparent',
        color,
      }}
    >
      <Icon size={17} strokeWidth={1.9} color={color} />
    </button>
  )
}

export default function Sidebar({ view, onNavigate, onLogout, isAdmin, language, profile, track, email, counts }) {
  const [collapsed, setCollapsed] = useState(false)
  const [logoHovered, setLogoHovered] = useState(false)
  const [langHovered, setLangHovered] = useState(false)
  const [accountHovered, setAccountHovered] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const lang = languageTheme(language)
  const accentHex = lang.accentHex
  const accentInk = ink(accentHex)

  const byKey = Object.fromEntries(PRIMARY_NAV.map(i => [i.key, i]))
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.keys.map(k => byKey[k]).filter(Boolean) }))

  // The one live number in the rail. Same total the Home hero shows, so the two
  // never disagree; hidden at zero, because "0" is a nag and the product's
  // stance is that a cleared queue should look cleared, not scored.
  const waiting = (counts?.newCount || 0) + (counts?.learnCount || 0) + (counts?.dueCount || 0)
  const badgeFor = (key) => (key === 'study' && waiting > 0 ? waiting : null)

  // Same identity the Profile screen shows, so the footer and that page agree.
  const name = profile?.display_name || email || 'Your account'
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  // The level lives on the active track, not the profile.
  const levelLabel = track ? getLevelLabel(language, track.system, track.current_level) : null

  return (
    <div style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: 'var(--surface-glass)', borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 14px 16px',
      overflow: 'hidden',
      transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    }}>

      {/* ── Brand ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', padding: collapsed ? '2px 0 18px' : '2px 4px 18px',
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
              width: collapsed ? '52px' : '40px', height: collapsed ? '52px' : '40px',
              objectFit: 'contain', flexShrink: 0,
              transform: logoHovered ? 'rotate(-7deg) scale(1.05)' : 'none',
              transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1), width 240ms ease, height 240ms ease',
            }}
          />
          {!collapsed && <span style={{ ...wordmarkStyle('17px'), overflow: 'hidden' }}>{BRAND_NAME}</span>}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="hd-press"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', flexShrink: 0 }}
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', margin: '0 auto 14px' }}
        >
          <ChevronsRight size={18} strokeWidth={1.85} color="var(--text-muted)" />
        </button>
      )}

      {/* ── Nav, in two labelled groups ── */}
      {groups.map((group, gi) => {
        const activeIndex = group.items.findIndex(i => i.key === view)
        return (
          <div key={group.label} style={{ marginBottom: gi === groups.length - 1 ? 0 : '18px' }}>
            {!collapsed && (
              <div style={{ ...MICRO, color: 'var(--text-faint)', padding: '0 12px', marginBottom: '8px' }}>
                {group.label}
              </div>
            )}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
              <InkBar index={activeIndex} accentInk={accentInk} collapsed={collapsed} />
              {group.items.map(item => (
                <NavItem
                  key={item.key}
                  item={item}
                  isActive={view === item.key}
                  collapsed={collapsed}
                  accentHex={accentHex}
                  accentInk={accentInk}
                  badge={badgeFor(item.key)}
                  onClick={() => onNavigate(item.key)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {isAdmin && (
        <div style={{ marginTop: '18px' }}>
          {!collapsed && (
            <div style={{ ...MICRO, color: 'var(--text-faint)', padding: '0 12px', marginBottom: '8px' }}>
              Admin
            </div>
          )}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
            <InkBar index={ADMIN_NAV.findIndex(i => i.key === view)} accentInk={accentInk} collapsed={collapsed} />
            {ADMIN_NAV.map(item => (
              <NavItem
                key={item.key}
                item={item}
                isActive={view === item.key}
                collapsed={collapsed}
                accentHex={accentHex}
                accentInk={accentInk}
                onClick={() => onNavigate(item.key)}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: '16px' }} />

      {/* ── What you're studying. This used to be ~300px of nothing; it now
          carries the language's own script and doubles as the switcher, which
          also retires the old "Language" nav row. ── */}
      <button
        onClick={() => onNavigate('languages')}
        onMouseEnter={() => setLangHovered(true)}
        onMouseLeave={() => setLangHovered(false)}
        aria-label={'Studying ' + lang.languageName + '. Switch language'}
        className="hd-press"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: '11px',
          width: '100%', marginBottom: '10px', cursor: 'pointer',
          padding: collapsed ? '8px 0' : '10px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: '13px', textAlign: 'left',
          background: langHovered
            ? `color-mix(in srgb, ${accentHex} 10%, var(--surface))`
            : `color-mix(in srgb, ${accentHex} 6%, var(--surface))`,
          border: '1px solid ' + `color-mix(in srgb, ${accentHex} 22%, var(--border))`,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <span style={{
          fontFamily: lang.font, fontSize: collapsed ? '19px' : '21px', fontWeight: 700,
          color: accentInk, lineHeight: 1, flexShrink: 0,
        }}>
          {lang.nativeName.slice(0, collapsed ? 1 : 2)}
        </span>
        {!collapsed && (
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 650, color: 'var(--text)' }}>
              {lang.languageName}
            </span>
            {levelLabel && (
              <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                {levelLabel}
              </span>
            )}
          </span>
        )}
        {!collapsed && <ChevronRight size={15} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />}
        {collapsed && langHovered && <Tip>{lang.languageName} · switch</Tip>}
      </button>

      {/* ── Account: one row for the person, three small controls. ── */}
      <button
        onClick={() => onNavigate('profile')}
        onMouseEnter={() => setAccountHovered(true)}
        onMouseLeave={() => setAccountHovered(false)}
        aria-label={'Profile — ' + name}
        aria-current={view === 'profile' ? 'page' : undefined}
        className="hd-press"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
          padding: collapsed ? '6px 0' : '8px 10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          border: 'none', borderRadius: '11px', cursor: 'pointer', textAlign: 'left',
          fontFamily: 'Inter, sans-serif',
          background: view === 'profile'
            ? `color-mix(in srgb, ${accentHex} 11%, var(--surface))`
            : (accountHovered ? 'var(--surface-2)' : 'transparent'),
        }}
      >
        <span aria-hidden style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${accentHex} 16%, var(--surface))`,
          color: accentInk, fontSize: '12.5px', fontWeight: 800,
        }}>
          {initial}
        </span>
        {!collapsed && (
          <span style={{
            flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
        )}
        {collapsed && accountHovered && <Tip>{name}</Tip>}
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px', marginTop: '4px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        flexWrap: collapsed ? 'wrap' : 'nowrap',
      }}>
        <IconControl
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        />
        <IconControl icon={Settings} label="Settings" onClick={() => onNavigate('settings')} />
        <IconControl icon={LogOut} label="Log out" danger onClick={onLogout} />
      </div>
    </div>
  )
}
