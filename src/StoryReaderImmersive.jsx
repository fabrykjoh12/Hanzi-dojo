import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { CHARACTER_READINGS } from './characterNames'
import { getLevelLabel } from './utils'
import { ArrowLeft, Bookmark, Volume2, Play, Pause, Type, Languages, ChevronRight, UserRound } from 'lucide-react'

// HSKStory-inspired immersion reader for BOTH languages. Light theme. Tap a word
// for a bottom-sheet definition; pinyin (Chinese) / furigana (Japanese) and
// translation toggles; bottom audio bar. Word segmentation uses the browser's
// Intl.Segmenter per locale so you tap whole words, not single characters.

const PANEL = 'var(--surface)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const GOLD = '#B45309'
const HILITE = 'rgba(217, 164, 62, 0.32)'

const SPEAKER_PALETTE = ['#B83A24', '#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']

// Single-kana grammatical particles. They collide with homograph nouns stored in
// kana (は = topic marker 'wa' vs 歯 'teeth'), so exclude them from word lookup —
// in a sentence they're almost always the particle, not the noun.
const JP_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'も', 'の', 'で', 'か', 'ね', 'よ', 'わ', 'や', 'な', 'ば'])
const NO_PARTICLES = new Set()

const STATUS_COLOR = {
  not_started: 'var(--text-faint)',
  learning: '#CA8A04',
  review: '#3E63DD',
  mastered: '#2F9E6D',
}

// ── Japanese furigana helpers (reading only over kanji) ─────────────────────
function hasKanji(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9FFF) return true
  }
  return false
}
function isKana(c) { return c >= 0x3040 && c <= 0x30FF }
function furiganaParts(word, reading) {
  const w = word || ''
  const r = reading || ''
  if (!w || !r) return null
  let wS = 0, rS = 0
  while (wS < w.length && rS < r.length && isKana(w.charCodeAt(wS)) && w[wS] === r[rS]) { wS += 1; rS += 1 }
  let wE = w.length, rE = r.length
  while (wE > wS && rE > rS && isKana(w.charCodeAt(wE - 1)) && w[wE - 1] === r[rE - 1]) { wE -= 1; rE -= 1 }
  const core = w.slice(wS, wE)
  const coreReading = r.slice(rS, rE)
  if (!core || !coreReading || !hasKanji(core)) return null
  return { lead: w.slice(0, wS), core, coreReading, trail: w.slice(wE) }
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

function makeSegmenter(locale) {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return new Intl.Segmenter(locale, { granularity: 'word' })
    }
  } catch (e) { /* not supported */ }
  return null
}

function splitSpeaker(line) {
  const full = line.indexOf('：')
  const ascii = line.indexOf(':')
  let idx = -1
  if (full > 0) idx = full
  if (idx < 0 && ascii > 0) idx = ascii
  if (idx > 0 && idx <= 6) {
    return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
  }
  return { speaker: null, text: line }
}

// A proper name is one in the curated map that ISN'T a normal vocab word.
function matchName(text, i, vocabMap, names) {
  const maxLen = Math.min(4, text.length - i)
  for (let len = maxLen; len >= 2; len -= 1) {
    const cand = text.slice(i, i + len)
    if (names[cand] && !vocabMap[cand]) return cand
  }
  return null
}

// Names → greedy vocab match → Intl.Segmenter for the rest, so known words stay
// tappable as whole units and everything else has clean word boundaries.
function segmentLine(text, vocabMap, segmenter, names, particles) {
  const isVocab = (cand) => vocabMap[cand] && !(cand.length === 1 && particles.has(cand))
  const tokens = []
  let i = 0
  while (i < text.length) {
    const name = matchName(text, i, vocabMap, names)
    if (name) {
      tokens.push({ text: name, name: { word: name, reading: names[name] } })
      i += name.length
      continue
    }
    let matched = null
    const maxLen = Math.min(6, text.length - i)
    for (let len = maxLen; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (isVocab(cand)) { matched = cand; break }
    }
    if (matched) {
      tokens.push({ text: matched, vocab: vocabMap[matched] })
      i += matched.length
      continue
    }
    let j = i
    while (j < text.length) {
      if (matchName(text, j, vocabMap, names)) break
      let isVocabStart = false
      const maxL = Math.min(6, text.length - j)
      for (let len = maxL; len >= 1; len -= 1) {
        if (isVocab(text.slice(j, j + len))) { isVocabStart = true; break }
      }
      if (isVocabStart) break
      j += 1
    }
    const run = text.slice(i, j)
    if (segmenter) {
      for (const seg of segmenter.segment(run)) tokens.push({ text: seg.segment, vocab: null })
    } else {
      tokens.push({ text: run, vocab: null })
    }
    i = j
  }
  return tokens
}

function Token({ token, isSelected, showReading, isJapanese, onSelect }) {
  const [hover, setHover] = useState(false)
  const reading = token.vocab ? token.vocab.reading : (token.name ? token.name.reading : null)
  const clickable = Boolean(token.vocab || token.name)
  if (!clickable) {
    if (showReading) return <ruby>{token.text}<rt>&nbsp;</rt></ruby>
    return <span>{token.text}</span>
  }
  let body = token.text
  if (showReading && reading) {
    if (isJapanese) {
      const fp = furiganaParts(token.text, reading)
      // Names (no kanji core) and kana words just show the reading over the whole token.
      body = fp
        ? <>{fp.lead}<ruby>{fp.core}<rt style={{ fontSize: '0.5em', color: GOLD, fontWeight: 500 }}>{fp.coreReading}</rt></ruby>{fp.trail}</>
        : (token.name
            ? <ruby>{token.text}<rt style={{ fontSize: '0.42em', color: GOLD, fontWeight: 500 }}>{reading}</rt></ruby>
            : token.text)
    } else {
      body = <ruby>{token.text}<rt style={{ fontSize: '0.42em', color: GOLD, fontWeight: 500 }}>{reading}</rt></ruby>
    }
  }
  return (
    <span
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', borderRadius: '5px', padding: '0 1px',
        background: isSelected ? HILITE : (hover ? 'rgba(0,0,0,0.05)' : 'transparent'),
        boxShadow: isSelected ? '0 0 0 1px rgba(202,138,4,0.45)' : 'none',
        transition: 'background 120ms ease',
      }}
    >
      {body}
    </span>
  )
}

export default function StoryReaderImmersive({ story, vocabMap, userCards, setUserCards, session, track, onBack, nextStory, onNextStory }) {
  const [selected, setSelected] = useState(null)
  const [showReading, setShowReading] = useState(false)
  const [showEnglish, setShowEnglish] = useState(false)
  const [showSentence, setShowSentence] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const segmenterRef = useRef(null)
  const wordAudioRef = useRef(null)

  const isJapanese = track.language === 'japanese'
  const accent = isJapanese ? '#2E3A6E' : '#B83A24'
  const font = isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'"
  const names = isJapanese ? {} : CHARACTER_READINGS.chinese
  const particles = isJapanese ? JP_PARTICLES : NO_PARTICLES
  const watermark = isJapanese ? ['読', '書'] : ['读', '书']
  const readingLabel = isJapanese ? 'Furigana' : 'Pinyin'
  const levelLabel = getLevelLabel(track.language, track.system, track.current_level)

  if (!segmenterRef.current) segmenterRef.current = makeSegmenter(isJapanese ? 'ja' : 'zh')

  useEffect(() => {
    function onResize() { setWinWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => () => { try { window.speechSynthesis.cancel() } catch (e) { /* noop */ } }, [])

  const isMobile = winWidth < 760
  const lines = story.content.split('\n').filter(Boolean)
  const englishLines = (story.english_content || '').split('\n').filter(Boolean)

  const speakerColors = {}
  let speakerN = 0
  const parsed = lines.map(line => {
    const { speaker, text } = splitSpeaker(line)
    if (speaker && speakerColors[speaker] === undefined) {
      speakerColors[speaker] = SPEAKER_PALETTE[speakerN % SPEAKER_PALETTE.length]
      speakerN += 1
    }
    return { speaker, tokens: segmentLine(text, vocabMap, segmenterRef.current, names, particles) }
  })

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
    const u = new SpeechSynthesisUtterance(lines.map(l => splitSpeaker(l).text).join('。'))
    u.lang = isJapanese ? 'ja-JP' : 'zh-CN'
    u.rate = 0.85
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    synth.cancel()
    synth.speak(u)
    setSpeaking(true)
  }

  const selectToken = (lineIndex, tokenKey, token) => {
    setShowSentence(false)
    setSelected({ lineIndex, tokenKey, vocab: token.vocab || null, name: token.name || null })
  }

  const sel = selected
  const isName = Boolean(sel && sel.name)
  const selStatus = sel && sel.vocab ? wordStatus(sel.vocab.id, userCards) : 'not_started'
  const selInDeck = sel && sel.vocab ? Boolean(userCards[sel.vocab.id]) : false
  const bottomOffset = isMobile ? 'calc(62px + env(safe-area-inset-bottom))' : '0px'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: TEXT, position: 'relative', overflow: 'hidden' }}>
      {!isMobile && (
        <>
          <span style={watermarkStyle('left', font)}>{watermark[0]}</span>
          <span style={watermarkStyle('right', font)}>{watermark[1]}</span>
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
          <TopToggle active={showReading} onClick={() => setShowReading(v => !v)} icon={Type} label={readingLabel} accent={accent} isMobile={isMobile} />
          {story.english_content && (
            <TopToggle active={showEnglish} onClick={() => setShowEnglish(v => !v)} icon={Languages} label="EN" accent={accent} isMobile={isMobile} />
          )}
        </div>
      </div>

      {/* Reading column */}
      <div style={{
        maxWidth: '740px', margin: '0 auto', position: 'relative', zIndex: 2,
        padding: isMobile ? '14px 18px 200px' : '22px 28px 220px',
      }}>
        {parsed.map(({ speaker, tokens }, li) => (
          <div key={li} style={{ marginBottom: speaker ? '22px' : '18px' }}>
            {speaker && (
              <div
                onClick={names[speaker] ? () => selectToken(li, 'sp', { name: { word: speaker, reading: names[speaker] } }) : undefined}
                style={{
                  fontSize: '13px', fontWeight: 700, letterSpacing: '0.4px',
                  color: speakerColors[speaker], marginBottom: '5px',
                  fontFamily: font, display: 'inline-block',
                  cursor: names[speaker] ? 'pointer' : 'default',
                }}
              >
                {speaker}
              </div>
            )}
            <p style={{
              margin: 0,
              fontSize: isMobile ? '20px' : '25px', lineHeight: showReading ? 2.05 : 1.75,
              fontFamily: font, color: TEXT, fontWeight: 400,
              paddingLeft: isMobile ? '2px' : '4px',
            }}>
              {tokens.map((tk, ti) => (
                <Token
                  key={ti}
                  token={tk}
                  showReading={showReading}
                  isJapanese={isJapanese}
                  isSelected={Boolean(sel) && sel.lineIndex === li && sel.tokenKey === ti}
                  onSelect={() => selectToken(li, ti, tk)}
                />
              ))}
            </p>
            {showEnglish && englishLines[li] && (
              <p style={{ margin: '6px 0 0', fontSize: isMobile ? '14px' : '15px', lineHeight: 1.55, color: MUTED, fontStyle: 'italic', paddingLeft: speaker ? (isMobile ? '2px' : '4px') : 0 }}>
                {speaker ? splitSpeaker(englishLines[li]).text : englishLines[li]}
              </p>
            )}
          </div>
        ))}

        {nextStory && (
          <button onClick={onNextStory} style={{
            marginTop: '28px', width: '100%', background: PANEL, border: '1px solid var(--border)',
            borderRadius: '16px', padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: TEXT,
          }}>
            <span>
              <span style={{ display: 'block', fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '3px' }}>Next story</span>
              <span style={{ fontSize: '17px', fontWeight: 700, fontFamily: font }}>{nextStory.title}</span>
            </span>
            <ChevronRight size={22} color={accent} />
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

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: accent, fontFamily: font, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                  {isName ? sel.name.word : sel.vocab.word}
                </span>
                {!isName && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: STATUS_COLOR[selStatus], flexShrink: 0 }} />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, paddingTop: '2px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
                  color: isName ? accent : MUTED,
                  border: '1px solid ' + (isName ? accent + '40' : 'var(--border)'),
                  background: isName ? accent + '12' : 'transparent',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}>
                  {isName && <UserRound size={12} strokeWidth={2.2} color={accent} />}
                  {isName ? 'Name' : levelLabel}
                </span>
                {!isName && (
                  <button onClick={() => !selInDeck && addToDeck(sel.vocab)} aria-label="Add to deck"
                    style={{ background: 'none', border: 'none', cursor: selInDeck ? 'default' : 'pointer', padding: '4px', display: 'flex' }}>
                    <Bookmark size={20} strokeWidth={2} color={selInDeck ? accent : MUTED} fill={selInDeck ? accent : 'none'} />
                  </button>
                )}
                {!isName && sel.vocab.audio_path && (
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

            <div style={{ fontSize: '17px', color: GOLD, fontWeight: 600, marginTop: '6px' }}>
              {isName ? sel.name.reading : sel.vocab.reading}
            </div>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
              {isName ? 'Proper noun — a character’s name.' : sel.vocab.meaning}
            </div>

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
                    {splitSpeaker(englishLines[sel.lineIndex]).speaker ? splitSpeaker(englishLines[sel.lineIndex]).text : englishLines[sel.lineIndex]}
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
        background: 'linear-gradient(180deg, rgba(250,250,248,0) 0%, var(--bg) 40%)',
      }}>
        <div style={{
          width: '100%', maxWidth: '760px', background: PANEL, border: '1px solid var(--border)',
          borderRadius: '16px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <button onClick={toggleStoryAudio} aria-label={speaking ? 'Pause' : 'Play story'}
            style={{ width: '44px', height: '44px', borderRadius: '999px', background: accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {speaking ? <Pause size={20} color="#fff" fill="#fff" /> : <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: '2px' }} />}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
            <div style={{ fontSize: '12px', color: MUTED }}>{speaking ? 'Reading aloud…' : 'Listen (text-to-speech)'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopToggle({ active, onClick, icon: Icon, label, accent, isMobile }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: active ? accent + '1A' : 'transparent',
      border: '1px solid ' + (active ? accent + '66' : 'var(--border)'),
      color: active ? accent : MUTED, borderRadius: '999px',
      padding: isMobile ? '6px 10px' : '7px 13px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    }}>
      <Icon size={15} strokeWidth={2} />
      {label}
    </button>
  )
}

function watermarkStyle(side, font) {
  const base = {
    position: 'fixed', top: '50%', transform: 'translateY(-50%)',
    fontSize: '300px', fontWeight: 800, color: 'var(--reader-watermark)',
    fontFamily: font, pointerEvents: 'none', userSelect: 'none', zIndex: 1,
  }
  if (side === 'left') base.left = '2%'
  else base.right = '2%'
  return base
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: '7px',
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
}
