import { useState } from 'react'
import { getLevelLabel, getSystemLabel } from './utils'
import InfoTip from './InfoTip'
import { Flame, Layers, BookOpen, Play, PenLine, ArrowRight } from 'lucide-react'

// Neutral sage green for the primary CTA (see CLAUDE.md redesign spec)
const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

function FlowStep({ icon, label, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = icon
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        padding: '14px 10px', borderRadius: '14px', cursor: 'pointer',
        background: hovered ? '#F7F7F5' : 'transparent',
        transition: 'background 140ms ease', minWidth: '76px',
      }}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: '11px',
        background: `${accentHex}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} strokeWidth={1.75} color={accentHex} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500, color: '#52525B' }}>{label}</span>
    </div>
  )
}

export default function Home({ profile, track, counts, onNavigate }) {
  const [ctaHovered, setCtaHovered] = useState(false)

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'
  const langFont = profile.active_language === 'japanese' ? "'Noto Sans JP'" : "'Noto Sans SC'"
  const systemLabel = getSystemLabel(track.system)
  const levelSuffix = getLevelLabel(profile.active_language, track.system, track.current_level)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const masteryPct = counts.totalWords > 0
    ? Math.min(100, Math.round((counts.masteredCount / counts.totalWords) * 100))
    : 0

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '52px 32px 60px' }}>

      {/* ── Header: language identity + streak ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px' }}>
        <div>
          <div style={{ fontSize: '52px', fontWeight: 700, color: accentHex, lineHeight: 1, fontFamily: langFont }}>
            {langChars}
          </div>
          <div style={{ fontSize: '14px', color: '#71717A', marginTop: '8px', letterSpacing: '0.2px' }}>
            {systemLabel} · {levelSuffix}
          </div>
        </div>

        {/* Streak indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '20px',
          background: '#FEF3C7', border: '1px solid #FDE68A',
        }}>
          <Flame size={17} strokeWidth={2} color="#D97706" />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#D97706' }}>{profile.streak || 0}</span>
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#B45309' }}>day streak</span>
        </div>
      </div>

      {/* ── Today card ── */}
      <div style={{
        background: '#fff', borderRadius: '20px', border: '1px solid #E7E5E4',
        boxShadow: '0 2px 16px rgba(0,0,0,0.05)', padding: '28px 32px', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#18181B' }}>Today</span>
          <span style={{
            fontSize: '12px', color: totalDue > 0 ? accentHex : '#71717A',
            background: totalDue > 0 ? `${accentHex}10` : '#F4F4F5',
            padding: '4px 12px', borderRadius: '20px', fontWeight: 500,
          }}>
            {totalDue > 0 ? 'Cards waiting' : 'All caught up ✓'}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '24px' }}>
          Your current study queue
        </div>

        {/* New / Learning / Due */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'New', value: counts.newCount, color: '#3E63DD', bg: '#EEF2FF' },
            { label: 'Learning', value: counts.learnCount, color: '#D97706', bg: '#FFFBEB' },
            { label: 'Due', value: counts.dueCount, color: '#2F9E6D', bg: '#ECFDF5' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ textAlign: 'center', padding: '16px 12px', background: bg, borderRadius: '14px' }}>
              <div style={{ fontSize: '34px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '12px', color: '#71717A', marginTop: '6px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Mastery */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: '#18181B' }}>
              Mastery
              <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed — mastery comes from reviewing correctly over time, across multiple days." />
            </span>
            <span style={{ fontSize: '13px', color: '#71717A' }}>
              <span style={{ fontWeight: 600, color: '#18181B' }}>{counts.masteredCount}</span>
              /{counts.totalWords} · {masteryPct}%
            </span>
          </div>
          <div style={{ height: '7px', background: '#E7E5E4', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: `linear-gradient(90deg, ${accentHex}, ${accentHex}bb)`,
              width: `${masteryPct}%`, transition: 'width .7s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── Primary CTA ── */}
      <button
        onClick={() => onNavigate('study')}
        onMouseEnter={() => setCtaHovered(true)}
        onMouseLeave={() => setCtaHovered(false)}
        style={{
          width: '100%', padding: '18px 24px', borderRadius: '16px', border: 'none',
          background: ctaHovered ? SAGE_DARK : SAGE, color: '#fff',
          fontSize: '16px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          boxShadow: ctaHovered ? '0 8px 24px rgba(110,132,102,0.32)' : '0 2px 10px rgba(110,132,102,0.22)',
          transform: ctaHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'all 160ms ease', marginBottom: '28px',
        }}
      >
        Start studying
        <ArrowRight size={19} strokeWidth={2.2} color="#fff" />
      </button>

      {/* ── Keep the flow going ── */}
      <div style={{
        background: '#fff', borderRadius: '18px', border: '1px solid #E7E5E4',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '22px 24px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#18181B', marginBottom: '14px' }}>
          Keep the flow going
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <FlowStep icon={Layers} label="Flashcards" accentHex={accentHex} onClick={() => onNavigate('study')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={BookOpen} label="Stories" accentHex={accentHex} onClick={() => onNavigate('stories')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={Play} label="Videos" accentHex={accentHex} onClick={() => onNavigate('youtube')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={PenLine} label="Writing" accentHex={accentHex} onClick={() => onNavigate('writing')} />
        </div>
      </div>
    </div>
  )
}
