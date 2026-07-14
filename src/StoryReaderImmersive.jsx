import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { isOnline } from './useOnline'
import { enqueueStoryRead } from './syncQueue'
import { ensureAudio } from './audioCache'
import { PrimaryButton } from './ui'
import { CHARACTER_READINGS } from './characterNames'
import { getLevelLabel, getAudioUrl, playAudioEl } from './utils'
import { languageTheme } from './languageTheme'
import { cleanMeaning } from './cleanMeaning'
import { wordStatus, todayWordsInStory, calculateStoryReadability, splitSpeaker, matchName, JP_PARTICLES, readingVisibleFor, isDueSoon, buildVocabMatcher, matchVocabAt, boundaryAfterSkip } from './storyReading'
import { glossaryLookup } from './grammarGlossary'
import { prefsGet, prefsSet } from './offline'
import { FIRST_MISSION_READER_HINT, firstMissionCompletion } from './firstMission'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'
import { ArrowLeft, Bookmark, Volume2, Play, Pause, Languages, ChevronRight, UserRound, Check, X, Sparkles, Home, Sliders, Eye, Clock, Repeat } from 'lucide-react'

// HSKStory-inspired immersion reader for BOTH languages. Light theme. Tap a word
// for a bottom-sheet definition; pinyin (Chinese) / furigana (Japanese) and
// translation toggles; bottom audio bar. Word segmentation uses the browser's
// Intl.Segmenter per locale so you tap whole words, not single characters.

const PANEL = 'var(--surface)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const GOLD = '#B45309'
const HILITE = 'rgba(217, 164, 62, 0.32)'

const SPEAKER_PALETTE = ['#B83A24', '#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']

// One-time XP for finishing a story (kept small next to per-card review XP —
// the real reward for reading is the vocabulary reinforcement itself).
const STORY_FINISH_XP = 10

// Durable reader preferences (furigana mode, Learning Lens, translation). Stored
// in the prefs store so a reader's chosen scaffolding survives reloads without a
// round-trip to the server. Default: scaffold only unknown words, lens off — the
// page reads like a book until the learner asks for more help.
const READER_PREFS_KEY = 'reader:prefs'
const DEFAULT_PREFS = { furiganaMode: 'unknown', lens: false, showEnglish: false }

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

const STATUS_COLOR = {
  not_started: 'var(--text-faint)',
  learning: '#CA8A04',
  review: '#3E63DD',
  mastered: '#2F9E6D',
}

// Plain-language status label for the lookup sheet, so learning state is legible
// (not conveyed by the color dot alone).
const STATUS_LABEL = {
  not_started: 'New word',
  learning: 'Learning',
  review: 'Known',
  mastered: 'Mastered',
}

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
// Is a token an actual word (letters/CJK/kana/Cyrillic/digits) vs. pure
// punctuation or spacing? Word-like tokens are all tappable, even when they
// aren't in the learner's vocabulary list (conjugated verbs, grammar, particles)
// — you can still hear them and read the sentence translation.
function isWordChar(c) {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
    || (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF)
    || (c >= 0x0400 && c <= 0x04FF) || (c >= 0xFF66 && c <= 0xFF9D)
}
function isWordlike(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) if (isWordChar(v.charCodeAt(i))) return true
  return false
}
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

// splitSpeaker + matchName now live in ./storyReading (shared with the recap's
// readability so counting and rendering strip labels / skip names identically).

// Names → greedy/deinflection vocab match → Intl.Segmenter for the rest, so known
// words (including conjugated Japanese verbs, via the shared matcher) stay
// tappable as whole units and everything else has clean word boundaries. The
// matcher is prebuilt once per render (buildVocabMatcher) and shared with the
// readability count so what's tappable and what's counted stay in lockstep.
function segmentLine(text, matcher, segmenter, names, particles) {
  const tokens = []
  let i = 0
  let boundary = true
  while (i < text.length) {
    const name = matchName(text, i, matcher.words, names)
    if (name) {
      tokens.push({ text: name, name: { word: name, reading: names[name] } })
      i += name.length
      boundary = true
      continue
    }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m) {
      tokens.push({ text: text.slice(i, i + m.len), vocab: m.vocab })
      i += m.len
      boundary = true
      continue
    }
    let j = i
    let b = boundary
    while (j < text.length) {
      if (matchName(text, j, matcher.words, names)) break
      if (matchVocabAt(text, j, matcher, particles, b)) break
      b = boundaryAfterSkip(text[j], particles)
      j += 1
    }
    const run = text.slice(i, j)
    if (segmenter) {
      for (const seg of segmenter.segment(run)) tokens.push({ text: seg.segment, vocab: null })
    } else {
      tokens.push({ text: run, vocab: null })
    }
    i = j
    boundary = b
  }
  return tokens
}

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

function Token({ token, isSelected, furiganaMode, reserveRuby, isJapanese, lens, status, today, accent, onSelect }) {
  const [hover, setHover] = useState(false)
  const reading = token.vocab ? token.vocab.reading : (token.name ? token.name.reading : null)
  // Vocabulary and names carry data; plain word-like tokens are still tappable
  // (hear them / see the sentence). Only punctuation and whitespace are inert.
  const clickable = Boolean(token.vocab || token.name) || isWordlike(token.text)
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

  let body = token.text
  if (showReading) {
    body = rubyFor(token.text, reading, isJapanese)
  } else if (reserveRuby) {
    // No reading shown for this word, but the line reserves furigana space — keep
    // an empty row so its baseline lines up with words that do show a reading.
    body = <ruby>{token.text}<rt>&nbsp;</rt></ruby>
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', borderRadius: '5px', padding: '0 1px',
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

export default function StoryReaderImmersive({ story, vocabMap, userCards, setUserCards, session, profile, track, onBack, onHome, nextStory, onNextStory, isRead, onMarkRead, todayWords = [], firstMission = false }) {
  const [selected, setSelected] = useState(null)
  const [furiganaMode, setFuriganaMode] = useState(DEFAULT_PREFS.furiganaMode)
  const [lens, setLens] = useState(DEFAULT_PREFS.lens)
  const [showEnglish, setShowEnglish] = useState(DEFAULT_PREFS.showEnglish)
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
  const [adding, setAdding] = useState(false)
  const wordAudioRef = useRef(null)
  const storyAudioRef = useRef(null)
  const settingsAnchorRef = useRef(null)

  const theme = languageTheme(track.language)
  const isJapanese = track.language === 'japanese'
  const isChinese = track.language === 'chinese'
  const accent = theme.accentHex
  const font = theme.font
  const names = CHARACTER_READINGS[track.language] || {}
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
        if (typeof saved.showEnglish === 'boolean') setShowEnglish(saved.showEnglish)
      }
    }).finally(() => { prefsReady.current = true })
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!prefsReady.current) return
    prefsSet(READER_PREFS_KEY, { furiganaMode, lens, showEnglish })
  }, [furiganaMode, lens, showEnglish])

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
    /* eslint-enable react-hooks/set-state-in-effect */
    supabase.from('story_questions').select('*').eq('story_id', story.id).order('question_number', { ascending: true })
      .then(({ data }) => { if (active) setQuestions(data || []) })
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
      return { speaker, tokens: segmentLine(text, matcher, segmenter, names, particles) }
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

  // Which of today's studied words appear in this story — the "3 words from
  // today appear here" thread that connects the study session to this reading.
  const todaySet = useMemo(() => new Set(todayWords || []), [todayWords])
  const todayInStory = useMemo(() => todayWordsInStory(storyWords, todayWords), [storyWords, todayWords])

  // Analytics: story opened (once per story). Fires with the current readability
  // so drop-off vs. difficulty is analyzable. Intentionally keyed on story.id.
  useEffect(() => {
    trackEvent(EVENTS.STORY_OPENED, { tier: story.tier, known_pct: knownPct })
    if (firstMission) trackOnce(EVENTS.FIRST_STORY_OPENED, { known_pct: knownPct })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id])

  // Comprehension scoring.
  const answeredCount = Object.keys(answers).length
  const correctCount = questions.filter(q => answers[q.id] === q.correct_index).length

  // Finishing a story records it (story_reads) and pays a small one-time XP
  // reward — reading is half the method, it should count for something.
  const [finishing, setFinishing] = useState(false)
  const finishStory = async () => {
    if (finishing || isRead) return
    setFinishing(true)
    if (isOnline()) {
      const { error } = await supabase
        .from('story_reads')
        .upsert({ user_id: session.user.id, story_id: story.id })
      if (!error) {
        if (profile) awardXp(session, profile, STORY_FINISH_XP)
        if (onMarkRead) onMarkRead(story.id)
      }
    } else {
      // Offline: queue the read + its XP; both land when the outbox flushes.
      await enqueueStoryRead({ userId: session.user.id, storyId: story.id, xpDelta: STORY_FINISH_XP })
      if (onMarkRead) onMarkRead(story.id)
    }
    trackEvent(EVENTS.STORY_COMPLETED, { tier: story.tier, known_pct: knownPct })
    if (firstMission) trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct: knownPct })
    setFinishing(false)
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
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id,
      vocab_id: vocabItem.id,
      state: 'new',
      ease_factor: 2.5,
      learning_step: 0,
      due_at: new Date().toISOString(),
    })
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
    const u = new SpeechSynthesisUtterance(splitSpeaker(lines[index]).text)
    u.lang = ttsLang
    u.rate = rateRef.current
    u.onend = () => { if (runId === runRef.current) speakFrom(index + 1, runId) }
    u.onerror = () => { if (runId === runRef.current) { setSpeaking(false); setSpeakingLine(-1); speakingLineRef.current = -1 } }
    synth.speak(u)
  }

  const speakFrom = (index, runId) => {
    if (runId !== runRef.current) return
    if (index >= lines.length) { setSpeaking(false); setSpeakingLine(-1); speakingLineRef.current = -1; return }
    setSpeakingLine(index)
    speakingLineRef.current = index

    if (story.has_audio) {
      const url = getAudioUrl('stories/' + story.id + '/' + index + '.mp3')
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
      if (storyAudioRef.current) storyAudioRef.current.pause()
      setSpeaking(false)
      setSpeakingLine(-1)
      speakingLineRef.current = -1
      return
    }
    runRef.current += 1
    const runId = runRef.current
    cancelSynth()
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

  const selectToken = (lineIndex, tokenKey, token) => {
    setShowSentence(false)
    setFocusedLine(lineIndex)   // tapping a word also focuses its sentence
    setSelected({ lineIndex, tokenKey, vocab: token.vocab || null, name: token.name || null, text: token.text })
  }

  // Sentence focus: tapping a line's whitespace (not a word) fades the rest of
  // the story so the current sentence carries the eye — tap it again to release.
  const toggleFocus = (lineIndex) => {
    setFocusedLine(prev => (prev === lineIndex ? null : lineIndex))
  }
  const clearReading = () => { setSelected(null); setFocusedLine(null) }

  const sel = selected
  const isName = Boolean(sel && sel.name)
  const isPlain = Boolean(sel && !sel.vocab && !sel.name)   // tapped a grammar / out-of-list word
  const selWord = sel ? (isName ? sel.name.word : (sel.vocab ? sel.vocab.word : sel.text)) : ''
  const selStatus = sel && sel.vocab ? wordStatus(sel.vocab.id, userCards) : 'not_started'
  // Built-in grammar glossary: a plain tap on a particle / copula / conjugation
  // fragment gets a real explanation instead of the generic fallback line.
  const selGrammar = isPlain ? glossaryLookup(track.language, sel.text) : null
  const selInDeck = sel && sel.vocab ? Boolean(userCards[sel.vocab.id]) : false
  // Context chips in the lookup sheet, all from data already in memory (no query):
  // how often the word appears here, whether it was studied today, and whether a
  // review is coming up soon.
  const selCount = sel && sel.vocab ? (counts.get(sel.vocab.word) || 0) : 0
  const selCard = sel && sel.vocab ? userCards[sel.vocab.id] : null
  const selDueSoon = Boolean(selCard && selStatus !== 'not_started' && isDueSoon(selCard.due_at))
  const bottomOffset = isMobile ? 'calc(62px + env(safe-area-inset-bottom))' : '0px'

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
        <div style={{ color: MUTED, fontSize: '13px', fontWeight: 600, textAlign: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {levelLabel} · <span style={{ color: 'var(--text-muted)' }}>{story.title}</span>
        </div>
        <div ref={settingsAnchorRef} style={{ display: 'flex', gap: '6px', position: 'relative' }}>
          <TopToggle active={lens} onClick={() => setLens(v => !v)} icon={Eye} label="Lens" accent={accent} isMobile={isMobile} />
          <TopToggle active={settingsOpen} onClick={() => setSettingsOpen(v => !v)} icon={Sliders} label={isMobile ? '' : 'Reader'} accent={accent} isMobile={isMobile} aria-label="Reader settings" />
          {settingsOpen && !isMobile && (
            <ReaderSettings
              furiganaMode={furiganaMode} setFuriganaMode={setFuriganaMode}
              lens={lens} setLens={setLens}
              showEnglish={showEnglish} setShowEnglish={setShowEnglish}
              hasEnglish={Boolean(story.english_content)} readingLabel={readingLabel}
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
          <div style={{
            marginBottom: '20px', borderRadius: '18px', overflow: 'hidden',
            border: '1px solid var(--border)', aspectRatio: '16 / 7',
            background: accent + '10', boxShadow: '0 8px 26px rgba(24,24,27,0.06)',
          }}>
            <img src={getAudioUrl(story.image_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
        {totalUnique > 0 && (
          <div style={{ marginBottom: '20px', background: PANEL, border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: TEXT }}>{knownPct}% known</span>
                {isRead && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#2F9E6D' }}>
                    <Check size={13} strokeWidth={2.6} color="#2F9E6D" /> Finished
                  </span>
                )}
              </span>
              <span style={{ fontSize: '12px', color: MUTED }}>
                {newCount} new · {learningCount} learning · {knownCount} known
              </span>
            </div>
            <div style={{ display: 'flex', height: '7px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)' }}>
              <div style={{ width: Math.round((knownCount / totalUnique) * 100) + '%', background: '#2F9E6D' }} />
              <div style={{ width: Math.round((learningCount / totalUnique) * 100) + '%', background: '#CA8A04' }} />
              <div style={{ width: Math.round((newCount / totalUnique) * 100) + '%', background: accent + '55' }} />
            </div>
            {todayInStory.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 650, color: accent, marginTop: '10px', lineHeight: 1.5 }}>
                <Sparkles size={14} strokeWidth={2} color={accent} />
                <span>
                  {firstMission
                    ? FIRST_MISSION_READER_HINT
                    : <>{todayInStory.length} word{todayInStory.length === 1 ? '' : 's'} from today appear{todayInStory.length === 1 ? 's' : ''} here — read to reinforce {todayInStory.length === 1 ? 'it' : 'them'}.</>}
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
            <div key={li} style={{ marginTop: topGap }}>
              {showLabel && (
                <div
                  onClick={names[speaker] ? () => selectToken(li, 'sp', { name: { word: speaker, reading: names[speaker] } }) : undefined}
                  style={{
                    fontSize: '12.5px', fontWeight: 800, letterSpacing: '0.4px',
                    color: speakerColors[speaker], marginBottom: '5px',
                    fontFamily: font, display: 'inline-block',
                    paddingLeft: isMobile ? '12px' : '16px',
                    cursor: names[speaker] ? 'pointer' : 'default',
                    opacity: dimmed ? 0.32 : 1, transition: focusTransition,
                  }}
                >
                  {speaker}
                </div>
              )}
              <div
                onClick={() => toggleFocus(li)}
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
                <p style={{
                  margin: 0,
                  fontSize: isMobile ? '20px' : '22px',
                  lineHeight: reserveRuby ? 2.15 : 1.9,
                  fontFamily: font, color: TEXT, fontWeight: 400,
                  letterSpacing: isJapanese || isChinese ? '0.01em' : 'normal',
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
                      furiganaMode={furiganaMode}
                      reserveRuby={reserveRuby}
                      isJapanese={isJapanese}
                      lens={lens}
                      status={tk.vocab ? wordStatus(tk.vocab.id, userCards) : 'not_started'}
                      today={Boolean(tk.vocab && todaySet.has(tk.vocab.word))}
                      accent={accent}
                      isSelected={Boolean(sel) && sel.lineIndex === li && sel.tokenKey === ti}
                      onSelect={() => selectToken(li, ti, tk)}
                    />
                  ))}
                </p>
                {showEnglish && englishLines[li] && (
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

        {/* Comprehension check */}
        {questions.length > 0 && (
          <div style={{ marginTop: '20px', background: PANEL, border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: TEXT }}>Check your understanding</span>
              {answeredCount > 0 && (
                <span style={{ fontSize: '13px', fontWeight: 700, color: correctCount === questions.length ? '#2F9E6D' : MUTED }}>
                  {correctCount}/{questions.length}
                </span>
              )}
            </div>
            {questions.map((q, qi) => {
              const chosen = answers[q.id]
              const answered = chosen !== undefined
              return (
                <div key={q.id} style={{ marginTop: qi === 0 ? '14px' : '18px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: TEXT, marginBottom: '9px', lineHeight: 1.5 }}>
                    {qi + 1}. {q.question}
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {q.options.map((opt, oi) => {
                      const isCorrect = oi === q.correct_index
                      const isChosen = oi === chosen
                      let bc = 'var(--border)', bg = 'var(--surface)'
                      if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
                      else if (answered && isChosen) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
                      return (
                        <button
                          key={oi}
                          onClick={() => { if (!answered) setAnswers(a => ({ ...a, [q.id]: oi })) }}
                          disabled={answered}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                            textAlign: 'left', padding: '11px 14px', borderRadius: '11px',
                            border: '1.5px solid ' + bc, background: bg, color: TEXT,
                            cursor: answered ? 'default' : 'pointer', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          <span>{opt}</span>
                          {answered && isCorrect && <Check size={17} strokeWidth={2.4} color="#2F9E6D" />}
                          {answered && isChosen && !isCorrect && <X size={17} strokeWidth={2.4} color="#DC2626" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {nextStory && (
                <button onClick={onNextStory} style={{
                  flex: '1 1 200px', minHeight: '48px', borderRadius: '14px', border: 'none',
                  background: accent, color: '#fff', cursor: 'pointer',
                  fontSize: '14px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  Read next story <ChevronRight size={18} strokeWidth={2.2} color="#fff" />
                </button>
              )}
              {onHome && (
                <button onClick={onHome} style={{
                  flex: '1 1 200px', minHeight: '48px', borderRadius: '14px',
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <Home size={17} strokeWidth={2} color="var(--text-muted)" /> Back to Today’s Dojo
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginTop: '20px' }}>
              <PrimaryButton onClick={finishStory} icon={Check} disabled={finishing}>
                Finish story · +{STORY_FINISH_XP} XP
              </PrimaryButton>
            </div>
            {nextStory && (
              <button onClick={onNextStory} style={{
                marginTop: '14px', width: '100%', background: PANEL, border: '1px solid var(--border)',
                borderRadius: '16px', padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: TEXT,
              }}>
                <span>
                  <span style={{ display: 'block', fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '3px' }}>Next story</span>
                  <span style={{ fontSize: '17px', fontWeight: 700, fontFamily: font }}>{nextStory.title}</span>
                </span>
                <ChevronRight size={22} color={accent} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Word lookup sheet */}
      {sel && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(64px + ' + bottomOffset + ')', zIndex: 25,
          display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none',
        }}>
          <div style={{
            width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
            borderRadius: '20px', boxShadow: '0 -12px 44px rgba(24,24,27,0.16)', padding: '12px 18px 16px',
            pointerEvents: 'auto',
            animation: reduceMotion ? 'none' : 'hd-sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}>
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }} />

            {/* Header: word + reading on the left, actions on the right */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '26px', fontWeight: 800, color: accent, fontFamily: font, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                    {selWord}
                  </span>
                  {(() => {
                    const selReading = isName ? sel.name.reading : (selGrammar ? selGrammar.reading : (sel.vocab ? sel.vocab.reading : null))
                    // Kana vocab stores its reading as itself — repeating the
                    // word right next to it is noise, so only show a reading
                    // that adds information.
                    if (!selReading || selReading === selWord) return null
                    return (
                      <span style={{ fontSize: '17px', color: GOLD, fontWeight: 600 }}>
                        {selReading}
                      </span>
                    )
                  })()}
                </div>
                {sel.vocab && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: STATUS_COLOR[selStatus] }} />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: STATUS_COLOR[selStatus] }}>{STATUS_LABEL[selStatus]}</span>
                  </span>
                )}
                {(isName || isPlain) && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '6px',
                    fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
                    color: isName ? accent : MUTED,
                    border: '1px solid ' + (isName ? accent + '40' : 'var(--border)'),
                    background: isName ? accent + '12' : 'transparent',
                  }}>
                    {isName && <UserRound size={12} strokeWidth={2.2} color={accent} />}
                    {isName ? 'Name' : (selGrammar ? 'Grammar' : 'Word')}
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
                        : 'A word beyond this level’s list — tap the speaker to hear it, or open the sentence translation below.')
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
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: MUTED, fontSize: '13px', fontWeight: 600, padding: '4px 0', minHeight: '32px' }}>
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
        </div>
      )}

      {/* Reader settings — bottom sheet on mobile (with a tap-to-close scrim) */}
      {settingsOpen && isMobile && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(24,24,27,0.28)', display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', background: PANEL, borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
              borderTop: '1px solid var(--border)', boxShadow: '0 -12px 44px rgba(24,24,27,0.20)',
              padding: '12px 18px calc(20px + env(safe-area-inset-bottom))',
              animation: reduceMotion ? 'none' : 'hd-sheet-up 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px' }} />
            <ReaderSettings
              furiganaMode={furiganaMode} setFuriganaMode={setFuriganaMode}
              lens={lens} setLens={setLens}
              showEnglish={showEnglish} setShowEnglish={setShowEnglish}
              hasEnglish={Boolean(story.english_content)} readingLabel={readingLabel}
              accent={accent} onClose={() => setSettingsOpen(false)} isMobile
            />
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
              {speaking ? 'Reading aloud…' : (story.has_audio ? 'Listen' : 'Listen (text-to-speech)')}
            </div>
          </div>
          <button onClick={cycleRate} aria-label="Playback speed" title="Playback speed"
            style={{
              flexShrink: 0, minWidth: '52px', height: '38px', borderRadius: '11px',
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

function TopToggle({ active, onClick, icon: Icon, label, accent, isMobile, ...rest }) {
  return (
    <button onClick={onClick} {...rest} style={{
      display: 'flex', alignItems: 'center', gap: label ? '6px' : 0,
      background: active ? accent + '1A' : 'transparent',
      border: '1px solid ' + (active ? accent + '66' : 'var(--border)'),
      color: active ? accent : MUTED, borderRadius: '999px',
      minHeight: '36px', padding: isMobile ? (label ? '6px 12px' : '6px 9px') : (label ? '7px 13px' : '7px 10px'),
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

// Reader preferences: furigana mode, Learning Lens, translation. Shared by the
// desktop popover and the mobile bottom sheet. Kept presentational — all state
// lives in the reader so the choices persist and never reload the story.
function ReaderSettings({ furiganaMode, setFuriganaMode, lens, setLens, showEnglish, setShowEnglish, hasEnglish, readingLabel, accent, onClose, isMobile }) {
  const wrap = isMobile
    ? { width: '100%' }
    : {
        position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 30, width: '280px',
        background: PANEL, border: '1px solid var(--border)', borderRadius: '16px',
        boxShadow: '0 14px 44px rgba(24,24,27,0.18)', padding: '16px',
        animation: prefersReducedMotion() ? 'none' : 'hd-pop-in 160ms ease',
      }
  return (
    <div style={wrap} role="menu" aria-label="Reader settings">
      {/* Furigana mode */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '9px' }}>
        {readingLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
        {FURIGANA_OPTIONS.map(opt => {
          const on = furiganaMode === opt.value
          return (
            <button key={opt.value} onClick={() => setFuriganaMode(opt.value)} role="menuitemradio" aria-checked={on}
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

      {/* Learning Lens */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '15px 0' }} />
      <SettingRow
        label="Learning Lens"
        hint="Spotlight new and learning words; quiet the ones you know."
        on={lens} onToggle={() => setLens(v => !v)} accent={accent}
      />

      {/* Translation */}
      {hasEnglish && (
        <>
          <div style={{ height: '1px', background: 'var(--border)', margin: '15px 0' }} />
          <SettingRow
            label="Show translation"
            hint="Print the English line under each sentence."
            on={showEnglish} onToggle={() => setShowEnglish(v => !v)} accent={accent}
          />
        </>
      )}

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
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
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
