import { useState } from 'react'
import { getSystemLabel, getLevelLabel } from './utils'
import { languageTheme } from './languageTheme'
import { PageHeader, Eyebrow } from './panels'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, AlertTriangle, Headphones, PenLine,
  AlignLeft, Blocks, Music2, Languages, Brush, Play, GraduationCap, BookA, ScanText, Mic, Search, Repeat2,
  ListChecks, ChevronRight,
} from 'lucide-react'

// The Practice hub: every drill/activity in one calm place, so the top-level
// navigation can stay focused on the daily loop (Flashcards → Stories → Test).
//
// The screen groups by what the learner is actually here to do, because a flat
// grid of fifteen identical cards makes "what should I do now?" a reading task:
//
//   Needs attention — only when something is genuinely due, so it stays a
//                     signal instead of a permanent header.
//   Drills          — active practice; the reason to open this screen.
//   Tools           — lookup and reference. These are navigation, not practice,
//                     so they render as slim rows rather than competing with
//                     the drills at equal weight.
export default function Practice({ profile, track, counts, onNavigate, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const isJapanese = profile.active_language === 'japanese'
  const isChinese = profile.active_language === 'chinese'
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const weak = counts ? (counts.weakCount || 0) : 0
  const grammarDue = counts ? (counts.grammarDueCount || 0) : 0

  // The script drill matches the language's writing system: Kana (Japanese),
  // Tones (Chinese), Cyrillic alphabet (Russian). Stroke order is CJK-only.
  let scriptCard = null
  if (isJapanese) scriptCard = { key: 'kana', icon: Languages, title: 'Kana', desc: 'Hiragana & katakana' }
  else if (isChinese) scriptCard = { key: 'tones', icon: Music2, title: 'Tones', desc: 'Hear and name the tone' }
  else if (theme.script === 'cyrillic') scriptCard = { key: 'cyrillic', icon: Languages, title: 'Alphabet', desc: 'Cyrillic letters & sounds' }

  const weakCard = {
    key: 'weak', icon: AlertTriangle, title: 'Weak words', accent: '#D97706',
    desc: weak > 0 ? weak + ' word' + (weak === 1 ? '' : 's') + ' keep slipping' : 'Clean up tricky words',
    badge: weak > 0 ? weak : null,
  }
  const grammarReviewCard = {
    key: 'grammarpractice', icon: Repeat2, title: 'Grammar review', accent: '#D97706',
    desc: grammarDue > 0 ? grammarDue + ' pattern' + (grammarDue === 1 ? '' : 's') + ' due' : 'Keep your patterns sharp',
    badge: grammarDue > 0 ? grammarDue : null,
  }

  // A card is "due" only when it has a real count behind it. With nothing due
  // the section disappears and both cards fall back in with the drills, so an
  // empty "Needs attention" heading never sits there crying wolf.
  const due = [weak > 0 ? weakCard : null, grammarDue > 0 ? grammarReviewCard : null].filter(Boolean)

  const drills = [
    weak > 0 ? null : weakCard,
    { key: 'listen', icon: Headphones, title: 'Listening', desc: 'Hear a word, pick it' },
    { key: 'speak', icon: Mic, title: 'Speaking', desc: 'Say it aloud, get a ✓' },
    { key: 'writing', icon: PenLine, title: 'Writing', desc: 'Type words from memory' },
    { key: 'fillblank', icon: AlignLeft, title: 'Fill in the blank', desc: 'Complete the sentence' },
    { key: 'builder', icon: Blocks, title: 'Sentence builder', desc: 'Reorder the words' },
    scriptCard,
    // Stroke order only applies to CJK scripts (hanzi/kanji).
    theme.cjk ? { key: 'strokes', icon: Brush, title: 'Stroke order', desc: 'Animated writing' } : null,
    grammarDue > 0 ? null : grammarReviewCard,
  ].filter(Boolean)

  // Reference, not practice. `ListChecks` rather than a second `BookA` — the
  // word list and the already-known importer used to wear the same icon and sat
  // adjacent, which read as one feature rendered twice.
  const tools = [
    { key: 'words', icon: BookA, title: 'Word list', desc: 'Every word and its status' },
    { key: 'known', icon: ListChecks, title: 'Words you already know', desc: 'Import a list or tick off what you know' },
    { key: 'dictionary', icon: Search, title: 'Dictionary', desc: 'Look up any word, hear it, save it' },
    { key: 'analyzer', icon: ScanText, title: 'Analyze text', desc: 'Paste text — see % you know' },
    { key: 'grammar', icon: GraduationCap, title: 'Grammar guide', desc: 'How the language works' },
    { key: 'youtube', icon: Play, title: 'Videos', desc: 'Curated listening' },
  ]

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(' + (isMobile ? '150px' : '210px') + ', 1fr))',
    gap: '14px',
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '28px 16px 40px' : '44px 32px 60px' }}>
      <Ghost onClick={onBack} />

      <PageHeader
        title="Practice"
        meta={`${systemLabel} · ${levelLabel}`}
        style={{ margin: '20px 0 18px' }}
      />

      {due.length > 0 && (
        <Section label="Needs attention" first>
          <div style={gridStyle}>
            {due.map(card => (
              <Card key={card.key} card={card} accentHex={accentHex} onClick={() => onNavigate(card.key)} />
            ))}
          </div>
        </Section>
      )}

      <Section label="Drills" first={due.length === 0}>
        <div style={gridStyle}>
          {drills.map(card => (
            <Card key={card.key} card={card} accentHex={accentHex} onClick={() => onNavigate(card.key)} />
          ))}
        </div>
      </Section>

      <Section label="Tools">
        <div style={{
          borderRadius: '16px', overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--surface)',
          boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
        }}>
          {tools.map((tool, i) => (
            <ToolRow
              key={tool.key}
              tool={tool}
              accentHex={accentHex}
              first={i === 0}
              onClick={() => onNavigate(tool.key)}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ label, children, first = false }) {
  return (
    <section style={{ marginTop: first ? 0 : '30px' }}>
      <div style={{ marginBottom: '11px' }}>
        <Eyebrow>{label}</Eyebrow>
      </div>
      {children}
    </section>
  )
}

function Card({ card, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = card.icon
  const color = card.accent || accentHex
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', textAlign: 'left', cursor: 'pointer',
        background: 'var(--surface)', border: '1px solid ' + (hovered ? color + '55' : 'var(--border)'),
        borderRadius: '18px', padding: '18px', fontFamily: 'Inter, sans-serif',
        boxShadow: (hovered ? 'var(--shadow-2)' : 'var(--shadow-1)') + ', inset 0 1px 0 var(--hairline)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
        display: 'flex', flexDirection: 'column', gap: '11px', minHeight: '118px',
      }}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: '12px',
        background: color + '14', border: '1px solid ' + color + '24',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} strokeWidth={1.85} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)' }}>{card.title}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>{card.desc}</div>
      </div>
      {card.badge != null && (
        <span style={{
          position: 'absolute', top: '15px', right: '15px',
          fontSize: '12px', fontWeight: 750, color: '#B45309',
          background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.28)',
          borderRadius: '999px', padding: '2px 9px',
        }}>{card.badge}</span>
      )}
    </button>
  )
}

// One line per tool: icon, name, what it's for, chevron. Deliberately quieter
// than a Card — these are places to go, not things to practise.
function ToolRow({ tool, accentHex, first, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = tool.icon
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
      <span style={{
        width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
        background: accentHex + '12', border: '1px solid ' + accentHex + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} strokeWidth={1.85} color={accentHex} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{tool.title}</span>
        <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>{tool.desc}</span>
      </span>
      <ChevronRight size={17} strokeWidth={2} color="var(--text-faint)" style={{ flexShrink: 0 }} />
    </button>
  )
}

function Ghost({ onClick }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 14px', borderRadius: '12px',
      border: '1px solid var(--border)', background: h ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    }}>
      <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Home
    </button>
  )
}
