import { useState, useRef } from 'react'
import { awardXp } from './xpService'
import { shuffle } from './utils'
import { recordMiss, missCount, weightedSample } from './drillMemory'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, Languages, Check, X, RotateCcw, CheckCircle2, Sparkles, Keyboard, MousePointerClick,
} from 'lucide-react'

const ACCENT = '#2E3A6E'
const QUESTION_COUNT = 15
const XP_PER_CORRECT = 4

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
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
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

// Multiple-choice options: correct + 3 distinct-romaji distractors.
function buildQuestions(pool) {
  const allRomaji = pool.map(p => p[1])
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

export default function Kana({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const isJapanese = profile.active_language === 'japanese'
  const [script, setScript] = useState('hira')            // 'hira' | 'kata' | 'both'
  const [view, setView] = useState('practice')            // 'practice' | 'chart'
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
  const inputRef = useRef(null)

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
    const gain = finalCorrect * XP_PER_CORRECT
    if (gain > 0) awardXp(session, profile, gain, onUpdate)
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
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Kana complete</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
            You read <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} correctly.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
            <div style={{ padding: '16px 10px', borderRadius: '14px', background: ACCENT + '0D', border: '1px solid ' + ACCENT + '22' }}>
              <div style={{ fontSize: '26px', fontWeight: 760, color: ACCENT, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
            </div>
            <div style={{ padding: '16px 10px', borderRadius: '14px', background: '#6E84660D', border: '1px solid #6E846622' }}>
              <div style={{ fontSize: '26px', fontWeight: 760, color: '#5C7155', lineHeight: 1 }}>+{correctCount * XP_PER_CORRECT}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>XP earned</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <SecondaryButton onClick={() => setStarted(false)} icon={ArrowLeft}>Rows</SecondaryButton>
            <PrimaryButton onClick={start} icon={RotateCcw}>Again</PrimaryButton>
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
          <SecondaryButton onClick={() => setStarted(false)} icon={ArrowLeft}>Rows</SecondaryButton>
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
