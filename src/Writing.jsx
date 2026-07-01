import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, isRecallMatch } from './utils'
import { languageTheme } from './languageTheme'
import { normalizePinyin } from './testLogic'
import { useIsMobile } from './useIsMobile'
import { toRomaji } from 'wanakana'
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2,
  Flame, PenLine, RotateCcw, Sparkles, X,
} from 'lucide-react'

const ROUND_SIZES = [10, 15, 20, 30]
const XP_PER_CORRECT = 10
const MAX_XP = 100
const MAX_LEVEL = 5
const MAX_MULTIPLIER = 3

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5)
}

function stripChars(value, chars) {
  let output = ''
  const source = value || ''
  for (let i = 0; i < source.length; i += 1) {
    if (!chars.includes(source[i])) output += source[i]
  }
  return output
}

function normalizeChinesePinyin(value) {
  const withoutTones = normalizePinyin(value)
    .split('')
    .filter(ch => ch < '1' || ch > '5')
    .join('')
  return stripChars(withoutTones, ' .,!?;:\'"()-_').toLowerCase()
}

// Drop a leading article / infinitive marker so "to run", "a dog", "the sun"
// all match a bare "run" / "dog" / "sun". Word-boundary aware (needs the space).
function stripLead(value) {
  const leads = ['to ', 'a ', 'an ', 'the ']
  let s = value
  for (let i = 0; i < leads.length; i += 1) {
    if (s.startsWith(leads[i])) return s.slice(leads[i].length)
  }
  return s
}

function normalizeEnglish(value) {
  const lowered = stripLead((value || '').toLowerCase().trim())
  return stripChars(lowered, '。、「」，,.!?！？;:\'"()-_ ')
}

function stripParentheses(value) {
  const source = value || ''
  let output = ''
  let depth = 0
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      if (depth > 0) depth -= 1
    } else if (depth === 0) {
      output += ch
    }
  }
  return output
}

function isMeaningMatch(input, meaning) {
  const normalizedInput = normalizeEnglish(input)
  if (!normalizedInput) return false

  const withoutParens = stripParentheses(meaning)

  const variants = withoutParens
    .split(',')
    .flatMap(part => part.split(';'))
    .flatMap(part => part.split('/'))
    .flatMap(part => part.split(' or '))
    .map(part => normalizeEnglish(part))
    .filter(Boolean)

  return normalizeEnglish(withoutParens) === normalizedInput || variants.includes(normalizedInput)
}

function normalizeRomaji(value) {
  return stripChars((value || '').toLowerCase().trim(), ' ')
}

function hasKanji(str) {
  const value = str || ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9faf) return true
  }
  return false
}

function isWritingMatch(input, vocab, direction, isJapanese) {
  if (direction === 'to_english') return isMeaningMatch(input, vocab.meaning)

  const word = (vocab.word || '').replace('。', '')
  if (isRecallMatch(input, word)) return true

  if (isJapanese) {
    if (isRecallMatch(input, vocab.reading)) return true
    const reading = vocab.reading || ''
    const expectedRomaji = normalizeRomaji(toRomaji(reading))
    const inputRomaji = normalizeRomaji(input)
    return inputRomaji.length > 0 && inputRomaji === expectedRomaji
  }

  const normalizedInput = normalizeChinesePinyin(input)
  return [vocab.reading_plain, vocab.reading]
    .filter(Boolean)
    .some(reading => normalizedInput === normalizeChinesePinyin(reading))
}

function getLevel(xp = 0) {
  if (xp >= MAX_XP) return MAX_LEVEL
  return Math.max(1, Math.floor(xp / 25) + 1)
}

function getLevelProgress(xp = 0) {
  if (xp >= MAX_XP) return 100
  return Math.round(((xp % 25) / 25) * 100)
}

function defaultStat(vocabId) {
  return {
    vocab_id: vocabId,
    xp: 0,
    attempts: 0,
    correct_count: 0,
    missed_count: 0,
    correct_streak: 0,
    last_practiced_at: null,
  }
}

function getMultiplier(streak = 0) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / 2))
}

function getSafeStreak(stat) {
  return stat?.correct_streak || 0
}

function getLanguageDetails(track) {
  const t = languageTheme(track.language)
  return {
    isJapanese: track.language === 'japanese',
    accentHex: t.accentHex,
    languageName: t.languageName,
    fontFamily: t.font,
  }
}

function Shell({ children, accentHex, fontFamily, narrow }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        maxWidth: narrow ? '640px' : '860px',
        margin: '0 auto',
        padding: isMobile ? '24px 16px 56px' : '38px 32px 72px',
        position: 'relative',
        zIndex: 1,
      }}>
        {children}
      </div>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />
      {label}
    </button>
  )
}

function PrimaryButton({ onClick, children, accentHex, icon: Icon, disabled }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minHeight: '52px',
        borderRadius: '16px',
        border: 'none',
        background: disabled ? 'var(--text-faint)' : (hovered ? accentHex + 'E6' : accentHex),
        color: '#fff',
        fontSize: '15px',
        fontWeight: 750,
        fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '9px',
        transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered && !disabled ? '0 12px 28px ' + accentHex + '30' : '0 5px 16px ' + accentHex + '22',
      }}
    >
      {Icon && <Icon size={18} strokeWidth={2} color="#fff" />}
      {children}
    </button>
  )
}

function GhostButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minHeight: '52px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)',
        fontSize: '15px',
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '9px',
      }}
    >
      {Icon && <Icon size={18} strokeWidth={2} color="var(--text-muted)" />}
      {children}
    </button>
  )
}

function JapaneseRuby({ word, reading, fontSize = '48px' }) {
  return (
    <ruby style={{ fontSize, fontFamily: "'Noto Sans JP'", color: 'var(--text)', lineHeight: 1.4 }}>
      {word}
      {reading && <rt style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 500 }}>{reading}</rt>}
    </ruby>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: '7px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: '999px', transition: 'width 220ms ease' }} />
    </div>
  )
}

function StatBox({ label, value, color, icon: Icon }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      padding: '18px 20px',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      {Icon && <Icon size={20} strokeWidth={1.8} color={color} />}
      <div style={{ fontSize: '30px', fontWeight: 850, color, lineHeight: 1, marginTop: Icon ? '12px' : 0 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', fontWeight: 650 }}>{label}</div>
    </div>
  )
}

function WordStatRow({ word, stat, accentHex, fontFamily }) {
  const level = getLevel(stat.xp)
  const pct = stat.attempts > 0 ? Math.round((stat.correct_count / stat.attempts) * 100) : 0
  const levelPct = getLevelProgress(stat.xp)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      padding: '16px 18px',
      boxShadow: '0 8px 26px rgba(24,24,27,0.045)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '25px',
            fontWeight: 750,
            color: 'var(--text)',
            fontFamily,
            lineHeight: 1.2,
          }}>
            {word.word}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
            {word.reading} · {word.meaning}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '76px' }}>
          <div style={{ fontSize: '13px', fontWeight: 850, color: level === MAX_LEVEL ? '#2F9E6D' : accentHex }}>
            Lv {level}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {stat.xp}/{MAX_XP} XP
          </div>
          {getSafeStreak(stat) > 0 && (
            <div style={{ fontSize: '11px', color: '#D97706', marginTop: '4px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Flame size={11} strokeWidth={2} /> {getSafeStreak(stat)}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <ProgressBar pct={level === MAX_LEVEL ? 100 : levelPct} color={level === MAX_LEVEL ? '#2F9E6D' : accentHex} />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>{pct}% correct</span>
        <span>{stat.correct_count} right</span>
        <span>{stat.missed_count} missed</span>
      </div>
    </div>
  )
}

export default function Writing({ session, track, onBack }) {
  const [studiedWords, setStudiedWords] = useState([])
  const [cardsByVocab, setCardsByVocab] = useState({})
  const [writingStats, setWritingStats] = useState({})
  const [phase, setPhase] = useState('start')
  const [selectedCount, setSelectedCount] = useState(15)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [questionMode, setQuestionMode] = useState('mixed')
  const [showFurigana, setShowFurigana] = useState(true)
  const [roundStats, setRoundStats] = useState({ correct: 0, missed: 0 })
  const [loading, setLoading] = useState(true)

  const { isJapanese, accentHex, languageName, fontFamily } = getLanguageDetails(track)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(track.language, track.system, track.current_level)
  const current = queue[index]
  const currentDirection = current?.questionDirection || questionMode
  const toEnglish = currentDirection === 'to_english'
  const roundSize = Math.min(selectedCount, studiedWords.length)

  useEffect(() => {
    async function loadPractice() {
      const [vocabResult, cardsResult, statsResult] = await Promise.all([
        supabase
          .from('vocabulary')
          .select('*')
          .eq('language', track.language)
          .eq('system', track.system)
          .eq('level', track.current_level)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('cards')
          .select('vocab_id, is_easy, state, review_count')
          .eq('user_id', session.user.id),
        supabase
          .from('writing_stats')
          .select('vocab_id, xp, attempts, correct_count, missed_count, correct_streak, last_practiced_at')
          .eq('user_id', session.user.id),
      ])

      const cardsMap = {}
      ;(cardsResult.data || []).forEach(card => { cardsMap[card.vocab_id] = card })

      const words = (vocabResult.data || []).filter(word => cardsMap[word.id])
      const statsMap = {}
      ;(statsResult.data || []).forEach(stat => { statsMap[stat.vocab_id] = stat })

      setCardsByVocab(cardsMap)
      setStudiedWords(words)
      setWritingStats(statsMap)
      if (words.length > 0 && words.length < 15) {
        const fallbackSize = [...ROUND_SIZES].reverse().find(size => size <= words.length) || words.length
        setSelectedCount(fallbackSize)
      }
      setLoading(false)
    }

    loadPractice()
  }, [session.user.id, track.language, track.system, track.current_level])

  const progress = useMemo(() => {
    if (queue.length === 0) return 0
    return Math.round((index / queue.length) * 100)
  }, [index, queue.length])

  const statRows = useMemo(() => {
    return studiedWords.map(word => ({
      word,
      stat: writingStats[word.id] || defaultStat(word.id),
    }))
  }, [studiedWords, writingStats])

  const bestWords = useMemo(() => {
    return [...statRows]
      .sort((a, b) => (b.stat.xp - a.stat.xp) || (b.stat.correct_count - a.stat.correct_count))
      .slice(0, 8)
  }, [statRows])

  const weakestWords = useMemo(() => {
    return [...statRows]
      .sort((a, b) => {
        const aAccuracy = a.stat.attempts > 0 ? a.stat.correct_count / a.stat.attempts : 0
        const bAccuracy = b.stat.attempts > 0 ? b.stat.correct_count / b.stat.attempts : 0
        return (a.stat.xp - b.stat.xp) || (aAccuracy - bAccuracy) || (b.stat.missed_count - a.stat.missed_count)
      })
      .slice(0, 8)
  }, [statRows])

  const masteredCount = statRows.filter(row => getLevel(row.stat.xp) === MAX_LEVEL).length

  const startRound = () => {
    const selected = shuffle(studiedWords).slice(0, roundSize).map(word => ({
      ...word,
      questionDirection: questionMode === 'mixed'
        ? Math.random() > 0.5 ? 'to_target' : 'to_english'
        : questionMode,
    }))
    setQueue(selected)
    setIndex(0)
    setInput('')
    setResult(null)
    setRoundStats({ correct: 0, missed: 0 })
    setPhase('practice')
  }

  const resetRound = () => {
    startRound()
  }

  async function saveWritingStat(vocab, correct) {
    const existing = writingStats[vocab.id] || defaultStat(vocab.id)
    const nextStreak = correct ? getSafeStreak(existing) + 1 : 0
    const multiplier = correct ? getMultiplier(nextStreak) : 0
    const xpGain = correct ? XP_PER_CORRECT * multiplier : 0
    const next = {
      ...existing,
      user_id: session.user.id,
      vocab_id: vocab.id,
      xp: Math.min(MAX_XP, existing.xp + xpGain),
      attempts: existing.attempts + 1,
      correct_count: existing.correct_count + (correct ? 1 : 0),
      missed_count: existing.missed_count + (correct ? 0 : 1),
      correct_streak: nextStreak,
      last_practiced_at: new Date().toISOString(),
    }

    setWritingStats(prev => ({ ...prev, [vocab.id]: next }))

    await supabase
      .from('writing_stats')
      .upsert(next, { onConflict: 'user_id,vocab_id' })

    return { xpGain, multiplier, streak: nextStreak }
  }

  const submit = async () => {
    if (!current || result || !input.trim()) return

    const correct = isWritingMatch(input, current, currentDirection, isJapanese)
    setResult(correct ? { status: 'correct', xpGain: XP_PER_CORRECT, multiplier: 1, streak: 1 } : { status: 'missed', xpGain: 0, multiplier: 0, streak: 0 })
    setRoundStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      missed: prev.missed + (correct ? 0 : 1),
    }))

    const streakResult = await saveWritingStat(current, correct)
    if (correct) {
      setResult({ status: 'correct', ...streakResult })
    }

    if (!correct && cardsByVocab[current.id]) {
      await supabase
        .from('cards')
        .update({ is_easy: false, due_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .eq('vocab_id', current.id)
    }
  }

  const next = () => {
    if (index + 1 >= queue.length) {
      setIndex(queue.length)
      setInput('')
      setResult(null)
      return
    }
    setIndex(prev => prev + 1)
    setInput('')
    setResult(null)
  }

  if (loading) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StateIcon icon={PenLine} accentHex={accentHex} />
        </div>
      </Shell>
    )
  }

  if (studiedWords.length === 0) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        <div style={centerPanelStyle}>
          <StateIcon icon={PenLine} accentHex={accentHex} />
          <h1 style={titleStyle}>No studied words yet</h1>
          <p style={bodyTextStyle}>Study some flashcards in this level first, then come back to practice writing from memory.</p>
          <PrimaryButton onClick={onBack} accentHex={accentHex} icon={ArrowLeft}>Back home</PrimaryButton>
        </div>
      </Shell>
    )
  }

  if (phase === 'stats') {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <IconButton icon={ArrowLeft} label="Back" onClick={() => setPhase('start')} />
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{systemLabel} · {levelLabel}</div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ color: accentHex, fontSize: '13px', fontWeight: 800, marginBottom: '10px' }}>Writing progress</div>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '36px', fontWeight: 850, lineHeight: 1.1 }}>Writing stats</h1>
          <p style={{ margin: '10px 0 0', fontSize: '15px', color: 'var(--text-muted)' }}>
            {masteredCount}/{studiedWords.length} words at max writing level.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '26px' }}>
          <StatBox label="Studied words" value={studiedWords.length} color={accentHex} icon={PenLine} />
          <StatBox label="Maxed words" value={masteredCount} color="#2F9E6D" icon={Sparkles} />
        </div>

        <h2 style={sectionTitle}>Best known</h2>
        <div style={{ display: 'grid', gap: '10px', marginBottom: '28px' }}>
          {bestWords.map(({ word, stat }) => (
            <WordStatRow key={word.id} word={word} stat={stat} accentHex={accentHex} fontFamily={fontFamily} />
          ))}
        </div>

        <h2 style={sectionTitle}>Needs work</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          {weakestWords.map(({ word, stat }) => (
            <WordStatRow key={word.id} word={word} stat={stat} accentHex={accentHex} fontFamily={fontFamily} />
          ))}
        </div>
      </Shell>
    )
  }

  if (phase === 'start') {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        <div style={{ margin: '32px 0 24px', textAlign: 'center' }}>
          <StateIcon icon={PenLine} accentHex={accentHex} />
          <div style={{ color: accentHex, fontSize: '13px', fontWeight: 800, marginTop: '18px' }}>
            {languageName} active recall
          </div>
          <h1 style={{ ...titleStyle, fontSize: '32px' }}>Writing practice</h1>
          <p style={bodyTextStyle}>
            Pick a round size and level up words you have already seen in flashcards.
          </p>
        </div>

        <div style={panelStyle}>
          <div style={panelTitleStyle}>Round size</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {ROUND_SIZES.map(size => {
              const disabled = studiedWords.length < size
              return (
                <button
                  key={size}
                  onClick={() => setSelectedCount(size)}
                  disabled={disabled}
                  style={choiceBox(selectedCount === size, accentHex, disabled)}
                >
                  {size}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
            {roundSize} words available for this round.
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelTitleStyle}>Question type</div>
          <div style={{ display: 'grid', gap: '8px' }}>
            <ModeButton active={questionMode === 'mixed'} accentHex={accentHex} title="Mixed" detail="Both directions" onClick={() => setQuestionMode('mixed')} />
            <ModeButton active={questionMode === 'to_target'} accentHex={accentHex} title={'English -> ' + languageName} detail={isJapanese ? 'Kanji, hiragana, or romaji' : 'Hanzi or pinyin'} onClick={() => setQuestionMode('to_target')} />
            <ModeButton active={questionMode === 'to_english'} accentHex={accentHex} title={languageName + ' -> English'} detail="Type the English meaning" onClick={() => setQuestionMode('to_english')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <GhostButton onClick={() => setPhase('stats')} icon={BarChart3}>Stats</GhostButton>
          <PrimaryButton onClick={startRound} accentHex={accentHex} icon={ArrowRight}>Start practice</PrimaryButton>
        </div>
      </Shell>
    )
  }

  if (index >= queue.length) {
    return (
      <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
        <div style={centerPanelStyle}>
          <StateIcon icon={CheckCircle2} accentHex="#2F9E6D" />
          <h1 style={titleStyle}>Writing round complete</h1>
          <p style={bodyTextStyle}>{roundStats.correct} correct · {roundStats.missed} missed</p>
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <GhostButton onClick={() => setPhase('start')} icon={ArrowLeft}>Start screen</GhostButton>
            <PrimaryButton onClick={resetRound} accentHex={accentHex} icon={RotateCcw}>Practice again</PrimaryButton>
          </div>
        </div>
      </Shell>
    )
  }

  const card = cardsByVocab[current.id]
  const promptText = toEnglish ? current.word : current.meaning
  const targetLabel = toEnglish ? 'English' : isJapanese ? 'Japanese' : 'Chinese'
  const directionLabel = toEnglish
    ? (isJapanese ? 'Japanese' : 'Chinese') + ' -> English'
    : 'English -> ' + (isJapanese ? 'Japanese' : 'Chinese')
  const currentStat = writingStats[current.id] || defaultStat(current.id)
  const currentLevel = getLevel(currentStat.xp)
  const nextMultiplier = getMultiplier(getSafeStreak(currentStat) + 1)

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily} narrow>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
        <IconButton icon={ArrowLeft} label="Exit" onClick={() => setPhase('start')} />
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>
          {index + 1}/{queue.length} · {levelLabel} · Lv {currentLevel}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <ProgressBar pct={progress} color={accentHex} />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px', justifyContent: 'center' }}>
        <span style={statusPill(accentHex)}>{directionLabel}</span>
        <span style={{ ...statusPill('#D97706'), display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Flame size={12} strokeWidth={2} /> {getSafeStreak(currentStat)} · next {nextMultiplier}x
        </span>
        {isJapanese && (
          <button onClick={() => setShowFurigana(prev => !prev)} style={togglePill(showFurigana, accentHex)}>
            Furigana {showFurigana ? 'on' : 'off'}
          </button>
        )}
      </div>

      <div style={{
        ...panelStyle,
        padding: '34px 30px',
        boxShadow: '0 22px 64px rgba(24,24,27,0.07)',
      }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Type the {targetLabel}
        </div>
        <div style={{
          minHeight: '92px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontSize: toEnglish ? '58px' : '28px',
          fontWeight: 800,
          color: 'var(--text)',
          fontFamily: toEnglish ? fontFamily : 'Inter, sans-serif',
          lineHeight: 1.3,
        }}>
          {promptText}
        </div>
        {card && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
            {card.is_easy ? 'Mastered' : card.state || 'Started'} · {currentStat.xp}/{MAX_XP} XP
          </div>
        )}
      </div>

      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            if (result) next()
            else submit()
          }
        }}
        disabled={Boolean(result)}
        autoFocus
        placeholder={toEnglish ? 'Type the English meaning' : 'Type ' + (isJapanese ? 'kanji, hiragana, or romaji' : 'Hanzi or pinyin')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '17px 19px',
          borderRadius: '16px',
          border: '1.5px solid ' + (result?.status === 'correct' ? '#2F9E6D' : result?.status === 'missed' ? '#DC2626' : 'var(--border)'),
          background: 'var(--surface)',
          fontSize: '20px',
          color: 'var(--text)',
          fontFamily: toEnglish ? 'Inter, sans-serif' : fontFamily,
          outline: 'none',
          marginTop: '18px',
          boxShadow: '0 8px 26px rgba(24,24,27,0.045)',
        }}
      />

      {result && (
        <div style={{
          marginTop: '14px',
          padding: '18px 20px',
          borderRadius: '18px',
          background: result.status === 'correct' ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: '1px solid ' + (result.status === 'correct' ? 'var(--success-border)' : 'var(--danger-border)'),
        }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: result.status === 'correct' ? '#2F9E6D' : '#DC2626', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {result.status === 'correct' ? <Check size={15} strokeWidth={2.2} /> : <X size={15} strokeWidth={2.2} />}
            {result.status === 'correct'
              ? 'Correct · +' + result.xpGain + ' XP · ' + result.multiplier + 'x · streak ' + result.streak
              : 'Missed · streak reset'}
          </div>
          {isJapanese ? (
            hasKanji(current.word) && showFurigana ? (
              <JapaneseRuby word={current.word} reading={current.reading} fontSize="38px" />
            ) : (
              <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--text)', fontFamily: "'Noto Sans JP'" }}>
                {current.word}
              </div>
            )
          ) : (
            <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--text)', fontFamily: "'Noto Sans SC'" }}>
              {current.word}
            </div>
          )}
          {isJapanese && (
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '6px', fontFamily: 'Inter, sans-serif' }}>
              {normalizeRomaji(toRomaji(current.reading || ''))}
            </div>
          )}
          {!isJapanese && (
            <div style={{ fontSize: '18px', color: accentHex, marginTop: '8px', fontWeight: 700 }}>
              {current.reading}
            </div>
          )}
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {current.meaning}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '18px' }}>
        {!result ? (
          <PrimaryButton disabled={!input.trim()} onClick={submit} accentHex={accentHex} icon={Check}>Check</PrimaryButton>
        ) : (
          <PrimaryButton onClick={next} accentHex={accentHex} icon={ArrowRight}>Next</PrimaryButton>
        )}
      </div>
    </Shell>
  )
}

function StateIcon({ icon: Icon, accentHex }) {
  return (
    <div style={{
      width: '68px',
      height: '68px',
      borderRadius: '22px',
      background: accentHex + '10',
      border: '1px solid ' + accentHex + '20',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto',
    }}>
      <Icon size={34} strokeWidth={1.75} color={accentHex} />
    </div>
  )
}

function ModeButton({ active, accentHex, title, detail, onClick }) {
  return (
    <button onClick={onClick} style={modeButtonStyle(active, accentHex)}>
      <div style={{ fontSize: '15px', fontWeight: 850 }}>{title}</div>
      <div style={{ fontSize: '11px', color: active ? accentHex : 'var(--text-muted)', marginTop: '4px' }}>{detail}</div>
    </button>
  )
}

const centerPanelStyle = {
  minHeight: '68vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
}

const titleStyle = {
  color: 'var(--text)',
  fontSize: '26px',
  fontWeight: 850,
  lineHeight: 1.15,
  margin: '18px 0 8px',
}

const bodyTextStyle = {
  color: 'var(--text-muted)',
  fontSize: '15px',
  lineHeight: 1.65,
  margin: '0 0 24px',
  maxWidth: '520px',
}

const panelStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '22px',
  padding: '22px',
  marginBottom: '16px',
  boxShadow: '0 10px 32px rgba(24,24,27,0.055)',
}

const panelTitleStyle = {
  fontSize: '13px',
  fontWeight: 800,
  color: 'var(--text)',
  marginBottom: '12px',
}

const sectionTitle = {
  fontSize: '15px',
  fontWeight: 850,
  color: 'var(--text)',
  margin: '0 0 12px',
}

const choiceBox = (active, accent, disabled) => ({
  minHeight: '54px',
  borderRadius: '14px',
  border: '1.5px solid ' + (active ? accent : 'var(--border)'),
  background: active ? accent + '10' : 'var(--surface)',
  color: active ? accent : 'var(--text)',
  opacity: disabled ? 0.4 : 1,
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '15px',
  fontWeight: 850,
  fontFamily: 'Inter, sans-serif',
})

const modeButtonStyle = (active, accent) => ({
  minHeight: '76px',
  padding: '14px 14px',
  borderRadius: '14px',
  border: '1.5px solid ' + (active ? accent : 'var(--border)'),
  background: active ? accent + '10' : 'var(--surface)',
  color: active ? accent : 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  textAlign: 'left',
})

const statusPill = (accent) => ({
  padding: '8px 12px',
  borderRadius: '999px',
  border: '1px solid ' + accent + '33',
  background: accent + '10',
  color: accent,
  fontSize: '12px',
  fontWeight: 800,
  fontFamily: 'Inter, sans-serif',
})

const togglePill = (active, accent) => ({
  padding: '8px 12px',
  borderRadius: '999px',
  border: '1px solid ' + (active ? accent : 'var(--border)'),
  background: active ? accent + '10' : 'var(--surface)',
  color: active ? accent : 'var(--text-muted)',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
})
