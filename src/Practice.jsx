import { useState } from 'react'
import { getSystemLabel, getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { buildPracticePlan } from './practicePlan'
import { speechRecognitionSupported } from './speechSupport'
import { useIsMobile } from './useIsMobile'
import {
  AlertTriangle, Headphones, PenLine,
  AlignLeft, Blocks, Music2, Languages, Brush, Play, GraduationCap, BookA, ScanText, Mic, Search, Repeat2,
  ListChecks, ChevronRight,
} from 'lucide-react'

// The Practice hub: every drill and reference tool in one calm place, so the
// top-level navigation can stay focused on the daily loop (Flashcards → Stories
// → Test).
//
// The screen is a list, read top to bottom: drills first (whatever genuinely
// has work waiting is already sorted to the top by practicePlan.js and says
// so), then the reference tools. Rows of text directly on the background — no
// hero, no tile grid, no icon chips. Which drill leads, what carries a count,
// and the ordering all live in practicePlan.js so they can be tested; this
// file only maps that onto rows.

// The one status colour on this screen: something is waiting for you. Status
// colours stay hardcoded (CLAUDE.md §5); everything neutral is a token.
const SIGNAL = '#D97706'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

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

export default function Practice({ profile, track, counts, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

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
  })

  // The plan's primary drill leads the same list as everything else — being
  // first, and saying what's waiting, is the emphasis. A separate hero block
  // gave one drill a marketing panel it never needed.
  const drills = [
    { ...plan.primary, desc: plan.primary.reason || plan.primary.desc },
    ...plan.drills,
  ]

  return (
    <div style={{
      width: '100%', maxWidth: '560px', margin: '0 auto',
      padding: isMobile ? '20px 20px 28px' : '36px 20px 48px',
      color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased',
    }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '27px', lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.02em' }}>Practice</h1>
        <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1, fontWeight: 550 }}>
          {systemLabel + ' · ' + levelLabel}
        </p>
      </header>

      <section aria-label="Drills" style={{ marginTop: '14px' }}>
        {drills.map((item, i) => (
          <Row
            key={item.key}
            item={item}
            last={i === drills.length - 1}
            onPress={() => onNavigate(item.key)}
          />
        ))}
      </section>

      <section aria-label="Look up" style={{ marginTop: '30px' }}>
        <h2 style={{ margin: 0, fontSize: '13px', lineHeight: 1, fontWeight: 700, color: 'var(--text-faint)' }}>Look up</h2>
        <div style={{ marginTop: '4px' }}>
          {plan.tools.map((tool, i) => (
            <Row
              key={tool.key}
              item={tool}
              last={i === plan.tools.length - 1}
              onPress={() => onNavigate(tool.key)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// One row per drill or tool: a plain muted icon (no chip), name and one line of
// purpose, and — only when something is genuinely waiting — an amber count.
// The row itself sits directly on the background with a hairline below it.
function Row({ item, last, onPress }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICONS[item.key] || Search
  const waiting = item.badge != null
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-press"
      style={{
        width: '100%', minHeight: '60px', padding: '11px 0', border: 0,
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        fontFamily: UI_FONT, cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: '13px',
        transition: 'background 140ms ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon size={20} strokeWidth={1.8} color="var(--text-faint)" style={{ flexShrink: 0 }} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '15.5px', fontWeight: 650, lineHeight: 1.25, color: 'var(--text)' }}>
          {item.title}
        </span>
        <span style={{ display: 'block', marginTop: '3px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
          {item.desc}
        </span>
      </span>
      {waiting && (
        <span style={{ flexShrink: 0, fontSize: '12.5px', fontWeight: 700, color: ink(SIGNAL), fontVariantNumeric: 'tabular-nums' }}>
          {item.badge}
        </span>
      )}
      <ChevronRight size={15} strokeWidth={2.1} color="var(--text-muted)" style={{ flexShrink: 0, opacity: 0.55 }} aria-hidden="true" />
    </button>
  )
}
