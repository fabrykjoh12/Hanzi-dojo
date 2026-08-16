import { useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import { getDailyStoryCard, firstContentChar } from './homeStory'
import { homeDailyStage, homeProgressPct } from './homePresentation'
import {
  hanziDisplaySize, heroModel, homeDateEyebrow, practiceStatus, storyEyebrow, storyStatus,
} from './homeModel'
import { getDeckPreview } from './homeNextCard'
import { PracticeGlyph, ProfileGlyph } from './HomeV2NavGlyphs'
import { ink, languageTheme } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { stripLeadingNumber } from './storyArcs'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

// Small-caps eyebrow used by the header, section heads and captions — one
// voice for every piece of metadata on the screen.
const EYEBROW = {
  margin: 0,
  fontSize: '11px',
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
}

// ── The deck ────────────────────────────────────────────────────────────────
// The hero is the product's real object: a paper flashcard — the top of
// today's actual deck, printing the word the session opens with — resting on
// the sheets behind it. The accent is ink, not ground: it appears only as the
// count seal and the action, which is exactly how the study screen itself
// spends red.
function DeckHero({ counts, stage, estimate, preview, theme, onNavigate }) {
  const hero = heroModel({ counts, stage, estimate })
  const accent = theme.accentHex
  const word = hero.showWord && preview ? preview.word : null

  return (
    <section aria-label="Cards" data-tour="home-queue" className="hd-home-rise" style={{ position: 'relative', marginTop: '18px', animationDelay: '50ms' }}>
      {/* The sheets behind — what makes it a deck rather than a lone card. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '18px', right: '18px', top: '14px', bottom: '-11px', borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '9px', right: '9px', top: '8px', bottom: '-6px', borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)', opacity: 0.85 }} />

      <div style={{ position: 'relative', borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)', padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* The count, as a red seal stamp. */}
          <div aria-hidden="true" style={{ width: '46px', height: '46px', flexShrink: 0, borderRadius: '12px', background: 'linear-gradient(160deg, ' + accent + ', ' + theme.accentHexDark + ')', color: '#FFF7EE', display: 'grid', placeItems: 'center', fontSize: hero.seal.length > 2 ? '15px' : '19px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', boxShadow: 'inset 0 0 0 2px rgba(255,247,238,0.28), 0 6px 12px -7px ' + accent }}>
            {hero.clear ? <Check size={22} strokeWidth={3} /> : hero.seal}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '17px', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.015em' }}>Cards</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.25, fontWeight: 600 }}>{hero.sub}</p>
          </div>
        </div>

        {/* The card face: the session's opening word, exactly as the study
            card will print it. Fixed height so the word arriving never moves
            the layout; empty paper while it loads, the app's ink mark if the
            lookup failed. When the deck is clear there is no face — the card
            folds thin, which is the honest shape of "done". */}
        {hero.showWord && (
          <div style={{ height: '146px', display: 'grid', placeItems: 'center', alignContent: 'center', gap: '11px' }}>
            {word ? (
              <>
                <span lang={theme.langTag} className="hd-fade-in" style={{ fontFamily: theme.font + ', sans-serif', fontSize: hanziDisplaySize(word) + 'px', lineHeight: 1.05, fontWeight: 500, color: 'var(--text)', letterSpacing: '0.01em' }}>{word}</span>
                <span className="hd-fade-in" style={{ ...EYEBROW, fontSize: '10.5px', letterSpacing: '0.15em' }}>Up next</span>
              </>
            ) : preview === null ? (
              <span aria-hidden="true" lang="zh-Hans" style={{ fontFamily: theme.font + ', sans-serif', fontSize: '52px', lineHeight: 1, color: 'var(--text-faint)', opacity: 0.6 }}>学</span>
            ) : null}
          </div>
        )}
        {!hero.showWord && <div style={{ height: '12px' }} />}

        <button type="button" disabled={!hero.cta.enabled} onClick={() => onNavigate('study')} className="hd-press-deep" style={{
          width: '100%', height: '54px', border: 0, borderRadius: '14px',
          background: hero.cta.enabled ? 'linear-gradient(180deg, ' + accent + ' 0%, ' + theme.accentHexDark + ' 100%)' : 'var(--surface-2)',
          color: hero.cta.enabled ? '#FFF7EE' : 'var(--text-muted)',
          fontFamily: UI_FONT, fontSize: '16px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          cursor: hero.cta.enabled ? 'pointer' : 'default',
          boxShadow: hero.cta.enabled ? '0 10px 18px -12px ' + accent + ', inset 0 1px 0 rgba(255,255,255,0.22)' : 'none',
        }}>
          <span>{hero.cta.label}</span>
          {hero.cta.enabled && <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />}
        </button>
      </div>
    </section>
  )
}

// ── The story ───────────────────────────────────────────────────────────────
// A chapter card led by the story's own cover art, with a designed plate when
// there is no cover — never a bare list row. Locked, it keeps its full design
// and simply waits, slightly dimmed; the status line above says why.
function StoryCard({ daily, stage, track, language, accent, onNavigate }) {
  const [artFailed, setArtFailed] = useState(false)
  const story = daily ? daily.story : null
  const loading = daily === undefined
  const ready = stage === 'story' && Boolean(story)
  const caughtUp = stage === 'caught-up'
  const status = storyStatus({ stage, daily })
  const title = story ? stripLeadingNumber(story.title) : 'Open the story shelf'
  const eyebrow = story
    ? storyEyebrow({ levelLabel: getLevelLabel(language, track.system, story.level), knownPct: daily.knownPct })
    : ''
  const onArt = Boolean(story && story.cover_url) && !artFailed
  const clickable = ready || caughtUp
  const plateBg = 'color-mix(in srgb, ' + accent + ' 4%, var(--surface))'
  // Cover art earns the full 16:9 frame. A text plate stays shorter — except
  // when the story is the current step, where it is the screen's stage.
  const frameRatio = onArt ? '16 / 9' : ready ? '16 / 10' : '2.3 / 1'

  return (
    <section aria-label="Next story" data-tour="home-then-read" className="hd-home-rise" style={{ marginTop: '24px', animationDelay: '110ms' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', padding: '0 2px' }}>
        <h2 style={{ margin: 0, fontSize: '13.5px', lineHeight: 1, fontWeight: 750, letterSpacing: '-0.005em' }}>Story</h2>
        <span style={{ color: ready ? ink(accent) : 'var(--text-muted)', fontSize: '12px', lineHeight: 1.2, fontWeight: ready ? 700 : 560, textAlign: 'right' }}>{status}</span>
      </div>

      {loading ? (
        <div aria-busy="true" className="hd-skeleton" style={{ marginTop: '10px', aspectRatio: '16 / 9', borderRadius: '18px', background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
      ) : (
        <button
          type="button"
          disabled={!clickable}
          onClick={() => onNavigate('stories', ready ? { storyId: story.id } : undefined)}
          aria-label={ready ? 'Open ' + title : title}
          className={clickable ? 'hd-press-deep' : undefined}
          style={{
            position: 'relative', display: 'block', width: '100%', marginTop: '10px', padding: 0,
            border: '1px solid var(--border)', borderRadius: '18px', overflow: 'hidden', textAlign: 'left',
            background: plateBg, boxShadow: 'var(--shadow-1)', cursor: clickable ? 'pointer' : 'default',
            fontFamily: UI_FONT, color: 'var(--text)',
          }}
        >
          <div style={{ position: 'relative', aspectRatio: frameRatio }}>
            {onArt && (
              <img
                src={story.cover_url} alt="" onError={() => setArtFailed(true)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 45%', filter: ready ? 'none' : 'saturate(0.88) brightness(0.97)' }}
              />
            )}
            {onArt ? (
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(14,10,8,0) 42%, rgba(14,10,8,0.42) 72%, rgba(14,10,8,0.78) 100%)' }} />
            ) : (
              // No cover: an ink plate — the story's opening character as a
              // large drawn watermark, well under the atmosphere ceiling.
              <span aria-hidden="true" lang={languageTheme(language).langTag} style={{ position: 'absolute', right: '3%', bottom: '-18%', fontFamily: languageTheme(language).font + ', sans-serif', fontSize: '116px', lineHeight: 1, color: ink(accent), opacity: 0.06, pointerEvents: 'none' }}>
                {firstContentChar(title) || '书'}
              </span>
            )}
            <div style={{ position: 'absolute', left: '14px', right: '14px', bottom: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                {eyebrow && (
                  <p style={{ ...EYEBROW, fontSize: '10.5px', letterSpacing: '0.11em', color: onArt ? 'rgba(255,250,242,0.78)' : 'var(--text-faint)' }}>{eyebrow}</p>
                )}
                <p lang={story ? languageTheme(language).langTag : undefined} style={{ margin: eyebrow ? '6px 0 0' : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: story ? languageTheme(language).font + ', sans-serif' : UI_FONT, fontSize: story ? '21px' : '17px', lineHeight: 1.15, fontWeight: 650, letterSpacing: '-0.01em', color: onArt ? '#FFFBF4' : 'var(--text)' }}>{title}</p>
              </div>
              {clickable && (
                <span aria-hidden="true" style={{ width: '36px', height: '36px', flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: onArt ? 'rgba(255,250,240,0.94)' : 'color-mix(in srgb, ' + accent + ' 11%, var(--surface))', color: onArt ? accent : ink(accent), boxShadow: onArt ? '0 4px 10px -5px rgba(14,10,8,0.6)' : 'none' }}>
                  <ArrowRight size={17} strokeWidth={2.6} />
                </span>
              )}
            </div>
          </div>
        </button>
      )}
    </section>
  )
}

// ── Practice ────────────────────────────────────────────────────────────────
function PracticeRow({ stage, grammarDueCount, accent, onNavigate }) {
  const active = stage === 'practice'
  const status = practiceStatus(stage)
  return (
    <section aria-label="Practice" className="hd-home-rise" style={{ marginTop: '14px', animationDelay: '170ms' }}>
      <button type="button" disabled={!active} onClick={() => onNavigate('practice')} aria-label="Grammar review" className={active ? 'hd-press' : undefined} style={{
        width: '100%', padding: '13px 14px', border: '1px solid var(--border)', borderRadius: '18px',
        background: 'var(--surface)', boxShadow: 'var(--shadow-1)', color: 'var(--text)', fontFamily: UI_FONT,
        display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: '13px', textAlign: 'left',
        cursor: active ? 'pointer' : 'default',
      }}>
        <span aria-hidden="true" style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: active ? 'color-mix(in srgb, ' + accent + ' 11%, var(--surface))' : 'var(--surface-2)', '--primary-bright': active ? '#E66A52' : 'var(--text-faint)', '--primary-fill': active ? accent : 'var(--text-muted)', '--primary-pressed': active ? '#8F2D1D' : 'var(--text-muted)' }}>
          <PracticeGlyph size={25} active={active} color="currentColor" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '15px', lineHeight: 1.15, fontWeight: 720, letterSpacing: '-0.01em' }}>Grammar review</span>
          <span style={{ display: 'block', marginTop: '3px', fontSize: '12.5px', lineHeight: 1.2, fontWeight: 600, color: active ? ink(accent) : 'var(--text-muted)' }}>{status}</span>
        </span>
        {active && grammarDueCount > 0 ? (
          <span style={{ minWidth: '28px', height: '24px', padding: '0 8px', borderRadius: '999px', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, ' + accent + ' 11%, var(--surface))', color: ink(accent), fontSize: '12.5px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{grammarDueCount}</span>
        ) : (
          <ChevronRight size={18} color="currentColor" style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
        )}
      </button>
    </section>
  )
}

export function HomeView({ profile, track, counts, daily, preview, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const level = getLevelLabel(profile.active_language, track.system, track.current_level)
  const estimate = sessionEstimateLabel(counts)
  const stage = homeDailyStage({ counts, daily })

  return (
    <div data-home-stage={stage} style={{ width: '100%', maxWidth: '430px', margin: '0 auto', padding: isMobile ? '16px 20px 26px' : '36px 20px 48px', color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased' }}>
      <header className="hd-home-rise" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
        <div>
          <p style={EYEBROW}>{homeDateEyebrow()}</p>
          <h1 style={{ margin: '7px 0 0', fontSize: '28px', lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em' }}>Today</h1>
        </div>
        <button type="button" aria-label="Open profile" onClick={() => onNavigate('profile')} className="hd-press" style={{ width: '42px', height: '42px', padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-1)', cursor: 'pointer', '--primary-bright': 'var(--text-faint)', '--primary-fill': 'var(--text-muted)', '--primary-pressed': 'var(--text-muted)' }}>
          <ProfileGlyph size={21} active={false} color="currentColor" />
        </button>
      </header>

      <DeckHero counts={counts} stage={stage} estimate={estimate} preview={preview} theme={theme} onNavigate={onNavigate} />
      <StoryCard daily={daily} stage={stage} track={track} language={profile.active_language} accent={theme.accentHex} onNavigate={onNavigate} />
      <PracticeRow stage={stage} grammarDueCount={counts.grammarDueCount || 0} accent={theme.accentHex} onNavigate={onNavigate} />

      <section aria-label={level + ' progress'} className="hd-home-rise" style={{ marginTop: '24px', padding: '0 2px', animationDelay: '230ms' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '12.5px', lineHeight: 1, fontWeight: 800, letterSpacing: '-0.005em' }}>{level}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1, fontWeight: 560, fontVariantNumeric: 'tabular-nums' }}>{learned} / {totalWords} words</span>
        </div>
        <div role="progressbar" aria-label={level + ' progress'} aria-valuenow={learned} aria-valuemin="0" aria-valuemax={totalWords} style={{ height: '4px', marginTop: '9px', background: 'var(--surface-2)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: homeProgressPct(learned, totalWords) + '%', height: '100%', background: ink(theme.accentHex), borderRadius: 'inherit', transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
        </div>
      </section>
    </div>
  )
}

export default function Home({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  // undefined = looking, null = nothing to show (failed or unknown), object = word.
  const [preview, setPreview] = useState(undefined)
  const [tourSteps, setTourSteps] = useState(null)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0

  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])

  // The hero's card face. Refetched when the queue counts move (a finished
  // session changes what's on top of the deck).
  const queueSignature = (counts.dueCount || 0) + ':' + (counts.learnCount || 0) + ':' + (counts.newCount || 0)
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDeckPreview({ userId, profile, track }).then(result => { if (alive) setPreview(result) }).catch(() => { if (alive) setPreview(null) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, track, queueSignature])

  // Warm the screens Home hands off to while the learner is reading it, so
  // tapping Start never lands on a code-loading fallback. Strictly after the
  // window load event: chunk requests started before it would delay it.
  useEffect(() => {
    let timer
    const warm = () => {
      timer = setTimeout(() => {
        import('./Study').catch(() => {})
        import('./Stories').catch(() => {})
      }, 300)
    }
    if (document.readyState === 'complete') warm()
    else window.addEventListener('load', warm, { once: true })
    return () => { window.removeEventListener('load', warm); clearTimeout(timer) }
  }, [])

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
      <HomeView profile={profile} track={track} counts={counts} daily={daily} preview={preview} onNavigate={onNavigate} />
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
