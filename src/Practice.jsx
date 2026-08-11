import { useState } from 'react'
import { getSystemLabel, getLevelLabel, metaLine} from './utils'
import { languageTheme, ink } from './languageTheme'
import { HeroPanel, HeroAction, PageHeader, Eyebrow } from './panels'
import { flatPanel, ON_HERO, NUM } from './designTokens'
import { buildPracticePlan, isDrillKey } from './practicePlan'
import { speechRecognitionSupported } from './speechSupport'
// `track as trackEvent`: this component already has a `track` prop — the
// language track — and the bare name would be shadowed by it. Same alias Study
// uses, for the same reason.
import { track as trackEvent, EVENTS } from './analytics'
import { useIsMobile } from './useIsMobile'
import {
  ArrowRight, AlertTriangle, Headphones, PenLine,
  AlignLeft, Blocks, Music2, Languages, Brush, Play, GraduationCap, BookA, ScanText, Mic, Search, Repeat2,
  ListChecks, ChevronRight, ClipboardCheck, Lock,
} from 'lucide-react'

// The Practice hub: every drill and reference tool in one calm place, so the
// top-level navigation can stay focused on the daily loop (Flashcards → Stories
// → Test).
//
// The screen is read top to bottom as one sentence:
//
//   1. ONE lit panel — the single drill worth opening right now. Anything with a
//      real count behind it takes that slot; otherwise it is Listening.
//   2. Drills — the rest of the practice modes, all the same size, one grid.
//   3. Tools — lookup and reference. Slim rows, because these are places to go
//      rather than things to practise, and a second grid of equal-weight cards
//      is exactly what made this screen read as a pile.
//
// Which drill leads, what still carries a count, and the ordering all live in
// practicePlan.js so they can be tested; this file only maps that onto panels.

// The one status colour on this screen: something is waiting for you. Status
// colours stay hardcoded (CLAUDE.md §5); everything neutral is a token and
// every tint mixes into the surface so it survives dark mode.
const SIGNAL = '#D97706'

// lucide only — never an emoji as an icon.
const ICONS = {
  weak: AlertTriangle,
  grammarpractice: Repeat2,
  listen: Headphones,
  speak: Mic,
  writing: PenLine,
  fillblank: AlignLeft,
  builder: Blocks,
  tones: Music2,
  kana: Languages,
  cyrillic: Languages,
  strokes: Brush,
  words: BookA,
  known: ListChecks,
  dictionary: Search,
  analyzer: ScanText,
  grammar: GraduationCap,
  youtube: Play,
}

// One spacing scale for the whole screen. The old layout mixed 30 / 18 / 14 /
// 11px gaps, which is most of what "messy" actually looked like.
const SECTION_GAP = '26px'
const LABEL_GAP = '10px'

function tint(color, pct) {
  return 'color-mix(in srgb, ' + color + ' ' + pct + '%, var(--surface))'
}

function tintBorder(color, pct) {
  return 'color-mix(in srgb, ' + color + ' ' + pct + '%, var(--border))'
}

export default function Practice({ profile, track, counts, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  // Which drills exist is a property of the language's script, never of its
  // name — a new language is a data change in languageTheme.js.
  const plan = buildPracticePlan({
    script: theme.script,
    cjk: theme.cjk,
    // Don't offer a drill that can only say "not available here" — the store
    // apps' webviews expose the speech API without implementing it.
    speech: speechRecognitionSupported(),
    weakCount: counts ? (counts.weakCount || 0) : 0,
    grammarDueCount: counts ? (counts.grammarDueCount || 0) : 0,
    masteredCount: counts ? (counts.masteredCount || 0) : 0,
    totalWords: counts ? (counts.totalWords || 0) : 0,
  })

  const primary = plan.primary
  const PrimaryIcon = ICONS[primary.key] || Headphones

  // Entering a drill, counted once. On the tap rather than on the drill's mount:
  // <Activity> re-runs effects every time the Practice tab is shown, so a
  // mount-based event would count returning to the tab as a new start
  // (NAV-MODEL §2). `from` separates taking the recommendation from picking off
  // the list — which is the question this screen's next iteration needs answered.
  //
  // Nothing reads this back: the ordering and the recommendation still come from
  // buildPracticePlan alone. The dataset does not exist yet.
  const openDrill = (key, from) => {
    if (isDrillKey(key)) trackEvent(EVENTS.PRACTICE_DRILL_STARTED, { key, from })
    onNavigate(key)
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>
      <PageHeader
        title="Practice"
        meta={metaLine(systemLabel, levelLabel)}
        style={{ margin: '18px 0 14px' }}
      />

      {/* ── The one lit block: the drill worth opening now ── */}
      <HeroPanel
        accentHex={accentHex}
        seed={profile.active_language + '-practice'}
        compact={isMobile}
        onClick={() => openDrill(primary.key, 'hero')}
        style={{ marginBottom: SECTION_GAP }}
      >
        {({ hovered }) => (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow onHero>{primary.eyebrow}</Eyebrow>
              <h2 style={{
                margin: '9px 0 7px', color: '#fff', letterSpacing: '-0.02em',
                fontSize: isMobile ? '26px' : '31px', fontWeight: 700, lineHeight: 1.1,
              }}>
                {primary.title}
              </h2>
              <p style={{
                margin: 0, fontSize: '13.5px', lineHeight: 1.5,
                color: ON_HERO.body, maxWidth: '42ch',
              }}>
                {primary.reason}
              </p>
              <HeroAction label={primary.cta} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
            </div>
            {/* The mode's mark. It wore a 44px tinted square with its own
                border — a box drawn around a decoration, on the one panel that
                is already the most saturated object on the screen (P10-C1). The
                icon says the same thing without it. */}
            <PrimaryIcon aria-hidden size={26} strokeWidth={1.7} color="rgba(255,255,255,0.82)"
              style={{ flexShrink: 0, marginTop: '2px' }} />
          </div>
        )}
      </HeroPanel>

      {/* ── The gate on the level, directly under the hero. ──
          Not a drill and not a lookup, so it sits in neither labelled section:
          one wide row between the hero and the grid, which is where the screen
          reads "and this is what it is all for". It used to be reachable on a
          phone only through the More sheet, filed between Profile and Log out. */}
      <LevelTestRow
        entry={plan.levelTest}
        levelLabel={levelLabel}
        nextLevelLabel={nextLevelLabel}
        accentHex={accentHex}
        onClick={() => onNavigate('test')}
      />

      {/* ── Everything else you can drill. One grid, one tile size. ── */}
      <section style={{ marginBottom: SECTION_GAP }}>
        <div style={{ marginBottom: LABEL_GAP }}>
          <Eyebrow>More drills</Eyebrow>
        </div>
        <div style={{
          display: 'grid', gap: '12px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(' + (isMobile ? '148px' : '198px') + ', 1fr))',
        }}>
          {plan.drills.map(item => (
            <DrillTile
              key={item.key}
              item={item}
              accentHex={accentHex}
              onClick={() => openDrill(item.key, 'list')}
            />
          ))}
        </div>
      </section>

      {/* ── Reference, deliberately quieter than a drill. ── */}
      <section>
        <div style={{ marginBottom: LABEL_GAP }}>
          <Eyebrow>Look things up</Eyebrow>
        </div>
        <div style={{ ...flatPanel({ radius: 16 }), overflow: 'hidden' }}>
          {plan.tools.map((tool, i) => (
            <ToolRow
              key={tool.key}
              tool={tool}
              accentHex={accentHex}
              first={i === 0}
              onClick={() => onNavigate(tool.key)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// The level test. One row, two states.
//
// Locked, it is quiet and explains itself: what the bar is, how far along it is,
// and the number that opens it. It is still openable — Test.jsx owns the real
// rule (it also unlocks for anyone who has already passed this level, which the
// Home counts cannot see), so this row shows the requirement and never refuses.
// Hiding it was the old behaviour and it is what made the gate invisible.
function LevelTestRow({ entry, levelLabel, nextLevelLabel, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const open = entry.unlocked
  const Icon = open ? ClipboardCheck : Lock
  const color = open ? accentHex : 'var(--text-faint)'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={open
        ? levelLabel + ' test — unlocked'
        : levelLabel + ' test — locked. ' + entry.masteredCount + ' of ' + entry.totalWords
          + ' words mastered; unlocks at ' + entry.needed + '.'}
      style={{
        ...flatPanel({ radius: 16 }),
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        padding: '14px 15px', marginBottom: SECTION_GAP,
        border: '1px solid ' + (open && hovered ? tintBorder(accentHex, 45) : 'var(--border)'),
        transition: 'border-color 160ms ease, background 140ms ease',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
        {/* Locked or open is carried by the icon — a padlock or a clipboard —
            and by its colour. The 34px tinted square around it was the last of
            the sixteen on this screen, and one left behind reads as an
            oversight rather than a system (P10-C1). */}
        <Icon size={19} strokeWidth={1.8} color={open ? ink(accentHex) : color} style={{ flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            {levelLabel} test
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>
            {open
              ? 'You’re ready. Pass it to open ' + nextLevelLabel + '.'
              : entry.totalWords > 0
                ? 'Unlocks at ' + entry.needed + ' mastered words'
                : 'Unlocks once you’ve mastered this level'}
          </span>
        </span>
        <ChevronRight size={17} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />
      </div>

      {/* Locked: how far along, in the one shape the app already uses for it.
          Observational — a position, not a nag. */}
      {!open && entry.totalWords > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ height: '4px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{
              width: entry.pct + '%', height: '100%', borderRadius: '999px',
              background: ink(accentHex),
            }} />
          </div>
          <div style={{ ...NUM, fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '7px' }}>
            {entry.masteredCount} of {entry.totalWords} words mastered
          </div>
        </div>
      )}
    </button>
  )
}

// One drill. Every tile is the same size with the same icon, title and one line
// of description — the only variation is the amber treatment when something is
// genuinely waiting, so that variation actually means something.
function DrillTile({ item, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICONS[item.key] || Headphones
  const signal = item.tone === 'signal'
  const color = signal ? SIGNAL : accentHex

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...flatPanel({ radius: 16 }),
        position: 'relative', textAlign: 'left', cursor: 'pointer',
        padding: '15px 14px 16px', fontFamily: 'Inter, sans-serif',
        border: '1px solid ' + (hovered ? tintBorder(color, 45) : 'var(--border)'),
        boxShadow: (hovered ? 'var(--shadow-2)' : 'var(--shadow-1)') + ', inset 0 1px 0 var(--hairline)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
        display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '112px',
      }}
    >
      {/* The icon belongs to the tile, not to a box inside it. This was a 36px
          tinted rounded square with its own border — eight of them in a grid,
          the most template-looking pattern in the app (P10-C1). The colour is
          still intentional; the container is gone. */}
      <Icon size={22} strokeWidth={1.8} color={ink(color)} style={{ flexShrink: 0 }} />
      <span style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: '14.5px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>
          {item.title}
        </span>
        <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
          {item.desc}
        </span>
      </span>
      {item.badge != null && (
        <span style={{
          position: 'absolute', top: '13px', right: '13px',
          fontSize: '11.5px', fontWeight: 750, lineHeight: 1,
          color: ink(SIGNAL), background: tint(SIGNAL, 16),
          border: '1px solid ' + tintBorder(SIGNAL, 34),
          borderRadius: '999px', padding: '4px 9px',
        }}>{item.badge}</span>
      )}
    </button>
  )
}

// One line per tool: icon, name, what it's for, chevron.
function ToolRow({ tool, accentHex, first, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICONS[tool.key] || Search
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '13px', width: '100%',
        textAlign: 'left', cursor: 'pointer', padding: '13px 15px',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        border: 'none', borderTop: first ? 'none' : '1px solid var(--hairline)',
        fontFamily: 'Inter, sans-serif', transition: 'background 140ms ease',
      }}
    >
      {/* Same rule as the tiles: the icon marks the row, a 34px tinted square
          around it marks nothing (P10-C1). This is the pattern Profile's control
          rows already use. */}
      <Icon size={18} strokeWidth={1.8} color={ink(accentHex)} style={{ flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{tool.title}</span>
        <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>{tool.desc}</span>
      </span>
      <ChevronRight size={17} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />
    </button>
  )
}

