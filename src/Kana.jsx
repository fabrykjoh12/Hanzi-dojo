import { useState } from 'react'
import { awardXp } from './xpService'
import { shuffle } from './utils'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, Languages, Check, X, RotateCcw, CheckCircle2, Sparkles,
} from 'lucide-react'

const ACCENT = '#2E3A6E'
const QUESTION_COUNT = 15
const XP_PER_CORRECT = 4

// Basic gojūon + dakuten/handakuten. [kana, romaji].
const HIRA = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
]
const KATA = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n'],
  ['ガ', 'ga'], ['ギ', 'gi'], ['グ', 'gu'], ['ゲ', 'ge'], ['ゴ', 'go'],
  ['ザ', 'za'], ['ジ', 'ji'], ['ズ', 'zu'], ['ゼ', 'ze'], ['ゾ', 'zo'],
  ['ダ', 'da'], ['デ', 'de'], ['ド', 'do'],
  ['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo'],
  ['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po'],
]

// Each question: a kana + 4 distinct-romaji options (correct + 3 distractors).
function buildQuestions(pool) {
  const allRomaji = pool.map(p => p[1])
  return shuffle(pool).slice(0, Math.min(QUESTION_COUNT, pool.length)).map(([kana, romaji]) => {
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
  const [script, setScript] = useState(null)   // 'hira' | 'kata' | 'both'
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  function start(which) {
    const pool = which === 'hira' ? HIRA : which === 'kata' ? KATA : [...HIRA, ...KATA]
    setScript(which)
    setQuestions(buildQuestions(pool))
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
  }

  function choose(opt) {
    if (picked !== null) return
    setPicked(opt)
    if (opt === q.romaji) setCorrectCount(c => c + 1)
  }

  function finish(finalCorrect) {
    setDone(true)
    const gain = finalCorrect * XP_PER_CORRECT
    if (gain > 0) awardXp(session, profile, gain, onUpdate)
  }

  function next() {
    if (idx + 1 >= questions.length) finish(correctCount)
    else { setPicked(null); setIdx(i => i + 1) }
  }

  const q = questions[idx]

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

  // Setup: choose a script.
  if (!script) {
    const choices = [
      { key: 'hira', label: 'Hiragana', sample: 'あ い う' },
      { key: 'kata', label: 'Katakana', sample: 'ア イ ウ' },
      { key: 'both', label: 'Both', sample: 'あ ア' },
    ]
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '560px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '24px 0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <Languages size={17} strokeWidth={1.8} color={ACCENT} /> Kana practice
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Which script?</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>See a kana, choose its sound.</p>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {choices.map(c => (
              <button key={c.key} onClick={() => start(c.key)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 22px', borderRadius: '16px', border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                boxShadow: '0 6px 18px rgba(24,24,27,0.05)',
              }}>
                <span style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text)' }}>{c.label}</span>
                <span style={{ fontSize: '24px', color: ACCENT, fontFamily: "'Noto Sans JP'" }}>{c.sample}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
            <SecondaryButton onClick={() => setScript(null)} icon={ArrowLeft}>Change script</SecondaryButton>
            <PrimaryButton onClick={() => start(script)} icon={RotateCcw}>Again</PrimaryButton>
          </div>
        </Centered>
      </div>
    )
  }

  const answered = picked !== null

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={() => setScript(null)} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {questions.length}</span>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '0 0 26px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: ACCENT, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '110px', fontWeight: 400, color: 'var(--text)', fontFamily: "'Noto Sans JP'", lineHeight: 1.1 }}>{q.kana}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {q.options.map(opt => {
            const isCorrect = opt === q.romaji
            const isPicked = opt === picked
            let bc = 'var(--border)', bg = 'var(--surface)'
            if (answered && isCorrect) { bc = '#2F9E6D'; bg = 'var(--success-bg)' }
            else if (answered && isPicked && !isCorrect) { bc = '#DC2626'; bg = 'var(--danger-bg)' }
            return (
              <button key={opt} onClick={() => choose(opt)} disabled={answered} style={{
                position: 'relative', minHeight: '64px', padding: '14px', borderRadius: '14px',
                border: '1.5px solid ' + bc, background: bg, cursor: answered ? 'default' : 'pointer',
                fontSize: '20px', fontWeight: 600, color: 'var(--text)', fontFamily: 'Inter, sans-serif',
                transition: 'border-color 140ms ease, background 140ms ease',
              }}>
                {opt}
                {answered && isCorrect && <Check size={17} strokeWidth={2.4} color="#2F9E6D" style={{ position: 'absolute', top: '10px', right: '10px' }} />}
                {answered && isPicked && !isCorrect && <X size={17} strokeWidth={2.4} color="#DC2626" style={{ position: 'absolute', top: '10px', right: '10px' }} />}
              </button>
            )
          })}
        </div>

        {answered && (
          <div style={{ marginTop: '22px' }}>
            <PrimaryButton onClick={next} icon={Sparkles}>{idx + 1 >= questions.length ? 'See results' : 'Next'}</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
