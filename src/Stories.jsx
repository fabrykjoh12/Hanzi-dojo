import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { cacheSet, cacheGet, prefsGet, prefsMerge } from './offline'
import { toast } from './toast'
import { languageTheme } from './languageTheme'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { tiersFor, learnedByLevel, readingGateCount, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { formatLabel } from './storyFormat'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'
import { calculateStoryReadability } from './storyReading'
import { readCache, writeCache } from './dataCache'
import { publish } from './cacheEvents'
import { stripSceneEmoji } from './sceneReading'
import { chapterInfo, nextChapterInfo, readingMinutes, seedUnlockIds } from './storyChapters'
import { buildSeriesUnits, resolveActiveSeries, rewardStateFor } from './storyReward'
import { claimStoryReward } from './storyRewardData'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import StoryPoster from './StoryPoster'
import SeriesDetail from './SeriesDetail'
import TourOverlay from './TourOverlay'
import { maybeStartTour, markTourSeen } from './tour'
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, CloudOff, Library, RefreshCw, Zap,
} from 'lucide-react'

// The Stories library. Content is organized as SERIES → CHAPTER → READER:
// vertical posters on horizontal rails (continue reading, the current level's
// picks, earlier levels, manhua, practice, the next level's teaser), a hero
// that carries the day's story reward, and a series detail page for choosing
// chapters. Chapter unlocking (one per completed flashcard session) is decided
// in storyChapters.js / storyReward.js — this file only renders it.

// ─── CONSTANTS / SMALL HELPERS ─────────────────────────────────────────────

// One key for "the shelf's data". Scoped per user and language by dataCache.
const STORIES_CACHE_KEY = 'stories:shelf'

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

// ─── SHELF ROWS ────────────────────────────────────────────────────────────

// Poster rail item width: ~2.4 posters visible on a phone, fixed on desktop.
function posterItemStyle(isMobile) {
  return {
    flex: isMobile ? '0 0 clamp(128px, 38vw, 168px)' : '0 0 176px',
    scrollSnapAlign: 'start', minWidth: 0,
  }
}

function ShelfRow({ id, title, subtitle, isMobile, children, dataTour }) {
  const railRef = useRef(null)
  const scroll = (direction) => {
    const rail = railRef.current
    if (!rail) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.78, 280), behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-labelledby={id} data-tour={dataTour} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '16px', marginBottom: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={id} style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '17px' : '19px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {title}
          </h2>
          {subtitle && <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.45 }}>{subtitle}</p>}
        </div>
        {!isMobile && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button type="button" onClick={() => scroll(-1)} aria-label={'Scroll ' + title + ' left'} className="hd-press" style={railArrowStyle}>
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label={'Scroll ' + title + ' right'} className="hd-press" style={railArrowStyle}>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={railRef}
        data-testid="story-shelf-rail"
        data-shelf={id}
        style={{
          display: 'flex', gap: isMobile ? '12px' : '16px', overflowX: 'auto', overflowY: 'visible',
          overscrollBehaviorInline: 'contain', scrollSnapType: 'x proximity', scrollbarWidth: 'thin',
          padding: '4px 3px 16px', margin: '0 -3px', minWidth: 0,
        }}
      >
        {children}
      </div>
    </section>
  )
}

const railArrowStyle = {
  width: '44px', height: '44px', borderRadius: '999px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer',
}

// ─── FILTER CHIPS ──────────────────────────────────────────────────────────

function FilterChips({ options, value, onChange, accentHex }) {
  return (
    <div role="group" aria-label="Filter stories" style={{
      display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none',
      padding: '2px 3px 12px', margin: '0 -3px',
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className="hd-press"
            style={{
              flexShrink: 0, minHeight: '38px', padding: '0 15px', borderRadius: '999px',
              border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
              background: active ? accentHex : 'var(--surface)',
              color: active ? '#fff' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
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

// ─── THE HERO ──────────────────────────────────────────────────────────────

// One lit panel, carrying the day's most useful next step: the story reward
// when the learner has a series going (locked → "start flashcards", unlocked →
// "read now", everything open → "continue"), and a featured pick otherwise.
function StoriesHero({ hero, accentHex, fontFamily, isMobile, levelLabelOf }) {
  const coverStory = hero.cover
  return (
    <HeroPanel
      accentHex={accentHex}
      seed={hero.seed}
      padding="0"
      compact={isMobile}
      onClick={hero.onAction}
      style={{ margin: '0 0 26px', minHeight: isMobile ? '280px' : '340px' }}
      dataTour="stories-hero"
    >
      {({ hovered }) => (
        <div style={{ position: 'relative', minHeight: isMobile ? '280px' : '340px', display: 'flex', alignItems: 'end' }}>
          <StoryCover
            story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={0} loading="eager"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: isMobile
              ? 'linear-gradient(0deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.58) 58%, rgba(13,13,15,0.16) 100%)'
              : 'linear-gradient(90deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.70) 42%, rgba(13,13,15,0.14) 76%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '22px 20px' : '34px 38px', maxWidth: isMobile ? '100%' : '620px' }}>
            <Eyebrow onHero>{hero.eyebrow}</Eyebrow>
            {hero.kicker && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '12px',
                fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em',
                color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: '999px', padding: '6px 12px',
              }}>
                {hero.kickerIcon}
                {hero.kicker}
              </div>
            )}
            <div style={{
              fontFamily: fontFamily + ', Inter, sans-serif', color: '#fff',
              fontSize: isMobile ? '26px' : '36px', fontWeight: 700, lineHeight: 1.18,
              letterSpacing: '-0.02em', margin: '10px 0 8px',
            }}>
              {hero.title}
            </div>
            {hero.subtitle && (
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, maxWidth: '52ch' }}>
                {hero.subtitle}
              </div>
            )}
            <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.64)', fontSize: '12px', fontWeight: 700 }}>
              {hero.metaStory ? levelLabelOf(hero.metaStory) + ' · ' + formatLabel(hero.metaStory) : hero.meta}
            </div>
            <HeroAction label={hero.actionLabel} hovered={hovered} icon={hero.actionIcon || ArrowRight} accentHex={accentHex} />
          </div>
        </div>
      )}
    </HeroPanel>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({
  session, profile, track, onNavigate, initialStoryId, initialStoryWords,
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
  const [filter, setFilter] = useState('all')
  const missingStoryNotified = useRef(null)
  const redeemAttempted = useRef(false)
  const loadInFlight = useRef(false)
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
  // The shelf is loaded ONCE, and again only when something actually changed it.
  //
  // This effect used to fire on every mount, and the shell unmounted this
  // screen on every navigation — so Home → Stories → Home → Stories was four
  // runs of loadData and about nine Supabase queries each time. The Stories
  // root is now persistent (TabHost/<Activity>), which keeps the component's
  // state but re-runs its effects on every show; without a guard that would be
  // the same storm with extra steps.
  //
  // dataCache is the guard. It records that the shelf has been loaded and is
  // still valid; finishing a flashcard session invalidates it (Study.jsx), and
  // the next time this tab is shown it reloads exactly once. Switching tabs on
  // its own does nothing at all.
  useEffect(() => {
    if (loadInFlight.current) return undefined
    const cached = readCache(STORIES_CACHE_KEY)
    if (cached && !cached.invalidated) return undefined
    const timer = setTimeout(() => {
      // The effect has no dependency array (it must re-check on every show),
      // so without this a burst of renders during the first load would each
      // see an empty cache and start another one.
      loadInFlight.current = true
      loadData()
        .then(() => { writeCache(STORIES_CACHE_KEY, true) }, () => {})
        .then(() => { loadInFlight.current = false })
    }, 0)
    return () => clearTimeout(timer)
  })

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
        // Home's hand-off is now behind. The shelf is not — this screen just
        // applied the unlock to its own state — so it re-validates itself
        // rather than paying for a reload of something it already knows.
        publish('chapter:unlocked')
        writeCache(STORIES_CACHE_KEY, true)
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
    // What to read next changed, so Home's hand-off is behind. The shelf is
    // not: the two lines above just applied the read to it. Re-validating here
    // is not a nicety — the reader is rendered INSIDE this screen today
    // (navShell.INLINE_VIEWS), so letting the shelf reload would tear down the
    // finish overlay the learner is looking at.
    publish('story:read')
    writeCache(STORIES_CACHE_KEY, true)
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
            publish('chapter:unlocked')
            writeCache(STORIES_CACHE_KEY, true)
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
        onHome={onNavigate ? () => onNavigate('home') : null}
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

  const daily = pickDailyStory({ stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(), tiersFor: tiersAt, learnedFor: learnedAt })

  // The hero: today's story reward when a series is going, a featured pick
  // otherwise. Always exactly one lit panel.
  const buildHero = () => {
    const unitOfStory = (story) => rewardUnits.find(u => u.parts.some(p => p.id === story.id)) || null
    if (rewardState.state === 'locked' || rewardState.state === 'banked') {
      const chapter = rewardState.chapter
      const info = chapterInfo(chapter, activeUnit.parts.indexOf(chapter))
      return {
        seed: track.language + '-reward',
        eyebrow: 'Today’s story reward',
        kicker: 'Complete your flashcards to unlock',
        kickerIcon: <Zap size={13} strokeWidth={2.3} color="#fff" aria-hidden="true" />,
        title: activeUnit.title,
        subtitle: (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title,
        metaStory: chapter,
        cover: chapter.image_path ? chapter : activeUnit.parts[0],
        actionLabel: 'Start flashcards',
        actionIcon: Zap,
        onAction: onNavigate ? () => onNavigate('study') : undefined,
      }
    }
    if (rewardState.state === 'unlocked-today') {
      const story = stories.find(s => s.id === rewardState.storyId)
      if (story && !readIds.has(story.id)) {
        const unit = unitOfStory(story)
        const info = chapterInfo(story, unit ? unit.parts.findIndex(p => p.id === story.id) : 0)
        return {
          seed: track.language + '-reward',
          eyebrow: 'Today’s story reward',
          kicker: 'Chapter unlocked',
          kickerIcon: <CheckCircle2 size={13} strokeWidth={2.4} color="#fff" aria-hidden="true" />,
          title: unit ? unit.title : story.title,
          subtitle: unit ? (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title : story.english_summary,
          metaStory: story,
          cover: story.image_path ? story : (unit ? unit.parts[0] : story),
          actionLabel: 'Read now',
          actionIcon: BookOpen,
          onAction: () => openStory(story),
        }
      }
    }
    if (rewardState.state === 'all-unlocked' && activeUnit) {
      const chapter = rewardState.chapter
      const info = chapterInfo(chapter, activeUnit.parts.indexOf(chapter))
      const readCount = activeUnit.parts.filter(p => readIds.has(p.id)).length
      return {
        seed: track.language + '-continue',
        eyebrow: 'Continue reading',
        kicker: null,
        title: activeUnit.title,
        subtitle: (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title,
        meta: readCount + ' of ' + activeUnit.parts.length + ' chapters read',
        cover: chapter.image_path ? chapter : activeUnit.parts[0],
        actionLabel: 'Continue reading',
        actionIcon: BookOpen,
        onAction: () => openStory(chapter),
      }
    }
    if (!daily) return null
    const unit = unitOfStory(daily)
    return {
      seed: track.language + '-stories',
      eyebrow: rewardState.state === 'series-complete' ? 'Choose your next story' : 'Featured for you',
      kicker: rewardState.state === 'series-complete' ? 'Series complete — pick what’s next' : null,
      title: unit && unit.parts.length > 1 ? unit.title : daily.title,
      subtitle: daily.english_summary || null,
      metaStory: daily,
      cover: daily,
      actionLabel: readIds.has(daily.id) ? 'Read again' : 'Start reading',
      onAction: () => (unit && unit.parts.length > 1 ? openSeries(sectionsUnitFor(unit) || unit) : openStory(daily)),
    }
  }

  // Prefer the tier-aware shelf unit (it carries lock state) when opening a
  // series from the hero; the reward unit is a plain fallback.
  const sectionsUnitFor = (rewardUnit) => sections
    .flatMap(s => s.units)
    .find(u => u.kind === 'series' && u.parts.some(p => rewardUnit.parts.some(rp => rp.id === p.id))) || null

  const hero = buildHero()

  // Filters: All · one chip per level with content · Manhua (when present).
  const levelChips = sections.map(sec => ({
    value: 'level:' + sec.level,
    label: getLevelLabel(track.language, track.system, sec.level),
  }))
  const hasManhua = sections.some(sec => sec.units.some(isManhuaUnit))
  const filterOptions = [
    { value: 'all', label: 'All' },
    ...levelChips,
    ...(hasManhua ? [{ value: 'manhua', label: 'Manhua' }] : []),
  ]

  const primarySection = sections.find(sec => sec.isCurrent) || sections[0] || null
  const continueUnits = sections.flatMap(sec => sec.units.map(unit => ({ unit, section: sec })))
    .filter(({ unit }) => !unit.locked && unit.readCount > 0 && !unit.allRead)
  const manhuaUnits = sections.flatMap(sec => sec.units.filter(isManhuaUnit).map(unit => ({ unit, section: sec })))
  const practiceStories = sections.flatMap(sec => sec.practice.map(story => ({ story, section: sec })))
  const upcomingUnits = aheadSection ? aheadSection.units.map(unit => ({ unit, section: aheadSection })) : []

  const posterFor = ({ unit, section }) => {
    const lockLabel = section.levelLocked
      ? 'Unlocks at ' + getLevelLabel(track.language, track.system, section.level)
      : unit.locked ? 'Learn ' + unit.remaining + ' more word' + (unit.remaining === 1 ? '' : 's') : null
    const series = unit.parts.length > 1
    const first = unit.parts[0]
    const minutes = !series ? readingMinutes(first) : null
    const metaLine = series
      ? [levelLabelFor(first), unit.total + ' chapters'].join(' · ')
      : [levelLabelFor(first), formatLabel(first), minutes ? minutes + ' min' : null].filter(Boolean).join(' · ')
        + (unit.readCount > 0 ? ' · Read' : '')
    return (
      <div key={section.level + '-' + unit.key} style={posterItemStyle(isMobile)}>
        <StoryPoster
          story={first}
          title={unit.title}
          metaLine={metaLine}
          accentHex={accentHex}
          fontFamily={fontFamily}
          read={!series && unit.readCount > 0}
          locked={unit.locked}
          lockLabel={lockLabel}
          manhua={isManhuaUnit(unit)}
          knownPct={unit.knownPct}
          progress={series ? { readCount: unit.readCount, total: unit.total } : null}
          onClick={() => openUnit(unit)}
        />
      </div>
    )
  }

  const sectionRow = (sec) => {
    const units = sec.units.map(unit => ({ unit, section: sec }))
    if (units.length === 0) return null
    const isCurrent = sec.isCurrent
    return (
      <ShelfRow
        key={'level-' + sec.level}
        id={isCurrent ? 'top-picks' : 'level-' + sec.level}
        dataTour={isCurrent ? 'stories-shelf' : undefined}
        title={isCurrent ? 'Top picks for you' : getLevelLabel(track.language, track.system, sec.level)}
        subtitle={isCurrent
          ? getLevelLabel(track.language, track.system, sec.level) + ' · easiest to read first'
          : 'From a level you’ve already passed.'}
        isMobile={isMobile}
      >
        {units.map(posterFor)}
      </ShelfRow>
    )
  }

  const showAll = filter === 'all'
  const filteredLevel = filter.startsWith('level:') ? Number(filter.slice(6)) : null

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '20px 16px 64px' : '34px 32px 80px', position: 'relative', zIndex: 1 }}>
        {/* Stories is a primary destination — no back button; the app nav is
            the way out. */}
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', margin: '0 0 16px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '26px' : '30px', fontWeight: 820, letterSpacing: '-0.035em' }}>
            Stories
          </h1>
          <Eyebrow>{getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}</Eyebrow>
        </header>

        {hero ? (
          <StoriesHero hero={hero} accentHex={accentHex} fontFamily={fontFamily} isMobile={isMobile} levelLabelOf={levelLabelFor} />
        ) : loadFailed ? (
          <EmptyPanel
            icon={CloudOff} title="Couldn't load stories"
            text="The library couldn't be reached. Check your connection and try again."
            actionIcon={RefreshCw} actionLabel="Retry" onAction={loadData}
          />
        ) : (
          <EmptyPanel icon={Library} title="No stories yet" text="Stories for your level are on the way. Keep learning words — they'll be here waiting." />
        )}

        {(sections.length > 0 || aheadSection) && (
          <>
            {filterOptions.length > 2 && (
              <FilterChips options={filterOptions} value={filter} onChange={setFilter} accentHex={accentHex} />
            )}

            <div style={{ display: 'grid', gap: isMobile ? '26px' : '32px' }}>
              {showAll && continueUnits.length > 0 && (
                <ShelfRow id="continue-reading" title="Continue reading" subtitle="Pick up where you left off." isMobile={isMobile}>
                  {continueUnits.map(posterFor)}
                </ShelfRow>
              )}

              {showAll && primarySection && sectionRow(primarySection)}
              {showAll && sections.filter(sec => sec !== primarySection).map(sectionRow)}
              {!showAll && filteredLevel != null && sections.filter(sec => sec.level === filteredLevel).map(sectionRow)}

              {(showAll || filter === 'manhua') && manhuaUnits.length > 0 && (
                <ShelfRow id="manhua" title="Manhua" subtitle="Illustrated episodes — read the panels, tap the bubbles." isMobile={isMobile}>
                  {manhuaUnits.map(posterFor)}
                </ShelfRow>
              )}

              {showAll && practiceStories.length > 0 && (
                <ShelfRow id="practice-stories" title="Practice through stories" subtitle="Short chats, scenes, and reply-alongs." isMobile={isMobile}>
                  {practiceStories.map(({ story, section }) => (
                    <div key={section.level + '-' + story.id} style={posterItemStyle(isMobile)}>
                      <StoryPoster
                        story={story}
                        title={story.title}
                        metaLine={[levelLabelFor(story), 'Practice'].join(' · ') + (readIds.has(story.id) ? ' · Read' : '')}
                        accentHex={accentHex}
                        fontFamily={fontFamily}
                        practice
                        read={readIds.has(story.id)}
                        onClick={() => openStory(story)}
                      />
                    </div>
                  ))}
                </ShelfRow>
              )}

              {showAll && upcomingUnits.length > 0 && (
                <ShelfRow
                  id="coming-up"
                  title={'Coming up in ' + getLevelLabel(track.language, track.system, aheadSection.level)}
                  subtitle={'Unlocks when you pass the ' + getLevelLabel(track.language, track.system, track.current_level) + ' test.'}
                  isMobile={isMobile}
                  dataTour="stories-ahead"
                >
                  {upcomingUnits.map(posterFor)}
                </ShelfRow>
              )}
            </div>
          </>
        )}

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
