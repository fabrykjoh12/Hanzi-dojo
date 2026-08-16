import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getDailyStoryCard } from './homeStory'
import { homeDailyStage } from './homePresentation'
import {
  storyEyebrow, todayCardChip, todayCardSub, todayDateLabel, todayDoneSummary,
  todayEnvironment, todayTomorrowLine, todayWordSize,
} from './todayModel'
import { prepareStudySession } from './sessionPrep'
import { setDeskHandoff } from './deskTransition'
import { contentBottomInset } from './bottomBar'
import { ProfileGlyph } from './HomeV2NavGlyphs'
import { ink, languageTheme } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { stripLeadingNumber } from './storyArcs'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'
import TodayOverview from './TodayOverview'

// TODAY — the KAIMEN screen.
//
// There is no dashboard here. Today rests on the learner's current real object
// and nothing else: while cards are due it IS the first card of the prepared
// session; once they are done it becomes tonight's story; then practice; then a
// quiet done state. Each of those is the whole screen, so the learner never
// reads a summary of work before doing the work.
//
// Session-FIRST, not session-forced: the compact dock sits under all of it, so
// "not now, I want to browse Stories" is always one tap away, and the date chip
// opens the overview sheet for everything a dashboard used to spread out here.
//
// On a phone the screen is a fixed stage rather than a scrolling page — every
// state fits, and the story doorway needs to reach the edges. On desktop the
// same tree renders as a centred column, because the sidebar is the navigation
// there and nothing is floating over the content.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

// The card's surface. The story doorway deliberately does NOT use it — art
// reaching the edges is the point of the doorway.
const CARD_SURFACE = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '26px',
  boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)',
  color: 'var(--text)', fontFamily: UI_FONT, textAlign: 'center',
}

const CHIP = {
  position: 'absolute', top: '17px', left: '18px',
  fontSize: '11px', lineHeight: 1, fontWeight: 740, letterSpacing: '0.1em',
  color: 'var(--text-faint)',
}

// ── The objects Today can rest on ───────────────────────────────────────────

// The actual first flashcard of the prepared session. Tapping it hands its
// on-screen rectangle to Study, which grows the same card into the session —
// same queue, same card, no loading screen in between.
function TodayCard({ frame, deck, counts, estimate, theme, onStart }) {
  const sub = todayCardSub({ counts, estimate })
  return (
    <button
      type="button"
      aria-label="Start cards"
      data-tour="home-queue"
      onClick={event => onStart(event.currentTarget.getBoundingClientRect())}
      className="hd-press-deep hd-home-rise"
      style={{ ...frame, ...CARD_SURFACE, display: 'grid', placeItems: 'center', cursor: 'pointer', animationDelay: '40ms' }}
    >
      <span style={CHIP}>{todayCardChip({ total: deck ? deck.total : 0, state: deck ? deck.state : undefined })}</span>
      {deck && (
        <span lang={theme.langTag} className="hd-fade-in" style={{ fontFamily: theme.font + ', sans-serif', fontSize: todayWordSize(deck.word) + 'px', lineHeight: 1.05, fontWeight: 500, letterSpacing: '0.01em' }}>{deck.word}</span>
      )}
      <span style={{ position: 'absolute', left: '24px', right: '24px', bottom: 0, padding: '15px 0 17px', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)' }}>
        <span style={{ display: 'block', fontSize: '14px', lineHeight: 1, fontWeight: 700, color: ink(theme.accentHex) }}>Tap to start</span>
        <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', lineHeight: 1.2, fontWeight: 520, color: 'var(--text-faint)' }}>{sub}</span>
      </span>
    </button>
  )
}

// Tonight's story, once cards are done. With cover art the art IS the screen —
// edge to edge on a phone, with the caption sitting over its own scrim. The
// reward becoming available, not a checklist row turning green.
function TodayDoorway({ bleed, metaBottom, isMobile, daily, theme, language, track, onOpen, onArtFail }) {
  const story = daily.story
  const title = stripLeadingNumber(story.title)
  const eyebrow = storyEyebrow({
    levelLabel: getLevelLabel(language, track.system, story.level),
    knownPct: daily.knownPct,
  })
  return (
    <button
      type="button"
      aria-label={'Open ' + title}
      data-tour="home-then-read"
      onClick={onOpen}
      className="hd-press-deep"
      style={{
        ...bleed, overflow: 'hidden', cursor: 'pointer', padding: 0, border: 0,
        background: 'var(--surface-2)', textAlign: 'left',
        borderRadius: isMobile ? 0 : '26px',
      }}
    >
      <img
        src={story.cover_url}
        alt=""
        onError={onArtFail}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%' }}
      />
      {/* Two scrims, not one: the top keeps the header legible over any cover,
          the bottom carries the caption. */}
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '160px', background: 'linear-gradient(180deg, rgba(10,8,6,0.5), rgba(10,8,6,0))' }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%', background: 'linear-gradient(180deg, rgba(10,8,6,0) 0%, rgba(10,8,6,0.6) 52%, rgba(10,8,6,0.86) 100%)' }} />
      <span style={{ position: 'absolute', left: '22px', right: '22px', bottom: metaBottom }}>
        {eyebrow && (
          <span style={{ display: 'block', fontSize: '10.5px', lineHeight: 1, fontWeight: 740, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(255,251,244,0.74)' }}>{eyebrow}</span>
        )}
        <span lang={theme.langTag} style={{ display: 'block', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '32px', lineHeight: 1.15, fontWeight: 650, color: '#FFFBF4' }}>{title}</span>
        {daily.sentence && (
          <span lang={theme.langTag} style={{ display: 'block', marginTop: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '15px', lineHeight: 1.6, fontWeight: 400, color: 'rgba(255,251,244,0.82)' }}>「{daily.sentence}」</span>
        )}
        <span style={{ display: 'grid', placeItems: 'center', marginTop: '16px', height: '52px', borderRadius: '13px', background: 'rgba(255,251,244,0.96)', color: theme.accentHex, fontSize: '15px', lineHeight: 1, fontWeight: 740, fontFamily: UI_FONT }}>Start reading</span>
      </span>
    </button>
  )
}

// The same story without cover art: its own title page. Level, title, the
// story's actual opening line, one action. Real content, no decoration.
function TodayTitlePage({ frame, daily, theme, language, track, onOpen }) {
  const story = daily.story
  const title = stripLeadingNumber(story.title)
  const eyebrow = storyEyebrow({
    levelLabel: getLevelLabel(language, track.system, story.level),
    knownPct: daily.knownPct,
  })
  return (
    <button
      type="button"
      aria-label={'Open ' + title}
      data-tour="home-then-read"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{ ...frame, ...CARD_SURFACE, cursor: 'pointer', display: 'grid', placeItems: 'center', alignContent: 'center', animationDelay: '40ms' }}
    >
      <span style={CHIP}>STORY</span>
      <span style={{ display: 'block', width: '100%', padding: '0 26px' }}>
        {eyebrow && (
          <span style={{ display: 'block', fontSize: '10.5px', lineHeight: 1, fontWeight: 720, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{eyebrow}</span>
        )}
        <span lang={theme.langTag} style={{ display: 'block', marginTop: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '30px', lineHeight: 1.2, fontWeight: 650 }}>{title}</span>
        <span aria-hidden="true" style={{ display: 'block', width: '36px', height: '1px', margin: '16px auto 0', background: 'color-mix(in srgb, var(--border) 90%, var(--text))' }} />
        {daily.sentence && (
          <span lang={theme.langTag} style={{ display: 'block', marginTop: '15px', fontFamily: theme.font + ', sans-serif', fontSize: '16.5px', lineHeight: 1.6, fontWeight: 400, color: 'var(--text-muted)' }}>「{daily.sentence}」</span>
        )}
        <span style={{ display: 'inline-block', marginTop: '20px', padding: '12px 20px', borderRadius: '999px', background: 'color-mix(in srgb, ' + theme.accentHex + ' 10%, var(--surface))', color: ink(theme.accentHex), fontSize: '14px', lineHeight: 1, fontWeight: 750, fontFamily: UI_FONT }}>Start reading</span>
      </span>
    </button>
  )
}

// A centred prompt on the plain ground — practice, the done state and the empty
// state are all this shape. No panel: at this point in the day the screen has
// one thing to say, and a box around it would be a widget.
function TodayPrompt({ frame, eyebrow, title, sub, action, footer, onClick, theme }) {
  const body = (
    <span style={{ display: 'block', padding: '0 30px', textAlign: 'center' }}>
      {eyebrow && (
        <span style={{ display: 'block', fontSize: '11px', lineHeight: 1, fontWeight: 760, letterSpacing: '0.14em', color: ink(theme.accentHex) }}>{eyebrow}</span>
      )}
      <span style={{ display: 'block', marginTop: eyebrow ? '13px' : 0, fontSize: '29px', lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.015em' }}>{title}</span>
      {sub && (
        <span style={{ display: 'block', marginTop: '10px', fontSize: '15px', lineHeight: 1.55, fontWeight: 500, color: 'var(--text-muted)' }}>{sub}</span>
      )}
      {action && (
        <span style={{ display: 'block', marginTop: '24px', fontSize: '16px', lineHeight: 1, fontWeight: 760, color: ink(theme.accentHex) }}>{action}</span>
      )}
      {footer && (
        <>
          <span aria-hidden="true" style={{ display: 'block', width: '44px', height: '1px', margin: '26px auto', background: 'var(--border)' }} />
          <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.7, fontWeight: 540, color: 'var(--text-faint)' }}>{footer}</span>
        </>
      )}
    </span>
  )
  const style = {
    ...frame, display: 'grid', placeItems: 'center', alignContent: 'center',
    // Optical centre, not geometric: text sitting exactly halfway down a tall
    // empty stage reads as having slipped low.
    paddingBottom: '9%',
    background: 'transparent', border: 0, color: 'var(--text)', fontFamily: UI_FONT,
    animationDelay: '40ms',
  }
  if (!onClick) return <div className="hd-home-rise" style={style}>{body}</div>
  return (
    <button type="button" onClick={onClick} className="hd-press-deep hd-home-rise" style={{ ...style, cursor: 'pointer' }}>
      {body}
    </button>
  )
}

// ── The screen ──────────────────────────────────────────────────────────────

export function TodayView({
  profile, track, counts, daily, deck, overviewOpen, onOverviewOpen, onOverviewClose,
  onNavigate, onStartCards,
}) {
  const isMobile = useIsMobile()
  // Which cover URL failed to load, not a bare boolean: a story whose art is
  // missing must fall back to its title page without condemning the NEXT
  // story's art, which a sticky flag would do for the rest of the session.
  const [failedCover, setFailedCover] = useState(null)
  const theme = languageTheme(profile.active_language)
  const language = profile.active_language
  const stage = homeDailyStage({ counts, daily })
  const environment = todayEnvironment(stage)
  const estimate = sessionEstimateLabel(counts)
  const story = daily ? daily.story : null
  const levelLabel = getLevelLabel(language, track.system, track.current_level)
  const onArt = environment === 'story' && Boolean(story && story.cover_url) && failedCover !== story.cover_url

  // One stage, two geometries: a fixed non-scrolling screen on a phone, a
  // centred column on desktop. Identical children either way — the difference
  // is where the box is, never what is in it.
  const stageStyle = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 1, overflow: 'hidden', background: 'var(--bg)' }
    : { position: 'relative', width: '100%', maxWidth: '430px', margin: '0 auto', padding: '32px 20px 48px' }

  // The object's box. On a phone it fills the stage between the header and the
  // dock's reserved space (bottomBar.js owns that number, as everywhere else).
  // `width: 100%` matters on the desktop branch: the objects are <button>
  // elements, which shrink-wrap their content instead of filling the column.
  const frame = isMobile
    ? { position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 64px)', left: '14px', right: '14px', bottom: contentBottomInset(true) }
    : { position: 'relative', width: '100%', height: 'min(62vh, 540px)', marginTop: '18px' }

  // The doorway ignores that box and takes the whole stage — the cover art has
  // to reach the edges, with the caption lifted clear of the dock.
  const bleed = isMobile
    ? { position: 'absolute', inset: 0 }
    : { position: 'relative', width: '100%', height: 'min(62vh, 540px)', marginTop: '18px' }
  const metaBottom = isMobile ? contentBottomInset(true) : '20px'

  let content
  if (environment === 'cards') {
    content = (
      <TodayCard frame={frame} deck={deck} counts={counts} estimate={estimate} theme={theme} onStart={onStartCards} />
    )
  } else if (environment === 'story' && daily) {
    content = onArt
      ? (
        <TodayDoorway
          bleed={bleed} metaBottom={metaBottom} isMobile={isMobile}
          daily={daily} theme={theme} language={language} track={track}
          onOpen={() => onNavigate('stories', { storyId: story.id })}
          onArtFail={() => setFailedCover(story.cover_url)}
        />
      )
      : (
        <TodayTitlePage
          frame={frame} daily={daily} theme={theme} language={language} track={track}
          onOpen={() => onNavigate('stories', { storyId: story.id })}
        />
      )
  } else if (environment === 'story') {
    // The story is still being picked. A quiet plate, never a spinner.
    content = <div aria-busy="true" className="hd-skeleton" style={{ ...frame, ...CARD_SURFACE }} />
  } else if (environment === 'practice') {
    const due = counts.grammarDueCount || 0
    content = (
      <TodayPrompt
        frame={frame} theme={theme}
        eyebrow="LAST STEP"
        title="Grammar review"
        sub={due + (due === 1 ? ' pattern' : ' patterns') + ' from this week’s reading'}
        action="Start →"
        onClick={() => onNavigate('practice')}
      />
    )
  } else if (environment === 'done') {
    content = (
      <TodayPrompt
        frame={frame} theme={theme}
        title="Done for today."
        sub={todayDoneSummary({ studiedToday: counts.studiedToday || 0, storyRead: Boolean(daily && daily.completedToday) })}
        footer={todayTomorrowLine({ dueTomorrow: counts.dueTomorrow || 0 })}
      />
    )
  } else {
    content = (
      <TodayPrompt
        frame={frame} theme={theme}
        title="Nothing due right now."
        sub="Read anything you like."
        action="Open the story shelf →"
        onClick={() => onNavigate('stories')}
      />
    )
  }

  // Over cover art the header switches to its on-photo treatment. Same two
  // controls, same positions — only the surface changes.
  const chipStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    height: '34px', padding: '0 13px', borderRadius: '999px',
    fontFamily: UI_FONT, fontSize: '12.5px', lineHeight: 1, fontWeight: 620, cursor: 'pointer',
    background: onArt ? 'rgba(20,16,12,0.42)' : 'var(--surface)',
    border: '1px solid ' + (onArt ? 'rgba(255,251,244,0.28)' : 'var(--border)'),
    color: onArt ? 'rgba(255,251,244,0.94)' : 'var(--text-muted)',
    backdropFilter: onArt ? 'blur(8px)' : undefined,
  }
  const avatarStyle = {
    width: '34px', height: '34px', padding: 0, borderRadius: '50%',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    background: onArt ? 'rgba(20,16,12,0.42)' : 'var(--surface)',
    border: '1px solid ' + (onArt ? 'rgba(255,251,244,0.4)' : 'var(--border)'),
    color: onArt ? 'rgba(255,251,244,0.94)' : 'var(--text-muted)',
    backdropFilter: onArt ? 'blur(8px)' : undefined,
    '--primary-bright': 'currentColor', '--primary-fill': 'currentColor', '--primary-pressed': 'currentColor',
  }
  const headerStyle = isMobile
    ? { position: 'absolute', zIndex: 2, top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: '16px', right: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }
    : { position: 'relative', zIndex: 2, minHeight: '34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }

  return (
    <div data-home-stage={stage} data-today={environment} style={stageStyle}>
      <h1 style={SR_ONLY}>Today</h1>
      {/* Header first: on desktop that is the flow order, and on a phone the
          stage is absolutely positioned so the z-index keeps it above the art
          either way. */}
      <header className={isMobile ? undefined : 'hd-home-rise'} style={headerStyle}>
        <button
          type="button"
          aria-label="Open today’s overview"
          aria-expanded={overviewOpen ? 'true' : 'false'}
          onClick={onOverviewOpen}
          className="hd-press"
          style={chipStyle}
        >
          <span>{todayDateLabel()}</span>
          <ChevronDown size={13} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => onNavigate('profile')}
          className="hd-press"
          style={avatarStyle}
        >
          <ProfileGlyph size={19} active={false} color="currentColor" />
        </button>
      </header>

      {content}

      {overviewOpen && (
        <TodayOverview
          stage={stage}
          counts={counts}
          daily={daily}
          theme={theme}
          levelLabel={levelLabel}
          storySub={story ? storyEyebrow({ levelLabel: getLevelLabel(language, track.system, story.level), knownPct: daily.knownPct }) : ''}
          onNavigate={onNavigate}
          onClose={onOverviewClose}
        />
      )}
    </div>
  )
}

export default function Today({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  const [deck, setDeck] = useState(null)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [tourSteps, setTourSteps] = useState(null)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0

  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])

  // Prepare the study session while the learner is looking at Today — the card
  // on screen IS the prepared queue's first card, and Study consumes the same
  // prepared data, so what you see is what the session deals. Kicks off strictly
  // after the window load event (chunk/data requests started before it would
  // delay it), and again whenever the queue counts move.
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
          if (first && first.vocab && first.vocab.word) {
            setDeck({ word: first.vocab.word, state: first.state, total: data.queue.length })
          }
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

  // Today shares Study's quiet ground — no ambient wallpaper behind the object,
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
      <TodayView
        profile={profile} track={track} counts={counts} daily={daily} deck={deck}
        overviewOpen={overviewOpen}
        onOverviewOpen={() => setOverviewOpen(true)}
        onOverviewClose={() => setOverviewOpen(false)}
        onNavigate={onNavigate}
        onStartCards={startCards}
      />
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
