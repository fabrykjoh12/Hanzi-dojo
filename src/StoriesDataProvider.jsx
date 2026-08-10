import { useState, useMemo, useRef, useCallback } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { cacheSet, cacheGet, prefsGet, prefsMerge } from './offline'
import { todayStr } from './streak'
import { isLearned } from './mastery'
import { tiersFor, learnedByLevel, readingGateCount } from './storyTiers'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'
import { calculateStoryReadability } from './storyReading'
import { stripSceneEmoji } from './sceneReading'
import { seedUnlockIds } from './storyChapters'
import { buildSeriesUnits, resolveActiveSeries, rewardStateFor } from './storyReward'
import { claimStoryReward } from './storyRewardData'
import { readCache, writeCache } from './dataCache'
import { publish } from './cacheEvents'
import { StoriesDataContext, STORIES_CACHE_KEY } from './storiesDataContext'

// The Stories tab's data, owned above the screens that read it.
//
// Why this exists: the shelf, the series page and the reader are three separate
// destinations in the navigation model (NAV-MODEL §8) but ONE body of data —
// the same stories, the same reads, the same unlocks, the same vocabulary map.
// While all three were rendered inside Stories.jsx that was free, because they
// were literally the same component; the moment they became real pushed and
// presented screens it stopped being free, and the choice was either to refetch
// nine queries per screen or to own the data above all three. This is the
// second one.
//
// It is a provider rather than a module-level store because the data is scoped
// to a signed-in learner and a track, and because React already has the right
// lifecycle for that: mounted with the authenticated shell, gone with it.
//
// Laziness is preserved deliberately: nothing loads until a screen calls
// `ensureLoaded()`. A learner who never opens Stories never pays for it, which
// is the same promise TabHost's lazy first mount makes.
//

export function StoriesDataProvider({ session, profile, track, children }) {
  const [stories, setStories] = useState([])
  const [nextLevelStories, setNextLevelStories] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [reads, setReads] = useState([])
  // Chapters unlocked by flashcard sessions (story_unlocks) + today's claim.
  const [unlockIds, setUnlockIds] = useState(new Set())
  const [claim, setClaim] = useState(null)
  const [activeSeriesKey, setActiveSeriesKey] = useState(null)
  // Vocab ids reviewed in the last few days — the "words you'll recognize" pool.
  const [recentVocabIds, setRecentVocabIds] = useState([])
  const [learnedCount, setLearnedCount] = useState(0)
  const [learnedPerLevel, setLearnedPerLevel] = useState({})
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const loadInFlight = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)

    // Everything the stories screens need, mirrored into IndexedDB so the
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
    setLearnedCount((cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length)

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
    setLoading(false)
    return storiesData || []
  }, [session, track])

  // Called by whichever Stories screen mounts or becomes visible first.
  //
  // dataCache holds the VALIDITY, not the rows: it records that the shelf has
  // been loaded and is still trustworthy, an event invalidates it
  // (cacheEvents.js), and the next screen to ask reloads exactly once. Switching
  // tabs, pushing the series page and opening the reader all do nothing at all.
  const ensureLoaded = useCallback(() => {
    if (loadInFlight.current) return
    const cached = readCache(STORIES_CACHE_KEY)
    if (cached && !cached.invalidated) return
    loadInFlight.current = true
    loadData()
      .then(() => { writeCache(STORIES_CACHE_KEY, true) }, () => {})
      .then(() => { loadInFlight.current = false })
  }, [loadData])

  // ── Derived, once, for all three screens ─────────────────────────────────

  const { sections, aheadSection } = useMemo(() => {
    const tiersAtL = (lvl) => tiersFor(track.language, lvl == null ? track.current_level : lvl)
    const learnedAtL = (lvl) => readingGateCount({
      level: lvl == null ? track.current_level : lvl,
      currentLevel: track.current_level,
      learnedAtLevel: learnedPerLevel[lvl == null ? track.current_level : lvl] || 0,
      tiers: tiersAtL(lvl),
    })
    const cache = new Map()
    const knownPctFor = (story) => {
      if (cache.has(story.id)) return cache.get(story.id)
      const content = story.presentation === 'scene' ? stripSceneEmoji(story.content) : story.content
      const { knownPct } = calculateStoryReadability({ content, vocabMap, cards: userCards, language: track.language })
      cache.set(story.id, knownPct)
      return knownPct
    }
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

  // ── Mutations ────────────────────────────────────────────────────────────

  const setActiveSeries = useCallback(async (key) => {
    setActiveSeriesKey(key)
    try {
      await supabase.from('language_tracks')
        .update({ active_series: key })
        .eq('user_id', session.user.id)
        .eq('language', track.language)
        .eq('system', track.system)
    } catch { /* the fallback (most recent read) keeps rewards flowing */ }
  }, [session, track])

  const applyUnlock = useCallback((storyId) => {
    setUnlockIds(prev => { const nx = new Set(prev); nx.add(storyId); return nx })
    setClaim({ claim_date: todayStr(), story_id: storyId })
    // Home's hand-off is behind; this data is not — the two lines above just
    // applied the unlock to it. Re-validating after publishing is what stops a
    // shelf reload tearing down whatever screen is open on top of it.
    publish('chapter:unlocked')
    writeCache(STORIES_CACHE_KEY, true)
  }, [])

  // Finishing a chapter: record it here, adopt its series as active when none
  // is chosen yet, and let a banked claim redeem against what's next.
  const markRead = useCallback((id) => {
    setReadIds(prev => { const nx = new Set(prev); nx.add(id); return nx })
    setReads(prev => [...prev, { story_id: id, read_at: new Date().toISOString() }])
    publish('story:read')
    writeCache(STORIES_CACHE_KEY, true)
    const unit = rewardUnits.find(u => u.parts.some(p => p.id === id))
    if (unit && !activeSeriesKey) setActiveSeries(unit.key)
    if (unit && claim && !claim.story_id) {
      const idx = unit.parts.findIndex(p => p.id === id)
      const next = unit.parts[idx + 1]
      if (next && !readIds.has(next.id) && !unlockIds.has(next.id)) {
        claimStoryReward({ userId: session.user.id, track, storyId: next.id }).then(res => {
          if (res && res.redeemed && res.story_id === next.id) applyUnlock(next.id)
        })
      }
    }
  }, [rewardUnits, activeSeriesKey, claim, readIds, unlockIds, session, track, setActiveSeries, applyUnlock])

  const value = useMemo(() => ({
    session, profile, track,
    stories, nextLevelStories, readIds, reads, unlockIds, claim, activeSeriesKey,
    recentVocabIds, learnedCount, learnedPerLevel, vocabMap, userCards,
    setUserCards, loading, loadFailed,
    sections, aheadSection, rewardUnits, activeUnit, rewardState,
    ensureLoaded, reload: loadData, markRead, setActiveSeries, applyUnlock,
  }), [
    session, profile, track,
    stories, nextLevelStories, readIds, reads, unlockIds, claim, activeSeriesKey,
    recentVocabIds, learnedCount, learnedPerLevel, vocabMap, userCards, loading, loadFailed,
    sections, aheadSection, rewardUnits, activeUnit, rewardState,
    ensureLoaded, loadData, markRead, setActiveSeries, applyUnlock,
  ])

  return <StoriesDataContext.Provider value={value}>{children}</StoriesDataContext.Provider>
}

export default StoriesDataProvider
