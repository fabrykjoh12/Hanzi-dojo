import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { schedule, previewLabels } from './srs'
import { updateStreak } from './streak'
import { getLevelLabel, getSystemLabel } from './utils'
import {
  Volume2, ArrowLeft, Eye, RotateCcw, AlertTriangle, Check,
  Sparkles, CheckCircle2, Layers, BookOpenCheck,
} from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

function getAudioUrl(audioPath) {
  if (!audioPath) return null
  return SUPABASE_URL + '/storage/v1/object/public/audio/' + audioPath
}

function hasKanji(text) {
  const value = text || ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0x3400 && code <= 0x9FFF) return true
  }
  return false
}

function QueuePill({ label, value, color, background }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 12px', borderRadius: '14px',
      background, border: '1px solid ' + color + '22',
      minWidth: '94px', justifyContent: 'center',
    }}>
      <span style={{ fontSize: '15px', fontWeight: 750, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#52525B' }}>{label}</span>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick, color, background, border }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        border: border || '1px solid #E7E5E4',
        background: hovered ? '#F7F7F5' : (background || '#FFFFFF'),
        color: color || '#52525B',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color={color || '#71717A'} />
      {label}
    </button>
  )
}

function GradeButton({ grade, label, interval, color, icon: Icon, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={() => onClick(grade)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '6px', minHeight: '76px', padding: '12px 8px',
        borderRadius: '16px', border: '1px solid ' + color + (hovered ? '66' : '30'),
        background: hovered ? color + '14' : color + '0D',
        color, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 10px 22px rgba(24,24,27,0.08)' : 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 750 }}>
        <Icon size={16} strokeWidth={2} color={color} />
        {label}
      </span>
      <span style={{ fontSize: '11px', fontWeight: 650, color: '#71717A' }}>
        {interval}
      </span>
    </button>
  )
}

function PrimaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        width: '100%', minHeight: '54px', borderRadius: '16px', border: 'none',
        background: hovered ? SAGE_DARK : SAGE, color: '#FFFFFF',
        fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 28px rgba(110,132,102,0.28)' : '0 6px 18px rgba(110,132,102,0.18)',
      }}
    >
      <Icon size={18} strokeWidth={2.1} color="#FFFFFF" />
      {children}
    </button>
  )
}

export default function Study({ session, profile, track, onBack, onStreakUpdate }) {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [streakDone, setStreakDone] = useState(false)
  const [showFurigana, setShowFurigana] = useState(true)
  const [saveError, setSaveError] = useState(null)
  const audioRef = useRef(null)

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const isJapanese = profile.active_language === 'japanese'
  const langFont = isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'"
  const langChars = isJapanese ? 'Japanese' : 'Chinese'
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  function playAudio() {
    const card = queue[0]
    if (!card?.vocab?.audio_path) return
    const url = getAudioUrl(card.vocab.audio_path)
    if (!url) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    audioRef.current = new Audio(url)
    audioRef.current.play().catch(() => {})
  }

  async function loadQueue() {
    setLoading(true)

    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const { data: cards } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', session.user.id)

    const vocabById = {}
    ;(vocab || []).forEach(v => { vocabById[v.id] = v })

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const introducedToday = (cards || [])
      .filter(c => new Date(c.created_at) >= startOfToday && vocabById[c.vocab_id]).length
    const remainingNew = Math.max(0, profile.daily_new_cards - introducedToday)

    const now = new Date()
    const startedVocab = new Set()

    const levelCards = (cards || [])
      .map(c => ({ ...c, vocab: vocabById[c.vocab_id] }))
      .filter(c => c.vocab)
    levelCards.forEach(c => startedVocab.add(c.vocab_id))

    const dueLearning = levelCards
      .filter(c => (c.state === 'learning' || c.state === 'relearning') && new Date(c.due_at) <= now)
    const dueReview = levelCards
      .filter(c => c.state === 'review' && new Date(c.due_at) <= now)

    const newItems = (vocab || [])
      .filter(v => !startedVocab.has(v.id))
      .slice(0, remainingNew)
      .map(v => ({
        id: null, vocab_id: v.id, vocab: v,
        state: 'new', ease_factor: 2.5, interval_days: 0, learning_step: 0,
      }))

    const newQueue = [...dueLearning, ...newItems, ...dueReview]
    setQueue(newQueue)
    setDone(newQueue.length === 0)
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(loadQueue, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (flipped && queue.length > 0) {
      playAudio()
    }
  }, [flipped])

  const handleGrade = async (grade) => {
    const card = queue[0]
    const res = schedule(card, grade)

    if (!streakDone) {
      setStreakDone(true)
      const newStreak = await updateStreak(profile)
      if (onStreakUpdate) onStreakUpdate(newStreak)
    }

    let cardId = card.id
    if (cardId) {
      const { error } = await supabase.from('cards').update(res.updates).eq('id', cardId)
      if (error) {
        console.error('[Study] card update failed', error)
        setSaveError(error.message)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('cards')
        .insert({ user_id: session.user.id, vocab_id: card.vocab_id, ...res.updates })
        .select('id')
        .single()
      if (error) {
        console.error('[Study] card insert failed', error)
        setSaveError(error.message)
        return
      }
      cardId = data?.id
    }

    setFlipped(false)

    setQueue(prev => {
      const rest = prev.slice(1)
      if (res.stay) {
        const item = { ...card, ...res.updates, id: cardId }
        const pos = Math.min(res.gap, rest.length)
        rest.splice(pos, 0, item)
      }
      if (rest.length === 0) setDone(true)
      return rest
    })
  }

  const newCount = queue.filter(c => c.state === 'new').length
  const learnCount = queue.filter(c => c.state === 'learning' || c.state === 'relearning').length
  const dueCount = queue.filter(c => c.state === 'review').length
  const pageShell = {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    padding: '20px 32px 36px',
  }


  if (loading) {
    return (
      <div style={pageShell}>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: '#FFFFFF', border: '1px solid #E7E5E4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookOpenCheck size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (done || queue.length === 0) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', maxWidth: '520px', textAlign: 'center',
            background: '#FFFFFF', border: '1px solid #E7E5E4',
            borderRadius: '24px', padding: '46px 38px',
            boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
          }}>
            <div style={{
              width: '58px', height: '58px', borderRadius: '18px',
              margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accentHex + '10', border: '1px solid ' + accentHex + '18',
            }}>
              <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: '#18181B' }}>
              All done for now
            </h1>
            <p style={{ color: '#71717A', marginBottom: '28px', fontSize: '15px', lineHeight: 1.6 }}>
              No cards are waiting. Come back later, or continue the loop with stories.
            </p>
            <PrimaryButton onClick={onBack} icon={ArrowLeft}>
              Back home
            </PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  const card = queue[0]
  const v = card.vocab
  const labels = previewLabels(card)
  const audioUrl = getAudioUrl(v.audio_path)
  const canUseFurigana = isJapanese && hasKanji(v.word) && Boolean(v.reading)
  const showRuby = canUseFurigana && (showFurigana || flipped)
  const showReadingLine = flipped && v.reading && !isJapanese
  const hasExample = Boolean(v.example_sentence || v.example_pinyin || v.example_translation)

  function renderExampleSentence(sentence, word) {
    if (!sentence) return null
    const idx = word ? sentence.indexOf(word) : -1
    if (idx === -1 || !word) {
      return <span>{sentence}</span>
    }
    const before = sentence.slice(0, idx)
    const after = sentence.slice(idx + word.length)
    return (
      <span>
        {before}
        <span style={{ color: accentHex, borderBottom: '1px solid ' + accentHex + '88' }}>{word}</span>
        {after}
      </span>
    )
  }
  const stateLabel = card.state === 'new' ? 'New card' : (card.state === 'review' ? 'Review' : 'Learning')

  return (
    <div style={pageShell}>
      {saveError && (
        <div style={{
          maxWidth: '680px', margin: '0 auto 18px',
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
          padding: '14px 18px', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5,
        }}>
          <strong>Card save failed</strong> - your progress is not being saved. Database error: {saveError}
          <br />Run the migration SQL in your Supabase SQL Editor, then refresh.
        </div>
      )}

      <div style={{ maxWidth: '680px', margin: '0 auto 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
          <IconButton icon={ArrowLeft} label="Exit" onClick={onBack} />
        </div>

        <div style={{ textAlign: 'center', minWidth: 0, marginBottom: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            color: accentHex, fontSize: '13px', fontWeight: 750, marginBottom: '6px',
          }}>
            <Layers size={17} strokeWidth={1.8} color={accentHex} />
            {langChars} flashcards
          </div>
          <h1 style={{ fontSize: '28px', color: '#18181B', fontWeight: 780, lineHeight: 1.1 }}>
            Study session
          </h1>
          <div style={{ color: '#71717A', fontSize: '13px', fontWeight: 550, marginTop: '5px' }}>
            {systemLabel} · {levelLabel}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <QueuePill label="New" value={newCount} color="#3E63DD" background="#EEF2FF" />
          <QueuePill label="Learn" value={learnCount} color="#D97706" background="#FFFBEB" />
          <QueuePill label="Due" value={dueCount} color="#2F9E6D" background="#ECFDF5" />
        </div>
      </div>

      {isJapanese && (
        <div style={{ maxWidth: '680px', margin: '0 auto 14px', display: 'flex', justifyContent: 'center' }}>
          <IconButton
            icon={BookOpenCheck}
            label={showFurigana ? 'Furigana on' : 'Furigana off'}
            onClick={() => setShowFurigana(prev => !prev)}
            color={showFurigana ? accentHex : '#71717A'}
            background={showFurigana ? accentHex + '10' : '#FFFFFF'}
            border={'1px solid ' + (showFurigana ? accentHex + '30' : '#E7E5E4')}
          />
        </div>
      )}

      <div style={{
        maxWidth: '680px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', justifyItems: 'center',
      }}>
        <div
          onClick={() => !flipped && setFlipped(true)}
          style={{
            width: '100%', maxWidth: '680px', minHeight: '420px',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFDFC 100%)',
            border: '1px solid #E7E5E4', borderRadius: '26px',
            boxShadow: '0 24px 70px rgba(24,24,27,0.08)',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
            cursor: flipped ? 'default' : 'pointer', padding: '24px', position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '999px',
              background: accentHex + '10', color: accentHex,
              fontSize: '12px', fontWeight: 750, border: '1px solid ' + accentHex + '18',
            }}>
              <Sparkles size={14} strokeWidth={1.9} color={accentHex} />
              {stateLabel}
            </span>
          </div>

          {audioUrl && flipped && (
            <button
              onClick={e => { e.stopPropagation(); playAudio() }}
              style={{
                position: 'absolute', top: '82px', right: '24px',
                width: '40px', height: '40px', borderRadius: '13px',
                background: '#FFFFFF', border: '1px solid #E7E5E4', cursor: 'pointer',
                color: '#71717A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 10px 24px rgba(24,24,27,0.07)',
              }}
              title="Replay audio"
              aria-label="Replay audio"
            >
              <Volume2 size={18} strokeWidth={1.9} />
            </button>
          )}

          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: '34px 24px',
          }}>
            {showRuby ? (
              <ruby style={{
                fontSize: '86px', fontWeight: 400, color: '#18181B',
                fontFamily: langFont, lineHeight: 1.25,
              }}>
                {v.word}
                {v.reading && <rt style={{ fontSize: '18px', color: '#71717A' }}>{v.reading}</rt>}
              </ruby>
            ) : (
              <div style={{
                fontSize: '86px', fontWeight: 400, color: '#18181B',
                fontFamily: langFont, lineHeight: 1.08,
                overflowWrap: 'anywhere',
              }}>
                {v.word}
              </div>
            )}

            {!flipped && (
              <div style={{ fontSize: '13px', color: '#A1A1AA', marginTop: '28px', fontWeight: 650 }}>
                Tap the card or reveal the answer
              </div>
            )}

            {flipped && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {showReadingLine && (
                  <div style={{ fontSize: '21px', color: accent, marginTop: '18px', fontWeight: 650 }}>
                    {v.reading}
                  </div>
                )}
                <div style={{ fontSize: '19px', color: '#52525B', marginTop: '10px', lineHeight: 1.45, fontWeight: 550 }}>
                  {v.meaning}
                </div>
                {hasExample && (
                  <div style={{
                    width: '100%', maxWidth: '430px', marginTop: '22px', paddingTop: '18px',
                    borderTop: '1px solid #E7E5E4', textAlign: 'center',
                  }}>
                    {v.example_sentence && (
                      <div style={{
                        fontSize: '17px', color: '#18181B', lineHeight: 1.5,
                        fontFamily: langFont,
                      }}>
                        {renderExampleSentence(v.example_sentence, v.word)}
                      </div>
                    )}
                    {v.example_pinyin && (
                      <div style={{ fontSize: '13px', color: accentHex, marginTop: '7px', lineHeight: 1.45, fontWeight: 550 }}>
                        {v.example_pinyin}
                      </div>
                    )}
                    {v.example_translation && (
                      <div style={{ fontSize: '13px', color: '#71717A', marginTop: '7px', lineHeight: 1.45 }}>
                        {v.example_translation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{
            minHeight: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderTop: '1px solid #F4F4F2', paddingTop: '18px',
          }}>
            <span style={{ fontSize: '12px', color: '#A1A1AA', fontWeight: 650 }}>
              {flipped ? 'How well did you remember this?' : 'Recall first, then reveal'}
            </span>
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: '680px', marginTop: '14px' }}>
          {!flipped ? (
            <PrimaryButton onClick={() => setFlipped(true)} icon={Eye}>
              Show answer
            </PrimaryButton>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '10px',
            }}>
              {[
                { grade: 0, label: 'Again', color: '#DC2626', icon: RotateCcw },
                { grade: 1, label: 'Hard', color: '#D97706', icon: AlertTriangle },
                { grade: 2, label: 'Good', color: '#3E63DD', icon: Check },
                { grade: 3, label: 'Easy', color: '#2F9E6D', icon: Sparkles },
              ].map(item => (
                <GradeButton
                  key={item.grade}
                  grade={item.grade}
                  label={item.label}
                  interval={labels[item.grade]}
                  color={item.color}
                  icon={item.icon}
                  onClick={handleGrade}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
