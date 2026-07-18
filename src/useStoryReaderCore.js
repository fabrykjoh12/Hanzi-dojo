import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { languageTheme } from './languageTheme'
import { getAudioUrl, playAudioEl } from './utils'
import { calculateStoryReadability, buildVocabMatcher, segmentLine, namesFor, particlesFor, splitSpeaker } from './storyReading'
import { splitScene, stripSceneEmoji } from './sceneReading'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { isOnline } from './useOnline'
import { enqueueStoryRead } from './syncQueue'
import { track as trackEvent, trackOnce, EVENTS } from './analytics'

// One-time XP for finishing a story — same amount/name as the classic reader.
export const STORY_FINISH_XP = 10

// Shared, presentation-independent reader behavior for the paced + chat readers:
// beat parsing, % known, tap-to-reveal progression, per-line audio read-along,
// finish/mark-read (online/offline parity with the classic reader), word lookup,
// add-to-deck, and keyboard control. Each renderer draws the beats however it
// likes; this hook owns everything else.
export function useStoryReaderCore({ story, vocabMap, userCards, setUserCards, track, isRead, session, profile, onMarkRead, firstMission = false }) {
  const theme = languageTheme(track.language)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [showPy, setShowPy] = useState(true)
  const [showEn, setShowEn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)
  const finishedRef = useRef(false)
  const runRef = useRef(0)
  const audioElRef = useRef(null)
  const advanceBlockedRef = useRef(false)

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
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
    if (audioElRef.current) audioElRef.current.pause()
  }, [])

  const finish = useCallback(async () => {
    stopPlay()
    setDone(true)
    if (finishedRef.current) return
    finishedRef.current = true
    if (!isRead) {
      if (isOnline()) {
        const { error } = await supabase.from('story_reads').upsert({ user_id: session.user.id, story_id: story.id })
        if (!error) { if (profile) awardXp(session, profile, STORY_FINISH_XP); if (onMarkRead) onMarkRead(story.id) }
      } else {
        await enqueueStoryRead({ userId: session.user.id, storyId: story.id, xpDelta: STORY_FINISH_XP })
        if (onMarkRead) onMarkRead(story.id)
      }
      trackEvent(EVENTS.STORY_COMPLETED, { tier: story.tier, known_pct: readability.knownPct })
      if (firstMission) trackOnce(EVENTS.FIRST_STORY_COMPLETED, { known_pct: readability.knownPct })
    }
  }, [isRead, session, story.id, story.tier, profile, onMarkRead, stopPlay, firstMission, readability.knownPct])

  const advance = useCallback(() => { if (cur >= total - 1) finish(); else go(cur + 1) }, [cur, total, finish, go])

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
    if (story.has_audio) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      const el = audioElRef.current
      el.onended = nextBeat
      playAudioEl(el, getAudioUrl('stories/' + story.id + '/' + index + '.mp3'), viaSynth)
    } else viaSynth()
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
    /* eslint-enable react-hooks/set-state-in-effect */
    supabase.from('story_questions').select('*').eq('story_id', story.id).order('question_number', { ascending: true })
      .then(({ data }) => { if (active) setQuestions(data || []) })
    return () => { active = false }
  }, [story.id])

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
    started, cur, done, playing, selected, showPy, showEn,
    setShowPy, setShowEn, setSelected,
    go, advance, finish, stopPlay, togglePlay, speakWord, selectWord, addToDeck,
    start, backToStart, setAdvanceBlocked,
    questions, answers, answerQuestion,
  }
}
