import { useState } from 'react'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { liveStreak, streakStatus } from './streak'
import { levelInfo, levelTitle } from './xp'
import InfoTip from './InfoTip'
import { CountUp } from './ui'
import { useIsMobile } from './useIsMobile'
import { Flame, Layers, BookOpen, Play, PenLine, ArrowRight, Check, Sunrise, Gauge, Dumbbell, Snowflake } from 'lucide-react'
import { fluencyScore, fluencyRank } from './fluency'

// Neutral sage green for the primary CTA (see CLAUDE.md redesign spec)
const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

// Compact circular progress ring for the daily new-card goal.
function GoalRing({ done, goal, accentHex, complete }) {
  const size = 62
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = goal > 0 ? Math.min(1, done / goal) : 0
  const ringColor = complete ? '#2F9E6D' : accentHex
  return (
    <div style={{ position: 'relative', width: size + 'px', height: size + 'px', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .7s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {complete ? (
          <Check size={24} strokeWidth={2.4} color="#2F9E6D" />
        ) : (
          <span style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)', lineHeight: 1 }}>
            {done}<span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>/{goal}</span>
          </span>
        )}
      </div>
    </div>
  )
}

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
  const [ctaHovered, setCtaHovered] = useState(false)
  const isMobile = useIsMobile()

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langChars = theme.nativeName
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelSuffix = getLevelLabel(profile.active_language, track.system, track.current_level)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const masteryPct = counts.totalWords > 0
    ? Math.min(100, Math.round((counts.masteredCount / counts.totalWords) * 100))
    : 0

  // Daily new-card goal progress.
  const goal = profile.daily_new_cards || 0
  const doneToday = counts.newDoneToday || 0
  const goalComplete = goal > 0 && doneToday >= goal
  const noNewLeft = !goalComplete && counts.newCount === 0
  const dueTomorrow = counts.dueTomorrow || 0

  // Fluency score (lifetime vocabulary command across all levels).
  const fScore = fluencyScore(counts)
  const fRank = fluencyRank(fScore)
  const fMastered = counts.lifetimeMastered || 0
  const fLearning = Math.max(0, (counts.lifetimeLearned || 0) - fMastered)

  // Guided "next step" in the daily loop: clear the flashcard queue first, then
  // move to reading immersion. This turns Home from a menu into a coach.
  const rec = totalDue > 0
    ? {
        key: 'study', label: 'Review & learn', icon: Layers,
        reason: totalDue + ' card' + (totalDue === 1 ? '' : 's') + ' waiting in your queue',
      }
    : {
        key: 'stories', label: 'Read a story', icon: BookOpen,
        reason: 'Flashcards are clear — immerse to lock the words in',
      }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '28px 16px 40px' : '52px 32px 60px' }}>

      {/* ── Header: language identity + streak ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px' }}>
        <div>
          <div style={{ fontSize: '52px', fontWeight: 700, color: accentHex, lineHeight: 1, fontFamily: langFont }}>
            {langChars}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', letterSpacing: '0.2px' }}>
            {systemLabel} · {levelSuffix}
          </div>
        </div>

        {/* Streak + account level */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '20px',
            background: 'rgba(217,119,6,0.13)', border: '1px solid rgba(217,119,6,0.30)',
          }}>
            <Flame size={17} strokeWidth={2} color="#D97706" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#D97706' }}>{liveStreak(profile)}</span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#B45309' }}>day streak</span>
          </div>
          {(() => {
            const st = streakStatus(profile)
            if (st === 'due_today') {
              return (
                <span style={{ fontSize: '11px', fontWeight: 650, color: '#D97706', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Sunrise size={13} strokeWidth={2} color="#D97706" /> Study today to keep it
                </span>
              )
            }
            if (st === 'frozen') {
              return (
                <span style={{ fontSize: '11px', fontWeight: 650, color: '#3E63DD', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Snowflake size={13} strokeWidth={2} color="#3E63DD" /> Freeze protecting your streak · {profile.streak_freezes || 0} left
                </span>
              )
            }
            return null
          })()}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 14px', borderRadius: '20px',
            background: `${accentHex}12`, border: '1px solid ' + accentHex + '2E',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 750, color: accentHex }}>
              Lv {levelInfo(profile.total_xp).level} · {levelTitle(levelInfo(profile.total_xp).level)}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>{levelInfo(profile.total_xp).pct}%</span>
          </div>
        </div>
      </div>

      {/* ── Today card ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.05)', padding: isMobile ? '22px 18px' : '28px 32px', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>Today</span>
              <span style={{
                fontSize: '12px', color: totalDue > 0 ? accentHex : 'var(--text-muted)',
                background: totalDue > 0 ? `${accentHex}10` : 'var(--surface-2)',
                padding: '4px 12px', borderRadius: '20px', fontWeight: 500,
              }}>
                {totalDue > 0 ? 'Cards waiting' : 'All caught up ✓'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {goalComplete
                ? 'Daily goal complete — nice work.'
                : noNewLeft
                  ? 'No new cards left at this level.'
                  : 'Daily goal: ' + doneToday + ' of ' + goal + ' new cards'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <GoalRing done={doneToday} goal={goal} accentHex={accentHex} complete={goalComplete} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)' }}>Daily goal</span>
          </div>
        </div>

        {/* New / Learning / Due */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'New', value: counts.newCount, color: '#3E63DD' },
            { label: 'Learning', value: counts.learnCount, color: '#D97706' },
            { label: 'Due', value: counts.dueCount, color: '#2F9E6D' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '16px 12px', background: color + '14', border: '1px solid ' + color + '26', borderRadius: '14px' }}>
              <div style={{ fontSize: '34px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Mastery */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Mastery
              <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed — mastery comes from reviewing correctly over time, across multiple days." />
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{counts.masteredCount}</span>
              /{counts.totalWords} · {masteryPct}%
            </span>
          </div>
          <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: `linear-gradient(90deg, ${accentHex}, ${accentHex}bb)`,
              width: `${masteryPct}%`, transition: 'width .7s ease',
            }} />
          </div>
        </div>

        {/* ── Tomorrow forecast ── */}
        {dueTomorrow > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px',
            paddingTop: '16px', borderTop: '1px solid var(--border)',
            fontSize: '13px', color: 'var(--text-muted)',
          }}>
            <Sunrise size={16} strokeWidth={1.9} color="#D97706" />
            <span><strong style={{ color: 'var(--text)', fontWeight: 650 }}>{dueTomorrow}</strong> review{dueTomorrow === 1 ? '' : 's'} waiting by tomorrow</span>
          </div>
        )}
      </div>

      {/* ── Fluency score ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.05)', padding: isMobile ? '20px 18px' : '24px 32px', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            <Gauge size={17} strokeWidth={1.9} color={accentHex} />
            {theme.languageName} fluency
          </span>
          <span style={{
            fontSize: '12px', fontWeight: 700, color: accentHex,
            background: `${accentHex}12`, border: '1px solid ' + accentHex + '2E',
            padding: '4px 12px', borderRadius: '20px',
          }}>
            {fRank.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '40px', fontWeight: 750, color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            <CountUp value={fScore} />
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-faint)', fontWeight: 600 }}>pts</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: fRank.next ? '14px' : 0 }}>
          {fMastered} word{fMastered === 1 ? '' : 's'} mastered · {fLearning} learning
        </div>
        {fRank.next && (
          <div>
            <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '4px',
                background: `linear-gradient(90deg, ${accentHex}, ${accentHex}bb)`,
                width: `${fRank.pct}%`, transition: 'width .7s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '8px' }}>
              {fRank.next.min - fScore} pts to {fRank.next.name}
            </div>
          </div>
        )}
      </div>

      {/* ── Recommended next step ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 750, letterSpacing: '0.3px', textTransform: 'uppercase', color: accentHex }}>Next up</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{rec.reason}</span>
      </div>
      <button
        onClick={() => onNavigate(rec.key)}
        onMouseEnter={() => setCtaHovered(true)}
        onMouseLeave={() => setCtaHovered(false)}
        style={{
          width: '100%', padding: '18px 24px', borderRadius: '16px', border: 'none',
          background: ctaHovered ? SAGE_DARK : SAGE, color: '#fff',
          fontSize: '16px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
          boxShadow: ctaHovered ? '0 8px 24px rgba(110,132,102,0.32)' : '0 2px 10px rgba(110,132,102,0.22)',
          transform: ctaHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'all 160ms ease', marginBottom: '14px',
        }}
      >
        <rec.icon size={19} strokeWidth={2.1} color="#fff" />
        {rec.label}
        <ArrowRight size={19} strokeWidth={2.2} color="#fff" />
      </button>

      {/* ── Practice hub entry (with a weak-word nudge when relevant) ── */}
      <button
        onClick={() => onNavigate('practice')}
        style={{
          width: '100%', padding: '14px 20px', borderRadius: '14px',
          border: '1px solid ' + accentHex + '33', background: accentHex + '0D',
          color: accentHex, fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginTop: '0', marginBottom: '28px',
        }}
      >
        <Dumbbell size={17} strokeWidth={2} color={accentHex} />
        {counts.weakCount > 0
          ? 'Practice · ' + counts.weakCount + ' weak word' + (counts.weakCount === 1 ? '' : 's')
          : 'Practice'}
      </button>

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
    </div>
  )
}
