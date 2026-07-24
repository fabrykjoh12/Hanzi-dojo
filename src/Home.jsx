import { useState } from 'react'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { Layers, BookOpen, Play, PenLine, ArrowRight, Sunrise, MessagesSquare } from 'lucide-react'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'

function FlowStep({ icon, label, accentHex, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = icon
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        padding: '14px 10px', borderRadius: '14px', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        background: active ? `${accentHex}0D` : (hovered ? 'var(--surface-2)' : 'transparent'),
        border: '1px solid ' + (active ? accentHex + '33' : 'transparent'),
        transition: 'background 140ms ease', minWidth: '76px',
      }}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: '11px',
        background: active ? accentHex : `${accentHex}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} strokeWidth={1.75} color={active ? '#fff' : accentHex} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: active ? 700 : 500, color: active ? accentHex : 'var(--text-muted)' }}>{label}</span>
    </button>
  )
}

export default function Home({ profile, track, counts, onNavigate }) {
  const [dojoHovered, setDojoHovered] = useState(false)
  const isMobile = useIsMobile()

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langChars = theme.nativeName
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelSuffix = getLevelLabel(profile.active_language, track.system, track.current_level)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount

  // Daily new-card goal progress.
  const goal = profile.daily_new_cards || 0
  const doneToday = counts.newDoneToday || 0
  const goalComplete = goal > 0 && doneToday >= goal
  const noNewLeft = !goalComplete && counts.newCount === 0

  // Gentle return: after a break, Study caps the overdue backlog to a calm
  // handful. Surface a warm welcome-back banner only when that cap actually bites
  // (a real backlog), so a small return doesn't get a needless message.
  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  // Guided "next step" in the daily loop: clear the flashcard queue first, then
  // move to reading immersion. This turns Home from a menu into a coach.
  const rec = totalDue > 0
    ? {
        key: 'study', label: 'Review & unlock', icon: Layers,
        reason: totalDue + ' card' + (totalDue === 1 ? '' : 's') + ' to clear — then read what you know',
      }
    : {
        key: 'stories', label: 'Read a story', icon: BookOpen,
        reason: 'Queue clear — read a story to lock today’s words in',
      }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '28px 16px 40px' : '52px 32px 60px' }}>

      {/* ── Header: language identity ── */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ fontSize: '52px', fontWeight: 700, color: accentHex, lineHeight: 1, fontFamily: langFont }}>
          {langChars}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', letterSpacing: '0.2px' }}>
          {systemLabel} · {levelSuffix}
        </div>
      </div>

      {/* ── Welcome back (gentle return) ── */}
      {gentleActive && (
        <div role="status" aria-live="polite" style={{
          display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '20px',
          background: `${accentHex}0D`, border: '1px solid ' + accentHex + '2A',
          borderRadius: '16px', padding: isMobile ? '14px 16px' : '16px 20px',
        }}>
          <Sunrise size={20} strokeWidth={1.9} color={accentHex} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13.5px', color: 'var(--text)', fontWeight: 550, lineHeight: 1.5 }}>
            {gentleReturnMessage(gentleReady)}
          </span>
        </div>
      )}

      {/* ── Today card ── the whole card is tappable, so starting today's
          cards is always one obvious tap away. ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(rec.key)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(rec.key) } }}
        onMouseEnter={() => setDojoHovered(true)}
        onMouseLeave={() => setDojoHovered(false)}
        style={{
          background: 'var(--surface)', borderRadius: '20px',
          border: '1px solid ' + (dojoHovered ? accentHex + '55' : 'var(--border)'),
          boxShadow: dojoHovered ? '0 6px 22px rgba(0,0,0,0.08)' : '0 2px 16px rgba(0,0,0,0.05)',
          padding: isMobile ? '30px 20px' : '40px 44px', marginBottom: '28px',
          cursor: 'pointer', transition: 'border-color 160ms ease, box-shadow 160ms ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>Today’s Dojo</span>
              {totalDue > 0 ? (
                <span style={{
                  fontSize: '13px', color: accentHex, background: `${accentHex}10`,
                  padding: '5px 14px', borderRadius: '20px', fontWeight: 500,
                  border: '1px solid ' + accentHex + '26',
                }}>
                  Cards waiting
                </span>
              ) : (
                <span style={{
                  fontSize: '13px', color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                  padding: '5px 14px', borderRadius: '20px', fontWeight: 500,
                }}>
                  All caught up ✓
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {goalComplete
                ? 'Daily goal complete — nice work.'
                : noNewLeft
                  ? 'No new cards left at this level.'
                  : 'Daily goal: ' + doneToday + ' of ' + goal + ' new cards'}
            </div>
          </div>
          <ArrowRight size={24} strokeWidth={2.2} color={dojoHovered ? accentHex : 'var(--text-faint)'} style={{ flexShrink: 0, transition: 'color 160ms ease' }} />
        </div>

        {/* New / Learning / Due */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          {[
            { label: 'New', value: counts.newCount, color: '#3E63DD' },
            { label: 'Learning', value: counts.learnCount, color: '#D97706' },
            { label: 'Due', value: counts.dueCount, color: '#2F9E6D' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '22px 14px', background: color + '14', border: '1px solid ' + color + '26', borderRadius: '16px' }}>
              <div style={{ fontSize: '44px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Keep the flow going ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '22px 24px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '14px' }}>
          Your daily loop
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <FlowStep icon={Layers} label="Flashcards" accentHex={accentHex} active={rec.key === 'study'} onClick={() => onNavigate('study')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={BookOpen} label="Stories" accentHex={accentHex} active={rec.key === 'stories'} onClick={() => onNavigate('stories')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={Play} label="Videos" accentHex={accentHex} onClick={() => onNavigate('youtube')} />
          <ArrowRight size={16} strokeWidth={2} color="#D4D4D8" />
          <FlowStep icon={PenLine} label="Writing" accentHex={accentHex} onClick={() => onNavigate('writing')} />
        </div>
      </div>

      {/* ── Community — always-visible Discord entry (hidden until a real invite is set) ── */}
      {isDiscordConfigured() && (
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px',
            background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '18px 20px',
            textDecoration: 'none', fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{
            width: '44px', height: '44px', borderRadius: '13px', flexShrink: 0,
            background: '#5865F214', border: '1px solid #5865F233',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessagesSquare size={22} strokeWidth={1.9} color="#5865F2" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>Join our Discord</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '2px' }}>
              Trade study tips, get help, and help shape what we build next.
            </div>
          </div>
          <ArrowRight size={19} strokeWidth={2.1} color="#5865F2" style={{ flexShrink: 0 }} />
        </a>
      )}
    </div>
  )
}
