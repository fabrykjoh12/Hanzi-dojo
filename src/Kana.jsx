import { useState, useRef, useEffect } from 'react'
import { shuffle } from './utils'
import { prefsGet, prefsSet } from './offline'
import { recordMiss, missCount, weightedSample } from './drillMemory'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, Languages, Check, X, RotateCcw, CheckCircle2, Sparkles, Keyboard, MousePointerClick,
  GraduationCap, ChevronLeft, ChevronRight,
} from 'lucide-react'

const ACCENT = '#2E3A6E'
const QUESTION_COUNT = 15

// Gojūon rows (+ dakuten/handakuten), hiragana and katakana side by side —
// so learners can pick exactly which rows to drill, Kana!-app style.
// Each item: [hiragana, katakana, romaji].
const ROWS = [
  { key: 'a',  label: 'あ・ア', items: [['あ','ア','a'],['い','イ','i'],['う','ウ','u'],['え','エ','e'],['お','オ','o']] },
  { key: 'ka', label: 'か・カ', items: [['か','カ','ka'],['き','キ','ki'],['く','ク','ku'],['け','ケ','ke'],['こ','コ','ko']] },
  { key: 'sa', label: 'さ・サ', items: [['さ','サ','sa'],['し','シ','shi'],['す','ス','su'],['せ','セ','se'],['そ','ソ','so']] },
  { key: 'ta', label: 'た・タ', items: [['た','タ','ta'],['ち','チ','chi'],['つ','ツ','tsu'],['て','テ','te'],['と','ト','to']] },
  { key: 'na', label: 'な・ナ', items: [['な','ナ','na'],['に','ニ','ni'],['ぬ','ヌ','nu'],['ね','ネ','ne'],['の','ノ','no']] },
  { key: 'ha', label: 'は・ハ', items: [['は','ハ','ha'],['ひ','ヒ','hi'],['ふ','フ','fu'],['へ','ヘ','he'],['ほ','ホ','ho']] },
  { key: 'ma', label: 'ま・マ', items: [['ま','マ','ma'],['み','ミ','mi'],['む','ム','mu'],['め','メ','me'],['も','モ','mo']] },
  { key: 'ya', label: 'や・ヤ', items: [['や','ヤ','ya'],['ゆ','ユ','yu'],['よ','ヨ','yo']] },
  { key: 'ra', label: 'ら・ラ', items: [['ら','ラ','ra'],['り','リ','ri'],['る','ル','ru'],['れ','レ','re'],['ろ','ロ','ro']] },
  { key: 'wa', label: 'わ・ワ', items: [['わ','ワ','wa'],['を','ヲ','wo'],['ん','ン','n']] },
  { key: 'ga', label: 'が・ガ', items: [['が','ガ','ga'],['ぎ','ギ','gi'],['ぐ','グ','gu'],['げ','ゲ','ge'],['ご','ゴ','go']] },
  { key: 'za', label: 'ざ・ザ', items: [['ざ','ザ','za'],['じ','ジ','ji'],['ず','ズ','zu'],['ぜ','ゼ','ze'],['ぞ','ゾ','zo']] },
  { key: 'da', label: 'だ・ダ', items: [['だ','ダ','da'],['ぢ','ヂ','ji'],['づ','ヅ','zu'],['で','デ','de'],['ど','ド','do']] },
  { key: 'ba', label: 'ば・バ', items: [['ば','バ','ba'],['び','ビ','bi'],['ぶ','ブ','bu'],['べ','ベ','be'],['ぼ','ボ','bo']] },
  { key: 'pa', label: 'ぱ・パ', items: [['ぱ','パ','pa'],['ぴ','ピ','pi'],['ぷ','プ','pu'],['ぺ','ペ','pe'],['ぽ','ポ','po']] },
]

// Typed answers accept the common Hepburn/kunrei spellings interchangeably.
const ROMAJI_VARIANTS = {
  shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi'], wo: ['o'],
}
function romajiMatches(input, romaji) {
  const t = (input || '').trim().toLowerCase()
  if (t === romaji) return true
  return (ROMAJI_VARIANTS[romaji] || []).indexOf(t) !== -1
}

// Say one kana aloud with the browser's Japanese TTS — the tap-to-hear of a
// reference chart, no recorded audio needed.
function speakKana(text) {
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = 0.8
    s.speak(u)
  } catch { /* speech not available */ }
}

// Practice | Chart tab switch, shown at the top of both setup views.
function ViewTabs({ view, setView, accent }) {
  const tab = (key, label) => (
    <button key={key} onClick={() => setView(key)} style={{
      padding: '8px 20px', borderRadius: '999px', cursor: 'pointer',
      border: '1px solid ' + (view === key ? accent + '66' : 'var(--border)'),
      background: view === key ? accent + '14' : 'var(--surface)',
      color: view === key ? accent : 'var(--text-muted)',
      fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
    }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
      {tab('learn', 'Learn')}
      {tab('practice', 'Practice')}
      {tab('chart', 'Chart')}
    </div>
  )
}

// Browsable gojūon chart — every kana of the chosen script, tap to hear.
function KanaChart({ script }) {
  const useKata = script === 'kata'
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {ROWS.map(row => (
        <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {row.items.map(([h, k, r]) => {
            const kana = useKata ? k : h
            return (
              <button key={r + kana} onClick={() => speakKana(kana)} aria-label={'Play ' + r} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '12px 4px', borderRadius: '13px', cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}>
                <span style={{ fontFamily: "'Noto Sans JP'", fontSize: '24px', color: 'var(--text)', lineHeight: 1 }}>{kana}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{r}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Build the drill pool from selected rows + script choice.
function buildPool(rowKeys, script) {
  const pool = []
  for (const row of ROWS) {
    if (!rowKeys.has(row.key)) continue
    for (const [h, k, r] of row.items) {
      if (script === 'hira' || script === 'both') pool.push([h, r])
      if (script === 'kata' || script === 'both') pool.push([k, r])
    }
  }
  return pool
}

// Lessons for the guided learn-then-quiz flow: one gojūon row at a time, base
// rows first, then the dakuten/handakuten rows.
const LESSONS = ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa', 'ga', 'za', 'da', 'ba', 'pa']
const PROGRESS_KEY = 'kanaLessonsDone'
// Every romaji, used as the distractor bag in learn mode so even a 3-kana row
// (や, わ) can still be quizzed with 4 tap-choices.
const ALL_ROMAJI = ROWS.flatMap(r => r.items.map(it => it[2]))
function rowByKey(key) { return ROWS.find(r => r.key === key) }

// Multiple-choice options: correct + 3 distinct-romaji distractors. `distractorRomaji`
// widens the distractor bag beyond the question pool (learn mode).
function buildQuestions(pool, distractorRomaji) {
  const allRomaji = distractorRomaji && distractorRomaji.length ? distractorRomaji : pool.map(p => p[1])
  return weightedSample(pool, p => p[0], 'kana', Math.min(QUESTION_COUNT, pool.length), shuffle).map(([kana, romaji]) => {
    const distractors = []
    const used = new Set([romaji])
    const bag = shuffle(allRomaji)
    for (let i = 0; i < bag.length && distractors.length < 3; i += 1) {
      if (!used.has(bag[i])) { used.add(bag[i]); distractors.push(bag[i]) }
    }
    return { kana, romaji, options: shuffle([romaji, ...distractors]) }
  })
}

export default function Kana({ profile, onBack }) {
  const isMobile = useIsMobile()
  const isJapanese = profile.active_language === 'japanese'
  const [script, setScript] = useState('hira')            // 'hira' | 'kata' | 'both'
  const [view, setView] = useState('practice')            // 'practice' | 'chart' | 'learn'
  const [learnLesson, setLearnLesson] = useState(0)       // index into LESSONS
  const [answerMode, setAnswerMode] = useState('choice')  // 'choice' | 'typed'
  const [selectedRows, setSelectedRows] = useState(() => new Set(['a', 'ka', 'sa', 'ta', 'na']))
  const [started, setStarted] = useState(false)
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)     // choice mode: chosen romaji
  const [typed, setTyped] = useState('')         // typed mode: input value
  const [typedResult, setTypedResult] = useState(null)   // null | 'correct' | 'wrong'
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)
  const [doneLessons, setDoneLessons] = useState(() => new Set())
  const inputRef = useRef(null)

  // Restore completed-lesson progress once on mount, and resume at the first
  // lesson the learner hasn't cleared yet. Durable across sessions and NOT wiped
  // by "Clear downloads" (prefs store). Degrades to no-op if IndexedDB is absent.
  useEffect(() => {
    let live = true
    prefsGet(PROGRESS_KEY).then((saved) => {
      if (!live || !Array.isArray(saved) || !saved.length) return
      const done = new Set(saved.filter((k) => LESSONS.includes(k)))
      setDoneLessons(done)
      const firstOpen = LESSONS.findIndex((k) => !done.has(k))
      if (firstOpen > 0) setLearnLesson(firstOpen)
    })
    return () => { live = false }
  }, [])

  // Pass mark for a learn lesson: two-thirds correct. Meaningful enough that the
  // checkmark means "I can read these", forgiving enough not to feel punishing.
  function markLessonDone(finalCorrect, total) {
    if (view !== 'learn' || total === 0) return
    if (finalCorrect / total < 2 / 3) return
    const key = LESSONS[learnLesson]
    if (!key || doneLessons.has(key)) return
    const nx = new Set(doneLessons)
    nx.add(key)
    setDoneLessons(nx)
    prefsSet(PROGRESS_KEY, [...nx])
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  function toggleRow(key) {
    setSelectedRows(prev => {
      const nx = new Set(prev)
      if (nx.has(key)) nx.delete(key)
      else nx.add(key)
      return nx
    })
  }
  function selectAll() { setSelectedRows(new Set(ROWS.map(r => r.key))) }
  function selectBasics() { setSelectedRows(new Set(['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa'])) }

  // Typed mode only needs one kana to drill; choice mode needs 4 distinct
  // romaji so the options aren't full of duplicates (short rows like や/わ
  // would otherwise be unstartable in choice mode, or offer <4 real choices).
  function canStart(pool) {
    if (answerMode === 'typed') return pool.length > 0
    return new Set(pool.map(p => p[1])).size >= 4
  }

  function start() {
    const pool = buildPool(selectedRows, script)
    if (!canStart(pool)) return
    setQuestions(buildQuestions(pool))
    setIdx(0); setPicked(null); setTyped(''); setTypedResult(null)
    setCorrectCount(0); setDone(false)
    setStarted(true)
  }

  // Learn flow: quiz just the current lesson's row (both scripts), with
  // distractors drawn from all kana so even short rows are quizzable in tap mode.
  function startLesson() {
    const row = rowByKey(LESSONS[learnLesson])
    if (!row) return
    const pool = []
    for (const [h, k, r] of row.items) { pool.push([h, r]); pool.push([k, r]) }
    setQuestions(buildQuestions(pool, ALL_ROMAJI))
    setIdx(0); setPicked(null); setTyped(''); setTypedResult(null)
    setCorrectCount(0); setDone(false)
    setStarted(true)
  }

  const q = questions[idx]
  const answered = picked !== null || typedResult !== null

  function chooseOption(opt) {
    if (answered) return
    setPicked(opt)
    if (opt === q.romaji) setCorrectCount(c => c + 1)
    else recordMiss('kana', q.kana)
  }

  function submitTyped() {
    if (answered || !typed.trim()) return
    const ok = romajiMatches(typed, q.romaji)
    setTypedResult(ok ? 'correct' : 'wrong')
    if (ok) setCorrectCount(c => c + 1)
    else recordMiss('kana', q.kana)
  }

  function finish(finalCorrect) {
    setDone(true)
    markLessonDone(finalCorrect, questions.length)
  }

  function next() {
    if (idx + 1 >= questions.length) finish(correctCount)
    else {
      setPicked(null); setTyped(''); setTypedResult(null)
      setIdx(i => i + 1)
      if (answerMode === 'typed' && inputRef.current) setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
    }
  }

  if (!isJapanese) {
    return (
      <div style={pageShell}>
        <Centered>
          <Languages size={30} strokeWidth={1.8} color={ACCENT} style={{ marginBottom: '14px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>Kana practice is for Japanese</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Switch your active language to Japanese to drill hiragana and katakana.
          </p>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
        </Centered>
      </div>
    )
  }

  // ── Learn: study a lesson's row (tap to hear), then quiz just those ────────
  if (!started && view === 'learn') {
    const row = rowByKey(LESSONS[learnLesson]) || ROWS[0]
    const atFirst = learnLesson <= 0
    const atLast = learnLesson >= LESSONS.length - 1
    const navBtn = (disabled) => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '8px 14px', borderRadius: '999px',
      border: '1px solid var(--border)', background: 'var(--surface)',
      color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
      fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
      cursor: disabled ? 'default' : 'pointer',
    })
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '620px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '22px 0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <GraduationCap size={17} strokeWidth={1.8} color={ACCENT} /> Learn kana
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              Lesson {learnLesson + 1} of {LESSONS.length}
              {doneLessons.has(LESSONS[learnLesson]) && (
                <span aria-label="Lesson cleared" title="Lesson cleared" style={{ display: 'inline-flex', width: '24px', height: '24px', borderRadius: '999px', background: '#5C7155', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={15} strokeWidth={3} color="#fff" />
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
              {doneLessons.size} of {LESSONS.length} lessons cleared · tap a kana to hear it, then quiz yourself.
            </p>
          </div>
          <ViewTabs view={view} setView={setView} accent={ACCENT} />
          {/* Lesson map — filled = cleared, ringed = current. Tap to jump. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '16px' }}>
            {LESSONS.map((key, i) => {
              const cleared = doneLessons.has(key)
              const current = i === learnLesson
              const initial = (rowByKey(key) || ROWS[0]).items[0][0]
              return (
                <button key={key} onClick={() => setLearnLesson(i)} aria-label={'Lesson ' + (i + 1) + (cleared ? ' (cleared)' : '')} style={{
                  width: '34px', height: '34px', borderRadius: '10px', cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'", fontSize: '16px', lineHeight: 1,
                  border: '1.5px solid ' + (current ? ACCENT : cleared ? '#5C715544' : 'var(--border)'),
                  background: cleared ? '#5C715518' : current ? ACCENT + '12' : 'var(--surface)',
                  color: cleared ? '#5C7155' : current ? ACCENT : 'var(--text-muted)',
                  fontWeight: current ? 800 : 600,
                }}>{cleared ? '✓' : initial}</button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {row.items.map(([h, k, r]) => (
              <button key={r} onClick={() => speakKana(h)} aria-label={'Play ' + r} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                padding: '14px 4px', borderRadius: '14px', cursor: 'pointer',
                border: '1px solid ' + ACCENT + '22', background: ACCENT + '08',
              }}>
                <span style={{ fontFamily: "'Noto Sans JP'", fontSize: '26px', color: 'var(--text)', lineHeight: 1 }}>{h}</span>
                <span style={{ fontFamily: "'Noto Sans JP'", fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1 }}>{k}</span>
                <span style={{ fontSize: '11px', color: ACCENT, fontWeight: 700 }}>{r}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <button disabled={atFirst} onClick={() => !atFirst && setLearnLesson(l => l - 1)} style={navBtn(atFirst)}>
              <ChevronLeft size={15} strokeWidth={2.2} /> Prev
            </button>
            <span style={{ fontFamily: "'Noto Sans JP'", fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>{row.label}</span>
            <button disabled={atLast} onClick={() => !atLast && setLearnLesson(l => l + 1)} style={navBtn(atLast)}>
              Next <ChevronRight size={15} strokeWidth={2.2} />
            </button>
          </div>
          <PrimaryButton onClick={startLesson} icon={Sparkles}>Quiz these kana</PrimaryButton>
        </div>
      </div>
    )
  }

  // ── Chart: browsable gojūon grid, tap any kana to hear it ─────────────────
  if (!started && view === 'chart') {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '620px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '22px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <Languages size={17} strokeWidth={1.8} color={ACCENT} /> Kana chart
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Tap a kana to hear it</h1>
          </div>
          <ViewTabs view={view} setView={setView} accent={ACCENT} />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            {[['hira', 'Hiragana'], ['kata', 'Katakana']].map(([key, label]) => (
              <button key={key} onClick={() => setScript(key)} style={{
                padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
                border: '1px solid ' + (script === key ? ACCENT + '66' : 'var(--border)'),
                background: script === key ? ACCENT + '14' : 'var(--surface)',
                color: script === key ? ACCENT : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              }}>{label}</button>
            ))}
          </div>
          <KanaChart script={script === 'kata' ? 'kata' : 'hira'} />
        </div>
      </div>
    )
  }

  // ── Setup: script + rows + answer mode ────────────────────────────────────
  if (!started) {
    const pool = buildPool(selectedRows, script)
    const poolSize = pool.length
    const startDisabled = !canStart(pool)
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '620px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '22px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <Languages size={17} strokeWidth={1.8} color={ACCENT} /> Kana practice
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Choose your rows</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
              Pick the gojūon rows to drill. Rows you've missed this session are marked.
            </p>
          </div>

          <ViewTabs view={view} setView={setView} accent={ACCENT} />

          {/* Script + answer-mode toggles */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            {[['hira', 'Hiragana'], ['kata', 'Katakana'], ['both', 'Both']].map(([key, label]) => (
              <button key={key} onClick={() => setScript(key)} style={{
                padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
                border: '1px solid ' + (script === key ? ACCENT + '66' : 'var(--border)'),
                background: script === key ? ACCENT + '14' : 'var(--surface)',
                color: script === key ? ACCENT : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              }}>{label}</button>
            ))}
            <span style={{ width: '1px', background: 'var(--border)', margin: '4px 2px' }} />
            {[['choice', 'Tap', MousePointerClick], ['typed', 'Type', Keyboard]].map(([key, label, Icon]) => (
              <button key={key} onClick={() => setAnswerMode(key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
                border: '1px solid ' + (answerMode === key ? ACCENT + '66' : 'var(--border)'),
                background: answerMode === key ? ACCENT + '14' : 'var(--surface)',
                color: answerMode === key ? ACCENT : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              }}>
                <Icon size={14} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>

          {/* Row grid */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
            {ROWS.map(row => {
              const active = selectedRows.has(row.key)
              const missed = row.items.some(([h, k]) => missCount('kana', h) > 0 || missCount('kana', k) > 0)
              return (
                <button key={row.key} onClick={() => toggleRow(row.key)} style={{
                  position: 'relative', padding: '12px 6px', borderRadius: '13px', cursor: 'pointer',
                  border: '1.5px solid ' + (active ? ACCENT : 'var(--border)'),
                  background: active ? ACCENT + '10' : 'var(--surface)',
                  fontFamily: "'Noto Sans JP'", fontSize: '16px',
                  color: active ? ACCENT : 'var(--text)', fontWeight: 600,
                }}>
                  {row.label}
                  {missed && (
                    <span title="Missed this session" style={{
                      position: 'absolute', top: '6px', right: '7px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#D97706',
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
            <button onClick={selectBasics} style={quickBtn}>Basics (あ–わ)</button>
            <button onClick={selectAll} style={quickBtn}>All rows</button>
            <button onClick={() => setSelectedRows(new Set())} style={quickBtn}>None</button>
          </div>

          <PrimaryButton onClick={start} icon={Sparkles} disabled={startDisabled}>
            {startDisabled
              ? (answerMode === 'typed' ? 'Pick at least one row' : 'Pick enough rows for 4 choices')
              : 'Start · ' + Math.min(QUESTION_COUNT, poolSize) + ' questions'}
          </PrimaryButton>
        </div>
      </div>
    )
  }

  // ── Recap ─────────────────────────────────────────────────────────────────
  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100)
    return (
      <div style={pageShell}>
        <Centered wide>
          <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ACCENT + '10', border: '1px solid ' + ACCENT + '18' }}>
            <CheckCircle2 size={28} strokeWidth={1.9} color={ACCENT} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>
            {view === 'learn' && doneLessons.has(LESSONS[learnLesson]) ? 'Lesson cleared!' : 'Kana complete'}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
            You read <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} correctly.
          </p>
          <div style={{ padding: '16px 10px', borderRadius: '14px', background: ACCENT + '0D', border: '1px solid ' + ACCENT + '22', marginBottom: '22px' }}>
            <div style={{ fontSize: '26px', fontWeight: 760, color: ACCENT, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <SecondaryButton onClick={() => setStarted(false)} icon={ArrowLeft}>
              {view === 'learn' ? 'Lessons' : 'Rows'}
            </SecondaryButton>
            {view === 'learn' && learnLesson < LESSONS.length - 1 ? (
              <PrimaryButton onClick={() => { setLearnLesson(l => l + 1); setDone(false); setStarted(false) }} icon={ChevronRight}>Next lesson</PrimaryButton>
            ) : (
              <PrimaryButton onClick={view === 'learn' ? startLesson : start} icon={RotateCcw}>Again</PrimaryButton>
            )}
          </div>
        </Centered>
      </div>
    )
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────
  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={() => setStarted(false)} icon={ArrowLeft}>{view === 'learn' ? 'Lessons' : 'Rows'}</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {questions.length}</span>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '0 0 26px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: ACCENT, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{ fontSize: '110px', fontFamily: "'Noto Sans JP'", color: 'var(--text)', lineHeight: 1.1 }}>{q.kana}</div>
          {answered && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '10px',
              fontSize: '15px', fontWeight: 750,
              color: (picked === q.romaji || typedResult === 'correct') ? 'var(--success)' : '#DC2626',
            }}>
              {(picked === q.romaji || typedResult === 'correct')
                ? <><Check size={17} strokeWidth={2.4} /> {q.romaji}</>
                : <><X size={17} strokeWidth={2.4} /> {q.romaji}</>}
            </div>
          )}
        </div>

        {answerMode === 'typed' ? (
          <div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                ref={inputRef}
                autoFocus
                value={typed}
                onChange={e => { if (!answered) setTyped(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') { if (answered) next(); else submitTyped() } }}
                placeholder="Type the romaji"
                aria-label="Type the romaji"
                readOnly={answered}
                style={{
                  flex: 1, minWidth: 0, height: '54px', padding: '0 18px',
                  borderRadius: '16px',
                  border: '1.5px solid ' + (typedResult === 'correct' ? 'var(--success)' : typedResult === 'wrong' ? '#DC2626' : 'var(--border)'),
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: '18px', fontFamily: 'Inter, sans-serif',
                }}
              />
              <button
                onClick={answered ? next : submitTyped}
                style={{
                  flexShrink: 0, minWidth: '110px', height: '54px', borderRadius: '16px',
                  border: 'none', background: '#6E8466', color: '#fff',
                  fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                }}
              >
                {answered ? (idx + 1 >= questions.length ? 'Results' : 'Next') : 'Check'}
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600 }}>
              Enter to {answered ? 'continue' : 'check'} · shi/si, tsu/tu, fu/hu all accepted
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {q.options.map(opt => {
                const isCorrect = opt === q.romaji
                const isPicked = opt === picked
                let bc = 'var(--border)', bg = 'var(--surface)'
                if (answered && isCorrect) { bc = 'var(--success)'; bg = 'var(--success-bg)' }
                else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
                return (
                  <button key={opt} onClick={() => chooseOption(opt)} disabled={answered} style={{
                    minHeight: '62px', borderRadius: '15px', cursor: answered ? 'default' : 'pointer',
                    border: '1.5px solid ' + bc, background: bg,
                    fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'Inter, sans-serif',
                    transition: 'border-color 140ms ease, background 140ms ease',
                  }}>
                    {opt}
                  </button>
                )
              })}
            </div>
            {answered && (
              <div style={{ marginTop: '16px' }}>
                <PrimaryButton onClick={next} icon={Sparkles}>
                  {idx + 1 >= questions.length ? 'See results' : 'Next'}
                </PrimaryButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const quickBtn = {
  padding: '7px 14px', borderRadius: '999px', cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-muted)', fontSize: '12.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
}
