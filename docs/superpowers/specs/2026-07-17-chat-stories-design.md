# Chat-format stories (Phase 2) — design spec

_Date: 2026-07-17 · Status: approved direction, ready to plan_

## Problem

Phase 1 shipped the Paced Reveal reader (one line at a time). The reader
redesign's north star was more *formats* so stories feel like an experience,
not a page of text. Phase 2 adds the **chat format**: read a story as a
messaging conversation that unfolds one bubble at a time.

## Goal

A story can be presented as an **observer chat** — the learner reads a
conversation *between characters* (e.g. 小明 and 朋友) as chat bubbles that
reveal on tap. Pure graded reading in a messenger skin; it reuses the Phase 1
reader engine so word-lookup, `% known`, audio read-along, and finish/mark-read
all carry over. It is deliberately distinct from the existing interactive
`ChatMission` (which is a mission with reply challenges and comprehension
questions).

## Scope & phasing

- **This spec (Phase 2):** the `ChatReader` renderer + a shared reader-core
  extraction + a few new authored chat stories.
- **Not this spec (future, on the roadmap):** *Interactive* chat stories where
  the learner chooses the correct reply to continue. Phase 2 is observer-only —
  no "you" bubbles, no reply choices, no comprehension questions.

## Non-goals (YAGNI)

- No learner participation / reply selection (future roadmap item).
- No new DB columns beyond the already-existing `stories.presentation` value
  `'chat'`.
- No changes to `ChatMission` (the Word-to-World mission runner) — it stays as
  is; chat *stories* are a separate reading surface.
- No "typing…" AI simulation — the typing indicator (below) is a short fixed
  visual shimmer, not real generation.

## Architecture

### One content model, a third renderer

Reuses the Phase 1 dispatcher exactly. `resolvePresentation` already returns
`'chat'` for a story with `presentation === 'chat'`; the dispatcher
(`src/StoryReader.jsx`) currently falls that through to the classic reader.
Phase 2 adds `if (mode === 'chat') return <ChatReader {...props} />`.

No data-model change: chat stories are ordinary rows with
`presentation = 'chat'`, `content` = the usual newline `Speaker：text` lines
(narration lines have no speaker label).

### Extract a shared reader core (the DRY move)

`PacedReader` and `ChatReader` share almost all non-visual behavior. Extract it
from `PacedReader` into a hook **`useStoryReaderCore(props)`** (new file
`src/useStoryReaderCore.js`) that owns:

- **Beats:** parse `story.content` → `[{ speaker, text, tokens }]` via
  `splitSpeaker` + `segmentLine` (memoized on `buildVocabMatcher`).
- **Readability:** `calculateStoryReadability` → `% known` + counts.
- **Progression:** `cur`, `started`, `done`; `advance()` / `finish()` (the
  once-guarded mark-read: online → `story_reads` upsert + `awardXp`; offline →
  `enqueueStoryRead({ xpDelta })`; plus `STORY_COMPLETED` / `FIRST_STORY_COMPLETED`
  analytics — moved verbatim from the Phase 1 `PacedReader.finish`).
- **Audio read-along:** `playing`, `runRef`, `speakFrom`, `stopPlay`,
  `togglePlay` (verbatim from `PacedReader`), including the story-MP3 →
  speech-synth fallback.
- **Word lookup:** `selected`, `selectWord`, `addToDeck` (verbatim).
- **Reading toggles:** pinyin/reading + translation flags.

The hook returns state + handlers; **presentation stays in the components**:
`PacedReader` renders the focus-flow stage, `ChatReader` renders the bubble
thread. `PacedReader` is refactored to consume the hook (behavior unchanged —
its Phase 1 e2e suite is the safety net). This is the engine/renderer split the
Phase 1 spec anticipated; doing it now, with two real consumers, is when it
earns its keep (vs. duplicating ~150 lines).

### ChatReader presentation

- **Launch screen:** same as Paced (cover kicker + title, `% known`, one-tap
  **Start**, classic-scroll fallback link) — a small shared launch sub-component
  is reasonable, or each renderer keeps its own; the plan decides.
- **Bubble thread (tap-to-reveal):** revealed beats render newest-last in a
  scrolling thread. Each **speaker line is a bubble**; each distinct speaker gets
  a stable **side** (first speaker seen → left, second → right) and a color/skin
  from `chatStyleFor(language)` + the existing speaker palette. **Narration
  lines** (no speaker) render as a centered muted "system" line. The thread
  auto-scrolls to keep the newest bubble in view.
- **Reveal:** tapping the thread (or `→`/Space, or **Play**) reveals the next
  beat. Before a *character* bubble appears, show a brief **"typing…" shimmer**
  (~500ms, skipped under `prefers-reduced-motion` and during Play). A slim
  `n / total` progress indicator (reused).
- **Words + audio + finish:** tapping a word in any revealed bubble opens the
  shared lookup sheet; **Play** reveals + reads each bubble aloud (read-along
  highlight on the newest bubble); reaching the end runs the shared finish/recap.
- **Authoring guidance:** chat stories should use **two speakers** for clean
  left/right; 3+ speakers still render (distinct colors, sides alternate by
  speaker index) but read best with two.

### Story list

Chat stories appear in the existing library next to paced ones. Add a small
**format badge** ("💬 Chat") on the story card when `story.presentation === 'chat'`
so the format is discoverable. (Paced stays unbadged as the default.)

## Content

Author **~3 Chinese chat stories at HSK 1–2** in the existing Claude-authored
lane:

- New entries in `data/authored-stories.json` with `"presentation": "chat"`,
  two speakers, short natural exchanges using in-level vocabulary.
- `authored-stories.mjs` must pass `presentation` through on insert (it currently
  doesn't set it, so rows default to `'paced'`); add the field to the insert.
- These are seeded via the existing authored-stories pipeline (run by the user
  with their keys, like other content); the e2e mock gets one chat-story fixture
  so the renderer is testable without the pipeline.

## Testing

- **Unit:** a pure helper for bubble **side/color assignment** by speaker
  (`assignSpeakerSides(beats)` → map speaker → { side, color }) — deterministic,
  tested. The extracted `useStoryReaderCore` is exercised through the component
  e2e (it's a hook, not pure), but the beat-parsing it delegates to
  (`segmentLine`, `calculateStoryReadability`) is already unit-tested.
- **E2E (Playwright, mock backend):** add a `presentation:'chat'` story fixture;
  assert open → launch → Start → first bubble → tap reveals the next bubble
  (progress advances) → tap a word opens the sheet → reach the end → finish
  overlay. Confirm the Paced reader's existing e2e still passes after the core
  extraction (no regression).
- Build + lint clean; real-component visual check (bubble thread, typing
  shimmer, light/dark) via the throwaway-harness pattern.

## Rollout

Ship the `ChatReader` + the core extraction with the ~3 authored chat stories.
Because chat is opt-in per story (`presentation='chat'`), the rest of the
library is unaffected. The interactive-reply evolution is a separate future
spec.

## Open questions

1. Shared launch screen: extract a `<ReaderLaunch>` sub-component used by both
   renderers, or keep each renderer's own launch markup? (Lean: extract — it's
   identical; the plan can decide if it's cheap.)
2. Typing-indicator duration/curve — tune during the visual check (start ~500ms).
3. Group chats (3+ speakers): Phase 2 renders them but authoring targets two
   speakers; revisit a dedicated group-chat layout later if authored content
   needs it.
