import { useEffect, useState } from 'react'
import { ArrowRight, BookOpenCheck, Lock, Sparkles, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { firstContentChar } from './homeStory'
import { fetchHandoff, trackSignature } from './homeData'
import { query, subscribe } from './dataCache'
import { HOME_HANDOFF } from './cacheEvents'
import { HeroPanel, HeroAction, Panel, Eyebrow, PageHeader } from './panels'
import { rhythmSummary, weekdayInitial } from './studyRhythm'
import { forecastSummary } from './reviewForecast'
import { sessionEstimateLabel } from './sessionEstimate'
import { maybeStartTour, markTourSeen } from './tour'
import { isTutorialDone } from './prelogin'
import { firstSessionPending } from './homeData'
import TourOverlay from './TourOverlay'
import { MICRO, NUM } from './designTokens'

// ── Home ──────────────────────────────────────────────────────────────────
// The one lit block is TODAY'S FLASHCARDS, end to end: how many cards are
// waiting, the New/Learning/Due breakdown, the daily goal, and the button that
// starts the session. Everything about the queue lives in the block that is
// about the queue.
//
// The story you have unlocked is a quiet flat hand-off underneath — the next
// step in the daily loop (cards, then read), deliberately not styled as a
// button so it cannot compete with the hero. Home surfaces ONE action: it is a
// coach, not a menu. The story itself gets the hero treatment on Stories.
//
// One lit panel, everything else flat. See designTokens.js for the rules.

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none
  // Today's story reward: the chapter this session unlocks (or just unlocked).
  // Null when no series is going — the daily-story hand-off shows instead.
  const [rewardTeaser, setRewardTeaser] = useState(null)

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

  // The week behind (which days had a session) and the load ahead. Both were
  // already computed by homeCounts; they were simply not being rendered.
  const rhythm = counts.rhythm7 || []
  const { studiedDays, days: rhythmDays } = rhythmSummary(rhythm)
  const { total: forecastTotal, perDay } = forecastSummary(counts.forecast7 || [])

  const countsLoaded = Boolean(counts.loaded)
  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  const userId = session?.user?.id
  // The signature, not the object: `loadProfile` hands down a freshly-fetched
  // `track` whose fields are usually identical, and depending on its identity
  // ran this whole block a second time on every arrival (homeData.js).
  const trackKey = trackSignature(track)

  // Home can be the screen someone leaves open. Everything else that
  // invalidates the hand-off happens on another screen, so the tab show is what
  // picks it up — but a resume across local midnight (appResume.js) arrives
  // while Home is the thing being looked at, and nothing would re-run without
  // this. One counter, bumped by the cache, re-runs the effect below.
  const [cacheTick, setCacheTick] = useState(0)
  useEffect(() => subscribe(HOME_HANDOFF, () => setCacheTick(t => t + 1)), [])

  /* eslint-disable react-hooks/set-state-in-effect */
  // The hand-off is fetched once and again only when something changed it.
  //
  // This effect re-runs on every tab show — <Activity> re-runs effects by
  // design, and this file must not fight that (NAV-MODEL §2). dataCache is what
  // makes re-running free: a `fresh` read does no network work at all, and an
  // invalidated one keeps the old value on screen while the new one is fetched
  // behind it, so returning to Home never blanks or flashes a skeleton.
  //
  // Gated on `counts.loaded`, because `learned` is an input to the daily pick
  // and starts at 0. Fetching before the counts land would cache a story chosen
  // for a learner who knows nothing.
  useEffect(() => {
    let alive = true
    if (!userId || !track || !countsLoaded) return undefined
    const res = query(HOME_HANDOFF, () => fetchHandoff(userId, track, learned))
    if (res.value) {
      setRewardTeaser(res.value.reward || null)
      setDaily(res.value.daily === undefined ? null : res.value.daily)
    }
    if (res.promise) {
      res.promise.then((settled) => {
        if (!alive || !settled || !settled.ok) return
        setRewardTeaser(settled.value.reward || null)
        setDaily(settled.value.daily === undefined ? null : settled.value.daily)
      })
    }
    return () => { alive = false }
    // `track` is read inside but deliberately not a dependency — trackKey is
    // its value-equal stand-in, and the identity is the bug this replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, trackKey, learned, countsLoaded, cacheTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  // First-run tour: once per device for a new account, on the first Home render.
  // All the rules live in tour.js; the short delay lets the screen settle — and
  // the story hand-off arrive — before anything gets pointed at.
  //
  // Suppressed for anyone who has just been through the onboarding tutorial.
  // They have done a session, watched it complete, watched a story open and
  // read it; being handed four coach marks on arrival would be a second
  // tutorial immediately after the first one, which is exactly the problem the
  // rebuild set out to remove. What the tour still teaches that the tutorial
  // does not is under review — see docs/ONBOARDING-AUDIT.md.
  const [tourSteps, setTourSteps] = useState(null)
  const profileCreatedAt = profile.created_at
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'home', profileCreatedAt, suppressed: isTutorialDone() })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [profileCreatedAt])

  // Nothing has been studied on this track yet — see homeData.firstSessionPending.
  const firstRunNudge = firstSessionPending(counts)

  // One action. Cards while there are cards; once the queue is clear the next
  // step in the daily loop is reading, so the button hands over to Stories.
  // When the counts failed to load, the zeros are meaningless — keep the button
  // on Study, which loads its own queue and so doubles as the retry.
  const action = counts.failed || totalDue > 0
    ? { label: 'Start reviewing', go: 'study' }
    : { label: 'Read a story', go: 'stories' }

  const today = new Date()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>

      {/* ── Where you are, and when ── */}
      <PageHeader title="Today" meta={`${levelLabel} · ${WEEKDAY[today.getDay()]}`} />

      {/* ── Welcome back after a break ── */}
      {gentleActive && (
        <div role="status" aria-live="polite" style={{
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

      {/* ── The learner's very first arrival ──
          One line, in flow, above the panel it is about. Not a modal, not an
          overlay, nothing to dismiss: the tutorial already taught what a card
          is, so all this does is point at the thing to tap. It is derived from
          the account having no cards at all, so it disappears by itself the
          moment the first one is graded — there is no flag to clear and none
          to go stale on an established account. */}
      {firstRunNudge && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px',
          padding: '0 2px', fontSize: '13.5px', fontWeight: 750,
          color: accentInk, fontFamily: 'Inter, sans-serif',
        }}>
          <Sparkles size={16} strokeWidth={2} color={accentInk} style={{ flexShrink: 0 }} />
          Your first session is ready
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
        dataTour="home-queue"
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

      {/* ── Today's story reward: what the session is FOR. Shown when a series
          is going — the locked chapter waiting behind today's flashcards, or
          the one already unlocked. Quiet panel; the hero owns the action. ── */}
      {rewardTeaser && (
        <Panel
          padding={isMobile ? '14px 16px' : '15px 20px'}
          style={{ marginBottom: '14px', animationDelay: '80ms', cursor: 'pointer' }}
          dataTour="home-then-read"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('stories', rewardTeaser.state === 'unlocked-today' ? { storyId: rewardTeaser.storyId } : undefined)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('stories', rewardTeaser.state === 'unlocked-today' ? { storyId: rewardTeaser.storyId } : undefined) } }}
            className="hd-press"
            style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow style={{ display: 'block', marginBottom: '5px' }}>Today&rsquo;s story reward</Eyebrow>
              <div style={{
                fontFamily: langFont, fontSize: '15px', fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {rewardTeaser.seriesTitle}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', minWidth: 0,
              }}>
                {rewardTeaser.state === 'unlocked-today'
                  ? <BookOpenCheck size={13} strokeWidth={2.2} color={accentInk} style={{ flexShrink: 0 }} aria-hidden="true" />
                  : <Lock size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} aria-hidden="true" />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(rewardTeaser.chapter.nativeLabel || 'Chapter ' + rewardTeaser.chapter.number) + ' · '}
                  {rewardTeaser.state === 'unlocked-today'
                    ? 'unlocked — read it now'
                    : 'unlocks after today’s session'}
                </span>
              </div>
            </div>
            <ArrowRight size={18} strokeWidth={2.1} color={accentInk} style={{ flexShrink: 0 }} />
          </div>
        </Panel>
      )}

      {/* ── The next step in the loop, deliberately quiet. The hero owns the
          screen's action; this is a hand-off, not a rival CTA. ── */}
      {!rewardTeaser && daily && (
        <Panel
          padding={isMobile ? '14px 16px' : '15px 20px'}
          style={{ marginBottom: '14px', animationDelay: '80ms', cursor: 'pointer' }}
          dataTour="home-then-read"
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

      {/* ── Your week: the rhythm behind you and the load ahead. This is the
          return hook — "25 waiting tomorrow" is a reason to come back that
          doesn't depend on guilt. Observational copy only: the app's stated
          stance is no streak pressure, so there is no counter to protect and
          nothing to "keep". ── */}
      <Panel
        padding={isMobile ? '16px 16px 14px' : '18px 20px 16px'}
        style={{ marginBottom: '14px', animationDelay: '140ms' }}
        dataTour="home-week"
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <Eyebrow>Your week</Eyebrow>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {studiedDays === 0
              ? 'No sessions yet'
              : 'Studied ' + studiedDays + ' of the last ' + rhythmDays + ' days'}
          </span>
        </div>

        <div
          role="img"
          aria-label={'Studied ' + studiedDays + ' of the last ' + rhythmDays + ' days'}
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
            role="img"
            aria-label={learned + ' of ' + totalWords + ' words learned toward ' + nextLevelLabel + ' — ' + pct + '%'}
            style={{ height: '5px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}
          >
            <div style={{
              width: pct + '%', height: '100%', borderRadius: '999px',
              background: accentInk, transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>

          {/* One quiet line for what's ahead — this was two lines in two
              different panels saying nearly the same thing. */}
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '10px', textAlign: 'center' }}>
            {counts.dueTomorrow > 0
              ? 'About ' + counts.dueTomorrow + ' waiting tomorrow'
              : 'Nothing due tomorrow — a free day'}
            {forecastTotal > 0 && ' · ~' + perDay + '/day this week'}
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
// are waiting, how the day's goal is going, and the one button that starts it.
function QueueBody({ counts, totalDue, goal, doneToday, isMobile, action, accentHex, hovered }) {
  const failed = Boolean(counts.failed)
  const clear = !failed && totalDue === 0
  const goalComplete = goal > 0 && doneToday >= goal

  // The counts never arrived, so every number here is a meaningless zero. Say
  // so plainly instead of showing the ✓ — Study loads its own queue fresh, so
  // the usual button is the honest retry.
  if (failed) {
    return (
      <div>
        <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
          Today's cards
        </span>

        <div style={{
          fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#fff',
          lineHeight: 1.3, margin: '12px 0 6px',
        }}>
          Couldn't load today's queue
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
        {clear ? 'Queue clear' : 'Ready to review'}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '10px 0 6px' }}>
        <span style={{
          ...NUM, color: '#fff', lineHeight: 0.95,
          // A phone screen holds four blocks; a 52px numeral made this one
          // read as the whole page. The number only needs to win the panel.
          fontSize: isMobile ? '40px' : '64px', fontWeight: 700, letterSpacing: '-0.04em',
        }}>
          {clear ? '\u2713' : totalDue}
        </span>
        <span style={{ fontSize: isMobile ? '15px' : '17px', fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
          {clear ? 'all caught up' : 'card' + (totalDue === 1 ? '' : 's') + ' waiting'}
          {/* Session length from the ACTUAL queue (see sessionEstimate.js). */}
          {!clear && sessionEstimateLabel(counts) && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              {' · ' + sessionEstimateLabel(counts)}
            </span>
          )}
        </span>
      </div>

      {/* The queue's breakdown — desktop only. On a phone these three numbers
          appear the moment Study opens, one tap away; here they were three
          more numerals on a screen already full of them. */}
      {!clear && !isMobile && (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px' }}>
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
