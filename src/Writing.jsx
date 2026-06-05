import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, isRecallMatch } from './utils'
import { normalizePinyin } from './testLogic'

const ROUND_SIZES = [10, 15, 20, 30]
const XP_PER_CORRECT = 10
const MAX_XP = 100
const MAX_LEVEL = 5
const MAX_MULTIPLIER = 3

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5)
}

function normalizeChinesePinyin(value) {
  return normalizePinyin(value)
    .replace(/[1-5]/g, '')
    .replace(/[^a-z]/g, '')
}

function normalizeEnglish(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[。、，,.!?！？;:'"()\s-]/g, '')
}

function isMeaningMatch(input, meaning) {
  const normalizedInput = normalizeEnglish(input)
  if (!normalizedInput) return false

  const variants = (meaning || '')
    .split(/[,;/]/)
    .map(part => normalizeEnglish(part))
    .filter(Boolean)

  return normalizeEnglish(meaning) === normalizedInput || variants.includes(normalizedInput)
}

function isWritingMatch(input, vocab, direction, isJapanese) {
  if (direction === 'to_english') return isMeaningMatch(input, vocab.meaning)

  if (isRecallMatch(input, vocab.word)) return true
  if (isJapanese) return isRecallMatch(input, vocab.reading)

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

function JapaneseRuby({ word, reading, fontSize = '48px' }) {
  return (
    <ruby style={{ fontSize, fontFamily: "'Noto Sans JP'", color: '#18181B', lineHeight: 1.4 }}>
      {word}
      {reading && <rt style={{ fontSize: '16px', color: '#71717A', fontWeight: 500 }}>{reading}</rt>}
    </ruby>
  )
}

function WordStatRow({ word, stat, isJapanese, accentHex }) {
  const level = getLevel(stat.xp)
  const pct = stat.attempts > 0 ? Math.round((stat.correct_count / stat.attempts) * 100) : 0
  const levelPct = getLevelProgress(stat.xp)

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E7E5E4',
      borderRadius: '12px',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#18181B',
            fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
            lineHeight: 1.2,
          }}>
            {word.word}
          </div>
          <div style={{ fontSize: '12px', color: '#71717A', marginTop: '3px' }}>
            {word.reading} · {word.meaning}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '76px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: level === MAX_LEVEL ? '#2F9E6D' : accentHex }}>
            Lv {level}
          </div>
          <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
            {stat.xp}/{MAX_XP} XP
          </div>
          {getSafeStreak(stat) > 0 && (
            <div style={{ fontSize: '11px', color: '#D97706', marginTop: '4px', fontWeight: 800 }}>
              🔥 {getSafeStreak(stat)}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' }}>
        <div style={{ width: `${level === MAX_LEVEL ? 100 : levelPct}%`, height: '100%', background: level === MAX_LEVEL ? '#2F9E6D' : accentHex }} />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '11px', color: '#71717A' }}>
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

  const isJapanese = track.language === 'japanese'
  const accentHex = isJapanese ? '#2E3A6E' : '#B83A24'
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

  const submit = async (e) => {
    e.preventDefault()
    if (!current || result) return

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
      <div style={center}>
        <div style={{ fontSize: '32px', color: accentHex, fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  if (studiedWords.length === 0) {
    return (
      <div style={center}>
        <div style={{ width: '100%', maxWidth: '460px', textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✎</div>
          <h1 style={{ fontSize: '24px', color: '#18181B', marginBottom: '8px' }}>No studied words yet</h1>
          <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '24px', lineHeight: 1.5 }}>
            Study some flashcards in this level first, then come back to practice writing from memory.
          </p>
          <button onClick={onBack} style={{ ...primaryBtn, background: accentHex }}>Back home</button>
        </div>
      </div>
    )
  }

  if (phase === 'stats') {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px 60px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <button onClick={() => setPhase('start')} style={backBtn}>← Back</button>
            <div style={{ fontSize: '13px', color: '#71717A' }}>{levelLabel}</div>
          </div>

          <h1 style={{ fontSize: '26px', color: '#18181B', marginBottom: '6px' }}>Writing stats</h1>
          <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '22px' }}>
            {masteredCount}/{studiedWords.length} words at max level
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
            <StatBox label="Studied words" value={studiedWords.length} color={accentHex} />
            <StatBox label="Maxed words" value={masteredCount} color="#2F9E6D" />
          </div>

          <h2 style={sectionTitle}>Best known</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {bestWords.map(({ word, stat }) => (
              <WordStatRow key={word.id} word={word} stat={stat} isJapanese={isJapanese} accentHex={accentHex} />
            ))}
          </div>

          <h2 style={sectionTitle}>Needs work</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {weakestWords.map(({ word, stat }) => (
              <WordStatRow key={word.id} word={word} stat={stat} isJapanese={isJapanese} accentHex={accentHex} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'start') {
    return (
      <div style={center}>
        <div style={{ width: '100%', maxWidth: '640px', padding: '28px 24px' }}>
          <button onClick={onBack} style={{ ...backBtn, marginBottom: '32px' }}>← Back</button>
          <h1 style={{ fontSize: '28px', color: '#18181B', marginBottom: '8px' }}>Writing practice</h1>
          <p style={{ fontSize: '14px', color: '#71717A', lineHeight: 1.5, marginBottom: '26px' }}>
            Pick a round size and level up the words you have already seen in flashcards.
          </p>

          <div style={{ background: '#fff', border: '1px solid #E7E5E4', borderRadius: '18px', padding: '22px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181B', marginBottom: '12px' }}>Round size</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {ROUND_SIZES.map(size => {
                const disabled = studiedWords.length < size
                return (
                  <button
                    key={size}
                    onClick={() => setSelectedCount(size)}
                    disabled={disabled}
                    style={{
                      padding: '14px 8px',
                      borderRadius: '12px',
                      border: '1.5px solid ' + (selectedCount === size ? accentHex : '#E7E5E4'),
                      background: selectedCount === size ? accentHex + '10' : '#fff',
                      color: selectedCount === size ? accentHex : '#18181B',
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? 'default' : 'pointer',
                      fontSize: '15px',
                      fontWeight: 800,
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {size}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '12px' }}>
              {roundSize} words available for this round · default is 15
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E7E5E4', borderRadius: '18px', padding: '22px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181B', marginBottom: '12px' }}>Question type</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
              <button
                onClick={() => setQuestionMode('mixed')}
                style={choiceBtn(questionMode === 'mixed', accentHex)}
              >
                <div style={{ fontSize: '15px', fontWeight: 800 }}>Mixed</div>
                <div style={{ fontSize: '11px', color: questionMode === 'mixed' ? accentHex : '#71717A', marginTop: '4px' }}>
                  Both ways
                </div>
              </button>
              <button
                onClick={() => setQuestionMode('to_target')}
                style={choiceBtn(questionMode === 'to_target', accentHex)}
              >
                <div style={{ fontSize: '15px', fontWeight: 800 }}>English → {isJapanese ? 'Japanese' : 'Chinese'}</div>
                <div style={{ fontSize: '11px', color: questionMode === 'to_target' ? accentHex : '#71717A', marginTop: '4px' }}>
                  {isJapanese ? 'Type word or reading' : 'Type Hanzi or pinyin'}
                </div>
              </button>
              <button
                onClick={() => setQuestionMode('to_english')}
                style={choiceBtn(questionMode === 'to_english', accentHex)}
              >
                <div style={{ fontSize: '15px', fontWeight: 800 }}>{isJapanese ? 'Japanese' : 'Chinese'} → English</div>
                <div style={{ fontSize: '11px', color: questionMode === 'to_english' ? accentHex : '#71717A', marginTop: '4px' }}>
                  Type the English meaning
                </div>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPhase('stats')} style={ghostBtn}>Stats</button>
            <button onClick={startRound} style={{ ...primaryBtn, background: accentHex }}>Start practice</button>
          </div>
        </div>
      </div>
    )
  }

  if (index >= queue.length) {
    return (
      <div style={center}>
        <div style={{ width: '100%', maxWidth: '460px', textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <h1 style={{ fontSize: '24px', color: '#18181B', marginBottom: '8px' }}>Writing round complete</h1>
          <p style={{ fontSize: '14px', color: '#71717A', marginBottom: '24px' }}>
            {roundStats.correct} correct · {roundStats.missed} missed
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPhase('start')} style={ghostBtn}>Start screen</button>
            <button onClick={resetRound} style={{ ...primaryBtn, background: accentHex }}>Practice again</button>
          </div>
        </div>
      </div>
    )
  }

  const card = cardsByVocab[current.id]
  const promptText = toEnglish ? current.word : current.meaning
  const targetLabel = toEnglish ? 'English' : isJapanese ? 'Japanese' : 'Chinese'
  const directionLabel = toEnglish
    ? `${isJapanese ? 'Japanese' : 'Chinese'} → English`
    : `English → ${isJapanese ? 'Japanese' : 'Chinese'}`
  const currentStat = writingStats[current.id] || defaultStat(current.id)
  const currentLevel = getLevel(currentStat.xp)
  const nextMultiplier = getMultiplier(getSafeStreak(currentStat) + 1)

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: '620px', margin: '0 auto', padding: '28px 24px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setPhase('start')} style={backBtn}>← Exit</button>
          <div style={{ fontSize: '13px', color: '#71717A' }}>
            {index + 1}/{queue.length} · {levelLabel} · Lv {currentLevel}
          </div>
        </div>

        <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: accentHex, transition: 'width 220ms ease' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <span style={statusPill(accentHex)}>
            {directionLabel}
          </span>
          <span style={statusPill('#D97706')}>
            🔥 {getSafeStreak(currentStat)} · next {nextMultiplier}x
          </span>
          {isJapanese && (
            <button onClick={() => setShowFurigana(prev => !prev)} style={pill(showFurigana, accentHex)}>
              Furigana
            </button>
          )}
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #E7E5E4',
          borderRadius: '18px',
          padding: '30px 28px',
          boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
          marginBottom: '18px',
        }}>
          <div style={{ fontSize: '12px', color: '#71717A', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase' }}>
            Type the {targetLabel}
          </div>
          <div style={{
            minHeight: '82px',
            display: 'flex',
            alignItems: 'center',
            fontSize: toEnglish ? '52px' : '26px',
            fontWeight: 700,
            color: '#18181B',
            fontFamily: toEnglish ? isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'" : 'Inter, sans-serif',
            lineHeight: 1.35,
          }}>
            {promptText}
          </div>
          {card && (
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '6px' }}>
              {card.is_easy ? 'Mastered' : card.state || 'Started'} · {currentStat.xp}/{MAX_XP} XP
            </div>
          )}
        </div>

        <form onSubmit={submit}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={Boolean(result)}
            autoFocus
            placeholder={toEnglish ? 'Type the English meaning' : `Type ${isJapanese ? 'word or reading' : 'Hanzi or pinyin'}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '16px 18px',
              borderRadius: '14px',
              border: '2px solid ' + (result?.status === 'correct' ? '#2F9E6D' : result?.status === 'missed' ? '#DC2626' : '#E7E5E4'),
              background: '#fff',
              fontSize: '20px',
              color: '#18181B',
              fontFamily: toEnglish ? 'Inter, sans-serif' : isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
              outline: 'none',
            }}
          />

          {result && (
            <div style={{
              marginTop: '14px',
              padding: '16px 18px',
              borderRadius: '14px',
              background: result.status === 'correct' ? '#ECFDF5' : '#FEF2F2',
              border: '1px solid ' + (result.status === 'correct' ? '#BBF7D0' : '#FECACA'),
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: result.status === 'correct' ? '#2F9E6D' : '#DC2626', marginBottom: '8px' }}>
                {result.status === 'correct'
                  ? `Correct · +${result.xpGain} XP · ${result.multiplier}x · 🔥 ${result.streak}`
                  : 'Missed · streak reset'}
              </div>
              {isJapanese && showFurigana ? (
                <JapaneseRuby word={current.word} reading={current.reading} fontSize="38px" />
              ) : (
                <div style={{ fontSize: '34px', fontWeight: 700, color: '#18181B', fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'" }}>
                  {current.word}
                </div>
              )}
              <div style={{ fontSize: '18px', color: accentHex, marginTop: '8px', fontWeight: 700, fontFamily: isJapanese ? "'Noto Sans JP'" : 'Inter, sans-serif' }}>
                {current.reading}
              </div>
              <div style={{ fontSize: '14px', color: '#71717A', marginTop: '6px' }}>
                {current.meaning}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            {!result ? (
              <button disabled={!input.trim()} style={{ ...primaryBtn, background: input.trim() ? accentHex : '#A1A1AA' }}>
                Check
              </button>
            ) : (
              <button type="button" onClick={next} style={{ ...primaryBtn, background: accentHex }}>
                Next
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E5E4', borderRadius: '14px', padding: '18px 20px' }}>
      <div style={{ fontSize: '28px', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#71717A', marginTop: '6px' }}>{label}</div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8' }
const backBtn = { background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '14px', padding: 0 }
const primaryBtn = { flex: 1, border: 'none', borderRadius: '12px', padding: '14px 18px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const ghostBtn = { flex: 1, border: '1px solid #E7E5E4', background: '#fff', borderRadius: '12px', padding: '14px 18px', color: '#71717A', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const sectionTitle = { fontSize: '15px', fontWeight: 800, color: '#18181B', margin: '0 0 12px' }
const choiceBtn = (active, accent) => ({
  minHeight: '76px',
  padding: '14px 12px',
  borderRadius: '12px',
  border: '1.5px solid ' + (active ? accent : '#E7E5E4'),
  background: active ? accent + '10' : '#fff',
  color: active ? accent : '#18181B',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  textAlign: 'left',
})
const statusPill = (accent) => ({
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid ' + accent + '33',
  background: accent + '10',
  color: accent,
  fontSize: '12px',
  fontWeight: 800,
  fontFamily: 'Inter, sans-serif',
})
const pill = (active, accent) => ({
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid ' + (active ? accent : '#E7E5E4'),
  background: active ? accent + '10' : '#fff',
  color: active ? accent : '#71717A',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
})
