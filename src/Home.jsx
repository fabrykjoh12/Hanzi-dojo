import { useEffect, useState } from 'react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak } from './gentleReturn'
import { homeDailyStage } from './homePresentation'
import { homeCard, QUEUE_COLORS } from './homeCard'
import { setDeskHandoff } from './deskTransition'
import { prepareStudySession } from './sessionPrep'
import { ProfileGlyph } from './HomeV2NavGlyphs'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'
import { MOBILE_SHELL_HEIGHT } from './studyLayout'
import inkDay from './assets/home-ink-day.webp'
import inkNight from './assets/home-ink-night.webp'
import paperGrain from './assets/home-paper-grain.webp'

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
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        minHeight: isMobile ? MOBILE_SHELL_HEIGHT : '100dvh',
        padding: isMobile ? '8px clamp(16px, 5vw, 20px) 24px' : '28px 32px 40px',
      }}
    >
      <div
        aria-hidden="true"
        data-home-scene
        className="hd-home-ink"
        style={{ '--ink-day': 'url(' + inkDay + ')', '--ink-night': 'url(' + inkNight + ')', '--paper-grain': 'url(' + paperGrain + ')' }}
      />

      {/* On a phone the avatar is the way to Profile; the desktop sidebar
          already shows the learner, so a second avatar there is noise. */}
      <header style={{ display: 'flex', justifyContent: 'flex-end', minHeight: isMobile ? '44px' : 0 }}>
        <h1 style={visuallyHidden}>Today</h1>
        {isMobile && <button
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
        </button>}
      </header>

      {/* The card rests in the painting's band of empty mist. The art is
          painted to leave roughly 43–70% of its height clear, so the card's
          top is placed from the painting's rendered height (see
          .hd-home-band in index.css), not from a guess in vh. */}
      <div className="hd-home-band" style={{ justifyContent: 'center' }}>
        <button
          type="button"
          className="hd-home-card hd-fade-in"
          data-tour="home-queue"
          data-home-card={card.state}
          aria-label={card.ariaLabel}
          onClick={go}
        >
          <span style={{ display: 'block' }}>
            <span style={{
              display: 'block', fontSize: 'clamp(26px, calc(8.4vw - 3px), 34px)', lineHeight: 1.15, fontWeight: 600,
              letterSpacing: '-0.022em', fontVariantNumeric: 'tabular-nums', color: 'var(--home-ink)', textWrap: 'balance',
            }}>
              {card.title}
            </span>
            {card.detail && (
              <span style={{ display: 'block', marginTop: '6px', fontSize: '17px', lineHeight: '22px', color: 'var(--home-muted)' }}>
                {card.detail}
              </span>
            )}
          </span>

          {/* Today's session in three counts: blue new, red learning, green
              review. Tinted tiles mixed into the card's own surface, numbers
              in the colour as ink (lifted at night). Decorative to assistive
              tech: the button's name already reads them out. */}
          {card.breakdown && (
            <span aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(6px, 2vw, 8px)', marginTop: '20px' }}>
              {card.breakdown.map(b => {
                const hex = QUEUE_COLORS[b.key]
                return (
                  <span key={b.key} data-queue={b.key} style={{
                    display: 'block', minWidth: 0, padding: '12px clamp(9px, 3vw, 12px) 11px', borderRadius: '14px',
                    background: 'color-mix(in srgb, ' + hex + ' 11%, var(--home-card))',
                    boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, ' + hex + ' 22%, transparent)',
                  }}>
                    <span style={{
                      display: 'block', fontSize: '24px', lineHeight: 1, fontWeight: 650, letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums', color: ink(hex),
                    }}>
                      {b.value}
                    </span>
                    <span style={{ display: 'block', marginTop: '6px', fontSize: 'clamp(12px, 3.4vw, 13px)', lineHeight: '16px', fontWeight: 500, color: 'var(--home-muted)', whiteSpace: 'nowrap' }}>
                      {b.label}
                    </span>
                  </span>
                )
              })}
            </span>
          )}

          {/* Level progress. Decorative to assistive tech: the button's own
              name already says it, and a progressbar inside a button is not
              exposed anyway (button children are presentational). */}
          {card.progress && (
            <span aria-hidden="true" style={{ display: 'block', marginTop: card.breakdown ? '20px' : '24px' }}>
              <span style={{ display: 'block', height: '5px', borderRadius: '3px', background: 'var(--home-track)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: card.pct + '%', minWidth: card.pct > 0 ? '5px' : 0, height: '100%', borderRadius: '3px', background: accentInk }} />
              </span>
              <span style={{
                display: 'block', marginTop: '10px', fontSize: '14px', lineHeight: '18px', fontWeight: 500,
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
