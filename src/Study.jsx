import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { isOnline } from './useOnline'
import { enqueueGrade, gradeCardWrite, nextActivityCounts, newOpId } from './syncQueue'
import { cacheSet, cacheGet, outboxDelete } from './offline'
import { getTrackCards } from './data'
import { studyFloorLevel } from './levelScope'
import { missingVocabIds, mergeVocab } from './deckVocab'
import { schedule, previewLabels, isCardDue, endOfLocalDay } from './srs'
import { todayStr } from './streak'
import { toast } from './toast'
import { languageTheme, pinyinInk} from './languageTheme'
import { vocabCacheKey } from './vocabCacheKey'
import { checkTypedAnswer } from './typedAnswer'
import { useIsMobile } from './useIsMobile'
import { useReadingFont } from './useReadingFont'
import { cleanMeaning } from './cleanMeaning'
import { pickRecapStory } from './storyMatch'
import { qualifiesForReward } from './storyReward'
import { claimSessionReward } from './storyRewardData'
import { tiersFor, learnedByLevel, readingGateCount } from './storyTiers'
import { buildStudyQueue, reinsertSoon, queueSeed } from './studyQueue'
import { isFirstRunSession, firstRunNewTarget } from './firstRun'
import { isReturningFromBreak, gentleReviewTarget } from './gentleReturn'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'
import SessionRecap from './SessionRecap'
import ChatMission from './ChatMission'
import { buildMissionOffer } from './missionOffer'
import { computeStudyTally } from './studyTally'
import { sessionMix, bandTone, MIX_KEYS, MIX_LABELS } from './sessionMix'
import { studyLayout, MOBILE_SHELL_HEIGHT } from './studyLayout'
import { cardMarker, MARKER_DOT } from './cardMarker'
import { gradePromptText } from './gradePrompt'
import Flashcard from './Flashcard'
import GradeRow from './GradeRow'
import { MICRO, NUM } from './designTokens'
import { tapFeedback } from './haptics'
import SessionPaused from './SessionPaused'
import { publish } from './cacheEvents'
import { useStudyAudio } from './useStudyAudio'
import { useStudyKeyboardShortcuts } from './useStudyKeyboardShortcuts'
import AudioButton from './AudioButton'
import { shouldOfferCoach, charBreakdown } from './stuckWord'
import StuckWordCoach from './StuckWordCoach'
import { loadTtsAudio, flashcardAudio } from './ttsAudio'
import {
  RotateCcw, AlertTriangle, Check,
  Sparkles, BookOpenCheck, X,
} from 'lucide-react'

// P14-0: vermilion, themed. See ui.jsx. Colour only — Study's composition is
// frozen (docs/P13 §17).
const PRIMARY = 'var(--primary)'
// Grade → feedback color (Again / Hard / Good / Easy) — the post-grade flash
// ring only, kept vivid so the ring reads clearly against the card.
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

// Icon-only, compact — the header row's Exit / Undo (label is aria/title
// only, no visible text, so the row stays a single slim line).
function HeaderIconButton({ icon: Icon, label, onClick, disabled }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '38px', height: '38px', borderRadius: '12px', flexShrink: 0,
        border: '1px solid var(--border)',
        background: hovered && !disabled ? 'var(--surface-2)' : 'var(--surface)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 160ms ease, opacity 160ms ease',
      }}
    >
      <Icon size={18} strokeWidth={1.9} color="var(--text-muted)" />
    </button>
  )
}

// Word and interval only — no icon. Four grades sit in one row, so each button
// is a narrow column; an icon beside the label crowds it and forces the word to
// shrink or wrap. The colour already carries the meaning the icon was adding.
export default function Study({ session, profile, track, mode = 'review', onBack, onNavigate, onProfileUpdate, onSessionStateChange }) {
  const isWeak = mode === 'weak'
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  // The session stepped aside without ending. See SessionPaused.jsx and the
  // 'exit-flow' rung in navStack.androidBack.
  const [paused, setPaused] = useState(false)
  // An unfinished session the learner left behind, waiting to be picked back
  // up. Distinct from `paused` on purpose — see exitSession below.
  const [awaitingContinue, setAwaitingContinue] = useState(false)
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
  // be undone — a persistent header button now, not a timed toast, so it's
  // available for as long as it's still valid (cleared the moment a new grade
  // or an explicit undo supersedes it — see applyGrade/undoLast).
  const undoRef = useRef(null)
  const [undoVisible, setUndoVisible] = useState(false)
  // Stuck-word help: after grading Again on a word that keeps slipping, offer a
  // fresh-angle coach; `coachVocab` is the word whose coach sheet is open.
  const [stuckOffer, setStuckOffer] = useState(null)
  const [coachVocab, setCoachVocab] = useState(null)
  const lastStudiedRecordedRef = useRef(false)
  // Running counts of today's study session, persisted to daily_activity so the
  // Profile calendar can show which days were studied.
  const activityRef = useRef({ studied: 0, newC: 0, learn: 0, review: 0 })
  // Per-session tally for the end-of-session recap card.
  const sessionRef = useRef({ graded: 0, newLearned: 0, graduated: 0, again: 0, reviewedRight: 0, reviewedTotal: 0 })
  // Per-card Again presses this session (by vocab id) — drives the stuck-word
  // coach offer for words being failed repeatedly right now (FSRS lapses stays 0
  // for learning cards, so it can't).
  const againCountRef = useRef({})
  const [forecast, setForecast] = useState(null)
  const [recap, setRecap] = useState(null)   // snapshot of sessionRef at completion
  // "First Story Unlocked" recommendation for the recap (null until computed;
  // stays null offline or when no story library exists — module stays hidden).
  const [storyUnlock, setStoryUnlock] = useState(null)
  // The session's chapter reward (the flashcards → story loop): what this
  // completed session unlocked in the active series. One claim attempt per
  // session; the RPC behind it is idempotent per day anyway.
  const [chapterReward, setChapterReward] = useState(null)
  const chapterRewardRef = useRef(false)
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
  // The study screen is height-locked to the viewport on phones (see
  // studyLayout.js), so it has to know how tall that viewport currently is —
  // rotating the device or the address bar collapsing both change it.
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  )
  useEffect(() => {
    function onResize() { setViewportHeight(window.innerHeight) }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  // The flashcard has no settings panel of its own — it simply follows the
  // reading font the learner picked in the readers, so the shape of the
  // character is the same wherever they meet it.
  const { fontFamily: charFont } = useReadingFont(track.language)
  const isTyped = profile.recall_mode === 'typed'

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accent = theme.accentVar
  const isJapanese = profile.active_language === 'japanese'
  const langFont = theme.font
  const langChars = theme.languageName

  // Is the CARD the thing this tab is currently showing?
  //
  // One derivation, because two different systems need exactly this fact and
  // must never disagree about it:
  //   - the shell hides the bottom tab bar while a card is up (NAV-MODEL §8.2);
  //   - card-entry side effects (the pronunciation) may only fire while the
  //     card is genuinely being presented — not merely while the persistent
  //     Cards root happens to be mounted or visible. See studyAutoplay.js.
  // It mirrors the render branches below in order: loading, then the
  // paused/continue screen, then the recap, then the card.
  const cardPresented = !loading && !done && !paused && !awaitingContinue && queue.length > 0

  // Audio (speed pref, iOS-safe playback + fallback, card-entry autoplay, and
  // current+next prefetch) lives in a focused hook.
  const { audioSpeed, audioBroken, playAudio, cycleSpeed, resetAudioBroken } = useStudyAudio({
    queue, flipped, presenting: cardPresented, profile, session, onProfileUpdate,
  })

  // Look up the generated clips for the cards about to be shown, before the
  // queue renders, so the speaker buttons appear in their final state instead
  // of popping in. Best-effort and non-blocking in spirit: if the lookup fails
  // (offline, or the migration is not applied yet) the cards fall back to the
  // legacy audio path and the extra controls simply stay hidden.
  async function primeTtsAudio(cards) {
    const ids = (cards || []).map(c => c.vocab && c.vocab.id).filter(Boolean)
    if (ids.length === 0) return
    try { await loadTtsAudio('vocabulary', ids) } catch { /* legacy audio still plays */ }
  }

  async function loadQueue() {
    setLoading(true)
    sessionVocabRef.current = []
    againCountRef.current = {}

    // Cumulative deck: fetch the user's cards first so we can derive the study
    // floor (the lowest level they actually study), then load every level's
    // vocabulary from that floor up to the current level. Advancing a level
    // keeps earlier levels in the deck for review instead of dropping them.
    // Every card the learner owns on this track, not just the ones inside the
    // level window. A card exists because they chose to study that word — saving
    // it from a story is an explicit act — so it belongs in the queue even when
    // the word sits above their current level or carries no level at all.
    // Which words get INTRODUCED as new is still level-scoped: that comes from
    // the `vocab` list below, never from the cards.
    const cards = await getTrackCards(session.user.id, track, { includeUnleveled: true })
    const floorLevel = studyFloorLevel(cards, track.current_level)

    const vocabKey = vocabCacheKey({
      language: track.language, system: track.system,
      floorLevel, currentLevel: track.current_level,
    })
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

    let vocabById = {}
    ;(vocab || []).forEach(v => { vocabById[v.id] = v })

    // A card whose vocabulary the level-scoped load didn't return used to be
    // dropped on the floor by the `filter(c => c.vocab)` below — silently, so a
    // saved word simply never appeared in a session again. Fetch exactly the
    // rows still missing (dictionary words carry no level; a reach word saved
    // from an easy story sits above the window) and merge them in.
    const missingIds = missingVocabIds(cards, vocabById)
    if (missingIds.length) {
      try {
        const extra = await supabase
          .from('vocabulary').select('*').in('id', missingIds)
        if (extra.data && extra.data.length) {
          vocabById = mergeVocab(vocabById, extra.data)
          vocabRef.current = [...(vocabRef.current || []), ...extra.data]
        }
      } catch { /* offline — those cards stay out of this session, as before */ }
    }

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
      await primeTtsAudio(weakQueue)
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
      .filter(c => (c.state === 'learning' || c.state === 'relearning') && isCardDue(c, now))
    // Day-based: every review scheduled for today is served from the 00:00
    // rollover, so a morning session isn't missing reviews that were last done
    // in the afternoon (matches how the new-card allotment refreshes at midnight).
    let dueReview = levelCards
      .filter(c => c.state === 'review' && isCardDue(c, now))

    // Gentle return: after a multi-day break the overdue backlog can be huge.
    // Cap it to a calm handful — oldest-due first (deterministic, and clears the
    // most-overdue cards first) — so coming back isn't a 300-card wall. Deferred
    // cards stay due and simply resurface next session; FSRS reschedules from the
    // actual review time, so nothing is lost. Only in normal review mode.
    const returning = mode === 'review' && isReturningFromBreak(profile)
    if (returning) {
      const cap = gentleReviewTarget({ returning, dueReviewCount: dueReview.length })
      if (cap < dueReview.length) {
        dueReview = [...dueReview]
          .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
          .slice(0, cap)
      }
    }

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
    await primeTtsAudio(newQueue)
    setQueue(newQueue)
    setDone(newQueue.length === 0)
    setLoading(false)
    if (newQueue.length > 0 && !analyticsRef.current.started) {
      analyticsRef.current.started = true
      trackEvent(EVENTS.STUDY_SESSION_STARTED, { mode: 'review', first_run: isFirst })
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadQueue, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute the next-day forecast (reviews + new) for the recap card.
  async function loadForecast() {
    // Same scope as the session queue: every card on this track, whatever its
    // level — otherwise tomorrow's forecast under-counts the very cards the
    // session will actually serve.
    const cards = await getTrackCards(session.user.id, track, {
      columns: 'vocab_id, state, due_at',
      includeUnleveled: true,
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

    const started = new Set((cards || []).map(c => c.vocab_id))
    // Reviews due AFTER today and by end of tomorrow — today's reviews are part
    // of the session just finished, so the forecast counts only what's genuinely
    // waiting for tomorrow.
    const eod = endOfLocalDay()
    const endOfTomorrow = new Date(); endOfTomorrow.setHours(23, 59, 59, 999)
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)

    // getTrackCards already scopes to this track's language + system, so a card
    // counts whether or not its word sits inside the level window.
    const reviews = (cards || []).filter(c => {
      if (c.state !== 'review') return false
      const d = new Date(c.due_at)
      return d > eod && d <= endOfTomorrow
    }).length
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
        // Cumulative shelf: every level the learner has reached, not just the
        // current one — so the recap still has something to recommend at a
        // level whose own stories don't exist yet.
        supabase.from('stories').select('id, title, content, tier, story_number, level')
          .eq('language', track.language).eq('system', track.system)
          .lte('level', track.current_level).eq('is_published', true),
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

      // Tier gating mirrors Stories exactly: each story is gated by ITS OWN
      // level's tiers and that level's learned-word count, with an already-passed
      // level counting as complete.
      const learnedPerLevel = learnedByLevel(vocabRows, cards)
      const tiersAt = (lvl) => tiersFor(track.language, lvl == null ? track.current_level : lvl)
      const learnedAt = (lvl) => {
        const level = lvl == null ? track.current_level : lvl
        return readingGateCount({
          level,
          currentLevel: track.current_level,
          learnedAtLevel: learnedPerLevel[level] || 0,
          tiers: tiersAt(level),
        })
      }

      // Distinct words actually studied this session.
      const sessionWords = [...new Set(sessionVocabRef.current.map(e => e.word))]

      const rec = pickRecapStory({
        stories,
        vocabMap,
        userCards,
        sessionWords,
        readIds: new Set((rres.data || []).map(r => r.story_id)),
        learnedCount: learnedAt(track.current_level),
        categories: tiersAt(track.current_level),
        language: track.language,
        tiersFor: tiersAt,
        learnedFor: learnedAt,
      })
      setStoryUnlock(rec)
    } catch {
      setStoryUnlock(null)
    }
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
    // The chapter reward: a qualifying session claims the day's unlock for the
    // active series. Fire-and-forget with a one-shot guard — the completion
    // screen shows whatever comes back, and nothing here blocks the recap.
    if (done && recap && !chapterRewardRef.current &&
        qualifiesForReward({ mode: isWeak ? 'weak' : 'review', graded: recap.graded })) {
      chapterRewardRef.current = true
      claimSessionReward(session.user.id, track).then(res => { if (res) setChapterReward(res) })
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
    // The learner's retention dial lives on the profile, so pass it explicitly:
    // that makes the account the source of truth and reduces srs.js's
    // device-local mirror to a fallback for when the column isn't loaded yet
    // (e.g. the migration is still unapplied). Without this a fresh device would
    // schedule at the default until Settings was opened once.
    const res = schedule(card, grade, { targetRetention: profile.target_retention })
    const online = isOnline()

    // A new grade invalidates any pending undo — its snapshot predates this one.
    undoRef.current = null
    setUndoVisible(false)

    // Stuck-word help: on Again, count this session's Again presses for the card
    // and offer the coach when it's historically stuck (lapses) OR being failed
    // repeatedly right now. A correct grade clears the offer + the card's count.
    const vId = card.vocab && card.vocab.id
    if (grade === 0) {
      const n = (againCountRef.current[vId] || 0) + 1
      againCountRef.current[vId] = n
      setStuckOffer(shouldOfferCoach(card, n) ? card.vocab : null)
    } else {
      if (vId) delete againCountRef.current[vId]
      setStuckOffer(null)
    }

    // Snapshot the pre-grade world for undo. `card`/`queue` are the pre-grade
    // values; the running refs are copied before this grade's tallies land.
    const snapshot = {
      card: { ...card },
      prevQueue: queue.slice(),
      session: { ...sessionRef.current },
      activity: { ...activityRef.current },
      wasNew: !card.id,
      cardId: null,
      logId: null,
    }

    // Fire the colored grade-feedback ring (restarts via the bumped key), and
    // the physical half of the same confirmation. Grading is the most-repeated
    // action in the app, so this is the lightest tick available and the same
    // one for all four grades: a heavier buzz for Again would be the app
    // tutting at a learner, which is the opposite of the stated stance.
    setGradeColor(GRADE_COLORS[grade])
    setGradeId(id => id + 1)
    tapFeedback()

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

    // The queue has moved, so Home's counts are behind — even if the learner
    // leaves this session half-finished and never reaches the recap. Marking is
    // free; the refetch happens once, when Home is next looked at. Nothing else
    // on Home changes from one grade, so nothing else is touched.
    publish('card:graded')

    // Record today as a study day (once per session) — purely factual, feeds
    // the calm "gentle return after a break" welcome, not a streak/guilt mechanic.
    if (!lastStudiedRecordedRef.current) {
      lastStudiedRecordedRef.current = true
      if (online) {
        const today = todayStr()
        supabase.from('profiles').update({ last_studied_on: today }).eq('id', session.user.id).then(() => {})
        if (onProfileUpdate) onProfileUpdate({ last_studied_on: today })
      }
    }

    // The review log for this grade — written inside the same transaction as
    // the card row, so history can never disagree with scheduling.
    const log = {
      grade,
      previous_state: card.state,
      next_state: res.updates.state,
      previous_interval_days: card.interval_days || 0,
      next_interval_days: res.updates.interval_days,
    }
    // Today's running counts AFTER this card. Committed to the ref only once
    // the write lands, so a failed grade never inflates the day's activity.
    const nextCounts = nextActivityCounts(activityRef.current, card.state)

    let cardId = card.id
    let outboxId = null
    if (online) {
      // One transaction: card row + review log + today's activity. Falls back
      // to the previous separate writes if the RPC isn't deployed yet.
      const write = await gradeCardWrite(supabase, {
        userId: session.user.id,
        cardId: card.id || null,
        vocabId: card.vocab_id,
        updates: res.updates,
        log,
        activity: {
          mode: 'set',
          date: todayStr(),
          studied: nextCounts.studied,
          new: nextCounts.newC,
          learning: nextCounts.learn,
          review: nextCounts.review,
        },
        opId: newOpId(),
      })
      if (!write.ok) {
        console.error('[Study] grade write failed', write.error)
        setSaveError(write.error && write.error.message)
        return
      }
      cardId = write.cardId
      // Captured so undo can remove the log entry. On the fallback path the
      // insert is still non-blocking, so the id arrives a moment later.
      snapshot.logId = write.logId
      if (write.pendingLogId) write.pendingLogId.then(id => { if (id) snapshot.logId = id })
      // The row may already have existed (another device started this word
      // between load and grade). The RPC upserts rather than failing, so undo
      // must restore that row instead of deleting someone else's progress.
      if (write.viaRpc && !card.id && write.inserted === false) snapshot.wasNew = false
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
        log,
        day: todayStr(),
        state: card.state,
      })
    }

    // Offer undo — a persistent header button now, not a timed toast — except
    // when this grade completes the session (the recap snapshot has already
    // been taken by then).
    snapshot.cardId = cardId
    snapshot.outboxId = outboxId
    const willComplete = !res.stay && queue.length === 1
    if (!willComplete) {
      undoRef.current = snapshot
      setUndoVisible(true)
    }
    // The write landed (or was queued) — this card now counts toward today.
    // Offline these counts also ride along in the queued op and are folded into
    // the server row when the outbox flushes.
    activityRef.current = nextCounts

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
        // The session is over, so anything derived from it is now behind:
        // the shelf's unlocked chapters, Home's counts, the reward teaser.
        // Stories may be sitting hidden and fully mounted, so nothing will
        // refetch on its own — this is what tells it to, the next time the
        // learner looks at it (cacheEvents.js says which keys that is).
        publish('session:completed')
        setDone(true)
      }
      return rest
    })
  }

  // Undo the last grade: restore the card row, queue order, session tallies,
  // and daily activity to their pre-grade snapshot.
  const undoLast = async () => {
    const u = undoRef.current
    if (!u || gradingRef.current) return
    gradingRef.current = true
    undoRef.current = null
    setUndoVisible(false)
    setStuckOffer(null)
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
      if (serverPersisted) {
        supabase.from('daily_activity').upsert({
          user_id: session.user.id,
          activity_date: todayStr(),
          studied_cards: u.activity.studied,
          new_cards: u.activity.newC,
          learning_cards: u.activity.learn,
          review_cards: u.activity.review,
        }, { onConflict: 'user_id,activity_date' }).then(() => {})
      }

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


  // In typed mode the check result implies a grade — highlight it and let Enter
  // confirm it. Flip mode defaults Enter to "Good" (the Anki convention).
  const suggestedGrade = isTyped && typedResult ? (typedResult === 'correct' ? 2 : 0) : null

  // Desktop keyboard flow lives in a focused hook (behavior unchanged; the
  // typed-mode input owns its own keys since inputs are ignored there).
  useStudyKeyboardShortcuts({
    loading, done, queue, flipped, suggestedGrade, undoRef,
    setFlipped, handleGrade, playAudio, undoLast,
  })

  // Header rail: what the session is made of right now — work done, then the
  // new / learning / due cards still ahead (sessionMix.js). `total` state is
  // still the load-time estimate; the rail's denominator comes from the live
  // queue so a growing session stays honest.
  const mix = sessionMix(queue, studied)

  // Tell the shell when a flashcard is actually on screen.
  //
  // The bottom tab bar has no business sitting under a card — the session is
  // the one place in the app that owns the whole screen (NAV-MODEL §8.2). The
  // shell cannot infer that from the route, because this IS the Cards tab's
  // root: only Study knows whether it is showing a card, a recap, or a loading
  // state. `inProgress` is separate and is what stops a stray tap on the Cards
  // tab throwing a half-finished session away.
  const immersive = cardPresented
  const inProgress = !loading && !done && queue.length > 0 && studied > 0

  // ONE exit action. The X in the session header and Android's hardware back
  // key both call this, so they cannot drift apart — and neither of them
  // reaches for Home, which was never what "leave the session" meant.
  const exitSession = useCallback(() => { setPaused(true) }, [])

  // `paused` is the immediate result of pressing X. It must NOT outlive the
  // visit.
  //
  // The Cards root is persistent (<Activity>), so component state survives
  // leaving the tab — which turned one tap on X into a takeover screen that
  // greeted the learner on EVERY later visit to Cards, in an app run they had
  // not started a card in. Found on a device; invisible on the web, where you
  // rarely come back to the tab hours later.
  //
  // So on hide it converts into `awaitingContinue`: the same unfinished
  // session, offered rather than imposed. Nothing is lost either way — every
  // graded card was written when it was graded.
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => () => {
    // Cleanup with no deps: runs exactly when the Cards tab is hidden.
    if (pausedRef.current) {
      setPaused(false)
      setAwaitingContinue(true)
    }
  }, [])

  useEffect(() => {
    if (!onSessionStateChange) return undefined
    onSessionStateChange({ immersive, inProgress, exit: exitSession })
    // Leaving the session must always give the bar back, including when this
    // unmounts mid-card (a deep link, a sign-out).
    return () => onSessionStateChange({ immersive: false, inProgress: false, exit: null })
  }, [immersive, inProgress, exitSession, onSessionStateChange])

  // No card coaching here any more. The onboarding tutorial teaches reveal,
  // Replay and grading on the real card before the account exists, so a
  // learner arriving at their FIRST real session has already done all three —
  // repeating it is the tutorial-on-tutorial problem. `firstRun` still matters:
  // it is what caps this session to five new cards (firstRun.js).

  // All the size arithmetic lives in studyLayout.js. On a phone this returns a
  // height-locked shell so the grade buttons can never fall below the fold.
  const layout = studyLayout({
    isMobile,
    viewportHeight,
    banners: (saveError ? 1 : 0) + (isJapanese ? 1 : 0),
  })

  // The recap and loading states are ordinary scrollable pages — only the card
  // view is locked to one viewport.
  // The shell the recap and the paused state sit in.
  //
  // `minHeight: 100vh` was wrong here, and measurably so: these two screens
  // render INSIDE App's <main>, which already reserves the bottom tab bar and
  // both safe-area insets. Asking for a full viewport on top of a reservation
  // made a completion screen whose content fits scroll by exactly the height of
  // the bar — measured at +62px on both a 390x844 and a 430x932 phone, which is
  // MOBILE_NAV_HEIGHT to the pixel.
  //
  // MOBILE_SHELL_HEIGHT is the usable area inside <main> and already exists for
  // the card view: 100dvh minus the nav, minus each inset exactly once. Using
  // it here is the same principle, not a second one — and `dvh` also stops the
  // collapsing address bar making it a chunk too tall on the web.
  //
  // Desktop keeps 100vh: there is no bottom bar to reserve, and the card view's
  // desktop fallback spreads this object.
  const pageShell = {
    minHeight: isMobile ? MOBILE_SHELL_HEIGHT : '100vh',
    position: 'relative',
    overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  // The card view: a fixed-height flex column on mobile (header rail pinned,
  // card flexes, grade band pinned), the original growing page on desktop.
  const studyShell = layout.fixed
    ? {
      height: layout.shellHeight,
      maxHeight: layout.shellHeight,
      position: 'relative',
      overflow: 'hidden',
      padding: layout.shellPadding,
      display: 'flex',
      flexDirection: 'column',
    }
    : { ...pageShell, padding: layout.shellPadding }

  // Blocks above the card never shrink — the card absorbs the difference.
  const railStyle = {
    width: '100%', maxWidth: '680px', margin: '0 auto',
    marginBottom: layout.headerGap + 'px', flexShrink: 0,
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

  // Paused: the queue is still in memory (the Cards root is persistent), and
  // every graded card was written when it was graded, so there is nothing to
  // confirm and nothing to lose. Checked before the recap so a paused session
  // with cards left never renders as a finished one.
  if ((paused || awaitingContinue) && !done && queue.length > 0) {
    const resume = () => { setPaused(false); setAwaitingContinue(false) }
    return (
      <div style={pageShell}>
        <SessionPaused
          // Returning to the tab is an OFFER ("Continue session"); pressing X
          // is an outcome ("Session paused"). Same session, same buttons — the
          // difference is whether the learner just did something or is being
          // met by something.
          variant={paused ? 'paused' : 'continue'}
          studied={studied}
          remaining={queue.length}
          accentHex={accentHex}
          onResume={resume}
          onFinish={() => { resume(); setDone(true) }}
        />
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
          chapterReward={chapterReward}
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
  // Generated clips for this card (word, slow word, example sentence, slow
  // sentence). `word` falls back to the legacy audio_path, so a level that has
  // not been regenerated sounds exactly as it does today.
  const cardAudio = flashcardAudio(v)
  const audioUrl = cardAudio.word
  const canUseFurigana = isJapanese && hasKanji(v.word) && Boolean(v.reading)
  const showRuby = canUseFurigana && (showFurigana || flipped)
  const wordFuri = showRuby ? furiganaParts(v.word, v.reading) : null
  const showReadingLine = flipped && v.reading && !isJapanese
  // Prefer the sentence the learner actually read (captured when they added the
  // word from a story) over the generic example — real context is more memorable.
  const sourceSentence = card.source_sentence || null
  const hasExample = Boolean(sourceSentence || v.example_sentence || v.example_reading || v.example_translation)

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
            <rt style={{ fontSize: '0.65em', fontWeight: 500, color: pinyinInk(accentHex) }}>{exFuri.coreReading}</rt>
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
  const marker = cardMarker(card)
  // Story attribution for the source sentence (requirement 7) — both new,
  // optional columns; a pre-migration DB or a non-story add just leaves them
  // null and the extra labels below don't render.
  const sourceStoryTitle = card.source_story_title || null
  const sourceTranslation = card.source_translation || null
  // Leech intervention (requirement 8) — a genuinely FSRS-tracked signal
  // (lapses), answer side only, never before reveal.
  const isLeech = flipped && (card.lapses || 0) >= 4
  const leechChars = track.language === 'chinese' ? charBreakdown(v.word, v.reading) : []
  const showLeechBreakdown = leechChars.length > 1

  function submitTyped() {
    if (!typedValue.trim()) return
    setTypedResult(checkTypedAnswer(typedValue, v, isJapanese) ? 'correct' : 'wrong')
    setFlipped(true)
  }

  // "See it in a story" — a lightweight on-demand lookup (no dependency on
  // this card happening to carry source_story_id, so it works for ANY
  // leeching word, not just ones originally added from a story).
  async function findStoryForWord() {
    try {
      const { data } = await supabase
        .from('stories')
        .select('id, title')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('is_published', true)
        .ilike('content', '%' + v.word + '%')
        .limit(1)
      const hit = data && data[0]
      if (hit) {
        onNavigate && onNavigate('stories', { storyId: hit.id, todayWords: [v.word] })
      } else {
        toast({ title: 'No story has this word yet' })
      }
    } catch {
      toast({ title: 'No story has this word yet' })
    }
  }

  // "Reset this card" — a correction action, not a grade: puts the row back
  // to the same fresh-card shape newItems uses, and lets the learner restudy
  // it immediately rather than waiting for the next session.
  async function resetCard() {
    const fresh = {
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
      is_easy: false, learned: false,
      stability: null, difficulty: null, reps: 0, lapses: 0,
      last_review: null, scheduled_days: 0, elapsed_days: 0,
    }
    if (card.id) {
      await supabase.from('cards').update(fresh).eq('id', card.id).eq('user_id', session.user.id)
    }
    setStuckOffer(null)
    setFlipped(false)
    setQueue(prev => [{ ...prev[0], ...fresh }, ...prev.slice(1)])
  }

  return (
    <div style={studyShell}>
      {saveError && (
        <div style={{
          width: '100%', maxWidth: '680px', margin: '0 auto', marginBottom: '18px', flexShrink: 0,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: '#DC2626',
          padding: '14px 18px', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5,
        }}>
          <strong>Card save failed</strong> - your progress is not being saved. Database error: {saveError}
          <br />Run the migration SQL in your Supabase SQL Editor, then refresh.
        </div>
      )}

      {/* The screen's h1, visually hidden — the design carries no title text,
          but heading navigation (screen-reader rotor) still needs a landmark. */}
      <h1 style={{
        position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
        overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
      }}>
        Study session
      </h1>

      <div style={{ ...railStyle, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <HeaderIconButton icon={X} label="Close study session" onClick={exitSession} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The rail is the session's composition, not one flat number: work
              done, then the new / learning / due cards still ahead. It is fully
              painted on card one, so it never reads as an empty grey line. */}
          <div
            role="progressbar"
            aria-label="Session progress"
            aria-valuemin={0}
            aria-valuemax={mix.total}
            aria-valuenow={mix.done}
            style={{ display: 'flex', gap: '3px', height: '6px' }}
          >
            {mix.segments.filter(seg => seg.pct > 0).map(seg => (
              <div
                key={seg.key}
                style={{
                  flex: seg.pct + ' 0 0%',
                  borderRadius: '999px',
                  background: bandTone(accentHex, seg.key),
                  transition: 'flex-grow 320ms ease',
                }}
              />
            ))}
            {mix.total === 0 && (
              <div style={{ flex: 1, borderRadius: '999px', background: 'var(--border)' }} />
            )}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
            gap: isMobile ? '12px' : '16px', marginTop: '9px',
          }}>
            {MIX_KEYS.map(key => (
              <span key={key} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                opacity: mix.counts[key] > 0 ? 1 : 0.38,
              }}>
                <span style={{
                  width: MARKER_DOT + 'px', height: MARKER_DOT + 'px',
                  borderRadius: '999px', flexShrink: 0,
                  background: bandTone(accentHex, key),
                }} />
                <span style={{ ...NUM, fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                  {mix.counts[key]}
                </span>
                <span style={{ ...MICRO, fontSize: '9.5px', color: 'var(--text-faint)' }}>
                  {MIX_LABELS[key]}
                </span>
              </span>
            ))}
          </div>
        </div>
        <HeaderIconButton icon={RotateCcw} label="Undo last grade" onClick={undoLast} disabled={!undoVisible} />
      </div>

      {isJapanese && (
        <div style={{ ...railStyle, display: 'flex', justifyContent: 'center' }}>
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

      {/* On mobile this is the flex column that owns the leftover height: the
          card takes it (and scrolls internally), the grade band below never
          moves. On desktop it stays the original single-column grid. */}
      <div style={layout.fixed
        ? {
          width: '100%', maxWidth: '680px', margin: '0 auto',
          display: 'flex', flexDirection: 'column',
          flex: 1, minHeight: 0,
        }
        : {
          maxWidth: '680px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', justifyItems: 'center',
        }}
      >
        <Flashcard
          layout={layout}
          marker={marker}
          flipped={flipped}
          word={v.word}
          ruby={wordFuri}
          charFont={charFont}
          wordLabel={langChars + ' flashcard — tap to reveal the answer'}
          reading={showReadingLine ? v.reading : null}
          readingColor={pinyinInk(accent)}
          meaning={cleanMeaning(v.meaning)}
          accentHex={accentHex}
          audioUrl={audioUrl}
          audioBroken={audioBroken}
          audioSpeed={audioSpeed}
          onReplay={playAudio}
          onCycleSpeed={cycleSpeed}
          // A word being met for the first time cannot be remembered, so the
          // question follows the card's state (gradePrompt.js). Copy only —
          // the four grades and everything they do are untouched.
          footerHint={flipped
            ? gradePromptText(marker.key)
            : (isTyped ? 'Type the reading, then check' : 'Recall first, then reveal')}
          flash={gradeColor ? { color: gradeColor, id: gradeId } : null}
          onReveal={() => setFlipped(true)}
        >
          {/* Everything answer-side that belongs to a REAL learner's card: the
              example sentence with its story attribution, and the leech panel.
              It stays here rather than in Flashcard because it reaches for
              Supabase (findStoryForWord, resetCard) and for this card's own
              history — neither of which the card component should know about. */}
          <>
                {hasExample && (
                  <div style={{
                    width: '100%', maxWidth: '430px',
                    marginTop: (layout.fixed ? '14px' : '22px'), paddingTop: (layout.fixed ? '12px' : '18px'),
                    borderTop: '1px solid var(--border)', textAlign: 'center',
                  }}>
                    {sourceSentence ? (
                      <>
                        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          {sourceStoryTitle ? 'From "' + sourceStoryTitle + '"' : 'From a story you read'}
                        </div>
                        <div style={{ fontSize: '17px', color: 'var(--text)', lineHeight: 1.5, fontFamily: langFont }}>
                          {renderExampleSentence(sourceSentence, v.word, v.reading)}
                        </div>
                        {sourceTranslation && (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '7px', lineHeight: 1.45 }}>
                            {sourceTranslation}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
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
                        {/* The sentence gets its own controls, separate from the
                            word's: hearing the word inside a real sentence is a
                            different exercise from hearing it alone. Kept quiet
                            and small so the card still leads with the word. */}
                        {cardAudio.sentence && (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                            <AudioButton
                              url={cardAudio.sentence}
                              label="Play the example sentence"
                              text="Sentence"
                              tone="quiet"
                              size="sm"
                              accentHex={accentHex}
                            />
                            {cardAudio.sentence_slow && (
                              <AudioButton
                                url={cardAudio.sentence_slow}
                                label="Play the example sentence slowly"
                                icon="slow"
                                tone="quiet"
                                size="sm"
                                accentHex={accentHex}
                              />
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {isLeech && (
                  <div style={{
                    width: '100%', maxWidth: '430px', marginTop: '18px', padding: '14px 16px',
                    borderRadius: '14px', background: '#FBF3EC', border: '1px solid #EEDCCB',
                    textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 750, color: '#8A5F1E' }}>
                      <AlertTriangle size={15} strokeWidth={2} color="#8A5F1E" style={{ flexShrink: 0 }} />
                      This one keeps slipping — missed {card.lapses} times
                    </div>
                    {showLeechBreakdown && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                        {leechChars.map((p, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '5px 9px', borderRadius: '9px', background: 'var(--surface)',
                            border: '1px solid #EEDCCB',
                          }}>
                            <span style={{ fontSize: '17px', fontFamily: charFont, color: 'var(--text)' }}>{p.char}</span>
                            {p.pinyin && <span style={{ fontSize: '10.5px', color: '#8A5F1E', fontWeight: 600 }}>{p.pinyin}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <button
                        onClick={e => { e.stopPropagation(); findStoryForWord() }}
                        style={{
                          padding: '7px 12px', borderRadius: '10px', cursor: 'pointer',
                          background: 'var(--surface)', border: '1px solid #EEDCCB',
                          color: '#8A5F1E', fontSize: '12.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        See it in a story
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); resetCard() }}
                        style={{
                          padding: '7px 12px', borderRadius: '10px', cursor: 'pointer',
                          background: 'none', border: '1px solid #EEDCCB',
                          color: '#8A5F1E', fontSize: '12.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        Reset this card
                      </button>
                    </div>
                  </div>
                )}
          </>
        </Flashcard>

        <div style={{ width: '100%', maxWidth: '680px', marginTop: layout.gradeTopGap + 'px', flexShrink: 0 }}>
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
                    aria-label={isJapanese ? 'Type the reading' : 'Type the pinyin'}
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
                      border: 'none', background: PRIMARY, color: '#fff',
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
            ) : null
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
              <GradeRow
                labels={labels}
                onGrade={handleGrade}
                suggested={suggestedGrade}
                layout={layout}
              />
            </div>
          )}
          {!isMobile && (
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: 550 }}>
              {flipped
                ? '1–4 to grade · Enter = ' + (suggestedGrade === 0 ? 'Again' : 'Good') + ' · R to replay'
                : (isTyped ? 'Enter to check' : 'Space to reveal')}
            </div>
          )}
          {stuckOffer && (
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <button
                onClick={() => setCoachVocab(stuckOffer)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 16px', borderRadius: '999px',
                  background: accentHex + '10', border: '1px solid ' + accentHex + '33',
                  color: accentHex, fontSize: '13px', fontWeight: 700,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                }}
              >
                <Sparkles size={15} strokeWidth={2} color={accentHex} />
                Struggling? See it a different way
              </button>
            </div>
          )}
        </div>
      </div>

      <StuckWordCoach vocab={coachVocab} onClose={() => setCoachVocab(null)} />
    </div>
  )
}
