import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Lock, Sunrise } from 'lucide-react'
import { getLevelLabel, getAudioUrl } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard } from './homeStory'
import { sceneMood } from './homeScene'
import { tileVariant, worldTint } from './storyArt'
import { HeroLandscape, StoryFallbackTile } from './HomeIllustrations.jsx'
// Explicit extension: homeScene.js (pure helpers) sits beside this component,
// and an extensionless specifier is ambiguous on case-insensitive filesystems.
import HomeScene from './HomeScene.jsx'
import { homeDailyStage, homeProgressPct } from './homePresentation'
import {
  aheadLine, heroAriaLabel, homeAction, homeHeaderMeta, queueBreakdown,
  queueHeadline, storyHandoffSub, storyStatus, tomorrowLine, weekLine,
} from './homeModel'
import { setDeskHandoff } from './deskTransition'
import { HeroPanel, Panel, Eyebrow } from './panels'
import { weekdayInitial } from './studyRhythm'
import { forecastSummary } from './reviewForecast'
import { prepareStudySession } from './sessionPrep'
import { stripLeadingNumber } from './storyArcs'
import { ProfileGlyph } from './HomeV2NavGlyphs'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'
import { MICRO, NUM, flatPanel } from './designTokens'

// ── Home ──────────────────────────────────────────────────────────────────
// The one lit block is TODAY'S FLASHCARDS: how many cards are waiting and the
// New/Learning/Review breakdown. The panel IS the control — a real <button>
// carrying the session's own context as its accessible name — so there is no
// CTA inside it to compete with, and a chevron in the corner is the only
// affordance needed. Everything about the queue lives in the block that is
// about the queue.
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

  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0

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

  // The horizon band is Home's ground; the ambient language wallpaper steps
  // out while Home is mounted (Study does the same) so the two never stack.
  useEffect(() => {
    document.documentElement.setAttribute('data-quiet-bg', '')
    return () => document.documentElement.removeAttribute('data-quiet-bg')
  }, [])

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
  // is picked, the shelf otherwise. On the way to Study the hero records its
  // rectangle, and Study's card plays a FLIP entrance from it — the learner
  // watches the red panel become the session, never a cut. (Keyboard
  // activation carries no pointer rectangle; Study simply mounts normally.)
  const action = homeAction(counts)
  const openStory = () => onNavigate('stories', story ? { storyId: story.id } : undefined)
  const heroGo = (event) => {
    if (action.go !== 'study') return openStory()
    if (event && event.currentTarget) setDeskHandoff(event.currentTarget.getBoundingClientRect())
    onNavigate('study')
  }

  return (
    <div
      data-home-stage={stage}
      data-scene={sceneMood(new Date().getHours())}
      style={{ position: 'relative', maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}
    >
      {/* The horizon: sky, disc and hill crests behind the header, slipping
          behind the hero — the red panel is the horizon line. zIndex -1, so
          every surface and every line of text paints above it. */}
      <HomeScene />

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
        element="button"
        accentHex={accentHex}
        seed={profile.active_language}
        wash={false}
        art={<HeroLandscape />}
        compact={isMobile}
        onClick={heroGo}
        dataTour="home-queue"
        ariaLabel={heroAriaLabel({ counts })}
        padding={isMobile ? '26px 24px' : '34px 32px'}
        style={{
          // 44px of open sky between header and hero: the window the horizon
          // band's crests and disc live in before slipping behind the panel.
          marginTop: '44px', marginBottom: '14px', animationDelay: '40ms',
          // The hero is the screen's one action, so it keeps real presence even
          // with its slim contents — a fixed floor, content centered in it.
          minHeight: isMobile ? '250px' : '280px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}
      >
        <QueueBody counts={counts} isMobile={isMobile} />
      </HeroPanel>

      {/* ── The next step in the loop: tonight's story, with its own face.
          The hero owns the screen's action; this is the reward it unlocks.
          While the story is still being found, a same-sized placeholder holds
          the row so the page doesn't shift when it arrives. ── */}
      {daily === undefined && (
        <div
          aria-busy="true"
          aria-label="Finding today’s story"
          className="hd-rise hd-skeleton"
          style={{ ...flatPanel({}), height: '80px', marginBottom: '14px', animationDelay: '80ms' }}
        />
      )}
      {story && (
        <ThenRead
          daily={daily}
          stage={stage}
          title={storyTitle}
          sub={storyHandoffSub({
            levelLabel: getLevelLabel(profile.active_language, track.system, story.level),
            knownPct: daily.knownPct,
          })}
          theme={theme}
          accentInk={accentInk}
          isMobile={isMobile}
          onOpen={openStory}
        />
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

// The story hand-off beneath the hero. Tonight's story gets its own face — the
// cover art when there is one, an accent-tinted title page when not — but it
// stays the loop's second step: dimmed and locked while cards are due, lit in
// full colour once reading is what's next.
function ThenRead({ daily, stage, title, sub, theme, accentInk, isMobile, onOpen }) {
  const [artFailed, setArtFailed] = useState(false)
  const art = daily.story.image_path && !artFailed ? getAudioUrl(daily.story.image_path) : null
  const ready = stage === 'story'
  const status = storyStatus({ stage, daily })
  const press = {
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Then read: ' + title,
    onClick: onOpen,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } },
  }

  // The flat panel keeps its calm, but leads with the story's cover.
  return (
    <Panel
      padding={isMobile ? '12px 14px' : '13px 18px'}
      dataTour="home-then-read"
      style={{ marginBottom: '14px', animationDelay: '80ms', cursor: 'pointer' }}
    >
      <div {...press} className="hd-press" style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
        {art
          ? <img src={art} alt="" onError={() => setArtFailed(true)} style={{ width: '54px', height: '54px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0, filter: ready ? 'none' : 'saturate(0.5)' }} />
          : (
            <StoryFallbackTile
              tint={worldTint(daily.story)}
              variant={tileVariant(daily.story)}
              style={{ filter: ready ? 'none' : 'saturate(0.5)' }}
            />
          )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
            <Eyebrow>Then read</Eyebrow>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', lineHeight: 1, fontWeight: 600, color: ready ? accentInk : 'var(--text-faint)', flexShrink: 0 }}>
              {stage === 'cards' && <Lock size={11} strokeWidth={2.4} aria-hidden="true" />}
              {status}
            </span>
          </div>
          <div lang={theme.langTag} style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '16px', lineHeight: 1.25, fontWeight: 640, color: 'var(--text)' }}>{title}</div>
          <div style={{ fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{sub}</div>
        </div>
        {ready && <ArrowRight size={18} strokeWidth={2.1} color={accentInk} style={{ flexShrink: 0 }} />}
      </div>
    </Panel>
  )
}

// The hero's contents: the whole block is about today's flashcards — how many
// are waiting and what the session is made of. Phrasing content only (spans,
// not divs): this renders inside the hero's <button>, and the panel itself is
// the control, so nothing in here is interactive.
function QueueBody({ counts, isMobile }) {
  const headline = queueHeadline(counts)
  const clear = !headline.failed && headline.value === '✓'

  // The counts never arrived, so every number here is a meaningless zero. Say
  // so plainly instead of showing the ✓ — Study loads its own queue fresh, so
  // tapping the panel is the honest retry.
  if (headline.failed) {
    return (
      <span style={{ display: 'block' }}>
        <span style={{ ...MICRO, display: 'block', color: 'rgba(255,255,255,0.62)' }}>
          {headline.eyebrow}
        </span>

        <span style={{
          display: 'block', fontSize: isMobile ? '20px' : '24px', fontWeight: 700,
          color: '#fff', lineHeight: 1.3, margin: '12px 0 6px',
        }}>
          {headline.caption}
        </span>

        <span style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: '12px' }}>
          Check your connection — starting a session loads it fresh.
        </span>

        <Chevron />
      </span>
    )
  }

  return (
    <span style={{ display: 'block' }}>
      <span style={{ ...MICRO, display: 'block', color: 'rgba(255,255,255,0.62)' }}>
        {headline.eyebrow}
      </span>

      {/* The only affordance the panel needs: decorative, never a control. */}
      {!clear && <Chevron />}

      <span style={{ display: 'flex', alignItems: 'baseline', gap: '13px', margin: '12px 0 6px' }}>
        <span style={{
          ...NUM, color: '#fff', lineHeight: 0.95,
          fontSize: isMobile ? '58px' : '72px', fontWeight: 700, letterSpacing: '-0.04em',
        }}>
          {headline.value}
        </span>
        <span style={{ fontSize: isMobile ? '16.5px' : '18px', fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
          {headline.caption}
        </span>
      </span>

      {/* The queue's composition — what the session is made of, on every
          viewport: the session you are about to start is the one thing Home
          must be specific about. */}
      {!clear && (
        <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '18px' }}>
          {queueBreakdown(counts).map(({ label, value }) => (
            <span key={label} style={{ display: 'block', minWidth: 0 }}>
              <span style={{ ...NUM, display: 'block', fontSize: '20px', lineHeight: 1, fontWeight: 700, color: '#fff' }}>{value}</span>
              <span style={{ ...MICRO, display: 'block', marginTop: '5px', fontSize: '9.5px', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            </span>
          ))}
        </span>
      )}

      {/* Done for today — say what tomorrow holds, but only when it holds
          something: the ✓ already says everything about an empty tomorrow. */}
      {clear && (counts.dueTomorrow || 0) > 0 && (
        <span style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: '12px' }}>
          {tomorrowLine(counts.dueTomorrow)}
        </span>
      )}
    </span>
  )
}

// The hero's one affordance: a quiet chevron in the corner saying the whole
// panel opens something. Decorative and aria-hidden — the panel's own
// accessible name already announces the action and the session waiting.
function Chevron() {
  return (
    <span aria-hidden="true" style={{ position: 'absolute', top: '-2px', right: 0, opacity: 0.5, lineHeight: 0 }}>
      <ChevronRight size={20} strokeWidth={2.4} color="#fff" />
    </span>
  )
}
