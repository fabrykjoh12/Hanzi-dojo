# Onboarding: the "read Chinese in your first minute" wow moment

**Status:** Design approved 2026-07-21. Ready for implementation plan.

## Goal

Replace the current tell-then-commit onboarding with a **do-the-magic-first** flow.
A visitor reads and understands a real Chinese sentence — interactively, themed to
why they're learning — *before* we ask for an account. The account request lands
after they're already invested, the whole thing is personalized by their reason,
and the copy leads with the app's calm "no streaks, no guilt" identity.

This serves four objectives the user asked for, together:
- **Wow first moment** — they read real Chinese in ~30 seconds, by doing, not watching.
- **Personalization** — their reason (travel/family/work/exam/culture/curious)
  threads through the sentence they read, the characters they learn, and the copy.
- **Higher completion** — the payoff comes *before* the signup gate; the goal is
  framed as an outcome, not a number.
- **Warm brand** — philosophy-forward hero, calm language, zero streak/guilt framing.

## Non-goals (YAGNI)

- **No new auth methods.** Email magic-link + Google stay exactly as they are today.
- **No reason→story-topic matching in v1.** The first *story* is still chosen by the
  existing tier-1 mechanism. Reason theming applies to the wow sentence, the learned
  characters, and copy — not story selection. (Reason-themed stories are a future item.)
- **Chinese only.** Matches the current product focus. The starter dataset and copy
  are Chinese-specific; the flow is written so a second language could be added later
  by supplying its dataset, but we don't build for that now.
- **No server schema changes for the pre-signup taste.** The wow moment runs entirely
  client-side against a bundled static dataset — no DB, no RLS, works before an account
  exists and offline.
- **No LLM at runtime.** The starter sentences are a small, hand-curated, pre-baked
  dataset. Any generation is a one-time build script, not a runtime call.

## The flow

### Pre-signup (reworked `Landing` wizard)

The current landing wizard is `landing → why → auth`. The new flow inserts the wow
moment and a character taste between `why` and `auth`:

```
landing → why → taste (read a sentence) → learn (3 characters) → auth
```

**1. Landing hero — philosophy-forward** *(brand)*
Lead copy: *"Read real Chinese in your first minute. No streaks. No leagues. No guilt
— just real progress."* One calm primary CTA: **Start reading →**. The existing
"How much can you read?" secondary link stays. (Reuses today's `Landing` hero; copy
+ emphasis change only.)

**2. "Why are you learning?"** *(personalization root)*
Unchanged mechanically — the existing six `REASONS` (travel / family & heritage /
work / exam / culture / curious). The choice is saved to the pre-login prefs (as
today) and now also selects which starter sentence they'll read next.

**3. ✨ The taste — an interactive first sentence** *(centerpiece, NEW)*
We show **one real, simple Chinese sentence chosen by their reason**. It renders as
tappable word chips (segmented, not per-character), each initially showing just the
hanzi. Interaction:
- Tap a word → it reveals its **pinyin** (tone-colored, reusing `toneColor.js`) and a
  short **English gloss** below, and **plays audio** for that word.
- A **"You understand …%"** meter fills as words are revealed (revealed-word share of
  the sentence). It's a calm progress cue, not a score.
- When every word has been tapped (or after a "Reveal all" tap), the meter reaches
  100% and a warm line appears: *"You just read your first Chinese sentence."* plus a
  one-tap replay of the whole sentence's audio and the full English translation.
- Primary CTA: **Learn these characters →**. A quiet secondary: **Try another sentence**
  (cycles to a second sentence for the same reason, if one exists).

**4. Learn 3 characters** *(memory-engine taste, NEW, lightweight)*
From the sentence's words, pick up to **3 single-character words** (fallback: the
3 shortest words) and present a frictionless flip taste: hanzi shown → tap **Show** →
pinyin + gloss + audio, then **Got it** advances. No grading, no FSRS math — this is a
taste of the card feel, not a real review. A tiny progress row (● ● ●) shows the three.
Ends on: *"That's 3 words down. Create a free account to keep them and unlock your
first story."* → **Create my account →**.

**5. Signup** *(completion — the ask lands after investment)*
The existing `Auth` signup screen, reached in signup mode. Copy reframed to
*"Save your progress"*. On success, the pre-login prefs (reason) **and** the words the
visitor just tasted are carried into the post-signup onboarding + first session.

### Post-signup (streamlined `Onboarding`)

Today: `level → goal → daily-loop preview → first session`. Changes:

**6. Level** — unchanged tiers (Beginner / Intermediate / Professional + placement
test via `resolveTiers` / `PlacementTest`). For the common beginner case it's one tap.
Keeps the compact branded welcome we already added for the single-language case.

**7. Goal — reframed to an outcome** *(completion + warmth)*
Same three choices (5 / 10 / 15 new words a day) but described by **what they buy**:
e.g. *"Read your first story in ~3 days"* (5), *"~2 days"* (10), *"~1 day"* (15). The
day estimates are derived from the goal and the tier-1 story's new-word threshold
(a pure helper), not hardcoded per option. The underlying `daily_new_cards` write is
unchanged.

**8. First session — continuous with the taste** *(best-effort, low-coupling)*
The learner should feel momentum ("I already started"), not start cold. Mechanism,
kept deliberately simple to avoid fragile plumbing:
- The tasted words are recorded in pre-login storage and read once on onboarding finish.
- Any tasted word that **matches an active row in the Chinese `vocabulary` table** is
  surfaced first in the first session (ordered ahead of the rest). Matching is a simple
  hanzi equality lookup; no new tables, no schema change, no dict RPC.
- Tasted words with **no vocabulary match** are simply acknowledged in copy
  ("you already met 钱 and 多少") — they are *not* forced into the deck. Continuity is the
  goal; exact card injection is not worth new plumbing.
- The session still ends at the existing first-story unlock, unchanged.

### Personalization thread (summary)

`reason` → **starter sentence** theme → **the 3 characters** learned → **encouragement
copy** on the signup + onboarding screens (extends today's `encouragementFor`). Story
selection stays reason-agnostic in v1.

## The starter-sentence dataset

A bundled static asset — the single new "data model," entirely client-side.

**File:** `data/starter-sentences.chinese.json`
**Shape:** keyed by reason, each reason has 1–2 sentences:

```json
{
  "travel": [
    {
      "id": "travel-1",
      "hanzi": "这个多少钱？",
      "translation": "How much is this?",
      "words": [
        { "hanzi": "这个", "pinyin": "zhège", "gloss": "this one" },
        { "hanzi": "多少", "pinyin": "duōshao", "gloss": "how much / how many" },
        { "hanzi": "钱",   "pinyin": "qián",    "gloss": "money" },
        { "hanzi": "？",   "pinyin": "",         "gloss": "", "punct": true }
      ],
      "learn": ["钱"]
    }
  ],
  "family": [ … ], "work": [ … ], "exam": [ … ],
  "culture": [ … ], "curious": [ … ]
}
```

Design rules for the dataset:
- **Real, natural, HSK-1-ish** sentences — short (3–6 words), high-frequency, and
  genuinely useful for that reason. A beginner should plausibly meet these words early.
- **Segmentation is authored** (baked into `words`), so the client needs no segmenter.
  `pinyin` is pre-computed (authoring can use `pinyin-pro`); tone coloring is derived at
  render time from the marks via `toneColor.js`.
- `learn` lists up to 3 single characters/words to feature in step 4. If absent, the
  client falls back to the shortest non-punctuation words.
- `punct: true` marks non-tappable punctuation chips.
- A **`default` reason bucket** exists so an unknown/never-chosen reason still works.

**Audio.** Two-tier, so a missing clip never blocks the moment:
1. **Pre-generated clips** (preferred) — a one-time build script
   `generate-starter-audio.mjs` runs the existing Google-TTS path over every sentence
   and word in the dataset, emitting static files under `public/starter-audio/…` (small,
   fixed set ≈ a few dozen clips). The JSON references them by convention (`id` + word
   index), so no per-clip URL bookkeeping in the data file.
2. **Fallback** — if a clip is missing or fails, use the browser
   `speechSynthesis` `zh-CN` voice. If neither is available (rare), the word still
   reveals pinyin + gloss silently. Audio is an enhancement, never a gate.

Rationale for static + pre-baked over hitting the vocab table: the taste runs
**before** an account exists, must be instant and offline-friendly, and is a tiny fixed
set. A DB/RLS/anon-RPC path would add fragility for no benefit at this size.

## Components & files

**New**
- `data/starter-sentences.chinese.json` — the dataset above.
- `src/starterSentences.js` — pure accessors over the dataset:
  `sentenceForReason(reason, index)`, `charsToLearn(sentence)`,
  `understandPct(sentence, revealedIndexes)` (denominator excludes punctuation chips,
  so revealing every real word reaches exactly 100%), `audioSrcFor(sentenceId, wordIndex)`.
  Pure and unit-tested; no React, no Supabase.
- `src/SentenceTaste.jsx` — the step-3 interactive sentence (word chips, reveal, meter,
  audio, replay, translation reveal). Presentational; takes a sentence object + callbacks.
- `src/CharacterTaste.jsx` — the step-4 three-card flip taste. Presentational.
- `generate-starter-audio.mjs` — one-time build script (mirrors `generate-audio.mjs`),
  emits `public/starter-audio/…`. Guarded so it no-ops without a TTS key.

**Modified**
- `src/Landing.jsx` — hero copy; insert `taste` + `learn` modes into the wizard state
  machine between `why` and `auth`; record tasted words to pre-login storage.
- `src/prelogin.js` — extend stored prefs with `tastedWords` (the ≤3 learned); add/adjust
  `encouragementFor` copy; keep pure helpers unit-tested.
- `src/Onboarding.jsx` — reframe the goal step to outcome copy (pure day-estimate
  helper); on finish, read the tasted words and order any that match Chinese vocabulary
  first in the first session (best-effort, per step 8). No change to the level step
  beyond copy.
- `src/Auth.jsx` — signup-mode heading/subcopy → "Save your progress" framing (copy only;
  no logic change to `signUp`/`handleGoogle`).

Each unit has one job and a clear interface: the dataset is data, `starterSentences.js`
is the pure brain, the two `*Taste.jsx` components are dumb views, and `Landing`
orchestrates. `SentenceTaste`/`CharacterTaste` can be understood and tested without
reading each other.

## Analytics

Extend `analytics.js` `EVENTS` with a pre-signup funnel so we can see where people drop:
`TASTE_SHOWN`, `TASTE_WORD_REVEALED`, `TASTE_COMPLETED` (100%),
`CHARS_TASTE_COMPLETED`, then the existing `PRELOGIN_SIGNUP_STARTED` →
`ONBOARDING_*`. This makes the "does the wow moment convert?" question measurable.

## Error handling & edge cases

- **Unknown / missing reason** → `default` sentence bucket. The flow never dead-ends on
  a reason we don't recognize.
- **Audio unavailable** (no pre-gen clip, no `speechSynthesis`) → silent reveal; pinyin +
  gloss still show. Never blocks progress.
- **Skip the taste** → a quiet "Skip" on the taste + learn steps jumps straight to auth
  (respects impatient users; still counts as a funnel drop we can see).
- **Returning/aborted signup** → pre-login prefs (reason + tastedWords) persist in
  storage and are consumed once on onboarding finish (as today's prefs are), so a
  refresh mid-flow doesn't lose the choice.
- **Deep link straight to `/`** already-authed users skip the whole wizard (unchanged).

## Testing

- **Pure helpers** (`starterSentences.js`, the goal day-estimate, `prelogin` additions)
  — Vitest unit tests: reason→sentence resolution incl. `default` fallback,
  `charsToLearn` incl. the shortest-word fallback, `understandPct` boundaries, audio-src
  convention.
- **Dataset integrity test** — every reason (incl. `default`) has ≥1 sentence; every
  sentence's `words` concatenate back to `hanzi`; `learn` entries exist among the words;
  pinyin present for non-punct words.
- **Component behavior** — light render tests for `SentenceTaste` (revealing a word shows
  pinyin/gloss and ticks the meter; full reveal shows the completion line) and
  `CharacterTaste` (three cards advance to the CTA).
- **e2e (Playwright)** — the pre-signup path: land → pick a reason → reveal the sentence
  to 100% → learn 3 → reach the signup screen. Asserts the wow moment is reachable and
  completable without an account.
- **Build gate** — `npm run build` + full unit suite stay green.

## Rollout

- Ship behind a lightweight flag (e.g. an env/const `WOW_ONBOARDING`) defaulting **on**,
  so it can be flipped off fast if the funnel regresses. The old `why → auth` path
  remains reachable when off.
- The `generate-starter-audio.mjs` run is a one-time content step (like other generation
  scripts); the JSON + committed clips are the durable artifact. Until clips exist, the
  `speechSynthesis` fallback covers audio, so the feature is shippable before the audio
  job runs.

## Open questions (resolved)

- *Where do the sentences come from?* Hand-curated static JSON, pinyin pre-computed,
  audio pre-generated once with a `speechSynthesis` fallback. No runtime LLM/DB.
- *Do tasted words become real cards?* Best-effort: tasted words that match Chinese
  vocabulary are ordered first in the first session (no new plumbing); unmatched words
  are acknowledged in copy only. Continuity is the goal, not exact card injection.
- *Reason-themed first story?* Not in v1 (no topic-tagged stories yet). Reason themes the
  sentence + characters + copy only.
