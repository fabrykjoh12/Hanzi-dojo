import { useState } from 'react'
import { getSystemLabel, getLevelLabel, metaLine} from './utils'
import { languageTheme, ink } from './languageTheme'
import { HeroPanel, HeroAction, PageHeader, Eyebrow } from './panels'
import { flatPanel, ON_HERO, NUM } from './designTokens'
import { buildPracticePlan, isDrillKey, drillCountLabel } from './practicePlan'
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

      {/* ── The alternatives. ──
          Eight identical 173×136 tiles in a 2-column grid used to sit here, each
          with a tinted icon square, a title and a description — the most
          template-looking pattern in the app, and a claim that all eight matter
          equally, which is false (P11 audit). One panel of rows now: the ones
          carrying a real count lead, the rest follow in a stable order, and only
          the names that need explaining get a line.

          No heading. The hero asked "what should I practise?"; this is the rest
          of the answer, not a new topic. */}
      <section aria-label="Practice drills" style={{ marginBottom: SECTION_GAP }}>
        <div style={{ ...flatPanel({ radius: 16 }), overflow: 'hidden' }}>
          {plan.drills.map((item, i) => (
            <DrillRow
              key={item.key}
              item={item}
              accentHex={accentHex}
              first={i === 0}
              onClick={() => openDrill(item.key, 'list')}
            />
          ))}
        </div>
      </section>

      {/* ── The gate on the level. Quiet and honest: an open row, not a card. ──
          Nobody in the tester pool has ever finished one, and the obstacle is the
          requirement (FSRS stability ≥ 21 days on 90% of the level), not the
          button — so this states the requirement and stays out of the way.
          Test.jsx owns the real rule; the row is always openable. It used to be
          reachable on a phone only through the More sheet. */}
      <LevelTestRow
        entry={plan.levelTest}
        levelLabel={levelLabel}
        nextLevelLabel={nextLevelLabel}
        accentHex={accentHex}
        onClick={() => onNavigate('test')}
      />

      {/* ── Reference. Places to go, not things to practise — so this family is
          drawn quieter than the drills above: a heading of its own, muted icons
          rather than accent ones, and no counts. ── */}
      <section>
        <h2 style={{ margin: '0 0 ' + LABEL_GAP, fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Look things up
        </h2>
        <div style={{ ...flatPanel({ radius: 16 }), overflow: 'hidden' }}>
          {plan.tools.map((tool, i) => (
            <ToolRow
              key={tool.key}
              tool={tool}
              first={i === 0}
              onClick={() => onNavigate(tool.key)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// The level test. One open row, two states.
//
// It was a bordered card between the hero and the grid. It is a row on the page
// now — no surface of its own, because it is neither the recommendation nor one
// of the alternatives, and a third card competing with the hero is what the P11
// audit asked to remove. Quiet and honest: nobody in the tester pool has ever
// finished one, and the obstacle is the requirement (FSRS stability ≥ 21 days
// across 90% of the level), not the button. So the row states the requirement
// and does not push.
//
// Still openable, always — Test.jsx owns the real rule (it also unlocks for
// anyone who has already passed this level, which the Home counts cannot see), so
// this row explains and never refuses. Hiding it was the old behaviour, and that
// is what made the gate invisible.
function LevelTestRow({ entry, levelLabel, nextLevelLabel, accentHex, onClick }) {
  const open = entry.unlocked
  const Icon = open ? ClipboardCheck : Lock
  const color = open ? accentHex : 'var(--text-faint)'

  return (
    <button
      onClick={onClick}
      className="hd-press"
      aria-label={open
        ? levelLabel + ' test — unlocked'
        : levelLabel + ' test — locked. ' + entry.masteredCount + ' of ' + entry.totalWords
          + ' words mastered; unlocks at ' + entry.needed + '.'}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        background: 'none', border: 'none', padding: '4px 1px',
        marginBottom: SECTION_GAP, minHeight: '44px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
        <div style={{ marginTop: '10px' }}>
          {/* Mixed against the TEXT, not against `--surface-2`: this bar sits on
              the page now, and a panel colour is 6/255 from it (the same
              correction Home needed in C2). */}
          <div style={{
            height: '4px', borderRadius: '999px', overflow: 'hidden',
            background: 'color-mix(in srgb, var(--text) 10%, transparent)',
          }}>
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
// A drill, as a row.
//
// This was `DrillTile`: a 173×136 bounded card, one of eight in a 2-column grid,
// each with a tinted icon square, a title and a description. C1 took the square
// away; P11 takes the card away. What is left is a row — the panel around the
// list is the grouping surface, and a row inside it must not look like a card
// inside a card.
//
// Three things vary between rows, and that is the whole point: the count (only
// Weak words and Grammar review can carry one), the hint (only the names that
// need one), and the icon's colour (amber when something is waiting). Rows that
// all look identical are what the redesign is for.
function DrillRow({ item, accentHex, first, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICONS[item.key] || Headphones
  const waiting = item.tone === 'signal' && item.badge != null
  const color = waiting ? SIGNAL : accentHex
  const countLabel = drillCountLabel(item)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-press"
      // The count is a number on screen; a screen reader gets the noun with it.
      aria-label={[item.title, countLabel, item.hint].filter(Boolean).join(' — ')}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
        minHeight: '54px', padding: '11px 15px', textAlign: 'left',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        border: 'none', borderTop: first ? 'none' : '1px solid var(--border)',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        transition: 'background 140ms ease',
      }}
    >
      <Icon size={19} strokeWidth={1.8} color={ink(color)} style={{ flexShrink: 0 }} />

      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>
          {item.title}
        </span>
        {item.hint && (
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>
            {item.hint}
          </span>
        )}
      </span>

      {/* The count leads, as a figure — not a capsule. Typography and alignment
          carry it: amber ink, tabular, right against the chevron. */}
      {item.badge != null && (
        <span aria-hidden style={{
          ...NUM, fontSize: '14px', fontWeight: 750, color: ink(SIGNAL), flexShrink: 0,
        }}>
          {item.badge}
        </span>
      )}

      <ChevronRight size={17} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />
    </button>
  )
}


// One line per tool: icon, name, what it's for, chevron.
// A lookup tool, as a row — deliberately quieter than a DrillRow above it.
//
// The two families sit on the same kind of panel, so the difference has to come
// from type and colour rather than another box: a tool's icon is muted where a
// drill's is accent (things you do are coloured; places you look are not), its
// title is a step smaller, and it never carries a count. `accentHex` is gone from
// the signature for exactly that reason.
function ToolRow({ tool, first, onClick }) {
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
        // `--border`, not `--hairline`: the hairline token is a white inset
        // highlight and vanishes as a divider on a light surface (Home C3).
        border: 'none', borderTop: first ? 'none' : '1px solid var(--border)',
        fontFamily: 'Inter, sans-serif', transition: 'background 140ms ease',
      }}
    >
      {/* Muted, not accent — the one difference that tells this family from the
          drill rows without drawing anything extra. (The 34px tinted square that
          used to sit here went in P10-C1.) */}
      <Icon size={18} strokeWidth={1.8} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)' }}>{tool.title}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px', lineHeight: 1.35 }}>{tool.desc}</span>
      </span>
      <ChevronRight size={17} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />
    </button>
  )
}

