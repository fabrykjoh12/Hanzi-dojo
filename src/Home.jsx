import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, inkWarm } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { fetchHandoff, trackSignature } from './homeData'
import { query, subscribe } from './dataCache'
import { HOME_HANDOFF } from './cacheEvents'
import { RADIUS, ELEVATION } from './shape'
import { MOBILE_NAV_SPACE } from './navMetrics'
import { maybeStartTour, markTourSeen } from './tour'
import { isTutorialDone } from './prelogin'
import TourOverlay from './TourOverlay'
import { TYPE } from './typeScale'
import { Button } from './controls'
import { CompletionSeal } from './heroObjects'
import { buildGuide, guideContextLine, upcomingLabel, STATUS } from './homeGuide'
import { buildPracticePlan } from './practicePlan'
import StoryCover from './StoryCover'
import { HeroCards } from './homeHero'
import { HOME_FONT_STACK, HOME_RADIUS } from './homeHeroTokens'

// ── Home — the guide through one day's training (P14-5C) ───────────────────
//
// Home answers ONE question: *what should I do now?* The answer is a sequence —
// **Cards → Story → Practice** — and the screen's whole design is the rule that
// **exactly one step is loud at a time**. The current step gets the largest type
// on the screen, one action, and (when it is the story) the artwork. The other two
// stay visible as numbered lines so the order reads in under a second, and they
// stay quiet so they cannot compete.
//
// It is deliberately NOT a dashboard. What P14-5 had here — a lit hero that was
// always Cards, a seven-dot week, a ten-segment level rail, a daily-goal pip row
// and a 72px cover — is gone: informative, and not one of them changed what the
// learner should do next. The audit is docs/P14-5B-HOME-GUIDE-AUDIT.md and the
// device verdict it came from was "messy, over-designed, not useful enough".
//
// Three rules worth keeping in mind before editing this file:
//
//   1. **The decisions are not here.** `homeGuide.js` decides which step is
//      active, what each may say, and when the day is done — pure and tested. This
//      file lays that out and nothing more. A new behaviour belongs there.
//   2. **Nothing on this screen may claim what the app cannot know.** No "resume
//      your session" (no such state exists), no % known on a reward chapter (only
//      the daily-story path computes readability), no Practice tick for opening a
//      drill (there is no per-day practice record). The guide enforces it; do not
//      route around it.
//   3. **No bounded surface, no illustration, no widget goes in without earning
//      it.** The artwork is content. Everything else is type on the page ground.
//      An empty area is allowed to stay empty (P14-5B §12).
//
// ── P14-5F: what the Visual Style sprint changed here ──────────────────────
//
// The composition above survives. Four things moved, each approved from a
// rendered side-by-side against this file's own output (docs/BACKLOG.md):
//
//   · **Cards is the screen's one LIT PANEL** (`homeHero.jsx`) — the app's own
//     hero material, a flashcard object with a real word on it, and the action
//     ON the panel. Rule 3 is intact: it earned it, and it is the only one.
//     Story and Practice stay type on the page, which is what makes the
//     contrast mean anything.
//   · **The three steps DISTRIBUTE** down the usable height instead of stacking
//     under the active one, and a still-ahead step carries a little real content
//     (the chapter's artwork, where it sits in the sequence). Measured: the
//     tallest run of empty space on a Cards day went 208px → 76px.
//   · **Mona Sans**, scoped to this screen's root, with PROPORTIONAL figures on
//     the hero count.
//   · **The Welcome Back banner is gone.** It repeated the Cards count and put a
//     bordered surface above the actual task. The gentle-return CAP is
//     untouched — App.jsx still passes `returning` to getHomeCounts, and
//     studyAvailability still applies it — so the count stays honest and the
//     rule stays internal, which is where a scheduling rule belongs.

export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none
  // Today's story reward: the chapter this session unlocks (or just unlocked).
  // Null when no series is going — the daily-story pick stands in.
  const [rewardTeaser, setRewardTeaser] = useState(null)
  const [readToday, setReadToday] = useState(false)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = inkWarm(accentHex)
  const langFont = theme.font

  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0

  const countsLoaded = Boolean(counts.loaded)

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
    const apply = (value) => {
      setRewardTeaser(value.reward || null)
      setDaily(value.daily === undefined ? null : value.daily)
      setReadToday(Boolean(value.readToday))
    }
    if (res.value) apply(res.value)
    if (res.promise) {
      res.promise.then((settled) => {
        if (!alive || !settled || !settled.ok) return
        apply(settled.value)
      })
    }
    return () => { alive = false }
    // `track` is read inside but deliberately not a dependency — trackKey is
    // its value-equal stand-in, and the identity is the bug this replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, trackKey, learned, countsLoaded, cacheTick])

  // First-run tour: once per device for a new account, on the first Home render.
  // All the rules live in tour.js; the short delay lets the screen settle — and
  // the story hand-off arrive — before anything gets pointed at.
  //
  // Suppressed for anyone who has just been through the onboarding tutorial.
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

  // ── The guide's inputs ──────────────────────────────────────────────────
  //
  // Home's job here is translation, not decision: the two story shapes it can
  // receive become one shape the guide understands, and the Practice pick is the
  // existing tested one. Every field that cannot be known honestly is left out
  // rather than filled in — see the null `knownPct` below.
  const story = rewardTeaser
    ? {
      kind: 'chapter',
      // The series is the thing with a name a learner recognises; the chapter
      // number is the position in it.
      title: rewardTeaser.seriesTitle,
      chapterLabel: rewardTeaser.chapter.nativeLabel
        || 'Chapter ' + rewardTeaser.chapter.number,
      // The chapter's own level, not the learner's — a series can sit below it.
      levelLabel: rewardTeaser.level != null
        ? getLevelLabel(profile.active_language, track.system, rewardTeaser.level)
        : null,
      // A reward chapter carries NO readability: only getDailyStoryCard runs
      // calculateStoryReadability. Omitted, never guessed (P14-5B §2).
      knownPct: null,
      coverPath: rewardTeaser.coverPath,
      coverStory: rewardTeaser.chapter,
      // 'locked' means today's session has not unlocked it yet. That is the real
      // mechanic, and the guide states it instead of hiding the step.
      locked: rewardTeaser.state === 'locked' || rewardTeaser.state === 'banked',
      storyId: rewardTeaser.storyId || null,
    }
    : daily
      ? {
        kind: 'daily',
        title: daily.story.title,
        chapterLabel: null,
        levelLabel: getLevelLabel(profile.active_language, track.system, daily.story.level),
        // A zero is dropped rather than printed: the daily pick is chosen from
        // stories the learner CAN read, so "0% known" means the readability pass
        // found no overlap — a statement about the data, not about them, and one
        // that reads as a bug on the screen.
        knownPct: daily.knownPct || null,
        coverPath: daily.coverPath,
        coverStory: daily.story,
        locked: false,
        storyId: daily.story.id,
      }
      : null

  // The Practice recommendation is `buildPracticePlan().primary` — weak words,
  // then grammar due, then Listening. Two counts and a fallback: not a
  // personalisation engine, and nothing here says it is.
  const practice = buildPracticePlan({
    script: theme.script,
    cjk: theme.cjk,
    weakCount: counts.weakCount || 0,
    grammarDueCount: counts.grammarDueCount || 0,
  }).primary

  const guide = buildGuide({
    counts,
    story,
    practice,
    studiedToday: counts.studiedToday || 0,
    storyReadToday: readToday,
  })

  const active = guide.steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown) || null
  const others = guide.steps.filter(s => s !== active)

  const go = (step) => {
    if (!step) return
    if (step.key === 'story') {
      onNavigate('stories', step.story && step.story.storyId ? { storyId: step.story.storyId } : undefined)
      return
    }
    onNavigate(step.view)
  }

  const ctx = {
    accentHex, accentInk, langFont, isMobile,
    // The flashcard illustration's word, from the language's own config — never
    // hardcoded, so a frozen track's Home does not print hanzi.
    sampleWord: theme.sampleWord, sampleReading: theme.sampleReading,
  }

  return (
    <div style={{
      maxWidth: '720px', margin: '0 auto',
      padding: isMobile ? '22px 16px 40px' : '40px 32px 60px',
      // Mona Sans, on THIS screen only (homeHeroTokens.js). The app-wide
      // typography rollout is its own phase; every other screen names 'Inter'
      // explicitly and is untouched by this.
      fontFamily: HOME_FONT_STACK,
      // A column at least one screen tall, so the level context sits at the FOOT
      // of the page rather than trailing the guide 250px above the fold. Content
      // longer than a screen simply pushes past it and scrolls, which is what the
      // story step does (P14-5C §13: stop targeting exactly 1.00 viewport).
      //
      // `100dvh` minus the shell's own reservations, not `100%`: `main` is a flex
      // item with an auto height, so a percentage min-height there resolves
      // against nothing and silently does nothing (measured — the first attempt
      // rendered identically). `dvh` for the same reason studyLayout uses it —
      // mobile browser chrome makes `vh` overshoot the visible viewport.
      minHeight: isMobile
        ? 'calc(100dvh - env(safe-area-inset-top, 0px) - ' + MOBILE_NAV_SPACE + ')'
        : 'auto',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
    }}>

      {/* ── Where you are in the day ──
          The screen's heading is a line, not a billboard: "Today's training" on
          the left, your place in the sequence on the right. P14-5's PageHeader
          spent the top of the screen on the word "Today" and the weekday, which
          is a greeting, not information. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '10px', marginBottom: '4px',
      }}>
        <h1 style={{ margin: 0, ...TYPE.eyebrow, color: 'var(--text-faint)' }}>
          Today&rsquo;s training
        </h1>
        {/* Nothing here once the day is done: the completion headline says the
            same words two lines below, and printing a label twice is the kind of
            duplication the audit was written to stop. */}
        {!guide.complete && (
          <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>
            {guideContextLine(guide)}
          </span>
        )}
      </div>

      {/* ── The one loud thing ── */}
      {guide.complete
        ? <TrainingComplete guide={guide} ctx={ctx} onExplore={() => onNavigate('practice')} />
        : <ActiveStep step={active} ctx={ctx} onGo={() => go(active)} />}

      {/* ── The rest of the sequence, quiet and in order ──
          `flex: 1` with the rows sharing the height: the steps spread down the
          page instead of stacking under the active one and leaving the bottom
          third of a Cards day empty. Measured before and after — 208px of dead
          run became 76px. */}
      <div style={{
        marginTop: '26px', borderTop: '1px solid var(--divider)',
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      }}>
        {others.map((step, i) => (
          <QuietStep
            key={step.key} step={step} guide={guide} ctx={ctx} onGo={() => go(step)}
            last={i === others.length - 1} complete={guide.complete}
          />
        ))}
      </div>

      {/* ── Context, at the foot of the page where context belongs ── */}
      <LevelFoot levelLabel={levelLabel} learned={learned} totalWords={totalWords} ctx={ctx} />

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

// ── The active step ───────────────────────────────────────────────────────
//
// One eyebrow that numbers it, the largest type on the screen, at most one line
// of supporting fact, and one button. When the step is the story, the artwork
// comes first and carries the screen.
//
// There is no bounded surface here on purpose: the step IS the page. A card
// around it would make Home a dashboard with one card in it, which is the shape
// device QA rejected.
function ActiveStep({ step, ctx, onGo }) {
  if (!step) return null
  const { accentHex, langFont, isMobile } = ctx
  const isStory = step.key === 'story' && step.story
  // Cards, when it has a count to show, is the lit panel. `step.metric` is the
  // guard: an unknown count (counts failed or not yet loaded) has no number to
  // set in display type, so it falls through to the plain layout below rather
  // than drawing an empty hero.
  const isHero = step.key === 'cards' && step.metric
  return (
    <div data-tour="home-queue" data-guide-active={step.key} style={{ marginTop: '22px' }}>
      <StepEyebrow step={step} accentHex={accentHex} />

      {isHero && <HeroCards step={step} ctx={ctx} onGo={onGo} />}

      {/* The artwork, at the ratio it was painted at.
          Production covers are 1344×756 — a 16:9 scene with the characters
          centred — and Home used to crop them into a 72px near-square, which
          threw away the picture and all of its composition. Rounded and inset to
          the page margin rather than bled to the screen edge, so it reads as an
          object on the page like everything else since P14-4. */}
      {isStory && (
        <div style={{ marginTop: '13px' }}>
          <StoryCover
            story={step.story.coverStory}
            path={step.story.coverPath}
            accent={accentHex}
            radius={HOME_RADIUS.card}
            loading="eager"
            style={{ width: '100%', aspectRatio: '16 / 9', boxShadow: ELEVATION.raised }}
          />
        </div>
      )}

      {!isHero && <div style={{ marginTop: isStory ? '15px' : '9px' }}>
        {/* A count belongs in `display` — the role written for "the one number a
            screen is about" — with its noun under it. A sentence at that size
            wraps to three lines on a phone and stops being a statement. */}
        {step.metric ? (
          <>
            <div style={{
              ...TYPE.display, fontVariantNumeric: 'tabular-nums', color: 'var(--text)',
              fontSize: isMobile ? TYPE.display.fontSize : '40px',
            }}>
              {step.metric.value}
            </div>
            <div style={{ ...TYPE.titleSection, color: 'var(--text)', marginTop: '2px' }}>
              {step.metric.label}
            </div>
          </>
        ) : (
          <div style={{
            ...TYPE.titleScreen, color: 'var(--text)',
            fontFamily: isStory ? langFont : undefined,
          }}>
            {step.detail}
          </div>
        )}

        {step.facts.length > 0 && (
          <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '7px' }}>
            {step.facts.join(' · ')}
          </div>
        )}
      </div>}

      {/* One action treatment for every active step that is not the hero: the
          lacquer material at the tighter control radius, arrow in the label. A
          candidate that restyled Cards' control and left Story's on the old
          geometry would be two languages on one screen. */}
      {!isHero && step.cta && (
        <div style={{ marginTop: '20px' }}>
          <Button
            variant="lacquer" size="lg" onClick={onGo}
            style={{ borderRadius: HOME_RADIUS.control + 'px' }}
          >
            {step.cta} &rarr;
          </Button>
        </div>
      )}
    </div>
  )
}

// "1 · CARDS". `inkWarm`, not `ink`: at 10.5px the 30%-lift accent fails AA on
// the dark ground, and the 40%-toward-white lift that fixes AA turns the brand
// red to salmon. The warm lift keeps the hue and clears the bar (languageTheme.js).
// It is also the ONE accent mark up here — the quiet steps below are grey on
// purpose, so only the current step is energised.
function StepEyebrow({ step, accentHex }) {
  return (
    <span style={{ ...TYPE.eyebrow, color: inkWarm(accentHex) }}>
      {step.number} · {step.title}
    </span>
  )
}

// ── A step that is not the current one ────────────────────────────────────
//
// The same component for "done" and "still ahead", because they are the same
// object at two moments — the mark carries the difference, not a second layout.
// The number IS the mark until the step is behind you: a dot cannot say "second",
// and second is the thing this screen exists to communicate.
//
// The story step brings its real artwork along, small. "Show what comes after it"
// is the point of the sequence, and a chapter you can see is a different promise
// from a chapter you are told about.
function QuietStep({ step, guide, ctx, onGo, last, complete }) {
  const { accentHex, accentInk, langFont } = ctx
  const done = step.status === STATUS.done
  const off = step.status === STATUS.unavailable
  const art = step.key === 'story' && step.story ? step.story : null
  const reachable = !done && !off
  // Where a still-ahead step sits in the day, from the guide — "Next after
  // cards", "After your story". A BLOCKED step keeps its unlock hint instead:
  // naming the mechanic is truer and more useful than naming a queue position.
  const detail = [step.detail, step.unlockHint || upcomingLabel(guide.steps, step.key)]
    .filter(Boolean).join(' · ')
  // The artwork gets real width on a step that is still ahead — it is the reason
  // Cards comes first, and a 96px thumbnail cannot make that case. A step that
  // is behind you drops it: a finished chapter does not need its picture again.
  const preview = art && !done

  const body = (
    <>
      <span style={{ display: 'flex', width: '18px', justifyContent: 'center', flexShrink: 0 }}>
        {done ? (
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.6 6.2 4.6 9.4l6-7.4" stroke={accentInk} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span style={{
            ...TYPE.titleSection, fontVariantNumeric: 'tabular-nums',
            color: off ? 'var(--text-faint)' : 'var(--text-muted)',
          }}>
            {step.number}
          </span>
        )}
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          ...TYPE.titleCard, display: 'block',
          color: done ? 'var(--text-muted)' : 'var(--text)',
        }}>
          {step.title}
        </span>
        {detail && (
          <span style={{
            ...TYPE.caption, color: 'var(--text-faint)', display: 'block', marginTop: '2px',
            fontFamily: art ? langFont : undefined,
          }}>
            {detail}
          </span>
        )}
        {preview && (
          <StoryCover
            story={art.coverStory}
            path={art.coverPath}
            accent={accentHex}
            radius={HOME_RADIUS.control}
            style={{
              display: 'block', marginTop: '9px', width: '78%', maxWidth: '262px',
              aspectRatio: '16 / 9', opacity: 0.93,
            }}
          />
        )}
      </span>
    </>
  )

  const style = {
    display: 'flex', gap: '14px', position: 'relative',
    // Top-aligned when the row carries artwork: a numeral centred against a 16:9
    // still floats in the middle of the picture instead of marking where the
    // step begins.
    alignItems: preview ? 'flex-start' : 'center',
    // 44px of target even on the shortest row (TAP_MIN, P14-1).
    minHeight: '44px', padding: '10px 0',
    width: '100%', textAlign: 'left',
    // Share the height the sequence has, so the steps distribute.
    flex: 1,
  }

  const rail = (
    <StepRail done={done} last={last} complete={complete} accentInk={accentInk} top={preview} />
  )

  // A step you can still act on is a control; one that is done or has nothing
  // behind it is a statement, and a statement must not look tappable.
  if (!reachable) {
    return <div data-guide-step={step.key} style={style}>{rail}{body}</div>
  }
  return (
    <div
      role="button" tabIndex={0} onClick={onGo}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo() } }}
      className="hd-press"
      data-guide-step={step.key}
      data-tour={step.key === 'story' ? 'home-then-read' : undefined}
      style={{ ...style, cursor: 'pointer' }}
    >
      {rail}{body}
    </div>
  )
}

// The line down the left of the sequence: warm vermilion where the day has
// already been, the divider grey for what is still ahead.
//
// Drawn PER STEP rather than once down the column, for a reason that only showed
// up on screen: a single rail in a column whose rows distribute runs past the
// last mark and hangs into the space below it, which reads as a line that has
// broken rather than a journey that has arrived. A segment belonging to a step
// ends where that step's mark is.
//
// Absent on a finished day — a full-length rail plus three ticks plus the seal
// is a checklist, which is the one thing this screen is not.
function StepRail({ done, last, complete, accentInk, top }) {
  if (complete) return null
  return (
    <span aria-hidden style={{
      position: 'absolute', left: '8.5px', top: 0,
      bottom: last ? 'auto' : 0,
      height: last ? (top ? '23px' : '50%') : undefined,
      width: '1px', borderRadius: RADIUS.pill,
      background: done ? accentInk : 'var(--divider)',
      // A travelled segment is a trace, not a progress bar.
      opacity: done ? 0.5 : 1,
    }} />
  )
}

// ── The finished day ──────────────────────────────────────────────────────
//
// Restrained on purpose, and it has two versions because there are two different
// days (homeGuide.completionSummary): work happened, or nothing was waiting. Only
// the first is an achievement, so only the first gets the seal — congratulating
// someone for opening the app is the fake reward this product refuses.
//
// No XP, no coins, no streak, no confetti. One line, one summary, one small
// object, and a secondary way to keep going for anyone who wants it.
function TrainingComplete({ guide, ctx, onExplore }) {
  const { accentHex } = ctx
  const earned = guide.summary.earned
  return (
    <div data-tour="home-queue" data-guide-active="complete" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...TYPE.titleScreen, color: 'var(--text)' }}>{guide.summary.headline}</div>
          {guide.summary.parts.length > 0 && (
            <div style={{ ...TYPE.caption, color: 'var(--text-muted)', marginTop: '8px' }}>
              {guide.summary.parts.join(' · ')}
            </div>
          )}
        </div>
        {earned && <CompletionSeal size={68} accentHex={accentHex} />}
      </div>

      <button
        type="button" onClick={onExplore} className="hd-press"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          marginTop: '18px', minHeight: '44px', padding: '0 2px',
          background: 'none', border: 'none', cursor: 'pointer',
          ...TYPE.label, color: inkWarm(accentHex),
        }}
      >
        Keep going — Practice
        <ArrowRight size={15} strokeWidth={2.4} />
      </button>
    </div>
  )
}

// ── The foot of the page ──────────────────────────────────────────────────
//
// HSK progress, demoted to what it is: context. One line of type and one
// hairline rail — not the ten-segment module P14-5 built, which competed with the
// action above it for a number that changes a few times a week. The detailed
// history lives on Profile, which is where someone goes to look at it.
function LevelFoot({ levelLabel, learned, totalWords, ctx }) {
  const pct = totalWords > 0 ? Math.min(100, (learned / totalWords) * 100) : 0
  return (
    // `marginTop: auto` — the foot of the column, not 30px under whatever came
    // last. Everything above it keeps its own rhythm; this is what turns the
    // space between the sequence and the level line into a deliberate gap.
    // `paddingRight` on a phone: the feedback control floats over the
    // bottom-right corner (Feedback.jsx), and now that the level line is pinned
    // to the foot, the rail ran underneath it — a red line disappearing into a
    // red circle reads as a rendering fault. The rail stops short of it instead.
    <div style={{ marginTop: 'auto', paddingTop: '30px', paddingRight: ctx.isMobile ? '58px' : 0 }}>
      <div
        role="img"
        aria-label={levelLabel + ' — ' + learned + ' of ' + totalWords + ' words learned'}
        style={{ ...TYPE.caption, color: 'var(--text-muted)' }}
      >
        {levelLabel} · {learned} / {totalWords} words
      </div>
      <div data-level-rail="" style={{
        marginTop: '7px', height: '3px', borderRadius: RADIUS.pill,
        background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden',
      }}>
        <div style={{
          width: pct + '%', height: '100%', borderRadius: RADIUS.pill,
          background: ctx.accentInk,
          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
        }} />
      </div>
    </div>
  )
}
