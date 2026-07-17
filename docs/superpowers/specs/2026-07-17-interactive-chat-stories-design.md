# Interactive chat stories (Phase 4) — design spec

_Date: 2026-07-17 · Status: approved direction, ready to plan_

## Problem

Phase 2 shipped the **observer** chat reader (`ChatReader`): a story read as a
messaging conversation whose bubbles reveal on tap. The roadmap's next chat step
is **interactive** chat stories — the learner *replies inside* the conversation
by choosing the right response to keep it going, so reading a chat becomes doing
one. It builds on the shipped chat reader and reuses the reply-challenge pattern
already proven in `ChatMission` (the Word-to-World mission runner).

## Goal

A chat story where, at the turns the learner plays, the reader pauses and offers
a small set of reply options (one correct, the rest plausible distractors).
Picking the correct reply turns it into the learner's bubble and the conversation
continues; a wrong pick gives a gentle hint and lets them **retry until right**.
It reuses the Phase 1/2 reader engine so word-lookup, `% known`, pinyin, audio,
and finish/mark-read all carry over, and it reuses the Phase 2 bubble thread so
the two chat readers stay visually identical.

## Scope & phasing

- **This spec (Phase 4):** the `InteractiveChatReader` renderer + a shared
  chat-thread extraction + the `buildReplyOptions` helper + a nullable
  `stories.interactions` column + a `🗨️ Reply` badge + a couple authored
  interactive chat stories.
- **Not this spec (future):** *branching* dialogue trees where different choices
  lead to different continuations. Phase 4 is a **linear** conversation with a
  correct reply at each learner turn (the roadmap's "choose the right response to
  keep the conversation going"). No scoring/leaderboards; a simple first-try
  accuracy line on the recap is the extent of it.

## Non-goals (YAGNI)

- No branching / multiple story paths — the conversation is fixed and linear.
- No new reader engine — reuse `useStoryReaderCore` verbatim.
- No changes to `ChatMission` (the mission runner stays as is; interactive chat
  *stories* are a separate reading surface that borrows its reply-option idea).
- No new `presentation` value — an interactive chat story is a `presentation =
  'chat'` story that additionally carries `interactions`.

## Architecture

### Data model — one new nullable column

Add `stories.interactions jsonb` (nullable; existing chat stories are unaffected
and stay observer-only). Shape:

```json
{
  "you": "小明",
  "distractors": {
    "1": [{ "text": "去。我现在在学校。", "pinyin": "Qù. …" }, { "text": "…", "pinyin": "…" }],
    "3": [{ "text": "…", "pinyin": "…" }, { "text": "…", "pinyin": "…" }]
  }
}
```

- `you` — the speaker name the learner plays; their bubbles render on the right.
- `distractors` — keyed by **beat index** (into the `content` lines, same
  indexing the reader core already uses). Only beats spoken by `you` that appear
  here are interactive; **the correct answer is that beat's own `content` text**,
  so the conversation in `content` remains the single source of truth and the
  distractors are the only added data. A `you` beat with no entry just
  auto-reveals as a normal bubble (lets an author make only the meaningful turns
  interactive).

No `presentation` change: `resolvePresentation` still returns `'chat'`. The
dispatcher decides observer-vs-interactive from `interactions`.

### Dispatch

`src/StoryReader.jsx` gains one line, before the existing chat branch:

```js
if (mode === 'chat' && props.story.interactions) return <InteractiveChatReader {...props} />
if (mode === 'chat') return <ChatReader {...props} />
```

### Extract the shared thread (the DRY move)

`ChatReader` and `InteractiveChatReader` render the identical bubble thread
(speaker-sided bubbles, narration lines, per-word tap lookup, auto-scroll to the
newest bubble). Extract that into a new **`ChatThread`** component
(`src/ChatThread.jsx`) that takes `{ beats, sides, skin, theme, accent, userCards,
onSelectWord }` and renders the revealed bubbles. `ChatReader` is refactored to
consume it (its Phase 2 e2e is the safety net); `InteractiveChatReader` consumes
the same component, so the two readers can never drift visually. Side assignment
stays with each reader: observer uses `assignSpeakerSides`; interactive forces
`you` → right, everyone else → left.

### `buildReplyOptions` (pure, tested)

New pure helper `src/interactiveChat.js`:

```
buildReplyOptions(correctText, correctPinyin, distractors, seed)
  → { options: [{ text, pinyin, correct }], correctIndex }
```

Combines the correct reply with its distractors and returns them in a **stable
shuffle** (deterministic by `seed` — e.g. the beat index — so a re-render doesn't
reshuffle mid-attempt, matching `ChatMission`'s `shuffleStable`). `correctIndex`
is where the correct option landed.

### InteractiveChatReader presentation

- **Launch:** shared `<ReaderLaunch>` (cover kicker + `% known` + Start).
- **Thread:** `<ChatThread>` with revealed beats; `you` bubbles on the right.
- **Them turns:** tap the thread to reveal the next beat (same as observer).
- **Your turns (interactive beat):** the thread stops at the previous beat and a
  **reply panel** slides up from the bottom with the shuffled options
  (`buildReplyOptions`), rendered as tappable buttons (adapting `ChatMission`'s
  option-button styling, incl. pinyin under each). On tap:
  - **wrong** → the button shakes and dims red with a gentle "not quite" hint;
    the panel stays and the learner retries (skipped under
    `prefers-reduced-motion`, which just marks it red). Each miss on a beat is
    counted for the recap.
  - **correct** → the option animates into a `you` bubble appended to the thread,
    the panel dismisses, and the reader advances to the next beat.
- **Words + audio + finish:** word-tap lookup works on every revealed bubble;
  audio read-along plays the revealed conversation; reaching the end runs the
  shared `<FinishOverlay>`, extended with a **first-try accuracy** line
  ("You replied N/M on the first try"). Mark-read/XP is the shared core's,
  unchanged.
- **A11y:** the reply panel is a labelled group of buttons; a stable
  `aria-live` region announces the newest revealed bubble and the "not quite"
  hint.

### Story list

An interactive chat story shows a **`🗨️ Reply`** badge on its card (when
`story.interactions` is present), beside the existing `💬 Chat` / `🎬 Scene`
badges, so the format is discoverable.

## Content

Author **~2 Chinese interactive chat stories at HSK 1–2** in the existing
authored lane:

- Rows with `presentation: 'chat'` + an `interactions` object; `content` is the
  full conversation, and 2–4 of the `you` turns carry 1–2 distractors each.
- Distractors should be *plausible* (in-level vocab, grammatically fine, but
  wrong for the context) so the choice teaches.
- `authored-stories.mjs` passes `interactions` through on insert (it currently
  doesn't set it — add the field, like `presentation` in Phase 2).
- The e2e mock gets one `interactions` chat-story fixture so the renderer is
  testable without the pipeline.

## Testing

- **Unit (`src/interactiveChat.test.js`):** `buildReplyOptions` — the correct
  option is present and flagged; distractors included; the shuffle is stable for
  a given seed and varies across seeds; `correctIndex` points at the correct
  option; empty-distractors returns just the correct option.
- **E2E (Playwright, mock backend):** open the interactive fixture → Start →
  reveal a *them* bubble → a `you` turn shows the reply panel → tapping a wrong
  option shows the hint and does **not** advance → tapping the correct option
  appends the `you` bubble and advances → reach the end → recap shows the
  accuracy line. Confirm the observer chat e2e and paced/scene e2e still pass
  after the `ChatThread` extraction (no regression).
- Build + lint clean; real-component visual check (reply panel, shake animation,
  light/dark) via the throwaway-harness pattern.

## Rollout

Ship `InteractiveChatReader` + `ChatThread` + `buildReplyOptions` + the
`interactions` column with the ~2 authored interactive stories. Interactive is
opt-in per story (a chat story with `interactions`), so the rest of the library
— including observer chat stories — is unaffected. This completes the story
format set: **Paced · Chat · Scene · Interactive Chat**. Branching dialogue is a
possible future spec.

Update `ROADMAP.md`: move **Interactive chat stories** from 🔜 Next → ✅ Shipped.

## Open questions

1. Reply-panel option style — plain buttons (lean) vs `ChatMission`'s
   word-tile builder. Start with buttons; revisit if authors want tile-building.
2. Distractor count — 1–2 per turn (3 total options max) reads cleanly on
   mobile; tune during the visual check.
3. Whether to auto-advance to the next *them* bubble after a correct reply, or
   require a tap — lean auto-advance the single following beat, then tap to
   continue; confirm in the visual check.
