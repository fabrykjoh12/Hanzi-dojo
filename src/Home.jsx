import { useEffect, useState } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { getDailyStoryCard } from './homeStory'
import { homeDailyStage, homeProgressPct, homeQueueSummary } from './homePresentation'
import { languageTheme, ink } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { stripLeadingNumber } from './storyArcs'
import { prefetchStudyDeck } from './studyData'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const HANZI_FONT = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"

// Home is a launcher, not a dashboard: a date, ONE surface (the next session),
// two plain rows for the rest of the daily rhythm, and the level's progress as
// a single line at the bottom. Text sits directly on the background; the only
// raised, colored thing on screen is the one action the learner came to take.

function todayLine() {
  try {
    return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return ''
  }
}

// The one lit surface: the session that is next. Vermilion while there is work
// (the screen's single accent moment), a quiet checked surface once the queue
// is clear.
function SessionPanel({ counts, accent, onNavigate }) {
  const [pressed, setPressed] = useState(false)
  const queue = homeQueueSummary(counts)
  const estimate = sessionEstimateLabel(counts)
  const active = queue.failed || !queue.clear

  const title = queue.failed ? 'Review' : queue.clear ? 'All clear' : queue.totalReady + (queue.totalReady === 1 ? ' card' : ' cards')
  const detail = queue.failed
    ? 'Couldn’t load your queue — open to retry'
    : queue.clear
      ? 'Nothing due right now'
      : queue.reviewCount + ' to review · ' + queue.newCount + ' new' + (estimate ? ' · ' + estimate : '')

  return (
    <section aria-label="Cards" data-tour="home-queue" style={{ marginTop: '22px' }}>
      <button
        type="button"
        onClick={() => onNavigate('study')}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          width: '100%', minHeight: '92px', padding: '20px 18px', border: 0, borderRadius: '18px',
          display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
          fontFamily: UI_FONT, cursor: 'pointer',
          background: active ? accent : 'var(--surface)',
          boxShadow: active
            ? '0 10px 24px -14px color-mix(in srgb, ' + accent + ' 65%, transparent)'
            : 'var(--shadow-1), inset 0 0 0 1px var(--border)',
          color: active ? '#FFF9F2' : 'var(--text)',
          transform: pressed ? 'scale(0.985)' : 'none',
          transition: 'transform 140ms cubic-bezier(0.2, 0, 0, 1), box-shadow 140ms ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {!active && (
          <span aria-hidden="true" style={{
            width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, ' + accent + ' 11%, var(--surface))',
            color: ink(accent),
          }}>
            <Check size={20} strokeWidth={2.4} />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '21px', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {title}
          </span>
          <span style={{
            display: 'block', marginTop: '6px', fontSize: '13px', lineHeight: 1.3, fontWeight: 550,
            color: active ? 'rgba(255,244,234,0.8)' : 'var(--text-muted)',
          }}>
            {detail}
          </span>
        </span>
        {active && (
          <span aria-hidden="true" style={{ flexShrink: 0, display: 'grid', placeItems: 'center', opacity: 0.9 }}>
            <ChevronRight size={22} strokeWidth={2.2} />
          </span>
        )}
      </button>
    </section>
  )
}

// A plain list row — text on the background, a hairline below, no container.
// Always tappable: the rhythm (cards, then story, then practice) is shown by
// order and by which row is marked "next", never by disabling anything.
function NextRow({ label, title, titleLang, thumb, status, statusTone, onPress, tourId, last }) {
  return (
    <button
      type="button"
      data-tour={tourId}
      onClick={onPress}
      className="hd-press"
      style={{
        width: '100%', minHeight: '68px', padding: '12px 0', border: 0,
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: 'transparent', fontFamily: UI_FONT, cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: '13px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {thumb}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12px', lineHeight: 1, fontWeight: 650, color: 'var(--text-faint)' }}>
          {label}
        </span>
        <span
          lang={titleLang}
          style={{
            display: 'block', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: titleLang ? HANZI_FONT : UI_FONT,
            fontSize: titleLang ? '18px' : '15.5px', lineHeight: 1.25, fontWeight: 600, color: 'var(--text)',
          }}
        >
          {title}
        </span>
      </span>
      <span style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '12.5px', fontWeight: statusTone === 'accent' ? 700 : 550,
        color: statusTone === 'accent' ? 'var(--home-accent-ink)' : 'var(--text-muted)',
      }}>
        {status}
        <ChevronRight size={15} strokeWidth={2.1} style={{ opacity: 0.55, color: 'var(--text-muted)' }} />
      </span>
    </button>
  )
}

// A thumbnail appears only when there is a real image to show (the story's
// cover). No image, no placeholder box — decoration never fills in for content.
function RowThumb({ src }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      style={{ width: '52px', height: '52px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0, background: 'var(--surface-2)' }}
    />
  )
}

export function HomeView({ profile, track, counts, daily, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accent = theme.accentHex
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const level = getLevelLabel(profile.active_language, track.system, track.current_level)
  const stage = homeDailyStage({ counts, daily })

  const story = daily?.story
  const storyTitle = story
    ? stripLeadingNumber(story.title)
    : daily === undefined ? 'Finding today’s story…' : 'Open the story shelf'
  // Status text only where it says something: which step is next, and a quiet
  // "Read" once today's story is done. Silence otherwise — the chevron is
  // enough to say "tappable".
  const storyStatus = stage === 'story' ? 'Next' : (daily && daily.completedToday) ? 'Read' : ''
  const practiceStatus = stage === 'practice' ? 'Next' : ''

  return (
    <div
      data-home-stage={stage}
      style={{
        width: '100%', maxWidth: '430px', margin: '0 auto',
        padding: isMobile ? '20px 20px 28px' : '36px 20px 48px',
        color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased',
        // The accent as ink, computed once for the rows' "Next" tint.
        '--home-accent-ink': ink(accent),
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '27px', lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.02em' }}>Today</h1>
          <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1, fontWeight: 550 }}>{todayLine()}</p>
        </div>
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => onNavigate('profile')}
          className="hd-press"
          style={{
            width: '38px', height: '38px', padding: 0, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--surface)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: UI_FONT, fontSize: '15px', fontWeight: 700,
          }}
        >
          {(profile.display_name || 'You').trim().charAt(0).toUpperCase()}
        </button>
      </header>

      <SessionPanel counts={counts} accent={accent} onNavigate={onNavigate} />

      <section aria-label="Up next" style={{ marginTop: '26px' }}>
        <NextRow
          tourId="home-then-read"
          label="Story"
          title={storyTitle}
          titleLang={story ? 'zh-Hans' : undefined}
          thumb={<RowThumb src={story?.cover_url} />}
          status={storyStatus}
          statusTone={stage === 'story' ? 'accent' : 'muted'}
          onPress={() => onNavigate('stories', story ? { storyId: story.id } : undefined)}
        />
        <NextRow
          label="Practice"
          title="Grammar review"
          status={practiceStatus}
          statusTone={stage === 'practice' ? 'accent' : 'muted'}
          onPress={() => onNavigate('practice')}
          last
        />
      </section>

      <section aria-label={level + ' progress'} style={{ marginTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '13px', lineHeight: 1, fontWeight: 750 }}>{level}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1, fontWeight: 540, fontVariantNumeric: 'tabular-nums' }}>
            {learned} of {totalWords} words
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={level + ' progress'}
          aria-valuenow={learned}
          aria-valuemin="0"
          aria-valuemax={totalWords}
          style={{ height: '3px', marginTop: '9px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}
        >
          <div style={{ width: homeProgressPct(learned, totalWords) + '%', height: '100%', background: ink(accent), borderRadius: 'inherit', transition: 'width 400ms cubic-bezier(0.2, 0, 0, 1)' }} />
        </div>
      </section>
    </div>
  )
}

export default function Home({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  const [tourSteps, setTourSteps] = useState(null)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])
  // Entering Cards must feel instant: warm the Study chunk and start the deck
  // fetch once Home has settled, so the tap only has to render. Deferred to
  // idle (with a short-timeout fallback for WKWebView, which has no
  // requestIdleCallback) and cancelled on unmount — warming the next screen
  // must never compete with painting this one.
  useEffect(() => {
    if (!userId) return undefined
    const start = () => {
      import('./Study.jsx').catch(() => { /* prefetch only — the route retries */ })
      prefetchStudyDeck(userId, track)
    }
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(start, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timer = setTimeout(start, 600)
    return () => clearTimeout(timer)
  }, [userId, track])
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'home', profileCreatedAt: profile.created_at })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [profile.created_at])
  return (
    <>
      <HomeView profile={profile} track={track} counts={counts} daily={daily} onNavigate={onNavigate} />
      {tourSteps && (
        <TourOverlay
          steps={tourSteps}
          accentHex={languageTheme(profile.active_language).accentHex}
          onClose={(outcome) => {
            setTourSteps(null)
            if (outcome) markTourSeen('home', outcome)
          }}
        />
      )}
    </>
  )
}
