import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak } from './gentleReturn'
import { sceneMood } from './homeScene'
import { homeDailyStage } from './homePresentation'
import { homeCard } from './homeCard'
import { setDeskHandoff } from './deskTransition'
import { prepareStudySession } from './sessionPrep'
import { ProfileGlyph } from './HomeV2NavGlyphs'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'
import { MOBILE_SHELL_HEIGHT } from './studyLayout'
import inkDay from './assets/home-ink-day.webp'
import inkNight from './assets/home-ink-night.webp'

// Home is a painting with one object resting in it.
//
// The ink landscape fills the screen and leaves an empty band of mist through
// the middle; today's card sits in that band. The whole card is the action —
// no separate button — and it carries exactly what the owner asked Home to
// say: how many cards are waiting, roughly how long they take, and how far
// they carry you toward the next level. Everything else Home used to show
// (story hand-off, week rhythm, forecast) lives on its own screens now; see
// homeCard.js for every state's copy.
export default function Home({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [tourSteps, setTourSteps] = useState(null)

  const theme = languageTheme(profile.active_language)
  const accentInk = ink(theme.accentHex)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const card = homeCard({
    counts,
    learned: counts.learnedCount || 0,
    totalWords: counts.totalWords || 0,
    nextLevelLabel,
    returning: isReturningFromBreak(profile),
  })

  // Prepare the study session while the learner is looking at Home — Study
  // consumes the same prepared data, so tapping the card opens the session
  // with the first real card already on screen. Kicks off strictly after the
  // window load event, and again whenever the queue counts move.
  const userId = session?.user?.id
  const queueSignature = (counts.dueCount || 0) + ':' + (counts.learnCount || 0)
    + ':' + (counts.newCount || 0) + ':' + (counts.calibrationCount || 0)
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

  // The painting is Home's ground; the ambient language wallpaper steps out
  // while Home is mounted (Study does the same) so the two never stack.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-quiet-bg', '')
    root.setAttribute('data-home-ink', '')
    return () => { root.removeAttribute('data-quiet-bg'); root.removeAttribute('data-home-ink') }
  }, [])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'home', profileCreatedAt: profile.created_at })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [profile.created_at])

  const go = (event) => {
    if (card.go !== 'study') return onNavigate('stories')
    // Study's card plays a FLIP entrance from this rectangle, so the card the
    // learner tapped visibly becomes the session. Keyboard activation carries
    // no pointer rectangle; Study simply mounts normally.
    if (event && event.currentTarget) setDeskHandoff(event.currentTarget.getBoundingClientRect())
    onNavigate('study')
  }

  return (
    <div
      className="hd-home"
      data-home-stage={homeDailyStage({ counts, daily: null })}
      data-scene={sceneMood(new Date().getHours())}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        minHeight: isMobile ? MOBILE_SHELL_HEIGHT : '100dvh',
        padding: isMobile ? '8px 20px 24px' : '28px 32px 40px',
      }}
    >
      <div
        aria-hidden="true"
        data-home-scene
        className="hd-home-ink"
        style={{ '--ink-day': 'url(' + inkDay + ')', '--ink-night': 'url(' + inkNight + ')' }}
      />

      <header style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <h1 style={visuallyHidden}>Today</h1>
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => onNavigate('profile')}
          className="hd-press"
          style={{
            width: '44px', height: '44px', padding: 0, margin: '-6px -6px 0 0',
            border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'grid', placeItems: 'center', color: 'var(--home-muted)',
          }}
        >
          <span style={{
            width: '32px', height: '32px', borderRadius: '50%',
            boxShadow: 'inset 0 0 0 1px var(--home-hairline)',
            background: 'var(--home-card)', display: 'grid', placeItems: 'center',
          }}>
            <ProfileGlyph size={18} active={false} color="currentColor" />
          </span>
        </button>
      </header>

      {/* The card rests a little below centre, in the painting's band of
          empty mist (the art leaves roughly 42–70% of its height clear). */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: isMobile ? '12vh' : '10vh' }}>
        <button
          type="button"
          className="hd-home-card"
          data-tour="home-queue"
          data-home-card={card.state}
          aria-label={card.ariaLabel}
          onClick={go}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{
              fontSize: 'clamp(24px, 7.2vw, 28px)', lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums', color: 'var(--home-ink)', textWrap: 'balance',
            }}>
              {card.title}
            </span>
            <ChevronRight aria-hidden="true" size={20} strokeWidth={2} color="var(--home-faint)" style={{ flexShrink: 0 }} />
          </span>

          {card.detail && (
            <span style={{ display: 'block', marginTop: '4px', fontSize: '15px', lineHeight: '20px', color: 'var(--home-muted)' }}>
              {card.detail}
            </span>
          )}

          {card.progress && (
            <span style={{ display: 'block', marginTop: '18px' }}>
              <span
                role="progressbar"
                aria-label={card.progress}
                aria-valuenow={counts.learnedCount || 0}
                aria-valuemin="0"
                aria-valuemax={counts.totalWords || 0}
                style={{ display: 'block', height: '4px', borderRadius: '2px', background: 'var(--home-track)', overflow: 'hidden' }}
              >
                <span style={{ display: 'block', width: card.pct + '%', minWidth: card.pct > 0 ? '4px' : 0, height: '100%', borderRadius: '2px', background: accentInk }} />
              </span>
              <span style={{
                display: 'block', marginTop: '8px', fontSize: '13px', lineHeight: '18px', fontWeight: 500,
                fontVariantNumeric: 'tabular-nums', color: 'var(--home-muted)',
              }}>
                {card.progress}
              </span>
            </span>
          )}
        </button>
      </div>

      {tourSteps && (
        <TourOverlay
          steps={tourSteps}
          accentHex={theme.accentHex}
          onClose={(outcome) => {
            setTourSteps(null)
            if (outcome) markTourSeen('home', outcome)
          }}
        />
      )}
    </div>
  )
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}
