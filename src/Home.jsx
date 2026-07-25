import { useEffect, useState } from 'react'
import { ArrowRight, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard, firstContentChar } from './homeStory'
import { HeroPanel, HeroAction, Panel, Readout, Eyebrow } from './panels'
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

  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const pct = totalWords > 0 ? Math.min(100, Math.round((learned / totalWords) * 100)) : 0

  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  const userId = session?.user?.id
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(res => { if (alive) setDaily(res) })
    return () => { alive = false }
  }, [userId, track, learned])

  const action = totalDue > 0
    ? { label: 'Review ' + totalDue + ' first', go: 'study' }
    : { label: 'Start reading', go: 'stories' }

  const today = new Date()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>

      {/* ── Where you are, and when ── */}
      <div className="hd-rise" style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '12px', marginBottom: '16px',
      }}>
        <span style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today
        </span>
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

      {/* ── The one lit block ── */}
      <HeroPanel
        accentHex={accentHex}
        seed={profile.active_language}
        watermark={daily?.sentence ? firstContentChar(daily.sentence) : null}
        watermarkFont={langFont}
        compact={isMobile}
        onClick={() => onNavigate(action.go)}
        style={{ marginBottom: '14px' }}
      >
        {({ hovered }) => (
          <HeroBody
            daily={daily}
            langFont={langFont}
            isMobile={isMobile}
            action={action}
            accentHex={accentHex}
            hovered={hovered}
          />
        )}
      </HeroPanel>

      {/* ── Flat readouts. The hero owns the action. ── */}
      <Panel
        padding={isMobile ? '0 14px' : '0 20px'}
        style={{ display: 'flex', marginBottom: '14px', animationDelay: '80ms' }}
      >
        <Readout
          first
          value={counts.dueCount + counts.learnCount}
          label="words due for review"
          tone={accentInk}
          compact={isMobile}
        />
        <Readout
          value={counts.newCount}
          label="new words today"
          tone="var(--text)"
          compact={isMobile}
        />
      </Panel>

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

// The hero's contents. Split out so the panel stays a generic container and
// this stays about what Home has to say.
function HeroBody({ daily, langFont, isMobile, action, accentHex, hovered }) {
  return (
    <div>
      <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
        {daily === null ? 'Your first words' : 'Unlocked and waiting'}
      </span>

      <div style={{
        fontFamily: langFont, color: '#fff',
        fontSize: isMobile ? '25px' : '31px', fontWeight: 600, lineHeight: 1.32,
        letterSpacing: '0.01em', margin: '10px 0 8px', maxWidth: '17ch',
        minHeight: isMobile ? '33px' : '41px',
      }}>
        {daily === undefined ? '' : daily === null ? 'Learn a few words to unlock your first story' : daily.sentence}
      </div>

      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
        {daily === undefined
          ? ' '
          : daily === null
            ? 'Stories open up as soon as you know enough words to enjoy them.'
            : daily.story.title + ' · you know ' + daily.knownPct + '% of it'}
      </div>

      <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
    </div>
  )
}
