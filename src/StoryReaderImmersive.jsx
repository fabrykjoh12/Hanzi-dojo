import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './supabase'
import { isOnline } from './useOnline'
import { enqueueStoryRead } from './syncQueue'
import { ensureAudio } from './audioCache'
import { PrimaryButton, PopoverArrow } from './ui'
import { useAnchoredPopover } from './useAnchoredPopover'
import { getLevelLabel, getAudioUrl, playAudioEl } from './utils'
import { languageTheme } from './languageTheme'
import { cleanMeaning } from './cleanMeaning'
import { wordStatus, todayWordsInStory, calculateStoryReadability, splitSpeaker, JP_PARTICLES, readingVisibleFor, isDueSoon, buildVocabMatcher, isPlaceWord, segmentLine, storyNamesFor, isNameKey, isWordlikeToken } from './storyReading'
import { minDwellMs } from './readAlong'
import { glossaryLookup } from './grammarGlossary'
import { STATUS_COLOR, STATUS_LABEL, lookupKind, lookupChip, lookupLevel, lookupReadingState } from './wordLookup'
import { unknownMarkStyle } from './tokenMark'
import { getDictEntryByWord, addDictEntryToDeck } from './dictSearch'
import { prefsGet, prefsMerge } from './offline'
import { READER_PREFS_KEY, DEFAULT_READING_FONT, normalizeReadingFont, readingFontFromPrefs, readingFontHint, readingFontOptions, readingFontPatch, readingFontStack } from './readingFonts'
import { FIRST_MISSION_READER_HINT, firstMissionCompletion } from './firstMission'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'
import { setFeedbackStory } from './feedbackContext'
import { SHEET_MAX_HEIGHT, sheetSafeBottom } from './sheetLayout'
import { shareReadingCard } from './shareCard'
import { toast } from './toast'
import { BRAND_URL } from './brand'
import { ArrowLeft, Bookmark, Volume2, Play, Pause, Languages, ChevronRight, UserRound, MapPin, Check, X, Sparkles, Home, Sliders, Eye, Clock, Repeat, Lock, Share2, BookOpen } from 'lucide-react'
import ComprehensionCheck from './ComprehensionCheck'
import StoryCover from './StoryCover'
import { RevealEnglishButton } from './ReadingScaffold'
import { loadTtsAudio, utteranceAudio } from './ttsAudio'
import { trapDialogFocus } from './dialogFocus'
import { floatingBottom } from './bottomBar'

// HSKStory-inspired immersion reader for BOTH languages. Light theme. Tap a word
// for a bottom-sheet definition; pinyin (Chinese) / furigana (Japanese) and
// translation toggles; bottom audio bar. Word segmentation uses the browser's
// Intl.Segmenter per locale so you tap whole words, not single characters.

const PANEL = 'var(--surface)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const GOLD = '#B45309'
const HILITE = 'rgba(217, 164, 62, 0.32)'
// Proper nouns (character names + curated place names) get this green text
// color everywhere, so they read as "a name", not vocabulary to learn.
const PROPER_NOUN_COLOR = '#2F9E6D'

const SPEAKER_PALETTE = ['#B83A24', '#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']

// Reference-dictionary fallback for words outside the level's vocabulary.
// CC-CEDICT is Chinese-only, so the lookup is gated on the track's language.
// Module-scoped so re-opening the same word (or the same word in another story
// this session) is instant and costs no round trip; `null` is cached too, so a
// genuine miss isn't retried on every tap. Bounded, since a reading session can
// touch a lot of words and this never gets a chance to be evicted otherwise.
const DICT_CACHE = new Map()
const DICT_CACHE_MAX = 400
function dictCacheSet(word, entry) {
  if (DICT_CACHE.size >= DICT_CACHE_MAX) DICT_CACHE.delete(DICT_CACHE.keys().next().value)
  DICT_CACHE.set(word, entry)
}

// Durable reader preferences (furigana mode, Learning Lens, reading font).
// Stored in the prefs store — under READER_PREFS_KEY, the same record every
// other reader and the flashcard read — so a reader's chosen scaffolding
// survives reloads without a round-trip to the server. Default: scaffold only
// unknown words, lens off — the page reads like a book until the learner asks
// for more help. Sentence translation is NOT a durable preference: each line
// has its own eye icon (see RevealEnglishButton) so it's a per-sentence,
// per-session choice. The reading-font stacks live in readingFonts.js.
const DEFAULT_PREFS = { furiganaMode: 'unknown', lens: false, seenFocusHint: false }

const FURIGANA_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'learning', label: 'Learning' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'hidden', label: 'Off' },
]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Single-kana grammatical particles. They collide with homograph nouns stored in
// kana (は = topic marker 'wa' vs 歯 'teeth'), so exclude them from word lookup —
// in a sentence they're almost always the particle, not the noun.
const NO_PARTICLES = new Set()

// STATUS_COLOR / STATUS_LABEL are shared with the paged reader's lookup sheet
// (wordLookup.js), so the two sheets can never disagree about what a status
// looks like or is called.

// ── Japanese furigana helpers (reading only over kanji) ─────────────────────
function hasKanji(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9FFF) return true
  }
  return false
}
function isKana(c) { return c >= 0x3040 && c <= 0x30FF }
function furiganaParts(word, reading) {
  const w = word || ''
  const r = reading || ''
  if (!w || !r) return null
  let wS = 0, rS = 0
  while (wS < w.length && rS < r.length && isKana(w.charCodeAt(wS)) && w[wS] === r[rS]) { wS += 1; rS += 1 }
  let wE = w.length, rE = r.length
  while (wE > wS && rE > rS && isKana(w.charCodeAt(wE - 1)) && w[wE - 1] === r[rE - 1]) { wE -= 1; rE -= 1 }
  const core = w.slice(wS, wE)
  const coreReading = r.slice(rS, rE)
  if (!core || !coreReading || !hasKanji(core)) return null
  return { lead: w.slice(0, wS), core, coreReading, trail: w.slice(wE) }
}

function audioUrlFor(path) {
  if (!path) return null
  const { data } = supabase.storage.from('audio').getPublicUrl(path)
  return (data && data.publicUrl) || null
}

function makeSegmenter(locale) {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return new Intl.Segmenter(locale, { granularity: 'word' })
    }
  } catch { /* not supported */ }
  return null
}

// splitSpeaker + matchName + segmentLine now live in ./storyReading (shared with
// the paced/chat/scene readers and with the recap's readability, so counting and
// rendering strip labels / skip names / split unmatched text identically).

// Furigana over a token. Kept as a small pure helper so both real vocab (kanji
// core only) and name/kana readings render consistently, at a legible size.
function rubyFor(text, reading, isJapanese) {
  const rt = (r) => <rt style={{ fontSize: '0.56em', color: GOLD, fontWeight: 500, letterSpacing: '0.02em' }}>{r}</rt>
  if (isJapanese) {
    const fp = furiganaParts(text, reading)
    if (fp) return <>{fp.lead}<ruby>{fp.core}{rt(fp.coreReading)}</ruby>{fp.trail}</>
    return <ruby>{text}{rt(reading)}</ruby>
  }
  return <ruby>{text}{rt(reading)}</ruby>
}

function Token({ token, isSelected, furiganaMode, reserveRuby, isJapanese, lens, status, today, accent, isPlace, language, onSelect }) {
  const [hover, setHover] = useState(false)
  const reading = token.vocab ? token.vocab.reading : (token.name ? token.name.reading : null)
  // Vocabulary and names carry data; plain word-like tokens are still tappable
  // (hear them / see the sentence). Only punctuation and whitespace are inert.
  const clickable = Boolean(token.vocab || token.name) || isWordlikeToken(token.text)
  if (!clickable) {
    // Reserve an empty furigana row so punctuation sits on the same baseline as
    // neighboring words that carry a reading (no vertical jitter).
    if (reserveRuby) return <ruby>{token.text}<rt>&nbsp;</rt></ruby>
    return <span>{token.text}</span>
  }

  // Furigana visibility is decided per word from the chosen mode and this word's
  // learning status (shared, tested rule) — so "Unknown" scaffolds only new
  // words, "Learning" only in-progress ones, etc. Names carry no card → treated
  // as not_started, so they read as "unknown" words. Japanese tokens without
  // kanji never show furigana — kana above identical kana is pure noise.
  const showReading = readingVisibleFor(furiganaMode, status) && Boolean(reading)
    && !(isJapanese && !hasKanji(token.text))

  // Learning Lens: quiet the words you know and spotlight the frontier. Today's
  // words get the strongest, always-on cue (solid underline + tint + weight) so
  // the study→read thread is visible without relying on color alone.
  let decoBorder = 'none'
  let decoBg = 'transparent'
  let faded = false
  // Always surface words you don't know yet (new vocab) with a light dotted
  // underline, so unknown words stand out even with the Learning Lens off. The
  // Lens (below) upgrades this to a full box and additionally fades known words.
  if (token.vocab && status === 'not_started') {
    decoBorder = '2px dotted ' + accent + '99'
    decoBg = accent + '0A'
  }
  if (lens && token.vocab) {
    if (status === 'not_started') { decoBorder = '2px solid ' + accent + '70'; decoBg = accent + '12' }
    else if (status === 'learning') { decoBorder = '2px solid #CA8A0466' }
    else { faded = true }   // review / mastered → learned, so fade it back
  }
  if (today && token.vocab) {
    decoBorder = '2px solid ' + accent
    decoBg = accent + '18'
    faded = false
  }
  // A word outside the vocabulary list altogether — not a name, not grammar
  // glue. It never had a cue before, so it looked exactly like a word the
  // learner was supposed to know. The mark says "this one isn't on your list",
  // which is a different message from "this one is next", so it is deliberately
  // NOT the accent (tokenMark.js). The Lens owns the vocabulary marks only: an
  // out-of-list word is neither known nor next, so it neither boxes nor fades.
  const unknown = unknownMarkStyle(token, language)
  if (unknown) {
    decoBorder = unknown.borderBottom
    decoBg = unknown.background
  }

  let body = token.text
  if (showReading) {
    body = rubyFor(token.text, reading, isJapanese)
  } else if (reserveRuby) {
    // No reading shown for this word, but the line reserves furigana space — keep
    // an empty row so its baseline lines up with words that do show a reading.
    body = <ruby>{token.text}<rt>&nbsp;</rt></ruby>
  }
  // Character names and curated place names get the same green text color, so
  // a proper noun reads as "a name", not a word to learn — on top of, not
  // instead of, its normal vocab/learning decoration.
  const isProperNoun = Boolean(token.name) || isPlace
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onSelect(e.currentTarget) }}
      // Keyboard parity for the reader's core interaction (the ManhuaBubble
      // pattern): every word is a real button, Enter/Space looks it up.
      role="button"
      tabIndex={0}
      aria-label={token.text}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(e.currentTarget) }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', borderRadius: '5px', padding: '0 1px',
        color: isProperNoun ? PROPER_NOUN_COLOR : 'inherit',
        background: isSelected ? HILITE : (hover ? 'rgba(0,0,0,0.05)' : decoBg),
        boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.45)' : 'none',
        borderBottom: decoBorder,
        fontWeight: today && token.vocab ? 600 : 'inherit',
        opacity: faded && !hover && !isSelected ? 0.4 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
    >
      {body}
    </span>
  )
}

export default function StoryReaderImmersive({ story, vocabMap, userCards, setUserCards, session, track, onBack, onHome, nextStory, nextChapter = null, onStudy = null, nextTierUnlock = null, onNextStory, isRead, onMarkRead, todayWords = [], firstMission = false, onPickReaderMode }) {
  const [selected, setSelected] = useState(null)
  // Reference-dictionary lookup for a tapped word that isn't in the level's
  // vocabulary and isn't a grammar fragment. Results live in DICT_CACHE; this
  // counter just re-renders the sheet once a fetch lands.
  const [dictTick, setDictTick] = useState(0)
  const [dictSaved, setDictSaved] = useState(() => new Set())
  const [dictSaving, setDictSaving] = useState(false)
  const [furiganaMode, setFuriganaMode] = useState(DEFAULT_PREFS.furiganaMode)
  const [lens, setLens] = useState(DEFAULT_PREFS.lens)
  // Per-line reveal: which line indices currently show their English
  // translation, via the eye icon beside each sentence — not a durable,
  // all-or-nothing preference.
  const [revealedLines, setRevealedLines] = useState(() => new Set())
  const toggleLineEnglish = (li) => setRevealedLines(prev => {
    const next = new Set(prev)
    if (next.has(li)) next.delete(li); else next.add(li)
    return next
  })
  const [readingFontChoice, setReadingFontChoice] = useState(DEFAULT_READING_FONT)
  const [seenFocusHint, setSeenFocusHint] = useState(DEFAULT_PREFS.seenFocusHint)
  const [showSentence, setShowSentence] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusedLine, setFocusedLine] = useState(null)   // sentence-focus: dim the rest
  const [speaking, setSpeaking] = useState(false)
  const [speakingLine, setSpeakingLine] = useState(-1)   // which line the TTS is reading (for read-along highlight)
  const [rate, setRate] = useState(0.85)                 // TTS playback rate
  const rateRef = useRef(0.85)
  const runRef = useRef(0)                               // invalidates stale onend callbacks when we stop/restart
  const speakingLineRef = useRef(-1)
  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})   // question id → chosen option index
  const [utteranceIds, setUtteranceIds] = useState({})
  const [adding, setAdding] = useState(false)
  const wordAudioRef = useRef(null)
  const storyAudioRef = useRef(null)
  const settingsAnchorRef = useRef(null)
  // Read-along auto-scroll: one ref per rendered line so the line being spoken
  // can be scrolled into view; suspended once the reader scrolls by hand.
  const lineRefs = useRef([])
  const autoScrollSuspendedRef = useRef(false)
  // Reading-pace floor timer for the speechSynthesis fallback (some platforms
  // fire `onend` instantly, which would otherwise race the read-along past).
  const synthTimerRef = useRef(null)

  const theme = languageTheme(track.language)
  const isJapanese = track.language === 'japanese'
  const isChinese = track.language === 'chinese'
  const accent = theme.accentHex
  const font = theme.font
  // Reading-column font: whichever face the learner picked (readingFonts.js owns
  // the stacks and which languages offer what). No web font is loaded either way.
  const readingFont = readingFontStack(track.language, readingFontChoice)
  const pickReadingFont = (value) => setReadingFontChoice(normalizeReadingFont(track.language, value))
  // Curated names PLUS the cast this story declares in its own speaker labels,
  // so a name nobody curated still reads (and taps) as a name.
  const names = useMemo(
    () => storyNamesFor(story.content, vocabMap, track.language),
    [story.content, vocabMap, track.language])
  const particles = isJapanese ? JP_PARTICLES : NO_PARTICLES
  const watermark = isJapanese ? ['読', '書'] : isChinese ? ['读', '书'] : ['А', 'Я']
  const readingLabel = isJapanese ? 'Furigana' : isChinese ? 'Pinyin' : 'Reading'
  const levelLabel = getLevelLabel(track.language, track.system, track.current_level)

  const segLocale = isJapanese ? 'ja' : isChinese ? 'zh' : 'ru'
  // Memoized (once per locale) instead of a lazily-initialized ref, so no ref
  // is read/written during render. Same instance reused across renders.
  const segmenter = useMemo(() => makeSegmenter(segLocale), [segLocale])

  useEffect(() => {
    function onResize() { setWinWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Restore saved reader preferences once on mount, then persist any change.
  // `prefsReady` gates the save effect so the initial restore doesn't immediately
  // re-write defaults over what we just loaded. Degrades to defaults if the prefs
  // store is unavailable (never blocks reading).
  const prefsReady = useRef(false)
  useEffect(() => {
    let live = true
    prefsGet(READER_PREFS_KEY).then((saved) => {
      if (live && saved && typeof saved === 'object') {
        if (FURIGANA_OPTIONS.some(o => o.value === saved.furiganaMode)) setFuriganaMode(saved.furiganaMode)
        if (typeof saved.lens === 'boolean') setLens(saved.lens)
        if (typeof saved.seenFocusHint === 'boolean') setSeenFocusHint(saved.seenFocusHint)
      }
      // Also migrates the legacy `serif: true` flag, so anyone who had turned
      // serif on lands on Serif rather than being reset to Sans.
      if (live) setReadingFontChoice(readingFontFromPrefs(saved, track.language))
    }).finally(() => { prefsReady.current = true })
    return () => { live = false }
  }, [track.language])
  // prefsMerge, not prefsSet: the paged/chat readers keep their reading mode and
  // playback rate in this same record, and a whole-object write would erase them.
  useEffect(() => {
    if (!prefsReady.current) return
    prefsMerge(READER_PREFS_KEY, {
      furiganaMode, lens, seenFocusHint,
      ...readingFontPatch(track.language, readingFontChoice),
    })
  }, [furiganaMode, lens, readingFontChoice, seenFocusHint, track.language])

  // Close the desktop settings popover on an outside click (the mobile sheet has
  // its own tap-to-close scrim, so this only matters on desktop).
  useEffect(() => {
    if (!settingsOpen) return undefined
    const onDown = (e) => {
      if (settingsAnchorRef.current && !settingsAnchorRef.current.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [settingsOpen])

  useEffect(() => () => {
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
    if (synthTimerRef.current) { clearTimeout(synthTimerRef.current); synthTimerRef.current = null }
    if (storyAudioRef.current) storyAudioRef.current.pause()
  }, [])

  // Load end-of-story comprehension questions (no-op until content is generated).
  useEffect(() => {
    let active = true
    // Intentional: the reader stays mounted while `story.id` changes (Next
    // story swaps in place), so the previous story's answers/questions must be
    // cleared here before the new ones load — otherwise stale Q&A would flash.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAnswers({})
    setQuestions([])
    setUtteranceIds({})
    /* eslint-enable react-hooks/set-state-in-effect */
    supabase.from('story_questions').select('*').eq('story_id', story.id).order('question_number', { ascending: true })
      .then(({ data }) => { if (active) setQuestions(data || []) })
    supabase.from('story_utterances').select('id, utterance_index').eq('story_id', story.id)
      .then(async ({ data }) => {
        if (!active || !data?.length) return
        const byIndex = {}
        data.forEach(row => { byIndex[row.utterance_index] = row.id })
        await loadTtsAudio('story_utterance', data.map(row => row.id))
        if (active) setUtteranceIds(byIndex)
      })
      .catch(() => {})
    return () => { active = false }
  }, [story.id])

  const isMobile = winWidth < 760
  const lines = story.content.split('\n').filter(Boolean)
  const englishLines = (story.english_content || '').split('\n').filter(Boolean)

  // Segmenting the whole story is the expensive part of this screen; memoize it
  // so toggles/sheet interactions don't re-run Intl.Segmenter over every line.
  // `names`/`particles` derive from track.language, so it stands in for both.
  const { parsed, speakerColors } = useMemo(() => {
    const matcher = buildVocabMatcher(vocabMap, track.language)
    const storyLines = story.content.split('\n').filter(Boolean)
    const colors = {}
    const parsedLines = storyLines.map(line => {
      const { speaker, text } = splitSpeaker(line)
      if (speaker && colors[speaker] === undefined) {
        // Nth distinct speaker → palette[N]; N = speakers already assigned.
        colors[speaker] = SPEAKER_PALETTE[Object.keys(colors).length % SPEAKER_PALETTE.length]
      }
      return { speaker, tokens: segmentLine(text, matcher, names, particles, segmenter) }
    })
    return { parsed: parsedLines, speakerColors: colors }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.content, vocabMap, track.language])

  // Word-coverage stats over the unique vocabulary that appears in this story.
  // Recomputes only when the parse or the user's card map changes.
  // Canonical readability (storyReading.js) — the SAME computation the recap
  // ranks with, so the "% known" here matches the recap exactly. It re-parses
  // the story text with the identical name/particle/speaker rules `parsed` uses
  // for rendering, so the panel number always agrees with the highlighted words.
  const { totalUnique, knownCount, learningCount, newCount, knownPct, newWords, storyWords, counts } = useMemo(
    () => calculateStoryReadability({ content: story.content, vocabMap, cards: userCards, language: track.language }),
    [story.content, vocabMap, userCards, track.language]
  )

  // Furigana space is reserved on every line while any mode other than "Off" is
  // active, so readings appearing/disappearing per word never shift the baseline.
  const reserveRuby = furiganaMode !== 'hidden'
  const reduceMotion = useMemo(() => prefersReducedMotion(), [])

  // Read-along auto-scroll: keep the line being spoken in view. Runs only while
  // playing and only until the reader takes over by hand (a wheel or touch
  // gesture suspends it — see below — so following never fights a manual scroll).
  useEffect(() => {
    if (!speaking || speakingLine < 0) return
    if (autoScrollSuspendedRef.current) return
    const el = lineRefs.current[speakingLine]
    if (!el || typeof el.scrollIntoView !== 'function') return
    try {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    } catch {
      el.scrollIntoView()
    }
  }, [speakingLine, speaking, reduceMotion])

  // A hand-scroll while narration plays hands control to the reader: suspend
  // auto-scroll until the next play. Listening for wheel/touch (direct gestures)
  // rather than 'scroll' avoids mistaking our own smooth scroll for user intent.
  useEffect(() => {
    if (!speaking) return undefined
    const onManual = () => { autoScrollSuspendedRef.current = true }
    window.addEventListener('wheel', onManual, { passive: true })
    window.addEventListener('touchmove', onManual, { passive: true })
    return () => {
      window.removeEventListener('wheel', onManual)
      window.removeEventListener('touchmove', onManual)
    }
  }, [speaking])

  // Which of today's studied words appear in this story — the "3 words from
  // today appear here" thread that connects the study session to this reading.
  const todaySet = useMemo(() => new Set(todayWords || []), [todayWords])
  const todayInStory = useMemo(() => todayWordsInStory(storyWords, todayWords), [storyWords, todayWords])

  // Analytics: story opened (once per story). Fires with the current readability
  // so drop-off vs. difficulty is analyzable. Intentionally keyed on story.id.
  // The same mount registers the story as feedback context, so a report sent
  // mid-read names this story.
  useEffect(() => {
    trackEvent(EVENTS.STORY_OPENED, { tier: story.tier, known_pct: knownPct, story_id: story.id })
    if (firstMission) trackOnce(EVENTS.FIRST_STORY_OPENED, { known_pct: knownPct })
    setFeedbackStory({ id: story.id, title: story.title })
    return () => setFeedbackStory(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id])

  // Finishing a story records it (story_reads) — reading is half the method,
  // it should count for something.
  const [finishing, setFinishing] = useState(false)
  const finishStory = async () => {
    if (finishing || isRead) return
    setFinishing(true)
    if (isOnline()) {
      const { error } = await supabase
        .from('story_reads')
        .upsert({ user_id: session.user.id, story_id: story.id })
      if (!error) {
        if (onMarkRead) onMarkRead(story.id)
      }
    } else {
      // Offline: queue the read; it lands when the outbox flushes.
      await enqueueStoryRead({ userId: session.user.id, storyId: story.id })
      if (onMarkRead) onMarkRead(story.id)
    }
    trackEvent(EVENTS.STORY_COMPLETED, { tier: story.tier, known_pct: knownPct, story_id: story.id })
    if (firstMission) trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct: knownPct })
    setFinishing(false)
  }

  // Share a "% known" recap card for this story. Best-effort: native share with
  // the generated image where supported, otherwise a downloaded PNG + copied
  // caption. Feedback via a toast so the desktop (non-native-share) path isn't
  // silent.
  const [sharing, setSharing] = useState(false)
  const onShare = async () => {
    if (sharing) return
    setSharing(true)
    const res = await shareReadingCard({
      knownPct,
      languageName: theme.languageName,
      storyTitle: story.title,
      accentHex: accent,
      langFont: font,
      url: BRAND_URL + '/read/' + story.id,
    })
    setSharing(false)
    trackEvent(EVENTS.STORY_SHARED, { known_pct: knownPct, method: res.method })
    if (res.method === 'downloaded') toast({ title: 'Card saved', body: 'Image downloaded + caption copied', accent })
    else if (res.method === 'copied') toast({ title: 'Caption copied to clipboard', accent })
    else if (res.method === 'failed') toast({ title: 'Couldn’t open the share sheet', accent })
  }

  const addAllNewWords = async () => {
    if (adding || newWords.length === 0) return
    setAdding(true)
    const rows = newWords.map(v => ({
      user_id: session.user.id, vocab_id: v.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('cards').insert(rows)
    if (!error) {
      setUserCards(prev => {
        const nx = { ...prev }
        newWords.forEach(v => { nx[v.id] = { vocab_id: v.id, is_easy: false, state: 'new' } })
        return nx
      })
    }
    setAdding(false)
  }

  const addToDeck = async (vocabItem) => {
    // Remember the exact line the word was tapped on (sel.lineIndex), so review
    // can show the sentence the learner actually read — plus this story's
    // title and that line's English, for the "FROM <title>" attribution.
    const onTappedLine = sel && sel.vocab && sel.vocab.id === vocabItem.id && sel.lineIndex != null
    const srcSentence = (onTappedLine && lines[sel.lineIndex]) ? splitSpeaker(lines[sel.lineIndex]).text : null
    const srcTranslation = (onTappedLine && englishLines[sel.lineIndex]) ? splitSpeaker(englishLines[sel.lineIndex]).text : null
    const row = {
      user_id: session.user.id,
      vocab_id: vocabItem.id,
      state: 'new',
      ease_factor: 2.5,
      learning_step: 0,
      due_at: new Date().toISOString(),
      source_sentence: srcSentence,
      source_story_id: story.id || null,
      source_story_title: story.title || null,
      source_translation: srcTranslation,
    }
    let { error } = await supabase.from('cards').insert(row)
    // Degrade gracefully if either source_sentence's migration or this one
    // (source_story_id/title/translation) isn't applied yet — same one-retry
    // shape this already used for source_sentence.
    if (error && /source_sentence|source_story_id|source_story_title|source_translation/.test(error.message || '')) {
      const { source_sentence, source_story_id, source_story_title, source_translation, ...rest } = row
      void source_sentence, source_story_id, source_story_title, source_translation
      ;({ error } = await supabase.from('cards').insert(rest))
    }
    if (!error) {
      setUserCards(prev => ({ ...prev, [vocabItem.id]: { vocab_id: vocabItem.id, is_easy: false, state: 'new' } }))
    }
  }

  const playWord = (path) => {
    const url = audioUrlFor(path)
    if (!url) return
    if (!wordAudioRef.current) wordAudioRef.current = new Audio()
    playAudioEl(wordAudioRef.current, url, () => { /* ignore */ })
  }

  // Warm the tapped word's audio as soon as the lookup sheet opens, so the play
  // button in it works offline (iOS can't fetch/await audio inside the gesture).
  useEffect(() => {
    if (selected && selected.vocab && selected.vocab.audio_path) {
      ensureAudio(audioUrlFor(selected.vocab.audio_path))
    }
  }, [selected])

  // Pronounce an arbitrary word (grammar / out-of-list) that has no recorded
  // vocabulary audio, via the browser's speech synthesis. Cancels any in-flight
  // read-along so the single word is heard clearly.
  const speakWord = (text) => {
    if (!text) return
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      runRef.current += 1
      synth.cancel()
      if (storyAudioRef.current) storyAudioRef.current.pause()
      setSpeaking(false); setSpeakingLine(-1); speakingLineRef.current = -1
      const u = new SpeechSynthesisUtterance(text)
      u.lang = ttsLang
      u.rate = 0.9
      synth.speak(u)
    } catch { /* not available */ }
  }

  // Read the story aloud line-by-line so the sentence currently being spoken can
  // be highlighted (read-along). Per-word boundary events are unreliable for
  // CJK, so line granularity is the robust choice. `runRef` tags each playback
  // so a stopped/restarted read ignores callbacks from the previous one.
  //
  // Real narration (Google TTS, same pipeline as vocabulary audio) is used
  // whenever the story has it — `story.has_audio` is only set once every line
  // synthesized successfully, so there's no per-line network probe needed.
  // Everything else falls straight back to the browser's speechSynthesis,
  // unchanged from before.
  const RATES = [0.6, 0.85, 1.1]
  const ttsLang = isJapanese ? 'ja-JP' : isChinese ? 'zh-CN' : 'ru-RU'

  const speakLineViaSynth = (index, runId) => {
    const synth = window.speechSynthesis
    if (!synth) { setSpeaking(false); setSpeakingLine(-1); speakingLineRef.current = -1; return }
    if (synthTimerRef.current) { clearTimeout(synthTimerRef.current); synthTimerRef.current = null }
    // Advance only when the utterance has ended AND a reading-pace floor has
    // elapsed — whichever is later. Platforms that fire `onend` instantly (no
    // voice for the locale, muted) would otherwise race the highlight past every
    // line in a second; the floor keeps each line up long enough to read.
    let floorDone = false
    let speechDone = false
    const advance = () => { if (floorDone && speechDone && runId === runRef.current) speakFrom(index + 1, runId) }
    const floorMs = minDwellMs((parsed[index] && parsed[index].tokens) || [], rateRef.current)
    synthTimerRef.current = setTimeout(() => { floorDone = true; advance() }, floorMs)
    const u = new SpeechSynthesisUtterance(splitSpeaker(lines[index]).text)
    u.lang = ttsLang
    u.rate = rateRef.current
    u.onend = () => { speechDone = true; advance() }
    u.onerror = () => { speechDone = true; advance() }
    synth.speak(u)
  }

  const speakFrom = (index, runId) => {
    if (runId !== runRef.current) return
    if (synthTimerRef.current) { clearTimeout(synthTimerRef.current); synthTimerRef.current = null }
    if (index >= lines.length) { setSpeaking(false); setSpeakingLine(-1); speakingLineRef.current = -1; return }
    setSpeakingLine(index)
    speakingLineRef.current = index

    const utteranceId = utteranceIds[index]
    const generatedUrl = utteranceId ? utteranceAudio(utteranceId).utterance : null
    if (generatedUrl || story.has_audio) {
      const url = generatedUrl || getAudioUrl('stories/' + story.id + '/' + index + '.mp3')
      if (!storyAudioRef.current) storyAudioRef.current = new Audio()
      const el = storyAudioRef.current
      el.playbackRate = rateRef.current
      el.onended = () => { if (runId === runRef.current) speakFrom(index + 1, runId) }
      playAudioEl(el, url, () => { if (runId === runRef.current) speakLineViaSynth(index, runId) })
      return
    }
    speakLineViaSynth(index, runId)
  }

  const cancelSynth = () => { try { window.speechSynthesis.cancel() } catch { /* not available */ } }

  const toggleStoryAudio = () => {
    if (speaking) {
      runRef.current += 1
      cancelSynth()
      if (synthTimerRef.current) { clearTimeout(synthTimerRef.current); synthTimerRef.current = null }
      if (storyAudioRef.current) storyAudioRef.current.pause()
      setSpeaking(false)
      setSpeakingLine(-1)
      speakingLineRef.current = -1
      return
    }
    runRef.current += 1
    const runId = runRef.current
    cancelSynth()
    // A fresh play re-enables read-along auto-scroll; any earlier hand-scroll
    // that suspended it no longer applies.
    autoScrollSuspendedRef.current = false
    setSpeaking(true)
    speakFrom(0, runId)
  }

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rateRef.current) + 1) % RATES.length]
    rateRef.current = next
    setRate(next)
    // If a read is in progress, restart the current line at the new speed.
    if (speaking) {
      runRef.current += 1
      const runId = runRef.current
      cancelSynth()
      if (storyAudioRef.current) storyAudioRef.current.pause()
      speakFrom(Math.max(0, speakingLineRef.current), runId)
    }
  }

  // The sentence-focus tip retires itself the moment the gesture is discovered
  // (a word tap or a line tap both focus a line) or is dismissed by the ✕.
  const dismissFocusHint = () => setSeenFocusHint(prev => (prev ? prev : true))

  // `anchorEl` is the word element that was tapped. It rides along on the
  // selection so the lookup can be drawn directly above that word rather than
  // pinned to the bottom of a screen the learner isn't looking at — the same
  // treatment the paced/chat/scene readers get, through anchoredPopover.js.
  const selectToken = (lineIndex, tokenKey, token, anchorEl) => {
    setShowSentence(false)
    setFocusedLine(lineIndex)   // tapping a word also focuses its sentence
    dismissFocusHint()
    setSelected({ lineIndex, tokenKey, vocab: token.vocab || null, name: token.name || null, text: token.text, anchorEl: anchorEl || null })
  }

  // Sentence focus: tapping a line's whitespace (not a word) fades the rest of
  // the story so the current sentence carries the eye — tap it again to release.
  const toggleFocus = (lineIndex) => {
    dismissFocusHint()
    setFocusedLine(prev => (prev === lineIndex ? null : lineIndex))
  }
  const clearReading = () => { setSelected(null); setFocusedLine(null) }

  const sel = selected
  // The lookup follows the word instead of living at the bottom of the screen.
  // This reader is one long scrolling column, so re-placing on scroll is what
  // keeps the box on its word — and dropping it once the word has scrolled away
  // is why the hook gets `clearReading`. anchoredPopover.js owns the geometry;
  // when a definition can't be given a readable box on either side of the word,
  // `mode` comes back 'sheet' and this falls back to the bottom sheet below.
  const { ref: popRef, mode: popMode, place: popPlace } = useAnchoredPopover(sel ? sel.anchorEl : null, clearReading)

  // Escape dismisses the lookup, then the settings sheet — keyboard parity
  // with the backdrop tap, matching useStoryReaderCore's readers. This
  // component doesn't use that hook, so it needs its own listener.
  useEffect(() => {
    if (!sel && !settingsOpen) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (sel) clearReading()
      else setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(sel), settingsOpen])
  const anchored = Boolean(sel) && popMode !== 'sheet'

  // Dialog focus, the WordLookupSheet pattern (see dialogFocus.js): remember the
  // word that opened the lookup, move focus into the box — on VoiceOver the
  // definition is otherwise never announced at all, because focus stays on the
  // token — and hand focus back when it closes.
  //
  // Waiting for `lookupPlaced` matters: the anchored popover is painted
  // `visibility: hidden` for the one pass it takes to measure itself, and a
  // hidden element cannot take focus, so focusing before then is a silent no-op.
  const lookupBoxRef = useRef(null)
  const lookupOpenerRef = useRef(null)
  const lookupPlaced = !anchored || Boolean(popPlace)
  useEffect(() => {
    if (!sel || !lookupPlaced) return undefined
    lookupOpenerRef.current = document.activeElement
    if (lookupBoxRef.current) lookupBoxRef.current.focus({ preventScroll: true })
    return () => {
      if (lookupOpenerRef.current && lookupOpenerRef.current.focus) {
        lookupOpenerRef.current.focus({ preventScroll: true })
      }
    }
  }, [sel, lookupPlaced])

  // Same for the settings sheet. It already declared `aria-modal`, which hides
  // the whole page from assistive tech — with focus left outside it, that made
  // the reader unusable rather than more usable.
  const settingsSheetRef = useRef(null)
  const settingsOpenerRef = useRef(null)
  useEffect(() => {
    // Mobile only: the desktop popover isn't modal and closes on any outside
    // click, so pulling focus back to the toggle there would be a focus steal.
    if (!settingsOpen || !isMobile) return undefined
    settingsOpenerRef.current = document.activeElement
    if (settingsSheetRef.current) settingsSheetRef.current.focus({ preventScroll: true })
    return () => {
      if (settingsOpenerRef.current && settingsOpenerRef.current.focus) {
        settingsOpenerRef.current.focus({ preventScroll: true })
      }
    }
  }, [settingsOpen, isMobile])

  const isName = Boolean(sel && sel.name)
  const isSelPlace = Boolean(sel && sel.vocab && isPlaceWord(sel.vocab.word, track.language))
  const isPlain = Boolean(sel && !sel.vocab && !sel.name)   // tapped a grammar / out-of-list word
  const selWord = sel ? (isName ? sel.name.word : (sel.vocab ? sel.vocab.word : sel.text)) : ''
  const selStatus = sel && sel.vocab ? wordStatus(sel.vocab.id, userCards) : 'not_started'
  // Built-in grammar glossary: a plain tap on a particle / copula / conjugation
  // fragment gets a real explanation instead of the generic fallback line.
  const selGrammar = isPlain ? glossaryLookup(track.language, sel.text) : null
  const selInDeck = sel && sel.vocab ? Boolean(userCards[sel.vocab.id]) : false
  // This sheet is the classic reader's own, but the *decisions* it makes are the
  // shared, tested ones (wordLookup.js) — the same chip, the same level, the
  // same reading rule as the paged/chat/scene sheet, so the two can't drift.
  // `word` is what those helpers key on; this reader tracks it as `text`.
  const selForLookup = sel ? { ...sel, word: selWord } : null
  const selKind = selForLookup ? lookupKind(selForLookup, track.language) : null
  const selChip = lookupChip(selKind, { grammar: selGrammar })
  const selLevel = lookupLevel(selForLookup, selKind, track.language)

  // Look the word up in the reference dictionary when nothing else explains it:
  // not vocabulary, not a name, not a grammar fragment. This is what turns "a
  // word beyond this level's list" into a real definition, which in turn is what
  // lets a story reach for a vivid word without creating a dead end.
  //
  // Deliberately does NOT feed readability or word status — a dictionary word is
  // still an unknown word, and "% known" must keep counting only the level's
  // vocabulary.
  const dictWord = isPlain && !selGrammar && track.language === 'chinese' ? sel.text : null
  // The cache IS the store: a resolved word renders straight out of it, and the
  // fetch only bumps `dictTick` to re-render. That keeps setState out of the
  // effect body (no cascading renders) and means re-tapping a word already
  // looked up this session paints instantly, with no loading flash.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dictTick is the cache-write signal, by design
  const dictEntry = useMemo(() => (dictWord ? DICT_CACHE.get(dictWord) || null : null), [dictWord, dictTick])
  const dictResolved = Boolean(dictWord) && DICT_CACHE.has(dictWord)
  // Offline (or a reader opened from the offline snapshot) shows the existing
  // fallback copy rather than spinning on a request that can't succeed.
  const dictLoading = Boolean(dictWord) && !dictResolved && isOnline()
  useEffect(() => {
    if (!dictWord || DICT_CACHE.has(dictWord) || !isOnline()) return
    let cancelled = false
    getDictEntryByWord(supabase, dictWord)
      .then(entry => { dictCacheSet(dictWord, entry || null) })
      .catch(() => { dictCacheSet(dictWord, null) })
      .finally(() => { if (!cancelled) setDictTick(t => t + 1) })
    return () => { cancelled = true }
  }, [dictWord])

  const dictDefs = dictEntry && Array.isArray(dictEntry.definitions) ? dictEntry.definitions : []
  const dictInDeck = Boolean(dictEntry && dictSaved.has(dictEntry.id))

  // Saving a dictionary word goes through the same RPC the Dictionary screen
  // uses: it creates (or reuses) a level-less vocabulary row for the track and
  // inserts the card. Those rows carry no recorded audio, so the flashcard falls
  // back to speech synthesis — expected, not a failure.
  const addDictToDeck = async () => {
    if (!dictEntry || dictInDeck || dictSaving) return
    setDictSaving(true)
    try {
      await addDictEntryToDeck(supabase, dictEntry.id, track.language, track.system)
      setDictSaved(prev => new Set(prev).add(dictEntry.id))
      toast({ title: 'Saved to your deck', body: dictEntry.simplified, accent })
    } catch {
      toast({ title: 'Couldn’t save that word', accent })
    } finally {
      setDictSaving(false)
    }
  }
  // Context chips in the lookup sheet, all from data already in memory (no query):
  // how often the word appears here, whether it was studied today, and whether a
  // review is coming up soon.
  const selCount = sel && sel.vocab ? (counts.get(sel.vocab.word) || 0) : 0
  const selCard = sel && sel.vocab ? userCards[sel.vocab.id] : null
  const selDueSoon = Boolean(selCard && selStatus !== 'not_started' && isDueSoon(selCard.due_at))
  // The dock is hidden while reading (navFocus), so the audio bar hugs the
  // bottom edge on the shared contract's focused value instead of reserving
  // room for a bar that is not there.
  const bottomOffset = isMobile ? floatingBottom(false) : '0px'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: TEXT, position: 'relative', overflow: 'hidden' }}>
      {!isMobile && (
        <>
          <span style={watermarkStyle('left', font)}>{watermark[0]}</span>
          <span style={watermarkStyle('right', font)}>{watermark[1]}</span>
        </>
      )}

      {/* Top bar — z-index above the reading column so the desktop settings
          popover (a descendant) is never painted under the story text. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: isMobile ? '16px 16px 6px' : '22px 28px 8px',
        maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 26,
      }}>
        <button onClick={onBack} style={ghostBtn} aria-label="Back to stories">
          <ArrowLeft size={18} strokeWidth={2} color={MUTED} />
          {!isMobile && <span style={{ color: MUTED, fontSize: '14px', fontWeight: 600 }}>Library</span>}
        </button>
        {/* Title/level live in the chapter header just below — keeping them out
            of the top bar removes the duplicate labels and calms the masthead. */}
        <div style={{ flex: 1 }} />
        <div ref={settingsAnchorRef} style={{ display: 'flex', gap: '6px', position: 'relative' }}>
          {/* Equal-weight switch back to the paged reader (only for paced stories). */}
          {onPickReaderMode && (!story.presentation || story.presentation === 'paced') && (
            <TopToggle active={false} onClick={() => onPickReaderMode('paced')} icon={BookOpen} label={isMobile ? '' : 'Paged'} accent={accent} isMobile={isMobile} aria-label="Switch to paged reading" />
          )}
          <TopToggle active={lens} onClick={() => setLens(v => !v)} icon={Eye} label="Lens" accent={accent} isMobile={isMobile} />
          <TopToggle active={settingsOpen} onClick={() => setSettingsOpen(v => !v)} icon={Sliders} label={isMobile ? '' : 'Reader'} accent={accent} isMobile={isMobile} aria-label="Reader settings" />
          {settingsOpen && !isMobile && (
            <ReaderSettings
              furiganaMode={furiganaMode} setFuriganaMode={setFuriganaMode}
              lens={lens} setLens={setLens}
              fontChoice={readingFontChoice} setFontChoice={pickReadingFont}
              language={track.language}
              readingLabel={readingLabel}
              accent={accent} onClose={() => setSettingsOpen(false)} isMobile={false}
            />
          )}
        </div>
      </div>

      {/* Reading column */}
      <div style={{
        maxWidth: '700px', margin: '0 auto', position: 'relative', zIndex: 2,
        padding: isMobile ? '14px 20px 200px' : '22px 28px 220px',
      }}>
        {story.image_path && (
          <StoryCover
            story={story} path={story.image_path} accent={accent} radius={18}
            style={{ marginBottom: '20px', aspectRatio: '16 / 7', boxShadow: '0 8px 26px rgba(24,24,27,0.06)' }}
          />
        )}

        {/* Chapter opening — a proper title on the page (not just the top bar),
            so the reader reads like a book turning to a new story. */}
        <header style={{ marginBottom: '22px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase',
            color: accent, marginBottom: '8px',
          }}>
            {levelLabel}
          </div>
          <h1 style={{
            margin: 0, fontFamily: readingFont, color: TEXT,
            fontSize: isMobile ? '29px' : '37px', fontWeight: 800,
            lineHeight: 1.18, letterSpacing: '-0.01em', textWrap: 'balance',
          }}>
            {story.title}
          </h1>
          <div style={{
            width: '46px', height: '3px', borderRadius: '999px',
            background: accent + '99', marginTop: '16px',
          }} />
        </header>

        {totalUnique > 0 && (
          <div style={{ marginBottom: '26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '9px', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: TEXT }}>{knownPct}% known</span>
                {isRead && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#2F9E6D' }}>
                    <Check size={12} strokeWidth={2.6} color="#2F9E6D" /> Finished
                  </span>
                )}
              </span>
              <span style={{ fontSize: '12px', color: MUTED }}>
                {knownCount} known · {learningCount} learning · {newCount} new
              </span>
            </div>
            {/* Thin, borderless progress rail — the reading, not the metadata, is
                the page. */}
            <div style={{ display: 'flex', height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)' }}>
              <div style={{ width: Math.round((knownCount / totalUnique) * 100) + '%', background: '#2F9E6D' }} />
              <div style={{ width: Math.round((learningCount / totalUnique) * 100) + '%', background: '#CA8A04' }} />
              <div style={{ width: Math.round((newCount / totalUnique) * 100) + '%', background: accent + '55' }} />
            </div>
            {todayInStory.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: MUTED, marginTop: '11px', lineHeight: 1.5 }}>
                <Sparkles size={13} strokeWidth={2} color={accent} />
                <span>
                  {firstMission
                    ? FIRST_MISSION_READER_HINT
                    : <>{todayInStory.length} word{todayInStory.length === 1 ? '' : 's'} from today appear{todayInStory.length === 1 ? 's' : ''} here — reading reinforces {todayInStory.length === 1 ? 'it' : 'them'}.</>}
                </span>
              </div>
            )}
            {lens && (
              <div style={{ fontSize: '12px', color: MUTED, marginTop: '9px', lineHeight: 1.5 }}>
                <strong style={{ color: TEXT, fontWeight: 650 }}>Learning Lens on.</strong> New words are boxed; amber are still learning; words you already know fade back so the rest stands out.
                {todayInStory.length > 0 && ' Today’s words carry a bold accent underline.'} Tap any word to add it to your deck.
              </div>
            )}
          </div>
        )}
        {!seenFocusHint && parsed.length >= 2 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '22px',
            animation: reduceMotion ? 'none' : 'hd-pop-in 200ms ease',
          }}>
            <span style={{ flex: 1, fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>
              Tip: tap any line to focus it and dim the rest.
            </span>
            <button onClick={dismissFocusHint} aria-label="Dismiss tip"
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '10px', border: 'none', background: 'none', cursor: 'pointer' }}>
              <X size={14} strokeWidth={2} color={MUTED} />
            </button>
          </div>
        )}
        {parsed.map(({ speaker, tokens }, li) => {
          // Group consecutive lines from the same speaker: label only the first
          // of a run, and keep same-speaker lines tight. Bigger breathing room
          // opens up only when the speaker changes (or narration ↔ dialogue).
          const prevSpeaker = li > 0 ? parsed[li - 1].speaker : undefined
          const speakerChanged = speaker !== prevSpeaker
          const showLabel = Boolean(speaker) && speakerChanged
          const topGap = li === 0 ? 0 : (speakerChanged ? (isMobile ? '18px' : '24px') : (isMobile ? '7px' : '10px'))
          const rule = speaker ? speakerColors[speaker] : null
          // Sentence focus: when a line is focused, fade the others back so the
          // current sentence carries the eye. Not a blur — just a calm dim.
          const dimmed = focusedLine !== null && focusedLine !== li
          const focusTransition = reduceMotion ? 'none' : 'opacity 220ms ease'
          return (
            <div key={li} ref={el => { lineRefs.current[li] = el }} style={{ marginTop: topGap }}>
              {showLabel && (
                <div
                  onClick={isNameKey(names, speaker) ? (e) => selectToken(li, 'sp', { name: { word: speaker, reading: names[speaker] || null } }, e.currentTarget) : undefined}
                  role={isNameKey(names, speaker) ? 'button' : undefined}
                  tabIndex={isNameKey(names, speaker) ? 0 : undefined}
                  aria-label={isNameKey(names, speaker) ? speaker : undefined}
                  onKeyDown={isNameKey(names, speaker) ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectToken(li, 'sp', { name: { word: speaker, reading: names[speaker] || null } }, e.currentTarget) }
                  } : undefined}
                  style={{
                    fontSize: '12.5px', fontWeight: 800, letterSpacing: '0.4px',
                    color: speakerColors[speaker], marginBottom: '5px',
                    fontFamily: font, display: 'inline-block',
                    paddingLeft: isMobile ? '12px' : '16px',
                    cursor: isNameKey(names, speaker) ? 'pointer' : 'default',
                    opacity: dimmed ? 0.32 : 1, transition: focusTransition,
                  }}
                >
                  {speaker}
                </div>
              )}
              <div
                // Line focus is a pointer convenience (dim the other lines); a
                // click on any real control inside the line must not also
                // toggle it. Deliberately not keyboard-operable: it adds no
                // information, and a tab stop per line would drown the tokens.
                onClick={(e) => {
                  if (e.target.closest && e.target.closest('button, [role="button"]')) return
                  toggleFocus(li)
                }}
                style={{
                  // Dialogue gets a subtle speaker-colored left rule + indent so
                  // it reads distinctly from narration without a label on every line.
                  borderLeft: rule ? '3px solid ' + rule + '66' : 'none',
                  paddingLeft: rule ? (isMobile ? '11px' : '15px') : (isMobile ? '2px' : '4px'),
                  opacity: dimmed ? 0.32 : 1, transition: focusTransition,
                  // Cursor stays default so the page reads like text, not a grid of
                  // buttons; words (Token) show the pointer that invites a tap.
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <p style={{
                    margin: 0, flex: 1,
                    fontSize: isMobile ? '20px' : '22px',
                    lineHeight: reserveRuby ? 2.15 : 1.9,
                    fontFamily: readingFont, color: TEXT, fontWeight: 400,
                    letterSpacing: isJapanese || isChinese ? '0.01em' : 'normal',
                    // Alphabetic scripts read more book-like with even measure and no
                    // stranded last word; CJK wraps per-character so leave it default.
                    textWrap: isJapanese || isChinese ? 'initial' : 'pretty',
                    // Read-along highlight: the line the TTS is currently speaking.
                    background: li === speakingLine ? HILITE : 'transparent',
                    borderRadius: '8px',
                    boxShadow: li === speakingLine ? '0 0 0 6px ' + HILITE : 'none',
                    transition: 'background 200ms ease, box-shadow 200ms ease',
                  }}>
                    {tokens.map((tk, ti) => (
                      <Token
                        key={ti}
                        token={tk}
                        // Revealing this line's English also pins its reading to
                        // "always", so the whole sentence's pronunciation shows
                        // right alongside the translation.
                        furiganaMode={revealedLines.has(li) ? 'always' : furiganaMode}
                        reserveRuby={reserveRuby}
                        isJapanese={isJapanese}
                        lens={lens}
                        status={tk.vocab ? wordStatus(tk.vocab.id, userCards) : 'not_started'}
                        today={Boolean(tk.vocab && todaySet.has(tk.vocab.word))}
                        accent={accent}
                        isPlace={Boolean(tk.vocab && isPlaceWord(tk.vocab.word, track.language))}
                        language={track.language}
                        isSelected={Boolean(sel) && sel.lineIndex === li && sel.tokenKey === ti}
                        onSelect={(el) => selectToken(li, ti, tk, el)}
                      />
                    ))}
                  </p>
                  {englishLines[li] && (
                    <RevealEnglishButton
                      revealed={revealedLines.has(li)} onToggle={() => toggleLineEnglish(li)}
                      color={MUTED} activeColor={accent} style={{ marginTop: '4px' }}
                    />
                  )}
                </div>
                {revealedLines.has(li) && englishLines[li] && (
                  <p style={{ margin: '6px 0 0', fontSize: isMobile ? '14px' : '15px', lineHeight: 1.55, color: MUTED, fontStyle: 'italic' }}>
                    {speaker ? splitSpeaker(englishLines[li]).text : englishLines[li]}
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {/* New-words recap */}
        {newWords.length > 0 && (
          <div style={{ marginTop: '28px', background: PANEL, border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT, marginBottom: '3px' }}>New words in this story</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '14px' }}>
              {newWords.length} word{newWords.length === 1 ? '' : 's'} you haven’t started yet.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {newWords.slice(0, 30).map(v => (
                <span key={v.id} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: '6px',
                  padding: '5px 10px', borderRadius: '999px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontFamily: font, fontSize: '15px', color: TEXT }}>{v.word}</span>
                  <span style={{ fontSize: '11px', color: MUTED }}>{v.reading}</span>
                </span>
              ))}
            </div>
            <button onClick={addAllNewWords} disabled={adding} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              minHeight: '44px', padding: '0 18px', borderRadius: '12px', border: 'none',
              background: accent, color: '#fff', cursor: adding ? 'default' : 'pointer',
              fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif', opacity: adding ? 0.7 : 1,
            }}>
              <Bookmark size={17} strokeWidth={2} color="#fff" />
              {adding ? 'Adding…' : 'Add ' + newWords.length + ' to deck'}
            </button>
          </div>
        )}

        {/* Comprehension check (shared with the new reader engine). */}
        {questions.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <ComprehensionCheck
              questions={questions}
              answers={answers}
              onAnswer={(qid, oi) => setAnswers(a => (a[qid] !== undefined ? a : { ...a, [qid]: oi }))}
            />
          </div>
        )}

        {/* Finish story: records the read + one-time XP. Once finished, this
            becomes a compact recap that closes the loop and points forward. */}
        {isRead ? (
          <div style={{ marginTop: '20px', background: PANEL, border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
              <span style={{
                width: '32px', height: '32px', borderRadius: '999px', flexShrink: 0,
                background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: reduceMotion ? 'none' : 'hd-pop-check 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}>
                <Check size={18} strokeWidth={2.6} color="var(--success)" />
              </span>
              <span style={{ fontSize: '17px', fontWeight: 800, color: TEXT }}>Story finished</span>
            </div>
            {firstMission && (
              <div style={{ fontSize: '15px', fontWeight: 750, color: accent, lineHeight: 1.5, marginBottom: '10px' }}>
                {firstMissionCompletion(theme.languageName)}
              </div>
            )}
            <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, marginBottom: '16px' }}>
              You can read <strong style={{ color: TEXT, fontWeight: 700 }}>{knownPct}%</strong> of this story.
              {todayInStory.length > 0 && (
                <> <strong style={{ color: TEXT, fontWeight: 700 }}>{todayInStory.length}</strong> of today’s word{todayInStory.length === 1 ? '' : 's'} appeared here — nicely reinforced.</>
              )}
              {newWords.length > 0 && (
                <> There {newWords.length === 1 ? 'is' : 'are'} <strong style={{ color: TEXT, fontWeight: 700 }}>{newWords.length}</strong> new word{newWords.length === 1 ? '' : 's'} you can add to your deck above.</>
              )}
            </div>
            <button
              onClick={onShare}
              disabled={sharing}
              style={{
                width: '100%', minHeight: '46px', marginBottom: '12px', borderRadius: '14px',
                border: '1px solid ' + accent + '55', background: accent + '0D', color: accent,
                cursor: sharing ? 'default' : 'pointer', fontSize: '14px', fontWeight: 750,
                fontFamily: 'Inter, sans-serif', opacity: sharing ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <Share2 size={17} strokeWidth={2.1} color={accent} />
              {sharing ? 'Preparing card…' : `Share that you can read ${knownPct}%`}
            </button>
            {nextChapter && nextChapter.kind !== 'unlocked' && (
              <NextChapterCard next={nextChapter} accent={accent} langFont={font} onStudy={onStudy} />
            )}
            {!nextStory && !nextChapter && nextTierUnlock && (
              <NextTierUnlockCard unlock={nextTierUnlock} accent={accent} langFont={font} onKeepLearning={onHome} />
            )}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: (nextTierUnlock && !nextStory) || (nextChapter && nextChapter.kind !== 'unlocked') ? '14px' : 0 }}>
              {nextStory && (
                <button onClick={onNextStory} style={{
                  flex: '1 1 200px', minHeight: '48px', borderRadius: '14px', border: 'none',
                  background: accent, color: '#fff', cursor: 'pointer',
                  fontSize: '14px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  {nextChapter && nextChapter.kind === 'unlocked' ? 'Read next chapter' : 'Read next story'} <ChevronRight size={18} strokeWidth={2.2} color="#fff" />
                </button>
              )}
              {onHome && (
                <button onClick={onHome} style={{
                  flex: '1 1 200px', minHeight: '48px', borderRadius: '14px',
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <Home size={17} strokeWidth={2} color="var(--text-muted)" /> Back to Today
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginTop: '20px' }}>
              <PrimaryButton onClick={finishStory} icon={Check} disabled={finishing}>
                Finish story
              </PrimaryButton>
            </div>
            {nextStory && (
              <button onClick={onNextStory} style={{
                marginTop: '14px', width: '100%', background: PANEL, border: '1px solid var(--border)',
                borderRadius: '16px', padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: TEXT,
              }}>
                <span>
                  <span style={{ display: 'block', fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '3px' }}>
                    {nextChapter && nextChapter.kind === 'unlocked' ? 'Next chapter' : 'Next story'}
                  </span>
                  <span style={{ fontSize: '17px', fontWeight: 700, fontFamily: font }}>{nextStory.title}</span>
                </span>
                <ChevronRight size={22} color={accent} />
              </button>
            )}
            {nextChapter && nextChapter.kind === 'locked' && (
              <NextChapterCard next={nextChapter} accent={accent} langFont={font} onStudy={onStudy} />
            )}
            {!nextStory && !nextChapter && nextTierUnlock && (
              <NextTierUnlockCard unlock={nextTierUnlock} accent={accent} langFont={font} onKeepLearning={onHome} />
            )}
          </>
        )}
      </div>

      {/* Word lookup — a popover over the tapped word, falling back to the
          bottom sheet when the geometry can't give it a readable box. */}
      {sel && (
        <div style={anchored
          ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 25, pointerEvents: 'none' }
          : {
            position: 'fixed', left: 0, right: 0, bottom: 'calc(64px + ' + bottomOffset + ')', zIndex: 25,
            display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none',
          }}>
          <div
            ref={(el) => { lookupBoxRef.current = el; if (anchored) popRef.current = el }}
            role="dialog" aria-label={selWord} tabIndex={-1}
            onKeyDown={e => trapDialogFocus(e, lookupBoxRef.current)}
            style={anchored
            ? {
              position: 'fixed',
              top: (popPlace ? popPlace.top : 0) + 'px',
              left: (popPlace ? popPlace.left : 0) + 'px',
              // Hidden for the one layout pass it takes to measure, so the box
              // is never painted at 0,0 before it knows where it belongs.
              visibility: popPlace ? 'visible' : 'hidden',
              width: 'min(360px, calc(100vw - 24px))',
              // dvh, not vh: the fallback height (before the popover has been
              // measured) must fit the VISIBLE viewport, not the large one.
              maxHeight: popPlace ? popPlace.maxHeight + 'px' : '60dvh',
              overflowY: 'auto',
              background: PANEL, border: '1px solid var(--border)',
              borderRadius: '16px', boxShadow: 'var(--shadow-2)', padding: '10px 14px 12px',
              pointerEvents: 'auto', zIndex: 201, outline: 'none',
              animation: reduceMotion ? 'none' : 'hd-pop-in 160ms ease',
            }
            : {
              width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
              borderRadius: '20px', boxShadow: '0 -12px 44px rgba(24,24,27,0.16)', padding: '12px 18px 16px',
              pointerEvents: 'auto', outline: 'none',
              animation: reduceMotion ? 'none' : 'hd-sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}>
            {/* The grab handle belongs to the sheet — a popover isn't dragged. */}
            {!anchored && (
              <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }} />
            )}

            {/* Header: word + reading on the left, actions on the right */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '26px', fontWeight: 800, color: accent, fontFamily: font, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                    {selWord}
                  </span>
                  {(() => {
                    // Shared rule: the vocabulary reading, else the name, else
                    // grammar, else the dictionary's pinyin — and never a
                    // reading identical to the word (kana vocab stores its own
                    // reading, and repeating it is noise). For a word beyond the
                    // list the pinyin IS the answer, so the line is held open
                    // while the dictionary is still answering rather than
                    // appearing a beat later and shoving the definition down.
                    const selReading = lookupReadingState(selForLookup, { grammar: selGrammar, dictEntry, dictLoading })
                    if (!selReading) return null
                    return (
                      <span style={{
                        fontSize: '17px', color: GOLD, fontWeight: 600,
                        opacity: selReading.pending ? 0.45 : 1,
                        letterSpacing: selReading.pending ? '0.12em' : 'normal',
                      }} aria-hidden={selReading.pending ? 'true' : undefined}>
                        {selReading.text}
                      </span>
                    )
                  })()}
                </div>
                {/* One row of meta: where the word stands, what kind of word it
                    is, and — for curriculum vocabulary — which level it comes
                    from. The kind chip and the level chip never both apply, so
                    this stays a row rather than a wall of badges. */}
                {(sel.vocab || selChip || selLevel) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {sel.vocab && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: STATUS_COLOR[selStatus] }} />
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: STATUS_COLOR[selStatus] }}>{STATUS_LABEL[selStatus]}</span>
                      </span>
                    )}
                    {selChip && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
                        color: (isName || isSelPlace) ? PROPER_NOUN_COLOR : MUTED,
                        border: '1px solid ' + ((isName || isSelPlace) ? PROPER_NOUN_COLOR + '40' : 'var(--border)'),
                        background: (isName || isSelPlace) ? PROPER_NOUN_COLOR + '12' : 'transparent',
                      }}>
                        {isName && <UserRound size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                        {isSelPlace && <MapPin size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                        {selChip}
                      </span>
                    )}
                    {selLevel && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
                        color: MUTED, border: '1px solid var(--border)', background: 'transparent',
                      }}>
                        {selLevel}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {sel.vocab && (
                  <button onClick={() => !selInDeck && addToDeck(sel.vocab)} aria-label={selInDeck ? 'In your deck' : 'Add to deck'} title={selInDeck ? 'In your deck' : 'Add to deck'}
                    style={{ background: 'none', border: 'none', cursor: selInDeck ? 'default' : 'pointer', minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bookmark size={21} strokeWidth={2} color={selInDeck ? accent : MUTED} fill={selInDeck ? accent : 'none'} />
                  </button>
                )}
                {/* A dictionary word is savable too — same gesture, same icon, so
                    "tap a word, keep a word" holds for every word in the story. */}
                {!sel.vocab && dictEntry && (
                  <button onClick={addDictToDeck} disabled={dictInDeck || dictSaving} aria-label={dictInDeck ? 'In your deck' : 'Add to deck'} title={dictInDeck ? 'In your deck' : 'Add to deck'}
                    style={{ background: 'none', border: 'none', cursor: (dictInDeck || dictSaving) ? 'default' : 'pointer', opacity: dictSaving ? 0.5 : 1, minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bookmark size={21} strokeWidth={2} color={dictInDeck ? accent : MUTED} fill={dictInDeck ? accent : 'none'} />
                  </button>
                )}
                {/* Always pronounceable: recorded vocab audio when we have it, else speech synthesis. */}
                <button
                  onClick={() => (sel.vocab && sel.vocab.audio_path ? playWord(sel.vocab.audio_path) : speakWord(selWord))}
                  aria-label="Play audio"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Volume2 size={21} strokeWidth={2} color={MUTED} />
                </button>
                <button onClick={clearReading} aria-label="Close"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
                  <X size={20} strokeWidth={2.2} color={MUTED} />
                </button>
              </div>
            </div>

            <div style={{ fontSize: '15.5px', color: 'var(--text)', marginTop: '10px', lineHeight: 1.5, fontWeight: 500 }}>
              {isName
                ? 'Proper noun — a character’s name.'
                : (isPlain
                    ? (selGrammar
                        ? selGrammar.gloss
                        : (dictDefs.length > 0
                            ? dictDefs.slice(0, 3).join('; ')
                            : (dictLoading
                                ? 'Looking it up…'
                                : 'A word beyond this level’s list — tap the speaker to hear it, or open the sentence translation below.')))
                    : cleanMeaning(sel.vocab.meaning))}
            </div>

            {/* Context chips — all from data already loaded, no extra queries */}
            {sel.vocab && (selCount > 0 || todaySet.has(selWord) || selDueSoon) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '11px' }}>
                {selCount > 0 && <MetaChip icon={Repeat} accent={accent}>{selCount === 1 ? 'Appears once here' : 'Appears ' + selCount + '× here'}</MetaChip>}
                {todaySet.has(selWord) && <MetaChip icon={Sparkles} accent={accent} strong>Studied today</MetaChip>}
                {selDueSoon && <MetaChip icon={Clock} accent={accent}>Review due soon</MetaChip>}
              </div>
            )}

            {story.english_content && englishLines[sel.lineIndex] && (
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <button onClick={() => setShowSentence(v => !v)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: MUTED, fontSize: '13px', fontWeight: 600, padding: '4px 0', minHeight: '44px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Languages size={15} strokeWidth={2} color={MUTED} /> Translate sentence
                  </span>
                  <ChevronRight size={16} color={MUTED} style={{ transform: showSentence ? 'rotate(90deg)' : 'none', transition: reduceMotion ? 'none' : 'transform 150ms' }} />
                </button>
                {showSentence && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.55 }}>
                    {splitSpeaker(englishLines[sel.lineIndex]).speaker ? splitSpeaker(englishLines[sel.lineIndex]).text : englishLines[sel.lineIndex]}
                  </div>
                )}
              </div>
            )}
          </div>
          {anchored && <PopoverArrow place={popPlace} />}
        </div>
      )}

      {/* Reader settings — bottom sheet on mobile (with a tap-to-close scrim) */}
      {settingsOpen && isMobile && (
        // `app-overlay-viewport` (100dvh), not `inset: 0` — a bottom-hinged
        // sheet measured against the LARGE viewport puts its own bottom, and
        // so its Done button, behind the mobile toolbar.
        <div
          onClick={() => setSettingsOpen(false)}
          className="app-overlay-viewport"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30, background: 'rgba(24,24,27,0.28)', display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            ref={settingsSheetRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => trapDialogFocus(e, settingsSheetRef.current)}
            role="dialog"
            aria-modal="true"
            aria-label="Reader settings"
            tabIndex={-1}
            style={{
              outline: 'none',
              width: '100%', maxHeight: SHEET_MAX_HEIGHT,
              display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
              background: PANEL, borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
              borderTop: '1px solid var(--border)', boxShadow: '0 -12px 44px rgba(24,24,27,0.20)',
              paddingTop: '12px',
              animation: reduceMotion ? 'none' : 'hd-sheet-up 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px', flexShrink: 0 }} />
            {/* The settings list is taller than a 360×640 phone, so it scrolls
                inside the sheet. `min-height: 0` per the flex scroll rule (§5). */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              padding: '0 18px ' + sheetSafeBottom(20),
            }}>
              <ReaderSettings
                furiganaMode={furiganaMode} setFuriganaMode={setFuriganaMode}
                lens={lens} setLens={setLens}
                fontChoice={readingFontChoice} setFontChoice={pickReadingFont}
                language={track.language}
                readingLabel={readingLabel}
                accent={accent} onClose={() => setSettingsOpen(false)} isMobile
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom audio bar */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: bottomOffset, zIndex: 24,
        display: 'flex', justifyContent: 'center', padding: '10px 12px',
        background: 'linear-gradient(180deg, rgba(250,250,248,0) 0%, var(--bg) 40%)',
      }}>
        <div style={{
          width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
          borderRadius: '16px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <button onClick={toggleStoryAudio} aria-label={speaking ? 'Pause' : 'Play story'}
            style={{ width: '44px', height: '44px', borderRadius: '999px', background: accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {speaking ? <Pause size={20} color="#fff" fill="#fff" /> : <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: '2px' }} />}
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
            <div style={{ fontSize: '12px', color: MUTED }}>
              {speaking ? 'Reading aloud…' : ((story.has_audio || Object.keys(utteranceIds).length) ? 'Listen' : 'Listen (text-to-speech)')}
            </div>
          </div>
          <button onClick={cycleRate} aria-label="Playback speed" title="Playback speed"
            style={{
              flexShrink: 0, minWidth: '52px', height: '44px', borderRadius: '11px',
              background: rate === 0.85 ? 'var(--surface-2)' : accent + '14',
              border: '1px solid ' + (rate === 0.85 ? 'var(--border)' : accent + '40'),
              color: rate === 0.85 ? MUTED : accent, cursor: 'pointer',
              fontSize: '13px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
            }}>
            {rate}×
          </button>
        </div>
      </div>
    </div>
  )
}

// Shown when the reader has finished every story they can currently read: turns
// the dead end into a concrete "learn N more to unlock the next set" nudge that
// points back at studying (where the words come from). Rendered only when there's
// no next story left in this tier and a locked tier with stories is waiting.
// The chapter-loop tease: the next chapter is written, named, and waiting —
// behind today's flashcard session (locked) — or the series just ended
// (series-complete). Mirrors NextTierUnlockCard's calm shape.
function NextChapterCard({ next, accent, langFont, onStudy }) {
  const [hovered, setHovered] = useState(false)
  if (next.kind === 'series-complete') {
    return (
      <div style={{
        marginTop: '14px', background: accent + '0D', border: '1px solid ' + accent + '2A',
        borderRadius: '18px', padding: '18px 20px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', color: accent }}>
          Series complete
        </div>
        <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)', marginTop: '3px', lineHeight: 1.45 }}>
          {next.seriesTitle ? <>You finished <span style={{ fontFamily: langFont }}>“{next.seriesTitle}”</span> — all {next.total} chapters.</> : 'You finished the story.'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Choose your next story from the library.
        </div>
      </div>
    )
  }
  const chapterName = (next.nativeLabel ? next.nativeLabel + ' · ' : 'Chapter ' + next.number + ' · ') + next.title
  return (
    <div style={{
      marginTop: '14px', background: accent + '0D', border: '1px solid ' + accent + '2A',
      borderRadius: '18px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={21} strokeWidth={1.9} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', color: accent }}>
            Next chapter
          </div>
          <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)', marginTop: '3px', lineHeight: 1.45, fontFamily: langFont }}>
            {chapterName}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
            Complete your next flashcard session to continue.
          </div>
        </div>
      </div>
      {onStudy && (
        <button
          onClick={onStudy}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            width: '100%', minHeight: '48px', borderRadius: '14px', border: 'none',
            background: hovered ? accent : accent + 'E6', color: '#fff',
            fontSize: '14.5px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
            cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease',
            transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
          }}
        >
          Review flashcards
          <ChevronRight size={18} strokeWidth={2.2} color="#fff" />
        </button>
      )}
    </div>
  )
}

function NextTierUnlockCard({ unlock, accent, langFont, onKeepLearning }) {
  const [hovered, setHovered] = useState(false)
  const { remaining, label } = unlock
  return (
    <div style={{
      marginTop: '14px', background: accent + '0D', border: '1px solid ' + accent + '2A',
      borderRadius: '18px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={21} strokeWidth={1.9} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', color: accent }}>
            Keep going
          </div>
          <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text)', marginTop: '3px', lineHeight: 1.45 }}>
            Learn <strong style={{ fontWeight: 850 }}>{remaining}</strong> more word{remaining === 1 ? '' : 's'} to unlock{' '}
            <span style={{ fontFamily: langFont }}>“{label}”</span> stories
          </div>
        </div>
      </div>
      {onKeepLearning && (
        <button
          onClick={onKeepLearning}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            width: '100%', minHeight: '48px', borderRadius: '14px', border: 'none',
            background: hovered ? accent : accent + 'E6', color: '#fff',
            fontSize: '14.5px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
            cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease',
            transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
          }}
        >
          Keep learning
          <ChevronRight size={18} strokeWidth={2.2} color="#fff" />
        </button>
      )}
    </div>
  )
}

function TopToggle({ active, onClick, icon: Icon, label, accent, isMobile, ...rest }) {
  return (
    <button onClick={onClick} {...rest} style={{
      display: 'flex', alignItems: 'center', gap: label ? '6px' : 0,
      background: active ? accent + '1A' : 'transparent',
      border: '1px solid ' + (active ? accent + '66' : 'var(--border)'),
      color: active ? accent : MUTED, borderRadius: '999px',
      minHeight: '44px', minWidth: '44px', padding: isMobile ? (label ? '6px 12px' : '6px 9px') : (label ? '7px 13px' : '7px 10px'),
      cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    }}>
      <Icon size={15} strokeWidth={2} />
      {label}
    </button>
  )
}

// A small labelled chip for the lookup sheet's context row (occurrences, studied
// today, review due). `strong` gives today's-word chips the accent treatment.
function MetaChip({ icon: Icon, children, accent, strong = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '12px', fontWeight: 650, borderRadius: '999px', padding: '4px 10px',
      color: strong ? accent : 'var(--text-muted)',
      background: strong ? accent + '14' : 'var(--surface-2)',
      border: '1px solid ' + (strong ? accent + '3A' : 'var(--border)'),
    }}>
      <Icon size={13} strokeWidth={2} color={strong ? accent : 'var(--text-muted)'} />
      {children}
    </span>
  )
}

// Reader preferences: furigana mode, reading font, Learning Lens. Shared by the
// desktop popover and the mobile bottom sheet. Kept presentational — all state
// lives in the reader so the choices persist and never reload the story.
// Sentence translation lives outside this panel — a RevealEnglishButton sits
// beside each line instead.
function ReaderSettings({ furiganaMode, setFuriganaMode, lens, setLens, fontChoice, setFontChoice, language, readingLabel, accent, onClose, isMobile }) {
  const fontOptions = readingFontOptions(language)
  const wrap = isMobile
    ? { width: '100%' }
    : {
        position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 30, width: '280px',
        background: PANEL, border: '1px solid var(--border)', borderRadius: '16px',
        boxShadow: '0 14px 44px rgba(24,24,27,0.18)', padding: '16px',
        animation: prefersReducedMotion() ? 'none' : 'hd-pop-in 160ms ease',
      }
  return (
    // A settings panel, not a menu. `role="menu"` promises arrow-key navigation
    // between menu items, and this panel's children are toggle buttons, a
    // nested group and a switch — none of them menu items, so the promise broke
    // the moment a screen reader tried to keep it. A labelled group says what
    // this is without claiming a keyboard contract it doesn't implement.
    <div style={wrap} role="group" aria-label="Reader settings">
      {/* Furigana mode */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '9px' }}>
        {readingLabel}
      </div>
      <div role="group" aria-label={readingLabel} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
        {FURIGANA_OPTIONS.map(opt => {
          const on = furiganaMode === opt.value
          return (
            // Pressed-state buttons, like the reading-font row below — the two
            // rows do the same job and should sound the same.
            <button key={opt.value} onClick={() => setFuriganaMode(opt.value)} aria-pressed={on}
              style={{
                minHeight: '42px', borderRadius: '11px', cursor: 'pointer',
                fontSize: '13.5px', fontWeight: on ? 750 : 600, fontFamily: 'Inter, sans-serif',
                color: on ? accent : 'var(--text)',
                background: on ? accent + '14' : 'var(--surface-2)',
                border: '1px solid ' + (on ? accent + '66' : 'var(--border)'),
              }}>
              {opt.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '8px', lineHeight: 1.45 }}>
        Show readings for every word, only the ones you’re still learning, only new words, or never.
      </div>

      {/* Reading font — the shape of the characters themselves. Which options
          exist is per-language data (readingFonts.js), never a branch here. */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '15px 0' }} />
      <div style={{ fontSize: '12px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '9px' }}>
        Reading font
      </div>
      <div role="group" aria-label="Reading font" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + fontOptions.length + ', 1fr)', gap: '7px' }}>
        {fontOptions.map(opt => {
          const on = fontChoice === opt.value
          return (
            <button key={opt.value} onClick={() => setFontChoice(opt.value)} aria-pressed={on}
              style={{
                minHeight: '42px', padding: '7px 4px', borderRadius: '11px', cursor: 'pointer',
                fontSize: '12.5px', fontWeight: on ? 750 : 600,
                // Drawn in its own face, so the shapes are visible before the
                // choice is made — the whole point of the setting.
                fontFamily: opt.stack,
                color: on ? accent : 'var(--text)',
                background: on ? accent + '14' : 'var(--surface-2)',
                border: '1px solid ' + (on ? accent + '66' : 'var(--border)'),
              }}>
              {opt.sample && (
                <span aria-hidden="true" style={{ display: 'block', fontSize: '21px', lineHeight: 1.15, fontWeight: 500 }}>{opt.sample}</span>
              )}
              {opt.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '8px', lineHeight: 1.45 }}>
        {readingFontHint(language, fontChoice)}
      </div>

      {/* Learning Lens */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '15px 0' }} />
      <SettingRow
        label="Learning Lens"
        hint="Spotlight new and learning words; quiet the ones you know."
        on={lens} onToggle={() => setLens(v => !v)} accent={accent}
      />

      {isMobile && (
        <button onClick={onClose} style={{
          marginTop: '18px', width: '100%', minHeight: '46px', borderRadius: '13px', border: 'none',
          background: accent, color: '#fff', fontSize: '14px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}>
          Done
        </button>
      )}
    </div>
  )
}

// A labelled switch row used inside ReaderSettings. The track/knob is a plain
// button so it's a large, obvious tap target (mobile-first).
function SettingRow({ label, hint, on, onToggle, accent }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on} aria-label={label}
      style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, marginTop: '2px', lineHeight: 1.4 }}>{hint}</span>
      </span>
      <span style={{
        flexShrink: 0, width: '46px', height: '28px', borderRadius: '999px', position: 'relative',
        background: on ? accent : 'var(--surface-2)', border: '1px solid ' + (on ? accent : 'var(--border)'),
        transition: 'background 160ms ease',
      }}>
        <span style={{
          position: 'absolute', top: '2px', left: on ? '20px' : '2px', width: '22px', height: '22px',
          borderRadius: '999px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
      </span>
    </button>
  )
}

function watermarkStyle(side, font) {
  const base = {
    position: 'fixed', top: '50%', transform: 'translateY(-50%)',
    fontSize: '300px', fontWeight: 800, color: 'var(--reader-watermark)',
    fontFamily: font, pointerEvents: 'none', userSelect: 'none', zIndex: 1,
  }
  if (side === 'left') base.left = '2%'
  else base.right = '2%'
  return base
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: '7px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
}
