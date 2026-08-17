import { useEffect, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { firstContentChar, getDailyStoryCard } from './homeStory'
import { homeDailyStage, homeProgressPct } from './homePresentation'
import {
  greetingName, practiceSubLabel, previewWordSize, primaryAction,
  readableLabel, storyRowStatus,
} from './homeModel'
import { prepareStudySession } from './sessionPrep'
import { setDeskHandoff } from './deskTransition'
import { ink, languageTheme } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { stripLeadingNumber } from './storyArcs'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

const ROW_DIVIDER = '1px solid color-mix(in srgb, var(--border) 72%, transparent)'

// ── The primary learning action ─────────────────────────────────────────────
//
// The one surface on Home: the way into the prepared session. Importance comes
// from being first, from type, and from the session's real first card sitting
// quietly on the right — not from size or a filled block. Tapping records the
// card's rectangle so Study can grow the same object into the session
// (deskTransition.js).
function PrimaryAction({ action, deck, theme, onStart }) {
  const frame = {
    width: '100%', padding: '18px 20px', textAlign: 'left',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px',
    boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
    color: 'var(--text)', fontFamily: UI_FONT,
    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: '16px',
  }

  if (action.kind === 'clear') {
    return (
      <div data-tour="home-queue" className="hd-home-rise" style={{ ...frame, animationDelay: '40ms' }}>
        <span>
          <span style={{ display: 'block', fontSize: '17px', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.01em' }}>{action.title}</span>
          <span style={{ display: 'block', marginTop: '4px', fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>{action.sub}</span>
        </span>
        <Check size={20} strokeWidth={2.4} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-label={action.title}
      data-tour="home-queue"
      onClick={event => onStart(event.currentTarget.getBoundingClientRect())}
      className="hd-press-deep hd-home-rise"
      style={{ ...frame, cursor: 'pointer', animationDelay: '40ms' }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '17px', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.01em' }}>{action.title}</span>
        {action.sub && (
          <span style={{ display: 'block', marginTop: '4px', fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>{action.sub}</span>
        )}
        <span aria-hidden="true" style={{
          display: 'inline-block', marginTop: '14px', padding: '10px 20px', borderRadius: '999px',
          background: theme.accentHex, color: '#FFFFFF', fontSize: '13.5px', lineHeight: 1, fontWeight: 700,
        }}>{action.cta}</span>
      </span>
      {deck && (
        <span lang={theme.langTag} className="hd-fade-in" aria-hidden="true" style={{
          fontFamily: theme.font + ', sans-serif', fontSize: previewWordSize(deck.word) + 'px',
          lineHeight: 1.1, fontWeight: 500, color: 'var(--text)', opacity: 0.88,
          alignSelf: 'center', paddingRight: '4px', whiteSpace: 'nowrap',
        }}>{deck.word}</span>
      )}
    </button>
  )
}

// ── The story connection ────────────────────────────────────────────────────
//
// A flat, tappable row: cover, title, and the product's promise — how much of
// the story the learner can already read. Without art the tile shows the
// story's own first character; content, not decoration.
function StoryRow({ daily, stage, theme, language, track, onOpen, onShelf }) {
  const [artFailed, setArtFailed] = useState(false)
  const loading = daily === undefined
  const story = daily ? daily.story : null

  const rowStyle = {
    width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center',
    gap: '14px', padding: '14px 2px', border: 0, borderTop: ROW_DIVIDER, borderRadius: 0,
    background: 'transparent', color: 'var(--text)', fontFamily: UI_FONT,
    textAlign: 'left', cursor: 'pointer',
  }
  const tile = { width: '52px', height: '68px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }

  if (loading) {
    return (
      <div aria-busy="true" style={{ ...rowStyle, cursor: 'default' }}>
        <div className="hd-skeleton" style={{ ...tile, background: 'var(--surface-2)' }} />
        <span>
          <span className="hd-skeleton" style={{ display: 'block', width: '58%', height: '14px', borderRadius: '7px', background: 'var(--surface-2)' }} />
          <span className="hd-skeleton" style={{ display: 'block', width: '38%', height: '11px', marginTop: '8px', borderRadius: '6px', background: 'var(--surface-2)' }} />
        </span>
        <span />
      </div>
    )
  }

  if (!story) {
    // No pick (offline, or nothing published yet) — offer the shelf instead.
    return (
      <button type="button" data-tour="home-then-read" onClick={onShelf} className="hd-press" style={rowStyle}>
        <span aria-hidden="true" style={{ ...tile, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--text-faint)', fontSize: '22px', fontFamily: theme.font + ', sans-serif' }}>书</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '15.5px', lineHeight: 1.25, fontWeight: 650 }}>Story shelf</span>
          <span style={{ display: 'block', marginTop: '3px', fontSize: '12.5px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>Browse stories at your level</span>
        </span>
        <ChevronRight size={18} strokeWidth={2.1} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
      </button>
    )
  }

  const title = stripLeadingNumber(story.title)
  const levelLabel = getLevelLabel(language, track.system, story.level)
  const readable = readableLabel(daily.knownPct)
  const status = storyRowStatus({ stage, daily })
  const onArt = Boolean(story.cover_url) && !artFailed
  const fallbackChar = firstContentChar(daily.sentence || '') || '书'

  return (
    <button type="button" aria-label={'Open ' + title} data-tour="home-then-read" onClick={onOpen} className="hd-press" style={rowStyle}>
      {onArt
        ? <img src={story.cover_url} alt="" onError={() => setArtFailed(true)} style={tile} />
        : <span lang={theme.langTag} aria-hidden="true" style={{ ...tile, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '24px', fontFamily: theme.font + ', sans-serif' }}>{fallbackChar}</span>}
      <span style={{ minWidth: 0 }}>
        <span lang={theme.langTag} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '16.5px', lineHeight: 1.25, fontWeight: 650 }}>{title}</span>
        <span style={{ display: 'block', marginTop: '3px', fontSize: '12.5px', lineHeight: 1.3, fontWeight: 600, color: 'var(--text-muted)' }}>
          {levelLabel}
          {readable && <span style={{ color: ink(theme.accentHex) }}>{' · ' + readable}</span>}
        </span>
        <span style={{ display: 'block', marginTop: '3px', fontSize: '12px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-faint)' }}>
          {daily.completedToday
            ? <><Check size={11} strokeWidth={2.6} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '3px' }} />{status}</>
            : status}
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2.1} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
    </button>
  )
}

// A quiet practice row — printed only when something is genuinely due.
function PracticeRow({ sub, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="hd-press" style={{
      width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
      gap: '12px', padding: '14px 2px', border: 0, borderTop: ROW_DIVIDER, borderRadius: 0,
      background: 'transparent', color: 'var(--text)', fontFamily: UI_FONT, textAlign: 'left', cursor: 'pointer',
    }}>
      <span>
        <span style={{ display: 'block', fontSize: '15.5px', lineHeight: 1.25, fontWeight: 650 }}>Practice</span>
        <span style={{ display: 'block', marginTop: '3px', fontSize: '12.5px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>{sub}</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.1} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
    </button>
  )
}

export function HomeView({ profile, track, counts, daily, deck, onNavigate, onStartCards }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const language = profile.active_language
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const level = getLevelLabel(language, track.system, track.current_level)
  const stage = homeDailyStage({ counts, daily })
  const action = primaryAction({ counts, estimate: sessionEstimateLabel(counts) })
  const name = greetingName(profile.display_name)
  const story = daily ? daily.story : null
  const practiceSub = practiceSubLabel(counts.grammarDueCount || 0)

  return (
    <div data-home-stage={stage} style={{ width: '100%', maxWidth: '430px', margin: '0 auto', padding: isMobile ? '18px 20px 24px' : '40px 20px 48px', color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased' }}>
      <h1 style={SR_ONLY}>Home</h1>

      <header className="hd-home-rise" style={{ padding: '0 2px' }}>
        <p style={{ margin: 0, fontSize: '23px', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.015em' }}>
          <span lang={theme.langTag} style={{ fontFamily: theme.font + ', sans-serif', fontWeight: 600 }}>{theme.greeting}</span>
          {name && ', ' + name}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '13.5px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>
          Continue your {theme.languageName}
        </p>
      </header>

      <div style={{ marginTop: '18px' }}>
        <PrimaryAction action={action} deck={action.kind === 'cards' ? deck : null} theme={theme} onStart={onStartCards} />
      </div>

      <div className="hd-home-rise" style={{ marginTop: '16px', animationDelay: '90ms' }}>
        <StoryRow
          daily={daily}
          stage={stage}
          theme={theme}
          language={language}
          track={track}
          onOpen={() => onNavigate('stories', story ? { storyId: story.id } : undefined)}
          onShelf={() => onNavigate('stories')}
        />
        {practiceSub && <PracticeRow sub={practiceSub} onOpen={() => onNavigate('practice')} />}
      </div>

      <section aria-label={level + ' progress'} className="hd-home-rise" style={{ marginTop: '18px', padding: '14px 2px 0', borderTop: ROW_DIVIDER, animationDelay: '140ms' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '12px', lineHeight: 1, fontWeight: 760 }}>{level}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1, fontWeight: 520, fontVariantNumeric: 'tabular-nums' }}>{learned} of {totalWords} words</span>
        </div>
        <div role="progressbar" aria-label={level + ' progress'} aria-valuenow={learned} aria-valuemin="0" aria-valuemax={totalWords} style={{ height: '3px', marginTop: '9px', background: 'var(--surface-2)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: homeProgressPct(learned, totalWords) + '%', height: '100%', background: ink(theme.accentHex), borderRadius: 'inherit', transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
        </div>
      </section>
    </div>
  )
}

export default function Home({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  const [deck, setDeck] = useState(null)
  const [tourSteps, setTourSteps] = useState(null)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0

  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])

  // Prepare the study session while the learner is reading Home — the primary
  // block previews the prepared queue's first card, and Study will consume the
  // same prepared data, so what you see is what the session deals. Kicks off
  // strictly after the window load event (chunk/data requests started before
  // it would delay it), and again whenever the queue counts move.
  const queueSignature = (counts.dueCount || 0) + ':' + (counts.learnCount || 0) + ':' + (counts.newCount || 0)
  useEffect(() => {
    let alive = true
    let timer
    if (!userId) return undefined
    const kick = () => {
      timer = setTimeout(() => {
        prepareStudySession({ userId, profile, track }).then(data => {
          if (!alive || !data) return
          const first = data.queue[0]
          if (first && first.vocab && first.vocab.word) setDeck({ word: first.vocab.word, state: first.state })
        })
        import('./Study').catch(() => {})
        import('./Stories').catch(() => {})
      }, 250)
    }
    if (document.readyState === 'complete') kick()
    else window.addEventListener('load', kick, { once: true })
    return () => { alive = false; window.removeEventListener('load', kick); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, track, queueSignature])

  // Home shares Study's quiet ground — no ambient wallpaper behind the page,
  // so the tap transition moves between two identical rooms.
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

  function startCards(rect) {
    setDeskHandoff(rect)
    onNavigate('study')
  }

  return (
    <>
      <HomeView profile={profile} track={track} counts={counts} daily={daily} deck={deck} onNavigate={onNavigate} onStartCards={startCards} />
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
