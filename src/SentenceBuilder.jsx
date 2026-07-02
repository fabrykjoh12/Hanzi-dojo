import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { awardXp } from './xpService'
import { getLevelLabel, getSystemLabel, shuffle } from './utils'
import { Centered, PrimaryButton, SecondaryButton } from './ui'
import { languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { markWordDue } from './practiceSignal'
import {
  ArrowLeft, Blocks, Check, X, RotateCcw, CheckCircle2, Sparkles, Eye,
} from 'lucide-react'

const QUESTION_COUNT = 10
const XP_PER_CORRECT = 4
const PUNCT = '、。，．！？；：「」『』（）()【】…—~～·,.!?;:\'"-– '

function isContent(t) {
  const s = (t || '').trim()
  if (!s) return false
  for (let i = 0; i < s.length; i += 1) {
    if (PUNCT.indexOf(s[i]) === -1) return true
  }
  return false
}

function makeSegmenter(locale) {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return new Intl.Segmenter(locale, { granularity: 'word' })
  } catch (e) { /* unsupported */ }
  return null
}

function tokenize(sentence, segmenter) {
  const out = []
  if (segmenter) {
    for (const seg of segmenter.segment(sentence)) {
      if (isContent(seg.segment)) out.push(seg.segment)
    }
  } else {
    // Fallback: one tile per character (works for Chinese; rough for Japanese).
    for (let i = 0; i < sentence.length; i += 1) {
      if (isContent(sentence[i])) out.push(sentence[i])
    }
  }
  return out
}

// Scramble [0..n-1] into a different order than sorted.
function scrambleIds(n) {
  const ids = []
  for (let i = 0; i < n; i += 1) ids.push(i)
  let s = shuffle(ids)
  for (let tries = 0; tries < 6 && s.every((id, i) => id === i); tries += 1) s = shuffle(ids)
  return s
}

// How "everyday" a sentence is: its HARDEST in-level word decides (a sentence
// built from words 1–40 plus one word ranked 280 is a rank-280 sentence), and
// tokens that aren't level vocabulary at all — names, out-of-level words — are
// the strongest rarity signal, so each one costs a large penalty.
function sentenceScore(tokens, orderByWord) {
  let worst = 0
  let unknown = 0
  for (const t of tokens) {
    const o = orderByWord[t]
    if (o === undefined) unknown += 1
    else if (o > worst) worst = o
  }
  return worst + unknown * 400
}

function buildQuestions(pool, segmenter) {
  const orderByWord = {}
  for (const v of pool) orderByWord[v.word] = v.sort_order || 0

  const usable = []
  for (const v of pool) {
    if (!v.example_sentence) continue
    // Require a translation so there's a clear English goal, and keep the
    // sentence a natural, buildable length.
    if (!v.example_translation) continue
    const tokens = tokenize(v.example_sentence, segmenter)
    if (tokens.length >= 3 && tokens.length <= 8) {
      usable.push({ vocab: v, tokens, score: sentenceScore(tokens, orderByWord) })
    }
  }
  // Most-everyday sentences first (lowest worst-word rank, fewest off-list
  // tokens), then shuffle within that pool for variety each round.
  usable.sort((a, b) => a.score - b.score)
  const commonPool = usable.slice(0, Math.max(QUESTION_COUNT * 3, 30))
  return shuffle(commonPool).slice(0, Math.min(QUESTION_COUNT, commonPool.length)).map(q => ({
    ...q, order: scrambleIds(q.tokens.length),
  }))
}

export default function SentenceBuilder({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [placed, setPlaced] = useState([])      // token ids in build order
  const [result, setResult] = useState(null)    // null | 'correct' | 'wrong'
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)
  const segRef = useRef(null)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  if (!segRef.current) {
    const segLocale = profile.active_language === 'japanese' ? 'ja'
      : profile.active_language === 'russian' ? 'ru' : 'zh'
    segRef.current = makeSegmenter(segLocale)
  }

  async function load() {
    setLoading(true)
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id, word, reading, example_sentence, example_translation, sort_order')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
    setQuestions(buildQuestions(vocab || [], segRef.current))
    setIdx(0); setPlaced([]); setResult(null); setCorrectCount(0); setDone(false)
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = questions[idx]

  function tapBank(id) {
    if (result) return
    setPlaced(p => [...p, id])
  }
  function tapPlaced(id) {
    if (result) return
    setPlaced(p => p.filter(x => x !== id))
  }

  function check() {
    // Compare the built *sentence*, not tile identity — duplicate tokens (two
    // identical particles, repeated words) are interchangeable, so any order
    // that reproduces the target string is correct.
    const ok = placed.length === q.tokens.length
      && placed.map(id => q.tokens[id]).join('') === q.tokens.join('')
    setResult(ok ? 'correct' : 'wrong')
    if (ok) setCorrectCount(c => c + 1)
    else markWordDue(session, q.vocab.id)
  }

  function reveal() {
    const target = []
    for (let i = 0; i < q.tokens.length; i += 1) target.push(i)
    setPlaced(target)
    setResult('wrong')
    // Deliberately no markWordDue here: asking to see the answer is curiosity,
    // not a failed recall — punishing it teaches users to avoid the button.
  }

  function finish(finalCorrect) {
    setDone(true)
    const gain = finalCorrect * XP_PER_CORRECT
    if (gain > 0) awardXp(session, profile, gain, onUpdate)
  }

  function next() {
    if (idx + 1 >= questions.length) { finish(correctCount); return }
    setPlaced([]); setResult(null); setIdx(i => i + 1)
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '26px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px rgba(24,24,27,0.06)' }}>
            <Blocks size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div style={pageShell}>
        <Centered>
          <Blocks size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>No sentences to build yet</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            This level needs a few short example sentences before the builder can run.
          </p>
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>Back home</PrimaryButton>
        </Centered>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100)
    return (
      <div style={pageShell}>
        <Centered wide>
          <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentHex + '10', border: '1px solid ' + accentHex + '18' }}>
            <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>Sentences built</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '15px' }}>
            You ordered <strong style={{ color: 'var(--text)' }}>{correctCount}</strong> of {questions.length} correctly.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
            <div style={{ padding: '16px 10px', borderRadius: '14px', background: accentHex + '0D', border: '1px solid ' + accentHex + '22' }}>
              <div style={{ fontSize: '26px', fontWeight: 760, color: accentHex, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>Accuracy</div>
            </div>
            <div style={{ padding: '16px 10px', borderRadius: '14px', background: '#6E84660D', border: '1px solid #6E846622' }}>
              <div style={{ fontSize: '26px', fontWeight: 760, color: '#5C7155', lineHeight: 1 }}>+{correctCount * XP_PER_CORRECT}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>XP earned</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <SecondaryButton onClick={onBack} icon={ArrowLeft}>Home</SecondaryButton>
            <PrimaryButton onClick={load} icon={RotateCcw}>Again</PrimaryButton>
          </div>
        </Centered>
      </div>
    )
  }

  const bankIds = q.order.filter(id => placed.indexOf(id) === -1)
  const allPlaced = placed.length === q.tokens.length
  const buildBorder = result === 'correct' ? '#2F9E6D' : result === 'wrong' ? '#DC2626' : 'var(--border)'

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SecondaryButton onClick={onBack} icon={ArrowLeft}>Exit</SecondaryButton>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{idx + 1} / {questions.length}</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 750 }}>
            <Blocks size={17} strokeWidth={1.8} color={accentHex} /> Build the sentence
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{systemLabel} · {levelLabel}</div>
        </div>

        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', margin: '14px 0 20px' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: accentHex, width: Math.round((idx / questions.length) * 100) + '%', transition: 'width .4s ease' }} />
        </div>

        {/* English goal */}
        {q.vocab.example_translation && (
          <div style={{ textAlign: 'center', fontSize: '15px', color: 'var(--text-muted)', marginBottom: '18px', fontStyle: 'italic' }}>
            “{q.vocab.example_translation}”
          </div>
        )}

        {/* Build area */}
        <div style={{
          minHeight: '70px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
          padding: '16px', borderRadius: '16px', border: '1.5px solid ' + buildBorder,
          background: result === 'correct' ? 'var(--success-bg)' : result === 'wrong' ? 'var(--danger-bg)' : 'var(--surface)',
          marginBottom: '12px', transition: 'border-color 140ms ease, background 140ms ease',
        }}>
          {placed.length === 0 && (
            <span style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Tap the words below in order…</span>
          )}
          {placed.map(id => (
            <Tile key={id} text={q.tokens[id]} font={langFont} onClick={() => tapPlaced(id)} disabled={Boolean(result)} />
          ))}
        </div>

        {/* Bank */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '54px', marginBottom: '20px' }}>
          {bankIds.map(id => (
            <Tile key={id} text={q.tokens[id]} font={langFont} accent onClick={() => tapBank(id)} disabled={Boolean(result)} />
          ))}
        </div>

        {/* Actions / feedback */}
        {!result && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <SecondaryButton onClick={reveal} icon={Eye}>Show answer</SecondaryButton>
            <div style={{ flex: 1 }}>
              <PrimaryButton onClick={check} icon={Check} disabled={!allPlaced}>Check</PrimaryButton>
            </div>
          </div>
        )}
        {result && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '12px 16px', borderRadius: '14px', marginBottom: '14px',
              background: result === 'correct' ? 'var(--success-bg)' : 'var(--danger-bg)',
              border: '1px solid ' + (result === 'correct' ? 'var(--success-border)' : 'var(--danger-border)'),
              color: result === 'correct' ? '#2F9E6D' : '#DC2626', fontSize: '14px', fontWeight: 700,
            }}>
              {result === 'correct'
                ? <><Check size={17} strokeWidth={2.4} color="#2F9E6D" /> Correct!</>
                : <><X size={17} strokeWidth={2.4} color="#DC2626" /> {q.vocab.example_sentence}</>}
            </div>
            <PrimaryButton onClick={next} icon={Sparkles}>{idx + 1 >= questions.length ? 'See results' : 'Next'}</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ text, font, accent, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 14px', borderRadius: '12px', cursor: disabled ? 'default' : 'pointer',
      border: '1px solid ' + (accent ? 'var(--border)' : 'var(--border)'),
      background: accent ? 'var(--surface)' : 'var(--surface-2)',
      fontSize: '20px', fontFamily: font, color: 'var(--text)', lineHeight: 1.2,
      boxShadow: accent ? '0 2px 8px rgba(24,24,27,0.06)' : 'none',
    }}>
      {text}
    </button>
  )
}
