import { useEffect, useState } from 'react'
import { ArrowRight, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard, firstContentChar } from './homeStory'
import { HeroPanel, HeroAction, Panel, Eyebrow } from './panels'
import { MICRO, NUM } from './designTokens'

// ── Home ──────────────────────────────────────────────────────────────────
// Leads with the STORY you have unlocked, not the card queue. That ordering is
// the product's own thesis — "every word you learn becomes part of a story you
// can read" — so the queue is the means and the story is the point.
//
// One lit panel, everything else flat. See designTokens.js for the rules.
//
// The single primary button adapts: it clears the queue first when cards are
// due and opens the story when they are not. Home surfaces ONE next action —
// a coach, not a menu.

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = ink(accentHex)
  const langFont = theme.font

  const langChar = firstContentChar(theme.nativeName) || theme.nativeName.slice(0, 1)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const pct = totalWords > 0 ? Math.min(100, Math.round((learned / totalWords) * 100)) : 0

  // Daily new-card goal, shown inside the queue block it belongs to.
  const goal = profile.daily_new_cards || 0
  const doneToday = counts.newDoneToday || 0

  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  const userId = session?.user?.id
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(res => { if (alive) setDaily(res) })
    return () => { alive = false }
  }, [userId, track, learned])

  // One action. Cards while there are cards; once the queue is clear the next
  // step in the daily loop is reading, so the button hands over to Stories.
  const action = totalDue > 0
    ? { label: 'Start reviewing', go: 'study' }
    : { label: 'Read a story', go: 'stories' }

  const today = new Date()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>

      {/* ── Where you are, and when ── */}
      <div className="hd-rise" style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '12px', marginBottom: '16px',
      }}>
        <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today
        </h1>
        <Eyebrow>{levelLabel} · {WEEKDAY[today.getDay()]}</Eyebrow>
      </div>

      {/* ── Welcome back after a break ── */}
      {gentleActive && (
        <div role="status" aria-live="polite" className="hd-rise" style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
          background: `color-mix(in srgb, ${accentHex} 7%, var(--surface))`,
          border: '1px solid color-mix(in srgb, ' + accentHex + ' 26%, var(--border))',
          borderLeft: `3px solid ${accentHex}`, borderRadius: '14px',
          padding: '14px 16px', animationDelay: '40ms',
        }}>
          <Sunrise size={20} strokeWidth={1.9} color={accentInk} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13.5px', color: 'var(--text)', fontWeight: 550, lineHeight: 1.5 }}>
            {gentleReturnMessage(gentleReady)}
          </span>
        </div>
      )}

      {/* ── The one lit block: today's cards ── */}
      <HeroPanel
        accentHex={accentHex}
        seed={profile.active_language}
        watermark={langChar}
        watermarkFont={langFont}
        compact={isMobile}
        onClick={() => onNavigate(action.go)}
        style={{ marginBottom: '14px' }}
      >
        {({ hovered }) => (
          <QueueBody
            counts={counts}
            totalDue={totalDue}
            goal={goal}
            doneToday={doneToday}
            isMobile={isMobile}
            action={action}
            accentHex={accentHex}
            hovered={hovered}
          />
        )}
      </HeroPanel>

      {/* ── The next step in the loop, deliberately quiet. The hero owns the
          screen's action; this is a hand-off, not a rival CTA. ── */}
      {daily && (
        <Panel
          padding={isMobile ? '14px 16px' : '15px 20px'}
          style={{ marginBottom: '14px', animationDelay: '80ms', cursor: 'pointer' }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('stories')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('stories') } }}
            className="hd-press"
            style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow style={{ display: 'block', marginBottom: '5px' }}>Then read</Eyebrow>
              <div style={{
                fontFamily: langFont, fontSize: '15px', fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {daily.sentence}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {daily.story.title} · you know {daily.knownPct}% of it
              </div>
            </div>
            <ArrowRight size={18} strokeWidth={2.1} color={accentInk} style={{ flexShrink: 0 }} />
          </div>
        </Panel>
      )}

      {/* ── Progress toward the next level ── */}
      <Panel
        padding={isMobile ? '16px 16px 14px' : '18px 20px 16px'}
        style={{ animationDelay: '140ms' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)' }}>
            Toward {nextLevelLabel}
          </span>
          <span style={{ ...NUM, fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {learned} of {totalWords} words
          </span>
        </div>

        <div
          role="img"
          aria-label={learned + ' of ' + totalWords + ' words learned toward ' + nextLevelLabel + ' — ' + pct + '%'}
          style={{ height: '5px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}
        >
          <div style={{
            width: pct + '%', height: '100%', borderRadius: '999px',
            background: accentInk, transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
          }} />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '10px', textAlign: 'center' }}>
          {counts.learnCount} learning
          {counts.dueTomorrow > 0 && ' · about ' + counts.dueTomorrow + ' due tomorrow'}
        </div>
      </Panel>
    </div>
  )
}

// The hero's contents: the whole block is about today's flashcards — how many
// are waiting, how the day's goal is going, and the one button that starts it.
function QueueBody({ counts, totalDue, goal, doneToday, isMobile, action, accentHex, hovered }) {
  const clear = totalDue === 0
  const goalComplete = goal > 0 && doneToday >= goal

  return (
    <div>
      <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
        {clear ? 'Queue clear' : 'Ready to review'}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '10px 0 6px' }}>
        <span style={{
          ...NUM, color: '#fff', lineHeight: 0.95,
          fontSize: isMobile ? '52px' : '64px', fontWeight: 700, letterSpacing: '-0.04em',
        }}>
          {clear ? '\u2713' : totalDue}
        </span>
        <span style={{ fontSize: isMobile ? '15px' : '17px', fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
          {clear ? 'all caught up' : 'card' + (totalDue === 1 ? '' : 's') + ' waiting'}
        </span>
      </div>

      {/* The queue's own breakdown, inside the block that is about it. */}
      {!clear && (
        <div style={{ display: 'flex', gap: isMobile ? '14px' : '20px', flexWrap: 'wrap', marginTop: '12px' }}>
          {[
            ['New', counts.newCount],
            ['Learning', counts.learnCount],
            ['Due', counts.dueCount],
          ].map(([label, value]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ ...NUM, fontSize: '17px', fontWeight: 700, color: '#fff' }}>{value}</span>
              <span style={{ ...MICRO, fontSize: '9.5px', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: '12px' }}>
        {goalComplete
          ? 'Daily goal complete — nice work.'
          : goal > 0
            ? 'Daily goal: ' + doneToday + ' of ' + goal + ' new cards'
            : 'No daily goal set.'}
      </div>

      <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
    </div>
  )
}
