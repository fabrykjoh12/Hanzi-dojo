import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { languageTheme } from './languageTheme'
import { grammarFor } from './grammarGuides'
import { awardXp } from './xpService'
import { useIsMobile } from './useIsMobile'
import { shuffle } from './utils'
import { tokenize, makeSegmenter, isContent, scrambleIndices } from './segment'
import { ArrowLeft, BookMarked, BookOpen, Check, ChevronRight, GraduationCap, Sparkles, X, Volume2 } from 'lucide-react'

// Speak an example aloud with the browser's TTS — grammar examples are
// arbitrary sentences with no recorded audio, so this is the practical way to
// let learners hear them (same approach as the story reader / chat missions).
function speakText(text, language) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = language === 'japanese' ? 'ja-JP' : language === 'russian' ? 'ru-RU' : 'zh-CN'
    u.rate = 0.9
    synth.speak(u)
  } catch { /* speech not available */ }
}

// Beginner grammar guide for the active language. Each topic is a mini-lesson:
// a pattern chip (the formula), plain-language points with examples, real lines
// from the learner's own stories that use the pattern, and a two-question
// self-check that pays a small XP reward once per visit.

const CHECK_XP = 6

function exampleHasKanji(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9FFF) return true
  }
  return false
}

// Collect up to `max` story lines that contain any of the topic's `find`
// substrings, so the guide can point at the pattern in stories the learner
// actually reads.
function findStoryLines(stories, finds, max) {
  const out = []
  const seen = new Set()
  for (const story of stories) {
    const lines = (story.content || '').split('\n').filter(Boolean)
    for (const line of lines) {
      if (out.length >= max) return out
      if (seen.has(line)) continue
      for (const f of finds) {
        if (line.includes(f)) {
          seen.add(line)
          out.push({ line, title: story.title })
          break
        }
      }
    }
  }
  return out
}

export default function Grammar({ session, profile, track, onBack, onUpdate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const font = theme.font
  const guide = grammarFor(profile.active_language)
  const [open, setOpen] = useState(0)   // index of the expanded topic (-1 = none)
  const [stories, setStories] = useState([])
  // Self-check state, keyed by topic id: { [qIndex]: chosenOptionIndex }.
  // `rewarded` remembers which topics already paid XP this visit.
  const [answers, setAnswers] = useState({})
  const [rewarded, setRewarded] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('stories')
        .select('title, content')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_published', true)
        .order('tier', { ascending: true })
        .order('story_number', { ascending: true })
      if (!cancelled) setStories(data || [])
    }
    load()
    return () => { cancelled = true }
  }, [track.language, track.system, track.current_level])

  const pageShell = { minHeight: '100vh', position: 'relative', overflow: 'hidden' }

  if (!guide) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <Ghost onClick={onBack} />
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
            A grammar guide for this language is coming soon.
          </div>
        </div>
      </div>
    )
  }

  function pickAnswer(topic, qIndex, optIndex) {
    const prev = answers[topic.id] || {}
    // Locked once correct — re-clicking a solved question shouldn't unsolve it.
    if (prev[qIndex] === topic.check[qIndex].correct) return
    const next = { ...prev, [qIndex]: optIndex }
    setAnswers({ ...answers, [topic.id]: next })
    const allCorrect = topic.check.every((c, i) => next[i] === c.correct)
    if (allCorrect && !rewarded[topic.id]) {
      setRewarded({ ...rewarded, [topic.id]: true })
      awardXp(session, profile, CHECK_XP, onUpdate)
    }
  }

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <Ghost onClick={onBack} />

        <div style={{ margin: '24px 0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800 }}>
            <GraduationCap size={17} strokeWidth={1.85} color={accentHex} /> Grammar guide
          </div>
          <h1 style={{ margin: '8px 0 10px', fontSize: isMobile ? '30px' : '36px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
            How {guide.languageName} works
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            {guide.intro}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          {guide.topics.map((topic, i) => {
            const expanded = open === i
            const done = !!rewarded[topic.id]
            return (
              <div key={topic.id} style={{
                background: 'var(--surface)', border: '1px solid ' + (expanded ? accentHex + '44' : 'var(--border)'),
                borderRadius: '18px', overflow: 'hidden',
                boxShadow: expanded ? '0 12px 30px rgba(24,24,27,0.07)' : '0 2px 10px rgba(24,24,27,0.04)',
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
              }}>
                <button
                  onClick={() => setOpen(expanded ? -1 : i)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none',
                    padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                    background: done ? 'var(--success-bg)' : accentHex + '12',
                    border: '1px solid ' + (done ? 'var(--success-border)' : accentHex + '22'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done
                      ? <Check size={19} strokeWidth={2.2} color="var(--success)" />
                      : <BookMarked size={19} strokeWidth={1.9} color={accentHex} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text)' }}>{topic.title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>{topic.blurb}</div>
                  </div>
                  <ChevronRight
                    size={20} strokeWidth={2} color="var(--text-faint)"
                    style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }}
                  />
                </button>

                {expanded && (
                  <div style={{ padding: '2px 20px 20px', display: 'grid', gap: '14px' }}>
                    {topic.pattern && (
                      <div style={{ paddingLeft: isMobile ? 0 : '54px' }}>
                        <span style={{
                          display: 'inline-block', padding: '6px 12px', borderRadius: '10px',
                          background: accentHex + '12', border: '1px solid ' + accentHex + '2e',
                          fontSize: '13.5px', fontWeight: 700, color: accentHex, fontFamily: font, letterSpacing: '0.01em',
                        }}>{topic.pattern}</span>
                      </div>
                    )}

                    {topic.points.map((p, pi) => (
                      <div key={pi} style={{ paddingLeft: isMobile ? 0 : '54px' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>{p.text}</div>
                        {p.ex && (
                          <Example ex={p.ex} language={profile.active_language} font={font} accentHex={accentHex} />
                        )}
                      </div>
                    ))}

                    <StoryLines topic={topic} stories={stories} font={font} accentHex={accentHex} isMobile={isMobile} />

                    <TryIt topic={topic} language={profile.active_language} font={font} accentHex={accentHex} />

                    <SelfCheck
                      topic={topic}
                      picked={answers[topic.id] || {}}
                      done={done}
                      onPick={(qi, oi) => pickAnswer(topic, qi, oi)}
                      font={font}
                      accentHex={accentHex}
                      isMobile={isMobile}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// One example sentence card. Japanese examples with `segs` render per-kanji
// ruby (furigana over kanji segments only); Japanese without segs falls back
// to a reading line above (kanji present) or nothing (kana-only). Chinese and
// Russian keep the reading below the sentence.
function Example({ ex, language, font, accentHex }) {
  const isJa = language === 'japanese'
  const hasSegs = isJa && Array.isArray(ex.segs) && ex.segs.length > 0
  const kanji = exampleHasKanji(ex.target)
  const readingAbove = isJa && !hasSegs && kanji && ex.reading
  const readingBelow = !isJa && ex.reading
  return (
    <div style={{
      marginTop: '10px', padding: '12px 14px', borderRadius: '12px',
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      {readingAbove && (
        <div style={{ fontSize: '12px', color: accentHex, marginBottom: '2px', fontWeight: 600 }}>{ex.reading}</div>
      )}
      {hasSegs ? (
        <div style={{ fontSize: '20px', fontFamily: font, color: 'var(--text)', lineHeight: 1.9 }}>
          {ex.segs.map((seg, si) => seg[1] ? (
            <ruby key={si}>
              {seg[0]}
              <rt style={{ fontSize: '10px', color: accentHex, fontWeight: 600 }}>{seg[1]}</rt>
            </ruby>
          ) : (
            <span key={si}>{seg[0]}</span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '20px', fontFamily: font, color: 'var(--text)', lineHeight: 1.3 }}>{ex.target}</div>
      )}
      {readingBelow && (
        <div style={{ fontSize: '13px', color: accentHex, marginTop: '4px', fontWeight: 600 }}>{ex.reading}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '6px' }}>
        <button
          onClick={() => speakText(ex.target, language)}
          aria-label="Play example"
          style={{
            flexShrink: 0, width: '28px', height: '28px', borderRadius: '9px', cursor: 'pointer',
            border: '1px solid ' + accentHex + '2A', background: accentHex + '10',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Volume2 size={14} strokeWidth={2} color={accentHex} />
        </button>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{ex.en}</div>
      </div>
    </div>
  )
}

function langLocale(language) {
  return language === 'japanese' ? 'ja' : language === 'russian' ? 'ru' : 'zh'
}

// Pick a topic example that makes a good reorder puzzle (3–8 word tiles).
// Japanese uses the hand-authored `segs` for clean word tiles; other languages
// segment the target sentence.
function buildPuzzle(topic, language, seg) {
  for (const p of (topic.points || [])) {
    const ex = p.ex
    if (!ex || !ex.target) continue
    let tokens
    if (language === 'japanese' && Array.isArray(ex.segs) && ex.segs.length) {
      tokens = ex.segs.filter(s => isContent(s[0])).map(s => s[0])
    } else {
      tokens = tokenize(ex.target, seg)
    }
    if (tokens.length >= 3 && tokens.length <= 8) return { tokens, en: ex.en }
  }
  return null
}

function tryBtn(accent) {
  return {
    height: '38px', padding: '0 18px', borderRadius: '11px', border: 'none',
    background: accent, color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
  }
}
const tryGhostBtn = {
  height: '38px', padding: '0 14px', borderRadius: '11px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
}

// "Try it": rebuild the topic's example from scrambled word tiles — active
// practice of the pattern's word order, from an example already on the page.
function TryIt({ topic, language, font, accentHex }) {
  const seg = useMemo(() => makeSegmenter(langLocale(language)), [language])
  const puzzle = useMemo(() => buildPuzzle(topic, language, seg), [topic, language, seg])
  // Each topic is a stable, keyed instance, so the scramble is initialized once.
  const [order, setOrder] = useState(() => (puzzle ? scrambleIndices(puzzle.tokens.length, shuffle) : []))
  const [placed, setPlaced] = useState([])
  const [result, setResult] = useState(null)   // null | 'correct' | 'wrong'

  if (!puzzle) return null
  const tokens = puzzle.tokens
  const bankIds = order.filter(id => placed.indexOf(id) === -1)
  const solved = result === 'correct'

  const check = () => {
    const ok = placed.length === tokens.length && placed.map(id => tokens[id]).join('') === tokens.join('')
    setResult(ok ? 'correct' : 'wrong')
  }
  const reset = () => { setOrder(scrambleIndices(tokens.length, shuffle)); setPlaced([]); setResult(null) }

  const tile = (id, inBank) => (
    <button key={id} disabled={solved}
      onClick={() => { if (solved) return; setResult(null); setPlaced(inBank ? [...placed, id] : placed.filter(x => x !== id)) }}
      style={{
        padding: '8px 13px', borderRadius: '11px', cursor: solved ? 'default' : 'pointer',
        border: '1.5px solid ' + accentHex + (inBank ? '55' : '99'),
        background: accentHex + (inBank ? '10' : '1E'), color: 'var(--text)',
        fontFamily: font, fontSize: '17px', fontWeight: 600,
      }}>{tokens[id]}</button>
  )

  return (
    <div style={{ marginTop: '14px', padding: '14px 16px', borderRadius: '14px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '12px', fontWeight: 850, letterSpacing: '0.4px', textTransform: 'uppercase', color: accentHex, marginBottom: '4px' }}>Try it</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px', fontStyle: 'italic' }}>Build: “{puzzle.en}”</div>
      <div style={{ minHeight: '46px', display: 'flex', flexWrap: 'wrap', gap: '7px', alignItems: 'center', padding: '9px 11px', borderRadius: '12px', border: '1.5px dashed ' + (result === 'correct' ? '#2F9E6D' : result === 'wrong' ? '#DC2626' : 'var(--border)'), background: 'var(--surface)', marginBottom: '10px' }}>
        {placed.length === 0 && <span style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Tap the words in order…</span>}
        {placed.map(id => tile(id, false))}
      </div>
      {bankIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '10px' }}>
          {bankIds.map(id => tile(id, true))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {!solved && (
          <button onClick={check} disabled={placed.length === 0} style={{ ...tryBtn(accentHex), opacity: placed.length === 0 ? 0.5 : 1 }}>Check</button>
        )}
        {result && <button onClick={reset} style={tryGhostBtn}>Shuffle</button>}
        {result === 'correct' && <span style={{ fontSize: '13px', fontWeight: 750, color: '#2F9E6D' }}>Nice — that’s the order!</span>}
        {result === 'wrong' && <span style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Not yet — try again.</span>}
      </div>
    </div>
  )
}

// Real lines from the learner's current-level stories that use this topic's
// pattern — proof the grammar isn't abstract, it's already in their reading.
function StoryLines({ topic, stories, font, accentHex, isMobile }) {
  if (!topic.find || stories.length === 0) return null
  const matches = findStoryLines(stories, topic.find, 3)
  if (matches.length === 0) return null
  return (
    <div style={{ paddingLeft: isMobile ? 0 : '54px' }}>
      <div style={{
        borderRadius: '12px', border: '1px solid ' + accentHex + '26',
        background: accentHex + '08', padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 800, color: accentHex, marginBottom: '8px' }}>
          <BookOpen size={14} strokeWidth={2} color={accentHex} /> In your stories
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {matches.map((m, mi) => (
            <div key={mi}>
              <div style={{ fontSize: '16px', fontFamily: font, color: 'var(--text)', lineHeight: 1.5 }}>{m.line}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '1px' }}>from “{m.title}”</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Two-question self-check. Options give instant right/wrong feedback; solving
// both pays a one-time XP reward (per visit) so reading the guide counts.
function SelfCheck({ topic, picked, done, onPick, font, accentHex, isMobile }) {
  if (!topic.check || topic.check.length === 0) return null
  return (
    <div style={{ paddingLeft: isMobile ? 0 : '54px' }}>
      <div style={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-2)', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 800, color: done ? 'var(--success)' : 'var(--text-muted)', marginBottom: '10px' }}>
          <Sparkles size={14} strokeWidth={2} color={done ? 'var(--success)' : accentHex} />
          {done ? 'Check yourself — passed, +' + CHECK_XP + ' XP' : 'Check yourself'}
        </div>
        <div style={{ display: 'grid', gap: '14px' }}>
          {topic.check.map((c, qi) => {
            const chosen = picked[qi]
            const solved = chosen === c.correct
            return (
              <div key={qi}>
                <div style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)', marginBottom: '8px', lineHeight: 1.5 }}>{c.q}</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '7px' }}>
                  {c.options.map((opt, oi) => {
                    const isChosen = chosen === oi
                    const isRight = isChosen && oi === c.correct
                    const isWrong = isChosen && oi !== c.correct
                    return (
                      <button
                        key={oi}
                        onClick={() => onPick(qi, oi)}
                        style={{
                          textAlign: 'left', cursor: solved ? 'default' : 'pointer',
                          padding: '9px 12px', borderRadius: '10px',
                          border: '1px solid ' + (isRight ? 'var(--success-border)' : isWrong ? 'var(--danger-border)' : 'var(--border)'),
                          background: isRight ? 'var(--success-bg)' : isWrong ? 'var(--danger-bg)' : 'var(--surface)',
                          color: isRight ? 'var(--success)' : isWrong ? 'var(--danger)' : 'var(--text)',
                          fontSize: '13.5px', fontWeight: 600, fontFamily: font,
                          display: 'flex', alignItems: 'center', gap: '8px',
                          transition: 'background 120ms ease, border-color 120ms ease',
                        }}
                      >
                        {isRight && <Check size={15} strokeWidth={2.4} color="var(--success)" style={{ flexShrink: 0 }} />}
                        {isWrong && <X size={15} strokeWidth={2.4} color="var(--danger)" style={{ flexShrink: 0 }} />}
                        <span>{opt}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Ghost({ onClick }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 14px', borderRadius: '12px',
      border: '1px solid var(--border)', background: h ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    }}>
      <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Home
    </button>
  )
}
