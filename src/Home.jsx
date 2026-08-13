import { useEffect, useState } from 'react'
import { ArrowRight, BookOpenCheck, ChevronRight, Lock, Sparkles, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { fetchHandoff, trackSignature } from './homeData'
import { query, subscribe } from './dataCache'
import { HOME_HANDOFF } from './cacheEvents'
import { HeroPanel, HeroAction, Panel, PageHeader } from './panels'
import { RADIUS, ELEVATION } from './shape'
import { rhythmSummary, weekdayInitial } from './studyRhythm'
import { forecastSummary } from './reviewForecast'
import { sessionEstimateLabel } from './sessionEstimate'
import { maybeStartTour, markTourSeen } from './tour'
import { isTutorialDone } from './prelogin'
import { firstSessionPending } from './homeData'
import TourOverlay from './TourOverlay'
import { MICRO, NUM, ON_HERO } from './designTokens'
import { TYPE } from './typeScale'
import { DeckObject } from './heroObjects'
import StoryCover from './StoryCover'

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

  // The hand-off, derived once — Home shows the session's reward when a series
  // is going, otherwise today's story pick, never both (homeData.js). Both are
  // the same row in the same place; only the words and the destination differ.
  const handoff = rewardTeaser
    ? {
      coverPath: rewardTeaser.coverPath,
      coverStory: rewardTeaser.chapter,
      label: rewardTeaser.state === 'unlocked-today' ? 'Read it now' : 'Next chapter',
      title: rewardTeaser.seriesTitle,
      meta: (rewardTeaser.chapter.nativeLabel || 'Chapter ' + rewardTeaser.chapter.number) + ' · '
        + (rewardTeaser.state === 'unlocked-today' ? 'unlocked' : 'unlocks after today’s session'),
      metaIcon: rewardTeaser.state === 'unlocked-today' ? BookOpenCheck : Lock,
      onOpen: () => onNavigate('stories', rewardTeaser.state === 'unlocked-today' ? { storyId: rewardTeaser.storyId } : undefined),
    }
    : daily
      ? {
        coverPath: daily.coverPath,
        coverStory: daily.story,
        label: 'Then read',
        title: daily.sentence,
        meta: daily.story.title + ' · you know ' + daily.knownPct + '% of it',
        knownPct: daily.knownPct,
        onOpen: () => onNavigate('stories'),
      }
      : null

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
          borderLeft: `3px solid ${accentHex}`, borderRadius: '12px',
          padding: '14px 16px', animationDelay: '40ms',
        }}>
          <Sunrise size={20} strokeWidth={1.9} color={accentInk} style={{ flexShrink: 0 }} />
          <span style={{ ...TYPE.bodySecondary, color: 'var(--text)', fontWeight: 600 }}>
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
          padding: '0 2px', ...TYPE.bodySecondary, fontWeight: 700,
          color: accentInk, fontFamily: 'Inter, sans-serif',
        }}>
          <Sparkles size={16} strokeWidth={2} color={accentInk} style={{ flexShrink: 0 }} />
          Your first session is ready
        </div>
      )}

      {/* ── The one lit block: today's cards ── */}
      <HeroPanel
        accentHex={accentHex}
        material="facet"
        object={<DeckObject size={isMobile ? 132 : 152} />}
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

      {/* ── The one quiet surface: everything AROUND today's learning ──
          What comes after the session, the week behind, the road ahead. One flat
          panel, three rows, two hairlines — deliberately not a rival to the lit
          block above it, and with no card inside it.

          Build 38 gave each of these its own open section on the page, and on a
          real iPhone that read as unfinished: headings floating away from their
          data, hairlines making empty bands, the lower half disconnected from the
          hero. Two surfaces with clearly different jobs is the shape that works —
          lit accent means act now, flat surface means context (P10-C3). */}
      <Panel
        padding={isMobile ? '15px 16px 16px' : '17px 20px 18px'}
        style={{ marginBottom: '14px', animationDelay: '80ms' }}
      >
        {handoff && (
          <StoryHandoff
            dataTour="home-then-read"
            accentInk={accentInk}
            accentHex={accentHex}
            titleFont={langFont}
            {...handoff}
          />
        )}

        {/* ── Your week: the rhythm behind you and the load ahead. This is the
            return hook — "25 waiting tomorrow" is a reason to come back that
            doesn't depend on guilt. Observational copy only: the app's stated
            stance is no streak pressure, so there is no counter to protect and
            nothing to "keep". ── */}
        <div
          data-tour="home-week"
          // `--border`, not `--hairline`: the hairline token is a WHITE inset
          // top-edge highlight (rgba(255,255,255,0.75) in light), so as a divider
          // on a white surface it is invisible — which is exactly how it rendered
          // for one build. `--border` is the app's separator, the same one
          // Profile's control rows use.
          style={handoff
            ? { marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border)' }
            : undefined}
        >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, ...TYPE.titleCard, color: 'var(--text)' }}>
            Your week
          </h2>
          <span style={{ ...TYPE.caption, color: 'var(--text-muted)' }}>
            {studiedDays === 0
              ? 'No sessions yet'
              : 'Studied ' + studiedDays + ' of the last ' + rhythmDays + ' days'}
          </span>
        </div>

        {/* Seven marks, not seven pills.
            
            They were 30px-tall full-width rounded rectangles, which is four fifths
            of the height of the story cover next to them for information that is a
            yes or a no per day — the P14-5 brief's "seven generic grey pills",
            exactly. A day is now a 10px dot: an ink mark when it happened, a faint
            ring when it did not, and a filled ring on today until it is earned.
            
            The same information, a third of the ink, and it stops competing with
            the row above it. Deliberately NOT a streak: the marks have no
            connecting line and no counter, because a chain is a thing to protect
            and this is a record of what happened. */}
        <div
          role="img"
          aria-label={'Studied ' + studiedDays + ' of the last ' + rhythmDays + ' days'}
          style={{ display: 'flex', gap: '6px' }}
        >
          {rhythm.map(day => (
            <div key={day.date} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '7px',
            }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '999px',
                // Mixed against the TEXT, not against a panel colour: these marks
                // sit on the page now, and `--surface-2` is 6/255 from it
                // (P10-C2). One recipe, correct in both themes by construction.
                background: day.studied
                  ? accentInk
                  : 'color-mix(in srgb, var(--text) 9%, transparent)',
                // Today is ringed rather than filled until it is earned — the ring
                // is an invitation, the fill is the record.
                boxShadow: day.isToday && !day.studied
                  ? 'inset 0 0 0 2px ' + `color-mix(in srgb, ${accentHex} 55%, transparent)`
                  : 'none',
              }} />
              <span style={{
                ...MICRO,
                color: day.isToday ? 'var(--text-secondary)' : 'var(--text-faint)',
              }}>
                {weekdayInitial(day.date)}
              </span>
            </div>
          ))}
        </div>

        {/* ── Toward the next level, in the same surface. The week behind you
            and the road ahead are one story, and on a phone two separate panels
            of numbers made Home read as a dashboard. ── */}
        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
            <span style={{ ...TYPE.titleCard, color: 'var(--text)' }}>
              Toward {nextLevelLabel}
            </span>
            <span style={{ ...NUM, ...TYPE.caption, color: 'var(--text-muted)' }}>
              {learned} of {totalWords} words
            </span>
          </div>

          <LevelProgress
            pct={pct}
            accentInk={accentInk}
            label={learned + ' of ' + totalWords + ' words learned toward '
              + nextLevelLabel + ' — ' + pct + '%'}
          />

          {/* One quiet line for what's ahead — this was two lines in two
              different panels saying nearly the same thing. Left-aligned: a
              centred caption is what a widget does. */}
          <div style={{ ...TYPE.caption, color: 'var(--text-faint)', marginTop: '10px' }}>
            {counts.dueTomorrow > 0
              ? 'About ' + counts.dueTomorrow + ' waiting tomorrow'
              : 'Nothing due tomorrow — a free day'}
            {forecastTotal > 0 && ' · ~' + perDay + '/day this week'}
          </div>
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

// Progress toward the next level, as segments rather than a hairline.
//
// It was a 6px continuous rail, and at HSK 2 → HSK 3 with 5 of 44 words that is
// 36 pixels of red on a 324px line: technically accurate and impossible to read
// as "a tenth of the way". Ten segments make the same fraction countable — the
// eye reads "one of ten" without reading a number — and 8px of height lets the
// unfinished part be a warm neutral rather than a grey scratch.
//
// Ten and not one-per-word: a level is 44 words at HSK 2 and 300 at HSK 6, so
// per-word segments would be a barcode at the top of the curriculum. Ten is a
// tenth, which is the granularity the sentence beside it already uses.
//
// **No gold.** The brief allows it for a genuine milestone and this is not one —
// it is the road, not the arrival. Gold means "unlocked" in this app and the level
// test is what unlocks (`--gold`, CLAUDE.md §5).
const PROGRESS_SEGMENTS = 10

function LevelProgress({ pct, accentInk, label }) {
  // How many segments are fully earned, and how much of the next one is.
  const exact = (Math.max(0, Math.min(100, pct)) / 100) * PROGRESS_SEGMENTS
  const full = Math.floor(exact)
  const partial = exact - full
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', gap: '4px' }}>
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => {
        // The partial segment is filled proportionally rather than rounded, so a
        // learner who has done four words of forty-four sees something.
        const fill = i < full ? 1 : (i === full ? partial : 0)
        return (
          <span key={i} style={{
            flex: 1, height: '8px', borderRadius: '3px', overflow: 'hidden',
            background: 'color-mix(in srgb, var(--text) 9%, transparent)',
          }}>
            {fill > 0 && (
              <span style={{
                display: 'block', height: '100%',
                // A hair of width even at 1%, or the first word of a level looks
                // like no words at all.
                width: Math.max(14, Math.round(fill * 100)) + '%',
                background: accentInk,
                borderRadius: '3px',
                transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
              }} />
            )}
          </span>
        )
      })}
    </div>
  )
}

// The story hand-off — the first row of the supporting surface.
//
// It has been three shapes now. A bordered `Panel` wrapped around a row that was
// already the tap target; then a bare row on the open page, which read as
// unfinished on a phone; now a row INSIDE the one quiet surface, which is what it
// always was semantically. No rectangle of its own — the surface is the boundary,
// the hairline below is the separator.
//
// The cover is the anchor: the story's real 2:3 artwork, 56px wide, which is
// content rather than another drawn box. The label ("Then read", "Read it now")
// is the row's first line rather than a heading above it, because a heading over
// a single control is a taxonomy for one thing — and because the row is a button,
// whose content is its label.
function StoryHandoff({
  coverPath, coverStory, label, title, titleFont, meta, metaIcon: MetaIcon,
  knownPct, accentInk, accentHex, onOpen, dataTour,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="hd-press"
      data-tour={dataTour}
      style={{
        display: 'flex', alignItems: 'center', gap: '13px',
        minHeight: '44px', cursor: 'pointer',
      }}
    >
      {/* The artwork is the anchor, and P14-5 gave it room: 56px → 72px, which is
          the difference between a list-row thumbnail and a book on a shelf. It is
          the story's real 2:3 cover — content, not a drawn box — and it gets the
          only shadow in this panel, because a cover is a physical object and the
          rows around it are not. */}
      <StoryCover
        story={coverStory}
        path={coverPath}
        accent={accentHex}
        radius={RADIUS.control}
        loading="eager"
        style={{
          width: '72px', flexShrink: 0, aspectRatio: '2 / 3',
          boxShadow: ELEVATION.raised,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.eyebrow, color: accentInk, marginBottom: '5px' }}>
          {label}
        </div>
        {/* The title steps up to titleCard weight — this is the row's subject, and
            at 15px/600 beside a 13px/700 label it was losing to its own kicker. */}
        <div style={{
          fontFamily: titleFont, ...TYPE.titleCard, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          ...TYPE.caption, color: 'var(--text-muted)', marginTop: '4px', minWidth: 0,
        }}>
          {MetaIcon && <MetaIcon size={13} strokeWidth={2.2} color={accentInk} style={{ flexShrink: 0 }} aria-hidden="true" />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
        </div>
        {/* Readiness, as a mark. `knownPct` was already in the meta line as
            "you know 83% of it" and nowhere as a thing you can see at a glance —
            which is what the brief means by progress/readiness information. Only
            for the daily pick: a reward chapter is unlocked or it is not, and a
            percentage there would be answering a question nobody asked. */}
        {typeof knownPct === 'number' && (
          <div
            role="img"
            aria-label={'You know about ' + knownPct + '% of the words in this story'}
            style={{
              marginTop: '7px', height: '4px', borderRadius: '999px', maxWidth: '132px',
              background: 'color-mix(in srgb, var(--text) 10%, transparent)',
              overflow: 'hidden',
            }}
          >
            <span style={{
              display: 'block', width: Math.max(4, Math.min(100, knownPct)) + '%',
              height: '100%', borderRadius: '999px', background: accentInk,
            }} />
          </div>
        )}
      </div>
      <ChevronRight size={19} strokeWidth={2.1} color="var(--text-faint)" style={{ flexShrink: 0 }} />
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
      <div style={{ maxWidth: isMobile ? '70%' : '76%' }}>
        <span style={{ ...MICRO, color: ON_HERO.eyebrow }}>
          Today's cards
        </span>

        <div style={{
          ...TYPE.titleSection, color: '#fff', margin: '10px 0 0',
        }}>
          Couldn't load today's queue
        </div>

        <div style={{ ...TYPE.bodySecondary, color: ON_HERO.body, marginTop: '10px' }}>
          Check your connection — starting a session loads it fresh.
        </div>

        <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} material="paper" />
      </div>
    )
  }

  return (
    // The text column stops short of the identity object so the two never
    // overlap. 68% on a phone is measured, not chosen: the deck is 132px of a
    // 358px panel and it is cropped by the corner, so its visible mass starts
    // around 74%.
    <div style={{ maxWidth: isMobile ? '70%' : '76%' }}>
      <span style={{ ...MICRO, color: ON_HERO.eyebrow }}>
        {clear ? 'Queue clear' : 'Ready to review'}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '8px 0 0' }}>
        <span style={{
          // TYPE.display, which is the role written for exactly this: "the one
          // number a screen is about — Home's card count". It was 40px/700 by
          // coincidence and is 40px/800 by name now, so the numeral got heavier
          // without inventing a size — 44 was tried and the design-system guard
          // was right to refuse it.
          ...TYPE.display, ...NUM, fontWeight: TYPE.display.fontWeight,
          color: '#fff', fontSize: isMobile ? TYPE.display.fontSize : '64px',
        }}>
          {clear ? '\u2713' : totalDue}
        </span>
        <span style={{ ...TYPE.titleCard, color: 'rgba(255,255,255,0.9)' }}>
          {clear ? 'all caught up' : 'card' + (totalDue === 1 ? '' : 's') + ' waiting'}
        </span>
      </div>

      {/* Session length from the ACTUAL queue (see sessionEstimate.js). Its own
          line now rather than trailing the unit inside a nested span: at 320 that
          span wrapped mid-phrase, and it is a different kind of fact from the
          count anyway. */}
      {!clear && sessionEstimateLabel(counts) && (
        <div style={{ ...TYPE.caption, color: ON_HERO.eyebrow, marginTop: '5px' }}>
          {sessionEstimateLabel(counts)}
        </div>
      )}

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
              <span style={{ ...NUM, ...TYPE.titleSection, color: '#fff' }}>{value}</span>
              <span style={{ ...MICRO, color: ON_HERO.eyebrow }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      <GoalMarks done={doneToday} goal={goal} complete={goalComplete} />

      <HeroAction label={action.label} hovered={hovered} icon={ArrowRight} accentHex={accentHex} material="paper" />
    </div>
  )
}

// The daily goal, as marks rather than as a sentence.
//
// "Daily goal: 0 of 10 new cards" is a sentence about a number that could be a
// mark, and it was the only progress on the hero — the P14-5 brief's "visible
// progress" is exactly this. One pip per card, filled as they are done.
//
// **Pips only up to PIP_MAX**, then a rail. The goal is `profile.daily_new_cards`
// and nothing stops it being 30; thirty marks across 70% of a 320px panel is
// 3px each, which is noise, not progress. The rail says the same thing at any
// goal and the pips say it better at a real one.
const PIP_MAX = 12

function GoalMarks({ done, goal, complete }) {
  if (!goal) {
    return (
      <div style={{ ...TYPE.caption, color: ON_HERO.eyebrow, marginTop: '14px' }}>
        No daily goal set
      </div>
    )
  }
  const shown = Math.min(done, goal)
  const label = complete ? 'Daily goal complete' : shown + ' of ' + goal + ' new'
  return (
    <div
      role="img"
      aria-label={complete ? 'Daily goal complete' : shown + ' of ' + goal + ' new cards done today'}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}
    >
      {goal <= PIP_MAX ? (
        <span style={{ display: 'flex', gap: '3px', flex: 1, minWidth: 0 }}>
          {Array.from({ length: goal }, (_, i) => (
            <span key={i} style={{
              flex: 1, height: '4px', borderRadius: '999px',
              // `plane1` (17%) and not `plane2` (10%) for the empty pips: at 10%
              // the unfilled track read as a dashed grey line rather than as ten
              // waiting marks, in both themes. A track has to look like a track
              // before a fill can mean anything.
              background: i < shown ? '#fff' : ON_HERO.plane1,
            }} />
          ))}
        </span>
      ) : (
        <span style={{
          flex: 1, height: '4px', borderRadius: '999px', overflow: 'hidden',
          background: ON_HERO.plane1,
        }}>
          <span style={{
            display: 'block', width: Math.round((shown / goal) * 100) + '%',
            height: '100%', borderRadius: '999px', background: '#fff',
          }} />
        </span>
      )}
      <span style={{ ...TYPE.caption, color: ON_HERO.eyebrow, flexShrink: 0 }}>{label}</span>
    </div>
  )
}
