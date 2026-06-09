import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { isLearned } from './mastery'
import {
  ArrowLeft, ArrowRight, BookOpen, BookOpenCheck, CheckCircle2,
  Circle, Library, Lock, Plus, Sparkles,
} from 'lucide-react'

const CATEGORIES = [
  { tier: 1, minWords: 30, label: 'First Steps', description: 'Stories using the first 100 most common words' },
  { tier: 2, minWords: 100, label: 'Growing', description: 'Stories using the first 200 most common words' },
  { tier: 3, minWords: 200, label: 'Fluent', description: 'All 300 HSK 1 words in use' },
]

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

function segmentText(text, vocabMap) {
  const result = []
  let i = 0
  while (i < text.length) {
    let matched = false
    for (let len = Math.min(5, text.length - i); len >= 1; len -= 1) {
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
      i += 1
    }
  }
  return result
}

function splitSpeakerLine(line) {
  const fullWidthIndex = line.indexOf('：')
  const asciiIndex = line.indexOf(':')
  let colonIdx = -1
  if (fullWidthIndex > 0) colonIdx = fullWidthIndex
  if (colonIdx < 0 && asciiIndex > 0) colonIdx = asciiIndex

  if (colonIdx > 0 && colonIdx <= 3) {
    return { speaker: line.slice(0, colonIdx), text: line.slice(colonIdx + 1) }
  }
  return { speaker: null, text: line }
}

function getWordStatus(vocabId, userCards) {
  const card = userCards[vocabId]
  if (!card) return 'not_started'
  if (card.is_easy) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'learning'
}

function getLanguageDetails(profile, track) {
  const isJapanese = profile.active_language === 'japanese' || track.language === 'japanese'
  return {
    isJapanese,
    accentHex: isJapanese ? '#2E3A6E' : '#B83A24',
    languageName: isJapanese ? 'Japanese' : 'Chinese',
    nativeName: isJapanese ? '日本語' : '中文',
    fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
  }
}

function pageShell() {
  return {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
  }
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
        border: '1px solid #E7E5E4',
        background: hovered ? '#F7F7F5' : '#FFFFFF',
        color: '#52525B',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="#71717A" />
      {label}
    </button>
  )
}

function ProgressCard({ learnedCount, totalWords, accentHex }) {
  const pct = totalWords > 0 ? Math.min(100, Math.round((learnedCount / totalWords) * 100)) : 0
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '20px',
      border: '1px solid #E7E5E4',
      padding: '22px 24px',
      boxShadow: '0 18px 48px rgba(24,24,27,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#18181B', fontSize: '14px', fontWeight: 750 }}>Immersion unlocks</span>
        <span style={{ color: '#71717A', fontSize: '13px', fontWeight: 650 }}>
          <span style={{ color: '#18181B', fontWeight: 800 }}>{learnedCount}</span>/{totalWords} · {pct}%
        </span>
      </div>
      <div style={{ height: '7px', background: '#E7E5E4', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: pct + '%',
          background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
          borderRadius: '999px', transition: 'width 600ms ease',
        }} />
      </div>
      <p style={{ margin: '12px 0 0', color: '#71717A', fontSize: '13px', lineHeight: 1.5 }}>
        Stories unlock from learned words, so reading starts early and reinforces the flashcards.
      </p>
    </div>
  )
}

function WordToken({ word, vocab, userCards, accentHex, fontFamily, onAdd }) {
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
          borderRadius: '5px',
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
          bottom: '135%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#FFFFFF',
          border: '1px solid #E7E5E4',
          borderRadius: '16px',
          padding: '16px',
          zIndex: 50,
          minWidth: '180px',
          boxShadow: '0 16px 42px rgba(24,24,27,0.14)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            fontSize: '27px',
            fontFamily,
            color: '#18181B',
            fontWeight: 650,
            marginBottom: '5px',
          }}>
            {word}
          </div>
          {vocab.reading && (
            <div style={{ fontSize: '13px', color: accentHex, fontWeight: 650, marginBottom: '4px' }}>
              {vocab.reading}
            </div>
          )}
          <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '11px' }}>
            {vocab.meaning}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 750,
            color: STATUS_COLORS[status],
            background: STATUS_COLORS[status] + '15',
            padding: '4px 10px',
            borderRadius: '999px',
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
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 0',
                borderRadius: '10px',
                border: 'none',
                background: accentHex,
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 750,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <Plus size={14} strokeWidth={2} color="#FFFFFF" />
              Add to deck
            </button>
          )}
        </div>
      )}
    </span>
  )
}

function StoryReader({ story, vocabMap, userCards, setUserCards, session, track, languageDetails, onBack }) {
  const { isJapanese, accentHex, fontFamily } = languageDetails

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
  const storyVocab = []
  const seen = new Set()
  lines.forEach(line => {
    const { text } = splitSpeakerLine(line)
    const segments = segmentText(text, vocabMap)
    segments.forEach(seg => {
      if (seg.isVocab && !seen.has(seg.vocab.id)) {
        seen.add(seg.vocab.id)
        storyVocab.push(seg.vocab)
      }
    })
  })

  const wordsToReview = storyVocab.filter(v => getWordStatus(v.id, userCards) !== 'mastered')
  const masteredCount = storyVocab.length - wordsToReview.length
  const levelLabel = getLevelLabel(track.language, track.system, track.current_level)
  const systemLabel = getSystemLabel(track.system)
  const progressPct = storyVocab.length > 0 ? masteredCount / storyVocab.length * 100 : 0

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back to stories" onClick={onBack} />

        <div style={{ margin: '28px 0 28px', maxWidth: '760px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>
              {systemLabel} · {levelLabel}
            </span>
            <span style={pillStyle('#71717A', '#F4F4F5', '#E7E5E4')}>Level-matched reading</span>
          </div>
          <h1 style={{
            margin: 0, color: '#18181B', fontSize: '38px', fontWeight: 800,
            lineHeight: 1.15, fontFamily,
          }}>
            {story.title}
          </h1>
          {story.english_summary && (
            <p style={{ color: '#71717A', fontSize: '15px', lineHeight: 1.65, margin: '12px 0 0', maxWidth: '680px' }}>
              {story.english_summary}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
          <div style={{
            background: '#FFFFFF', border: '1px solid #E7E5E4',
            borderRadius: '24px',
            boxShadow: '0 22px 64px rgba(24,24,27,0.07)',
            overflow: 'visible',
          }}>
            {lines.map((line, lineIdx) => {
              const { speaker, text } = splitSpeakerLine(line)
              const segments = segmentText(text, vocabMap)

              return (
                <div key={lineIdx}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: speaker ? '48px minmax(0, 1fr)' : 'minmax(0, 1fr)',
                    gap: '18px',
                    alignItems: 'start',
                    padding: '26px 32px',
                  }}>
                    {speaker && (
                      <span style={{
                        width: '40px', height: '40px', borderRadius: '14px',
                        background: accentHex + '10', color: accentHex,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '15px', fontWeight: 800, fontFamily,
                        border: '1px solid ' + accentHex + '18',
                      }}>
                        {speaker}
                      </span>
                    )}
                    <p style={{
                      margin: 0,
                      fontSize: '24px',
                      lineHeight: 2,
                      fontFamily,
                      color: '#18181B',
                      letterSpacing: isJapanese ? '0' : '0.01em',
                    }}>
                      {segments.map((seg, segIdx) => {
                        if (!seg.isVocab) {
                          return <span key={segIdx}>{seg.word}</span>
                        }
                        return (
                          <WordToken
                            key={segIdx}
                            word={seg.word}
                            vocab={seg.vocab}
                            userCards={userCards}
                            accentHex={accentHex}
                            fontFamily={fontFamily}
                            onAdd={addToDeck}
                          />
                        )
                      })}
                    </p>
                  </div>
                  {lineIdx < lines.length - 1 && (
                    <div style={{ height: '1px', background: '#F4F4F5', margin: '0 32px' }} />
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '24px' }}>
            <div style={sidePanelStyle()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px' }}>
                <BookOpenCheck size={18} strokeWidth={1.85} color={accentHex} />
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#18181B' }}>Story progress</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '9px' }}>
                <span style={{ color: '#71717A' }}>Words mastered</span>
                <span style={{ fontWeight: 800, color: '#18181B' }}>{masteredCount} / {storyVocab.length}</span>
              </div>
              <div style={{ height: '7px', background: '#E7E5E4', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: progressPct + '%',
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
                  transition: 'width 600ms ease',
                }} />
              </div>
              {masteredCount === storyVocab.length && storyVocab.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  color: '#2F9E6D', fontSize: '12px', fontWeight: 750, marginTop: '12px',
                }}>
                  <CheckCircle2 size={15} strokeWidth={2} color="#2F9E6D" />
                  All story words mastered
                </div>
              )}
            </div>

            <div style={sidePanelStyle()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '14px' }}>
                <Sparkles size={18} strokeWidth={1.85} color={accentHex} />
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#18181B' }}>Words to review</span>
              </div>

              {wordsToReview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
                  <CheckCircle2 size={28} strokeWidth={1.9} color="#2F9E6D" />
                  <div style={{ fontSize: '13px', fontWeight: 750, color: '#18181B', marginTop: '10px' }}>
                    All words mastered
                  </div>
                  <div style={{ fontSize: '12px', color: '#71717A', lineHeight: 1.5, marginTop: '4px' }}>
                    Nothing urgent to review here.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {wordsToReview.map((vocab, idx) => {
                      const status = getWordStatus(vocab.id, userCards)
                      return (
                        <div key={vocab.id} style={{
                          padding: '12px 0',
                          borderBottom: idx < wordsToReview.length - 1 ? '1px solid #F4F4F5' : 'none',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '19px', fontWeight: 700, fontFamily, color: '#18181B', lineHeight: 1.25 }}>
                              {vocab.word}
                            </div>
                            {vocab.reading && (
                              <div style={{ fontSize: '11px', color: accentHex, fontWeight: 650, marginTop: '3px' }}>
                                {vocab.reading}
                              </div>
                            )}
                            <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px', lineHeight: 1.35 }}>
                              {vocab.meaning}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '10px', fontWeight: 800,
                            color: STATUS_COLORS[status],
                            background: STATUS_COLORS[status] + '15',
                            padding: '4px 8px', borderRadius: '999px',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    disabled
                    title="Coming soon - practice story words in a focused session"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      minHeight: '42px',
                      borderRadius: '12px',
                      border: '1px solid #E7E5E4',
                      background: '#FAFAF8',
                      color: '#A1A1AA',
                      fontSize: '13px',
                      fontWeight: 700,
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

export default function Stories({ session, profile, track, onBack }) {
  const [view, setView] = useState('categories')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  const [stories, setStories] = useState([])
  const [learnedCount, setLearnedCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)

  const languageDetails = getLanguageDetails(profile, track)
  const { accentHex, languageName, nativeName, fontFamily } = languageDetails
  const totalWords = track.language === 'japanese' ? 400 : 300

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
      <div style={pageShell()}>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: '#FFFFFF', border: '1px solid #E7E5E4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookOpen size={34} strokeWidth={1.75} color={accentHex} />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'reader' && selectedStory) {
    return (
      <StoryReader
        story={selectedStory}
        vocabMap={vocabMap}
        userCards={userCards}
        setUserCards={setUserCards}
        session={session}
        track={track}
        languageDetails={languageDetails}
        onBack={() => setView('list')}
      />
    )
  }

  if (view === 'list' && selectedCategory) {
    const catStories = stories.filter(s => s.tier === selectedCategory.tier)
    return (
      <div style={pageShell()}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <IconButton icon={ArrowLeft} label="Back" onClick={() => setView('categories')} />

          <div style={{ margin: '28px 0 24px' }}>
            <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>
              {selectedCategory.wordRange} words
            </span>
            <h1 style={{ fontSize: '34px', fontWeight: 800, color: '#18181B', margin: '14px 0 8px' }}>
              {selectedCategory.label}
            </h1>
            <p style={{ fontSize: '15px', color: '#71717A', lineHeight: 1.6, margin: 0 }}>
              Choose a story matched to this vocabulary tier.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>
            {catStories.length === 0 ? (
              <EmptyPanel
                icon={Library}
                title="More stories coming soon"
                text="This tier is ready for new content, but no stories have been published yet."
              />
            ) : (
              catStories.map(story => (
                <StoryListCard
                  key={story.id}
                  story={story}
                  accentHex={accentHex}
                  fontFamily={fontFamily}
                  onClick={() => { setSelectedStory(story); setView('reader') }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: '28px',
          alignItems: 'end',
          margin: '28px 0 24px',
        }}>
          <div>
            <div style={{ color: accentHex, fontSize: '13px', fontWeight: 800, marginBottom: '10px' }}>
              {nativeName} immersion
            </div>
            <h1 style={{ margin: 0, color: '#18181B', fontSize: '42px', fontWeight: 850, lineHeight: 1.1 }}>
              Stories
            </h1>
            <p style={{ margin: '12px 0 0', color: '#71717A', fontSize: '15px', lineHeight: 1.65 }}>
              Read in {languageName}. New stories unlock as your flashcards become learned.
            </p>
          </div>
          <ProgressCard learnedCount={learnedCount} totalWords={totalWords} accentHex={accentHex} />
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
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
                learnedCount={learnedCount}
                accentHex={accentHex}
                onClick={() => {
                  if (!isClickable) return
                  setSelectedCategory(cat)
                  setView('list')
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StoryListCard({ story, accentHex, fontFamily, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '22px 24px',
        borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#FFFFFF',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr) 28px',
        gap: '16px',
        alignItems: 'center',
      }}
    >
      <div style={{
        width: '44px', height: '44px', borderRadius: '15px',
        background: accentHex + '10',
        border: '1px solid ' + accentHex + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BookOpen size={21} strokeWidth={1.8} color={accentHex} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 750,
          marginBottom: '5px',
          fontFamily,
          color: '#18181B',
        }}>
          {story.title}
        </div>
        <div style={{ fontSize: '13px', color: '#71717A', lineHeight: 1.5 }}>
          {story.english_summary}
        </div>
      </div>
      <ArrowRight size={20} strokeWidth={2} color={accentHex} />
    </button>
  )
}

function CategoryCard({ cat, unlocked, hasStories, isClickable, storyCount, learnedCount, accentHex, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = unlocked ? BookOpen : Lock
  const remaining = Math.max(0, cat.minWords - learnedCount)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '22px 24px',
        borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#FFFFFF',
        textAlign: 'left',
        width: '100%',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.58,
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr) auto',
        gap: '16px',
        alignItems: 'center',
      }}
    >
      <div style={{
        width: '48px', height: '48px', borderRadius: '16px',
        background: unlocked ? accentHex + '10' : '#F4F4F5',
        border: '1px solid ' + (unlocked ? accentHex + '18' : '#E7E5E4'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} strokeWidth={1.8} color={unlocked ? accentHex : '#A1A1AA'} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#18181B' }}>{cat.label}</span>
          {hasStories && unlocked && (
            <span style={pillStyle('#FFFFFF', accentHex, accentHex)}>
              {storyCount} {storyCount === 1 ? 'story' : 'stories'}
            </span>
          )}
        </div>
        <div style={{ fontSize: '13px', color: '#71717A', lineHeight: 1.5 }}>
          {unlocked
            ? (hasStories ? cat.description : 'Stories coming soon')
            : remaining + ' more learned words to unlock'}
        </div>
      </div>

      {isClickable ? (
        <ArrowRight size={20} strokeWidth={2} color={accentHex} />
      ) : (
        <Circle size={10} strokeWidth={2} color="#D4D4D8" />
      )}
    </button>
  )
}

function EmptyPanel({ icon: Icon, title, text }) {
  return (
    <div style={{
      textAlign: 'center',
      color: '#71717A',
      padding: '54px 28px',
      fontSize: '15px',
      background: '#FFFFFF',
      border: '1px solid #E7E5E4',
      borderRadius: '22px',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="#A1A1AA" />
      <div style={{ color: '#18181B', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>
        {title}
      </div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>
        {text}
      </div>
    </div>
  )
}

function pillStyle(color, background, border) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: 800,
    color,
    background,
    border: '1px solid ' + border,
    padding: '5px 11px',
    borderRadius: '999px',
    lineHeight: 1,
  }
}

function sidePanelStyle() {
  return {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid #E7E5E4',
    boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    padding: '20px',
  }
}
