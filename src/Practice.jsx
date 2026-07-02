import { useState } from 'react'
import { getSystemLabel, getLevelLabel } from './utils'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, Dumbbell, AlertTriangle, Headphones, PenLine,
  AlignLeft, Blocks, Music2, Languages, Brush, Play, GraduationCap, BookA,
} from 'lucide-react'

// The Practice hub: every drill/activity in one calm place, so the top-level
// navigation can stay focused on the daily loop (Flashcards → Stories → Test).
export default function Practice({ profile, track, counts, onNavigate, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const isJapanese = profile.active_language === 'japanese'
  const isChinese = profile.active_language === 'chinese'
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const weak = counts ? (counts.weakCount || 0) : 0

  // The script drill matches the language's writing system: Kana (Japanese),
  // Tones (Chinese), Cyrillic alphabet (Russian). Stroke order is CJK-only.
  let scriptCard = null
  if (isJapanese) scriptCard = { key: 'kana', icon: Languages, title: 'Kana', desc: 'Hiragana & katakana' }
  else if (isChinese) scriptCard = { key: 'tones', icon: Music2, title: 'Tones', desc: 'Hear and name the tone' }
  else if (theme.script === 'cyrillic') scriptCard = { key: 'cyrillic', icon: Languages, title: 'Alphabet', desc: 'Cyrillic letters & sounds' }

  const cards = [
    {
      key: 'weak', icon: AlertTriangle, title: 'Weak words', accent: '#D97706',
      desc: weak > 0 ? weak + ' word' + (weak === 1 ? '' : 's') + ' keep slipping' : 'Clean up tricky words',
      badge: weak > 0 ? weak : null,
    },
    { key: 'listen', icon: Headphones, title: 'Listening', desc: 'Hear a word, pick it' },
    { key: 'writing', icon: PenLine, title: 'Writing', desc: 'Type words from memory' },
    { key: 'fillblank', icon: AlignLeft, title: 'Fill in the blank', desc: 'Complete the sentence' },
    { key: 'builder', icon: Blocks, title: 'Sentence builder', desc: 'Reorder the words' },
    scriptCard,
    // Stroke order only applies to CJK scripts (hanzi/kanji).
    theme.cjk ? { key: 'strokes', icon: Brush, title: 'Stroke order', desc: 'Animated writing' } : null,
    { key: 'words', icon: BookA, title: 'Word list', desc: 'Every word and its status' },
    { key: 'youtube', icon: Play, title: 'Videos', desc: 'Curated listening' },
    { key: 'grammar', icon: GraduationCap, title: 'Grammar guide', desc: 'How the language works' },
  ].filter(Boolean)

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '28px 16px 40px' : '44px 32px 60px' }}>
      <Ghost onClick={onBack} />

      <div style={{ margin: '18px 0 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800 }}>
          <Dumbbell size={17} strokeWidth={1.85} color={accentHex} /> Practice
        </div>
        <h1 style={{ margin: '8px 0 0', fontSize: isMobile ? '30px' : '36px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
          Sharpen your skills
        </h1>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>{systemLabel} · {levelLabel}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(' + (isMobile ? '150px' : '210px') + ', 1fr))', gap: '14px' }}>
        {cards.map(card => (
          <Card key={card.key} card={card} accentHex={accentHex} onClick={() => onNavigate(card.key)} />
        ))}
      </div>
    </div>
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
        borderRadius: '18px', padding: '20px', fontFamily: 'Inter, sans-serif',
        boxShadow: hovered ? '0 14px 30px rgba(24,24,27,0.08)' : '0 2px 10px rgba(24,24,27,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
        display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '128px',
      }}
    >
      <div style={{
        width: '44px', height: '44px', borderRadius: '13px',
        background: color + '14', border: '1px solid ' + color + '24',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} strokeWidth={1.85} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)' }}>{card.title}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>{card.desc}</div>
      </div>
      {card.badge != null && (
        <span style={{
          position: 'absolute', top: '16px', right: '16px',
          fontSize: '12px', fontWeight: 750, color: '#B45309',
          background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.28)',
          borderRadius: '999px', padding: '2px 9px',
        }}>{card.badge}</span>
      )}
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
