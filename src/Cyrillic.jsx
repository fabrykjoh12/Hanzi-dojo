import { useState } from 'react'
import { awardXp } from './xpService'
import { shuffle } from './utils'
import { recordMiss, weightedSample } from './drillMemory'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { useIsMobile } from './useIsMobile'
import { languageTheme } from './languageTheme'
import {
  ArrowLeft, Languages, Check, X, RotateCcw, CheckCircle2, Sparkles,
} from 'lucide-react'

// The Russian parallel to the Kana / Tones drills: a true-beginner on-ramp for
// the Cyrillic alphabet. See a letter, choose its sound (approximate Latin
// romanization). No DB — the alphabet is embedded here.
const ACCENT = languageTheme('russian').accentHex
const QUESTION_COUNT = 15
const XP_PER_CORRECT = 4

// [letter, romanized sound]. Approximate romanization for beginner recognition;
// the two silent signs (Ъ Ь) are omitted since they have no sound to name.
const VOWELS = [
  ['А', 'a'], ['Е', 'ye'], ['Ё', 'yo'], ['И', 'i'], ['О', 'o'],
  ['У', 'u'], ['Ы', 'ih'], ['Э', 'e'], ['Ю', 'yu'], ['Я', 'ya'],
]
const CONSONANTS = [
  ['Б', 'b'], ['В', 'v'], ['Г', 'g'], ['Д', 'd'], ['Ж', 'zh'],
  ['З', 'z'], ['Й', 'y'], ['К', 'k'], ['Л', 'l'], ['М', 'm'],
  ['Н', 'n'], ['П', 'p'], ['Р', 'r'], ['С', 's'], ['Т', 't'],
  ['Ф', 'f'], ['Х', 'kh'], ['Ц', 'ts'], ['Ч', 'ch'], ['Ш', 'sh'],
  ['Щ', 'shch'],
]
const ALL = [...VOWELS, ...CONSONANTS]

// Each question: a letter + 4 distinct-sound options (correct + 3 distractors).
// Sampling is weighted toward letters missed earlier this session (drillMemory).
function buildQuestions(pool) {
  const allSounds = pool.map(p => p[1])
  return weightedSample(pool, p => p[0], 'cyrillic', Math.min(QUESTION_COUNT, pool.length), shuffle).map(([letter, sound]) => {
    const distractors = []
    const used = new Set([sound])
    const bag = shuffle(allSounds)
    for (let i = 0; i < bag.length && distractors.length < 3; i += 1) {
      if (!used.has(bag[i])) { used.add(bag[i]); distractors.push(bag[i]) }
    }
    return { letter, sound, options: shuffle([sound, ...distractors]) }
  })
}

export default function Cyrillic({ session, profile, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const isRussian = profile.active_language === 'russian'
  const [group, setGroup] = useState(null)   // 'vowels' | 'consonants' | 'all'
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
    const pool = which === 'vowels' ? VOWELS : which === 'consonants' ? CONSONANTS : ALL
    setGroup(which)
    setQuestions(buildQuestions(pool))
    setIdx(0); setPicked(null); setCorrectCount(0); setDone(false)
  }

  function choose(opt) {
    if (picked !== null) return
    setPicked(opt)
    if (opt === q.sound) setCorrectCount(c => c + 1)
    else recordMiss('cyrillic', q.letter)
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

  if (!isRussian) {
    return (
      <div style={pageShell}>
        <Centered>
          <Languages size={30} strokeWidth={1.8} color={ACCENT} style={{ marginBottom: '14px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>Alphabet practice is for Russian</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Switch your active language to Russian to drill the Cyrillic alphabet.
          </p>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
        </Centered>
      </div>
    )
  }

  // Setup: choose a group.
  if (!group) {
    const choices = [
      { key: 'vowels', label: 'Vowels', sample: 'А Е О' },
      { key: 'consonants', label: 'Consonants', sample: 'Б В Г' },
      { key: 'all', label: 'All letters', sample: 'А Б В' },
    ]
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '560px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <div style={{ textAlign: 'center', margin: '24px 0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: ACCENT, fontSize: '13px', fontWeight: 750 }}>
              <Languages size={17} strokeWidth={1.8} color={ACCENT} /> Alphabet practice
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Which letters?</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>See a letter, choose its sound.</p>
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
                <span style={{ fontSize: '24px', color: ACCENT, fontFamily: 'Inter, sans-serif' }}>{c.sample}</span>
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
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Alphabet complete</h1>
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
            <SecondaryButton onClick={() => setGroup(null)} icon={ArrowLeft}>Change letters</SecondaryButton>
            <PrimaryButton onClick={() => start(group)} icon={RotateCcw}>Again</PrimaryButton>
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
          <SecondaryButton onClick={() => setGroup(null)} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {questions.length}</span>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '0 0 26px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: ACCENT, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '110px', fontWeight: 500, color: 'var(--text)', fontFamily: 'Inter, sans-serif', lineHeight: 1.1 }}>{q.letter}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {q.options.map(opt => {
            const isCorrect = opt === q.sound
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
