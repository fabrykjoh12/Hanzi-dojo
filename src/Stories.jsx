import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getLevelLabel } from './utils'
import { isLearned } from './mastery'
import { BookOpen, Lock } from 'lucide-react'

const CATEGORIES = [
  { tier: 1, minWords: 20, label: 'First Steps', description: 'Words 1–50', wordRange: '1-50' },
  { tier: 2, minWords: 50, label: 'Growing', description: 'Words 1–100', wordRange: '1-100' },
  { tier: 3, minWords: 100, label: 'Comfortable', description: 'Words 1–150', wordRange: '1-150' },
  { tier: 4, minWords: 200, label: 'Confident', description: 'Words 1–250', wordRange: '1-250' },
  { tier: 5, minWords: 300, label: 'Complete', description: 'All 300 words', wordRange: '1-300' },
]

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

function getWordStatus(vocabId, userCards) {
  const card = userCards[vocabId]
  if (!card) return 'not_started'
  if (card.is_easy) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'learning'
}

const STATUS_LABELS = {
  not_started: 'Not started',
  learning: 'Learning',
  review: 'Review',
  mastered: 'Mastered',
}

const STATUS_COLORS = {
  not_started: '#71717A',
  learning: '#D97706',
  review: '#3E63DD',
  mastered: '#2F9E6D',
}

// ── Word token with tooltip ────────────────────────────────────────────────
function WordToken({ word, vocab, userCards, accentHex, onAdd }) {
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState(false)
  const ref = useRef(null)
  const status = getWordStatus(vocab.id, userCards)

  const underlineColor = status === 'mastered'
    ? accentHex + '88'
    : status === 'not_started'
    ? '#D4D4D4'
    : '#A1A1AA'

  useEffect(() => {
    if (!show) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [show])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline' }}>
      <span
        onClick={() => setShow(s => !s)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          color: '#18181B',
          background: hovered || show ? accentHex + '12' : 'transparent',
          borderRadius: '4px',
          padding: '1px 3px',
          cursor: 'pointer',
          borderBottom: '1.5px dotted ' + underlineColor,
          transition: 'background 150ms ease',
        }}
      >
        {word}
      </span>

      {show && (
        <div style={{
          position: 'absolute',
          bottom: '130%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#fff',
          border: '1px solid #E7E5E4',
          borderRadius: '14px',
          padding: '14px 16px',
          zIndex: 50,
          minWidth: '160px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            fontSize: '26px',
            fontFamily: "'Noto Sans SC'",
            color: '#18181B',
            fontWeight: 600,
            marginBottom: '4px',
          }}>
            {word}
          </div>
          <div style={{ fontSize: '13px', color: accentHex, fontWeight: 500, marginBottom: '3px' }}>
            {vocab.reading}
          </div>
          <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '10px' }}>
            {vocab.meaning}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            fontWeight: 600,
            color: STATUS_COLORS[status],
            background: STATUS_COLORS[status] + '15',
            padding: '3px 10px',
            borderRadius: '20px',
            marginBottom: status === 'not_started' ? '10px' : 0,
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: STATUS_COLORS[status], display: 'inline-block',
            }} />
            {STATUS_LABELS[status]}
          </div>
          {status === 'not_started' && (
            <button
              onClick={e => { e.stopPropagation(); onAdd(vocab); setShow(false) }}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '0',
                padding: '7px 0',
                borderRadius: '8px',
                border: 'none',
                background: accentHex,
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              + Add to deck
            </button>
          )}
        </div>
      )}
    </span>
  )
}

// ── Story reader ───────────────────────────────────────────────────────────
function StoryReader({ story, vocabMap, userCards, setUserCards, session, track, accentHex, onBack }) {
  const isJapanese = track.language === 'japanese'

  const addToDeck = async (vocabItem) => {
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

  const lines = story.content.split('\n').filter(Boolean)

  // Collect unique vocab words from story
  const storyVocab = []
  const seen = new Set()
  lines.forEach(line => {
    const colonIdx = line.indexOf('：')
    const text = colonIdx > 0 && colonIdx <= 3 ? line.slice(colonIdx + 1) : line
    const segments = segmentText(text, vocabMap)
    segments.forEach(seg => {
      if (seg.isVocab && !seen.has(seg.vocab.id)) {
        seen.add(seg.vocab.id)
        storyVocab.push(seg.vocab)
      }
    })
  })

  // Words to review = not mastered
  const wordsToReview = storyVocab.filter(v => {
    const status = getWordStatus(v.id, userCards)
    return status !== 'mastered'
  })

  const masteredCount = storyVocab.length - wordsToReview.length
  const systemLabel = track.system === 'hsk_3' ? 'HSK 3.0' : 'JLPT'
  const levelLabel = getLevelLabel(track.language, track.system, track.current_level)

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', position: 'relative', overflow: 'hidden' }}>
      {/* Faint background character */}
      <div style={{
        position: 'fixed', right: '-20px', top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '360px', lineHeight: 1,
        color: accentHex, opacity: 0.035,
        fontFamily: "'Noto Sans SC'", fontWeight: 700,
        pointerEvents: 'none', userSelect: 'none', zIndex: 0,
      }}>
        读
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px', position: 'relative', zIndex: 1 }}>

        {/* Back */}
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '28px' }}
        >
          ← Back to stories
        </button>

        {/* Story header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '12px', fontWeight: 600,
              color: accentHex, background: accentHex + '12',
              padding: '4px 12px', borderRadius: '20px',
              border: '1px solid ' + accentHex + '30',
            }}>
              {systemLabel} · {levelLabel}
            </span>
            <span style={{
              fontSize: '12px', fontWeight: 600,
              color: '#71717A', background: '#F4F4F5',
              padding: '4px 12px', borderRadius: '20px',
              border: '1px solid #E7E5E4',
            }}>
              Dialogue
            </span>
          </div>
          <h1 style={{
            fontSize: '36px', fontWeight: 700, color: '#18181B',
            fontFamily: "'Noto Sans SC'", lineHeight: 1.2, marginBottom: '10px',
          }}>
            {story.title}
          </h1>
          {story.english_summary && (
            <p style={{ fontSize: '15px', color: '#71717A', lineHeight: 1.6, maxWidth: '600px' }}>
              {story.english_summary}
            </p>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: '20px', flexWrap: 'wrap',
          marginBottom: '24px', fontSize: '12px', color: '#71717A',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ borderBottom: '1.5px dotted ' + accentHex + '88', padding: '0 4px' }}>词</span>
            Mastered
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ borderBottom: '1.5px dotted #A1A1AA', padding: '0 4px' }}>词</span>
            In deck
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ borderBottom: '1.5px dotted #D4D4D4', padding: '0 4px' }}>词</span>
            Not in deck — tap to add
          </span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

          {/* ── Story dialogue ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              background: '#fff', borderRadius: '20px',
              border: '1px solid #E7E5E4',
              boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
            }}>
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
                  <div key={lineIdx}>
                    <div style={{
                      display: 'flex', gap: '20px', alignItems: 'flex-start',
                      padding: '22px 28px',
                    }}>
                      {speaker ? (
                        <span style={{
                          fontSize: '14px', fontWeight: 700,
                          color: accentHex,
                          minWidth: '36px', paddingTop: '6px',
                          fontFamily: "'Noto Sans SC'",
                          flexShrink: 0,
                        }}>
                          {speaker}
                        </span>
                      ) : (
                        <span style={{ minWidth: '36px', flexShrink: 0 }} />
                      )}
                      <p style={{
                        fontSize: '22px', lineHeight: 2.0, margin: 0,
                        fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
                        color: '#18181B', flex: 1,
                        letterSpacing: '0.02em',
                      }}>
                        {segments.map((seg, segIdx) => {
                          if (!seg.isVocab) {
                            return <span key={segIdx} style={{ color: '#18181B' }}>{seg.word}</span>
                          }
                          return (
                            <WordToken
                              key={segIdx}
                              word={seg.word}
                              vocab={seg.vocab}
                              userCards={userCards}
                              accentHex={accentHex}
                              onAdd={addToDeck}
                            />
                          )
                        })}
                      </p>
                    </div>
                    {lineIdx < lines.length - 1 && (
                      <div style={{ height: '1px', background: '#F4F4F5', margin: '0 28px' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Story progress card */}
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: '1px solid #E7E5E4',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              padding: '20px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181B', marginBottom: '16px' }}>
                Story progress
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: '#71717A' }}>Words mastered</span>
                <span style={{ fontWeight: 700, color: '#18181B' }}>{masteredCount} / {storyVocab.length}</span>
              </div>
              <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '3px',
                  background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'aa)',
                  width: storyVocab.length > 0 ? (masteredCount / storyVocab.length * 100) + '%' : '0%',
                  transition: 'width .6s ease',
                }} />
              </div>
              {masteredCount === storyVocab.length && storyVocab.length > 0 && (
                <div style={{ fontSize: '12px', color: '#2F9E6D', marginTop: '10px', fontWeight: 600 }}>
                  ✓ All story words mastered!
                </div>
              )}
            </div>

            {/* Words to review card */}
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: '1px solid #E7E5E4',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              padding: '20px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181B', marginBottom: '16px' }}>
                Words to review
              </div>

              {wordsToReview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎉</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#18181B', marginBottom: '4px' }}>
                    All words mastered
                  </div>
                  <div style={{ fontSize: '12px', color: '#71717A', lineHeight: 1.5 }}>
                    Great work — nothing urgent to review here.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {wordsToReview.map((vocab, idx) => {
                      const status = getWordStatus(vocab.id, userCards)
                      return (
                        <div key={vocab.id} style={{
                          padding: '11px 0',
                          borderBottom: idx < wordsToReview.length - 1 ? '1px solid #F4F4F5' : 'none',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <div>
                            <div style={{
                              fontSize: '18px', fontWeight: 600,
                              fontFamily: "'Noto Sans SC'", color: '#18181B',
                              lineHeight: 1.2, marginBottom: '2px',
                            }}>
                              {vocab.word}
                            </div>
                            <div style={{ fontSize: '11px', color: accentHex, fontWeight: 500 }}>
                              {vocab.reading}
                            </div>
                            <div style={{ fontSize: '11px', color: '#71717A', marginTop: '1px' }}>
                              {vocab.meaning}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '10px', fontWeight: 700,
                            color: STATUS_COLORS[status],
                            background: STATUS_COLORS[status] + '15',
                            padding: '3px 8px', borderRadius: '20px',
                            whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '8px',
                          }}>
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Practice button */}
                  <button
                    disabled
                    title="Coming soon — practice story words in a focused session"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid #E7E5E4',
                      background: '#FAFAF8',
                      color: '#A1A1AA',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'not-allowed',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    Practice these words
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Stories component ─────────────────────────────────────────────────
export default function Stories({ session, profile, track, onBack }) {
  const [view, setView] = useState('categories')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  const [stories, setStories] = useState([])
  const [learnedCount, setLearnedCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'

  async function loadData() {
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
      .select('vocab_id, is_easy, state, learned')
      .eq('user_id', session.user.id)

    const cardsMap = {}
    ;(cardsData || []).forEach(c => { cardsMap[c.vocab_id] = c })
    setUserCards(cardsMap)

    const vocabIds = new Set((vocabData || []).map(v => v.id))
    // Stories unlock on "learned" (graduated to review at least once) — a low bar
    // so users start immersion early. The test uses the higher stability-based mastery bar.
    const learned = (cardsData || []).filter(c => vocabIds.has(c.vocab_id) && isLearned(c)).length
    setLearnedCount(learned)

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

  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '32px', color: accentHex, fontFamily: "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  // ── Story reader ──────────────────────────────────────────────────────────
  if (view === 'reader' && selectedStory) {
    return (
      <StoryReader
        story={selectedStory}
        vocabMap={vocabMap}
        userCards={userCards}
        setUserCards={setUserCards}
        session={session}
        track={track}
        accentHex={accentHex}
        onBack={() => setView('list')}
      />
    )
  }

  // ── Story list ────────────────────────────────────────────────────────────
  if (view === 'list' && selectedCategory) {
    const catStories = stories.filter(s => s.tier === selectedCategory.tier)

    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 24px 60px' }}>
          <button onClick={() => setView('categories')} style={backBtnStyle}>← Back</button>

          <div style={{ margin: '24px 0 32px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#18181B', marginBottom: '4px' }}>
              {selectedCategory.label}
            </h1>
            <p style={{ fontSize: '14px', color: '#71717A' }}>{selectedCategory.description}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {catStories.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#71717A', padding: '48px 0', fontSize: '15px' }}>
                More stories coming soon...
              </div>
            ) : (
              catStories.map(story => (
                <StoryListCard
                  key={story.id}
                  story={story}
                  accentHex={accentHex}
                  onClick={() => { setSelectedStory(story); setView('reader') }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Categories ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 24px 60px' }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>

        <div style={{ margin: '24px 0 16px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#18181B', marginBottom: '4px' }}>Stories</h1>
          <p style={{ fontSize: '14px', color: '#71717A' }}>Read in Chinese — new stories unlock as you learn more words</p>
        </div>

        {/* Progress bar */}
        <div style={{
          background: '#fff', borderRadius: '14px',
          border: '1px solid #E7E5E4',
          padding: '16px 20px', marginBottom: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
            <span style={{ color: '#71717A' }}>Words learned</span>
            <span style={{ fontWeight: 700, color: '#18181B' }}>{learnedCount} / 300</span>
          </div>
          <div style={{ height: '6px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + '99)',
              width: Math.min(100, learnedCount / 300 * 100) + '%',
              transition: 'width .6s ease',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {CATEGORIES.map(cat => {
            const unlocked = learnedCount >= cat.minWords
            const catStories = stories.filter(s => s.tier === cat.tier)
            const hasStories = catStories.length > 0
            const isClickable = unlocked && hasStories

            return (
              <CategoryCard
                key={cat.tier}
                cat={cat}
                unlocked={unlocked}
                hasStories={hasStories}
                isClickable={isClickable}
                storyCount={catStories.length}
                accentHex={accentHex}
                onClick={() => isClickable && (setSelectedCategory(cat), setView('list'))}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StoryListCard({ story, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px 24px', borderRadius: '16px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#fff', textAlign: 'left', cursor: 'pointer', width: '100%',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px', fontFamily: "'Noto Sans SC'", color: '#18181B' }}>
          {story.title}
        </div>
        <div style={{ fontSize: '13px', color: '#71717A' }}>{story.english_summary}</div>
      </div>
      <span style={{ color: accentHex, fontSize: '18px', marginLeft: '16px', flexShrink: 0 }}>→</span>
    </button>
  )
}

function CategoryCard({ cat, unlocked, hasStories, isClickable, storyCount, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px 24px', borderRadius: '16px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#fff',
        textAlign: 'left', width: '100%',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.45,
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', color: unlocked ? accentHex : '#A1A1AA' }}>
            {unlocked ? <BookOpen size={16} strokeWidth={1.75} /> : <Lock size={16} strokeWidth={1.75} />}
          </span>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#18181B' }}>{cat.label}</span>
          {hasStories && unlocked && (
            <span style={{
              fontSize: '11px', background: accentHex, color: '#fff',
              padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
            }}>
              {storyCount} {storyCount === 1 ? 'story' : 'stories'}
            </span>
          )}
        </div>
        <div style={{ fontSize: '13px', color: '#71717A' }}>
          {unlocked
            ? (hasStories ? cat.description : 'Stories coming soon')
            : 'Master ' + cat.minWords + ' words to unlock'}
        </div>
      </div>
      {isClickable && <span style={{ color: accentHex, fontSize: '18px' }}>→</span>}
    </button>
  )
}

const backBtnStyle = {
  background: 'none', border: 'none', color: '#71717A',
  cursor: 'pointer', fontSize: '14px', padding: 0,
}
