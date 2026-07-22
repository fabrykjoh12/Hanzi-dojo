import { useState, useMemo, useRef, useEffect } from 'react'
import { supabase } from './supabase'
import { getAudioUrl, playAudioEl } from './utils'
import { languageTheme } from './languageTheme'
import { cleanMeaning } from './cleanMeaning'
import { chatStyleFor, classifyMissionWords } from './chatMissions'
import { X, Volume2, Bookmark, Check, Type, Languages, SplitSquareHorizontal, MessageCircleMore, Trophy } from 'lucide-react'

// Word-to-World Chat Mission runner. Renders a mission (from chatMissions.js) as
// a mobile messaging-app conversation, then a comprehension check, a reply
// challenge, and a result screen. Reuses the app's audio + vocab so tapped words
// behave exactly like the flashcards and story reader.

// The chat runner is a self-contained "messaging app" surface: it stays on its
// own warm-light palette in both app themes (a half-dark chat would read as a
// bug), so it pins colors instead of using the app's light/dark CSS vars.
const PUNCT = new Set('，。！？：；、“”‘’（）《》…—·,.!?:;"\'()[] \t\n'.split(''))

function isPunctChar(ch) {
  if (PUNCT.has(ch)) return true
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')
}

// Tokenize a message into tappable words. CJK (Chinese/Japanese kana) uses
// greedy longest-match against the known-word dictionary; space-delimited scripts
// (Russian) split on whitespace and peel punctuation. Every token exposes `key`
// (the dictionary entry to look up) or null for punctuation/unknowns.
function segment(text, dict, spaced) {
  const tokens = []
  if (spaced) {
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === ' ' || isPunctChar(ch)) { tokens.push({ text: ch, key: null }); i += 1; continue }
      let j = i
      while (j < text.length && text[j] !== ' ' && !isPunctChar(text[j])) j += 1
      const word = text.slice(i, j)
      const key = dict[word] ? word : (dict[word.toLowerCase()] ? word.toLowerCase() : null)
      tokens.push({ text: word, key })
      i = j
    }
    return tokens
  }
  let i = 0
  while (i < text.length) {
    if (isPunctChar(text[i])) { tokens.push({ text: text[i], key: null }); i += 1; continue }
    let matched = null
    const maxLen = Math.min(6, text.length - i)
    for (let len = maxLen; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (dict[cand]) { matched = cand; break }
    }
    if (matched) { tokens.push({ text: matched, key: matched }); i += matched.length }
    else { tokens.push({ text: text[i], key: null }); i += 1 }
  }
  return tokens
}

// Deterministic shuffle (no Math.random — keeps renders stable) seeded by length.
function shuffleStable(arr, seed) {
  const a = arr.slice()
  let s = seed || a.length
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ChatMission({ mission, vocab, session, track, dayBuckets, onClose }) {
  const theme = languageTheme(track.language)
  const accent = theme.accentHex
  const font = theme.font
  const skin = chatStyleFor(track.language)

  // Which vocab the learner already has a card for (to fill the bookmark and
  // skip duplicate inserts). Fetched once; updated locally as words are added.
  const [known, setKnown] = useState({})
  useEffect(() => {
    let active = true
    supabase.from('cards').select('vocab_id').eq('user_id', session.user.id)
      .then(({ data }) => { if (active) { const m = {}; (data || []).forEach(c => { m[c.vocab_id] = true }); setKnown(m) } })
    return () => { active = false }
  }, [session])

  const [showPinyin, setShowPinyin] = useState(true)
  const [showEnglish, setShowEnglish] = useState(false)
  const [showSegment, setShowSegment] = useState(true)
  const [selected, setSelected] = useState(null)     // tapped word lookup
  const [phase, setPhase] = useState('chat')          // chat | questions | reply | result
  const [answers, setAnswers] = useState({})          // qIndex -> chosen option
  const [replyChoice, setReplyChoice] = useState(null)
  const [replyCorrect, setReplyCorrect] = useState(null)   // set by MCQ or tiles
  const [tilePicked, setTilePicked] = useState([])         // chosen tile pool-indices, in order
  const [tileChecked, setTileChecked] = useState(false)
  const awardedRef = useRef(false)
  const audioElRef = useRef(null)
  const tappedForHelp = useRef(new Set())             // words the learner needed help on
  const closeBtnRef = useRef(null)

  // Dialog a11y: move focus into the overlay when it opens (so keyboard/screen-
  // reader users land inside it), and let Escape close it — keyboard parity with
  // the Close (X) button. No focus trap here; that's tracked separately.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => { try { closeBtnRef.current && closeBtnRef.current.focus() } catch { /* noop */ } }, 0)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [onClose])

  useEffect(() => () => { try { window.speechSynthesis.cancel() } catch { /* noop */ } }, [])

  const isJapanese = track.language === 'japanese'
  const spaced = track.language === 'russian'

  // word -> { reading, meaning, audio_path?, vocabId? }. Real vocab wins over the
  // mission glossary so tapped words carry audio + can be added to the deck. For
  // Japanese the reading is indexed too (kana text vs kanji vocab); for spaced
  // languages a lowercase alias lets sentence-start words resolve.
  const dict = useMemo(() => {
    const d = {}
    const put = (k, info) => { if (!k) return; d[k] = info; if (spaced) d[k.toLowerCase()] = info }
    Object.entries(mission.glossary || {}).forEach(([w, info]) => put(w, { ...info }))
    ;(vocab || []).forEach(v => {
      const info = { reading: v.reading, meaning: v.meaning, audio_path: v.audio_path, vocabId: v.id }
      put(v.word, info)
      if (isJapanese && v.reading) put(v.reading, info)
    })
    return d
  }, [mission, vocab, isJapanese, spaced])

  const buckets = useMemo(() => classifyMissionWords(mission, dayBuckets || {}), [mission, dayBuckets])
  const learnedSet = useMemo(() => new Set(buckets.learned), [buckets])
  const weakSet = useMemo(() => new Set(buckets.weak), [buckets])

  const speakSentence = (text) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = track.language === 'japanese' ? 'ja-JP' : track.language === 'russian' ? 'ru-RU' : 'zh-CN'
      u.rate = 0.9
      synth.speak(u)
    } catch { /* speech not available */ }
  }

  const playWordAudio = (info, word) => {
    if (info && info.audio_path) {
      if (!audioElRef.current) audioElRef.current = new Audio()
      playAudioEl(audioElRef.current, getAudioUrl(info.audio_path), () => speakSentence(word))
    } else {
      speakSentence(word)
    }
  }

  const selectWord = (word) => {
    const info = dict[word]
    if (!info) return
    tappedForHelp.current.add(word)
    setSelected({ word, info })
  }

  // Mark all target words as needing review (called when a reply is missed).
  const markTargetsWeak = () => { mission.targetWords.forEach(w => tappedForHelp.current.add(w)) }

  const addToDeck = async (word, info) => {
    if (!info || !info.vocabId || known[info.vocabId]) return
    const { error } = await supabase.from('cards').insert({
      user_id: session.user.id, vocab_id: info.vocabId,
      state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
    })
    if (!error) setKnown(prev => ({ ...prev, [info.vocabId]: true }))
  }

  // Comprehension scoring.
  const questions = mission.comprehensionQuestions || []
  const answeredAll = questions.length === 0 || questions.every((_, i) => answers[i] !== undefined)
  const correctCount = questions.filter((q, i) => answers[i] === q.answer).length

  // Weak words handed to SRS: target words the learner tapped for help on (or all
  // target words if the reply was missed). Computed at finish (ref read in a
  // handler, not during render) and snapshotted into state for the result screen.
  const [weakOut, setWeakOut] = useState([])

  const finishMission = async () => {
    if (awardedRef.current) return
    awardedRef.current = true
    const wo = mission.targetWords.filter(w => tappedForHelp.current.has(w))
    setWeakOut(wo)
    // Seed weak/looked-up words into SRS as new cards (only real vocab).
    const toAdd = []
    wo.forEach(w => {
      const info = dict[w]
      if (info && info.vocabId && !known[info.vocabId]) toAdd.push(info.vocabId)
    })
    if (toAdd.length > 0) {
      const rows = toAdd.map(id => ({
        user_id: session.user.id, vocab_id: id,
        state: 'new', ease_factor: 2.5, learning_step: 0, due_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('cards').insert(rows)
      if (!error) setKnown(prev => { const nx = { ...prev }; toAdd.forEach(id => { nx[id] = true }); return nx })
    }
    setPhase('result')
  }

  // ── Word token rendering (tap for lookup, subtle learned/weak highlight) ────
  function Sentence({ text }) {
    const tokens = segment(text, dict, spaced)
    return (
      <span style={{ fontFamily: font, lineHeight: 1.7 }}>
        {tokens.map((tk, i) => {
          if (!tk.key) return <span key={i}>{tk.text}</span>
          const learned = learnedSet.has(tk.key)
          const weak = weakSet.has(tk.key)
          const isSel = selected && selected.word === tk.key
          return (
            <span
              key={i}
              onClick={() => selectWord(tk.key)}
              style={{
                cursor: 'pointer',
                margin: showSegment ? '0 1.5px' : 0,
                padding: '0 1px', borderRadius: '4px',
                background: isSel ? accent + '33' : (learned ? accent + '14' : 'transparent'),
                borderBottom: weak ? '2px solid ' + accent + '99' : 'none',
              }}
            >
              {tk.text}
            </span>
          )
        })}
      </span>
    )
  }

  const bg = '#F7F5F1'
  // top/left/right pin it; height comes from `.app-overlay-viewport` (100dvh)
  // so the column is exactly the VISIBLE viewport tall — the bottom action bar
  // and last messages stay reachable above the mobile browser toolbar. Using
  // `inset: 0` (100vh) instead pushes them behind it, which reads as "can't
  // scroll down in the conversation".
  const shell = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60, background: bg,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
      background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.09)', flexShrink: 0,
    }}>
      <button ref={closeBtnRef} onClick={onClose} aria-label="Close" style={ghost}>
        <X size={20} strokeWidth={2} color="#6B6660" />
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {mission.scenario.title}
        </div>
        <div style={{ fontSize: '12px', color: '#6B6660' }}>~{mission.estimatedTime} min · {mission.targetWords.length} words</div>
      </div>
      <MessageCircleMore size={20} strokeWidth={2} color={accent} />
    </div>
  )

  // Toggle chips shared across the chat phase.
  const toggles = (
    <div style={{ display: 'flex', gap: '8px', padding: '10px 16px', flexWrap: 'wrap', background: bg }}>
      <Chip on={showPinyin} onClick={() => setShowPinyin(v => !v)} icon={Type} label={isJapanese ? 'Romaji' : track.language === 'chinese' ? 'Pinyin' : 'Reading'} accent={accent} />
      <Chip on={showEnglish} onClick={() => setShowEnglish(v => !v)} icon={Languages} label="English" accent={accent} />
      <Chip on={showSegment} onClick={() => setShowSegment(v => !v)} icon={SplitSquareHorizontal} label="Spacing" accent={accent} />
    </div>
  )

  return (
    <div style={shell} className="app-overlay-viewport" role="dialog" aria-modal="true" aria-label={mission.scenario.title}>
      {header}

      {phase === 'chat' && (
        <>
          {toggles}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 20px' }}>
            <div style={{ maxWidth: '620px', margin: '0 auto' }}>
              {mission.messages.map((m, i) => {
                const mine = m.from === 'me'
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: '14px' }}>
                    {!mine && <div style={{ fontSize: '11.5px', color: '#6B6660', fontWeight: 700, margin: '0 0 4px 8px', fontFamily: font }}>{m.name}</div>}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', maxWidth: '86%', flexDirection: mine ? 'row-reverse' : 'row' }}>
                      <div style={{
                        background: mine ? skin.myBubble : skin.theirBubble,
                        color: mine ? skin.myText : '#1A1A1A',
                        border: mine ? 'none' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '18px', padding: '10px 13px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        borderBottomRightRadius: mine ? '6px' : '18px',
                        borderBottomLeftRadius: mine ? '18px' : '6px',
                      }}>
                        {showPinyin && (
                          <div style={{ fontSize: '11.5px', opacity: 0.72, marginBottom: '3px', lineHeight: 1.35 }}>{mission.pinyin[i]}</div>
                        )}
                        <div style={{ fontSize: '19px' }}><Sentence text={m.text} /></div>
                        {showEnglish && (
                          <div style={{ fontSize: '12.5px', opacity: 0.7, marginTop: '4px', fontStyle: 'italic', lineHeight: 1.4 }}>{mission.translations[i]}</div>
                        )}
                      </div>
                      <button onClick={() => speakSentence(m.text)} aria-label="Play" style={{ ...ghost, padding: '5px' }}>
                        <Volume2 size={16} strokeWidth={2} color="#A6A29B" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <BottomBar>
            <button onClick={() => setPhase(questions.length ? 'questions' : 'reply')} style={primary(accent)}>
              {questions.length ? 'Check understanding' : 'Your turn to reply'}
            </button>
          </BottomBar>
        </>
      )}

      {phase === 'questions' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 16px 120px' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <SectionTitle>Understanding</SectionTitle>
            {questions.map((q, qi) => {
              const chosen = answers[qi]
              const answered = chosen !== undefined
              return (
                <div key={qi} style={{ marginBottom: '22px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', marginBottom: '10px', fontFamily: font }}>{qi + 1}. {q.question}</div>
                  <div style={{ display: 'grid', gap: '9px' }}>
                    {q.options.map((opt, oi) => {
                      let bc = 'rgba(0,0,0,0.09)', bgc = '#FFFFFF'
                      if (answered && oi === q.answer) { bc = '#2F9E6D'; bgc = '#E7F6EE' }
                      else if (answered && oi === chosen) { bc = '#DC2626'; bgc = '#FBEAEA' }
                      return (
                        <button key={oi} disabled={answered}
                          onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                            textAlign: 'left', padding: '13px 15px', borderRadius: '13px',
                            border: '1.5px solid ' + bc, background: bgc, color: '#1A1A1A',
                            cursor: answered ? 'default' : 'pointer', fontSize: '17px', fontFamily: font,
                          }}>
                          <span>{opt}</span>
                          {answered && oi === q.answer && <Check size={18} strokeWidth={2.4} color="#2F9E6D" />}
                          {answered && oi === chosen && oi !== q.answer && <X size={18} strokeWidth={2.4} color="#DC2626" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {answeredAll && (
            <BottomBar>
              <button onClick={() => setPhase('reply')} style={primary(accent)}>Your turn to reply</button>
            </BottomBar>
          )}
        </div>
      )}

      {phase === 'reply' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 16px 120px' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <SectionTitle>Your reply</SectionTitle>
            <div style={{ fontSize: '15px', color: '#1A1A1A', marginBottom: '16px', fontFamily: font, lineHeight: 1.6 }}>
              {mission.replyChallenge.prompt}
            </div>

            {mission.replyChallenge.tiles ? (
              (() => {
                const t = mission.replyChallenge.tiles
                const pool = shuffleStable([...t.answer, ...(t.distractors || [])].map((w, i) => ({ w, id: i })), t.answer.length + (t.distractors || []).length)
                const built = tilePicked.map(id => pool.find(p => p.id === id))
                const sep = spaced ? ' ' : ''
                const builtStr = built.map(p => p.w).join(sep)
                const answerStr = t.answer.join(sep)
                const correct = builtStr === answerStr
                return (
                  <>
                    {/* Built sentence tray */}
                    <div style={{ minHeight: '52px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: '13px', border: '1.5px dashed rgba(0,0,0,0.09)', background: '#FFFFFF', marginBottom: '14px' }}>
                      {built.length === 0 && <span style={{ color: '#A6A29B', fontSize: '13px' }}>Tap the words to build your reply…</span>}
                      {built.map((p, k) => (
                        <button key={k} disabled={tileChecked} onClick={() => setTilePicked(prev => prev.filter((_, idx) => idx !== k))}
                          style={tileStyle(tileChecked ? (correct ? '#2F9E6D' : '#DC2626') : accent, font)}>{p.w}</button>
                      ))}
                    </div>
                    {/* Available tiles */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      {pool.filter(p => !tilePicked.includes(p.id)).map(p => (
                        <button key={p.id} disabled={tileChecked} onClick={() => setTilePicked(prev => [...prev, p.id])}
                          style={tileStyle('#6B6660', font)}>{p.w}</button>
                      ))}
                    </div>
                    {tileChecked && (
                      <div style={{ fontSize: '14px', fontWeight: 700, color: correct ? '#2F9E6D' : '#DC2626', marginTop: '6px' }}>
                        {correct ? '✓ Nice — that works!' : '✗ Not quite. A natural reply is: ' + answerStr}
                      </div>
                    )}
                    <BottomBar>
                      {!tileChecked ? (
                        <button disabled={built.length === 0}
                          onClick={() => { setTileChecked(true); const ok = correct; setReplyCorrect(ok); if (!ok) markTargetsWeak() }}
                          style={{ ...primary(accent), opacity: built.length === 0 ? 0.5 : 1 }}>Check reply</button>
                      ) : (
                        <button onClick={finishMission} style={primary(accent)}>See result</button>
                      )}
                    </BottomBar>
                  </>
                )
              })()
            ) : (
              <>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {mission.replyChallenge.options.map((opt, oi) => {
                    const chosen = replyChoice === oi
                    const answered = replyChoice !== null
                    let bc = 'rgba(0,0,0,0.09)', bgc = '#FFFFFF'
                    if (answered && opt.correct) { bc = '#2F9E6D'; bgc = '#E7F6EE' }
                    else if (answered && chosen) { bc = '#DC2626'; bgc = '#FBEAEA' }
                    return (
                      <button key={oi} disabled={answered}
                        onClick={() => { setReplyChoice(oi); setReplyCorrect(opt.correct); if (!opt.correct) markTargetsWeak() }}
                        style={{
                          textAlign: 'left', padding: '14px 16px', borderRadius: '14px',
                          border: '1.5px solid ' + bc, background: bgc, color: '#1A1A1A',
                          cursor: answered ? 'default' : 'pointer', fontFamily: font,
                        }}>
                        <div style={{ fontSize: '18px' }}>{opt.text}</div>
                        {showPinyin && opt.pinyin && <div style={{ fontSize: '12px', color: '#6B6660', marginTop: '3px' }}>{opt.pinyin}</div>}
                      </button>
                    )
                  })}
                </div>
                {replyChoice !== null && (
                  <BottomBar>
                    <button onClick={finishMission} style={primary(accent)}>See result</button>
                  </BottomBar>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 16px 40px' }}>
          <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent + '12', border: '1px solid ' + accent + '22' }}>
              <Trophy size={28} strokeWidth={1.9} color={accent} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 6px' }}>Mission complete</h2>
            <p style={{ color: '#6B6660', fontSize: '14px', margin: '0 0 22px' }}>You used today’s words in a real conversation.</p>

            <ResultRow label="Comprehension" value={`${correctCount}/${questions.length}`} accent={accent} />
            <ResultRow label="Reply" value={replyCorrect ? 'Correct' : 'Keep practicing'} accent={accent} />

            <ResultBlock title="Words you used">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {mission.targetWords.map(w => (
                  <span key={w} style={pill(weakSet.has(w) ? '#DC2626' : accent, font)}>{w}</span>
                ))}
              </div>
            </ResultBlock>

            {weakOut.length > 0 && (
              <ResultBlock title="Saved for review">
                <div style={{ fontSize: '12.5px', color: '#6B6660', marginBottom: '8px' }}>Words you looked up are added to your deck so they come back in flashcards.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {weakOut.map(w => <span key={w} style={pill('#DC2626', font)}>{w}</span>)}
                </div>
              </ResultBlock>
            )}

            <ResultBlock title="Sentences to reuse">
              {mission.messages.filter(m => m.from === 'me').map((m, i) => (
                <div key={i} style={{ fontSize: '16px', color: '#1A1A1A', fontFamily: font, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.09)' }}>{m.text}</div>
              ))}
            </ResultBlock>

            <button onClick={onClose} style={{ ...primary(accent), width: '100%', marginTop: '22px' }}>Done</button>
          </div>
        </div>
      )}

      {/* Word lookup sheet */}
      {selected && (
        <div onClick={() => setSelected(null)} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.12)' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: '560px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)',
            borderRadius: '20px 20px 0 0', boxShadow: '0 -10px 40px rgba(24,24,27,0.16)', padding: '16px 18px 26px',
          }}>
            <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: '#D4D4D8', margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: accent, fontFamily: font }}>{selected.word}</span>
                <span style={{ fontSize: '16px', color: '#B45309', fontWeight: 600 }}>{selected.info.reading}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => playWordAudio(selected.info, selected.word)} aria-label="Play audio" style={ghost}>
                  <Volume2 size={20} strokeWidth={2} color="#6B6660" />
                </button>
                {selected.info.vocabId && (
                  <button onClick={() => addToDeck(selected.word, selected.info)} aria-label="Add to deck" style={ghost}>
                    <Bookmark size={20} strokeWidth={2} color={known[selected.info.vocabId] ? accent : '#6B6660'} fill={known[selected.info.vocabId] ? accent : 'none'} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: '15px', color: '#6B6660', marginTop: '8px', lineHeight: 1.5 }}>{cleanMeaning(selected.info.meaning)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, icon: Icon, label, accent }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '7px 12px', borderRadius: '999px', cursor: 'pointer',
      border: '1px solid ' + (on ? accent + '66' : 'rgba(0,0,0,0.09)'),
      background: on ? accent + '14' : '#FFFFFF', color: on ? accent : '#6B6660',
      fontSize: '12.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
    }}>
      <Icon size={14} strokeWidth={2} /> {label}
    </button>
  )
}

function BottomBar({ children }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0, flexShrink: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
      background: 'linear-gradient(180deg, rgba(247,245,241,0) 0%, #F7F5F1 45%)',
    }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>{children}</div>
    </div>
  )
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: '13px', fontWeight: 850, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#6B6660', marginBottom: '16px' }}>{children}</div>
}

function ResultRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '14px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', marginBottom: '10px' }}>
      <span style={{ fontSize: '14px', color: '#6B6660', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '16px', color: accent, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function ResultBlock({ title, children }) {
  return (
    <div style={{ textAlign: 'left', marginTop: '18px', padding: '16px 18px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', marginBottom: '10px' }}>{title}</div>
      {children}
    </div>
  )
}

function pill(color, font) {
  return {
    display: 'inline-flex', padding: '5px 11px', borderRadius: '999px',
    background: color + '14', border: '1px solid ' + color + '33', color,
    fontSize: '15px', fontWeight: 600, fontFamily: font,
  }
}

function primary(accent) {
  return {
    width: '100%', minHeight: '50px', borderRadius: '15px', border: 'none',
    background: accent, color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: 800,
    fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  }
}

function tileStyle(color, font) {
  return {
    padding: '9px 14px', borderRadius: '11px', cursor: 'pointer',
    border: '1.5px solid ' + color + '55', background: color + '12', color: '#1A1A1A',
    fontSize: '18px', fontFamily: font, fontWeight: 600,
  }
}

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }
