# Word-by-word read-along — design

**Date:** 2026-07-23
**Status:** Approved, ready for an implementation plan
**Roadmap item:** *Read more, read deeper → "Word-by-word read-along — each word
lights up as it's spoken, and you can tap any word to start the audio from there
(with speed control)."*

## Problem

Story narration exists and is good (10,522 Azure clips, one per line). But while a
story reads aloud, the reader highlights only the **whole current line**. A learner
who loses the thread mid-line has no way to see where the voice is, no way to
restart from a particular word, and — in the four fixed-format readers, including
the default one — no way to slow the audio down.

The classic scroll reader has a speed cycle (`RATES = [0.6, 0.85, 1.1]`). The paced,
chat, scene and interactive-chat readers, which share `useStoryReaderCore`, have
none. Paced is the default presentation, so most learners have no speed control at
all.

## Scope

The **four readers built on `useStoryReaderCore`**: `PacedReader`, `ChatReader`,
`InteractiveChatReader`, `SceneReader`. They share `TokenBody` from
`ReadingScaffold.jsx` and one audio element, so this is a single implementation.

The classic scroll reader (`StoryReaderImmersive.jsx`, 1,405 lines) is **out of
scope**: it is an opt-in preference for paced stories, it already has a speed
control, and its token rendering is a private duplicate of the shared one. Bringing
it in means collapsing that duplication first — a separate, larger change.

## Behaviour

### The highlight

While read-along is running, the word being spoken is **spotlit**: the rest of the
line drops to ~45% opacity while the spoken word stays at full opacity and steps up
to `fontWeight: 700` (from the line's default 500).

Deliberately **not a new colour**. The current line already spends its colour
channel on word status (accent tint = not started, amber = learning); a third
colour turns a calm line into a traffic light. Focus-dimming is also the idiom the
app already uses for tap-to-focus in the classic reader, so it reads as the same
language rather than a new one. Status tints stay visible underneath the spotlight.

The highlight applies to the beat currently sounding — which is `cur`, since
`speakFrom` already sets it. No second notion of "which line is playing" is
introduced.

### Tap-a-word

- **While playing** — tapping a word in the line being read seeks the audio to that
  word and keeps reading. The highlight snaps there immediately.
- **While paused** — tapping a word opens the lookup sheet, exactly as today.

In the **chat readers** — the only ones that keep earlier beats on screen — words in
previously revealed bubbles stay tappable-for-lookup even while playing. A tap there
is unambiguously "what does that mean", not "rewind the conversation to there".
Paced and scene show one beat at a time, so the question does not arise for them.

This is a modal gesture and that is a deliberate, accepted trade: someone who hears
an unfamiliar word mid-playback and taps it gets a replay rather than a definition,
and must pause first. It was chosen over a `Read from here` button in the lookup
sheet because it matches how listening actually feels and is what the roadmap
promises.

### Speed control

A **Speed** row joins the existing Reader settings panel (the `Sliders` popover /
bottom sheet): **0.6× / 0.8× / 1×**, defaulting to **1×** so no existing learner's
audio silently slows.

Persisted to the existing `reader:prefs` IndexedDB object as `playbackRate`, via
the same merged read-modify-write that `furiganaMode` uses — writing one field must
never clobber the classic reader's `lens` / `serif` / `showEnglish` /
`seenFocusHint` flags.

`playbackRate` resets to `defaultPlaybackRate` when a new `src` loads, so both are
set on every clip.

## The timing model

### Why estimation is viable

`segmentLine` tokens **tile the line exactly** — every character belongs to exactly
one token, in order, so `tokens.map(t => t.text).join('') === line`. That, plus
Mandarin's one-character-≈-one-syllable regularity, is what makes proportional
timing work without word-boundary data.

### How a timeline is built

- Each token gets a **weight**: 1.0 per Han character or kana. For space-delimited
  languages (Russian, latin), 1.0 per run of consecutive vowel letters, with a
  minimum of 1.0 per word so a vowel-less token is never zero-width.
- Punctuation carries weight 0 but contributes a **pause**: ~0.5 of a syllable for
  `、` `，` and ~1.0 for `。` `！` `？` and ellipses.
- The clip's **real duration** comes from the `<audio>` element on `loadedmetadata`.
  Explicitly **not** `tts_audio.duration_ms`, which stores the synthesis round-trip
  time and would be actively wrong.
- Named `LEAD_IN_MS` / `TAIL_OUT_MS` constants absorb the silence Azure leaves at
  the clip edges; the remainder is distributed across the weights.

### Accuracy

Story lines are short (~10–20 characters), so accumulated drift stays well under a
syllable. Accuracy is lowest on lines mixing scripts or heavy with proper nouns.

### Phase 2 (documented, not built)

Azure's batch-synthesis REST API (`wordBoundaryEnabled`) returns per-word offsets.
Money cost is trivial (~$0.25 for every story line), but it is a new synthesis path,
a schema change, an owner-run regeneration, and offset→token mapping work. The
`buildTimeline` return shape is the seam: exact spans can replace estimated ones
with no change to the readers.

## Architecture

### New pure module — `src/readAlong.js`

All logic, no React, following `storyReading.js` / `stuckWord.js`.

```
buildTimeline(tokens, { durationMs, language })  → { spans: [{start, end}], … } | null
tokenAtTime(timeline, ms)                        → token index | -1
startOfToken(timeline, i)                        → ms
```

Plus the constants `LEAD_IN_MS`, `TAIL_OUT_MS`, `PAUSE_WEIGHTS`, `SPEED_RATES`.

`buildTimeline` returns `null` rather than throwing when a timeline cannot be
formed. That is the entire degradation story: no timeline → no highlight → today's
behaviour.

### Data flow

One direction, one owner:

```
<audio>  (owned by useStoryReaderCore)
  ├─ loadedmetadata → buildTimeline(beat.tokens, el.duration)
  └─ rAF tick       → tokenAtTime(currentTime) → setActiveToken (only on change)
                        └─ prop → PacedReader / SceneReader / ChatThread → span style
```

`useStoryReaderCore` gains `activeToken`, `rate`, `setRate`, `seekToToken(i)`.
`setActiveToken` fires only when the index actually changes, so a 60 Hz ticker does
not cause 60 renders a second.

### Components

- **`ReadingScaffold.jsx`** — gains the Speed row in `ReadingSettings`, and exports
  `tokenSpotlightStyle(...)` so the three render sites share one treatment instead
  of three copies that drift. `TokenBody` itself is unchanged.
- **`PacedReader.jsx` / `SceneReader.jsx`** — pass `activeToken` for the current
  beat; a word's `onClick` becomes *playing → `seekToToken(k)`, else →
  `selectWord(...)`*.
- **`ChatThread.jsx`** — new `activeToken` / `onSeekToken` props, applied to the
  bubble at `activeIndex`.
- **`ChatReader.jsx` / `InteractiveChatReader.jsx`** — thread those two props
  through from the core.

### Rejected alternatives

- **CSS keyframe sweep across the line** — breaks on wrapped lines, fights
  reduced-motion, and needs DOM measurement.
- **Per-word audio sprites** — multiplies the clip count by ~8 and re-opens TTS
  spend for something estimation already handles.
- **A `useReadAlong` hook wired separately by each reader** — four call sites to
  keep in step, for no separation the core hook does not already provide.

## Failure handling

| Situation | Behaviour |
|---|---|
| No clip (browser-speech fallback) | No word highlight; reader behaves as today |
| `el.duration` is `NaN` / `Infinity` / 0 | Wait for `durationchange`; if it never resolves, no highlight |
| Blob-fallback path swaps `el.src` and re-fires metadata | Timeline rebuild is keyed to the current `runRef` id, so a stale load cannot repaint a newer beat |
| Seek requested before metadata | Ignored |
| Timeline is `null` | Dimming never engages — a failed timeline must not leave a line greyed out |
| Reader unmounts / playback stops | rAF loop torn down, or it leaks past the reader |

Reduced motion: the highlight is a discrete state change, not motion, so it still
applies — but without a transition.

## Testing

**Unit — `src/readAlong.test.js`**

- Weights per script (Han, kana, latin).
- Punctuation contributes a pause and zero width.
- Spans are strictly increasing, non-overlapping, and span lead-in → duration−tail.
- `tokenAtTime` at exact span boundaries, before the lead-in, and past the end.
- Degenerate inputs — empty tokens, punctuation-only line, duration `0` / `NaN` —
  all return `null`.
- One real HSK story line as a snapshot.

**Unit — prefs merge:** writing `playbackRate` must not clobber `furiganaMode`,
`lens`, `serif`, `showEnglish` or `seenFocusHint`.

**Playwright — `tests/e2e/reader.spec.js`**

- Highlight appears on play, clears on pause.
- Speed chips render and `aria-pressed` flips.
- Tap-a-word while playing does **not** open the lookup sheet; while paused it does.

> **Known risk:** the e2e mock has no real audio fixture. If a clip cannot be loaded
> under CI, the *moving*-highlight assertion stays at unit level and e2e covers only
> the tap-mode switch and the controls. Decide this early in implementation rather
> than mid-way.

**Manual — the acceptance test that matters:** a real story on desktop and on a
phone, judging drift by ear across paced, chat and scene.

## Files

**New:** `src/readAlong.js`, `src/readAlong.test.js`

**Modified:** `src/useStoryReaderCore.js`, `src/ReadingScaffold.jsx`,
`src/PacedReader.jsx`, `src/SceneReader.jsx`, `src/ChatThread.jsx`,
`src/ChatReader.jsx`, `src/InteractiveChatReader.jsx`, `tests/e2e/reader.spec.js`

**No migration, no schema change, no server-side work.**

## Out of scope

- The classic scroll reader (`StoryReaderImmersive.jsx`).
- Exact Azure word boundaries — Phase 2 above.
- The highlight during single-line replay (`replayLine`) and during the interactive
  reply gate. Both can adopt the same helper later; neither is part of read-along.
