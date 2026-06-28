import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { ArrowLeft, Bookmark, Volume2, Play, Pause, Type, Languages, ChevronRight } from 'lucide-react'

// HSKStory-inspired reader for Chinese stories. Light theme (matches the app —
// no dark mode). Distraction-free prose, tap a word for a bottom-sheet
// definition, pinyin + translation toggles, and a bottom audio bar. Japanese
// still uses the original reader (see Stories.jsx).

const BG = 'var(--bg)'
const PANEL = 'var(--surface)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const RED = '#B83A24'
const GOLD = '#B45309'
const HILITE = 'rgba(217, 164, 62, 0.32)'

const STATUS_COLOR = {
  not_started: 'var(--text-faint)',
  learning: '#CA8A04',
  review: '#3E63DD',
  mastered: '#2F9E6D',
}

function wordStatus(vocabId, userCards) {
  const card = userCards[vocabId]
  if (!card) return 'not_started'
  if (card.is_easy) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'learning'
}

function audioUrlFor(path) {
  if (!path) return null
  const { data } = supabase.storage.from('audio').getPublicUrl(path)
  return (data && data.publicUrl) || null
}

function makeSegmenter() {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return new Intl.Segmenter('zh', { granularity: 'word' })
    }
  } catch (e) { /* not supported */ }
  return null
}

// Greedy vocab match first (so every known word stays tappable), then break the
// leftover runs into clean words with Intl.Segmenter for natural boundaries.
function segmentLine(text, vocabMap, segmenter) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    let matched = null
    const maxLen = Math.min(6, text.length - i)
    for (let len = maxLen; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (vocabMap[cand]) { matched = cand; break }
    }
    if (matched) {
      tokens.push({ text: matched, vocab: vocabMap[matched] })
      i += matched.length
      continue
    }
    // Collect a run until the next vocab match begins.
    let j = i
    while (j < text.length) {
      let isVocabStart = false
      const maxL = Math.min(6, text.length - j)
      for (let len = maxL; len >= 1; len -= 1) {
        if (vocabMap[text.slice(j, j + len)]) { isVocabStart = true; break }
      }
      if (isVocabStart) break
      j += 1
    }
    const run = text.slice(i, j)
    if (segmenter) {
      for (const seg of segmenter.segment(run)) {
        tokens.push({ text: seg.segment, vocab: null })
      }
    } else {
      tokens.push({ text: run, vocab: null })
    }
    i = j
  }
  return tokens
}

function Token({ token, isSelected, showPinyin, onSelect }) {
  const [hover, setHover] = useState(false)
  if (!token.vocab) {
    if (showPinyin) {
      return <ruby style={{ rubyAlign: 'center' }}>{token.text}<rt>&nbsp;</rt></ruby>
    }
    return <span>{token.text}</span>
  }
  const body = showPinyin
    ? <ruby>{token.text}<rt style={{ fontSize: '0.42em', color: GOLD, fontWeight: 500 }}>{token.vocab.reading}</rt></ruby>
    : token.text
  return (
    <span
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        borderRadius: '5px',
        padding: '0 1px',
        background: isSelected ? HILITE : (hover ? 'rgba(0,0,0,0.05)' : 'transparent'),
        boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.45)' : 'none',
        transition: 'background 120ms ease',
      }}
    >
      {body}
    </span>
  )
}

export default function StoryReaderCN({ story, vocabMap, userCards, setUserCards, session, track, onBack, nextStory, onNextStory }) {
  const [selected, setSelected] = useState(null) // { lineIndex, tokenKey, vocab }
  const [showPinyin, setShowPinyin] = useState(false)
  const [showEnglish, setShowEnglish] = useState(false)
  const [showSentence, setShowSentence] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const segmenterRef = useRef(null)
  const wordAudioRef = useRef(null)

  if (!segmenterRef.current) segmenterRef.current = makeSegmenter()

  useEffect(() => {
    function onResize() { setWinWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Stop any speech when leaving the story.
  useEffect(() => () => { try { window.speechSynthesis.cancel() } catch (e) { /* noop */ } }, [])

  const isMobile = winWidth < 760
  const lines = story.content.split('\n').filter(Boolean)
  const englishLines = (story.english_content || '').split('\n').filter(Boolean)
  const levelLabel = getLevelLabelSafe(track)

  const segmented = lines.map(line => segmentLine(line, vocabMap, segmenterRef.current))

  const addToDeck = async (vocabItem) => {
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id,
      vocab_id: vocabItem.id,
      state: 'new',
      ease_factor: 2.5,
      learning_step: 0,
      due_at: new Date().toISOString(),
    })
    if (!error) {
      setUserCards(prev => ({ ...prev, [vocabItem.id]: { vocab_id: vocabItem.id, is_easy: false, state: 'new' } }))
    }
  }

  const playWord = (path) => {
    const url = audioUrlFor(path)
    if (!url) return
    if (!wordAudioRef.current) wordAudioRef.current = new Audio()
    wordAudioRef.current.src = url
    wordAudioRef.current.play().catch(() => { /* ignore */ })
  }

  const toggleStoryAudio = () => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (speaking) { synth.cancel(); setSpeaking(false); return }
    const u = new SpeechSynthesisUtterance(lines.join('。'))
    u.lang = 'zh-CN'
    u.rate = 0.85
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    synth.cancel()
    synth.speak(u)
    setSpeaking(true)
  }

  const selectWord = (lineIndex, tokenKey, vocab) => {
    setShowSentence(false)
    setSelected({ lineIndex, tokenKey, vocab })
  }

  const sel = selected
  const selStatus = sel ? wordStatus(sel.vocab.id, userCards) : 'not_started'
  const selInDeck = sel ? Boolean(userCards[sel.vocab.id]) : false
  const bottomOffset = isMobile ? 'calc(62px + env(safe-area-inset-bottom))' : '0px'

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, position: 'relative', overflow: 'hidden' }}>
      {/* Decorative watermark characters */}
      {!isMobile && (
        <>
          <span style={watermarkStyle('left')}>读</span>
          <span style={watermarkStyle('right')}>书</span>
        </>
      )}

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: isMobile ? '16px 16px 6px' : '22px 28px 8px',
        maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 2,
      }}>
        <button onClick={onBack} style={ghostBtn} aria-label="Back to stories">
          <ArrowLeft size={18} strokeWidth={2} color={MUTED} />
          {!isMobile && <span style={{ color: MUTED, fontSize: '14px', fontWeight: 600 }}>Library</span>}
        </button>
        <div style={{ color: MUTED, fontSize: '13px', fontWeight: 600, textAlign: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {levelLabel} · <span style={{ color: 'var(--text-muted)' }}>{story.title}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <TopToggle active={showPinyin} onClick={() => setShowPinyin(v => !v)} icon={Type} label="Pinyin" isMobile={isMobile} />
          {story.english_content && (
            <TopToggle active={showEnglish} onClick={() => setShowEnglish(v => !v)} icon={Languages} label="EN" isMobile={isMobile} />
          )}
        </div>
      </div>

      {/* Reading column */}
      <div style={{
        maxWidth: '740px', margin: '0 auto', position: 'relative', zIndex: 2,
        padding: isMobile ? '14px 18px 200px' : '22px 28px 220px',
      }}>
        {segmented.map((tokens, li) => (
          <div key={li} style={{ marginBottom: showEnglish ? '6px' : '14px' }}>
            <p style={{
              margin: 0, textIndent: '2em',
              fontSize: isMobile ? '21px' : '28px', lineHeight: showPinyin ? 2.2 : 1.95,
              fontFamily: "'Noto Sans SC'", color: TEXT, fontWeight: 400,
            }}>
              {tokens.map((tk, ti) => (
                <Token
                  key={ti}
                  token={tk}
                  showPinyin={showPinyin}
                  isSelected={Boolean(sel) && sel.lineIndex === li && sel.tokenKey === ti}
                  onSelect={() => selectWord(li, ti, tk.vocab)}
                />
              ))}
            </p>
            {showEnglish && englishLines[li] && (
              <p style={{ margin: '2px 0 0', textIndent: '2em', fontSize: isMobile ? '14px' : '15px', lineHeight: 1.6, color: MUTED, fontStyle: 'italic' }}>
                {englishLines[li]}
              </p>
            )}
          </div>
        ))}

        {/* End-of-story → next */}
        {nextStory && (
          <button onClick={onNextStory} style={{
            marginTop: '28px', width: '100%', background: PANEL, border: '1px solid var(--border)',
            borderRadius: '16px', padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: TEXT,
          }}>
            <span>
              <span style={{ display: 'block', fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '3px' }}>Next story</span>
              <span style={{ fontSize: '17px', fontWeight: 700, fontFamily: "'Noto Sans SC'" }}>{nextStory.title}</span>
            </span>
            <ChevronRight size={22} color={RED} />
          </button>
        )}
      </div>

      {/* Word bottom sheet */}
      {sel && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(64px + ' + bottomOffset + ')', zIndex: 25,
          display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none',
        }}>
          <div style={{
            width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
            borderRadius: '18px', boxShadow: '0 -10px 40px rgba(24,24,27,0.14)', padding: '14px 18px 16px',
            pointerEvents: 'auto',
          }}>
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: '#D4D4D8', margin: '0 auto 12px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ fontSize: '26px', fontWeight: 800, color: RED, fontFamily: "'Noto Sans SC'" }}>{sel.vocab.word}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: STATUS_COLOR[selStatus], flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: MUTED, border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 9px' }}>
                  {levelLabel}
                </span>
                <button onClick={() => !selInDeck && addToDeck(sel.vocab)} aria-label="Add to deck"
                  style={{ background: 'none', border: 'none', cursor: selInDeck ? 'default' : 'pointer', padding: '4px', display: 'flex' }}>
                  <Bookmark size={20} strokeWidth={2} color={selInDeck ? RED : MUTED} fill={selInDeck ? RED : 'none'} />
                </button>
                {sel.vocab.audio_path && (
                  <button onClick={() => playWord(sel.vocab.audio_path)} aria-label="Play audio"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                    <Volume2 size={20} strokeWidth={2} color={MUTED} />
                  </button>
                )}
                <button onClick={() => setSelected(null)} aria-label="Close"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: MUTED, fontSize: '18px', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ fontSize: '17px', color: GOLD, fontWeight: 600, marginTop: '6px' }}>{sel.vocab.reading}</div>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>{sel.vocab.meaning}</div>

            {story.english_content && englishLines[sel.lineIndex] && (
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <button onClick={() => setShowSentence(v => !v)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: MUTED, fontSize: '13px', fontWeight: 600, padding: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Languages size={15} strokeWidth={2} color={MUTED} /> Translate sentence
                  </span>
                  <ChevronRight size={16} color={MUTED} style={{ transform: showSentence ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                </button>
                {showSentence && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.55 }}>
                    {englishLines[sel.lineIndex]}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom audio bar */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: bottomOffset, zIndex: 24,
        display: 'flex', justifyContent: 'center', padding: '10px 12px',
        background: 'linear-gradient(180deg, rgba(250,250,248,0) 0%, ' + BG + ' 40%)',
      }}>
        <div style={{
          width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
          borderRadius: '16px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <button onClick={toggleStoryAudio} aria-label={speaking ? 'Pause' : 'Play story'}
            style={{ width: '44px', height: '44px', borderRadius: '999px', background: RED, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {speaking ? <Pause size={20} color="#fff" fill="#fff" /> : <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: '2px' }} />}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT, fontFamily: "'Noto Sans SC'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
            <div style={{ fontSize: '12px', color: MUTED }}>{speaking ? 'Reading aloud…' : 'Listen (text-to-speech)'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopToggle({ active, onClick, icon: Icon, label, isMobile }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: active ? 'rgba(184,58,36,0.10)' : 'transparent',
      border: '1px solid ' + (active ? 'rgba(184,58,36,0.4)' : 'var(--border)'),
      color: active ? RED : MUTED, borderRadius: '999px',
      padding: isMobile ? '6px 10px' : '7px 13px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    }}>
      <Icon size={15} strokeWidth={2} />
      {label}
    </button>
  )
}

function watermarkStyle(side) {
  const base = {
    position: 'fixed', top: '50%', transform: 'translateY(-50%)',
    fontSize: '300px', fontWeight: 800, color: 'rgba(24,24,27,0.04)',
    fontFamily: "'Noto Sans SC'", pointerEvents: 'none', userSelect: 'none', zIndex: 1,
  }
  if (side === 'left') base.left = '2%'
  else base.right = '2%'
  return base
}

function getLevelLabelSafe(track) {
  const lvl = track && track.current_level ? track.current_level : 1
  return 'HSK ' + lvl
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: '7px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
}
