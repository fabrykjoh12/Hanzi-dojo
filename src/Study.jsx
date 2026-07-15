import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { isOnline } from './useOnline'
import { enqueueGrade } from './syncQueue'
import { cacheSet, cacheGet, outboxDelete } from './offline'
import { getTrackCards } from './data'
import { studyFloorLevel } from './levelScope'
import { schedule, previewLabels } from './srs'
import { xpForGrade, levelInfo } from './xp'
import { computeAward } from './xpService'
import { updateStreak, todayStr, liveStreak } from './streak'
import { evaluateAchievements } from './achievements'
import { toast } from './toast'
import { getLevelLabel, getSystemLabel, getAudioUrl } from './utils'
import { languageTheme } from './languageTheme'
import { checkTypedAnswer } from './typedAnswer'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { isLearned } from './mastery'
import { pickRecapStory } from './storyMatch'
import { CATEGORIES_BY_LANGUAGE } from './storyTiers'
import { buildStudyQueue, reinsertSoon, queueSeed } from './studyQueue'
import { isFirstRunSession, firstRunNewTarget } from './firstRun'
import { firstMissionCardHint } from './firstMission'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'
import SessionRecap from './SessionRecap'
import ChatMission from './ChatMission'
import { buildMissionOffer } from './missionOffer'
import { computeStudyTally } from './studyTally'
import { useStudyAudio } from './useStudyAudio'
import { useStudyKeyboardShortcuts } from './useStudyKeyboardShortcuts'
import {
  Volume2, VolumeX, ArrowLeft, Eye, RotateCcw, AlertTriangle, Check,
  Sparkles, Layers, BookOpenCheck, X,
} from 'lucide-react'

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'
// Grade → feedback color (Again / Hard / Good / Easy)
const GRADE_COLORS = ['#DC2626', '#D97706', '#3E63DD', '#2F9E6D']

function hasKanji(text) {
  const value = text || ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0x3400 && code <= 0x9FFF) return true
  }
  return false
}

// Hiragana (0x3040–0x309F) and katakana (0x30A0–0x30FF, incl. the prolonged
// sound mark ー) are kana — phonetic, so they never need furigana.
function isKana(code) {
  return code >= 0x3040 && code <= 0x30FF
}

// Split a word + reading so furigana (the reading) sits ONLY over the kanji
// core. Leading/trailing kana that also appear in the reading (okurigana, e.g.
// the べる in 食べる) are rendered bare. Returns { lead, core, coreReading, trail }
// or null when there is no kanji to annotate — which covers pure hiragana and
// pure katakana words (including katakana loanwords with a hiragana reading).
function furiganaParts(word, reading) {
  const w = word || ''
  const r = reading || ''
  if (!w || !r) return null

  let wStart = 0
  let rStart = 0
  while (wStart < w.length && rStart < r.length
      && isKana(w.charCodeAt(wStart)) && w[wStart] === r[rStart]) {
    wStart += 1
    rStart += 1
  }

  let wEnd = w.length
  let rEnd = r.length
  while (wEnd > wStart && rEnd > rStart
      && isKana(w.charCodeAt(wEnd - 1)) && w[wEnd - 1] === r[rEnd - 1]) {
    wEnd -= 1
    rEnd -= 1
  }

  const core = w.slice(wStart, wEnd)
  const coreReading = r.slice(rStart, rEnd)
  if (!core || !coreReading || !hasKanji(core)) return null

  return { lead: w.slice(0, wStart), core, coreReading, trail: w.slice(wEnd) }
}

function QueuePill({ label, value, color, background }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 12px', borderRadius: '14px',
      background, border: '1px solid ' + color + '22',
      minWidth: '94px', justifyContent: 'center',
    }}>
      <span style={{ fontSize: '15px', fontWeight: 750, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick, color, background, border }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        border: border || '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : (background || 'var(--surface)'),
        color: color || 'var(--text-muted)',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color={color || 'var(--text-muted)'} />
      {label}
    </button>
  )
}

function GradeButton({ grade, label, interval, color, icon: Icon, onClick, suggested }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={() => onClick(grade)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '6px', minHeight: '76px', padding: '12px 8px',
        borderRadius: '16px',
        border: suggested ? '2px solid ' + color + '99' : '1px solid ' + color + (hovered ? '66' : '30'),
        background: hovered || suggested ? color + '14' : color + '0D',
        color, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 10px 22px rgba(24,24,27,0.08)' : 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 750 }}>
        <Icon size={16} strokeWidth={2} color={color} />
        {label}
      </span>
      <span style={{ fontSize: '11px', fontWeight: 650, color: 'var(--text-muted)' }}>
        {interval}
      </span>
    </button>
  )
}

function PrimaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        width: '100%', minHeight: '54px', borderRadius: '16px', border: 'none',
        background: hovered ? SAGE_DARK : SAGE, color: '#fff',
        fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 28px rgba(110,132,102,0.28)' : '0 6px 18px rgba(110,132,102,0.18)',
      }}
    >
      <Icon size={18} strokeWidth={2.1} color="#fff" />
      {children}
    </button>
  )
}

export default function Study({ session, profile, track, mode = 'review', onBack, onNavigate, onStreakUpdate }) {
  const isWeak = mode === 'weak'
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [streakDone, setStreakDone] = useState(false)
  const [showFurigana, setShowFurigana] = useState(profile.furigana_default !== false)
  const [saveError, setSaveError] = useState(null)
  const [typedValue, setTypedValue] = useState('')
  const [typedResult, setTypedResult] = useState(null)   // null | 'correct' | 'wrong'
  const [gradeColor, setGradeColor] = useState(null)     // feedback ring color
  const [gradeId, setGradeId] = useState(0)              // bumps to restart the flash
  // Guards against a rapid double-click/double-keypress grading the same card
  // twice while the first save is still in flight (which would double-schedule
  // it and, for new cards, attempt a duplicate insert).
  const gradingRef = useRef(false)
  // Snapshot of everything the last grade mutated, so a misclicked "Easy" can
  // be undone for a few seconds instead of silently mis-scheduling the card.
  const undoRef = useRef(null)
  const undoTimerRef = useRef(null)
  const [undoVisible, setUndoVisible] = useState(false)
  // Achievement stats at session start, so newly crossed thresholds can be
  // celebrated at the recap (same live-derived inputs Profile uses).
  const achieveBeforeRef = useRef(null)
  const streakAfterRef = useRef(null)
  const achieveToastedRef = useRef(false)
  // Running counts of today's study session, persisted to daily_activity so the
  // Profile calendar can show which days were studied.
  const activityRef = useRef({ studied: 0, newC: 0, learn: 0, review: 0 })
  // Per-session tally for the end-of-session recap card.
  const sessionRef = useRef({ graded: 0, newLearned: 0, graduated: 0, again: 0, reviewedRight: 0, reviewedTotal: 0, xpEarned: 0, leveledTo: 0, freezesEarned: 0 })
  // Running lifetime XP, seeded from the profile and persisted on each grade.
  const xpRef = useRef(profile.total_xp || 0)
  // Running streak-freeze balance, so level-up rewards stack correctly within a session.
  const freezesRef = useRef(profile.streak_freezes || 0)
  const [forecast, setForecast] = useState(null)
  const [recap, setRecap] = useState(null)   // snapshot of sessionRef at completion
  // "First Story Unlocked" recommendation for the recap (null until computed;
  // stays null offline or when no story library exists — module stays hidden).
  const [storyUnlock, setStoryUnlock] = useState(null)
  // True for a brand-new learner's very first session (detected in loadQueue):
  // shows first-session framing and gently caps the new-card count.
  const [firstRun, setFirstRun] = useState(false)
  // Cards graded this session (reactive), so the guided first-mission hint knows
  // which card the user is on. Only consulted during the first run.
  const [studied, setStudied] = useState(0)
  // Once-per-session analytics guards (session-scoped, not app-load-scoped).
  const analyticsRef = useRef({ started: false, completed: false })
  // Word-to-World chat mission: the level's vocab (for tap lookups) and a record
  // of which words were touched this session, so the mission can reuse today's
  // learned / weak / review words.
  const vocabRef = useRef([])
  const sessionVocabRef = useRef([])
  // Words the learner has a card for (any state) — the chat-mission offer only
  // shows missions built entirely from these (plus today's words).
  const knownWordsRef = useRef([])
  const [missionOffer, setMissionOffer] = useState(null)   // snapshot at completion
  const [mission, setMission] = useState(null)              // active running mission

  const isMobile = useIsMobile()
  const isTyped = profile.recall_mode === 'typed'

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accent = theme.accentVar
  const isJapanese = profile.active_language === 'japanese'
  const langFont = theme.font
  const langChars = theme.languageName
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  // Audio (speed pref, iOS-safe playback + fallback, autoplay-on-flip, and
  // current+next prefetch) lives in a focused hook. Behavior is unchanged.
  const { audioSpeed, audioBroken, playAudio, cycleSpeed, resetAudioBroken } = useStudyAudio({
    queue, flipped, profile, session, onStreakUpdate,
  })

  async function loadQueue() {
    setLoading(true)
    sessionVocabRef.current = []

    // Cumulative deck: fetch the user's cards first so we can derive the study
    // floor (the lowest level they actually study), then load every level's
    // vocabulary from that floor up to the current level. Advancing a level
    // keeps earlier levels in the deck for review instead of dropping them.
    const cards = await getTrackCards(session.user.id, track, { maxLevel: track.current_level })
    const floorLevel = studyFloorLevel(cards, track.current_level)

    const vocabKey = 'vocab:' + track.language + ':' + track.system + ':' + floorLevel + '-' + track.current_level
    let vocab = null
    try {
      const res = await supabase
        .from('vocabulary')
        .select('*')
        .eq('language', track.language)
        .eq('system', track.system)
        .gte('level', floorLevel)
        .lte('level', track.current_level)
        .eq('is_active', true)
        .order('level', { ascending: true })
        .order('sort_order', { ascending: true })
      vocab = res.data
    } catch { /* offline — fall back to the cached vocabulary below */ }
    // Mirror the cumulative vocabulary for offline; fall back to it when the
    // fetch came back empty because the network is down.
    if (vocab && vocab.length) cacheSet(vocabKey, vocab)
    else { const cached = await cacheGet(vocabKey); if (cached) vocab = cached }
    vocabRef.current = vocab || []

    const vocabById = {}
    ;(vocab || []).forEach(v => { vocabById[v.id] = v })

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const introducedToday = (cards || [])
      .filter(c => new Date(c.created_at) >= startOfToday && vocabById[c.vocab_id]).length
    const remainingNew = Math.max(0, profile.daily_new_cards - introducedToday)

    const now = new Date()
    const startedVocab = new Set()

    const levelCards = (cards || [])
      .map(c => ({ ...c, vocab: vocabById[c.vocab_id] }))
      .filter(c => c.vocab)
    levelCards.forEach(c => startedVocab.add(c.vocab_id))
    knownWordsRef.current = levelCards.map(c => c.vocab.word)

    // Weak-words drill: focus the cards the user keeps lapsing on, regardless of
    // their due date. No new cards; grading still feeds FSRS normally.
    if (isWeak) {
      const weakQueue = levelCards
        .filter(c => (c.lapses || 0) >= 2 && (c.stability || 0) < 21)
        .sort((a, b) => (b.lapses - a.lapses) || ((a.stability || 0) - (b.stability || 0)))
        .slice(0, 30)
      setQueue(weakQueue)
      setDone(weakQueue.length === 0)
      setLoading(false)
      if (weakQueue.length > 0 && !analyticsRef.current.started) {
        analyticsRef.current.started = true
        trackEvent(EVENTS.STUDY_SESSION_STARTED, { mode: 'weak' })
      }
      return
    }

    const dueLearning = levelCards
      .filter(c => (c.state === 'learning' || c.state === 'relearning') && new Date(c.due_at) <= now)
    const dueReview = levelCards
      .filter(c => c.state === 'review' && new Date(c.due_at) <= now)

    // First-run detection: a brand-new learner (no cards ANYWHERE on the
    // account) gets a gentle, capped first session. The account-wide count is
    // only queried when this level is empty (the common returning-user path
    // skips it), and a track switch — cards on another language — is excluded.
    // Best-effort: any failure (offline) falls back to a normal session.
    let isFirst = false
    if ((cards || []).length === 0) {
      try {
        const { count } = await supabase
          .from('cards').select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
        isFirst = isFirstRunSession({ mode, accountCardCount: count || 0 })
      } catch { /* offline / error — treat as a normal session (no cap) */ }
    }
    setFirstRun(isFirst)
    const newTarget = firstRunNewTarget(isFirst, remainingNew)

    const newItems = (vocab || [])
      .filter(v => !startedVocab.has(v.id))
      .slice(0, newTarget)
      .map(v => ({
        id: null, vocab_id: v.id, vocab: v,
        state: 'new', ease_factor: 2.5, interval_days: 0, learning_step: 0,
      }))

    // Order the session with the seeded queue builder (studyQueue.js): learning
    // leads, reviews are the backbone, new cards are woven through — never a
    // block of new up front, never 3 new in a row while a review remains. The
    // seed is stable per user/level/day, so a reload the same day keeps the
    // order and different days feel fresh.
    const seed = queueSeed({
      userId: session.user.id,
      language: track.language,
      system: track.system,
      level: track.current_level,
      day: todayStr(),
    })
    const newQueue = buildStudyQueue({ dueLearning, dueReview, newItems, seed })
    setQueue(newQueue)
    setDone(newQueue.length === 0)
    setLoading(false)
    if (newQueue.length > 0 && !analyticsRef.current.started) {
      analyticsRef.current.started = true
      trackEvent(EVENTS.STUDY_SESSION_STARTED, { mode: 'review', first_run: isFirst })
    }
  }

  // Lifetime stats that feed achievements (cross-language, like Profile).
  // Two cheap queries: two columns of the cards table + a row count.
  async function loadAchievementStats() {
    const [cardsResult, daysResult] = await Promise.all([
      supabase.from('cards').select('learned, stability').eq('user_id', session.user.id),
      supabase.from('daily_activity')
        .select('activity_date', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gt('studied_cards', 0),
    ])
    const rows = cardsResult.data || []
    return {
      learned: rows.filter(c => c.learned).length,
      mastered: rows.filter(c => (c.stability || 0) >= 21).length,
      daysStudied: daysResult.count || 0,
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadQueue, 0)
    // Non-blocking before-snapshot for end-of-session achievement toasts.
    loadAchievementStats().then(stats => {
      achieveBeforeRef.current = {
        ...stats,
        streak: liveStreak(profile),
        level: levelInfo(xpRef.current).level,
      }
    })
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Upsert today's study counts so the Profile calendar can show studied days.
  // Counts are this session's running totals (presence is always correct).
  const recordActivity = (cardState) => {
    const a = activityRef.current
    a.studied += 1
    if (cardState === 'new') a.newC += 1
    else if (cardState === 'review') a.review += 1
    else a.learn += 1
    // Offline, these counts ride along in the queued grade op and are folded
    // into the server row when the outbox flushes.
    if (isOnline()) {
      supabase.from('daily_activity').upsert({
        user_id: session.user.id,
        activity_date: todayStr(),
        studied_cards: a.studied,
        new_cards: a.newC,
        learning_cards: a.learn,
        review_cards: a.review,
      }, { onConflict: 'user_id,activity_date' }).then(() => {})
    }
  }

  // Recompute the next-day forecast (reviews + new) for the recap card.
  async function loadForecast() {
    const cards = await getTrackCards(session.user.id, track, {
      maxLevel: track.current_level,
      columns: 'vocab_id, state, due_at',
    })
    const floorLevel = studyFloorLevel(cards, track.current_level)
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .gte('level', floorLevel)
      .lte('level', track.current_level)
      .eq('is_active', true)

    const vocabIds = new Set((vocab || []).map(v => v.id))
    const started = new Set((cards || []).map(c => c.vocab_id))
    const endOfTomorrow = new Date(); endOfTomorrow.setHours(23, 59, 59, 999)
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)

    const reviews = (cards || []).filter(c =>
      vocabIds.has(c.vocab_id) && c.state === 'review' && new Date(c.due_at) <= endOfTomorrow
    ).length
    const unstarted = (vocab || []).filter(v => !started.has(v.id)).length
    const newAvail = Math.min(profile.daily_new_cards, unstarted)
    setForecast({ reviews, newAvail })
  }

  // Connect this session's words to a story the user can now read — the "First
  // Story Unlocked" recap module. Best-effort and purely additive: any failure
  // (or offline) just leaves the module hidden. Reuses the pure matcher in
  // storyMatch.js so the "% known" mirrors what the reader then shows.
  async function loadStoryUnlock() {
    try {
      const [vres, sres, cres, rres] = await Promise.all([
        supabase.from('vocabulary').select('id, word, level')
          .eq('language', track.language).eq('system', track.system).eq('is_active', true),
        supabase.from('stories').select('id, title, content, tier, story_number')
          .eq('language', track.language).eq('system', track.system)
          .eq('level', track.current_level).eq('is_published', true),
        supabase.from('cards').select('vocab_id, is_easy, state, learned')
          .eq('user_id', session.user.id),
        supabase.from('story_reads').select('story_id').eq('user_id', session.user.id),
      ])
      const stories = sres.data || []
      if (stories.length === 0) { setStoryUnlock(null); return }

      const vocabRows = vres.data || []
      const cards = cres.data || []
      const vocabMap = {}
      vocabRows.forEach(v => { vocabMap[v.word] = v })
      const userCards = {}
      cards.forEach(c => { userCards[c.vocab_id] = c })

      // Tier gating mirrors Stories: learned words at the CURRENT level only.
      const currentLevelIds = new Set(
        vocabRows.filter(v => v.level === track.current_level).map(v => v.id)
      )
      const learnedCount = cards.filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length

      // Distinct words actually studied this session.
      const sessionWords = [...new Set(sessionVocabRef.current.map(e => e.word))]

      const rec = pickRecapStory({
        stories,
        vocabMap,
        userCards,
        sessionWords,
        readIds: new Set((rres.data || []).map(r => r.story_id)),
        learnedCount,
        categories: CATEGORIES_BY_LANGUAGE[track.language] || CATEGORIES_BY_LANGUAGE.chinese,
        language: track.language,
      })
      setStoryUnlock(rec)
    } catch {
      setStoryUnlock(null)
    }
  }

  // Toast any achievement seals newly earned this session (compare the live
  // stats against the snapshot taken at session start).
  async function celebrateAchievements() {
    const before = achieveBeforeRef.current
    const stats = await loadAchievementStats()
    const after = {
      ...stats,
      streak: streakAfterRef.current != null ? streakAfterRef.current : before.streak,
      level: levelInfo(xpRef.current).level,
    }
    const beforeEarned = new Set(
      evaluateAchievements(before).filter(a => a.earned).map(a => a.id)
    )
    evaluateAchievements(after)
      .filter(a => a.earned && !beforeEarned.has(a.id))
      .forEach(a => {
        toast({ kind: 'seal', title: 'Seal earned — ' + a.title, body: a.desc })
        trackEvent(EVENTS.ACHIEVEMENT_UNLOCKED, { id: a.id })
      })
  }

  useEffect(() => {
    // Session-completed analytics — once per session, with the metrics.
    if (done && recap && recap.graded > 0 && !analyticsRef.current.completed) {
      analyticsRef.current.completed = true
      const accuracy = recap.reviewedTotal > 0 ? Math.round((recap.reviewedRight / recap.reviewedTotal) * 100) : null
      trackEvent(EVENTS.STUDY_SESSION_COMPLETED, {
        mode: isWeak ? 'weak' : 'review',
        first_run: firstRun,
        cards_studied: recap.graded,
        cards_learned: recap.newLearned,
        cards_reviewed: recap.reviewedTotal,
        graduated: recap.graduated,
        xp_earned: recap.xpEarned,
        ...(accuracy !== null ? { accuracy } : {}),
      })
      if (firstRun) trackOnce(EVENTS.FIRST_MISSION_COMPLETED, { words_learned: recap.newLearned })
    }
    // These are async data fetches that run once the session completes; each
    // setState happens later, inside the awaited body, not synchronously here.
    // Guards (!forecast / !storyUnlock / a ref) keep them one-shot.
    if (done && recap && recap.graded > 0 && !forecast) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadForecast()
    }
    if (done && recap && recap.graded > 0 && !storyUnlock) {
      loadStoryUnlock()
    }
    if (done && recap && recap.graded > 0 && achieveBeforeRef.current && !achieveToastedRef.current) {
      achieveToastedRef.current = true
      celebrateAchievements()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, recap])

  const handleGrade = async (grade) => {
    if (gradingRef.current) return
    gradingRef.current = true
    try {
      await applyGrade(grade)
    } finally {
      gradingRef.current = false
    }
  }

  const applyGrade = async (grade) => {
    const card = queue[0]
    const res = schedule(card, grade)
    const online = isOnline()

    // A new grade invalidates any pending undo — its snapshot predates this one.
    clearTimeout(undoTimerRef.current)
    undoRef.current = null
    setUndoVisible(false)

    // Snapshot the pre-grade world for undo. `card`/`queue` are the pre-grade
    // values; the running refs are copied before this grade's tallies land.
    const snapshot = {
      card: { ...card },
      prevQueue: queue.slice(),
      session: { ...sessionRef.current },
      activity: { ...activityRef.current },
      xp: xpRef.current,
      freezes: freezesRef.current,
      wasNew: !card.id,
      cardId: null,
      logId: null,
    }

    // Fire the colored grade-feedback ring (restarts via the bumped key).
    setGradeColor(GRADE_COLORS[grade])
    setGradeId(id => id + 1)

    // Pure decision: how this grade changes the session recap counters + the
    // chat-mission word metadata (see studyTally.js). The ref mutations below
    // stay here — the helper only decides, it never mutates.
    const { tally, sessionWord } = computeStudyTally({
      grade,
      previousState: card.state,
      nextState: res.updates.state,
      vocab: card.vocab,
    })

    // Record the word for the end-of-session chat mission: grade 0 (Again) marks
    // it weak; a review-state card is a mature word; otherwise it's learned today.
    if (sessionWord) sessionVocabRef.current.push(sessionWord)

    // Tally this card for the session recap (before the queue mutates).
    const s = sessionRef.current
    s.graded += tally.graded
    s.newLearned += tally.newLearned
    s.again += tally.again
    s.graduated += tally.graduated
    s.reviewedTotal += tally.reviewedTotal
    s.reviewedRight += tally.reviewedRight
    // Reactive card counter for the guided first-mission hint (no effect on SRS).
    setStudied(n => n + 1)
    const xpGain = xpForGrade(grade)

    if (!streakDone) {
      setStreakDone(true)
      if (online) {
        try {
          const before = liveStreak(profile)
          const newStreak = await updateStreak(profile)
          if (typeof newStreak.streak === 'number') streakAfterRef.current = newStreak.streak
          if (typeof newStreak.streak_freezes === 'number') freezesRef.current = newStreak.streak_freezes
          if (typeof newStreak.streak === 'number' && newStreak.streak > before) {
            trackEvent(EVENTS.STREAK_INCREASED, { streak: newStreak.streak })
          }
          if (onStreakUpdate) onStreakUpdate(newStreak)
        } catch { /* offline — the streak reconciles on the next online session */ }
      }
    }

    // Award XP through the shared rulebook (level-ups grant capped streak
    // freezes — same rules as the practice drills), tracked against this
    // session's running XP/freeze balances.
    const award = computeAward(xpRef.current, xpGain, freezesRef.current)
    s.xpEarned += xpGain
    xpRef.current = award.newXp
    if (award.leveled) {
      freezesRef.current = award.freezes
      s.leveledTo = award.newLevel
      s.freezesEarned += award.freezesEarned
      if (award.freezesEarned > 0) {
        if (online) supabase.from('profiles').update({ streak_freezes: freezesRef.current }).eq('id', session.user.id).then(() => {})
        if (onStreakUpdate) onStreakUpdate({ streak_freezes: freezesRef.current })
      }
    }

    let cardId = card.id
    let outboxId = null
    if (online) {
      if (cardId) {
        const { error } = await supabase.from('cards').update(res.updates).eq('id', cardId)
        if (error) {
          console.error('[Study] card update failed', error)
          setSaveError(error.message)
          return
        }
      } else {
        const { data, error } = await supabase
          .from('cards')
          .insert({ user_id: session.user.id, vocab_id: card.vocab_id, ...res.updates })
          .select('id')
          .single()
        if (error) {
          console.error('[Study] card insert failed', error)
          setSaveError(error.message)
          return
        }
        cardId = data?.id
      }
    } else {
      // Offline: grade locally (FSRS already ran above) and queue the write.
      // A brand-new card gets a throwaway local id for this session only; the
      // outbox op carries cardId:null so replay inserts it (de-duped by vocab)
      // and assigns the real server id then.
      if (!cardId) cardId = 'local-' + Date.now() + '-' + card.vocab_id
      outboxId = await enqueueGrade({
        userId: session.user.id,
        vocabId: card.vocab_id,
        cardId: card.id || null,
        updates: res.updates,
        log: {
          grade,
          previous_state: card.state,
          next_state: res.updates.state,
          previous_interval_days: card.interval_days || 0,
          next_interval_days: res.updates.interval_days,
        },
        xpDelta: xpGain,
        day: todayStr(),
        state: card.state,
      })
    }

    // Offer undo for a few seconds — except when this grade completes the
    // session (the recap snapshot has already been taken by then).
    snapshot.cardId = cardId
    snapshot.outboxId = outboxId
    const willComplete = !res.stay && queue.length === 1
    if (!willComplete) {
      undoRef.current = snapshot
      setUndoVisible(true)
      undoTimerRef.current = setTimeout(() => {
        undoRef.current = null
        setUndoVisible(false)
      }, 6000)
    }

    recordActivity(card.state)

    // Log the review so FSRS parameters can be tuned and retention stats built
    // later. Best-effort: history is nice-to-have, grading must never block on
    // it. The log id is captured onto the snapshot so undo can remove the entry.
    if (online) {
      supabase.from('review_logs').insert({
        user_id: session.user.id,
        card_id: cardId,
        vocab_id: card.vocab_id,
        grade,
        previous_state: card.state,
        next_state: res.updates.state,
        previous_interval_days: card.interval_days || 0,
        next_interval_days: res.updates.interval_days,
      }).select('id').single().then(({ data }) => {
        snapshot.logId = data && data.id
      })
    }

    // Persist lifetime XP (best-effort; harmless if the column doesn't exist yet)
    // and reflect it in the in-memory profile so Home/Profile update live.
    if (online) supabase.from('profiles').update({ total_xp: xpRef.current }).eq('id', session.user.id).then(() => {})
    if (onStreakUpdate) onStreakUpdate({ total_xp: xpRef.current })

    setFlipped(false)
    setTypedValue('')
    setTypedResult(null)
    resetAudioBroken()

    setQueue(prev => {
      let rest = prev.slice(1)
      if (res.stay) {
        // Reinsert an "Again"-graded card soon (SRS gap), but not as the very
        // next card unless the queue is too short to allow it.
        const item = { ...card, ...res.updates, id: cardId }
        rest = reinsertSoon(rest, item, res.gap)
      }
      if (rest.length === 0) {
        setRecap({ ...sessionRef.current })
        // Snapshot the session's words into a chat-mission offer (buckets +
        // vocab). Reads refs here, never during render.
        setMissionOffer(buildMissionOffer({
          sessionVocab: sessionVocabRef.current,
          vocab: vocabRef.current,
          knownWords: knownWordsRef.current,
          language: track.language,
          level: track.current_level,
        }))
        setDone(true)
      }
      return rest
    })
  }

  // Undo the last grade: restore the card row, queue order, XP/freeze balances,
  // session tallies, and daily activity to their pre-grade snapshot. The streak
  // itself is deliberately NOT reverted — the user did show up and study.
  const undoLast = async () => {
    const u = undoRef.current
    if (!u || gradingRef.current) return
    gradingRef.current = true
    clearTimeout(undoTimerRef.current)
    undoRef.current = null
    setUndoVisible(false)
    try {
      if (u.outboxId != null) {
        // The grade was only queued offline and never reached the server — just
        // drop it from the outbox. Local session state is restored below.
        outboxDelete(u.outboxId)
      } else if (u.wasNew) {
        // This grade created the row; the user's explicit undo removes it again
        // (the card returns to the queue as a brand-new item).
        if (u.cardId) {
          await supabase.from('cards').delete().eq('id', u.cardId).eq('user_id', session.user.id)
        }
      } else {
        const c = u.card
        await supabase.from('cards').update({
          state: c.state,
          interval_days: c.interval_days,
          due_at: c.due_at,
          is_easy: c.is_easy,
          learned: c.learned,
          stability: c.stability,
          difficulty: c.difficulty,
          reps: c.reps,
          lapses: c.lapses,
          last_review: c.last_review,
          scheduled_days: c.scheduled_days,
          elapsed_days: c.elapsed_days,
          learning_step: c.learning_step,
        }).eq('id', u.cardId)
      }
      const serverPersisted = u.outboxId == null && isOnline()
      if (serverPersisted && u.logId) supabase.from('review_logs').delete().eq('id', u.logId).then(() => {})

      sessionRef.current = u.session
      activityRef.current = u.activity
      xpRef.current = u.xp
      const restore = { total_xp: u.xp }
      if (freezesRef.current !== u.freezes) restore.streak_freezes = u.freezes
      freezesRef.current = u.freezes
      if (serverPersisted) {
        supabase.from('profiles').update(restore).eq('id', session.user.id).then(() => {})
        supabase.from('daily_activity').upsert({
          user_id: session.user.id,
          activity_date: todayStr(),
          studied_cards: u.activity.studied,
          new_cards: u.activity.newC,
          learning_cards: u.activity.learn,
          review_cards: u.activity.review,
        }, { onConflict: 'user_id,activity_date' }).then(() => {})
      }
      if (onStreakUpdate) onStreakUpdate(restore)

      setFlipped(false)
      setTypedValue('')
      setTypedResult(null)
      resetAudioBroken()
      setStudied(n => Math.max(0, n - 1))
      setQueue(u.prevQueue)
    } finally {
      gradingRef.current = false
    }
  }

  // Clear a pending undo timer if the screen unmounts mid-window.
  useEffect(() => () => clearTimeout(undoTimerRef.current), [])

  // In typed mode the check result implies a grade — highlight it and let Enter
  // confirm it. Flip mode defaults Enter to "Good" (the Anki convention).
  const suggestedGrade = isTyped && typedResult ? (typedResult === 'correct' ? 2 : 0) : null

  // Desktop keyboard flow lives in a focused hook (behavior unchanged; the
  // typed-mode input owns its own keys since inputs are ignored there).
  useStudyKeyboardShortcuts({
    loading, done, queue, flipped, suggestedGrade, undoRef,
    setFlipped, handleGrade, playAudio, undoLast,
  })

  const newCount = queue.filter(c => c.state === 'new').length
  const learnCount = queue.filter(c => c.state === 'learning' || c.state === 'relearning').length
  const dueCount = queue.filter(c => c.state === 'review').length
  const pageShell = {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }


  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookOpenCheck size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (done || queue.length === 0) {
    // Word-to-World chat mission offer (snapshotted at completion, above).
    const availableMission = missionOffer ? missionOffer.mission : null

    return (
      <div style={pageShell}>
        <SessionRecap
          recap={recap}
          isWeak={isWeak}
          firstRun={firstRun}
          accentHex={accentHex}
          langFont={langFont}
          forecast={forecast}
          storyUnlock={storyUnlock}
          track={track}
          mission={availableMission}
          onOpenMission={() => setMission(availableMission)}
          onReadStory={(storyId) => onNavigate && onNavigate('stories', storyId ? {
            storyId,
            // Today's studied words → highlighted + reinforced inside the reader.
            todayWords: [...new Set(sessionVocabRef.current.map(e => e.word).filter(Boolean))],
            // Carry the first-mission flag so the reader shows the first-story hint.
            firstMission: firstRun,
          } : undefined)}
          onBack={onBack}
        />

        {mission && missionOffer && (
          <ChatMission
            mission={mission}
            vocab={missionOffer.vocab}
            session={session}
            profile={profile}
            track={track}
            dayBuckets={missionOffer.dayBuckets}
            onClose={() => setMission(null)}
          />
        )}
      </div>
    )
  }

  const card = queue[0]
  const v = card.vocab
  const labels = previewLabels(card)
  const audioUrl = getAudioUrl(v.audio_path)
  const canUseFurigana = isJapanese && hasKanji(v.word) && Boolean(v.reading)
  const showRuby = canUseFurigana && (showFurigana || flipped)
  const wordFuri = showRuby ? furiganaParts(v.word, v.reading) : null
  const showReadingLine = flipped && v.reading && !isJapanese
  const hasExample = Boolean(v.example_sentence || v.example_reading || v.example_translation)

  function renderExampleSentence(sentence, word, reading) {
    if (!sentence) return null
    const idx = word ? sentence.indexOf(word) : -1
    if (idx === -1 || !word) {
      return <span>{sentence}</span>
    }
    const before = sentence.slice(0, idx)
    const after = sentence.slice(idx + word.length)
    const exFuri = isJapanese ? furiganaParts(word, reading) : null
    const wordEl = exFuri
      ? (
        <span style={{ color: accentHex }}>
          {exFuri.lead}
          <ruby>
            {exFuri.core}
            <rt style={{ fontSize: '0.65em', fontWeight: 500, color: accentHex }}>{exFuri.coreReading}</rt>
          </ruby>
          {exFuri.trail}
        </span>
      )
      : <span style={{ color: accentHex, borderBottom: '1px solid ' + accentHex + '88' }}>{word}</span>
    return (
      <span>
        {before}
        {wordEl}
        {after}
      </span>
    )
  }
  const stateLabel = card.state === 'new' ? 'New card' : (card.state === 'review' ? 'Review' : 'Learning')

  // Guided first-mission coaching for the current card (progressive disclosure).
  // Null except during the first run's early cards. A calm banner above the
  // card — never over the grade buttons; auto-advances as `studied` grows.
  const firstMissionHint = firstRun ? firstMissionCardHint(studied, { flipped, isTyped }) : null

  function submitTyped() {
    if (!typedValue.trim()) return
    setTypedResult(checkTypedAnswer(typedValue, v, isJapanese) ? 'correct' : 'wrong')
    setFlipped(true)
  }

  return (
    <div style={pageShell}>
      {saveError && (
        <div style={{
          maxWidth: '680px', margin: '0 auto 18px',
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: '#DC2626',
          padding: '14px 18px', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5,
        }}>
          <strong>Card save failed</strong> - your progress is not being saved. Database error: {saveError}
          <br />Run the migration SQL in your Supabase SQL Editor, then refresh.
        </div>
      )}

      <div style={{ maxWidth: '680px', margin: '0 auto 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
          <IconButton icon={ArrowLeft} label="Exit" onClick={onBack} />
        </div>

        <div style={{ textAlign: 'center', minWidth: 0, marginBottom: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            color: accentHex, fontSize: '13px', fontWeight: 750, marginBottom: '6px',
          }}>
            <Layers size={17} strokeWidth={1.8} color={accentHex} />
            {firstRun ? 'Your first session' : (isWeak ? 'Weak word cleanup' : langChars + ' flashcards')}
          </div>
          <h1 style={{ fontSize: '28px', color: 'var(--text)', fontWeight: 780, lineHeight: 1.1 }}>
            {firstRun ? 'Learn your first words' : (isWeak ? 'Weak words' : 'Study session')}
          </h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 550, marginTop: '5px' }}>
            {firstRun ? 'These words will unlock your first story' : (systemLabel + ' · ' + levelLabel)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <QueuePill label="New" value={newCount} color="#3E63DD" background="#3E63DD14" />
          <QueuePill label="Learn" value={learnCount} color="#D97706" background="#D9770614" />
          <QueuePill label="Due" value={dueCount} color="#2F9E6D" background="#2F9E6D14" />
        </div>
      </div>

      {isJapanese && (
        <div style={{ maxWidth: '680px', margin: '0 auto 14px', display: 'flex', justifyContent: 'center' }}>
          <IconButton
            icon={BookOpenCheck}
            label={showFurigana ? 'Furigana on' : 'Furigana off'}
            onClick={() => setShowFurigana(prev => !prev)}
            color={showFurigana ? accentHex : 'var(--text-muted)'}
            background={showFurigana ? accentHex + '10' : 'var(--surface)'}
            border={'1px solid ' + (showFurigana ? accentHex + '30' : 'var(--border)')}
          />
        </div>
      )}

      {firstMissionHint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            maxWidth: '680px', margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '11px 15px', borderRadius: '14px',
            background: accentHex + '10', border: '1px solid ' + accentHex + '2A',
            color: accentHex, fontSize: '13.5px', fontWeight: 650, lineHeight: 1.45,
          }}
        >
          <Sparkles size={16} strokeWidth={2} color={accentHex} style={{ flexShrink: 0 }} />
          <span>{firstMissionHint}</span>
        </div>
      )}

      <div style={{
        maxWidth: '680px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', justifyItems: 'center',
      }}>
        <div
          onClick={() => !flipped && setFlipped(true)}
          style={{
            width: '100%', maxWidth: '680px', minHeight: '420px',
            background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface) 100%)',
            border: '1px solid var(--border)', borderRadius: '26px',
            boxShadow: '0 24px 70px rgba(24,24,27,0.08)',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
            cursor: flipped ? 'default' : 'pointer', padding: '24px', position: 'relative',
            perspective: '1200px',
          }}
        >
          {gradeColor && (
            <div
              key={gradeId}
              aria-hidden
              style={{
                position: 'absolute', inset: 0, borderRadius: '26px', pointerEvents: 'none',
                ['--flash']: gradeColor, zIndex: 3,
                animation: 'hd-grade-flash 460ms ease-out forwards',
              }}
            />
          )}
          {/* State pill + audio controls share one header row: the controls
              used to float absolutely over the card, which covered the word's
              furigana on narrow screens. In flow they can't cover anything. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', flexShrink: 0, position: 'relative', zIndex: 2 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '999px',
              background: accentHex + '10', color: accentHex,
              fontSize: '12px', fontWeight: 750, border: '1px solid ' + accentHex + '18',
            }}>
              <Sparkles size={14} strokeWidth={1.9} color={accentHex} />
              {stateLabel}
            </span>
            {audioUrl && flipped && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {audioBroken ? (
                  <span
                    title="This word's audio file couldn't be loaded"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      height: '40px', padding: '0 14px', borderRadius: '13px',
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: 'var(--text-faint)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <VolumeX size={18} strokeWidth={2} />
                    No audio
                  </span>
                ) : (
                <button
                  onClick={e => { e.stopPropagation(); playAudio() }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '7px',
                    height: '40px', padding: '0 14px', borderRadius: '13px',
                    background: accentHex + '10', border: '1px solid ' + accentHex + '2A', cursor: 'pointer',
                    color: accentHex, fontSize: '13px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
                    boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
                  }}
                  title="Replay audio"
                  aria-label="Replay audio"
                >
                  <Volume2 size={18} strokeWidth={2} />
                  Replay
                </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); cycleSpeed() }}
                  style={{
                    width: '48px', height: '40px', borderRadius: '13px',
                    background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '12px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
                  }}
                  title="Playback speed"
                  aria-label="Change playback speed"
                >
                  {audioSpeed}×
                </button>
              </div>
            )}
          </div>

          <div
            key={flipped ? 'back' : 'front'}
            style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: '34px 24px',
              transformOrigin: 'center', willChange: 'transform',
              animation: 'hd-flip-in 260ms ease',
            }}
          >
            {wordFuri ? (
              <div style={{
                fontSize: '86px', fontWeight: 400, color: 'var(--text)',
                fontFamily: langFont, lineHeight: 1.25,
              }}>
                {wordFuri.lead}
                <ruby>
                  {wordFuri.core}
                  <rt style={{ fontSize: '18px', color: 'var(--text-muted)' }}>{wordFuri.coreReading}</rt>
                </ruby>
                {wordFuri.trail}
              </div>
            ) : (
              <div style={{
                fontSize: '86px', fontWeight: 400, color: 'var(--text)',
                fontFamily: langFont, lineHeight: 1.08,
                overflowWrap: 'anywhere',
              }}>
                {v.word}
              </div>
            )}

            {!flipped && (
              <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '28px', fontWeight: 650 }}>
                Tap the card or reveal the answer
              </div>
            )}

            {flipped && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {showReadingLine && (
                  <div style={{ fontSize: '21px', color: accent, marginTop: '18px', fontWeight: 650 }}>
                    {v.reading}
                  </div>
                )}
                <div style={{ fontSize: '19px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.45, fontWeight: 550 }}>
                  {cleanMeaning(v.meaning)}
                </div>
                {hasExample && (
                  <div style={{
                    width: '100%', maxWidth: '430px', marginTop: '22px', paddingTop: '18px',
                    borderTop: '1px solid var(--border)', textAlign: 'center',
                  }}>
                    {v.example_sentence && (
                      <div style={{
                        fontSize: '17px', color: 'var(--text)', lineHeight: 1.5,
                        fontFamily: langFont,
                      }}>
                        {renderExampleSentence(v.example_sentence, v.word, v.reading)}
                      </div>
                    )}
                    {!isJapanese && v.example_reading && (
                      <div style={{ fontSize: '13px', color: accentHex, marginTop: '7px', lineHeight: 1.45, fontWeight: 550 }}>
                        {v.example_reading}
                      </div>
                    )}
                    {v.example_translation && (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '7px', lineHeight: 1.45 }}>
                        {v.example_translation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{
            minHeight: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderTop: '1px solid var(--surface-2)', paddingTop: '18px',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 650 }}>
              {flipped ? 'How well did you remember this?' : (isTyped ? 'Type the reading, then check' : 'Recall first, then reveal')}
            </span>
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: '680px', marginTop: '14px' }}>
          {!flipped ? (
            isTyped ? (
              <div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    autoFocus
                    value={typedValue}
                    onChange={e => setTypedValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitTyped() }}
                    placeholder={isJapanese ? 'Type the reading (kana or romaji)' : 'Type the pinyin'}
                    style={{
                      flex: 1, minWidth: 0, height: '54px', padding: '0 18px',
                      borderRadius: '16px', border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text)',
                      fontSize: '16px', fontFamily: 'Inter, sans-serif',
                    }}
                  />
                  <button
                    onClick={submitTyped}
                    style={{
                      flexShrink: 0, minWidth: '120px', height: '54px', borderRadius: '16px',
                      border: 'none', background: SAGE, color: '#fff',
                      fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                  >
                    <Check size={18} strokeWidth={2.2} color="#fff" />
                    Check
                  </button>
                </div>
                <button
                  onClick={() => setFlipped(true)}
                  style={{
                    marginTop: '12px', width: '100%', background: 'none', border: 'none',
                    color: 'var(--text-faint)', cursor: 'pointer', fontSize: '13px',
                    fontWeight: 650, fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Skip — reveal answer
                </button>
              </div>
            ) : (
              <PrimaryButton onClick={() => setFlipped(true)} icon={Eye}>
                Show answer
              </PrimaryButton>
            )
          ) : (
            <div>
              {typedResult && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  marginBottom: '12px', padding: '10px 16px', borderRadius: '14px',
                  background: typedResult === 'correct' ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: '1px solid ' + (typedResult === 'correct' ? 'var(--success-border)' : 'var(--danger-border)'),
                  color: typedResult === 'correct' ? '#2F9E6D' : '#DC2626',
                  fontSize: '13px', fontWeight: 700,
                }}>
                  {typedResult === 'correct'
                    ? <><Check size={16} strokeWidth={2.4} color="#2F9E6D" /> Correct — “{typedValue}”</>
                    : <><X size={16} strokeWidth={2.4} color="#DC2626" /> You typed “{typedValue}”</>}
                </div>
              )}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '10px',
              }}>
                {[
                  { grade: 0, label: 'Again', color: '#DC2626', icon: RotateCcw },
                  { grade: 1, label: 'Hard', color: '#D97706', icon: AlertTriangle },
                  { grade: 2, label: 'Good', color: '#3E63DD', icon: Check },
                  { grade: 3, label: 'Easy', color: '#2F9E6D', icon: Sparkles },
                ].map(item => (
                  <GradeButton
                    key={item.grade}
                    grade={item.grade}
                    label={item.label}
                    interval={labels[item.grade]}
                    color={item.color}
                    icon={item.icon}
                    onClick={handleGrade}
                    suggested={suggestedGrade === item.grade}
                  />
                ))}
              </div>
            </div>
          )}
          {!isMobile && (
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: 550 }}>
              {flipped
                ? '1–4 to grade · Enter = ' + (suggestedGrade === 0 ? 'Again' : 'Good') + ' · R to replay'
                : (isTyped ? 'Enter to check' : 'Space to reveal')}
            </div>
          )}
          {/* In flow (not fixed) so it can never sit on top of the grade
              buttons — the fixed version covered Again/Hard on phones. */}
          {undoVisible && (
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button
                onClick={undoLast}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 16px', borderRadius: '999px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: '13px', fontWeight: 650,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(24,24,27,0.10)',
                }}
              >
                <RotateCcw size={15} strokeWidth={2} color="var(--text-muted)" />
                Undo last grade
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
