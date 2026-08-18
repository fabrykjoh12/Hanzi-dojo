import { useEffect, useState } from 'react'
import { ArrowRight, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard, firstContentChar } from './homeStory'
import { homeDailyStage, homeProgressPct } from './homePresentation'
import {
  aheadLine, goalLine, heroAriaLabel, homeAction, homeHeaderMeta,
  queueBreakdown, queueHeadline, storyMetaLine, storyStatus, weekLine,
} from './homeModel'
import { HeroPanel, HeroAction, Panel, Eyebrow } from './panels'
import { weekdayInitial } from './studyRhythm'
import { forecastSummary } from './reviewForecast'
import { sessionEstimateLabel } from './sessionEstimate'
import { prepareStudySession } from './sessionPrep'
import { stripLeadingNumber } from './storyArcs'
import { ProfileGlyph } from './HomeV2NavGlyphs'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'
import { MICRO, NUM } from './designTokens'

// ── Home ──────────────────────────────────────────────────────────────────
// The one lit block is TODAY'S FLASHCARDS, end to end: how many cards are
// waiting, the New/Learning/Review breakdown, the daily goal, and the button
// that starts the session. Everything about the queue lives in the block that
// is about the queue.
//
// The story you have unlocked is a quiet flat hand-off underneath — the next
// step in the daily loop (cards, then read), deliberately not styled as a
// button so it cannot compete with the hero. Home surfaces ONE action: it is a
// coach, not a menu. The story itself gets the hero treatment on Stories.
//
// One lit panel, everything else flat. See designTokens.js for the rules.

export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none
  const [tourSteps, setTourSteps] = useState(null)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = ink(accentHex)
  const langFont = theme.font

  const langChar = firstContentChar(theme.nativeName) || theme.nativeName.slice(0, 1)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0

  // Daily new-card goal, shown inside the queue block it belongs to.
  const goal = profile.daily_new_cards || 0
  const doneToday = counts.newDoneToday || 0

  // The week behind (which days had a session) and the load ahead.
  const rhythm = counts.rhythm7 || []
  const { total: forecastTotal, perDay } = forecastSummary(counts.forecast7 || [])

  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  const userId = session?.user?.id
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned)
      .then(res => { if (alive) setDaily(res) })
      .catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])

  // Prepare the study session while the learner is reading Home — Study
  // consumes the same prepared data, so tapping the hero opens the session
  // with the first real card already on screen. Kicks off strictly after the
  // window load event (chunk/data requests started before it would delay it),
  // and again whenever the queue counts move.
  const queueSignature = (counts.dueCount || 0) + ':' + (counts.learnCount || 0) + ':' + (counts.newCount || 0)
  useEffect(() => {
    let timer
    if (!userId) return undefined
    const kick = () => {
      timer = setTimeout(() => {
        prepareStudySession({ userId, profile, track })
        import('./Study').catch(() => {})
        import('./Stories').catch(() => {})
      }, 250)
    }
    if (document.readyState === 'complete') kick()
    else window.addEventListener('load', kick, { once: true })
    return () => { window.removeEventListener('load', kick); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, track, queueSignature])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'home', profileCreatedAt: profile.created_at })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [profile.created_at])

  // Where the daily loop stands (drives the hand-off's status line and the
  // data-home-stage hook the e2e specs assert on).
  const stage = homeDailyStage({ counts, daily })
  const story = daily ? daily.story : null
  const storyTitle = story ? stripLeadingNumber(story.title) : ''

  // One action. Cards while there are cards; once the queue is clear the next
  // step in the daily loop is reading — straight into today's story when one
  // is picked, the shelf otherwise.
  const action = homeAction(counts)
  const openStory = () => onNavigate('stories', story ? { storyId: story.id } : undefined)
  const heroGo = () => { if (action.go === 'study') onNavigate('study'); else openStory() }

  const estimate = sessionEstimateLabel(counts)

  return (
    <div data-home-stage={stage} style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>

      {/* ── Where you are, and when ── */}
      <header className="hd-rise" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', marginBottom: '16px',
      }}>
        <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today
        </h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Eyebrow>{homeHeaderMeta(levelLabel)}</Eyebrow>
          <button type="button" aria-label="Open profile" onClick={() => onNavigate('profile')} className="hd-press" style={{ width: '34px', height: '34px', padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', '--primary-bright': 'var(--text-faint)', '--primary-fill': 'var(--text-muted)', '--primary-pressed': 'var(--text-muted)' }}>
            <ProfileGlyph size={19} active={false} color="currentColor" />
          </button>
        </span>
      </header>

      {/* ── Welcome back after a break ── */}
      {gentleActive && (
        <div role="status" aria-live="polite" className="hd-rise" style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
          background: `color-mix(in srgb, ${accentHex} 7%, var(--surface))`,
          border: '1px solid color-mix(in srgb, ' + accentHex + ' 26%, var(--border))',
          borderLeft: `3px solid ${accentHex}`, borderRadius: '14px',
          padding: '14px 16px', animationDelay: '20ms',
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
        onClick={heroGo}
        dataTour="home-queue"
        ariaLabel={heroAriaLabel({ counts, estimate })}
        style={{ marginBottom: '14px', animationDelay: '40ms' }}
      >
        {({ hovered }) => (
          <QueueBody
            counts={counts}
            estimate={estimate}
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
      {story && (
        <Panel
          padding={isMobile ? '14px 16px' : '15px 20px'}
          dataTour="home-then-read"
          style={{ marginBottom: '14px', animationDelay: '80ms', cursor: 'pointer' }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={'Then read: ' + storyTitle}
            onClick={openStory}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStory() } }}
            className="hd-press"
            style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '5px' }}>
                <Eyebrow>Then read</Eyebrow>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: stage === 'story' ? accentInk : 'var(--text-faint)' }}>
                  {storyStatus({ stage, daily })}
                </span>
              </div>
              <div lang={theme.langTag} style={{
                fontFamily: langFont, fontSize: '15px', fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {daily.sentence}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {storyMetaLine({ title: storyTitle, knownPct: daily.knownPct })}
              </div>
            </div>
            <ArrowRight size={18} strokeWidth={2.1} color={accentInk} style={{ flexShrink: 0 }} />
          </div>
        </Panel>
      )}

      {/* ── Your week: the rhythm behind you and the load ahead. This is the
          return hook — "25 waiting tomorrow" is a reason to come back that
          doesn't depend on guilt. Observational copy only: the app's stated
          stance is no streak pressure, so there is no counter to protect and
          nothing to "keep". ── */}
      <Panel
        padding={isMobile ? '16px 16px 14px' : '18px 20px 16px'}
        dataTour="home-week"
        style={{ marginBottom: '14px', animationDelay: '140ms' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <Eyebrow>Your week</Eyebrow>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {weekLine(rhythm)}
          </span>
        </div>

        <div
          role="img"
          aria-label={weekLine(rhythm)}
          style={{ display: 'flex', gap: '6px' }}
        >
          {rhythm.map(day => (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '100%', height: '30px', borderRadius: '8px',
                background: day.studied
                  ? accentInk
                  : `color-mix(in srgb, ${accentHex} 8%, var(--surface-2))`,
                // Today is outlined rather than filled until it's earned — the
                // ring is an invitation, the fill is the record.
                boxShadow: day.isToday && !day.studied
                  ? 'inset 0 0 0 2px ' + `color-mix(in srgb, ${accentHex} 45%, transparent)`
                  : 'none',
              }} />
              <span style={{
                ...MICRO, fontSize: '9.5px',
                color: day.isToday ? 'var(--text)' : 'var(--text-faint)',
              }}>
                {weekdayInitial(day.date)}
              </span>
            </div>
          ))}
        </div>

        {/* ── Toward the next level, inside the same panel. The week behind
            you and the road ahead are one story, and on a phone two separate
            panels of numbers made Home read as a dashboard. ── */}
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)' }}>
              Toward {nextLevelLabel}
            </span>
            <span style={{ ...NUM, fontSize: '12.5px', color: 'var(--text-muted)' }}>
              {learned} of {totalWords} words
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={learned + ' of ' + totalWords + ' words learned toward ' + nextLevelLabel}
            aria-valuenow={learned}
            aria-valuemin="0"
            aria-valuemax={totalWords}
            style={{ height: '5px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}
          >
            <div style={{
              width: homeProgressPct(learned, totalWords) + '%', height: '100%', borderRadius: '999px',
              background: accentInk, transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>

          {/* One quiet line for what's ahead. */}
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '10px', textAlign: 'center' }}>
            {aheadLine({ dueTomorrow: counts.dueTomorrow || 0, forecastTotal, perDay })}
          </div>
        </div>
      </Panel>

      {tourSteps && (
        <TourOverlay
          steps={tourSteps}
          accentHex={accentHex}
          onClose={(outcome) => {
            setTourSteps(null)
            if (outcome) markTourSeen('home', outcome)
          }}
        />
      )}
    </div>
  )
}

// The hero's contents: the whole block is about today's flashcards — how many
// are waiting, what the session is made of, how the day's goal is going, and
// the one button that starts it.
function QueueBody({ counts, estimate, goal, doneToday, isMobile, action, accentHex, hovered }) {
  const headline = queueHeadline(counts)
  const clear = !headline.failed && headline.value === '✓'

  // The counts never arrived, so every number here is a meaningless zero. Say
  // so plainly instead of showing the ✓ — Study loads its own queue fresh, so
  // the usual button is the honest retry.
  if (headline.failed) {
    return (
      <div>
        <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
          {headline.eyebrow}
        </span>

        <div style={{
          fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#fff',
          lineHeight: 1.3, margin: '12px 0 6px',
        }}>
          {headline.caption}
        </div>

        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: '12px' }}>
          Check your connection — starting a session loads it fresh.
        </div>

        <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
      </div>
    )
  }

  return (
    <div>
      <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
        {headline.eyebrow}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '10px 0 6px' }}>
        <span style={{
          ...NUM, color: '#fff', lineHeight: 0.95,
          // A phone screen holds four blocks; a 52px numeral made this one
          // read as the whole page. The number only needs to win the panel.
          fontSize: isMobile ? '40px' : '64px', fontWeight: 700, letterSpacing: '-0.04em',
        }}>
          {headline.value}
        </span>
        <span style={{ fontSize: isMobile ? '15px' : '17px', fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
          {headline.caption}
          {/* Session length from the ACTUAL queue (see sessionEstimate.js). */}
          {!clear && estimate && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              {' · ' + estimate}
            </span>
          )}
        </span>
      </div>

      {/* The queue's composition — what the session is made of, on every
          viewport: the session you are about to start is the one thing Home
          must be specific about. */}
      {!clear && (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px' }}>
          {queueBreakdown(counts).map(({ label, value }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ ...NUM, fontSize: '17px', fontWeight: 700, color: '#fff' }}>{value}</span>
              <span style={{ ...MICRO, fontSize: '9.5px', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: '12px' }}>
        {goalLine({ goal, doneToday })}
      </div>

      <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
    </div>
  )
}
