import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { languageTheme } from './languageTheme'
import { getAudioUrl, playAudioEl } from './utils'
import { calculateStoryReadability, buildVocabMatcher, segmentLine, namesFor, particlesFor, splitSpeaker, normalizeReadingMode, DEFAULT_READING_MODE } from './storyReading'
import { splitScene, stripSceneEmoji } from './sceneReading'
import { prefsGet, prefsMerge } from './offline'
import { buildTimeline, tokenAtTime, startOfToken, DEFAULT_RATE, SPEED_RATES } from './readAlong'
import { supabase } from './supabase'
import { loadTtsAudio, utteranceAudio } from './ttsAudio'
import { claimPlayback, stopAllAudio } from './audioPlayback'
import { ensureAudio } from './audioCache'
import { isOnline } from './useOnline'
import { enqueueStoryRead } from './syncQueue'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'

// The classic reader's prefs object. Shared verbatim so a reading mode picked in
// one reader is the mode every reader opens with.
const READER_PREFS_KEY = 'reader:prefs'

// Shared, presentation-independent reader behavior for the paced + chat readers:
// beat parsing, % known, tap-to-reveal progression, per-line audio read-along,
// finish/mark-read (online/offline parity with the classic reader), word lookup,
// add-to-deck, and keyboard control. Each renderer draws the beats however it
// likes; this hook owns everything else.
export function useStoryReaderCore({ story, vocabMap, userCards, setUserCards, track, isRead, session, onMarkRead, firstMission = false }) {
  const theme = languageTheme(track.language)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  // Beat index -> story_utterances.id, for stories that have been split into
  // per-line narration. Empty for a story that has not been synced, which is
  // exactly the legacy path.
  const [utteranceIds, setUtteranceIds] = useState({})
  const [readingMode, setReadingMode] = useState(DEFAULT_READING_MODE)
  const [showEn, setShowEn] = useState(false)
  const pickedRef = useRef(false)      // the learner chose a mode this session
  const ratePickedRef = useRef(false)  // the learner chose a rate this session (own flag: rate and mode must not gate each other)
  const firstSaveRef = useRef(true)    // don't persist the un-loaded default
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)
  const finishedRef = useRef(false)
  const runRef = useRef(0)
  const audioElRef = useRef(null)
  const advanceBlockedRef = useRef(false)
  // Read-along: which token of the sounding line is being spoken, and the
  // timeline that decides it. The timeline lives in a ref, not state — it is
  // rebuilt per line from audio metadata and must never trigger a render.
  const [activeToken, setActiveToken] = useState(-1)
  const timelineRef = useRef(null)
  const [rate, setRateState] = useState(DEFAULT_RATE)
  const rateRef = useRef(DEFAULT_RATE)

  const matcher = useMemo(() => buildVocabMatcher(vocabMap, track.language), [vocabMap, track.language])
  const names = useMemo(() => namesFor(track.language), [track.language])
  const particles = useMemo(() => particlesFor(track.language), [track.language])
  const isScene = story.presentation === 'scene'
  const beats = useMemo(() => {
    // english_content is authored newline-aligned with content, so a beat's
    // translation is the English line at the same index. Guard by index so a
    // mismatch just yields no per-line English rather than the wrong line.
    const englishLines = (story.english_content || '').split('\n').filter(Boolean)
    return (story.content || '').split('\n').filter(Boolean).map((line, idx) => {
      const { emoji, text: body } = isScene ? splitScene(line) : { emoji: '', text: line }
      const { speaker, text } = splitSpeaker(body)
      return { speaker, text, emoji, english: englishLines[idx] || '', tokens: segmentLine(text, matcher, names, particles) }
    })
  }, [story.content, story.english_content, isScene, matcher, names, particles])
  const readContent = useMemo(() => (isScene ? stripSceneEmoji(story.content) : story.content), [isScene, story.content])
  const readability = useMemo(
    () => calculateStoryReadability({ content: readContent, vocabMap, cards: userCards, language: track.language }),
    [readContent, vocabMap, userCards, track.language])
  const total = beats.length
  const ttsLang = track.language === 'japanese' ? 'ja-JP' : track.language === 'chinese' ? 'zh-CN' : 'ru-RU'

  const go = useCallback((i) => setCur(c => Math.max(0, Math.min(total - 1, i ?? c))), [total])

  const stopPlay = useCallback(() => {
    runRef.current += 1
    setPlaying(false)
    // Silences both channels (element and speech synthesis) and clears the
    // shared "who is speaking" registry, so leaving the reader mid-line cannot
    // leave a voice running under the next screen.
    stopAllAudio()
    if (audioElRef.current) audioElRef.current.pause()
    // Drop the spotlight with the sound. Clearing the timeline too means a stale
    // one can never light a word on the next line before its metadata arrives.
    timelineRef.current = null
    setActiveToken(-1)
  }, [])

  const finish = useCallback(async () => {
    stopPlay()
    setDone(true)
    if (finishedRef.current) return
    finishedRef.current = true
    if (!isRead) {
      if (isOnline()) {
        const { error } = await supabase.from('story_reads').upsert({ user_id: session.user.id, story_id: story.id })
        if (!error) { if (onMarkRead) onMarkRead(story.id) }
      } else {
        await enqueueStoryRead({ userId: session.user.id, storyId: story.id })
        if (onMarkRead) onMarkRead(story.id)
      }
      trackEvent(EVENTS.STORY_COMPLETED, { tier: story.tier, known_pct: readability.knownPct })
      if (firstMission) trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct: readability.knownPct })
    }
  }, [isRead, session, story.id, story.tier, onMarkRead, stopPlay, firstMission, readability.knownPct])

  const advance = useCallback(() => { if (cur >= total - 1) finish(); else go(cur + 1) }, [cur, total, finish, go])

  // The narration for one beat, best source first:
  //   1. the generated per-utterance clip (a real voice, correct pronunciation),
  //   2. the legacy whole-story per-line file,
  //   3. the browser's speech synthesis.
  // A story part-way through generation therefore plays generated lines where
  // they exist and falls back per line, never going silent.
  const audioForBeat = (index) => {
    const utteranceId = utteranceIds[index]
    const generated = utteranceId ? utteranceAudio(utteranceId).utterance : null
    if (generated) return generated
    return story.has_audio ? getAudioUrl('stories/' + story.id + '/' + index + '.mp3') : null
  }

  const speakFrom = (index, runId) => {
    if (runId !== runRef.current) return
    if (index >= beats.length) { finish(); return }
    setCur(index)
    const nextBeat = () => { if (runId === runRef.current) speakFrom(index + 1, runId) }
    const viaSynth = () => {
      try {
        const u = new SpeechSynthesisUtterance(beats[index].text)
        u.lang = ttsLang; u.rate = 0.9
        u.onend = nextBeat
        window.speechSynthesis.speak(u)
      } catch { setPlaying(false) }
    }
    const url = audioForBeat(index)
    if (url) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      const el = audioElRef.current
      // Take the floor before playing: a word lookup or a flashcard clip must
      // not keep speaking underneath the story.
      claimPlayback(el)
      el.onended = nextBeat

      // A new line starts with no timeline — nothing is lit until this clip's
      // own metadata says how long it is.
      timelineRef.current = null
      setActiveToken(-1)
      // playbackRate resets to defaultPlaybackRate whenever a src loads, so
      // both are set.
      el.defaultPlaybackRate = rateRef.current
      el.playbackRate = rateRef.current

      const buildFromEl = () => {
        // Keyed to the run id: this only drops metadata arriving after playback
        // was stopped or restarted (runRef only changes in stopPlay/togglePlay).
        // Per-line staleness is handled separately — onloadedmetadata is
        // reassigned to a fresh closure on every line, so an event from a line
        // we've already moved past can't fire this one.
        if (runId !== runRef.current) return
        el.playbackRate = rateRef.current
        const seconds = el.duration
        if (!Number.isFinite(seconds) || seconds <= 0) return
        timelineRef.current = buildTimeline(beats[index].tokens, { durationMs: seconds * 1000 })
      }
      el.onloadedmetadata = buildFromEl
      el.ondurationchange = buildFromEl

      playAudioEl(el, url, viaSynth)
      // Build immediately after assigning src: covers playAudioEl's replay-in-
      // place fast path (same clip already loaded -> just play(), no metadata
      // event fires, but el.duration is already correct). On a fresh load,
      // el.duration is NaN here and the guard above leaves the timeline null
      // until onloadedmetadata fires with the new clip's real duration.
      buildFromEl()
      // Warm the next line while this one plays, so read-along does not stutter
      // between beats.
      const upcoming = audioForBeat(index + 1)
      if (upcoming) ensureAudio(upcoming)
    } else viaSynth()
  }

  // Replay a single line without disturbing the read-along position - the
  // "say that again" affordance a learner reaches for mid-story.
  const replayLine = (index) => {
    const url = audioForBeat(index == null ? cur : index)
    if (!url) { speakWord(beats[index == null ? cur : index].text); return }
    if (!audioElRef.current) audioElRef.current = new Audio()
    const el = audioElRef.current
    claimPlayback(el)
    el.onended = null
    el.defaultPlaybackRate = rateRef.current
    el.playbackRate = rateRef.current
    playAudioEl(el, url, () => speakWord(beats[index == null ? cur : index].text))
  }

  const togglePlay = () => {
    if (playing) { stopPlay(); return }
    runRef.current += 1
    setPlaying(true)
    speakFrom(cur >= beats.length - 1 ? 0 : cur, runRef.current)
  }

  const speakWord = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  // The ticker. rAF rather than timeupdate: timeupdate fires roughly 4x a
  // second, which is visibly late on a one-syllable word. The functional
  // setState bails out when the index is unchanged, so 60Hz polling causes a
  // render only when the spotlight actually moves.
  // This also runs at ~60Hz on the speech-synthesis fallback, where the
  // timeline is permanently null (tokenAtTime is never reached) — a deliberate
  // choice, not an oversight: rAF throttles itself when the tab is backgrounded,
  // and the timeline arrives asynchronously from audio metadata, so gating the
  // effect itself on "will there be a timeline" isn't possible up front.
  useEffect(() => {
    if (!playing) return undefined
    let raf = 0
    const tick = () => {
      const el = audioElRef.current
      const tl = timelineRef.current
      if (el && tl) {
        const idx = tokenAtTime(tl, el.currentTime * 1000)
        setActiveToken(prev => (prev === idx ? prev : idx))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Start reading from a given word of the line now sounding. Returns false
  // when there is no timeline (browser-speech fallback, or metadata not in
  // yet) so a caller can fall back to opening the lookup sheet instead.
  const seekToToken = useCallback((i) => {
    const el = audioElRef.current
    const tl = timelineRef.current
    if (!el || !tl) return false
    const start = startOfToken(tl, i)
    if (start == null) return false
    try { el.currentTime = start / 1000 } catch { return false }
    setActiveToken(i)
    return true
  }, [])

  const pickRate = useCallback((next) => {
    if (SPEED_RATES.indexOf(next) === -1) return
    ratePickedRef.current = true
    rateRef.current = next
    setRateState(next)
    const el = audioElRef.current
    if (el) { el.defaultPlaybackRate = next; el.playbackRate = next }
  }, [])

  const selectWord = (vocab, status) => { stopPlay(); setSelected({ word: vocab.word, vocab, status }) }

  // The sentence the learner is reading when they save a word — stored on the
  // card so review shows real context. Prefer the beat that actually contains the
  // word (chat/scene taps can be on an earlier bubble); fall back to the current beat.
  const sourceSentenceFor = (vocab) => {
    const inBeat = beats.find(b => b.tokens.some(t => t.vocab && t.vocab.id === vocab.id))
    return (inBeat || beats[cur] || {}).text || null
  }

  const addToDeck = async (vocab) => {
    if (!vocab || !vocab.id || (userCards && userCards[vocab.id])) return
    const row = {
      user_id: session.user.id, vocab_id: vocab.id,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
      source_sentence: sourceSentenceFor(vocab),
    }
    let { error } = await supabase.from('cards').insert(row)
    // Degrade gracefully if the source_sentence migration isn't applied yet:
    // retry without the column so add-to-deck never breaks.
    if (error && /source_sentence/.test(error.message || '')) {
      const { source_sentence, ...rest } = row
      void source_sentence
      ;({ error } = await supabase.from('cards').insert(rest))
    }
    if (!error && setUserCards) setUserCards(prev => ({ ...prev, [vocab.id]: { vocab_id: vocab.id, state: 'new' } }))
  }

  const start = () => { setCur(0); setStarted(true) }
  const backToStart = () => { stopPlay(); setStarted(false) }

  const setAdvanceBlocked = useCallback((v) => { advanceBlockedRef.current = !!v }, [])

  const answerQuestion = useCallback((qid, optIndex) => {
    setAnswers(a => (a[qid] !== undefined ? a : { ...a, [qid]: optIndex }))
  }, [])

  // Load end-of-story comprehension questions (parity with the classic reader;
  // a no-op for stories that have none). The reader stays mounted across a
  // "next story" swap, so clear the prior story's Q&A before the new set loads.
  useEffect(() => {
    let active = true
    /* eslint-disable react-hooks/set-state-in-effect */
    setAnswers({})
    setQuestions([])
    setUtteranceIds({})
    /* eslint-enable react-hooks/set-state-in-effect */
    supabase.from('story_questions').select('*').eq('story_id', story.id).order('question_number', { ascending: true })
      .then(({ data }) => { if (active) setQuestions(data || []) })

    // Per-line narration, if this story has been split into utterances. Every
    // failure mode here is benign: no rows, an unapplied migration or being
    // offline all leave `utteranceIds` empty, and the reader falls back to the
    // legacy per-line files and then to speech synthesis.
    supabase.from('story_utterances').select('id, utterance_index').eq('story_id', story.id)
      .then(async ({ data }) => {
        if (!active || !data || data.length === 0) return
        const byIndex = {}
        for (const row of data) byIndex[row.utterance_index] = row.id
        await loadTtsAudio('story_utterance', data.map(r => r.id))
        if (active) setUtteranceIds(byIndex)
      })
      .catch(() => { /* legacy narration path */ })
    return () => { active = false }
  }, [story.id])

  // Reading mode is a durable preference shared with the classic reader — same
  // prefs object, same key — so the scaffolding a learner picks follows them
  // between story formats. Loading it never re-parses the story (it is state of
  // its own, not an input to the beat memo). If the learner already picked a
  // mode while the read was in flight, their choice wins over the stored one.
  useEffect(() => {
    let active = true
    prefsGet(READER_PREFS_KEY).then((saved) => {
      // Each setting carries its own picked guard, checked independently — a
      // reading-mode pick must not suppress the saved rate, and vice versa.
      if (!active) return
      if (!pickedRef.current && saved && saved.furiganaMode) setReadingMode(normalizeReadingMode(saved.furiganaMode))
      if (!ratePickedRef.current && saved && SPEED_RATES.indexOf(saved.playbackRate) !== -1) {
        setRateState(saved.playbackRate)
        rateRef.current = saved.playbackRate
      }
    })
    return () => { active = false }
  }, [])

  // Persist mode changes, merged over whatever is stored, so writing our one
  // field never clobbers the classic reader's lens / serif / English flags.
  // Skipping only the very first run keeps the initial default from overwriting
  // a saved value; every later change (a load or a pick) is worth writing back.
  useEffect(() => {
    if (firstSaveRef.current) { firstSaveRef.current = false; return }
    prefsMerge(READER_PREFS_KEY, { furiganaMode: readingMode, playbackRate: rate })
  }, [readingMode, rate])

  const pickReadingMode = useCallback((mode) => {
    pickedRef.current = true
    setReadingMode(normalizeReadingMode(mode))
  }, [])

  useEffect(() => {
    if (!started) return undefined
    const onKey = (e) => {
      if (selected && e.key === 'Escape') { setSelected(null); return }
      if (selected || done) return
      if (e.key === 'ArrowRight' || e.key === ' ') { if (advanceBlockedRef.current) return; e.preventDefault(); advance() }
      if (e.key === 'ArrowLeft') go(cur - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, cur, go, advance, selected, done])

  useEffect(() => () => { stopPlay() }, [stopPlay])

  return {
    theme, reduceMotion, beats, readability, total, ttsLang,
    started, cur, done, playing, selected, readingMode, showEn, activeToken, rate,
    setReadingMode: pickReadingMode, setShowEn, setSelected, setRate: pickRate,
    go, advance, finish, stopPlay, togglePlay, speakWord, replayLine, selectWord, addToDeck,
    seekToToken,
    start, backToStart, setAdvanceBlocked,
    questions, answers, answerQuestion,
  }
}
