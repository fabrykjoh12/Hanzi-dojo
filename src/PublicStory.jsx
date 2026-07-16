import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { buildVocabMap, assumedKnownCards, teaserLines, LEVEL_CHOICES } from './publicStoryHelpers'
import { calculateStoryReadability, buildVocabMatcher, matchVocabAt, matchName, wordStatus, splitSpeaker, boundaryAfterSkip, JP_PARTICLES } from './storyReading'
import { getAudioUrl, getLevelLabel } from './utils'
import { languageTheme } from './languageTheme'
import { BRAND_NAME } from './brand'
import { track, EVENTS } from './analytics'
import { CHARACTER_READINGS } from './characterNames'

const NO_PARTICLES = new Set()

// A signed-out visitor's first taste of a real story: how much can you read?
export default function PublicStory({ storyId }) {
  const navigate = useNavigate()
  const [story, setStory] = useState(null)       // RPC payload, or null
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'missing'
  const [choice, setChoice] = useState(null)       // 'beginner' | 'some' | 'lots'

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase.rpc('public_story', { p_story_id: storyId })
        if (!alive) return
        if (data && data.id) {
          setStory(data)
          setStatus('ready')
          track(EVENTS.PUBLIC_STORY_VIEWED, { language: data.language, level: data.level })
        } else {
          setStatus('missing')
        }
      } catch {
        if (alive) setStatus('missing')
      }
    })()
    return () => { alive = false }
  }, [storyId])

  const theme = languageTheme(story ? story.language : 'chinese')
  const accent = theme.accentHex
  const vocabMap = useMemo(() => buildVocabMap(story ? story.vocab_pool : []), [story])

  // Percentage against the synthetic "assumed-known" deck for the chosen level.
  const readability = useMemo(() => {
    if (!story || !choice) return null
    const cards = assumedKnownCards(story.vocab_pool, choice, story.level)
    return calculateStoryReadability({ content: story.content, vocabMap, cards, language: story.language })
  }, [story, choice, vocabMap])

  function pick(key) {
    setChoice(key)
    const cards = assumedKnownCards(story.vocab_pool, key, story.level)
    const r = calculateStoryReadability({ content: story.content, vocabMap, cards, language: story.language })
    track(EVENTS.PUBLIC_STORY_LEVEL_PICKED, { assumedLevel: key, knownPct: r.knownPct })
  }

  function goSignup() {
    track(EVENTS.PUBLIC_STORY_SIGNUP_CLICKED, { language: story ? story.language : null })
    navigate('/')
  }

  // Document title for link unfurls (best-effort; client-side only).
  useEffect(() => {
    if (story && story.title) document.title = story.title + ' · ' + BRAND_NAME
    return () => { document.title = BRAND_NAME }
  }, [story])

  const pageStyle = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: '32px 16px' }
  const cardStyle = { width: '100%', maxWidth: '640px' }

  if (status === 'loading') {
    return <div style={pageStyle}><div style={{ alignSelf: 'center', color: accent, fontSize: '32px' }}>読</div></div>
  }
  if (status === 'missing' || !story) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', alignSelf: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Story not found</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>This story link isn't available.</div>
          <button onClick={() => navigate('/')} style={ctaStyle(accent)}>Go to {BRAND_NAME}</button>
        </div>
      </div>
    )
  }

  const cover = story.image_path ? getAudioUrl(story.image_path) : null
  const levelLabel = getLevelLabel(story.language, story.system, story.level)
  const lines = teaserLines(story.content, 4)
  const knownCards = choice ? assumedKnownCards(story.vocab_pool, choice, story.level) : {}

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ color: accent, fontWeight: 700, fontFamily: 'Poppins, Inter, sans-serif', marginBottom: '18px' }}>{BRAND_NAME}</div>

        {cover ? (
          <img src={cover} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '16px', display: 'block', marginBottom: '16px' }} />
        ) : null}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: accent, border: '1px solid ' + accent, borderRadius: '999px', padding: '2px 10px' }}>{theme.languageName} · {levelLabel}</span>
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 6px', fontFamily: theme.font + ', Inter, sans-serif' }}>{story.title}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 22px' }}>A real {theme.languageName} story. How much can you already read?</p>

        {/* Level pick */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>How much {theme.languageName} do you know?</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {LEVEL_CHOICES.map(c => {
              const on = choice === c.key
              return (
                <button key={c.key} onClick={() => pick(c.key)} style={{
                  padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600,
                  border: '1px solid ' + (on ? accent : 'var(--border)'),
                  background: on ? accent : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text)',
                }}>{c.label}</button>
              )
            })}
          </div>
        </div>

        {/* Reveal + gate */}
        {readability ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>You'd understand</div>
              <div style={{ color: accent, fontWeight: 800, fontSize: '64px', lineHeight: 1.1 }}>~{readability.knownPct}%</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{readability.knownCount} known · {readability.learningCount} learning · {readability.newCount} new</div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', marginBottom: '18px', fontFamily: theme.font + ', Inter, sans-serif', fontSize: '20px', lineHeight: 2 }}>
              {lines.map((line, i) => (
                <TeaserLine key={i} line={line} vocabMap={vocabMap} language={story.language} knownCards={knownCards} accent={accent} />
              ))}
              <div style={{ color: 'var(--text-faint)', fontSize: '14px', fontStyle: 'italic', marginTop: '8px' }}>…</div>
            </div>

            <button onClick={goSignup} style={ctaStyle(accent)}>Sign up free to read the rest</button>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '10px' }}>Free forever. Start learning these words.</div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Pick a level to see how much you can read.</div>
        )}
      </div>
    </div>
  )
}

function ctaStyle(accent) {
  return { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: accent, color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }
}

// One teaser line: greedy-match known/new words and underline the new ones, so a
// visitor sees exactly which words they'd be learning. Reuses the reader's
// matcher (buildVocabMatcher/matchVocabAt/boundaryAfterSkip) so highlighting
// matches the counted percentage. matchVocabAt returns { vocab, len } (NOT a
// { text, length } pair) — the matched substring is derived via text.slice.
// Mirrors scanLineVocab's ordering (storyReading.js): try matchName first at
// each position (skip over a personal-name fragment without highlighting it,
// same as the counted % does), then fall back to matchVocabAt.
function TeaserLine({ line, vocabMap, language, knownCards, accent }) {
  const matcher = useMemo(() => buildVocabMatcher(vocabMap, language), [vocabMap, language])
  const particles = language === 'japanese' ? JP_PARTICLES : NO_PARTICLES
  const names = CHARACTER_READINGS[language] || {}
  const { speaker, text } = splitSpeaker(line)
  const parts = []
  let i = 0
  let key = 0
  let boundary = true
  while (i < text.length) {
    const name = matchName(text, i, matcher.words, names)
    if (name) {
      parts.push(<span key={key++}>{name}</span>)
      i += name.length
      boundary = true
      continue
    }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m && m.vocab) {
      const word = text.slice(i, i + m.len)
      const st = wordStatus(m.vocab.id, knownCards)
      const known = st === 'review' || st === 'mastered'
      parts.push(
        <span key={key++} style={known ? null : { borderBottom: '2px solid ' + accent, color: 'var(--text)' }}>{word}</span>
      )
      i += m.len
      boundary = true
    } else {
      parts.push(<span key={key++}>{text[i]}</span>)
      boundary = boundaryAfterSkip(text[i], particles)
      i += 1
    }
  }
  return (
    <div>
      {speaker ? <span style={{ color: 'var(--text-muted)', fontWeight: 700, marginRight: '6px' }}>{speaker}</span> : null}
      {parts}
    </div>
  )
}
