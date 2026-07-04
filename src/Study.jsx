import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { schedule, previewLabels } from './srs'
import { xpForGrade, levelInfo, levelTitle, nextTitle } from './xp'
import { computeAward } from './xpService'
import { updateStreak, todayStr, liveStreak } from './streak'
import { evaluateAchievements } from './achievements'
import { toast } from './toast'
import { getLevelLabel, getSystemLabel, getAudioUrl, playAudioEl } from './utils'
import { languageTheme } from './languageTheme'
import { lenientPinyin } from './testLogic'
import { toRomaji } from 'wanakana'
import { useIsMobile } from './useIsMobile'
import { CountUp } from './ui'
import { cleanMeaning } from './cleanMeaning'
import ChatMission from './ChatMission'
import { pickMission } from './chatMissions'
import {
  Volume2, VolumeX, ArrowLeft, Eye, RotateCcw, AlertTriangle, Check,
  Sparkles, CheckCircle2, Layers, BookOpenCheck, Sunrise, X, Snowflake, TrendingUp,
  MessageCircleMore, ChevronRight,
} from 'lucide-react'

// Does the typed input match the card's reading (or the word itself)?
// Japanese accepts romaji or kana; Chinese accepts tone-insensitive pinyin.
function checkTyped(input, v, isJapanese) {
  const t = (input || '').trim().toLowerCase()
  if (!t) return false
  if (t === (v.word || '').toLowerCase()) return true
  const reading = v.reading || ''
  if (t === reading.toLowerCase()) return true
  if (isJapanese) {
    const norm = s => (toRomaji(s || '') || '').toLowerCase().split(' ').join('')
    const target = norm(reading)
    return target !== '' && norm(input) === target
  }
  // Chinese: tone-mark AND tone-number insensitive, punctuation/space tolerant —
  // "hai", "hǎi", "hai3" are all the same answer. Both stored forms accepted.
  const typed = lenientPinyin(input)
  if (!typed) return false
  return [v.reading_plain, reading]
    .filter(Boolean)
    .some(r => lenientPinyin(r) === typed)
}

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

// Spread `insert` items evenly through `base` so the two kinds of card arrive
// mixed, not as back-to-back blocks. Used to weave new cards into the due-review
// backbone: reviews still lead (a review shows before the first new card), but
// new cards no longer sit stranded at the very end of the session.
function interleave(base, insert) {
  if (insert.length === 0) return base.slice()
  if (base.length === 0) return insert.slice()
  const out = []
  const step = base.length / (insert.length + 1)
  let si = 0
  for (let i = 0; i < base.length; i += 1) {
    out.push(base[i])
    while (si < insert.length && (si + 1) * step <= i + 1) { out.push(insert[si]); si += 1 }
  }
  while (si < insert.length) { out.push(insert[si]); si += 1 }
  return out
}

export default function Study({ session, profile, track, mode = 'review', onBack, onStreakUpdate }) {
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
  const audioRef = useRef(null)
  // TTS playback rate (1× / 0.75× / 0.5×), seeded from the saved preference.
  const [audioSpeed, setAudioSpeed] = useState(
    profile.audio_speed === 0.75 || profile.audio_speed === 0.5 ? profile.audio_speed : 1
  )
  const [audioBroken, setAudioBroken] = useState(false)   // current card's audio failed to load
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
  // Word-to-World chat mission: the level's vocab (for tap lookups) and a record
  // of which words were touched this session, so the mission can reuse today's
  // learned / weak / review words.
  const vocabRef = useRef([])
  const sessionVocabRef = useRef([])
  const [missionOffer, setMissionOffer] = useState(null)   // snapshot at completion
  const [mission, setMission] = useState(null)              // active running mission

  // Snapshot the session's words into a chat-mission offer (buckets + vocab)
  // when the queue empties. Reads refs from a callback, never during render.
  function buildMissionOffer() {
    const seen = new Map()
    sessionVocabRef.current.forEach(e => {
      const p = seen.get(e.word) || { weak: false, review: false }
      seen.set(e.word, { weak: p.weak || e.weak, review: p.review || e.review })
    })
    if (seen.size === 0) return null
    const dayBuckets = { learned: [], weak: [], review: [] }
    seen.forEach((val, w) => {
      if (val.weak) dayBuckets.weak.push(w)
      else if (val.review) dayBuckets.review.push(w)
      else dayBuckets.learned.push(w)
    })
    const picked = pickMission({ language: track.language, level: track.current_level, dayWords: [...seen.keys()], seed: seen.size })
    return picked ? { mission: picked, dayBuckets, vocab: vocabRef.current } : null
  }
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

  function playAudio() {
    const card = queue[0]
    if (!card?.vocab?.audio_path) return
    const url = getAudioUrl(card.vocab.audio_path)
    if (!url) return
    // ONE element, reused for every play — iOS caches a fallback-fetched clip
    // on the element so Replay works even when the direct load fails (see
    // playAudioEl). A fresh element per tap threw that away, which is why the
    // Replay button did nothing on iPhones.
    if (!audioRef.current) audioRef.current = new Audio()
    const el = audioRef.current
    el.pause()
    // Both: playbackRate for the already-loaded clip, defaultPlaybackRate so a
    // fresh load doesn't reset the speed back to 1x.
    el.playbackRate = audioSpeed
    el.defaultPlaybackRate = audioSpeed
    // Surface a broken/missing file instead of failing silently — "the sound
    // doesn't work" with no signal is undebuggable for the user. playAudioEl
    // already retries once via a blob fetch (works around iOS WebKit Range
    // quirks against the storage CDN) before giving up.
    playAudioEl(el, url, () => setAudioBroken(true))
  }

  const SPEEDS = [1, 0.75, 0.5]
  function cycleSpeed() {
    setAudioSpeed(prev => {
      const next = SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length]
      // Persist as a preference (best-effort) and patch the in-memory profile
      // so the choice survives reloads instead of resetting to 1×.
      supabase.from('profiles').update({ audio_speed: next }).eq('id', session.user.id).then(() => {})
      if (onStreakUpdate) onStreakUpdate({ audio_speed: next })
      return next
    })
  }

  async function loadQueue() {
    setLoading(true)
    sessionVocabRef.current = []

    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    vocabRef.current = vocab || []

    // Server-side scoped to this level — never the whole cross-language table.
    const cards = await getTrackCards(session.user.id, track, { level: track.current_level })

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
      return
    }

    const dueLearning = levelCards
      .filter(c => (c.state === 'learning' || c.state === 'relearning') && new Date(c.due_at) <= now)
    const dueReview = levelCards
      .filter(c => c.state === 'review' && new Date(c.due_at) <= now)

    const newItems = (vocab || [])
      .filter(v => !startedVocab.has(v.id))
      .slice(0, remainingNew)
      .map(v => ({
        id: null, vocab_id: v.id, vocab: v,
        state: 'new', ease_factor: 2.5, interval_days: 0, learning_step: 0,
      }))

    // Due reviews are the SRS priority, so they lead; new cards are woven in
    // evenly rather than piled in front of the reviews (which used to make every
    // due review wait until all new cards were cleared). Learning/relearning
    // cards are time-sensitive re-tries, so they stay at the very front.
    const newQueue = [...dueLearning, ...interleave(dueReview, newItems)]
    setQueue(newQueue)
    setDone(newQueue.length === 0)
    setLoading(false)
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

  useEffect(() => {
    if (flipped && queue.length > 0 && profile.audio_autoplay !== false) {
      playAudio()
    }
  }, [flipped])

  // Upsert today's study counts so the Profile calendar can show studied days.
  // Counts are this session's running totals (presence is always correct).
  const recordActivity = (cardState) => {
    const a = activityRef.current
    a.studied += 1
    if (cardState === 'new') a.newC += 1
    else if (cardState === 'review') a.review += 1
    else a.learn += 1
    supabase.from('daily_activity').upsert({
      user_id: session.user.id,
      activity_date: todayStr(),
      studied_cards: a.studied,
      new_cards: a.newC,
      learning_cards: a.learn,
      review_cards: a.review,
    }, { onConflict: 'user_id,activity_date' }).then(() => {})
  }

  // Recompute the next-day forecast (reviews + new) for the recap card.
  async function loadForecast() {
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
    const cards = await getTrackCards(session.user.id, track, {
      level: track.current_level,
      columns: 'vocab_id, state, due_at',
    })

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
      .forEach(a => toast({ kind: 'seal', title: 'Seal earned — ' + a.title, body: a.desc }))
  }

  useEffect(() => {
    if (done && recap && recap.graded > 0 && !forecast) {
      loadForecast()
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

    // Record the word for the end-of-session chat mission: grade 0 (Again) marks
    // it weak; a review-state card is a mature word; otherwise it's learned today.
    if (card.vocab && card.vocab.word) {
      sessionVocabRef.current.push({
        word: card.vocab.word,
        weak: grade === 0,
        review: card.state === 'review',
      })
    }

    // Tally this card for the session recap (before the queue mutates).
    const s = sessionRef.current
    s.graded += 1
    if (card.state === 'new') s.newLearned += 1
    if (grade === 0) s.again += 1
    if (res.updates.state === 'review' && card.state !== 'review') s.graduated += 1
    if (card.state === 'review') {
      s.reviewedTotal += 1
      if (grade >= 1) s.reviewedRight += 1
    }
    const xpGain = xpForGrade(grade)

    if (!streakDone) {
      setStreakDone(true)
      const newStreak = await updateStreak(profile)
      if (typeof newStreak.streak === 'number') streakAfterRef.current = newStreak.streak
      if (typeof newStreak.streak_freezes === 'number') freezesRef.current = newStreak.streak_freezes
      if (onStreakUpdate) onStreakUpdate(newStreak)
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
        supabase.from('profiles').update({ streak_freezes: freezesRef.current }).eq('id', session.user.id).then(() => {})
        if (onStreakUpdate) onStreakUpdate({ streak_freezes: freezesRef.current })
      }
    }

    let cardId = card.id
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

    // Offer undo for a few seconds — except when this grade completes the
    // session (the recap snapshot has already been taken by then).
    snapshot.cardId = cardId
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

    // Persist lifetime XP (best-effort; harmless if the column doesn't exist yet)
    // and reflect it in the in-memory profile so Home/Profile update live.
    supabase.from('profiles').update({ total_xp: xpRef.current }).eq('id', session.user.id).then(() => {})
    if (onStreakUpdate) onStreakUpdate({ total_xp: xpRef.current })

    setFlipped(false)
    setTypedValue('')
    setTypedResult(null)
    setAudioBroken(false)

    setQueue(prev => {
      const rest = prev.slice(1)
      if (res.stay) {
        const item = { ...card, ...res.updates, id: cardId }
        const pos = Math.min(res.gap, rest.length)
        rest.splice(pos, 0, item)
      }
      if (rest.length === 0) {
        setRecap({ ...sessionRef.current })
        setMissionOffer(buildMissionOffer())
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
      if (u.wasNew) {
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
      if (u.logId) supabase.from('review_logs').delete().eq('id', u.logId).then(() => {})

      sessionRef.current = u.session
      activityRef.current = u.activity
      xpRef.current = u.xp
      const restore = { total_xp: u.xp }
      if (freezesRef.current !== u.freezes) restore.streak_freezes = u.freezes
      freezesRef.current = u.freezes
      supabase.from('profiles').update(restore).eq('id', session.user.id).then(() => {})
      if (onStreakUpdate) onStreakUpdate(restore)
      supabase.from('daily_activity').upsert({
        user_id: session.user.id,
        activity_date: todayStr(),
        studied_cards: u.activity.studied,
        new_cards: u.activity.newC,
        learning_cards: u.activity.learn,
        review_cards: u.activity.review,
      }, { onConflict: 'user_id,activity_date' }).then(() => {})

      setFlipped(false)
      setTypedValue('')
      setTypedResult(null)
      setAudioBroken(false)
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

  // Desktop keyboard flow: Space/Enter reveals, 1–4 grades, Enter takes the
  // suggested/Good grade, R replays audio, U undoes the last grade. Rebinds
  // each render so the handler always sees current state. The typed-mode input
  // owns its own keys (Enter submits there), so key events from inputs are
  // ignored.
  useEffect(() => {
    const onKey = (e) => {
      if (loading || done || queue.length === 0) return
      const el = e.target
      const tag = el && el.tagName
      // Typing contexts own the keyboard entirely.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return
      // A focused button/link keeps its native Space/Enter activation; the
      // non-activating shortcuts (1–4, R, U) still work so the mouse+keyboard
      // mixed flow isn't broken by focus resting on the last-clicked button.
      const onActivatable = tag === 'BUTTON' || tag === 'A'
      if ((e.key === 'u' || e.key === 'U') && undoRef.current) {
        e.preventDefault()
        undoLast()
        return
      }
      if (!flipped) {
        if (!onActivatable && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault()
          setFlipped(true)
        }
        return
      }
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        handleGrade(Number(e.key) - 1)
      } else if (!onActivatable && e.key === 'Enter') {
        e.preventDefault()
        handleGrade(suggestedGrade != null ? suggestedGrade : 2)
      } else if (e.key === 'r' || e.key === 'R') {
        playAudio()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
    const s = recap
    const didStudy = Boolean(s && s.graded > 0)

    // Word-to-World chat mission offer (snapshotted at completion, above).
    const availableMission = missionOffer ? missionOffer.mission : null
    const accuracy = s && s.reviewedTotal > 0 ? Math.round((s.reviewedRight / s.reviewedTotal) * 100) : null
    const recapStats = s ? [
      { label: 'Cards studied', value: s.graded, color: accentHex },
      { label: 'New learned', value: s.newLearned, color: '#3E63DD' },
      { label: 'To review', value: s.graduated, color: '#2F9E6D' },
    ] : []
    if (accuracy !== null) recapStats.push({ label: 'Accuracy', value: accuracy, suffix: '%', color: '#D97706' })

    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', maxWidth: '520px', textAlign: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '24px', padding: '40px 34px',
            boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
          }}>
            <div style={{
              width: '58px', height: '58px', borderRadius: '18px',
              margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accentHex + '10', border: '1px solid ' + accentHex + '18',
            }}>
              <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>
              {didStudy ? 'Session complete' : 'All done for now'}
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: didStudy ? '26px' : '28px', fontSize: '15px', lineHeight: 1.6 }}>
              {didStudy
                ? 'Nice, steady work. Every review nudges these words further into memory.'
                : isWeak
                  ? 'No weak words to clean up right now — your tricky cards are settling.'
                  : 'No cards are waiting. Come back later, or continue the loop with stories.'}
            </p>

            {didStudy && s.xpEarned > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                margin: '0 auto 20px', padding: '8px 16px', borderRadius: '999px',
                background: '#6E84661A', border: '1px solid #6E846633',
                color: '#5C7155', fontSize: '14px', fontWeight: 750,
              }}>
                <Sparkles size={15} strokeWidth={2} color="#6E8466" />
                +<CountUp value={s.xpEarned} /> XP
              </div>
            )}

            {didStudy && s.leveledTo > 0 && (
              <div style={{
                margin: '0 auto 22px', padding: '16px 18px', borderRadius: '18px',
                background: accentHex + '0D', border: '1px solid ' + accentHex + '2A',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '17px', fontWeight: 850 }}>
                  <TrendingUp size={19} strokeWidth={2.2} color={accentHex} />
                  Level {s.leveledTo} — {levelTitle(s.leveledTo)}
                </div>
                {s.freezesEarned > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#3E63DD', fontSize: '13px', fontWeight: 700 }}>
                    <Snowflake size={15} strokeWidth={2} color="#3E63DD" />
                    +{s.freezesEarned} streak freeze{s.freezesEarned === 1 ? '' : 's'} earned
                  </div>
                )}
                {nextTitle(s.leveledTo) && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Next rank: {nextTitle(s.leveledTo).name} at level {nextTitle(s.leveledTo).min}
                  </div>
                )}
              </div>
            )}

            {didStudy && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: recapStats.length === 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                gap: '10px', marginBottom: '22px',
              }}>
                {recapStats.map(st => (
                  <div key={st.label} style={{
                    padding: '16px 10px', borderRadius: '14px',
                    background: st.color + '0D', border: '1px solid ' + st.color + '22',
                  }}>
                    <div style={{ fontSize: '26px', fontWeight: 760, color: st.color, lineHeight: 1 }}>
                      <CountUp value={st.value} suffix={st.suffix || ''} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>{st.label}</div>
                  </div>
                ))}
              </div>
            )}

            {didStudy && forecast && (forecast.reviews > 0 || forecast.newAvail > 0) && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                marginBottom: '24px', padding: '12px 16px', borderRadius: '14px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: '13px', color: 'var(--text-muted)', flexWrap: 'wrap',
              }}>
                <Sunrise size={16} strokeWidth={1.9} color="#D97706" />
                <span>
                  Tomorrow:&nbsp;
                  <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{forecast.reviews}</strong> review{forecast.reviews === 1 ? '' : 's'}
                  {forecast.newAvail > 0 && (
                    <> + <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{forecast.newAvail}</strong> new</>
                  )}
                  &nbsp;waiting
                </span>
              </div>
            )}

            {availableMission && (
              <button onClick={() => setMission(availableMission)} style={{
                width: '100%', marginBottom: '12px', textAlign: 'left', cursor: 'pointer',
                background: accentHex + '0D', border: '1px solid ' + accentHex + '2A', borderRadius: '18px',
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
              }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accentHex + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageCircleMore size={22} strokeWidth={1.9} color={accentHex} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Use today’s words</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '2px' }}>
                    {availableMission.scenario.en} · ~{availableMission.estimatedTime} min
                  </div>
                </div>
                <ChevronRight size={20} color={accentHex} />
              </button>
            )}

            <PrimaryButton onClick={onBack} icon={ArrowLeft}>
              Back home
            </PrimaryButton>
          </div>
        </div>

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

  function submitTyped() {
    if (!typedValue.trim()) return
    setTypedResult(checkTyped(typedValue, v, isJapanese) ? 'correct' : 'wrong')
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
            {isWeak ? 'Weak word cleanup' : langChars + ' flashcards'}
          </div>
          <h1 style={{ fontSize: '28px', color: 'var(--text)', fontWeight: 780, lineHeight: 1.1 }}>
            {isWeak ? 'Weak words' : 'Study session'}
          </h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 550, marginTop: '5px' }}>
            {systemLabel} · {levelLabel}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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
              flex: 1, display: 'flex', flexDirection: 'column',
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
