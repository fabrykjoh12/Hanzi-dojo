import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { isLearned } from './mastery'
import {
  ArrowLeft, ArrowRight, BookOpen, BookOpenCheck, CheckCircle2,
  Circle, Library, Lock, Plus, Sparkles, Volume2, Type, Award,
} from 'lucide-react'

// ─── CATEGORIES ────────────────────────────────────────────────────────────

const CATEGORIES_CHINESE = [
  { tier: 1, minWords: 30,  label: 'First Steps', wordRange: '1–100', description: 'Stories using the first 100 most common HSK 1 words' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories using the first 200 most common HSK 1 words' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–300', description: 'All 300 HSK 1 words in use' },
]

const CATEGORIES_JAPANESE = [
  { tier: 1, minWords: 30,  label: 'First Steps', wordRange: '1–100', description: 'Stories using the first 100 most common JLPT N5 words' },
  { tier: 2, minWords: 100, label: 'Growing',     wordRange: '1–200', description: 'Stories using the first 200 most common JLPT N5 words' },
  { tier: 3, minWords: 200, label: 'Fluent',      wordRange: '1–400', description: 'All 400 N5 Part 1 words in use' },
]

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

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

const SPEAKER_PALETTE = ['#B83A24', '#2E3A6E', '#2F9E6D', '#D97706', '#7C3AED']

// ─── UTILITIES ─────────────────────────────────────────────────────────────

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
  if (colonIdx > 0 && colonIdx <= 6) {
    return { speaker: line.slice(0, colonIdx), text: line.slice(colonIdx + 1).trim() }
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

function hasKanji(str) {
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c >= 0x4E00 && c <= 0x9FFF) return true
    if (c >= 0x3400 && c <= 0x4DBF) return true
  }
  return false
}

function speakText(text, isJapanese) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = isJapanese ? 'ja-JP' : 'zh-CN'
  utt.rate = 0.85
  window.speechSynthesis.speak(utt)
}

// ─── STYLE HELPERS ─────────────────────────────────────────────────────────

function pageShell() {
  return { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
}

function pillStyle(color, background, border) {
  return {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '12px', fontWeight: 800,
    color, background, border: '1px solid ' + border,
    padding: '5px 11px', borderRadius: '999px', lineHeight: 1,
  }
}

function sidePanelStyle() {
  return {
    background: '#FFFFFF',
    border: '1px solid #E7E5E4',
    borderRadius: '20px',
    padding: '20px 22px',
    boxShadow: '0 4px 20px rgba(24,24,27,0.05)',
  }
}

// ─── SHARED COMPONENTS ─────────────────────────────────────────────────────

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
        color: '#52525B', fontSize: '13px', fontWeight: 650,
        fontFamily: 'Inter, sans-serif', cursor: 'pointer',
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
      border: '1px solid #E7E5E4', padding: '22px 24px',
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

// ─── CHARACTER GUIDE ───────────────────────────────────────────────────────

const CHARACTER_READINGS = {
  chinese: {
    '李明': 'Lǐ Míng', '小花': 'Xiǎo Huā', '大力': 'Dà Lì',
    '小明': 'Xiǎo Míng', '小红': 'Xiǎo Hóng', '妈妈': 'Māma',
    '路人': 'Lù rén', '大毛': 'Dà Máo', '服务员': 'Fúwùyuán',
    '收银员': 'Shōuyínyuán', '店员': 'Diànyuán',
  },
  japanese: {},
}

function CharacterPill({ name, pinyin, accentHex, fontFamily }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!pos) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setPos(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pos])

  function handleToggle(e) {
    if (pos) { setPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top })
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px', borderRadius: '999px',
          border: '1px solid ' + accentHex + '30',
          background: pos ? accentHex + '12' : accentHex + '08',
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          transition: 'background 140ms ease',
        }}
      >
        <span style={{ fontSize: '15px', fontFamily: fontFamily, color: accentHex, fontWeight: 700 }}>{name}</span>
        <span style={{ fontSize: '12px', color: '#71717A', fontWeight: 500 }}>{pinyin}</span>
      </button>
      {pos && (
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y - 8,
          transform: 'translate(-50%, -100%)',
          background: '#FFFFFF', border: '1px solid #E7E5E4',
          borderRadius: '16px', padding: '16px 20px',
          zIndex: 200, minWidth: '160px',
          boxShadow: '0 16px 42px rgba(24,24,27,0.14)',
          textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '28px', fontFamily: fontFamily, color: '#18181B', fontWeight: 700, marginBottom: '4px' }}>{name}</div>
          <div style={{ fontSize: '14px', color: accentHex, fontWeight: 650, marginBottom: '6px' }}>{pinyin}</div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>Character name</div>
        </div>
      )}
    </span>
  )
}

function CharacterGuide({ content, accentHex, fontFamily, language }) {
  const map = CHARACTER_READINGS[language] || CHARACTER_READINGS.chinese
  const found = Object.keys(map).filter(name => content.indexOf(name) !== -1)
  if (found.length === 0) return null
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7E5E4',
      borderRadius: '16px', padding: '12px 16px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
        Characters
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {found.map(name => (
          <CharacterPill key={name} name={name} pinyin={map[name]} accentHex={accentHex} fontFamily={fontFamily} />
        ))}
      </div>
    </div>
  )
}

// ─── VOCABULARY POPUP ──────────────────────────────────────────────────────

function VocabularyPopup({ word, vocab, userCards, accentHex, fontFamily, onAdd, showFurigana }) {
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState(false)
  const ref = useRef(null)
  const status = getWordStatus(vocab.id, userCards)
  const showRuby = showFurigana && hasKanji(word) && vocab.reading

  useEffect(() => {
    if (!show) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [show])

  const underlineColor = status === 'mastered' ? accentHex + '88'
    : status === 'not_started' ? '#D4D4D4' : '#A1A1AA'

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline' }}>
      <span
        onClick={() => setShow(s => !s)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: 'pointer',
          borderBottom: '1.5px dotted ' + underlineColor,
          background: hovered || show ? accentHex + '12' : 'transparent',
          borderRadius: '4px',
          padding: '1px 2px',
          transition: 'background 150ms ease',
          display: 'inline',
        }}
      >
        {showRuby ? (
          <ruby>
            {word}
            <rt style={{ fontSize: '0.55em', fontWeight: 500, color: accentHex + 'CC' }}>{vocab.reading}</rt>
          </ruby>
        ) : word}
      </span>
      {show && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#FFFFFF',
          border: '1px solid #E7E5E4',
          borderRadius: '18px',
          padding: '18px 20px',
          zIndex: 100,
          minWidth: '200px',
          boxShadow: '0 20px 48px rgba(24,24,27,0.16)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '30px', fontFamily, color: '#18181B', fontWeight: 700, marginBottom: '5px' }}>{word}</div>
          {vocab.reading && (
            <div style={{ fontSize: '14px', color: accentHex, fontWeight: 700, marginBottom: '4px' }}>{vocab.reading}</div>
          )}
          <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '12px' }}>{vocab.meaning}</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', fontWeight: 750,
            color: STATUS_COLORS[status], background: STATUS_COLORS[status] + '15',
            padding: '4px 10px', borderRadius: '999px',
            marginBottom: status === 'not_started' ? '10px' : 0,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLORS[status], display: 'inline-block' }} />
            {STATUS_LABELS[status]}
          </div>
          {status === 'not_started' && (
            <button
              onClick={e => { e.stopPropagation(); onAdd(vocab); setShow(false) }}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center',
                gap: '6px', padding: '9px 0', borderRadius: '10px',
                border: 'none', background: accentHex, color: '#FFFFFF',
                fontSize: '12px', fontWeight: 750, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <Plus size={13} strokeWidth={2.2} color="#FFFFFF" />
              Add to deck
            </button>
          )}
        </div>
      )}
    </span>
  )
}

// ─── STORY LINE ────────────────────────────────────────────────────────────

function StoryLine({ line, vocabMap, userCards, accentHex, fontFamily, isJapanese, showFurigana, speakerIndex, onAdd }) {
  const { speaker, text } = splitSpeakerLine(line)
  const segments = segmentText(text, vocabMap)
  const speakerColor = speakerIndex !== null && speakerIndex !== undefined
    ? SPEAKER_PALETTE[speakerIndex % SPEAKER_PALETTE.length] : null

  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '18px 24px' }}>
      {/* Speaker avatar or indent spacer */}
      <div style={{ width: '36px', flexShrink: 0, paddingTop: '6px' }}>
        {speakerColor ? (
          <div style={{
            width: '36px', height: '36px', borderRadius: '11px',
            background: speakerColor + '18',
            border: '1px solid ' + speakerColor + '28',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 800, color: speakerColor,
            fontFamily, flexShrink: 0,
          }}>
            {speaker.slice(0, 1)}
          </div>
        ) : null}
      </div>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {speaker && (
          <div style={{ fontSize: '11px', fontWeight: 750, color: speakerColor, marginBottom: '5px', letterSpacing: '0.03em' }}>
            {speaker}
          </div>
        )}
        <p style={{
          margin: 0, fontSize: '22px', lineHeight: 2.1,
          fontFamily, color: '#18181B',
          letterSpacing: isJapanese ? '0.02em' : '0',
        }}>
          {segments.map((seg, idx) => {
            if (!seg.isVocab) return <span key={idx}>{seg.word}</span>
            return (
              <VocabularyPopup
                key={idx}
                word={seg.word}
                vocab={seg.vocab}
                userCards={userCards}
                accentHex={accentHex}
                fontFamily={fontFamily}
                onAdd={onAdd}
                showFurigana={showFurigana}
              />
            )
          })}
        </p>
      </div>

      {/* Audio button */}
      <button
        onClick={() => speakText(text, isJapanese)}
        title="Read aloud"
        style={{
          flexShrink: 0, width: '30px', height: '30px', borderRadius: '9px',
          border: '1px solid #E7E5E4', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginTop: '8px',
          transition: 'background 140ms ease, border-color 140ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F4F4F2'; e.currentTarget.style.borderColor = '#D4D4D0' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#E7E5E4' }}
      >
        <Volume2 size={13} strokeWidth={1.9} color="#A1A1AA" />
      </button>
    </div>
  )
}

// ─── TOGGLE BUTTON ─────────────────────────────────────────────────────────

function ToggleButton({ active, onClick, icon: Icon, label, accentHex }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        height: '34px', padding: '0 13px', borderRadius: '10px',
        border: '1px solid ' + (active ? accentHex + '40' : '#E7E5E4'),
        background: active ? accentHex + '0E' : '#FFFFFF',
        color: active ? accentHex : '#71717A',
        fontSize: '12px', fontWeight: 700,
        cursor: 'pointer', transition: 'all 150ms ease',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <Icon size={14} strokeWidth={active ? 2.2 : 1.85} />
      {label}
    </button>
  )
}

// ─── STORY PROGRESS CARD ───────────────────────────────────────────────────

function StoryProgressCard({ masteredCount, totalVocab, accentHex }) {
  const pct = totalVocab > 0 ? Math.round(masteredCount / totalVocab * 100) : 0
  return (
    <div style={sidePanelStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px' }}>
        <BookOpenCheck size={17} strokeWidth={1.85} color={accentHex} />
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#18181B' }}>Story progress</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
        <span style={{ color: '#71717A' }}>Words mastered</span>
        <span style={{ fontWeight: 800, color: '#18181B' }}>
          {masteredCount}
          <span style={{ color: '#A1A1AA', fontWeight: 500 }}>/{totalVocab}</span>
        </span>
      </div>
      <div style={{ height: '6px', background: '#F0F0ED', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: pct + '%',
          background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
          borderRadius: '999px', transition: 'width 600ms ease',
        }} />
      </div>
      {masteredCount === totalVocab && totalVocab > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2F9E6D', fontSize: '12px', fontWeight: 750, marginTop: '10px' }}>
          <CheckCircle2 size={14} strokeWidth={2} color="#2F9E6D" />
          All story words mastered
        </div>
      )}
    </div>
  )
}

// ─── REVIEW WORDS CARD ─────────────────────────────────────────────────────

function ReviewWordsCard({ wordsToReview, userCards, accentHex, fontFamily }) {
  return (
    <div style={sidePanelStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '14px' }}>
        <Sparkles size={17} strokeWidth={1.85} color={accentHex} />
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#18181B' }}>Words to review</span>
      </div>
      {wordsToReview.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 6px' }}>
          <CheckCircle2 size={26} strokeWidth={1.9} color="#2F9E6D" />
          <div style={{ fontSize: '13px', fontWeight: 750, color: '#18181B', marginTop: '9px' }}>All words mastered</div>
          <div style={{ fontSize: '12px', color: '#71717A', lineHeight: 1.5, marginTop: '4px' }}>Nothing to review here.</div>
        </div>
      ) : (
        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          {wordsToReview.map((vocab, idx) => {
            const status = getWordStatus(vocab.id, userCards)
            return (
              <div key={vocab.id} style={{
                padding: '10px 0',
                borderBottom: idx < wordsToReview.length - 1 ? '1px solid #F4F4F5' : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily, color: '#18181B', lineHeight: 1.25 }}>{vocab.word}</div>
                  {vocab.reading && (
                    <div style={{ fontSize: '11px', color: accentHex, fontWeight: 650, marginTop: '2px' }}>{vocab.reading}</div>
                  )}
                  <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px', lineHeight: 1.35 }}>{vocab.meaning}</div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 800,
                  color: STATUS_COLORS[status], background: STATUS_COLORS[status] + '15',
                  padding: '3px 8px', borderRadius: '999px',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>{STATUS_LABELS[status]}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── STORY COMPLETION CARD ─────────────────────────────────────────────────

function StoryCompletionCard({ totalVocab, masteredCount, accentHex, onBack, onNext }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, ' + accentHex + '08, ' + accentHex + '14)',
      border: '1px solid ' + accentHex + '25',
      borderRadius: '24px',
      padding: '40px 32px',
      textAlign: 'center',
      marginTop: '20px',
    }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '20px',
        background: accentHex + '14', border: '1px solid ' + accentHex + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 18px',
      }}>
        <Award size={30} strokeWidth={1.75} color={accentHex} />
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#18181B', marginBottom: '8px' }}>
        Story complete!
      </div>
      <div style={{ fontSize: '14px', color: '#71717A', lineHeight: 1.6, marginBottom: '24px' }}>
        {masteredCount} of {totalVocab} story words mastered
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            height: '42px', padding: '0 20px', borderRadius: '12px',
            border: '1px solid #E7E5E4', background: '#FFFFFF',
            color: '#52525B', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          Back to stories
        </button>
        {onNext && (
          <button
            onClick={onNext}
            style={{
              height: '42px', padding: '0 20px', borderRadius: '12px',
              border: 'none', background: accentHex,
              color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              display: 'inline-flex', alignItems: 'center', gap: '7px',
            }}
          >
            Next story
            <ArrowRight size={15} strokeWidth={2.2} color="#FFFFFF" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── STORY READER ──────────────────────────────────────────────────────────

function StoryReader({ story, vocabMap, userCards, setUserCards, session, track, languageDetails, onBack, nextStory, onNextStory }) {
  const { isJapanese, accentHex, fontFamily } = languageDetails
  const [showFurigana, setShowFurigana] = useState(isJapanese)
  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    function handleResize() { setWinWidth(window.innerWidth) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isMobile = winWidth < 860

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

  // Assign a stable color index to each unique speaker
  const speakerIndexMap = {}
  let speakerCounter = 0
  lines.forEach(line => {
    const { speaker } = splitSpeakerLine(line)
    if (speaker && speakerIndexMap[speaker] === undefined) {
      speakerIndexMap[speaker] = speakerCounter++
    }
  })

  // Collect unique vocab words that appear in the story
  const storyVocab = []
  const seen = new Set()
  lines.forEach(line => {
    const { text } = splitSpeakerLine(line)
    segmentText(text, vocabMap).forEach(seg => {
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

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 28px 72px', position: 'relative', zIndex: 1 }}>

        {/* Back nav */}
        <div style={{ marginBottom: '26px' }}>
          <IconButton icon={ArrowLeft} label="Back to stories" onClick={onBack} />
        </div>

        {/* Title block */}
        <div style={{ marginBottom: '20px', maxWidth: '700px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>
              {systemLabel} · {levelLabel}
            </span>
            <span style={pillStyle('#71717A', '#F4F4F5', '#E7E5E4')}>Reading</span>
          </div>
          <h1 style={{ margin: 0, color: '#18181B', fontSize: '34px', fontWeight: 800, lineHeight: 1.15, fontFamily }}>
            {story.title}
          </h1>
          {story.english_summary && (
            <p style={{ color: '#71717A', fontSize: '15px', lineHeight: 1.65, margin: '10px 0 0', maxWidth: '600px' }}>
              {story.english_summary}
            </p>
          )}
        </div>

        {/* Character guide */}
        <CharacterGuide content={story.content} accentHex={accentHex} fontFamily={fontFamily} language={track.language} />

        {/* Reader controls */}
        {isJapanese && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <ToggleButton
              active={showFurigana}
              onClick={() => setShowFurigana(v => !v)}
              icon={Type}
              label="Furigana"
              accentHex={accentHex}
            />
          </div>
        )}

        {/* Main two-column layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 296px',
          gap: '20px',
          alignItems: 'start',
        }}>

          {/* Story card */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E8E6E3',
            borderRadius: '22px',
            boxShadow: '0 4px 28px rgba(24,24,27,0.07)',
            overflow: 'hidden',
          }}>
            {lines.map((line, lineIdx) => {
              const { speaker } = splitSpeakerLine(line)
              const speakerIdx = speaker !== null ? speakerIndexMap[speaker] : null
              return (
                <div
                  key={lineIdx}
                  style={{ borderBottom: lineIdx < lines.length - 1 ? '1px solid #F5F4F2' : 'none' }}
                >
                  <StoryLine
                    line={line}
                    vocabMap={vocabMap}
                    userCards={userCards}
                    accentHex={accentHex}
                    fontFamily={fontFamily}
                    isJapanese={isJapanese}
                    showFurigana={showFurigana}
                    speakerIndex={speakerIdx}
                    onAdd={addToDeck}
                  />
                </div>
              )
            })}
          </div>

          {/* Sidebar */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            flexWrap: 'wrap',
            gap: '14px',
            position: isMobile ? 'static' : 'sticky',
            top: '24px',
          }}>
            <div style={{ flex: isMobile ? '1 1 260px' : 'none' }}>
              <StoryProgressCard
                masteredCount={masteredCount}
                totalVocab={storyVocab.length}
                accentHex={accentHex}
              />
            </div>
            <div style={{ flex: isMobile ? '1 1 260px' : 'none' }}>
              <ReviewWordsCard
                wordsToReview={wordsToReview}
                userCards={userCards}
                accentHex={accentHex}
                fontFamily={fontFamily}
              />
            </div>
          </div>
        </div>

        {/* Completion card */}
        <StoryCompletionCard
          totalVocab={storyVocab.length}
          masteredCount={masteredCount}
          accentHex={accentHex}
          onBack={onBack}
          onNext={nextStory ? onNextStory : null}
        />
      </div>
    </div>
  )
}

// ─── LIST / CATEGORY COMPONENTS ────────────────────────────────────────────

function StoryListCard({ story, accentHex, fontFamily, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '22px 24px', borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', width: '100%',
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 28px',
        gap: '16px', alignItems: 'center',
      }}
    >
      <div style={{
        width: '44px', height: '44px', borderRadius: '15px',
        background: accentHex + '10', border: '1px solid ' + accentHex + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BookOpen size={21} strokeWidth={1.8} color={accentHex} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '18px', fontWeight: 750, marginBottom: '5px', fontFamily, color: '#18181B' }}>
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
        padding: '22px 24px', borderRadius: '20px',
        border: '1px solid ' + (hovered ? accentHex + '55' : '#E7E5E4'),
        background: '#FFFFFF', textAlign: 'left', width: '100%',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.58,
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto',
        gap: '16px', alignItems: 'center',
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
            <span style={pillStyle(accentHex, accentHex + '10', accentHex + '25')}>
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
      {isClickable
        ? <ArrowRight size={20} strokeWidth={2} color={accentHex} />
        : <Circle size={10} strokeWidth={2} color="#D4D4D8" />}
    </button>
  )
}

function EmptyPanel({ icon: Icon, title, text }) {
  return (
    <div style={{
      textAlign: 'center', color: '#71717A', padding: '54px 28px', fontSize: '15px',
      background: '#FFFFFF', border: '1px solid #E7E5E4',
      borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="#A1A1AA" />
      <div style={{ color: '#18181B', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>{title}</div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

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
  const { isJapanese, accentHex, nativeName, fontFamily } = languageDetails
  const totalWords = track.language === 'japanese' ? 400 : 300
  const CATEGORIES = isJapanese ? CATEGORIES_JAPANESE : CATEGORIES_CHINESE

  async function loadData() {
    setLoading(true)

    // Load all levels so every word in a story is clickable, not just current level
    const { data: vocabData } = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
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

    // learnedCount uses current level only (drives tier unlock thresholds)
    const currentLevelIds = new Set(
      (vocabData || []).filter(v => v.level === track.current_level).map(v => v.id)
    )
    const learned = (cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length
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

  // ── Reader view ────────────────────────────────────────────────────────
  if (view === 'reader' && selectedStory && selectedCategory) {
    const catStories = stories.filter(s => s.tier === selectedCategory.tier)
    const currentIdx = catStories.findIndex(s => s.id === selectedStory.id)
    const nextStory = currentIdx >= 0 && currentIdx < catStories.length - 1
      ? catStories[currentIdx + 1] : null

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
        nextStory={nextStory}
        onNextStory={() => setSelectedStory(nextStory)}
      />
    )
  }

  // ── Story list view ────────────────────────────────────────────────────
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

          {catStories.length === 0 ? (
            <EmptyPanel icon={BookOpen} title="No stories yet" text="Stories for this tier are coming soon." />
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {catStories.map(story => (
                <StoryListCard
                  key={story.id}
                  story={story}
                  accentHex={accentHex}
                  fontFamily={fontFamily}
                  onClick={() => { setSelectedStory(story); setView('reader') }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Category view ──────────────────────────────────────────────────────
  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        <div style={{ margin: '28px 0 28px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>{nativeName}</span>
            <span style={pillStyle('#71717A', '#F4F4F5', '#E7E5E4')}>
              {getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}
            </span>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#18181B', margin: '0 0 8px' }}>
            Stories
          </h1>
          <p style={{ color: '#71717A', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
            Read stories matched to your vocabulary level.
          </p>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <ProgressCard learnedCount={learnedCount} totalWords={totalWords} accentHex={accentHex} />
        </div>

        {stories.length === 0 ? (
          <EmptyPanel icon={Library} title="No stories yet" text="Stories for this level are coming soon." />
        ) : (
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
        )}
      </div>
    </div>
  )
}
