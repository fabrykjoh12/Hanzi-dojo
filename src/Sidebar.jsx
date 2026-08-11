import { useState } from 'react'
import { ChevronsLeft, ChevronsRight, Sun, Moon, Settings, LogOut } from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import { useTheme } from './ThemeContext'
import { languageTheme, ink } from './languageTheme'
import { getLevelLabel } from './utils'
import { PRIMARY_NAV, NAV_GROUPS, ADMIN_NAV } from './navConfig'
import { navBadge, navItemLabel } from './navBadges'
import { BRAND_NAME, wordmarkStyle } from './brand'

// ── Sidebar ───────────────────────────────────────────────────────────────
// Top to bottom: brand, the seal (what you're studying), nav, then the person.
//
// Three things this deliberately does NOT do, each of them a habit that makes a
// rail look assembled rather than designed:
//
//   · No printed group headings. Five links don't need a taxonomy; the gap
//     between the daily loop and Practice/Test carries the same information
//     without inventing two category names to look organised.
//   · One active treatment, not two. The row that's active gets a solid bar on
//     the rail's own edge and accent-coloured type — no pill fill underneath it
//     as well. Doubling the signal reads as indecision.
//   · The empty middle is not filled with widgets. It carries the language's
//     character at watermark strength, the same motif the hero panels use, so
//     the space is quiet on purpose instead of merely unused.
//
// Collapsed (64px) the seal keeps only its character and the watermark drops —
// there is no room for it to be atmosphere rather than clutter.

const EXPANDED_WIDTH = 236
const COLLAPSED_WIDTH = 64

// Rows are a fixed height so the sliding bar positions from an index — no
// measurement, no layout effect, no jump on first paint.
const ROW_HEIGHT = 44
const ROW_GAP = 5
const ROW_PITCH = ROW_HEIGHT + ROW_GAP

// The active marker, flush against the rail's outer edge so it reads as part of
// the sidebar's spine rather than a chip floating near it.
function EdgeBar({ index, accentInk }) {
  const visible = index >= 0
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: '-14px', width: '2.5px',
        top: 0, height: `${ROW_HEIGHT - 16}px`, borderRadius: '0 2px 2px 0',
        background: accentInk,
        transform: `translateY(${(visible ? index : 0) * ROW_PITCH + 8}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
        pointerEvents: 'none',
      }}
    />
  )
}

function NavItem({ item, isActive, collapsed, accentInk, badge, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const color = isActive ? accentInk : (hovered ? 'var(--text)' : 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={navItemLabel(item.label, badge)}
      className={'hd-nav-item hd-press' + (collapsed ? ' is-collapsed' : '')}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', height: `${ROW_HEIGHT}px`, border: 'none', textAlign: 'left',
        fontFamily: 'Inter, sans-serif',
        padding: collapsed ? '0' : '0 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '10px', cursor: 'pointer',
        // Hover is the only fill. Active is carried by the edge bar and the
        // colour of the type, so the two states never stack.
        background: hovered && !isActive ? 'var(--surface-2)' : 'transparent',
        color,
        fontWeight: isActive ? 650 : 500,
        fontSize: '14px', userSelect: 'none',
        transition: 'color 160ms ease, background 160ms ease',
      }}
    >
      <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        <Icon size={18.5} strokeWidth={isActive ? 2.15 : 1.8} color={color} />
        {/* Collapsed, the count has nowhere to sit, so it becomes a dot — still
            says "there is something here", takes no width. */}
        {badge && collapsed && (
          <span aria-hidden style={{
            position: 'absolute', top: '-3px', right: '-4px',
            width: '7px', height: '7px', borderRadius: '50%',
            background: accentInk, border: '1.5px solid var(--surface)',
          }} />
        )}
      </span>
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
      {/* Plain accent digits, not a filled badge pill. The rail already has one
          coloured object (the seal); a second competes with it. */}
      {!collapsed && badge && (
        <span style={{
          marginLeft: 'auto', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          fontSize: '12px', fontWeight: 700,
          color: isActive ? accentInk : 'var(--text-faint)',
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
    ? (hovered ? '#DC2626' : 'var(--text-faint)')
    : (hovered ? 'var(--text)' : 'var(--text-faint)')
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
        width: '32px', height: '32px', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        border: 'none', borderRadius: '8px', cursor: 'pointer',
        background: hovered
          ? (danger ? 'color-mix(in srgb, #DC2626 10%, var(--surface))' : 'var(--surface-2)')
          : 'transparent',
        color,
        transition: 'color 160ms ease, background 160ms ease',
      }}
    >
      <Icon size={16} strokeWidth={1.85} color={color} />
    </button>
  )
}

export default function Sidebar({ view, onNavigate, onLogout, isAdmin, language, profile, track, email, counts }) {
  const [collapsed, setCollapsed] = useState(false)
  const [logoHovered, setLogoHovered] = useState(false)
  const [sealHovered, setSealHovered] = useState(false)
  const [accountHovered, setAccountHovered] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const lang = languageTheme(language)
  const accentHex = lang.accentHex
  const accentInk = ink(accentHex)

  const byKey = Object.fromEntries(PRIMARY_NAV.map(i => [i.key, i]))
  const groups = NAV_GROUPS.map(g => g.keys.map(k => byKey[k]).filter(Boolean))

  // Same identity the Profile screen shows, so the footer and that page agree.
  const name = profile?.display_name || email || 'Your account'
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  // The level lives on the active track, not the profile.
  const levelLabel = track ? getLevelLabel(language, track.system, track.current_level) : null

  // The one live number in the rail. Same total the Home hero shows and the
  // same total the mobile bar shows, because all three now ask navBadges.js —
  // hidden at zero, because "0" is a nag and the product's stance is that a
  // cleared queue should look cleared, not scored.
  const badgeFor = (key) => navBadge(key, counts)

  const hairline = { height: '1px', background: 'var(--border)', opacity: 0.7 }

  // A real navigation landmark: on desktop this rail IS the app's navigation,
  // and without <nav> a screen-reader user has no way to jump to it.
  return (
    <nav aria-label="Main" data-tour="nav" style={{
      width: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
      flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: 'var(--surface-glass)', borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 14px 14px',
      overflow: 'hidden',
      transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    }}>

      {/* ── Brand ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', padding: collapsed ? '2px 0 14px' : '2px 2px 16px',
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
              width: collapsed ? '46px' : '38px', height: collapsed ? '46px' : '38px',
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
            <ChevronsLeft size={17} strokeWidth={1.8} color="var(--text-faint)" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="hd-press"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', margin: '0 auto 10px' }}
        >
          <ChevronsRight size={17} strokeWidth={1.8} color="var(--text-faint)" />
        </button>
      )}

      {/* ── The seal: what you're studying, and the switcher. ──
          A filled accent square with the script in white — the form a name
          stamp takes in the writing traditions this app teaches. It sits at the
          top because it is the context every row below it is scoped to, and it
          is the rail's single saturated object, so it does the work an outlined
          card was doing without adding another rounded box to a UI already made
          of them. */}
      <button
        onClick={() => onNavigate('languages')}
        onMouseEnter={() => setSealHovered(true)}
        onMouseLeave={() => setSealHovered(false)}
        aria-label={'Studying ' + lang.languageName + (levelLabel ? ', ' + levelLabel : '') + '. Switch language'}
        className="hd-press"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: '10px',
          width: '100%', cursor: 'pointer',
          padding: collapsed ? '0' : '0 2px 0 0',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: 'none', border: 'none', textAlign: 'left',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <span aria-hidden style={{
          width: '34px', height: '34px', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          borderRadius: '9px',
          background: accentHex,
          color: '#fff',
          fontFamily: lang.font,
          fontSize: lang.nativeName.length > 2 ? '13px' : '16px',
          fontWeight: 700, lineHeight: 1,
          boxShadow: sealHovered
            ? `0 6px 16px -6px color-mix(in srgb, ${accentHex} 75%, transparent)`
            : `0 3px 10px -6px color-mix(in srgb, ${accentHex} 70%, transparent)`,
          transition: 'box-shadow 200ms ease, transform 200ms cubic-bezier(0.22,1,0.36,1)',
          transform: sealHovered ? 'translateY(-1px)' : 'none',
        }}>
          {lang.nativeName.slice(0, 2)}
        </span>
        {!collapsed && (
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'block', fontSize: '13.5px', fontWeight: 650,
              color: sealHovered ? accentInk : 'var(--text)',
              transition: 'color 160ms ease',
            }}>
              {lang.languageName}
            </span>
            {levelLabel && (
              <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '1px' }}>
                {levelLabel}
              </span>
            )}
          </span>
        )}
        {collapsed && sealHovered && <Tip>{lang.languageName} · switch</Tip>}
      </button>

      <div style={{ ...hairline, margin: collapsed ? '14px 0' : '16px 0' }} />

      {/* ── Nav. Two clusters, no headings — the gap is the grouping. ── */}
      {groups.map((items, gi) => {
        const activeIndex = items.findIndex(i => i.key === view)
        return (
          <div
            key={gi}
            style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px`,
              marginBottom: gi === groups.length - 1 ? 0 : '14px',
            }}
          >
            <EdgeBar index={activeIndex} accentInk={accentInk} />
            {items.map(item => (
              <NavItem
                key={item.key}
                item={item}
                isActive={view === item.key}
                collapsed={collapsed}
                accentInk={accentInk}
                badge={badgeFor(item.key)}
                onClick={() => onNavigate(item.key)}
              />
            ))}
          </div>
        )
      })}

      {isAdmin && (
        <div style={{
          position: 'relative', marginTop: '14px',
          display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px`,
        }}>
          <EdgeBar index={ADMIN_NAV.findIndex(i => i.key === view)} accentInk={accentInk} />
          {ADMIN_NAV.map(item => (
            <NavItem
              key={item.key}
              item={item}
              isActive={view === item.key}
              collapsed={collapsed}
              accentInk={accentInk}
              onClick={() => onNavigate(item.key)}
            />
          ))}
        </div>
      )}

      {/* ── The quiet middle. The same watermark motif the hero panels carry,
          at a strength you notice only once — it makes the empty space read as
          material rather than as a gap nobody got to. ── */}
      <div style={{ flex: 1, minHeight: '20px', position: 'relative', overflow: 'hidden' }}>
        {/* Bleeds off the rail's left edge only — a stamp pressed at the margin,
            not a glyph parked in the middle of a gap. */}
        {!collapsed && (
          <span aria-hidden style={{
            position: 'absolute', left: '-38px', top: '50%',
            transform: 'translateY(-50%)',
            fontFamily: lang.font, fontSize: '164px', lineHeight: 0.78, fontWeight: 700,
            color: `color-mix(in srgb, ${accentHex} var(--watermark-pct), transparent)`,
            pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {lang.nativeName.slice(0, 1)}
          </span>
        )}
      </div>

      <div style={{ ...hairline, marginBottom: '10px' }} />

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
          padding: collapsed ? '6px 0' : '7px 8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
          fontFamily: 'Inter, sans-serif',
          background: accountHovered || view === 'profile' ? 'var(--surface-2)' : 'transparent',
          transition: 'background 160ms ease',
        }}
      >
        <span aria-hidden style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: '11.5px', fontWeight: 700,
        }}>
          {initial}
        </span>
        {!collapsed && (
          <span style={{
            flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 550,
            color: view === 'profile' ? 'var(--text)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
        )}
        {collapsed && accountHovered && <Tip>{name}</Tip>}
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '1px', marginTop: '2px',
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
    </nav>
  )
}
