import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getAudioUrl } from './utils'
import { cacheSet, cacheGet } from './offline'
import { languageTheme } from './languageTheme'
import { tiersFor, learnedByLevel, readingGateCount, storyLevels, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { readingLadder, nextRung } from './readingLadder'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, Library, Lock, Sparkles,
} from 'lucide-react'

// Story tier definitions live in ./storyTiers (shared with the post-study
// recap's story matcher). Tiers are keyed by (language, level) — see tiersFor.

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

function getLanguageDetails(profile, track) {
  const language = track.language || profile.active_language
  const t = languageTheme(language)
  return {
    isJapanese: language === 'japanese',
    accentHex: t.accentHex,
    languageName: t.languageName,
    nativeName: t.nativeName,
    fontFamily: t.font,
  }
}


// ─── STYLE HELPERS ─────────────────────────────────────────────────────────

function pageShell() {
  return { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
}

// The selected "category" is a tier *at a level* — the shelf is cumulative, so
// tier 1 of HSK 1 and tier 1 of HSK 2 are different shelves. Returns a COPY of
// the shared tier object (tiersFor memoizes and returns shared instances, so it
// must never be mutated) tagged with the level it belongs to.
function categoryForStory(story, track) {
  if (!story) return null
  const level = story.level == null ? track.current_level : story.level
  const tier = tiersFor(track.language, level).find(c => c.tier === story.tier)
  return tier ? { ...tier, level } : null
}

function pillStyle(color, background, border) {
  return {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '12px', fontWeight: 800,
    color, background, border: '1px solid ' + border,
    padding: '5px 11px', borderRadius: '999px', lineHeight: 1,
  }
}


// ─── SHARED COMPONENTS ─────────────────────────────────────────────────────

function IconButton({ icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
        fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />
      {label}
    </button>
  )
}

function ProgressCard({ learnedCount, totalWords, accentHex }) {
  const pct = totalWords > 0 ? Math.min(100, Math.round((learnedCount / totalWords) * 100)) : 0
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '20px',
      border: '1px solid var(--border)', padding: '22px 24px',
      boxShadow: '0 18px 48px rgba(24,24,27,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 750 }}>Immersion unlocks</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650 }}>
          <span style={{ color: 'var(--text)', fontWeight: 800 }}>{learnedCount}</span>/{totalWords} · {pct}%
        </span>
      </div>
      <div style={{ height: '7px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: pct + '%',
          background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
          borderRadius: '999px', transition: 'width 600ms ease',
        }} />
      </div>
      <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
        Stories unlock from learned words, so reading starts early and reinforces the flashcards.
      </p>
    </div>
  )
}

// ─── CHARACTER GUIDE ───────────────────────────────────────────────────────

// CHARACTER_READINGS is shared with StoryReaderImmersive — see characterNames.js
// (imported at the top of this file).


// ─── LIST / CATEGORY COMPONENTS ────────────────────────────────────────────

function StoryListCard({ story, read, accentHex, fontFamily, onClick }) {
  const [hovered, setHovered] = useState(false)
  const coverUrl = story.image_path ? getAudioUrl(story.image_path) : null
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '22px 24px', borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : 'var(--border)'),
        background: 'var(--surface)', textAlign: 'left', cursor: 'pointer', width: '100%',
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid', gridTemplateColumns: (coverUrl ? '84px' : '44px') + ' minmax(0, 1fr) 28px',
        gap: '16px', alignItems: 'center',
      }}
    >
      {coverUrl ? (
        <StoryCover story={story} path={story.image_path} accent={accentHex} radius={13}
          style={{ width: '84px', height: '60px' }}>
          {read && (
            <div style={{
              position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px',
              borderRadius: '999px', background: 'var(--success)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              zIndex: 1,
            }}>
              <CheckCircle2 size={13} strokeWidth={2.4} color="#fff" />
            </div>
          )}
        </StoryCover>
      ) : (
        <div style={{
          width: '44px', height: '44px', borderRadius: '15px',
          background: read ? 'var(--success-bg)' : accentHex + '10',
          border: '1px solid ' + (read ? 'var(--success-border)' : accentHex + '18'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {read
            ? <CheckCircle2 size={21} strokeWidth={1.9} color="var(--success)" />
            : <BookOpen size={21} strokeWidth={1.8} color={accentHex} />}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px', fontWeight: 750, fontFamily, color: 'var(--text)' }}>
            {story.title}
          </span>
          {story.presentation === 'chat' && (
            <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#2E6FB8', background: '#2E6FB815', border: '1px solid #2E6FB833', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>💬 Chat</span>
          )}
          {story.presentation === 'scene' && (
            <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#7C5CD0', background: '#7C5CD015', border: '1px solid #7C5CD033', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>🎬 Scene</span>
          )}
          {story.interactions && (
            <span style={{ marginLeft: '7px', fontSize: '10.5px', fontWeight: 800, color: '#2F9E6D', background: '#2F9E6D15', border: '1px solid #2F9E6D33', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>🗨️ Reply</span>
          )}
          {read && (
            <span style={pillStyle('var(--success)', 'var(--success-bg)', 'var(--success-border)')}>
              Read
            </span>
          )}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {story.english_summary}
        </div>
      </div>
      <ArrowRight size={20} strokeWidth={2} color={accentHex} />
    </button>
  )
}

function CategoryCard({ cat, unlocked, hasStories, isClickable, storyCount, readCount, learnedCount, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = unlocked ? BookOpen : Lock
  const remaining = Math.max(0, cat.minWords - learnedCount)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '22px 24px', borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : 'var(--border)'),
        background: 'var(--surface)', textAlign: 'left', width: '100%',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.58,
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto',
        gap: '16px', alignItems: 'center',
      }}
    >
      <div style={{
        width: '48px', height: '48px', borderRadius: '16px',
        background: unlocked ? accentHex + '10' : 'var(--surface-2)',
        border: '1px solid ' + (unlocked ? accentHex + '18' : 'var(--border)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} strokeWidth={1.8} color={unlocked ? accentHex : 'var(--text-faint)'} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{cat.label}</span>
          {hasStories && unlocked && (
            <span style={pillStyle(accentHex, accentHex + '10', accentHex + '25')}>
              {readCount > 0
                ? readCount + ' of ' + storyCount + ' read'
                : storyCount + ' ' + (storyCount === 1 ? 'story' : 'stories')}
            </span>
          )}
          {hasStories && unlocked && readCount >= storyCount && storyCount > 0 && (
            <CheckCircle2 size={16} strokeWidth={2} color="var(--success)" />
          )}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {unlocked
            ? (hasStories ? cat.description : 'Stories coming soon')
            : remaining + ' more learned words to unlock'}
        </div>
      </div>
      {isClickable
        ? <ArrowRight size={20} strokeWidth={2} color={accentHex} />
        : <Circle size={10} strokeWidth={2} color="#D4D4D8" />}
    </button>
  )
}

function EmptyPanel({ icon: Icon, title, text }) {
  return (
    <div style={{
      textAlign: 'center', color: 'var(--text-muted)', padding: '54px 28px', fontSize: '15px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="var(--text-faint)" />
      <div style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>{title}</div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({ session, profile, track, onBack, onNavigate, initialStoryId, initialStoryWords, initialStoryFirstMission, onInitialStoryConsumed }) {
  const [view, setView] = useState('categories')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  const [stories, setStories] = useState([])
  // Story ids the user has finished (story_reads) — drives read checkmarks,
  // per-tier progress, and the once-only finish XP.
  const [readIds, setReadIds] = useState(new Set())
  const [learnedCount, setLearnedCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  const languageDetails = getLanguageDetails(profile, track)
  const { accentHex, nativeName, fontFamily } = languageDetails
  // Real size of the current level's deck (set in loadData) — not a hardcoded
  // per-language guess, so the progress denominator is right for every language.
  const [totalWords, setTotalWords] = useState(0)
  // Today's studied words (from the post-study deep-link), highlighted in the
  // reader. Captured into state so it survives App clearing the pending value.
  const [todayWords, setTodayWords] = useState([])
  const [firstMission, setFirstMission] = useState(false)
  // Learned words per level — the cumulative shelf gates each level's stories on
  // that level's own progress, not the current level's.
  const [learnedPerLevel, setLearnedPerLevel] = useState({})

  // Tiers for a story's own level (falls back to the current level for a story
  // row with no level, e.g. an old cached snapshot).
  const levelOf = (lvl) => (lvl == null ? track.current_level : lvl)
  const tiersAt = (lvl) => tiersFor(track.language, levelOf(lvl))
  // Learned words counting toward that level's gates. A level the learner has
  // already passed counts as complete — see readingGateCount.
  const learnedAt = (lvl) => readingGateCount({
    level: levelOf(lvl),
    currentLevel: track.current_level,
    learnedAtLevel: learnedPerLevel[levelOf(lvl)] || 0,
    tiers: tiersAt(lvl),
  })
  const CATEGORIES = tiersAt(track.current_level)
  // Stories on one shelf = one tier at one level.
  const storiesIn = (cat) => (cat
    ? stories.filter(s => s.tier === cat.tier && levelOf(s.level) === cat.level)
    : [])

  async function loadData() {
    setLoading(true)

    // Everything the stories screen needs is fetched, then mirrored into
    // IndexedDB so the whole library (list + text + read markers) opens offline.
    // If the network is down, the last good snapshot is served instead.
    const snapKey = 'storiesdata:' + track.language + ':' + track.system + ':' + track.current_level
    let vocabData = null, cardsData = null, storiesData = null, readsData = null
    try {
      // Load all levels so every word in a story is clickable, not just current level
      const vres = await supabase
        .from('vocabulary').select('*')
        .eq('language', track.language).eq('system', track.system).eq('is_active', true)
      vocabData = vres.data
      const cres = await supabase
        .from('cards').select('vocab_id, is_easy, state, learned, due_at')
        .eq('user_id', session.user.id)
      cardsData = cres.data
      // Reading is CUMULATIVE, the way review already is: every level the
      // learner has reached, not just the current one. Advancing a level adds to
      // the shelf instead of emptying it — and a level whose own stories don't
      // exist yet still has a full shelf underneath it.
      const sres = await supabase
        .from('stories').select('*')
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_published', true)
        .order('level', { ascending: false })
        .order('tier', { ascending: true }).order('story_number', { ascending: true })
      storiesData = sres.data
      const rres = await supabase
        .from('story_reads').select('story_id').eq('user_id', session.user.id)
      readsData = rres.data
    } catch { /* offline — fall back to the cached snapshot below */ }

    if (storiesData && storiesData.length) {
      cacheSet(snapKey, { vocabData, cardsData, storiesData, readsData })
    } else {
      const snap = await cacheGet(snapKey)
      if (snap) {
        vocabData = vocabData || snap.vocabData
        cardsData = cardsData || snap.cardsData
        storiesData = snap.storiesData
        readsData = readsData || snap.readsData
      }
    }

    const map = {}
    ;(vocabData || []).forEach(v => { map[v.word] = v })
    setVocabMap(map)

    const cardsMap = {}
    ;(cardsData || []).forEach(c => { cardsMap[c.vocab_id] = c })
    setUserCards(cardsMap)

    // Per-level learned counts drive each level's own tier gates; the headline
    // progress bar still tracks the current level.
    const perLevel = learnedByLevel(vocabData || [], cardsData || [])
    setLearnedPerLevel(perLevel)
    const currentLevelIds = new Set(
      (vocabData || []).filter(v => v.level === track.current_level).map(v => v.id)
    )
    setTotalWords(currentLevelIds.size)
    const learned = (cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length
    setLearnedCount(learned)

    setStories(storiesData || [])
    setReadIds(new Set((readsData || []).map(r => r.story_id)))

    // Deep-link from the post-study recap ("Read unlocked story"): open the
    // recommended story straight into the reader instead of the category list.
    if (initialStoryId) {
      const target = (storiesData || []).find(s => s.id === initialStoryId)
      if (target) {
        const cat = categoryForStory(target, track)
        setSelectedCategory(cat)
        setSelectedStory(target)
        setView('reader')
        if (initialStoryWords && initialStoryWords.length) setTodayWords(initialStoryWords)
        if (initialStoryFirstMission) setFirstMission(true)
      }
      if (onInitialStoryConsumed) onInitialStoryConsumed()
    }

    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div style={pageShell()}>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookOpen size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  // ── Reader view ────────────────────────────────────────────────────────
  if (view === 'reader' && selectedStory && selectedCategory) {
    // "Next story" stays inside the same shelf: same tier AND same level.
    const catStories = storiesIn(selectedCategory)
    const currentIdx = catStories.findIndex(s => s.id === selectedStory.id)
    const nextStory = currentIdx >= 0 && currentIdx < catStories.length - 1
      ? catStories[currentIdx + 1] : null
    // When there's no next story left to read in this tier, point the reader at
    // the next locked tier so finishing ends in "learn N more to unlock…" rather
    // than a dead end. Only tiers of THIS story's level that actually have
    // stories are offered, gated by that level's own thresholds.
    const shelfLevel = selectedCategory.level
    const tiersWithStories = new Set(
      stories.filter(s => levelOf(s.level) === shelfLevel).map(s => s.tier)
    )
    const nextTierUnlock = nextStory
      ? null
      : nextLockedTier(tiersAt(shelfLevel), learnedAt(shelfLevel), tiersWithStories)

    return (
      <StoryReader
        story={selectedStory}
        vocabMap={vocabMap}
        userCards={userCards}
        setUserCards={setUserCards}
        session={session}
        profile={profile}
        track={track}
        onBack={() => setView('list')}
        onHome={onBack}
        onPractice={onNavigate ? (words) => onNavigate('fillblank', { practiceWords: words }) : null}
        todayWords={todayWords}
        firstMission={firstMission}
        nextStory={nextStory}
        nextTierUnlock={nextTierUnlock}
        onNextStory={() => setSelectedStory(nextStory)}
        isRead={readIds.has(selectedStory.id)}
        onMarkRead={(id) => setReadIds(prev => { const nx = new Set(prev); nx.add(id); return nx })}
      />
    )
  }

  // ── Story list view ────────────────────────────────────────────────────
  if (view === 'list' && selectedCategory) {
    const catStories = storiesIn(selectedCategory)
    const shelfLabel = getLevelLabel(track.language, track.system, selectedCategory.level)
    return (
      <div style={pageShell()}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <IconButton icon={ArrowLeft} label="Back" onClick={() => setView('categories')} />

          <div style={{ margin: '28px 0 24px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>
                {shelfLabel}
              </span>
              <span style={pillStyle('var(--text-muted)', 'var(--surface-2)', 'var(--border)')}>
                {selectedCategory.wordRange} words
              </span>
            </div>
            <h1 style={{ fontSize: '34px', fontWeight: 800, color: 'var(--text)', margin: '14px 0 8px' }}>
              {selectedCategory.label}
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              {selectedCategory.description}
            </p>
          </div>

          {catStories.length === 0 ? (
            <EmptyPanel icon={BookOpen} title="No stories yet" text="Stories for this tier are coming soon." />
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {catStories.map(story => (
                <StoryListCard
                  key={story.id}
                  story={story}
                  read={readIds.has(story.id)}
                  accentHex={accentHex}
                  fontFamily={fontFamily}
                  onClick={() => { setSelectedStory(story); setView('reader') }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Category view ──────────────────────────────────────────────────────
  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        <div style={{ margin: '28px 0 28px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>{nativeName}</span>
            <span style={pillStyle('var(--text-muted)', 'var(--surface-2)', 'var(--border)')}>
              {getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}
            </span>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            Stories
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
            Everything you can read, from every level you’ve reached.
          </p>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <ProgressCard learnedCount={learnedCount} totalWords={totalWords} accentHex={accentHex} />
        </div>

        {/* Reading ladder — the tiers as rungs, with your position and the gap
            to the next rung. A calm view of the reading path. */}
        {(() => {
          const rungs = readingLadder(learnedCount, CATEGORIES)
          if (rungs.length === 0) return null
          const next = nextRung(learnedCount, CATEGORIES)
          return (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                {rungs.map((r, i) => (
                  <span key={r.tier} style={{ display: 'flex', alignItems: 'center', flex: i === rungs.length - 1 ? '0 0 auto' : '1 1 0' }}>
                    <span title={r.label} style={{
                      width: r.isCurrent ? '15px' : '12px', height: r.isCurrent ? '15px' : '12px',
                      borderRadius: '50%', flexShrink: 0,
                      background: r.unlocked ? accentHex : 'var(--surface)',
                      border: '2px solid ' + (r.unlocked ? accentHex : 'var(--border)'),
                      boxShadow: r.isCurrent ? '0 0 0 3px ' + accentHex + '33' : 'none',
                    }} />
                    {i < rungs.length - 1 && (
                      <span style={{ flex: 1, height: '2px', background: rungs[i + 1].unlocked ? accentHex : 'var(--border)' }} />
                    )}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                {rungs.map(r => (
                  <span key={r.tier} style={{ fontSize: '11px', fontWeight: r.isCurrent ? 750 : 500, color: r.unlocked ? 'var(--text)' : 'var(--text-faint)' }}>
                    {r.label}
                  </span>
                ))}
              </div>
              {next && (
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '10px' }}>
                  <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{next.wordsToGo}</strong> more word{next.wordsToGo === 1 ? '' : 's'} to reach <strong style={{ color: accentHex, fontWeight: 650 }}>{next.label}</strong>.
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          // A fresh story every day — a calm daily pick from everything the
          // learner can read, across every level they've reached.
          const daily = pickDailyStory({
            stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(),
            tiersFor: tiersAt, learnedFor: learnedAt,
          })
          if (!daily) return null
          return (
            <button
              onClick={() => {
                // The reader view needs the story's shelf (tier + level) too —
                // it drives next-story and the tier-unlock nudge.
                setSelectedCategory(categoryForStory(daily, track))
                setSelectedStory(daily)
                setView('reader')
              }}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '28px',
                display: 'flex', alignItems: 'center', gap: '16px',
                background: accentHex + '0D', border: '1px solid ' + accentHex + '2E',
                borderRadius: '18px', padding: isMobile ? '16px 18px' : '18px 22px', fontFamily: 'Inter, sans-serif',
              }}
            >
              <div style={{
                width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0,
                background: accentHex + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={22} strokeWidth={1.9} color={accentHex} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 850, letterSpacing: '0.06em', textTransform: 'uppercase', color: accentHex, marginBottom: '3px' }}>
                  Today’s story{readIds.has(daily.id) ? ' · revisit' : ''}
                </div>
                <div style={{ fontSize: '17px', fontWeight: 750, color: 'var(--text)', fontFamily: fontFamily + ', Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {daily.title}
                </div>
              </div>
              <ArrowRight size={20} strokeWidth={2} color={accentHex} style={{ flexShrink: 0 }} />
            </button>
          )
        })()}

        {(() => {
          // The cumulative shelf: one group per level the learner has reached
          // that actually has stories, current level first, then downward.
          const levels = storyLevels(stories, track.current_level)
          if (levels.length === 0) {
            return <EmptyPanel icon={Library} title="No stories yet" text="Stories are on the way. Keep learning words — they'll be here waiting." />
          }
          const currentHasStories = levels.indexOf(track.current_level) >= 0
          const currentLabel = getLevelLabel(track.language, track.system, track.current_level)
          return (
            <div style={{ display: 'grid', gap: '30px' }}>
              {/* Honest note: this level's own stories aren't written yet, but
                  everything from the levels below is still on the shelf. */}
              {!currentHasStories && (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '18px', padding: '18px 20px',
                  display: 'flex', gap: '14px', alignItems: 'flex-start',
                }}>
                  <Library size={20} strokeWidth={1.85} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '14.5px', fontWeight: 750, color: 'var(--text)', marginBottom: '4px' }}>
                      {currentLabel} stories are on the way
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Everything you’ve unlocked so far is still here — re-reading is one of the
                      best ways to make vocabulary stick.
                    </div>
                  </div>
                </div>
              )}

              {levels.map(level => {
                const levelTiers = tiersAt(level)
                const levelLearned = learnedAt(level)
                const levelStories = stories.filter(s => levelOf(s.level) === level)
                const readHere = levelStories.filter(s => readIds.has(s.id)).length
                const isCurrent = level === track.current_level
                // A learner with a single shelf (everyone at level 1) doesn't
                // need a level heading over it — the page header already names
                // their level. Headings appear the moment the shelf grows.
                const showHeading = levels.length > 1 || !isCurrent
                return (
                  <section key={level} aria-labelledby={showHeading ? 'story-level-' + level : undefined}>
                    {showHeading && (
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: '10px',
                        marginBottom: '12px', flexWrap: 'wrap',
                      }}>
                        <h2 id={'story-level-' + level} style={{
                          fontSize: '19px', fontWeight: 800, color: 'var(--text)', margin: 0,
                        }}>
                          {getLevelLabel(track.language, track.system, level)}
                        </h2>
                        {isCurrent && (
                          <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>Your level</span>
                        )}
                        <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {readHere > 0
                            ? readHere + ' of ' + levelStories.length + ' read'
                            : levelStories.length + ' ' + (levelStories.length === 1 ? 'story' : 'stories')}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: '14px' }}>
                      {levelTiers.map(tier => {
                        const cat = { ...tier, level }
                        const unlocked = levelLearned >= cat.minWords
                        const catStories = storiesIn(cat)
                        const hasStories = catStories.length > 0
                        // A level already behind the learner is finished: an
                        // empty tier there is noise, not motivation. The current
                        // level keeps every tier so the path ahead stays visible.
                        if (!hasStories && !isCurrent) return null
                        const isClickable = unlocked && hasStories
                        return (
                          <CategoryCard
                            key={cat.tier}
                            cat={cat}
                            unlocked={unlocked}
                            hasStories={hasStories}
                            isClickable={isClickable}
                            storyCount={catStories.length}
                            readCount={catStories.filter(s => readIds.has(s.id)).length}
                            learnedCount={levelLearned}
                            accentHex={accentHex}
                            onClick={() => {
                              if (!isClickable) return
                              setSelectedCategory(cat)
                              setView('list')
                            }}
                          />
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
