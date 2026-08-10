import { useEffect, useRef } from 'react'
import { toast } from './toast'
import StoryReader from './StoryReader'
import { useStoriesData } from './storiesDataContext'
import { getLanguageDetails, categoryForStory, storiesIn, levelOf, pageShell } from './storiesScreenShared'
import { tiersFor, readingGateCount, nextLockedTier } from './storyTiers'
import { nextChapterInfo } from './storyChapters'

// The reader, as a real fullscreen destination.
//
// It used to be `view === 'reader'` inside Stories.jsx, with `selectedStory`
// holding which chapter and a boolean called `readerFromSeries` standing in for
// a navigation stack — "did I get here from the series page, so should Back go
// there instead of the shelf?" That boolean was the app's second router, and it
// could only ever answer for the one hop it remembered.
//
// Now the stack answers it. The reader is presented above the Stories tab
// (VIEW_CLASS: `full`), so the tab bar hides, Back pops to whatever is
// underneath — the series page when it was pushed, the shelf when it was not —
// and the screens beneath stay mounted with their scroll intact.
export default function ReaderScreen({
  storyId, onBack, onNavigate, todayWords, firstMission, onOpenStory, onMissingStory, onConsumed,
}) {
  const data = useStoriesData()
  const { session, profile, track } = data
  const { accentHex } = getLanguageDetails(profile, track)
  const missingNotified = useRef(null)
  // The recap's "Read now" hands down today's words and the first-mission flag
  // for THIS opening only. Held in the shell so a cold deep link can carry
  // them, cleared here so the next story never inherits them.
  const consumed = useRef(false)
  useEffect(() => {
    if (consumed.current) return
    consumed.current = true
    if (onConsumed && (todayWords || firstMission)) onConsumed()
  }, [onConsumed, todayWords, firstMission])

  useEffect(() => { data.ensureLoaded() })

  const story = data.stories.find(s => s.id === storyId) || null

  // A story that is not in the shelf payload once loading has settled is a dead
  // link. Say so once, and leave — silently rendering nothing is how a broken
  // deep link used to look like a broken app.
  useEffect(() => {
    if (data.loading || story) return
    if (data.loadFailed) return
    if (missingNotified.current === storyId) return
    missingNotified.current = storyId
    toast({ title: "That story isn't available", accent: accentHex })
    if (onMissingStory) onMissingStory()
  }, [data.loading, data.loadFailed, story, storyId, accentHex, onMissingStory])

  if (!story) {
    return (
      <div style={pageShell()}>
        <div role="status" aria-label="Loading story" style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 16px' }}>
          <div style={{ width: '60%', height: '26px', borderRadius: '8px', background: 'var(--surface-2)', marginBottom: '18px' }} />
          <div style={{ height: '220px', borderRadius: '18px', background: 'var(--surface-2)' }} />
        </div>
      </div>
    )
  }

  // Chapter-aware "next": inside a series the next chapter (open or locked)
  // drives the finish state; outside one the old same-shelf next remains.
  const readerUnit = data.rewardUnits.find(u => u.parts.some(p => p.id === story.id)) || null
  const chapterNext = readerUnit
    ? nextChapterInfo({ parts: readerUnit.parts, storyId: story.id, readIds: data.readIds, unlockIds: data.unlockIds })
    : null

  const category = categoryForStory(story, track)
  const catStories = storiesIn(data.stories, category, track)
  const currentIdx = catStories.findIndex(s => s.id === story.id)
  const shelfNext = currentIdx >= 0 && currentIdx < catStories.length - 1 ? catStories[currentIdx + 1] : null
  const nextStory = readerUnit
    ? (chapterNext && chapterNext.kind === 'unlocked' ? chapterNext.story : null)
    : shelfNext

  const shelfLevel = category ? category.level : levelOf(story.level, track)
  const tiersAtShelf = tiersFor(track.language, shelfLevel)
  const learnedAtShelf = readingGateCount({
    level: shelfLevel,
    currentLevel: track.current_level,
    learnedAtLevel: data.learnedPerLevel[shelfLevel] || 0,
    tiers: tiersAtShelf,
  })
  const tiersWithStories = new Set(
    data.stories.filter(s => levelOf(s.level, track) === shelfLevel).map(s => s.tier)
  )
  const nextTierUnlock = nextStory || readerUnit
    ? null
    : nextLockedTier(tiersAtShelf, learnedAtShelf, tiersWithStories)

  return (
    <StoryReader
      // Keyed by story so moving to the next chapter remounts the reader
      // cleanly — every reader engine starts the new chapter from its top.
      key={story.id}
      story={story}
      vocabMap={data.vocabMap}
      userCards={data.userCards}
      setUserCards={data.setUserCards}
      session={session}
      profile={profile}
      track={track}
      onBack={onBack}
      onHome={onNavigate ? () => onNavigate('home') : null}
      onPractice={onNavigate ? (words) => onNavigate('fillblank', { practiceWords: words }) : null}
      onStudy={onNavigate ? () => onNavigate('study') : null}
      todayWords={todayWords}
      firstMission={firstMission}
      nextStory={nextStory}
      nextChapter={chapterNext && readerUnit ? { ...chapterNext, seriesTitle: readerUnit.title } : null}
      nextTierUnlock={nextTierUnlock}
      // Moving to the next chapter REPLACES this reader rather than stacking a
      // second one — three chapters in a row must not be three Backs to get out.
      onNextStory={() => { if (nextStory && onOpenStory) onOpenStory(nextStory.id, { replace: true }) }}
      isRead={data.readIds.has(story.id)}
      onMarkRead={data.markRead}
    />
  )
}
