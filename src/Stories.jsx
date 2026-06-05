import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const CATEGORIES = [
  { tier: 1, minWords: 20, label: 'First Steps', description: 'Words 1–50', wordRange: '1-50' },
  { tier: 2, minWords: 50, label: 'Growing', description: 'Words 1–100', wordRange: '1-100' },
  { tier: 3, minWords: 100, label: 'Comfortable', description: 'Words 1–150', wordRange: '1-150' },
  { tier: 4, minWords: 200, label: 'Confident', description: 'Words 1–250', wordRange: '1-250' },
  { tier: 5, minWords: 300, label: 'Complete', description: 'All 300 words', wordRange: '1-300' },
]

// Greedy longest-match segmentation for Chinese text
function segmentText(text, vocabMap) {
  const result = []
  let i = 0
  while (i < text.length) {
    let matched = false
    for (let len = Math.min(5, text.length - i); len >= 1; len--) {
      const candidate = text.slice(i, i + len)
      if (vocabMap[candidate]) {
        result.push({ word: candidate, vocab: vocabMap[candidate], isVocab: true })
        i += len
        matched = true
        break
      }
    }
    if (!matched) {
      if (result.length > 0 && !result[result.length - 1].isVocab) {
        result[result.length - 1].word += text[i]
      } else {
        result.push({ word: text[i], isVocab: false })
      }
      i++
    }
  }
  return result
}

function WordTooltip({ word, vocab, isKnown, isEasy, accent, onAdd }) {
  const [show, setShow] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <span
        onClick={() => setShow(s => !s)}
        style={{
          color: isEasy ? accent : isKnown ? '#666' : accent,
          background: isEasy ? `${accent}18` : isKnown ? '#f0f0f0' : `${accent}10`,
          borderRadius: '4px',
          padding: '1px 3px',
          cursor: 'pointer',
          borderBottom: `1px dashed ${isEasy ? accent : '#bbb'}`,
        }}
      >
        {word}
      </span>

      {show && (
        <>
          <div
            onClick={() => setShow(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: 'absolute', bottom: '120%', left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a1a', color: '#fff',
            borderRadius: '12px', padding: '12px 16px',
            zIndex: 20, minWidth: '130px', textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontSize: '22px', fontFamily: "'Noto Sans SC'", marginBottom: '4px' }}>{word}</div>
            <div style={{ fontSize: '14px', color: accent, marginBottom: '2px' }}>{vocab.reading}</div>
            <div style={{ fontSize: '13px', color: '#ccc' }}>{vocab.meaning}</div>
            {!isKnown && (
              <button
                onClick={e => { e.stopPropagation(); onAdd(); setShow(false) }}
                style={{
                  marginTop: '10px', background: accent, color: '#000',
                  border: 'none', borderRadius: '8px', padding: '6px 14px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%',
                }}
              >
                + Add to deck
              </button>
            )}
            {isKnown && !isEasy && (
              <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>In your deck</div>
            )}
            {isEasy && (
              <div style={{ fontSize: '11px', color: accent, marginTop: '6px' }}>✓ Mastered</div>
            )}
          </div>
        </>
      )}
    </span>
  )
}

export default function Stories({ session, profile, track, onBack }) {
  const [view, setView] = useState('categories')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  const [stories, setStories] = useState([])
  const [easyCount, setEasyCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)

  const accent = profile.active_language === 'japanese'
    ? 'var(--japanese-accent)'
    : 'var(--chinese-accent)'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: vocabData } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)

    const map = {}
    ;(vocabData || []).forEach(v => { map[v.word] = v })
    setVocabMap(map)

    const { data: cardsData } = await supabase
      .from('cards')
      .select('vocab_id, is_easy, state')
      .eq('user_id', session.user.id)

    const cardsMap = {}
    ;(cardsData || []).forEach(c => { cardsMap[c.vocab_id] = c })
    setUserCards(cardsMap)

    const vocabIds = new Set((vocabData || []).map(v => v.id))
    const easy = (cardsData || []).filter(c => vocabIds.has(c.vocab_id) && c.is_easy).length
    setEasyCount(easy)

    const { data: storiesData } = await supabase
      .from('stories')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_published', true)
      .order('tier', { ascending: true })
      .order('story_number', { ascending: true })

    setStories(storiesData || [])
    setLoading(false)
  }

  const addToDeck = async (vocabItem) => {
    const already = Object.values(userCards).some(c => c.vocab_id === vocabItem.id)
    if (already) return
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id,
      vocab_id: vocabItem.id,
      state: 'new',
      ease_factor: 2.5,
      interval_days: 0,
      learning_step: 0,
      due_at: new Date().toISOString(),
    })
    if (!error) {
      setUserCards(prev => ({ ...prev, [vocabItem.id]: { vocab_id: vocabItem.id, is_easy: false, state: 'new' } }))
    }
  }

  if (loading) {
    return <div style={center}><div style={{ fontSize: '32px', color: accent }}>学</div></div>
  }

  // ── STORY READER ──────────────────────────────────────────────────────────
  if (view === 'reader' && selectedStory) {
    const lines = selectedStory.content.split('\n').filter(Boolean)

    return (
      <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', paddingBottom: '40px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center',
          gap: '12px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', zIndex: 5,
        }}>
          <button onClick={() => setView('list')} style={backBtn}>← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>{selectedStory.title}</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '1px' }}>{selectedStory.english_summary}</div>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          padding: '10px 24px', background: '#fafafa',
          borderBottom: '1px solid #eee', display: 'flex', gap: '20px', fontSize: '12px', color: '#888',
        }}>
          <span>
            <span style={{ color: accent, borderBottom: `1px dashed ${accent}`, paddingBottom: '1px' }}>Word</span>
            {' '}= tap for details
          </span>
          <span>
            <span style={{ background: `${accent}18`, color: accent, padding: '0 4px', borderRadius: '3px' }}>Word</span>
            {' '}= not in deck yet
          </span>
        </div>

        {/* Story */}
        <div style={{ padding: '28px 24px' }}>
          {lines.map((line, lineIdx) => {
            const colonIdx = line.indexOf('：')
            let speaker = null
            let text = line

            if (colonIdx > 0 && colonIdx <= 3) {
              speaker = line.slice(0, colonIdx)
              text = line.slice(colonIdx + 1)
            }

            const segments = segmentText(text, vocabMap)

            return (
              <div key={lineIdx} style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {speaker && (
                  <span style={{
                    fontSize: '13px', fontWeight: 700, color: accent,
                    minWidth: '36px', paddingTop: '4px', fontFamily: "'Noto Sans SC'",
                  }}>
                    {speaker}
                  </span>
                )}
                <p style={{
                  fontSize: '22px', lineHeight: '1.9', margin: 0,
                  fontFamily: "'Noto Sans SC'", flex: 1,
                }}>
                  {segments.map((seg, segIdx) => {
                    if (!seg.isVocab) return <span key={segIdx}>{seg.word}</span>
                    const card = userCards[seg.vocab.id]
                    const isKnown = !!card
                    const isEasy = card?.is_easy
                    return (
                      <WordTooltip
                        key={segIdx}
                        word={seg.word}
                        vocab={seg.vocab}
                        isKnown={isKnown}
                        isEasy={isEasy}
                        accent={accent}
                        onAdd={() => addToDeck(seg.vocab)}
                      />
                    )
                  })}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── STORY LIST ────────────────────────────────────────────────────────────
  if (view === 'list' && selectedCategory) {
    const catStories = stories.filter(s => s.tier === selectedCategory.tier)

    return (
      <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', paddingBottom: '40px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('categories')} style={backBtn}>← Back</button>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{selectedCategory.label}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>{selectedCategory.description}</div>
          </div>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {catStories.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#888', padding: '48px 0', fontSize: '15px' }}>
              More stories coming soon...
            </div>
          ) : (
            catStories.map(story => (
              <button
                key={story.id}
                onClick={() => { setSelectedStory(story); setView('reader') }}
                style={{
                  padding: '20px 24px', borderRadius: '14px',
                  border: '1px solid #eee', background: '#fff',
                  textAlign: 'left', cursor: 'pointer', width: '100%',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px', fontFamily: "'Noto Sans SC'" }}>
                    {story.title}
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>{story.english_summary}</div>
                </div>
                <span style={{ color: accent, fontSize: '20px', marginLeft: '12px' }}>→</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── CATEGORIES VIEW ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={{ fontSize: '18px', fontWeight: 600 }}>Stories</div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '16px 24px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888', marginBottom: '8px' }}>
          <span>Words mastered</span>
          <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{easyCount} / 300</span>
        </div>
        <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px',
            background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
            width: `${Math.min(100, (easyCount / 300) * 100)}%`,
            transition: 'width .6s ease',
          }} />
        </div>
      </div>

      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {CATEGORIES.map(cat => {
          const unlocked = easyCount >= cat.minWords
          const catStories = stories.filter(s => s.tier === cat.tier)
          const hasStories = catStories.length > 0
          const isClickable = unlocked && hasStories

          return (
            <button
              key={cat.tier}
              onClick={() => isClickable && (setSelectedCategory(cat), setView('list'))}
              style={{
                padding: '20px 24px', borderRadius: '14px',
                border: `1px solid ${isClickable ? accent + '66' : '#eee'}`,
                background: isClickable ? `${accent}08` : '#fff',
                textAlign: 'left', width: '100%',
                cursor: isClickable ? 'pointer' : 'default',
                opacity: unlocked ? 1 : 0.45,
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '18px' }}>{unlocked ? '📖' : '🔒'}</span>
                  <span style={{ fontSize: '17px', fontWeight: 600 }}>{cat.label}</span>
                  {hasStories && unlocked && (
                    <span style={{
                      fontSize: '11px', background: accent, color: '#fff',
                      padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                    }}>
                      {catStories.length} {catStories.length === 1 ? 'story' : 'stories'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: '#888' }}>
                  {unlocked
                    ? hasStories ? cat.description : 'Stories coming soon'
                    : `Master ${cat.minWords} words to unlock`}
                </div>
              </div>
              {isClickable && <span style={{ color: accent, fontSize: '20px' }}>→</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const backBtn = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: 0 }