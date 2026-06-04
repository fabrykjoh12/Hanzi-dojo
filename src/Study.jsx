import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { schedule, previewLabels } from './srs'
import { updateStreak } from './streak'

export default function Study({ session, profile, track, onBack, onStreakUpdate }) {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [streakDone, setStreakDone] = useState(false)

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const isJapanese = profile.active_language === 'japanese'

  useEffect(() => { loadQueue() }, [])

  const loadQueue = async () => {
    setLoading(true)

    // Fetch vocab for this language track in fixed order
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    // Fetch all user cards
    const { data: cards } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', session.user.id)

    const vocabById = {}
    ;(vocab || []).forEach(v => { vocabById[v.id] = v })

    // How many new cards introduced today?
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const introducedToday = (cards || [])
      .filter(c => new Date(c.created_at) >= startOfToday).length
    const remainingNew = Math.max(0, profile.daily_new_cards - introducedToday)

    const now = new Date()
    const startedVocab = new Set()

    // Attach vocab to existing cards for this level
    const levelCards = (cards || [])
      .map(c => ({ ...c, vocab: vocabById[c.vocab_id] }))
      .filter(c => c.vocab)
    levelCards.forEach(c => startedVocab.add(c.vocab_id))

    const dueLearning = levelCards
      .filter(c => c.state === 'learning' && new Date(c.due_at) <= now)
    const dueReview = levelCards
      .filter(c => c.state === 'review' && new Date(c.due_at) <= now)

    // New cards in sort_order, limited by today's remaining goal
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

  const handleGrade = async (grade) => {
    const card = queue[0]
    const res = schedule(card, grade)

    // Update streak once per session
    if (!streakDone) {
      setStreakDone(true)
      const newStreak = await updateStreak(profile)
      if (onStreakUpdate) onStreakUpdate(newStreak)
    }

    // Save to database
    let cardId = card.id
    if (cardId) {
      await supabase.from('cards').update(res.updates).eq('id', cardId)
    } else {
      const { data } = await supabase
        .from('cards')
        .insert({
          user_id: session.user.id,
          vocab_id: card.vocab_id,
          ...res.updates,
        })
        .select('id')
        .single()
      cardId = data?.id
    }

    setFlipped(false)

    // Update session queue
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

  // Live counts
  const newCount = queue.filter(c => c.state === 'new').length
  const learnCount = queue.filter(c => c.state === 'learning').length
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
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

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div
          onClick={() => setFlipped(true)}
          style={{
            width: '100%', maxWidth: '420px', minHeight: '280px',
            background: '#fff', border: '1px solid #eee', borderRadius: '20px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: flipped ? 'default' : 'pointer', padding: '32px',
          }}
        >
          <div style={{
            fontSize: '72px', fontWeight: 400, color: '#1a1a1a',
            fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
          }}>
            {v.word}
          </div>

          {!flipped && (
            <div style={{ fontSize: '13px', color: '#bbb', marginTop: '24px' }}>tap to reveal</div>
          )}

          {flipped && (
            <>
              <div style={{ fontSize: '20px', color: accent, marginTop: '16px', fontWeight: 500 }}>
                {v.reading}
              </div>
              <div style={{ fontSize: '18px', color: '#555', marginTop: '8px' }}>
                {v.meaning}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grade buttons */}
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