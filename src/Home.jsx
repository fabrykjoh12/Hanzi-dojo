import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, UserRound } from 'lucide-react'
import { getAudioUrl, getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard } from './homeStory'
import { sceneMood } from './homeScene'
import { homeDailyStage, homeProgressPct, homeQueueSummary } from './homePresentation'
import { aheadLine, heroAriaLabel, homeAction, queueBreakdown, weekLine } from './homeModel'
import { weekdayInitial } from './studyRhythm'
import { forecastSummary } from './reviewForecast'
import { prepareStudySession } from './sessionPrep'
import { stripLeadingNumber } from './storyArcs'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'

export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none
  const [tourSteps, setTourSteps] = useState(null)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = ink(accentHex)

  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

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
        prepareStudySession({ userId, profile, track }).catch(() => {})
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

  const action = homeAction(counts)
  const openStory = () => onNavigate('stories', story ? { storyId: story.id } : undefined)
  const heroGo = () => {
    if (action.go !== 'study') return openStory()
    onNavigate('study')
  }

  const queue = homeQueueSummary(counts)
  return (
    <div data-home-stage={stage} data-scene={sceneMood(new Date().getHours())}
      style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '32px' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>{levelLabel} · {theme.languageName}</p>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 650, color: 'var(--text)', letterSpacing: '-0.03em' }}>Today</h1>
        </div>
        <button type="button" aria-label="Open profile" onClick={() => onNavigate('profile')}
          style={{ width: '44px', height: '44px', flexShrink: 0, padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <UserRound size={20} aria-hidden="true" />
        </button>
      </header>
      {!counts.failed && gentleActive && <p role="status" style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>{gentleReturnMessage(gentleReady)}</p>}
      <button type="button" data-tour="home-queue" aria-label={heroAriaLabel({ counts })} onClick={heroGo} className="hd-press"
        style={{ display: 'block', textAlign: 'left', width: '100%', padding: isMobile ? '24px' : '32px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '32px' }}>
        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>{queue.failed ? 'Today’s cards' : queue.clear ? 'Queue clear' : 'Ready to review'}</span>
        <span style={{ display: 'block', fontSize: isMobile ? '28px' : '36px', fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.2 }}>
          {queue.failed ? 'Your queue couldn’t load' : queue.clear ? 'All caught up' : queue.totalReady + (queue.totalReady === 1 ? ' card waiting' : ' cards waiting')}
        </span>
        {queue.failed ? <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginTop: '12px' }}>Start a session to try loading your cards again.</span>
          : !queue.clear ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', marginTop: '20px' }}>
            {queueBreakdown(counts).map(({ label, value }) => <span key={label} style={{ display: 'flex', gap: '6px', fontSize: '14px', color: 'var(--text-muted)' }}><strong style={{ fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>{label}</span>)}
          </span> : <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginTop: '12px' }}>Put the words you know into a story.</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginTop: '28px', minHeight: '44px', padding: '10px 16px', borderRadius: '10px', background: 'var(--text)', color: 'var(--bg)', fontSize: '15px', fontWeight: 600 }}>
          {action.label}<ArrowRight size={18} aria-hidden="true" />
        </span>
      </button>
      {daily === undefined && <div aria-busy="true" aria-label="Finding today’s story" className="hd-skeleton" style={{ minHeight: '108px', marginBottom: '32px', borderRadius: '12px' }} />}
      {story && <ThenRead key={story.id} daily={daily} title={storyTitle} theme={theme} onOpen={openStory} />}
      <section data-tour="home-week" aria-label="Your week" style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 650, margin: 0, color: 'var(--text)' }}>Your week</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{counts.rhythmFailed ? 'Activity unavailable' : weekLine(rhythm)}</span>
        </div>
        {!counts.rhythmFailed && <div role="img" aria-label={weekLine(rhythm)} style={{ display: 'flex', gap: '8px' }}>
          {rhythm.map(day => <div key={day.date} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '32px', height: '32px', maxWidth: '100%', display: 'grid', placeItems: 'center', borderRadius: '50%', background: day.studied ? accentInk : 'var(--surface-2)', color: 'var(--bg)', border: day.isToday && !day.studied ? '1px solid var(--text-muted)' : '1px solid transparent' }}>{day.studied && <Check size={16} aria-hidden="true" />}</span>
            <span style={{ fontSize: '12px', color: day.isToday ? 'var(--text)' : 'var(--text-muted)' }}>{weekdayInitial(day.date)}</span>
          </div>)}
        </div>}
        {!counts.failed && <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px', fontSize: '13px', marginBottom: '12px' }}><span style={{ color: 'var(--text)' }}>Your study vocabulary</span><span style={{ color: 'var(--text-muted)' }}>{learned} of {totalWords} words learned</span></div>
          {totalWords > 0 && <div role="progressbar" aria-label="Words learned across your study levels" aria-valuenow={learned} aria-valuemin={0} aria-valuemax={totalWords} style={{ height: '4px', borderRadius: '4px', overflow: 'hidden', background: 'var(--surface-2)' }}><div style={{ height: '100%', width: homeProgressPct(learned, totalWords) + '%', background: accentInk }} /></div>}
          <p style={{ margin: '16px 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>{aheadLine({ dueTomorrow: counts.dueTomorrow || 0, forecastTotal, perDay })}</p>
        </div>}
      </section>
      {tourSteps && <TourOverlay steps={tourSteps} accentHex={accentHex} onClose={(outcome) => { setTourSteps(null); if (outcome) markTourSeen('home', outcome) }} />}
    </div>
  )
}

function ThenRead({ daily, title, theme, onOpen }) {
  const [artFailed, setArtFailed] = useState(false)
  const art = artFailed ? null : getAudioUrl(daily.story.image_path)
  return (
    <button type="button" data-tour="home-then-read" aria-label={'Then read: ' + title} onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', padding: 0, marginBottom: '32px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
      {art ? <img src={art} alt="" onError={() => setArtFailed(true)} style={{ width: '80px', height: '96px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
        : <span aria-hidden="true" style={{ width: '64px', height: '80px', flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '8px', color: 'var(--text-muted)' }}><BookOpen size={24} /></span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>{daily.completedToday ? 'Read again' : 'Then read'}</span>
        <span lang={theme.langTag} style={{ display: 'block', fontFamily: theme.font + ', sans-serif', fontSize: '20px', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere', color: 'var(--text)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)', marginTop: '6px' }}>{typeof daily.knownPct === 'number' ? daily.knownPct + '% of matched words known' : 'Read with word lookup'}</span>
      </span>
      <ArrowRight size={18} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </button>
  )
}
