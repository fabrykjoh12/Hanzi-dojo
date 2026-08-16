import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { getDailyStoryCard } from './homeStory'
import { homeDailyStage, homeProgressPct } from './homePresentation'
import {
  deskCardsSub, deskChipLabel, deskWordSize, homeDateEyebrow,
  practiceStatus, storyEyebrow, storyStatus,
} from './homeModel'
import { prepareStudySession } from './sessionPrep'
import { setDeskHandoff } from './deskTransition'
import { ProfileGlyph } from './HomeV2NavGlyphs'
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

// The desk object's shared frame. Everything that occupies the desk — the
// flashcard, the story, practice — is the same physical card, so retargeting
// reads as the desk's contents changing, not as a new design appearing.
const DESK_FRAME = {
  position: 'relative', width: '100%', padding: 0,
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px',
  boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)',
  color: 'var(--text)', fontFamily: UI_FONT, textAlign: 'center',
}

const DESK_CHIP = {
  position: 'absolute', top: '15px', left: '15px',
  background: 'var(--surface-2)', borderRadius: '999px', padding: '7px 13px',
  fontSize: '11px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.09em',
  color: 'var(--text-muted)',
}

// A status row under the desk: title + quiet sub on the left, state on the
// right, separated by hairlines. Rows are state, never actions — the desk is
// the action.
function StatusRow({ thumb, title, titleLang, titleFont, sub, right, rightTone, dataTour }) {
  return (
    <div data-tour={dataTour} style={{ display: 'grid', gridTemplateColumns: thumb ? 'auto 1fr auto' : '1fr auto', alignItems: 'center', gap: '12px', padding: '12px 2px', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)' }}>
      {thumb}
      <span style={{ minWidth: 0, textAlign: 'left' }}>
        <span lang={titleLang} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: titleFont || UI_FONT, fontSize: '15px', lineHeight: 1.2, fontWeight: 640 }}>{title}</span>
        {sub && <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', lineHeight: 1.2, fontWeight: 500, color: 'var(--text-faint)' }}>{sub}</span>}
      </span>
      <span style={{ fontSize: '11.5px', lineHeight: 1.2, fontWeight: 600, color: rightTone || 'var(--text-faint)', textAlign: 'right', flexShrink: 0 }}>{right}</span>
    </div>
  )
}

// ── The desk objects ────────────────────────────────────────────────────────

// The actual first flashcard of the prepared session. Tapping it hands its
// on-screen rectangle to Study, which grows the same card into the session.
function DeskCards({ deck, counts, estimate, theme, onStart }) {
  const sub = deskCardsSub({ counts, estimate })
  return (
    <button
      type="button"
      aria-label="Start cards"
      data-tour="home-queue"
      onClick={event => onStart(event.currentTarget.getBoundingClientRect())}
      className="hd-press-deep hd-home-rise"
      style={{ ...DESK_FRAME, height: 'min(51vh, 430px)', display: 'grid', placeItems: 'center', cursor: 'pointer', animationDelay: '40ms' }}
    >
      {deck && <span style={DESK_CHIP}>{deskChipLabel(deck.state)}</span>}
      {deck && (
        <span lang={theme.langTag} className="hd-fade-in" style={{ fontFamily: theme.font + ', sans-serif', fontSize: deskWordSize(deck.word) + 'px', lineHeight: 1.05, fontWeight: 500, letterSpacing: '0.01em' }}>{deck.word}</span>
      )}
      <span style={{ position: 'absolute', left: '22px', right: '22px', bottom: 0, padding: '14px 0 16px', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)' }}>
        <span style={{ display: 'block', fontSize: '14px', lineHeight: 1, fontWeight: 700, color: ink(theme.accentHex) }}>Tap to start</span>
        <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', lineHeight: 1.2, fontWeight: 520, color: 'var(--text-faint)' }}>{sub}</span>
      </span>
    </button>
  )
}

// Tonight's actual story takes the desk once cards are done. With cover art
// the art leads; without it, the desk becomes the story's title page — the
// level, the title, and the story's own opening line, which is real content
// the learner is about to read, not decoration.
function DeskStory({ daily, theme, language, track, onOpen }) {
  const [artFailed, setArtFailed] = useState(false)
  const loading = daily === undefined
  const story = daily ? daily.story : null
  const title = story ? stripLeadingNumber(story.title) : ''
  const sentence = daily && daily.sentence ? daily.sentence : ''
  const eyebrow = story
    ? storyEyebrow({ levelLabel: getLevelLabel(language, track.system, story.level), knownPct: daily.knownPct })
    : ''
  const onArt = Boolean(story && story.cover_url) && !artFailed

  if (loading) {
    return <div aria-busy="true" className="hd-skeleton hd-home-rise" style={{ ...DESK_FRAME, height: 'min(51vh, 430px)', animationDelay: '40ms' }} />
  }

  if (!onArt) {
    // The title page. Reading order: level → title → the first line of the
    // story itself → the action. One hairline; everything else is type.
    return (
      <button
        type="button"
        aria-label={'Open ' + title}
        data-tour="home-then-read"
        onClick={onOpen}
        className="hd-press-deep hd-home-rise"
        style={{ ...DESK_FRAME, height: 'min(51vh, 430px)', cursor: 'pointer', display: 'grid', placeItems: 'center', alignContent: 'center', animationDelay: '40ms' }}
      >
        <span style={DESK_CHIP}>STORY</span>
        <span style={{ display: 'block', width: '100%', padding: '0 26px' }}>
          {eyebrow && (
            <span style={{ display: 'block', fontSize: '10.5px', lineHeight: 1, fontWeight: 720, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{eyebrow}</span>
          )}
          <span lang={theme.langTag} style={{ display: 'block', marginTop: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '29px', lineHeight: 1.2, fontWeight: 650 }}>{title}</span>
          <span aria-hidden="true" style={{ display: 'block', width: '36px', height: '1px', margin: '16px auto 0', background: 'color-mix(in srgb, var(--border) 90%, var(--text))' }} />
          {sentence && (
            <span lang={theme.langTag} style={{ display: 'block', marginTop: '15px', fontFamily: theme.font + ', sans-serif', fontSize: '16.5px', lineHeight: 1.6, fontWeight: 400, color: 'var(--text-muted)' }}>「{sentence}」</span>
          )}
          <span style={{ display: 'inline-block', marginTop: '19px', padding: '11px 18px', borderRadius: '999px', background: 'color-mix(in srgb, ' + theme.accentHex + ' 10%, var(--surface))', color: ink(theme.accentHex), fontSize: '13px', lineHeight: 1, fontWeight: 750, fontFamily: UI_FONT }}>Start reading</span>
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={'Open ' + title}
      data-tour="home-then-read"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{ ...DESK_FRAME, height: 'min(56vh, 470px)', overflow: 'hidden', cursor: 'pointer', display: 'grid', placeItems: 'center', animationDelay: '40ms' }}
    >
      <img src={story.cover_url} alt="" onError={() => setArtFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 42%' }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,9,7,0) 38%, rgba(12,9,7,0.45) 68%, rgba(12,9,7,0.8) 100%)' }} />
      <span style={{ position: 'absolute', left: '20px', right: '20px', bottom: '18px' }}>
        {eyebrow && (
          <span style={{ display: 'block', fontSize: '10.5px', lineHeight: 1, fontWeight: 720, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'rgba(255,251,244,0.78)' }}>{eyebrow}</span>
        )}
        <span lang={theme.langTag} style={{ display: 'block', marginTop: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '27px', lineHeight: 1.15, fontWeight: 650, color: '#FFFBF4' }}>{title}</span>
        <span style={{ display: 'inline-block', marginTop: '13px', padding: '10px 17px', borderRadius: '999px', background: 'rgba(255,251,244,0.95)', color: theme.accentHex, fontSize: '13px', lineHeight: 1, fontWeight: 750, fontFamily: UI_FONT }}>Start reading</span>
      </span>
    </button>
  )
}

// Grammar practice takes the desk once the story is read. Same frame, lighter
// object — practice is a shorter task than a story.
function DeskPractice({ grammarDueCount, theme, onOpen }) {
  return (
    <button
      type="button"
      aria-label="Grammar review"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{ ...DESK_FRAME, height: 'min(38vh, 320px)', display: 'grid', placeItems: 'center', alignContent: 'center', gap: '8px', cursor: 'pointer', animationDelay: '40ms' }}
    >
      <span style={DESK_CHIP}>PRACTICE</span>
      <span style={{ fontSize: '56px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{grammarDueCount}</span>
      <span style={{ fontSize: '15px', lineHeight: 1, fontWeight: 620, color: 'var(--text-muted)' }}>{grammarDueCount === 1 ? 'grammar pattern due' : 'grammar patterns due'}</span>
      <span style={{ position: 'absolute', left: '22px', right: '22px', bottom: 0, padding: '14px 0 16px', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)', fontSize: '14px', lineHeight: 1, fontWeight: 700, color: ink(theme.accentHex) }}>Tap to practice</span>
    </button>
  )
}

// Everything is done — the desk goes quiet.
function DeskDone() {
  return (
    <div className="hd-home-rise" style={{ ...DESK_FRAME, height: '210px', display: 'grid', placeItems: 'center', alignContent: 'center', gap: '7px', animationDelay: '40ms' }}>
      <span style={{ fontSize: '20px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.015em' }}>Done for today</span>
      <span style={{ fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>Nothing else is waiting.</span>
    </div>
  )
}

// Nothing due and no story on deck — offer the shelf.
function DeskShelf({ onOpen }) {
  return (
    <button
      type="button"
      aria-label="Open the story shelf"
      onClick={onOpen}
      className="hd-press-deep hd-home-rise"
      style={{ ...DESK_FRAME, height: '210px', display: 'grid', placeItems: 'center', alignContent: 'center', gap: '7px', cursor: 'pointer', animationDelay: '40ms' }}
    >
      <span style={{ fontSize: '19px', lineHeight: 1, fontWeight: 720, letterSpacing: '-0.015em' }}>Open the story shelf</span>
      <span style={{ fontSize: '13px', lineHeight: 1.3, fontWeight: 520, color: 'var(--text-muted)' }}>Nothing due — read anything you like.</span>
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
  const estimate = sessionEstimateLabel(counts)
  const stage = homeDailyStage({ counts, daily })
  const story = daily ? daily.story : null
  const storyTitle = story ? stripLeadingNumber(story.title) : ''
  const storySub = story
    ? storyEyebrow({ levelLabel: getLevelLabel(language, track.system, story.level), knownPct: daily.knownPct })
    : ''

  const desk = stage === 'cards'
    ? <DeskCards deck={deck} counts={counts} estimate={estimate} theme={theme} onStart={onStartCards} />
    : stage === 'story'
      ? <DeskStory daily={daily} theme={theme} language={language} track={track} onOpen={() => onNavigate('stories', story ? { storyId: story.id } : undefined)} />
      : stage === 'practice'
        ? <DeskPractice grammarDueCount={counts.grammarDueCount || 0} theme={theme} onOpen={() => onNavigate('practice')} />
        : stage === 'complete'
          ? <DeskDone />
          : <DeskShelf onOpen={() => onNavigate('stories')} />

  // The other steps, as quiet status rows in loop order (minus the desk's own).
  const rows = []
  if (stage !== 'cards') {
    rows.push(
      <StatusRow key="cards" title="Cards" sub="Nothing due right now"
        right={<Check size={15} strokeWidth={2.6} aria-label="Done" />} rightTone="var(--text-muted)" />
    )
  }
  if (stage !== 'story' && (story || stage === 'cards')) {
    rows.push(
      <StatusRow
        key="story"
        dataTour="home-then-read"
        thumb={story && story.cover_url
          ? <img src={story.cover_url} alt="" style={{ width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover' }} />
          : null}
        title={storyTitle || 'Today’s story'}
        titleLang={story ? theme.langTag : undefined}
        titleFont={story ? theme.font + ', sans-serif' : undefined}
        sub={storySub}
        right={storyStatus({ stage, daily })}
        rightTone={stage === 'practice' || stage === 'complete' ? 'var(--text-muted)' : undefined}
      />
    )
  }
  if (stage !== 'practice') {
    rows.push(
      <StatusRow key="practice" title="Grammar review"
        sub={(counts.grammarDueCount || 0) > 0 ? counts.grammarDueCount + (counts.grammarDueCount === 1 ? ' pattern due' : ' patterns due') : null}
        right={practiceStatus(stage)}
        rightTone={stage === 'complete' ? 'var(--text-muted)' : undefined} />
    )
  }

  return (
    <div data-home-stage={stage} style={{ width: '100%', maxWidth: '430px', margin: '0 auto', padding: isMobile ? '12px 20px 24px' : '32px 20px 48px', color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased' }}>
      <h1 style={SR_ONLY}>Today</h1>
      <header className="hd-home-rise" style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '10px' }}>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1, fontWeight: 540, color: 'var(--text-muted)' }}>{homeDateEyebrow()}</p>
        <button type="button" aria-label="Open profile" onClick={() => onNavigate('profile')} className="hd-press" style={{ width: '34px', height: '34px', padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', '--primary-bright': 'var(--text-faint)', '--primary-fill': 'var(--text-muted)', '--primary-pressed': 'var(--text-muted)' }}>
          <ProfileGlyph size={19} active={false} color="currentColor" />
        </button>
      </header>

      {desk}

      <div className="hd-home-rise" style={{ marginTop: '18px', animationDelay: '90ms' }}>
        {rows}
      </div>

      <section aria-label={level + ' progress'} className="hd-home-rise" style={{ marginTop: '16px', padding: '2px 2px 0', animationDelay: '140ms' }}>
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

  // Prepare the study session while the learner is reading Home — the desk
  // card renders the prepared queue's first card, and Study will consume the
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

  // Home shares Study's quiet ground — no ambient wallpaper behind the desk,
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
