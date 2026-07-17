# Paced Reveal reader — design spec

_Date: 2026-07-17 · Status: approved direction, ready to plan_

## Problem

The story reader presents a whole story as one page of text. Two learner
complaints (ranked C then D in brainstorming):

- **C — the text is intimidating.** A full page of hanzi reads as a wall; it's
  hard to keep your place and hard to feel progress.
- **D — it feels static.** It reads like a textbook page, not an experience.

Secondary goal from the same conversation: **make it easier to _start_** a
story — lower the friction between "open story" and "reading".

## Goal

Reimagine _how a story is presented_ without changing what a story is. The
reading should feel guided, digestible, and finite: one line at a time, easy to
begin, with the reader's existing learning tools intact.

## Scope & phasing

One content model, multiple **presentation modes**. A story declares its mode; a
dispatcher renders it. All modes share the same story data (lines, speakers,
pinyin/reading, translations, per-line audio, vocab) and the same learning
surface (word-lookup, reading toggles, Learning Lens, % known, add-to-deck,
finish/recap).

- **Phase 1 (this spec): framework + Paced Reveal.** `presentation = 'paced'`
  becomes the default for every existing text story — the whole library gets the
  upgrade with zero new content.
- **Phase 2 (future, separate spec): Chat mode + new authored chat stories.**
  `presentation = 'chat'`. These are _new_ stories written for the format, not
  conversions of existing ones.
- **Phase 3 (future, separate spec): Visual-Novel / Scene mode.**
  `presentation = 'scene'`, for stories that carry scene images.

This spec covers **Phase 1 only**. Phases 2–3 are recorded so the architecture
stays extensible; they are not built here.

## Non-goals (YAGNI)

- No new story content in Phase 1 (Paced Reveal runs on the existing library).
- No branching/interactive-choice stories.
- No changes to FSRS, vocabulary, unlock/tier logic, or the story list screen.
- No new audio pipeline — Paced Reveal reuses the existing per-line story audio
  and the browser speech-synthesis fallback.
- Chat and Scene renderers are not implemented in Phase 1.

## Architecture

### Data model

Add one nullable column to `stories`:

- `presentation text not null default 'paced'` — one of `'paced' | 'chat' |
  'scene'`. A DB migration adds the column defaulting to `'paced'`, so every
  existing story is Paced with no backfill. A `classic` value is **not** stored;
  classic scroll is a per-user viewing preference, not a story property.

No other schema changes. Chat/Scene will add their own optional columns in their
own specs (e.g. a `scene_image_path`), not now.

### Component decomposition

`StoryReaderImmersive.jsx` is ~1440 lines and mixes data loading, the word
engine, audio, and presentation. Split so presentation is swappable:

- **`storyEngine` (hook/module, extracted from today's reader):** owns the
  shared, mode-independent concerns — tokenization + word matching, the word
  lookup sheet state, reading toggles (pinyin/furigana, translation, Learning
  Lens), % known computation, add-to-deck, per-line audio playback + read-along
  run state, finish/mark-read + XP, comprehension questions. Exposes a clean
  interface the renderers consume. This is a refactor of existing logic, not new
  behavior.
- **`ReaderDispatcher`:** reads `story.presentation` (and the user's classic
  preference) and renders the matching presentation component, passing the
  engine down.
- **`ClassicReader`:** today's continuous-scroll rendering, moved out of the
  monolith mostly as-is (the already-decluttered chrome + token flow). Used when
  the user prefers classic, and as the guaranteed fallback.
- **`PacedReader`:** the new Phase-1 presentation (below).

The engine/renderer split is what makes Chat and Scene drop-in later: they are
new renderer components over the same engine.

## Paced Reveal — presentation spec

### Launch screen (per story)

The first thing shown when a Paced story opens — its job is to make starting
trivial and the story feel finite.

- Cover (existing `image_path` if present, else a calm branded panel).
- Kicker (`levelLabel`), title (serif book font), and the existing quiet
  `% known` strip (thin tri-color rail + `N known · N learning · N new`).
- The existing "N words from today appear here" note when relevant.
- **Primary action: one large "Start reading" button** (sage, matching the app's
  primary CTA) that drops straight into the first beat.
- A secondary text link: **"Read as classic scroll"** — switches to
  `ClassicReader` and remembers the choice (see Preferences).

### The beat flow

The core interaction. A "beat" is one content line (the existing
newline-split + `splitSpeaker` unit already used for audio).

- **Focus flow:** the active beat is fully lit; already-read beats recede above
  (dimmed, still crisp); upcoming beats fade and blur below by distance. The
  active beat sits at ~40–45% of the reading area; advancing eases the column
  upward (a teleprompter-like transition). Never a wall of text.
- **The active beat shows:** speaker label (accent, when the line has one), a
  single clean **pinyin/reading line above** (toggle), the sentence, and the
  **translation below** (toggle). Per-word ruby is _not_ used in Paced mode — the
  reading is one calm line, which also addresses the "crowded annotations"
  critique. Word status (new/learning) is still shown as the subtle
  box/underline on tappable words within the active line.
- **Advancing:** tap/click anywhere on the stage · swipe left · `→`/`Space` ·
  the Next control · or **Play** (auto-advance). Back: swipe right · `←` · Prev.
- **Play (read-along):** plays the active beat's audio (existing per-line story
  MP3 when `has_audio`, else speech-synthesis fallback) and auto-advances on
  end; the active beat is the read-along highlight. Pause stops. Rate reuses the
  existing reader rate control.
- **Progress:** a slim top bar + `n / total` counter (tabular-nums) so remaining
  length is always visible — the story feels achievable.
- **Word lookup:** tapping a word in the active beat opens the existing lookup
  sheet (reading, meaning, audio, add-to-deck, status). Only the active beat is
  interactive (others are `pointer-events: none`), so a stage-tap that isn't on a
  word advances.
- **Finish:** after the last beat, show the existing finish path (mark read, XP,
  recap hand-off). Reaching the end is what marks the story read (same rule as
  today).

### Preferences & fallback

- A durable pref `reader:mode = 'paced' | 'classic'` (default `paced`), stored in
  the existing reader-prefs store. "Read as classic scroll" sets `classic`; a
  setting in the reader settings panel flips back. Chat/Scene stories ignore this
  (they are authored in their format); it only chooses Paced vs Classic for
  `paced` stories.
- Classic scroll remains fully supported — never removed — for preference and as
  the accessibility-safe fallback.

### Accessibility

- Full keyboard operation (arrows/space/enter; visible focus rings).
- `prefers-reduced-motion`: no translate/blur transitions — beats swap plainly
  and past/future are conveyed by opacity only.
- The active beat is an `aria-live="polite"` region (or announced on change) so a
  screen reader reads each new line; controls have labels.
- Respects existing theme tokens (light/dark).

## Analytics

Reuse existing event infra. Add: `story_started` (mode), `story_beat_advanced`
(index — sampled/first-only to avoid spam), `story_mode_switched_to_classic`,
alongside the existing story-finish event. Used to see whether Paced improves
start-rate and completion vs classic.

## Testing

- **Unit:** the extracted `storyEngine` pure bits (tokenization/word-match,
  %-known, beat splitting) get direct tests; the current behavior must be
  preserved by the refactor (characterization tests where practical).
- **E2E (Playwright, mock backend):** seed one `paced` story; assert the launch
  screen → Start → first beat; advancing changes the active beat and progress
  counter; tapping a word opens the lookup sheet; reaching the end shows finish;
  "Read as classic scroll" renders the classic view. (Requires adding a stories
  fixture to the mock — reusable for future reader tests.)
- Build + lint clean; real-flow visual check via the preview harness pattern.

## Rollout

Ship Paced as the default for all `paced` stories (the whole library) behind the
classic-scroll escape hatch. No content migration. Phases 2–3 add renderers +
content later without touching Phase 1.

## Open questions

1. Auto-advance default rate/dwell for Play (reuse the reader's current rate set?).
2. Should the launch screen be skippable via a "remember, don't show the launch
   screen again" pref for power users, or always shown? (Lean: always shown — it
   is the low-friction entry point; revisit if users ask.)
3. Beat granularity for very long sentences — split on internal punctuation, or
   always one line = one beat? (Lean: one line = one beat in Phase 1; revisit.)
