import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { schedule, previewLabels } from './srs'
import { updateStreak } from './streak'
import { Volume2 } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function getAudioUrl(audioPath) {
  if (!audioPath) return null
  return `${SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`
}

function hasKanji(text) {
  return /[\u3400-\u9FFF]/.test(text || '')
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

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const isJapanese = profile.active_language === 'japanese'

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

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
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


  // Play audio when card is revealed
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

  if (loading) {
    return <div style={center}><div style={{ fontSize: '32px', color: accent }}>学</div></div>
  }

  if (done || queue.length === 0) {
    return (
      <div style={center}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>All done for now!</h1>
          <p style={{ color: '#888', marginBottom: '24px' }}>No cards due. Come back later.</p>
          <button onClick={onBack} style={{ ...btn, background: accent, color: '#fff', border: 'none' }}>
            Back home
          </button>
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
  const hasExample = Boolean(v.example_sentence || v.example_reading || v.example_translation)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {saveError && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
          padding: '12px 20px', fontSize: '13px', lineHeight: 1.5,
        }}>
          <strong>Card save failed</strong> — your progress is not being saved. Database error: {saveError}
          <br />Run the migration SQL in your Supabase SQL Editor, then refresh.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' }}>
          ← Exit
        </button>
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', fontWeight: 600 }}>
          <span style={{ color: '#3E63DD' }}>New {newCount}</span>
          <span style={{ color: '#E08C00' }}>Learning {learnCount}</span>
          <span style={{ color: '#30A46C' }}>Due {dueCount}</span>
        </div>
      </div>

      {isJapanese && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '0 24px 12px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowFurigana(prev => !prev)} style={toggleBtn(showFurigana, accent)}>
            Furigana
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div
          onClick={() => !flipped && setFlipped(true)}
          style={{
            width: '100%', maxWidth: '420px', minHeight: '280px',
            background: '#fff', border: '1px solid #eee', borderRadius: '20px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: flipped ? 'default' : 'pointer', padding: '32px', position: 'relative',
          }}
        >
          {audioUrl && flipped && (
            <button
              onClick={e => { e.stopPropagation(); playAudio() }}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#71717A', opacity: 0.5, padding: '4px',
                display: 'inline-flex', transition: 'opacity .2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
              title="Replay audio"
            >
              <Volume2 size={18} strokeWidth={2} />
            </button>
          )}

          {showRuby ? (
            <ruby style={{
              fontSize: '72px', fontWeight: 400, color: '#1a1a1a',
              fontFamily: "'Noto Sans JP'", lineHeight: 1.35,
            }}>
              {v.word}
              {v.reading && <rt style={{ fontSize: '18px', color: '#71717A' }}>{v.reading}</rt>}
            </ruby>
          ) : (
            <div style={{
              fontSize: '72px', fontWeight: 400, color: '#1a1a1a',
              fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
            }}>
              {v.word}
            </div>
          )}

          {!flipped && (
            <div style={{ fontSize: '13px', color: '#bbb', marginTop: '24px' }}>tap to reveal</div>
          )}

          {flipped && (
            <>
              {showReadingLine && (
                <div style={{ fontSize: '20px', color: accent, marginTop: '16px', fontWeight: 500 }}>
                  {v.reading}
                </div>
              )}
              <div style={{ fontSize: '18px', color: '#555', marginTop: '8px' }}>
                {v.meaning}
              </div>
              {hasExample && (
                <div style={{
                  width: '100%', maxWidth: '340px', marginTop: '18px', paddingTop: '16px',
                  borderTop: '1px solid #F1F1F0', textAlign: 'center',
                }}>
                  {v.example_sentence && (
                    <div style={{
                      fontSize: '20px', color: '#27272A', lineHeight: 1.5,
                      fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
                    }}>
                      {v.example_sentence}
                    </div>
                  )}
                  {v.example_reading && (
                    <div style={{ fontSize: '14px', color: accent, marginTop: '6px', lineHeight: 1.45 }}>
                      {v.example_reading}
                    </div>
                  )}
                  {v.example_translation && (
                    <div style={{ fontSize: '14px', color: '#71717A', marginTop: '6px', lineHeight: 1.45 }}>
                      {v.example_translation}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '460px', margin: '0 auto', width: '100%' }}>
        {!flipped ? (
          <button
            onClick={() => setFlipped(true)}
            style={{ ...btn, width: '100%', background: '#1a1a1a', color: '#fff', border: 'none' }}
          >
            Show answer
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { g: 0, label: 'Again', color: '#E5484D' },
              { g: 1, label: 'Hard', color: '#E08C00' },
              { g: 2, label: 'Good', color: '#3E63DD' },
              { g: 3, label: 'Easy', color: '#30A46C' },
            ].map(({ g, label, color }) => (
              <button
                key={g}
                onClick={() => handleGrade(g)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                  padding: '12px 4px', borderRadius: '10px',
                  border: `1px solid ${color}33`, background: `${color}11`,
                  color, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {label}
                <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.75 }}>
                  {labels[g]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const btn = { padding: '12px 24px', borderRadius: '10px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }
const toggleBtn = (active, accent) => ({
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
