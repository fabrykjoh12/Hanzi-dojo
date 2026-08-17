import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { getDailyStoryCard } from './homeStory'
import { homeDailyStage } from './homePresentation'
import { deskCardsSub } from './homeModel'
import {
  homeFirstName, homeJourneySteps, homeLevelPill, homePrimaryAction,
  sessionHeadline, sessionSampleWords, storyRewardState,
} from './homeJourney'
import { prepareStudySession } from './sessionPrep'
import { setDeskHandoff } from './deskTransition'
import HomeHeader from './HomeHeader'
import LearningJourney, { CurrentSessionCard, DoneCard, PracticeCard, ShelfCard } from './LearningJourney'
import StoryRewardCard from './StoryRewardCard'
import { languageTheme } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import { maybeStartTour, markTourSeen } from './tour'
import TourOverlay from './TourOverlay'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

const SECTION_H2 = {
  margin: 0, fontSize: '23px', lineHeight: 1.15, fontWeight: 760,
  letterSpacing: '-0.02em', color: 'var(--text)',
}

// The Misty Atmosphere Home (P1). The screen is the learning journey:
// header → "Today's Learning" (a three-step rail whose current step holds
// today's real object) → "Story Reward". The daily state machine
// (homeDailyStage), the prepared-session handoff to Study, the story pick and
// every navigation target are unchanged — this layer only presents them.
export function HomeView({ profile, track, counts, daily, sampleWords, onNavigate, onStartCards }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const language = profile.active_language
  const level = getLevelLabel(language, track.system, track.current_level)
  const stage = homeDailyStage({ counts, daily })
  const steps = homeJourneySteps({ stage, counts, daily })
  const primary = homePrimaryAction(stage)
  const story = daily ? daily.story : null
  const reward = storyRewardState({ stage, daily })

  // The story's large object is the Story Reward card below the journey, so
  // the journey never hosts a large card for it — one object per story.
  const currentCardKey = primary === 'story' ? null : primary
  const currentCard = currentCardKey === 'cards'
    ? (
      <CurrentSessionCard
        headline={sessionHeadline(counts)}
        words={sampleWords}
        sub={deskCardsSub({ counts, estimate: sessionEstimateLabel(counts) })}
        theme={theme}
        onStart={onStartCards}
      />
    )
    : currentCardKey === 'practice'
      ? <PracticeCard grammarDueCount={counts.grammarDueCount || 0} theme={theme} onOpen={() => onNavigate('practice')} />
      : currentCardKey === 'shelf'
        ? <ShelfCard onOpen={() => onNavigate('stories')} />
        : null

  return (
    <div data-home-stage={stage} style={{ width: '100%', maxWidth: '430px', margin: '0 auto', padding: isMobile ? '12px 20px 24px' : '32px 20px 48px', color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased' }}>
      <h1 style={SR_ONLY}>Today</h1>

      <HomeHeader
        theme={theme}
        firstName={homeFirstName(profile)}
        levelPill={homeLevelPill({ levelLabel: level, learned: counts.learnedCount || 0, totalWords: counts.totalWords || 0 })}
        onProfile={() => onNavigate('profile')}
      />

      <h2 className="hd-home-rise" style={{ ...SECTION_H2, margin: '22px 0 16px', animationDelay: '40ms' }}>Today’s Learning</h2>

      <LearningJourney steps={steps} currentCardKey={currentCardKey} currentCard={currentCard} theme={theme} />

      {stage === 'complete' && <DoneCard />}

      {reward.kind !== 'hidden' && (
        <>
          <div className="hd-home-rise" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '26px 0 14px', animationDelay: '170ms' }}>
            <h2 style={SECTION_H2}>Story Reward</h2>
            <button
              type="button"
              aria-label="Browse stories"
              onClick={() => onNavigate('stories')}
              className="hd-press"
              style={{ width: '34px', height: '34px', padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <ChevronRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
          <section aria-label="Story reward" className="hd-home-rise" style={{ animationDelay: '220ms' }}>
            <StoryRewardCard
              reward={reward}
              daily={daily}
              theme={theme}
              language={language}
              track={track}
              onOpen={() => onNavigate('stories', story ? { storyId: story.id } : undefined)}
            />
          </section>
        </>
      )}
    </div>
  )
}

export default function Home({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  const [sampleWords, setSampleWords] = useState([])
  const [tourSteps, setTourSteps] = useState(null)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0

  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])

  // Prepare the study session while the learner is reading Home — the focus
  // card samples the prepared queue's opening words, and Study will consume
  // the same prepared data, so what you see is what the session deals. Kicks
  // off strictly after the window load event (chunk/data requests started
  // before it would delay it), and again whenever the queue counts move.
  const queueSignature = (counts.dueCount || 0) + ':' + (counts.learnCount || 0) + ':' + (counts.newCount || 0)
  useEffect(() => {
    let alive = true
    let timer
    if (!userId) return undefined
    const kick = () => {
      timer = setTimeout(() => {
        prepareStudySession({ userId, profile, track }).then(data => {
          if (!alive || !data) return
          setSampleWords(sessionSampleWords(data.queue))
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

  // Home shares Study's quiet ground — no ambient wallpaper behind the
  // journey, so the tap transition moves between two identical rooms.
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
      <HomeView profile={profile} track={track} counts={counts} daily={daily} sampleWords={sampleWords} onNavigate={onNavigate} onStartCards={startCards} />
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
