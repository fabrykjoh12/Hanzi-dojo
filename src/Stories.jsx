import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel } from './utils'
import { cacheSet, cacheGet, prefsGet, prefsMerge } from './offline'
import { toast } from './toast'
import { languageTheme, ink } from './languageTheme'
import { Eyebrow } from './panels'
import { tiersFor, learnedByLevel, readingGateCount, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { isPracticeFormat } from './storyFormat'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'
import { buildBrowseModel, posterMeta, readableLabel } from './storyBrowse'
import { continueCard } from './storyContinue'
import { calculateStoryReadability } from './storyReading'
import { stripSceneEmoji } from './sceneReading'
import { chapterInfo, nextChapterInfo, readingMinutes, seedUnlockIds } from './storyChapters'
import { buildSeriesUnits, resolveActiveSeries, rewardStateFor } from './storyReward'
import { claimStoryReward } from './storyRewardData'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import StoryPoster from './StoryPoster'
import StoryContinueCard from './StoryContinueCard'
import SeriesDetail from './SeriesDetail'
import TourOverlay from './TourOverlay'
import { maybeStartTour, markTourSeen } from './tour'
import { CloudOff, Library, Lock, RefreshCw } from 'lucide-react'

// The Stories library. Content is organized as SERIES → CHAPTER → READER:
// vertical posters on horizontal rails (continue reading, the current level's
// picks, earlier levels, manhua, practice, the next level's teaser), a hero
// that carries the day's story reward, and a series detail page for choosing
// chapters. Chapter unlocking (one per completed flashcard session) is decided
// in storyChapters.js / storyReward.js — this file only renders it.

// ─── CONSTANTS / SMALL HELPERS ─────────────────────────────────────────────

function getLanguageDetails(profile, track) {
  const language = track.language || profile.active_language
  const t = languageTheme(language)
  return { accentHex: t.accentHex, languageName: t.languageName, fontFamily: t.font }
}

function pageShell() {
  return { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
}

// The selected "category" is a tier *at a level* — see storyTiers. Returns a
// COPY of the shared tier object tagged with the level it belongs to.
function categoryForStory(story, track) {
  if (!story) return null
  const level = story.level == null ? track.current_level : story.level
  const tier = tiersFor(track.language, level).find(c => c.tier === story.tier)
  return tier ? { ...tier, level } : null
}

function isManhuaUnit(unit) {
  return (unit.parts || []).some(p => p && p.presentation === 'manhua')
}

// ─── EMPTY STATE ───────────────────────────────────────────────────────────

function EmptyPanel({ icon: Icon, title, text, actionIcon: ActionIcon, actionLabel, onAction }) {
  return (
    <div style={{
      textAlign: 'center', color: 'var(--text-muted)', padding: '54px 28px', fontSize: '15px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="var(--text-faint)" />
      <div style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>{title}</div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>{text}</div>
      {actionLabel && (
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'center' }}>
          <button onClick={onAction} className="hd-press" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            minHeight: '44px', padding: '0 16px', borderRadius: '12px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
          }}>
            <ActionIcon size={17} strokeWidth={1.85} color="var(--text-muted)" />
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({
  session, profile, track, onBack, onNavigate, initialStoryId, initialStoryWords,
  initialStoryFirstMission, onInitialStoryConsumed, routeKind = 'browse',
  routeStoryId = null, routeSeriesKey = null, onStoryRoute, onSeriesRoute, onBrowseRoute,
}) {
  const [view, setView] = useState('browse')
  const [nextLevelStories, setNextLevelStories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  // The open series, and whether the reader was entered from inside one — so
  // Back out of a chapter returns to its series rather than the shelf.
  const [selectedArc, setSelectedArc] = useState(null)
  const [readerFromSeries, setReaderFromSeries] = useState(false)
  const [stories, setStories] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [reads, setReads] = useState([])
  // Chapters unlocked by flashcard sessions (story_unlocks) + today's claim.
  const [unlockIds, setUnlockIds] = useState(new Set())
  const [claim, setClaim] = useState(null)
  const [activeSeriesKey, setActiveSeriesKey] = useState(null)
  // Vocab ids reviewed in the last few days — the "words you'll recognize" pool.
  const [recentVocabIds, setRecentVocabIds] = useState([])
  const [learnedCount, setLearnedCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  // Which passed levels are expanded past their two-poster preview.
  const [expandedLevels, setExpandedLevels] = useState(() => new Set())
  const missingStoryNotified = useRef(null)
  const redeemAttempted = useRef(false)
  const isMobile = useIsMobile()

  const { accentHex, fontFamily } = getLanguageDetails(profile, track)
  const [todayWords, setTodayWords] = useState([])
  const [firstMission, setFirstMission] = useState(false)
  const [learnedPerLevel, setLearnedPerLevel] = useState({})

  const levelOf = (lvl) => (lvl == null ? track.current_level : lvl)
  const tiersAt = (lvl) => tiersFor(track.language, levelOf(lvl))
  const learnedAt = (lvl) => readingGateCount({
    level: levelOf(lvl),
    currentLevel: track.current_level,
    learnedAtLevel: learnedPerLevel[levelOf(lvl)] || 0,
    tiers: tiersAt(lvl),
  })
  const CATEGORIES = tiersAt(track.current_level)
  const storiesIn = (cat) => (cat
    ? stories.filter(s => s.tier === cat.tier && levelOf(s.level) === cat.level)
    : [])

  // The flat shelf (level sections of units), same machinery as before the
  // poster redesign — tier gates and % known sorting are unchanged.
  const { sections, aheadSection } = useMemo(() => {
    const cache = new Map()
    const knownPctFor = (story) => {
      if (cache.has(story.id)) return cache.get(story.id)
      const content = story.presentation === 'scene' ? stripSceneEmoji(story.content) : story.content
      const { knownPct } = calculateStoryReadability({ content, vocabMap, cards: userCards, language: track.language })
      cache.set(story.id, knownPct)
      return knownPct
    }
    const tiersAtL = (lvl) => tiersFor(track.language, lvl == null ? track.current_level : lvl)
    const learnedAtL = (lvl) => readingGateCount({
      level: lvl == null ? track.current_level : lvl,
      currentLevel: track.current_level,
      learnedAtLevel: learnedPerLevel[lvl == null ? track.current_level : lvl] || 0,
      tiers: tiersAtL(lvl),
    })
    const filters = {}
    return {
      sections: buildFlatShelf({
        stories, currentLevel: track.current_level,
        tiersFor: tiersAtL, learnedFor: learnedAtL,
        readIds, filters, knownPctFor,
      }),
      aheadSection: buildNextLevelSection({
        level: track.current_level + 1, stories: nextLevelStories, filters,
      }),
    }
  }, [stories, nextLevelStories, vocabMap, userCards, readIds, learnedPerLevel, track.language, track.current_level])

  // Series units for the reward loop (cross-section, reward rules only —
  // independent of tier gating so the pointer never dangles).
  const rewardUnits = useMemo(() => buildSeriesUnits(stories), [stories])
  const activeUnit = useMemo(
    () => resolveActiveSeries({ units: rewardUnits, activeSeriesKey, recentReads: reads }),
    [rewardUnits, activeSeriesKey, reads]
  )
  const rewardState = useMemo(
    () => rewardStateFor({ unit: activeUnit, readIds, unlockIds, claim }),
    [activeUnit, readIds, unlockIds, claim]
  )

  const browse = useMemo(() => buildBrowseModel({ sections, aheadSection }), [sections, aheadSection])

  const daily = pickDailyStory({ stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(), tiersFor: tiersAt, learnedFor: learnedAt })
  // The card resolves over the reward machine; readability is computed here
  // for at most the one chapter the card points at. "Start here" features a
  // STORY, never a practice scenario — when the daily pick is practice, fall
  // back to the shelf's best unstarted, unlocked unit (the sections are
  // already sorted most-readable first).
  const fallbackPool = browse.current ? [...browse.current.series, ...browse.current.shorts] : []
  const fallbackPick = fallbackPool.find(u => !u.locked && u.readCount === 0)
  const card = continueCard({
    rewardState, activeUnit, unlockIds, units: rewardUnits, stories, readIds,
    featured: daily && !isPracticeFormat(daily) ? daily : (fallbackPick ? fallbackPick.parts[0] : null),
    // At most one chapter's readability per resolve — cheap enough to leave
    // to the compiler's own memoization.
    knownPctFor: (story) => {
      if (!story || !story.content) return null
      const content = story.presentation === 'scene' ? stripSceneEmoji(story.content) : story.content
      return calculateStoryReadability({ content, vocabMap, cards: userCards, language: track.language }).knownPct
    },
  })

  async function loadData() {
    setLoading(true)
    setLoadFailed(false)

    // Everything the stories screen needs, mirrored into IndexedDB so the
    // library opens offline. Key bumped when the payload shape grew unlocks.
    const snapKey = 'storiesdata2:' + track.language + ':' + track.system + ':' + track.current_level
    let vocabData = null, cardsData = null, storiesData = null, readsData = null, nextData = null
    let unlocksData = null, claimData = null, activeSeriesData = null, recentData = null
    let fetchFailed = false
    try {
      // All levels so every word in a story is clickable — and PAGED past
      // PostgREST's 1000-row cap (see supabasePaging).
      vocabData = await fetchPagedSafe(() => supabase
        .from('vocabulary').select('*')
        .eq('language', track.language).eq('system', track.system).eq('is_active', true)
        .order('id', { ascending: true }))
      cardsData = await fetchPagedSafe(() => supabase
        .from('cards').select('vocab_id, is_easy, state, learned, due_at')
        .eq('user_id', session.user.id)
        .order('vocab_id', { ascending: true }))
      // Reading is CUMULATIVE: every level the learner has reached.
      const sres = await supabase
        .from('stories').select('*')
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_published', true)
        .order('level', { ascending: false })
        .order('tier', { ascending: true }).order('story_number', { ascending: true })
      storiesData = sres.data
      const rres = await supabase
        .from('story_reads').select('story_id, read_at').eq('user_id', session.user.id)
      readsData = rres.data
      // The next level's stories, WITHOUT content — the "road ahead" teaser.
      const nres = await supabase
        .from('stories')
        .select('id, title, level, tier, story_number, presentation, panels, image_path, english_summary')
        .eq('language', track.language).eq('system', track.system)
        .eq('level', track.current_level + 1).eq('is_published', true)
        .order('tier', { ascending: true }).order('story_number', { ascending: true })
      nextData = nres.data
      // Chapter unlocks + today's reward claim + the active-series pointer.
      // Each is best-effort: before the migration lands these come back as
      // errors and the shelf simply behaves as if nothing is unlocked yet.
      const [ures, cres, tres, rvres] = await Promise.all([
        supabase.from('story_unlocks').select('story_id').eq('user_id', session.user.id),
        supabase.from('story_reward_claims').select('claim_date, story_id')
          .eq('user_id', session.user.id).eq('language', track.language)
          .eq('system', track.system).eq('claim_date', todayStr()).maybeSingle(),
        supabase.from('language_tracks').select('active_series')
          .eq('user_id', session.user.id).eq('language', track.language)
          .eq('system', track.system).maybeSingle(),
        supabase.from('review_logs').select('vocab_id')
          .eq('user_id', session.user.id)
          .gte('reviewed_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
          .limit(400),
      ])
      unlocksData = ures.error ? null : (ures.data || [])
      claimData = cres.error ? null : (cres.data || null)
      activeSeriesData = tres.error ? null : ((tres.data && tres.data.active_series) || null)
      recentData = rvres.error ? null : (rvres.data || [])
    } catch { fetchFailed = true /* offline — fall back to the cached snapshot below */ }

    if (storiesData && storiesData.length) {
      cacheSet(snapKey, {
        vocabData, cardsData, storiesData, readsData, nextData,
        unlocksData, claimData, activeSeriesData, recentData,
      })
    } else {
      const snap = await cacheGet(snapKey)
      if (snap) {
        vocabData = vocabData || snap.vocabData
        cardsData = cardsData || snap.cardsData
        storiesData = snap.storiesData
        readsData = readsData || snap.readsData
        nextData = nextData || snap.nextData
        unlocksData = unlocksData || snap.unlocksData
        claimData = claimData || snap.claimData
        activeSeriesData = activeSeriesData || snap.activeSeriesData
        recentData = recentData || snap.recentData
      } else if (fetchFailed || storiesData == null) {
        setLoadFailed(true)
      }
    }

    const map = {}
    ;(vocabData || []).forEach(v => { map[v.word] = v })
    setVocabMap(map)

    const cardsMap = {}
    ;(cardsData || []).forEach(c => { cardsMap[c.vocab_id] = c })
    setUserCards(cardsMap)

    const perLevel = learnedByLevel(vocabData || [], cardsData || [])
    setLearnedPerLevel(perLevel)
    const currentLevelIds = new Set(
      (vocabData || []).filter(v => v.level === track.current_level).map(v => v.id)
    )
    const learned = (cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length
    setLearnedCount(learned)

    setStories(storiesData || [])
    setNextLevelStories(nextData || [])
    const readRows = readsData || []
    const readSet = new Set(readRows.map(r => r.story_id))
    setReads(readRows)
    setReadIds(readSet)
    let unlockSet = new Set((unlocksData || []).map(u => u.story_id))
    // A cached snapshot can hand back YESTERDAY'S claim — a claim only means
    // anything on the local day it was made.
    setClaim(claimData && claimData.claim_date === todayStr() ? claimData : null)
    setActiveSeriesKey(activeSeriesData || null)
    setRecentVocabIds((recentData || []).map(r => r.vocab_id))

    // Grandfathering: a learner with reads but NO unlock rows was reading
    // before the chapter system existed. Seed what they could already reach
    // (their read chapters' series, one past the furthest read) once.
    if (unlockSet.size === 0 && readSet.size > 0 && (unlocksData !== null)) {
      const seedFlagKey = 'storyUnlocks:seeded:' + track.language + ':' + track.system
      const seeded = await prefsGet(seedFlagKey)
      if (!seeded) {
        const seedIds = seedUnlockIds(buildSeriesUnits(storiesData || []), readSet)
        if (seedIds.length > 0) {
          try {
            const rows = seedIds.map(id => ({ user_id: session.user.id, story_id: id, source: 'seed' }))
            const { error } = await supabase.from('story_unlocks')
              .upsert(rows, { onConflict: 'user_id,story_id', ignoreDuplicates: true })
            if (!error) unlockSet = new Set([...unlockSet, ...seedIds])
          } catch { /* seeding retries next load */ }
        }
        prefsMerge(seedFlagKey, { done: true })
      }
    }
    setUnlockIds(unlockSet)

    // Deep-link from the post-study recap ("Read now"): open the story
    // straight into the reader instead of the shelf.
    if (initialStoryId) {
      const target = (storiesData || []).find(s => s.id === initialStoryId)
      if (target) {
        setSelectedCategory(categoryForStory(target, track))
        setSelectedStory(target)
        setView('reader')
        if (initialStoryWords && initialStoryWords.length) setTodayWords(initialStoryWords)
        if (initialStoryFirstMission) setFirstMission(true)
      }
      if (onInitialStoryConsumed) onInitialStoryConsumed()
    }

    setLoading(false)
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [])

  // A banked claim (session completed with nothing to unlock at the time)
  // redeems itself the moment an active series with a locked chapter exists —
  // "you already did today's flashcards" should never expire while the day
  // lasts. One attempt per mount; the RPC is idempotent anyway.
  useEffect(() => {
    if (loading || redeemAttempted.current) return
    if (rewardState.state !== 'banked' || !rewardState.chapter) return
    redeemAttempted.current = true
    const chapter = rewardState.chapter
    claimStoryReward({ userId: session.user.id, track, storyId: chapter.id }).then(res => {
      if (res && res.redeemed && res.story_id === chapter.id) {
        setUnlockIds(prev => { const nx = new Set(prev); nx.add(chapter.id); return nx })
        setClaim({ claim_date: todayStr(), story_id: chapter.id })
        const info = chapterInfo(chapter, (activeUnit ? activeUnit.parts.indexOf(chapter) : 0))
        toast({ title: 'Chapter unlocked — ' + (info.nativeLabel || 'Chapter ' + info.number), accent: accentHex })
      }
    })
  }, [loading, rewardState, session.user.id, track, activeUnit, accentHex])

  useEffect(() => {
    if (loading) return
    if (routeKind === 'browse') {
      setView('browse')
      setSelectedStory(null)
      setSelectedArc(null)
      setReaderFromSeries(false)
      return
    }
    if (routeKind === 'story' && routeStoryId) {
      const target = stories.find(s => s.id === routeStoryId)
      if (!target) {
        if (!loadFailed && missingStoryNotified.current !== routeStoryId) {
          missingStoryNotified.current = routeStoryId
          toast({ title: "That story isn't available", accent: accentHex })
          if (onBrowseRoute) onBrowseRoute()
        }
        return
      }
      if (view === 'reader' && selectedStory?.id === target.id) return
      setSelectedCategory(categoryForStory(target, track))
      setSelectedStory(target)
      setReaderFromSeries(false)
      setView('reader')
      return
    }
    if (routeKind === 'series' && routeSeriesKey) {
      const unit = sections.flatMap(s => s.units).find(u => u.kind === 'series' && u.key === routeSeriesKey)
      if (!unit || (view === 'series' && selectedArc?.key === unit.key)) return
      setSelectedArc(unit)
      setSelectedStory(null)
      setView('series')
    }
  }, [loading, loadFailed, routeKind, routeStoryId, routeSeriesKey, stories, sections, selectedStory?.id, selectedArc?.key, view, track, accentHex, onBrowseRoute])
  /* eslint-enable react-hooks/set-state-in-effect */

  // First-visit tour of the library — browse view only, never over the reader
  // or a series page, and only once (rules in tour.js). The delay lets the
  // shelf paint before anything is pointed at.
  const [tourSteps, setTourSteps] = useState(null)
  const profileCreatedAt = profile.created_at
  useEffect(() => {
    if (loading || view !== 'browse') return undefined
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'stories', profileCreatedAt })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [loading, view, profileCreatedAt])

  // ── Shared actions ───────────────────────────────────────────────────────

  const levelLabelFor = (story) => getLevelLabel(track.language, track.system, story.level == null ? track.current_level : story.level)

  const openStory = (story, fromSeries = false) => {
    setSelectedCategory(categoryForStory(story, track))
    setSelectedStory(story)
    setReaderFromSeries(fromSeries)
    setView('reader')
    if (onStoryRoute) onStoryRoute(story.id)
  }

  const openSeries = (arc) => {
    setSelectedArc(arc)
    setView('series')
    if (onSeriesRoute) onSeriesRoute(arc.key)
  }

  // A unit opens as a series page when it has chapters to choose between, and
  // straight into the reader when it is a single story (no pointless stop).
  const openUnit = (unit) => {
    if (unit.parts.length > 1) openSeries(unit)
    else openStory(unit.parts[0])
  }

  const setActiveSeries = async (key) => {
    setActiveSeriesKey(key)
    try {
      await supabase.from('language_tracks')
        .update({ active_series: key })
        .eq('user_id', session.user.id)
        .eq('language', track.language)
        .eq('system', track.system)
    } catch { /* the fallback (most recent read) keeps rewards flowing */ }
  }

  // Finishing a chapter: record it locally, adopt its series as active when
  // none is chosen yet, and let a banked claim redeem against what's next.
  const handleMarkRead = (id) => {
    setReadIds(prev => { const nx = new Set(prev); nx.add(id); return nx })
    setReads(prev => [...prev, { story_id: id, read_at: new Date().toISOString() }])
    const unit = rewardUnits.find(u => u.parts.some(p => p.id === id))
    if (unit && !activeSeriesKey) setActiveSeries(unit.key)
    if (unit && claim && !claim.story_id) {
      const idx = unit.parts.findIndex(p => p.id === id)
      const next = unit.parts[idx + 1]
      if (next && !readIds.has(next.id) && !unlockIds.has(next.id)) {
        claimStoryReward({ userId: session.user.id, track, storyId: next.id }).then(res => {
          if (res && res.redeemed && res.story_id === next.id) {
            setUnlockIds(prev => { const nx = new Set(prev); nx.add(next.id); return nx })
            setClaim({ claim_date: todayStr(), story_id: next.id })
          }
        })
      }
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={pageShell()}>
        <div role="status" aria-label="Loading stories" style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px' }}>
          <div style={{ width: '190px', height: '30px', borderRadius: '8px', background: 'var(--surface-2)', margin: '4px 0 20px' }} />
          <div style={{ height: isMobile ? '280px' : '340px', borderRadius: '24px', background: accentHex + '18', border: '1px solid ' + accentHex + '24', marginBottom: '28px' }} />
          <div style={{ width: '190px', height: '22px', borderRadius: '8px', background: 'var(--surface-2)', marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '16px', overflow: 'hidden' }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ flex: isMobile ? '0 0 38vw' : '0 0 176px' }}>
                <div style={{ aspectRatio: '2 / 3', borderRadius: '14px', background: 'var(--surface-2)' }} />
                <div style={{ width: '68%', height: '13px', borderRadius: '6px', background: 'var(--surface-2)', marginTop: '10px' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Reader view ──────────────────────────────────────────────────────────

  // The reader opens on the story alone — selectedCategory only enriches the
  // "next" logic, so a story whose tier isn't in the tier table (bad data)
  // still reads instead of silently bouncing back to the shelf.
  if (view === 'reader' && selectedStory) {
    // Chapter-aware "next": inside a series the next chapter (open or locked)
    // drives the finish state; outside one the old same-shelf next remains.
    const readerUnit = rewardUnits.find(u => u.parts.some(p => p.id === selectedStory.id)) || null
    const chapterNext = readerUnit
      ? nextChapterInfo({ parts: readerUnit.parts, storyId: selectedStory.id, readIds, unlockIds })
      : null

    const catStories = storiesIn(selectedCategory)
    const currentIdx = catStories.findIndex(s => s.id === selectedStory.id)
    const shelfNext = currentIdx >= 0 && currentIdx < catStories.length - 1
      ? catStories[currentIdx + 1] : null
    const nextStory = readerUnit
      ? (chapterNext && chapterNext.kind === 'unlocked' ? chapterNext.story : null)
      : shelfNext

    const shelfLevel = selectedCategory ? selectedCategory.level : levelOf(selectedStory.level)
    const tiersWithStories = new Set(
      stories.filter(s => levelOf(s.level) === shelfLevel).map(s => s.tier)
    )
    const nextTierUnlock = nextStory || readerUnit
      ? null
      : nextLockedTier(tiersAt(shelfLevel), learnedAt(shelfLevel), tiersWithStories)

    return (
      <StoryReader
        // Keyed by story so moving to the next chapter remounts the reader
        // cleanly — every reader engine starts the new chapter from its top.
        key={selectedStory.id}
        story={selectedStory}
        vocabMap={vocabMap}
        userCards={userCards}
        setUserCards={setUserCards}
        session={session}
        profile={profile}
        track={track}
        onBack={() => {
          if (readerFromSeries && selectedArc) {
            setView('series')
            if (onSeriesRoute) onSeriesRoute(selectedArc.key)
          } else {
            setView('browse')
            if (onBrowseRoute) onBrowseRoute()
          }
        }}
        onHome={onBack}
        onPractice={onNavigate ? (words) => onNavigate('fillblank', { practiceWords: words }) : null}
        onStudy={onNavigate ? () => onNavigate('study') : null}
        todayWords={todayWords}
        firstMission={firstMission}
        nextStory={nextStory}
        nextChapter={chapterNext && readerUnit ? { ...chapterNext, seriesTitle: readerUnit.title } : null}
        nextTierUnlock={nextTierUnlock}
        onNextStory={() => {
          if (!nextStory) return
          setSelectedStory(nextStory)
          if (onStoryRoute) onStoryRoute(nextStory.id)
        }}
        isRead={readIds.has(selectedStory.id)}
        onMarkRead={handleMarkRead}
      />
    )
  }

  // ── Series detail view ───────────────────────────────────────────────────

  if (view === 'series' && selectedArc) {
    const arcHasLockedChapters = selectedArc.parts.length > 1
    const rewardKeyOf = (arc) => {
      const match = rewardUnits.find(u => u.parts.some(p => arc.parts.some(ap => ap.id === p.id)))
      return match ? match.key : arc.key
    }
    const arcRewardKey = rewardKeyOf(selectedArc)
    return (
      <div style={pageShell()}>
        <div style={{ maxWidth: isMobile ? '860px' : '980px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <SeriesDetail
            unit={selectedArc}
            readIds={readIds}
            unlockIds={unlockIds}
            accentHex={accentHex}
            fontFamily={fontFamily}
            levelLabel={levelLabelFor(selectedArc.parts[0])}
            isMobile={isMobile}
            vocabMap={vocabMap}
            userCards={userCards}
            recentVocabIds={recentVocabIds}
            language={track.language}
            isActiveSeries={activeUnit ? activeUnit.key === arcRewardKey : false}
            canMakeActive={arcHasLockedChapters && (!activeUnit || activeUnit.key !== arcRewardKey)}
            onMakeActive={() => setActiveSeries(arcRewardKey)}
            onOpenChapter={(story) => openStory(story, true)}
            onStudy={onNavigate ? () => onNavigate('study') : null}
            onBack={() => {
              setView('browse')
              setSelectedArc(null)
              if (onBrowseRoute) onBrowseRoute()
            }}
          />
        </div>
      </div>
    )
  }

  // ── Browse view ──────────────────────────────────────────────────────────

  // Series first: the library's real shape is 4–10 series per level plus a
  // couple of standalone pieces and a few practice scenarios, so the page is
  // a Continue-reading card, the current level's series as a vertical poster
  // grid, short reads and practice as smaller secondary sections, passed
  // levels collapsed to a two-poster preview, and the next level as a small
  // locked teaser. All gating and ordering still comes from storyShelfFlat.

  // Prefer the tier-aware shelf unit (it carries lock state) when opening a
  // series from the card; the reward unit is a plain fallback.
  const sectionsUnitFor = (rewardUnit) => sections
    .flatMap(s => s.units)
    .find(u => u.kind === 'series' && u.parts.some(p => rewardUnit.parts.some(rp => rp.id === p.id))) || null

  const onCardAction = () => {
    if (!card) return
    if (card.action === 'study') {
      if (onNavigate) onNavigate('study')
      return
    }
    // A fresh series pick is a "choose your show" moment — land on its page.
    // Everything else (continue, unlocked chapter, a standalone) reads now.
    if (card.kind === 'start-here' && card.unit && card.unit.parts.length > 1) {
      openSeries(sectionsUnitFor(card.unit) || card.unit)
      return
    }
    openStory(card.chapter)
  }

  const levelLabelAt = (lvl) => getLevelLabel(track.language, track.system, lvl)

  const posterGrid = (small = false) => ({
    display: 'grid',
    gridTemplateColumns: isMobile
      ? 'repeat(' + (small ? 3 : 2) + ', minmax(0, 1fr))'
      : 'repeat(auto-fill, minmax(' + (small ? '124px' : '158px') + ', 1fr))',
    gap: isMobile ? '18px 12px' : '24px 16px',
  })

  const renderUnit = (unit, { small = false } = {}) => (
    <StoryPoster
      key={unit.key}
      story={unit.parts[0]}
      title={unit.title}
      metaLine={small && !unit.locked && !unit.allRead
        ? (readableLabel(unit.knownPct) || posterMeta(unit))
        : posterMeta(unit)}
      accentHex={accentHex}
      fontFamily={fontFamily}
      read={unit.parts.length === 1 && unit.readCount > 0}
      locked={unit.locked}
      lockLabel={unit.locked ? posterMeta(unit) : null}
      manhua={isManhuaUnit(unit)}
      series={unit.kind === 'series' && unit.parts.length > 1}
      progress={unit.parts.length > 1 ? { readCount: unit.readCount, total: unit.total } : null}
      onClick={() => openUnit(unit)}
    />
  )

  const renderPractice = (story) => {
    const minutes = readingMinutes(story)
    return (
      <StoryPoster
        key={story.id}
        story={story}
        title={story.title}
        metaLine={readIds.has(story.id) ? 'Read' : (minutes ? minutes + ' min' : 'Practice')}
        accentHex={accentHex}
        fontFamily={fontFamily}
        practice
        read={readIds.has(story.id)}
        onClick={() => openStory(story)}
      />
    )
  }

  // One header pattern for every group: the name, a quiet count, and at most
  // one action (the earlier-levels expander).
  const sectionHead = (id, title, count, action = null) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
        <h2 id={id} style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '17px' : '19px', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        {count && (
          <span style={{ color: 'var(--text-faint)', fontSize: '12.5px', fontWeight: 650, whiteSpace: 'nowrap' }}>{count}</span>
        )}
      </div>
      {action}
    </div>
  )

  const toggleLevel = (level) => setExpandedLevels(prev => {
    const next = new Set(prev)
    if (next.has(level)) next.delete(level)
    else next.add(level)
    return next
  })

  const hasShelf = browse.current || browse.earlier.length > 0 || browse.comingUp

  // The tour's "Your library" step anchors on the first grid section present
  // — the series grid normally, whatever leads the page otherwise.
  const shelfAnchor = browse.current && browse.current.series.length > 0 ? 'current-series'
    : browse.current && browse.current.shorts.length > 0 ? 'short-reads'
    : browse.current && browse.current.practice.length > 0 ? 'practice-stories'
    : browse.earlier.length > 0 ? 'level-' + browse.earlier[0].level
    : null
  const tourFor = (id) => (shelfAnchor === id ? 'stories-shelf' : undefined)

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '20px 16px 64px' : '34px 32px 80px', position: 'relative', zIndex: 1 }}>
        {/* Stories is a primary destination — no back button; the app nav is
            the way out. */}
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', margin: '0 0 18px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '26px' : '30px', fontWeight: 820, letterSpacing: '-0.035em' }}>
            Stories
          </h1>
          <Eyebrow>{levelLabelAt(track.current_level)}</Eyebrow>
        </header>

        {card && (
          <StoryContinueCard
            card={card}
            accentHex={accentHex}
            fontFamily={fontFamily}
            isMobile={isMobile}
            onAction={onCardAction}
          />
        )}

        {!hasShelf && (loadFailed ? (
          <EmptyPanel
            icon={CloudOff} title="Couldn't load stories"
            text="The library couldn't be reached. Check your connection and try again."
            actionIcon={RefreshCw} actionLabel="Retry" onAction={loadData}
          />
        ) : (
          <EmptyPanel icon={Library} title="No stories yet" text="Stories for your level are on the way. Keep learning words — they'll be here waiting." />
        ))}

        <div style={{ display: 'grid', gap: isMobile ? '30px' : '38px' }}>
          {browse.current && browse.current.series.length > 0 && (
            <section aria-labelledby="current-series" data-tour={tourFor('current-series')} className="hd-rise" style={{ minWidth: 0 }}>
              {sectionHead('current-series', levelLabelAt(browse.current.level) + ' series',
                browse.current.readCount + ' of ' + browse.current.total + ' read')}
              <div data-testid="poster-grid" style={posterGrid()}>
                {browse.current.series.map(renderUnit)}
              </div>
            </section>
          )}

          {browse.current && browse.current.shorts.length > 0 && (
            <section aria-labelledby="short-reads" data-tour={tourFor('short-reads')} className="hd-rise" style={{ minWidth: 0 }}>
              {sectionHead('short-reads', 'Short reads', null)}
              <div data-testid="poster-grid" style={posterGrid(true)}>
                {browse.current.shorts.map(unit => renderUnit(unit, { small: true }))}
              </div>
            </section>
          )}

          {browse.current && browse.current.practice.length > 0 && (
            <section aria-labelledby="practice-stories" data-tour={tourFor('practice-stories')} className="hd-rise" style={{ minWidth: 0 }}>
              {sectionHead('practice-stories', 'Practice', null)}
              <div data-testid="poster-grid" style={posterGrid(true)}>
                {browse.current.practice.map(renderPractice)}
              </div>
            </section>
          )}

          {browse.earlier.map(lvl => {
            const expanded = expandedLevels.has(lvl.level)
            const shown = expanded ? [...lvl.preview, ...lvl.rest] : lvl.preview
            const headId = 'level-' + lvl.level
            return (
              <section key={headId} aria-labelledby={headId} data-tour={tourFor(headId)} className="hd-rise" style={{ minWidth: 0 }}>
                {sectionHead(headId, levelLabelAt(lvl.level), lvl.readCount + ' of ' + lvl.total + ' read',
                  (lvl.rest.length > 0 || lvl.practice.length > 0) ? (
                    <button
                      onClick={() => toggleLevel(lvl.level)}
                      aria-expanded={expanded}
                      className="hd-press"
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
                        color: ink(accentHex), fontSize: '13px', fontWeight: 750,
                        fontFamily: 'Inter, sans-serif', padding: '6px 2px', minHeight: '36px',
                      }}
                    >
                      {expanded ? 'Show less' : 'See all ' + (lvl.unitCount + lvl.practice.length)}
                    </button>
                  ) : null)}
                <div data-testid="poster-grid" style={posterGrid()}>
                  {shown.map(renderUnit)}
                  {expanded && lvl.practice.map(renderPractice)}
                </div>
              </section>
            )
          })}

          {browse.comingUp && (
            <section aria-labelledby="coming-up" data-tour="stories-ahead" className="hd-rise" style={{ minWidth: 0 }}>
              {sectionHead('coming-up', 'Coming up in ' + levelLabelAt(browse.comingUp.level), null)}
              <div style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px',
                padding: '14px 16px', borderRadius: '18px',
                border: '1px dashed var(--border)', background: 'var(--surface)',
              }}>
                <div aria-hidden="true" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {browse.comingUp.preview.map(unit => (
                    <StoryCover
                      key={unit.key} story={unit.parts[0]} path={unit.parts[0] && unit.parts[0].image_path}
                      accent={accentHex} radius={9}
                      style={{ width: isMobile ? '46px' : '54px', aspectRatio: '2 / 3', opacity: 0.72, border: '1px solid var(--border)' }}
                    />
                  ))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text)', fontSize: '13.5px', fontWeight: 750 }}>
                    <Lock size={14} strokeWidth={2.1} color="var(--text-muted)" aria-hidden="true" />
                    {browse.comingUp.count + (browse.comingUp.count === 1 ? ' story' : ' stories') + ' waiting'}
                  </div>
                  <div style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
                    {'Unlocks when you pass the ' + levelLabelAt(track.current_level) + ' test.'}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {tourSteps && (
          <TourOverlay
            steps={tourSteps}
            accentHex={accentHex}
            onClose={(outcome) => {
              setTourSteps(null)
              if (outcome) markTourSeen('stories', outcome)
            }}
          />
        )}
      </div>
    </div>
  )
}
