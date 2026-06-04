import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { calcNextReview } from './srs'

export default function Study({ session, profile, onBack }) {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const level = profile.active_language === 'chinese' ? profile.chinese_level : profile.japanese_level

  useEffect(() => {
    loadQueue()
  }, [])

  const loadQueue = async () => {
    setLoading(true)

    // 1. Get all vocabulary for this level/language
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', profile.active_language)
      .eq('level', level)

    // 2. Get the user's existing cards (their progress)
    const { data: cards } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', session.user.id)

    const cardsByVocab = {}
    ;(cards || []).forEach(c => { cardsByVocab[c.vocab_id] = c })

    const now = new Date()

    // Due review cards (already started, due now)
    const dueCards = (cards || [])
      .filter(c => new Date(c.next_review) <= now)
      .map(c => ({ ...c, vocab: vocab.find(v => v.id === c.vocab_id) }))
      .filter(c => c.vocab)

    // New cards (vocab with no card yet), limited by daily goal
    const newVocab = (vocab || [])
      .filter(v => !cardsByVocab[v.id])
      .slice(0, profile.daily_card_goal)
      .map(v => ({ id: null, vocab_id: v.id, vocab: v, isNew: true, interval: 1, ease_factor: 2.5, repetitions: 0 }))

    setQueue([...dueCards, ...newVocab])
    setLoading(false)
    setDone((dueCards.length + newVocab.length) === 0)
  }

  const handleGrade = async (grade) => {
    const card = queue[0]
    const updated = calcNextReview(card, grade)

    if (card.id) {
      // Existing card — update it
      await supabase.from('cards').update(updated).eq('id', card.id)
    } else {
      // New card — create it
      await supabase.from('cards').insert({
        user_id: session.user.id,
        vocab_id: card.vocab_id,
        ...updated,
      })
    }

    setFlipped(false)

    // If failed (Again), move card to back of queue; otherwise remove it
    setTimeout(() => {
      if (grade === 0) {
        setQueue(prev => [...prev.slice(1), prev[0]])
      } else {
        const next = queue.slice(1)
        setQueue(next)
        if (next.length === 0) setDone(true)
      }
    }, 150)
  }

  if (loading) {
    return <div style={center}><div style={{ fontSize: '32px', color: accent }}>学</div></div>
  }

  if (done || queue.length === 0) {
    return (
      <div style={center}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>All done for now!</h1>
          <p style={{ color: '#888', marginBottom: '24px' }}>No more cards due. Come back later.</p>
          <button onClick={onBack} style={{ ...btn, background: accent, color: '#fff', border: 'none' }}>
            Back home
          </button>
        </div>
      </div>
    )
  }

  const card = queue[0]
  const v = card.vocab
  const isJapanese = profile.active_language === 'japanese'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' }}>
          ← Exit
        </button>
        <div style={{ fontSize: '13px', color: '#888' }}>{queue.length} left</div>
      </div>

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div
          onClick={() => setFlipped(true)}
          style={{
            width: '100%',
            maxWidth: '420px',
            minHeight: '280px',
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: '20px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: flipped ? 'default' : 'pointer',
            padding: '32px',
          }}
        >
          <div style={{
            fontSize: '72px',
            fontWeight: 400,
            color: '#1a1a1a',
            fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
          }}>
            {v.word}
          </div>

          {!flipped && <div style={{ fontSize: '13px', color: '#bbb', marginTop: '24px' }}>tap to reveal</div>}

          {flipped && (
            <>
              <div style={{ fontSize: '20px', color: accent, marginTop: '16px', fontWeight: 500 }}>{v.pinyin}</div>
              <div style={{ fontSize: '18px', color: '#555', marginTop: '8px' }}>{v.meaning}</div>
            </>
          )}
        </div>
      </div>

      {/* Grade buttons */}
      <div style={{ padding: '24px', maxWidth: '460px', margin: '0 auto', width: '100%' }}>
        {!flipped ? (
          <button onClick={() => setFlipped(true)} style={{ ...btn, width: '100%', background: '#1a1a1a', color: '#fff', border: 'none' }}>
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
                  padding: '14px 4px',
                  borderRadius: '10px',
                  border: `1px solid ${color}33`,
                  background: `${color}11`,
                  color: color,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
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