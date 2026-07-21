# Wow-Moment Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor read and understand a real, reason-themed Chinese sentence — interactively — *before* signing up, then flow into a streamlined, personalized onboarding.

**Architecture:** A bundled static dataset (`data/starter-sentences.chinese.json`) drives a pure accessor module (`src/starterSentences.js`) and two presentational components (`SentenceTaste`, `CharacterTaste`) inserted into the pre-login `Landing` wizard between the reason step and signup. Everything pre-signup is client-only (no DB, no LLM, no auth). Post-signup, the goal step is reframed to an honest outcome and the first-session welcome acknowledges the tasted words. Audio uses pre-generated clips with a `speechSynthesis` fallback.

**Tech Stack:** React 19, Vite 8, Vitest, Playwright, existing `toneColor.js` / `playAudioEl` / `analytics.js` helpers, `pinyin-pro` (authoring only).

## Global Constraints

- **Chinese only.** Dataset + copy are Chinese-specific.
- **No runtime LLM or DB for the pre-signup taste.** Static dataset, client-side only.
- **No new auth methods.** Email + Google unchanged; only signup-mode copy changes.
- **Audio is an enhancement, never a gate.** Missing clip → `speechSynthesis` → silent reveal.
- **Ships behind a flag** `FLAGS.WOW_ONBOARDING` (default `true`), reversible.
- **Chinese accent color:** `#B83A24` (matches `LANGUAGES.chinese.accentHex`).
- **Commit identity:** `git config user.email noreply@anthropic.com && git config user.name Claude` before the first commit.
- **Every task ends green:** `npx vitest run` and `npm run build` both pass.

> **AMENDMENT (2026-07-21, applies to Tasks 3, 4, 8):** This repo has no DOM test
> environment — vitest runs `environment: 'node'`, includes only `src/**/*.test.js`,
> and neither `@testing-library/react` nor `jsdom` is installed; components are
> covered by Playwright e2e, not unit render tests. So **do NOT create the
> `*.test.jsx` render tests** in Tasks 3, 4, 8. The testable logic is already pure
> and unit-tested (`understandPct`, `charsToLearn`, `daysToWords`, `tastedWordsLine`);
> component behavior is covered by the Task 9 e2e. For those tasks, "verify" means:
> `npm run build` (component compiles), `npx vitest run` (full suite stays green),
> and `npx eslint <new files>` (clean). Everything else in those tasks is unchanged.

---

### Task 1: Starter-sentence dataset + pure accessors

**Files:**
- Create: `data/starter-sentences.chinese.json`
- Create: `src/starterSentences.js`
- Test: `src/starterSentences.test.js`

**Interfaces:**
- Produces:
  - `sentenceForReason(reason: string, index = 0) → SentenceObj` (falls back to the `default` bucket for unknown reasons; wraps `index` modulo the bucket length)
  - `charsToLearn(sentence: SentenceObj) → WordObj[]` (≤3; the `learn` list if present, else the shortest non-punctuation words)
  - `understandPct(sentence: SentenceObj, revealedIndexes: number[]|Set<number>) → number` (0–100; denominator excludes punctuation)
  - `audioSrcFor(sentenceId: string, wordIndex: number|null) → string` (word clip when `wordIndex` is a number, whole-sentence clip when `null`)
  - Shapes: `SentenceObj = { id, hanzi, translation, words: WordObj[], learn?: string[] }`, `WordObj = { hanzi, pinyin, gloss, punct? }`

- [ ] **Step 1: Write the dataset**

Create `data/starter-sentences.chinese.json`:

```json
{
  "travel": [
    {
      "id": "travel-1",
      "hanzi": "这个多少钱？",
      "translation": "How much is this?",
      "words": [
        { "hanzi": "这个", "pinyin": "zhège", "gloss": "this one" },
        { "hanzi": "多少", "pinyin": "duōshao", "gloss": "how much" },
        { "hanzi": "钱", "pinyin": "qián", "gloss": "money" },
        { "hanzi": "？", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["钱"]
    }
  ],
  "family": [
    {
      "id": "family-1",
      "hanzi": "我爱我的家。",
      "translation": "I love my family.",
      "words": [
        { "hanzi": "我", "pinyin": "wǒ", "gloss": "I" },
        { "hanzi": "爱", "pinyin": "ài", "gloss": "love" },
        { "hanzi": "我的", "pinyin": "wǒde", "gloss": "my" },
        { "hanzi": "家", "pinyin": "jiā", "gloss": "home, family" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["爱", "家", "我"]
    }
  ],
  "work": [
    {
      "id": "work-1",
      "hanzi": "我在学中文。",
      "translation": "I'm learning Chinese.",
      "words": [
        { "hanzi": "我", "pinyin": "wǒ", "gloss": "I" },
        { "hanzi": "在", "pinyin": "zài", "gloss": "(in the middle of)" },
        { "hanzi": "学", "pinyin": "xué", "gloss": "study, learn" },
        { "hanzi": "中文", "pinyin": "zhōngwén", "gloss": "Chinese" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["学", "我", "在"]
    }
  ],
  "exam": [
    {
      "id": "exam-1",
      "hanzi": "我要考试。",
      "translation": "I have an exam.",
      "words": [
        { "hanzi": "我", "pinyin": "wǒ", "gloss": "I" },
        { "hanzi": "要", "pinyin": "yào", "gloss": "will, need to" },
        { "hanzi": "考试", "pinyin": "kǎoshì", "gloss": "exam, test" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["要", "我"]
    }
  ],
  "culture": [
    {
      "id": "culture-1",
      "hanzi": "我喜欢中国电影。",
      "translation": "I like Chinese movies.",
      "words": [
        { "hanzi": "我", "pinyin": "wǒ", "gloss": "I" },
        { "hanzi": "喜欢", "pinyin": "xǐhuan", "gloss": "like" },
        { "hanzi": "中国", "pinyin": "zhōngguó", "gloss": "China" },
        { "hanzi": "电影", "pinyin": "diànyǐng", "gloss": "movie" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["我", "喜欢", "电影"]
    }
  ],
  "curious": [
    {
      "id": "curious-1",
      "hanzi": "学中文很有意思。",
      "translation": "Learning Chinese is interesting.",
      "words": [
        { "hanzi": "学", "pinyin": "xué", "gloss": "study, learn" },
        { "hanzi": "中文", "pinyin": "zhōngwén", "gloss": "Chinese" },
        { "hanzi": "很", "pinyin": "hěn", "gloss": "very" },
        { "hanzi": "有意思", "pinyin": "yǒuyìsi", "gloss": "interesting" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["学", "很"]
    }
  ],
  "default": [
    {
      "id": "default-1",
      "hanzi": "我喜欢学中文。",
      "translation": "I like learning Chinese.",
      "words": [
        { "hanzi": "我", "pinyin": "wǒ", "gloss": "I" },
        { "hanzi": "喜欢", "pinyin": "xǐhuan", "gloss": "like" },
        { "hanzi": "学", "pinyin": "xué", "gloss": "study, learn" },
        { "hanzi": "中文", "pinyin": "zhōngwén", "gloss": "Chinese" },
        { "hanzi": "。", "pinyin": "", "gloss": "", "punct": true }
      ],
      "learn": ["学", "我", "喜欢"]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `src/starterSentences.test.js`:

```js
import { describe, it, expect } from 'vitest'
import data from '../data/starter-sentences.chinese.json'
import { sentenceForReason, charsToLearn, understandPct, audioSrcFor } from './starterSentences'
import { REASONS } from './prelogin'

describe('sentenceForReason', () => {
  it('returns a sentence for a known reason', () => {
    expect(sentenceForReason('travel').id).toBe('travel-1')
  })
  it('falls back to the default bucket for an unknown/empty reason', () => {
    expect(sentenceForReason('klingon').id).toBe('default-1')
    expect(sentenceForReason(null).id).toBe('default-1')
  })
  it('wraps the index modulo the bucket length', () => {
    expect(sentenceForReason('travel', 5).id).toBe('travel-1')
  })
})

describe('charsToLearn', () => {
  it('uses the learn list, in sentence order, max 3', () => {
    const got = charsToLearn(sentenceForReason('family')).map(w => w.hanzi)
    expect(got).toEqual(['我', '爱', '家'])
  })
  it('falls back to the shortest non-punct words when no learn list', () => {
    const s = { words: [
      { hanzi: '中文', pinyin: 'zhōngwén', gloss: 'Chinese' },
      { hanzi: '好', pinyin: 'hǎo', gloss: 'good' },
      { hanzi: '。', pinyin: '', gloss: '', punct: true },
    ] }
    expect(charsToLearn(s).map(w => w.hanzi)).toEqual(['好', '中文'])
  })
})

describe('understandPct', () => {
  it('is 0 with nothing revealed and 100 when every non-punct word is revealed', () => {
    const s = sentenceForReason('travel')          // 3 words + 1 punct
    expect(understandPct(s, [])).toBe(0)
    expect(understandPct(s, [0, 1, 2])).toBe(100)   // punctuation index 3 not needed
  })
  it('ignores punctuation indexes in the numerator', () => {
    const s = sentenceForReason('travel')
    expect(understandPct(s, [3])).toBe(0)
  })
})

describe('audioSrcFor', () => {
  it('builds a word clip path', () => {
    expect(audioSrcFor('travel-1', 2)).toBe('/starter-audio/travel-1-2.mp3')
  })
  it('builds a whole-sentence clip path', () => {
    expect(audioSrcFor('travel-1', null)).toBe('/starter-audio/travel-1.mp3')
  })
})

describe('dataset integrity', () => {
  it('has a bucket for every reason plus default', () => {
    for (const r of REASONS) expect(Array.isArray(data[r.key])).toBe(true)
    expect(Array.isArray(data.default)).toBe(true)
  })
  it('every sentence words concatenate back to its hanzi, with pinyin on real words', () => {
    for (const bucket of Object.values(data)) {
      for (const s of bucket) {
        expect(s.words.map(w => w.hanzi).join('')).toBe(s.hanzi)
        for (const w of s.words) if (!w.punct) expect(w.pinyin.length).toBeGreaterThan(0)
        if (s.learn) for (const h of s.learn) {
          expect(s.words.some(w => w.hanzi === h)).toBe(true)
        }
      }
    }
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/starterSentences.test.js`
Expected: FAIL — `starterSentences.js` does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `src/starterSentences.js`:

```js
// Pure accessors over the bundled starter-sentence dataset used by the pre-signup
// "read a sentence" wow moment. No React, no Supabase — safe to unit-test in
// isolation and to run before an account exists.
import data from '../data/starter-sentences.chinese.json'

// The sentence to show for a reason. Unknown/empty reasons use the `default`
// bucket, so the flow never dead-ends. `index` wraps so "try another" is safe.
export function sentenceForReason(reason, index = 0) {
  const bucket = (reason && data[reason]) || data.default
  return bucket[((index % bucket.length) + bucket.length) % bucket.length]
}

// Up to 3 words to feature in the character taste: the authored `learn` list
// (mapped to word objects, in sentence order), else the shortest real words.
export function charsToLearn(sentence) {
  const real = sentence.words.filter(w => !w.punct)
  if (sentence.learn && sentence.learn.length) {
    // Iterate the words in sentence order, keeping those named in `learn`, so
    // the taste follows the reading order (not the order they were listed).
    const want = new Set(sentence.learn)
    const picks = real.filter(w => want.has(w.hanzi)).slice(0, 3)
    if (picks.length) return picks
  }
  return [...real].sort((a, b) => a.hanzi.length - b.hanzi.length).slice(0, 3)
}

// Share of real (non-punct) words revealed, 0–100. Punctuation never counts, so
// revealing every real word reaches exactly 100.
export function understandPct(sentence, revealedIndexes) {
  const revealed = revealedIndexes instanceof Set ? revealedIndexes : new Set(revealedIndexes || [])
  const realIdx = sentence.words.map((w, i) => (w.punct ? -1 : i)).filter(i => i >= 0)
  if (realIdx.length === 0) return 0
  const hit = realIdx.filter(i => revealed.has(i)).length
  return Math.round((100 * hit) / realIdx.length)
}

// Convention-based static path (files live in public/starter-audio/, served at
// the site root). `wordIndex === null` → the whole-sentence clip.
export function audioSrcFor(sentenceId, wordIndex) {
  return wordIndex == null
    ? `/starter-audio/${sentenceId}.mp3`
    : `/starter-audio/${sentenceId}-${wordIndex}.mp3`
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/starterSentences.test.js`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add data/starter-sentences.chinese.json src/starterSentences.js src/starterSentences.test.js
git commit -m "feat(onboarding): starter-sentence dataset + pure accessors"
```

---

### Task 2: prelogin — carry tasted words + acknowledgement copy

**Files:**
- Modify: `src/prelogin.js`
- Test: `src/prelogin.test.js` (create if absent; otherwise append)

**Interfaces:**
- Consumes: existing `savePreloginPrefs(prefs)`, `readPreloginPrefs()`.
- Produces:
  - Prefs may now carry `tastedWords: string[]` (hanzi strings). Existing callers are unaffected (extra field).
  - `tastedWordsLine(words: string[]) → string|null` — a warm one-liner naming up to 2 words, or `null` for an empty list.

- [ ] **Step 1: Write the failing test**

Append to `src/prelogin.test.js` (create the file with this content if it doesn't exist):

```js
import { describe, it, expect } from 'vitest'
import { tastedWordsLine } from './prelogin'

describe('tastedWordsLine', () => {
  it('returns null for no words', () => {
    expect(tastedWordsLine([])).toBe(null)
    expect(tastedWordsLine(null)).toBe(null)
  })
  it('names one word', () => {
    expect(tastedWordsLine(['钱'])).toBe('You already met 钱 — nice start.')
  })
  it('names two words and stops there', () => {
    expect(tastedWordsLine(['我', '爱', '家'])).toBe('You already met 我 and 爱 — nice start.')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/prelogin.test.js`
Expected: FAIL — `tastedWordsLine` is not exported.

- [ ] **Step 3: Implement**

Add to `src/prelogin.js` (after `encouragementFor`):

```js
// A warm one-liner for the first-session welcome, naming up to two words the
// visitor already tasted pre-signup. Returns null when there's nothing to say.
export function tastedWordsLine(words) {
  const list = (words || []).filter(Boolean)
  if (list.length === 0) return null
  const named = list.slice(0, 2).join(' and ')
  return `You already met ${named} — nice start.`
}
```

(`savePreloginPrefs`/`readPreloginPrefs` already round-trip an arbitrary object, so
`tastedWords` needs no storage change.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/prelogin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prelogin.js src/prelogin.test.js
git commit -m "feat(onboarding): carry tasted words in pre-login prefs + welcome line"
```

---

### Task 3: Starter audio helper + SentenceTaste component

**Files:**
- Create: `src/starterAudio.js`
- Create: `src/SentenceTaste.jsx`
- Test: `src/SentenceTaste.test.jsx`

**Interfaces:**
- Consumes: `audioSrcFor` (Task 1), `understandPct` (Task 1), `playAudioEl` from `./utils`, `splitHanziWithTones` + `TONE_CLASS` from `./toneColor`.
- Produces:
  - `playStarterWord(el: HTMLAudioElement, sentenceId, wordIndex, hanzi) → void` and `speak(text) → void` (from `starterAudio.js`).
  - `<SentenceTaste sentence accentHex onComplete onSkip onWordReveal? />` — calls `onWordReveal(index)` the first time each real word is revealed, and `onComplete()` when the learner advances from the finished sentence.

- [ ] **Step 1: Write the audio helper**

Create `src/starterAudio.js`:

```js
import { playAudioEl } from './utils'
import { audioSrcFor } from './starterSentences'

// Speak text with the browser's zh-CN voice. Guarded — audio is an enhancement,
// never a gate, so any failure is swallowed.
export function speak(text) {
  try {
    const synth = window.speechSynthesis
    if (!synth || !text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    synth.cancel()
    synth.speak(u)
  } catch { /* ignore */ }
}

// Play a starter word: try its pre-generated clip, fall back to speech synthesis.
// `el` must be a reused <audio> element (see playAudioEl's contract).
export function playStarterWord(el, sentenceId, wordIndex, hanzi) {
  if (!el) { speak(hanzi); return }
  playAudioEl(el, audioSrcFor(sentenceId, wordIndex), () => speak(hanzi))
}
```

- [ ] **Step 2: Write the failing test**

Create `src/SentenceTaste.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SentenceTaste from './SentenceTaste'
import { sentenceForReason } from './starterSentences'

// speechSynthesis isn't in jsdom; stub it so the audio path is a no-op.
beforeEach(() => {
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
  globalThis.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
})

describe('SentenceTaste', () => {
  it('reveals a word (pinyin + gloss) and ticks the meter', () => {
    const s = sentenceForReason('travel')
    render(<SentenceTaste sentence={s} accentHex="#B83A24" onComplete={() => {}} onSkip={() => {}} />)
    expect(screen.queryByText('money')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /钱/ }))
    expect(screen.getByText('money')).toBeTruthy()
    expect(screen.getByText(/33%|understand/i)).toBeTruthy()
  })

  it('shows the completion line + translation once every word is revealed', () => {
    const s = sentenceForReason('travel')
    const onComplete = vi.fn()
    render(<SentenceTaste sentence={s} accentHex="#B83A24" onComplete={onComplete} onSkip={() => {}} />)
    s.words.forEach(w => {
      if (w.punct) return
      fireEvent.click(screen.getByRole('button', { name: new RegExp(w.hanzi) }))
    })
    expect(screen.getByText(/first Chinese sentence/i)).toBeTruthy()
    expect(screen.getByText('How much is this?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /learn these characters/i }))
    expect(onComplete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/SentenceTaste.test.jsx`
Expected: FAIL — `SentenceTaste` does not exist.

- [ ] **Step 4: Implement the component**

Create `src/SentenceTaste.jsx`:

```jsx
import { useRef, useState } from 'react'
import { understandPct } from './starterSentences'
import { playStarterWord } from './starterAudio'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'

// The pre-signup wow moment: tap each word to reveal pinyin + gloss + audio and
// watch a calm "you understand X%" meter fill to 100. Presentational — the parent
// owns navigation via onComplete / onSkip.
export default function SentenceTaste({ sentence, accentHex, onComplete, onSkip, onWordReveal }) {
  const [revealed, setRevealed] = useState(() => new Set())
  const audioRef = useRef(null)

  const realCount = sentence.words.filter(w => !w.punct).length
  const pct = understandPct(sentence, revealed)
  const done = pct === 100

  const reveal = (i) => {
    const w = sentence.words[i]
    if (w.punct) return
    playStarterWord(audioRef.current, sentence.id, i, w.hanzi)
    setRevealed(prev => {
      if (prev.has(i)) return prev
      const next = new Set(prev)
      next.add(i)
      if (onWordReveal) onWordReveal(i)
      return next
    })
  }

  const revealAll = () => {
    sentence.words.forEach((w, i) => { if (!w.punct && !revealed.has(i) && onWordReveal) onWordReveal(i) })
    setRevealed(new Set(sentence.words.map((w, i) => (w.punct ? -1 : i)).filter(i => i >= 0)))
  }

  return (
    <div style={{ width: '100%', maxWidth: '440px' }}>
      {/* Reused audio element (see playAudioEl contract) */}
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '18px' }}>
        Tap each word to hear it and see what it means.
      </p>

      {/* Word chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
        {sentence.words.map((w, i) => {
          if (w.punct) return <span key={i} style={{ fontSize: '30px', color: 'var(--text)', alignSelf: 'flex-end' }}>{w.hanzi}</span>
          const isOpen = revealed.has(i)
          const chars = splitHanziWithTones(w.hanzi, w.pinyin)
          return (
            <button
              key={i}
              onClick={() => reveal(i)}
              aria-label={w.hanzi}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                padding: '10px 12px', borderRadius: '12px', cursor: 'pointer',
                border: isOpen ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                background: isOpen ? (accentHex + '0D') : 'var(--surface)', transition: 'all 0.15s',
                fontFamily: 'Inter, sans-serif', minWidth: '48px',
              }}
            >
              <span style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1.1 }}>
                {isOpen ? chars.map((c, j) => <span key={j} className={TONE_CLASS[c.tone]}>{c.char}</span>) : w.hanzi}
              </span>
              {isOpen && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{w.pinyin}</span>}
              {isOpen && <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{w.gloss}</span>}
            </button>
          )
        })}
      </div>

      {/* Understand meter */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>
          <span>You understand</span><span>{pct}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: accentHex, transition: 'width 0.3s' }} />
        </div>
      </div>

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '15px', fontWeight: 750, color: accentHex, margin: '0 0 6px' }}>
            🎉 You just read your first Chinese sentence.
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{sentence.translation}</p>
          <button onClick={onComplete} style={primaryBtn(accentHex)}>Learn these characters →</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <button onClick={revealAll} style={{ ...primaryBtn(accentHex), background: 'transparent', color: accentHex, border: '2px solid ' + accentHex }}>
            Reveal all
          </button>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      )}
    </div>
  )
}

function primaryBtn(accentHex) {
  return {
    width: '100%', maxWidth: '320px', padding: '13px', borderRadius: '12px', border: 'none',
    background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/SentenceTaste.test.jsx`
Expected: PASS. (The `travel` sentence has 3 real words, so one reveal = 33%.)

- [ ] **Step 6: Commit**

```bash
git add src/starterAudio.js src/SentenceTaste.jsx src/SentenceTaste.test.jsx
git commit -m "feat(onboarding): SentenceTaste wow-moment component + audio helper"
```

---

### Task 4: CharacterTaste component

**Files:**
- Create: `src/CharacterTaste.jsx`
- Test: `src/CharacterTaste.test.jsx`

**Interfaces:**
- Consumes: `playStarterWord` (Task 3).
- Produces: `<CharacterTaste words sentenceId accentHex onDone />` — steps through each word (Show → Got it), calls `onDone()` after the last.

- [ ] **Step 1: Write the failing test**

Create `src/CharacterTaste.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CharacterTaste from './CharacterTaste'

beforeEach(() => {
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
  globalThis.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
})

const words = [
  { hanzi: '钱', pinyin: 'qián', gloss: 'money' },
  { hanzi: '家', pinyin: 'jiā', gloss: 'home' },
]

describe('CharacterTaste', () => {
  it('reveals a card then advances, calling onDone after the last', () => {
    const onDone = vi.fn()
    render(<CharacterTaste words={words} sentenceId="x-1" accentHex="#B83A24" onDone={onDone} />)

    // Card 1 hidden → Show reveals gloss
    expect(screen.queryByText('money')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByText('money')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))

    // Card 2
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByText('home')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))

    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/CharacterTaste.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `src/CharacterTaste.jsx`:

```jsx
import { useRef, useState } from 'react'
import { playStarterWord } from './starterAudio'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'

// A frictionless taste of the flashcard feel: for each featured word, show the
// hanzi, tap Show to reveal pinyin + gloss + audio, then Got it to advance. No
// grading, no FSRS — just momentum. onDone fires after the last card.
export default function CharacterTaste({ words, sentenceId, accentHex, onDone }) {
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(false)
  const audioRef = useRef(null)
  const w = words[idx]
  const chars = splitHanziWithTones(w.hanzi, w.pinyin)

  const show = () => { setShown(true); playStarterWord(audioRef.current, sentenceId, null, w.hanzi) }
  const next = () => {
    if (idx + 1 >= words.length) { onDone(); return }
    setIdx(idx + 1); setShown(false)
  }

  return (
    <div style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      {/* progress dots */}
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '22px' }}>
        {words.map((_, i) => (
          <div key={i} style={{ width: '8px', height: '8px', borderRadius: '999px', background: i <= idx ? accentHex : 'var(--border)' }} />
        ))}
      </div>

      <div style={{
        padding: '32px 20px', borderRadius: '18px', border: '2px solid var(--border)',
        background: 'var(--surface)', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '64px', fontWeight: 750, fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1.1 }}>
          {shown ? chars.map((c, j) => <span key={j} className={TONE_CLASS[c.tone]}>{c.char}</span>) : w.hanzi}
        </div>
        {shown && <div style={{ fontSize: '16px', color: 'var(--text-muted)', marginTop: '10px' }}>{w.pinyin}</div>}
        {shown && <div style={{ fontSize: '17px', color: 'var(--text)', fontWeight: 650, marginTop: '4px' }}>{w.gloss}</div>}
      </div>

      {shown ? (
        <button onClick={next} style={btn(accentHex)}>{idx + 1 >= words.length ? 'Done →' : 'Got it →'}</button>
      ) : (
        <button onClick={show} style={{ ...btn(accentHex), background: 'transparent', color: accentHex, border: '2px solid ' + accentHex }}>Show</button>
      )}
    </div>
  )
}

function btn(accentHex) {
  return {
    width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
    background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/CharacterTaste.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CharacterTaste.jsx src/CharacterTaste.test.jsx
git commit -m "feat(onboarding): CharacterTaste three-card taste"
```

---

### Task 5: Wire the wizard into Landing (flag, events, hero, taste/learn modes)

**Files:**
- Create: `src/flags.js`
- Modify: `src/analytics.js` (add events to `EVENTS`)
- Modify: `src/Landing.jsx`

**Interfaces:**
- Consumes: `SentenceTaste` (Task 3), `CharacterTaste` (Task 4), `sentenceForReason` + `charsToLearn` (Task 1), `savePreloginPrefs` (existing).
- Produces: the pre-login flow `landing → why → taste → learn → auth` when `FLAGS.WOW_ONBOARDING`, writing `tastedWords` into pre-login prefs.

- [ ] **Step 1: Add the flag module**

Create `src/flags.js`:

```js
// Lightweight, code-level feature flags. Flip a value to false to disable a
// feature fast without touching its call sites.
export const FLAGS = {
  // The pre-signup "read a Chinese sentence" wow moment (SentenceTaste +
  // CharacterTaste between the reason step and signup). Default on.
  WOW_ONBOARDING: true,
}
```

- [ ] **Step 2: Add analytics events**

In `src/analytics.js`, inside the `EVENTS` object after `PRELOGIN_REASON_PICKED:` line, add:

```js
  TASTE_SHOWN: 'taste_shown',
  TASTE_WORD_REVEALED: 'taste_word_revealed',
  TASTE_COMPLETED: 'taste_completed',
  CHARS_TASTE_COMPLETED: 'chars_taste_completed',
```

- [ ] **Step 3: Wire Landing — imports, hero copy, and the two new modes**

In `src/Landing.jsx`:

(a) Add imports near the top (after the existing `./languageTheme` import):

```jsx
import SentenceTaste from './SentenceTaste'
import CharacterTaste from './CharacterTaste'
import { sentenceForReason, charsToLearn } from './starterSentences'
import { FLAGS } from './flags'
```

(b) Change `chooseReason` so it routes into the taste when the flag is on, instead of straight to auth. Replace the existing `chooseReason`:

```jsx
  const chooseReason = (reasonKey) => {
    setPickedReason(reasonKey)
    track(EVENTS.PRELOGIN_REASON_PICKED, { language: pickedLang, reason: reasonKey })
    savePreloginPrefs({ language: pickedLang, reason: reasonKey })
    if (FLAGS.WOW_ONBOARDING) {
      track(EVENTS.TASTE_SHOWN, { reason: reasonKey })
      setMode('taste')
    } else {
      track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: pickedLang, reason: reasonKey })
      setMode('auth')
    }
  }

  // Finished the sentence → go learn its characters.
  const finishTaste = () => {
    track(EVENTS.TASTE_COMPLETED, { reason: pickedReason })
    setMode('learn')
  }

  // Finished the character taste (or skipped) → persist tasted words + go to auth.
  const finishLearn = (tastedWords) => {
    savePreloginPrefs({ language: pickedLang, reason: pickedReason, tastedWords: tastedWords || [] })
    if (tastedWords && tastedWords.length) track(EVENTS.CHARS_TASTE_COMPLETED, { reason: pickedReason, count: tastedWords.length })
    track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: pickedLang, reason: pickedReason })
    setMode('auth')
  }
```

(c) Add the two render branches. Immediately **before** `if (mode === 'why') {`, insert:

```jsx
  if (mode === 'taste') {
    const sentence = sentenceForReason(pickedReason)
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('why')}
        title="Read your first Chinese sentence"
        subtitle="No account needed — just tap.">
        <SentenceTaste
          sentence={sentence}
          accentHex="#B83A24"
          onWordReveal={() => track(EVENTS.TASTE_WORD_REVEALED, { reason: pickedReason })}
          onComplete={finishTaste}
          onSkip={() => finishLearn([])}
        />
      </WizardShell>
    )
  }

  if (mode === 'learn') {
    const sentence = sentenceForReason(pickedReason)
    const words = charsToLearn(sentence)
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('taste')}
        title="Learn these characters"
        subtitle="Keep them with a free account.">
        <CharacterTaste
          words={words}
          sentenceId={sentence.id}
          accentHex="#B83A24"
          onDone={() => finishLearn(words.map(w => w.hanzi))}
        />
      </WizardShell>
    )
  }
```

(d) Update the hero copy. Find the hero headline/subcopy block (the one containing "pairs FSRS flashcards with graded mini-stories") and change the subcopy paragraph to lead with the payoff + philosophy:

```jsx
            Read real Chinese in your first minute. No streaks. No leagues. No
            guilt — just real progress: {BRAND_NAME} pairs a proven memory engine
            with graded stories matched to the words you know.
```

- [ ] **Step 4: Verify the build + existing tests**

Run: `npm run build`
Expected: builds clean (no unresolved imports).
Run: `npx vitest run`
Expected: all pass (no existing test asserts the old hero copy or `chooseReason` path; if one does, update it to the new flow).

- [ ] **Step 5: Commit**

```bash
git add src/flags.js src/analytics.js src/Landing.jsx
git commit -m "feat(onboarding): insert wow-moment taste into the landing wizard behind a flag"
```

---

### Task 6: Reframe the signup copy ("save your progress")

**Files:**
- Modify: `src/Auth.jsx`

**Interfaces:**
- Consumes: nothing new. Copy-only; `signUp`/`handleGoogle` logic unchanged.

- [ ] **Step 1: Add a signup-mode subheading**

In `src/Auth.jsx`, locate the signup/login tab row (the buttons rendering "Log in" / "Sign up"). Directly **below** that tab row's closing `</div>`, add a signup-only line so the ask reads as saving progress rather than a cold gate:

```jsx
        {isSignup && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: '10px 0 0', lineHeight: 1.5 }}>
            Save your progress and unlock your first story — free, no card needed.
          </p>
        )}
```

(If `isSignup` is named differently in this file, use the existing signup-mode boolean — do not add new state.)

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: builds clean.
Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/Auth.jsx
git commit -m "feat(onboarding): reframe signup as 'save your progress'"
```

---

### Task 7: Outcome-framed goal step

**Files:**
- Create: `src/onboardingGoal.js`
- Test: `src/onboardingGoal.test.js`
- Modify: `src/Onboarding.jsx`

**Interfaces:**
- Consumes: `CATEGORIES_BY_LANGUAGE` from `./storyTiers` (tier-2 `minWords` = the next-library threshold).
- Produces: `daysToWords(dailyNewCards: number, targetWords: number) → number` (≥1).

- [ ] **Step 1: Write the failing test**

Create `src/onboardingGoal.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { daysToWords } from './onboardingGoal'

describe('daysToWords', () => {
  it('divides target by daily pace, rounding up', () => {
    expect(daysToWords(5, 100)).toBe(20)
    expect(daysToWords(10, 100)).toBe(10)
    expect(daysToWords(15, 100)).toBe(7)
  })
  it('never returns less than 1', () => {
    expect(daysToWords(200, 100)).toBe(1)
    expect(daysToWords(0, 100)).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/onboardingGoal.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/onboardingGoal.js`:

```js
// How many days at a given daily-new-cards pace to reach a word target. Used to
// frame the goal step as an outcome ("unlock more stories in ~N days") instead
// of a bare cards/day number. Pure and tested.
export function daysToWords(dailyNewCards, targetWords) {
  const pace = Math.max(1, dailyNewCards || 0)
  return Math.max(1, Math.ceil(targetWords / pace))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/onboardingGoal.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the copy into the goal step**

In `src/Onboarding.jsx`:

(a) Add imports:

```jsx
import { daysToWords } from './onboardingGoal'
import { CATEGORIES_BY_LANGUAGE } from './storyTiers'
```

(b) Inside the component, compute the next-library word target (tier 2's threshold, falling back to 100):

```jsx
  const nextLibraryWords = (CATEGORIES_BY_LANGUAGE[language] || [])[1]?.minWords || 100
```

(c) In the STEP 3 (daily goal) options `.map`, add an outcome line under each option's description. Change the right-hand `{opt.cards}` cell to also show the estimate, or add a line under `{opt.desc}`:

```jsx
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</div>
                    <div style={{ fontSize: '12px', color: accentHex, fontWeight: 650, marginTop: '2px' }}>
                      ~{daysToWords(opt.val, nextLibraryWords)} days to unlock more stories
                    </div>
```

- [ ] **Step 6: Verify**

Run: `npm run build` → clean. Run: `npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add src/onboardingGoal.js src/onboardingGoal.test.js src/Onboarding.jsx
git commit -m "feat(onboarding): frame the daily goal as an outcome (~N days)"
```

---

### Task 8: First-session welcome acknowledges tasted words

**Files:**
- Modify: `src/FirstMissionWelcome.jsx`
- Test: `src/FirstMissionWelcome.test.jsx` (create)

**Interfaces:**
- Consumes: `readPreloginPrefs` (existing), `tastedWordsLine` (Task 2).
- Produces: the first-session welcome shows the "You already met …" line when tasted words exist; unchanged otherwise.

> Note: this is the step-8 continuity from the spec, implemented as low-coupling
> copy on the existing first-session welcome rather than reordering `Study.jsx`'s
> card queue. Actual card reordering is deferred (not worth the coupling for the
> momentum payoff).

- [ ] **Step 1: Write the failing test**

Create `src/FirstMissionWelcome.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import FirstMissionWelcome from './FirstMissionWelcome'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('FirstMissionWelcome', () => {
  it('shows the tasted-words line when pre-login prefs carry them', () => {
    localStorage.setItem('prelogin:prefs', JSON.stringify({ language: 'chinese', tastedWords: ['钱', '家'] }))
    render(<FirstMissionWelcome onStart={() => {}} />)
    expect(screen.getByText(/You already met 钱 and 家/)).toBeTruthy()
  })
  it('renders without the line when there are no tasted words', () => {
    render(<FirstMissionWelcome onStart={() => {}} />)
    expect(screen.queryByText(/You already met/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/FirstMissionWelcome.test.jsx`
Expected: FAIL — the line isn't rendered yet.

- [ ] **Step 3: Implement**

In `src/FirstMissionWelcome.jsx`:

(a) Add imports:

```jsx
import { readPreloginPrefs, tastedWordsLine } from './prelogin'
```

(b) Inside the component, derive the line:

```jsx
  const tastedLine = tastedWordsLine(readPreloginPrefs()?.tastedWords)
```

(c) Render it near the top of the welcome copy (place inside the existing card, above the primary description). Use the Chinese accent for warmth:

```jsx
      {tastedLine && (
        <p style={{ textAlign: 'center', color: '#B83A24', fontSize: '14px', fontWeight: 650, margin: '0 0 12px' }}>
          {tastedLine}
        </p>
      )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/FirstMissionWelcome.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FirstMissionWelcome.jsx src/FirstMissionWelcome.test.jsx
git commit -m "feat(onboarding): first-session welcome acknowledges tasted words"
```

---

### Task 9: e2e pre-signup path + generation script + full gate

**Files:**
- Create: `generate-starter-audio.mjs`
- Create/Modify: an e2e spec under the existing Playwright dir (match the repo's convention, e.g. `e2e/onboarding-taste.spec.js`)

**Interfaces:**
- Consumes: the whole flow from Tasks 1–8.

- [ ] **Step 1: Add the one-time audio generation script**

Create `generate-starter-audio.mjs` (mirrors `generate-audio.mjs`'s TTS usage; no-ops without a key so it never breaks CI):

```js
// One-time: generate TTS clips for every starter sentence + word into
// public/starter-audio/. Safe to re-run. No-ops without GOOGLE_TTS_KEY (the app
// falls back to browser speech until clips exist).
import fs from 'node:fs'
import path from 'node:path'
import data from './data/starter-sentences.chinese.json' assert { type: 'json' }

const KEY = process.env.GOOGLE_TTS_KEY
const OUT = path.join('public', 'starter-audio')

async function synth(text) {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'cmn-CN', name: 'cmn-CN-Wavenet-A' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`)
  return Buffer.from((await res.json()).audioContent, 'base64')
}

async function main() {
  if (!KEY) { console.log('No GOOGLE_TTS_KEY — skipping (speechSynthesis fallback covers audio).'); return }
  fs.mkdirSync(OUT, { recursive: true })
  for (const bucket of Object.values(data)) {
    for (const s of bucket) {
      fs.writeFileSync(path.join(OUT, `${s.id}.mp3`), await synth(s.hanzi))
      for (let i = 0; i < s.words.length; i++) {
        if (s.words[i].punct) continue
        fs.writeFileSync(path.join(OUT, `${s.id}-${i}.mp3`), await synth(s.words[i].hanzi))
      }
      console.log('generated', s.id)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Confirm the Playwright convention**

Run: `ls e2e 2>/dev/null || ls tests/e2e 2>/dev/null || npx playwright test --list 2>&1 | head`
Expected: reveals the existing spec directory + how specs start the app. Mirror an existing spec's setup (base URL, dev server) in the new file.

- [ ] **Step 3: Write the e2e spec**

Create the spec (adapt selectors/setup to the repo's existing e2e helper). It must not require an account:

```js
import { test, expect } from '@playwright/test'

test('a visitor can read a Chinese sentence before signing up', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /start reading|start your first story|build my reading path/i }).first().click()
  // Reason step
  await page.getByText(/just curious/i).click()
  // Taste step — reveal all, confirm the completion line, advance
  await page.getByRole('button', { name: /reveal all/i }).click()
  await expect(page.getByText(/first Chinese sentence/i)).toBeVisible()
  await page.getByRole('button', { name: /learn these characters/i }).click()
  // Character taste — step through to the signup gate
  for (let i = 0; i < 3; i++) {
    const show = page.getByRole('button', { name: /^show$/i })
    if (await show.isVisible().catch(() => false)) await show.click()
    await page.getByRole('button', { name: /got it|done/i }).click().catch(() => {})
  }
  await expect(page.getByText(/save your progress|create account|sign up/i).first()).toBeVisible()
})
```

- [ ] **Step 4: Run the e2e + full gate**

Run: `npx playwright test` (or the repo's e2e command from `package.json` scripts)
Expected: the new spec passes.
Run: `npx vitest run && npm run build`
Expected: all unit tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add generate-starter-audio.mjs e2e/
git commit -m "feat(onboarding): e2e for the pre-signup taste + starter-audio generation script"
```

---

## Post-implementation

- **Whole-branch review** (subagent-driven-development's opus review) before merge.
- **Run `generate-starter-audio.mjs`** once (locally or via CI with `GOOGLE_TTS_KEY`) to replace the `speechSynthesis` fallback with real clips; commit `public/starter-audio/`.
- **Update `ROADMAP.md`** "Just shipped" (no ` — ` em-dashes) and check off nothing in TESTING yet; add a `wow-onboarding` needs-testing item.
- **Watch the funnel**: `TASTE_SHOWN → TASTE_COMPLETED → CHARS_TASTE_COMPLETED → SIGNUP_COMPLETED` on the dashboard; flip `FLAGS.WOW_ONBOARDING` off if it regresses.

## Deferred (not in this plan)

- Reason-themed **story** selection (needs topic-tagged stories).
- Reordering the first-session card queue to put tasted words first (Study.jsx surgery; copy acknowledgement covers the momentum payoff for now).
- A second sentence per reason + "Try another" (dataset already supports `index`).
