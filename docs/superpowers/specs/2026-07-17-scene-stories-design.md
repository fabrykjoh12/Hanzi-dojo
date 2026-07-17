# Scene-format stories (Phase 3) — design spec

_Date: 2026-07-17 · Status: approved direction, ready to plan_

## Problem

The reader redesign's north star is more *formats* so stories feel like an
experience, not a page of text. Phase 1 shipped **Paced Reveal** (focus-flow,
one line at a time) and Phase 2 shipped **Chat** (a messenger conversation).
Phase 3 completes the trio with the **scene format**: read a story as an
illustrated **picture-book** — each beat is a big friendly image paired with one
short line — so a beginner sees a page that looks approachable, not a wall of
characters.

## Goal

A story can be presented as a **scene / picture-book**: each line reveals as a
large centered **emoji illustration** above a short text card, one tap at a time.
It reuses the Phase 1 reader engine so word-lookup, `% known`, audio read-along,
and finish/mark-read all carry over. It is deliberately narrative (not dialogue):
where chat is two speakers trading bubbles, a scene story is a narrator painting
a picture one beat at a time.

## Why emoji, not real illustrations

The app has **no image pipeline**: `stories.image_path` exists as a single-cover
column but every authored story leaves it null, and there is no
generation/moderation/storage path for per-beat art. Real illustrations would be
a multi-week project of its own (generation, moderation, Supabase storage, cost,
and — like the TTS pipeline — it can't run autonomously without the owner's API
keys). Emoji give the picture-book payoff **now**, on the existing engine, with
zero new infrastructure: they are Unicode text, render everywhere, are
theme-independent, and are trivially authorable inline. Real illustrated art
remains a possible future evolution as its own spec; it is explicitly out of
scope here.

## Scope & phasing

- **This spec (Phase 3):** the `SceneReader` renderer + a pure `splitScene`
  helper + a per-beat `emoji` on the shared reader core + a few authored scene
  stories + a story-card badge + one e2e fixture.
- **Not this spec (future):** real AI-generated illustrations (per-story or
  per-beat), an image pipeline, animated scenes. Those are a separate project.

## Non-goals (YAGNI)

- No image generation / storage / moderation pipeline.
- No new DB columns — `presentation = 'scene'` already exists.
- No per-beat art assets; the "illustration" is a single emoji per line.
- No changes to the Paced or Chat readers beyond the tiny shared-core addition
  (the per-beat `emoji`, which is a no-op for non-scene stories).

## Architecture

### One content model, a fourth renderer

Reuses the Phase 1/2 dispatcher exactly. `resolvePresentation` already returns
`'scene'` for a story with `presentation === 'scene'` (it is in the known-set and
the DB column). The dispatcher (`src/StoryReader.jsx`) currently falls `'scene'`
through to the classic reader; Phase 3 adds, alongside the existing chat branch:

```js
if (mode === 'scene') return <SceneReader {...props} />
```

No data-model change. Scene stories are ordinary rows with
`presentation = 'scene'` and `content` = newline lines, each line optionally
prefixed with a leading emoji (see Authoring).

### The `emoji` per beat (shared-core addition)

`useStoryReaderCore` parses `story.content` into beats
(`{ speaker, text, tokens }`). Phase 3 adds an **`emoji`** field to each beat.
The extraction is gated on the story being a scene story, so Paced and Chat are
untouched:

- New pure helper **`splitScene(line) → { emoji, text }`** in a new file
  `src/sceneReading.js`. It pulls a **leading emoji run** (one grapheme:
  `\p{Extended_Pictographic}` plus trailing variation selectors / skin-tone
  modifiers / ZWJ-joined sequences) off the front of `line`, plus the single
  space that follows it, and returns the emoji (or `''`) and the remaining text.
  If the line has no leading emoji, `emoji` is `''` and `text` is the line
  unchanged.
- In `useStoryReaderCore`, when `story.presentation === 'scene'`, each raw line
  is first passed through `splitScene`; the extracted `emoji` is stored on the
  beat and **only the remaining `text`** is handed to `splitSpeaker` +
  `segmentLine` (so the emoji is stripped before tokenization — it never becomes
  a tappable non-vocab token and never counts toward `% known` /
  `calculateStoryReadability`). For non-scene stories the emoji is always `''`
  and the line flows through unchanged (behavior identical to today).

The readability calculation in the core already runs over the beat text; because
the emoji is stripped from `text` for scene stories, `calculateStoryReadability`
sees only the real language content. (If it is easier to keep the core's
readability call over raw content, the plan may instead strip scene emoji in a
small pre-pass — the requirement is only that emoji never count as vocabulary.)

### SceneReader presentation

- **Launch screen:** shared `<ReaderLaunch>` (cover kicker + title, `% known`,
  one-tap **Start**). The classic-scroll fallback link is already hidden for
  fixed formats (chat/scene) by `ReaderLaunch`.
- **Scene stage (tap-to-advance):** the current beat renders as a large centered
  **emoji** (~72px, `aria-hidden` — it is decoration) above the text in a soft
  rounded card. Tapping the stage (or `→` / Space / **Play**) advances to the
  next scene. A slim `n / total` progress indicator and a thin progress bar
  (reused from the paced reader's chrome) sit at the top.
- **Narrative, theme-aware:** scene stories are narrator-voiced; a line usually
  has no speaker. If a line *does* have a speaker (`Name：text`), show the name
  as a small caption above the card. The reader uses the language accent +
  `var(--…)` theme tokens and works in light/dark (unlike chat's fixed messenger
  skin).
- **Reveal transition:** a gentle cross-fade / slight rise between scenes,
  skipped under `prefers-reduced-motion`.
- **Words + audio + finish:** tapping a word in the current scene opens the
  shared `<WordLookupSheet>`; **Play** advances + reads each scene aloud
  (read-along highlight on the current line); reaching the end runs the shared
  `<FinishOverlay>` (mark-read handled once by the core).
- **Toggles:** pinyin/reading **and** English toggles (chips reused from the
  paced reader). Scenes are narrative, so a line-parallel English translation is
  useful — unlike chat, which deliberately had none.
- **A11y:** one stable `aria-live="polite"` region announces the current scene's
  text (the pattern Phase 1/2 settled on). The emoji is `aria-hidden`.

### Story list

Scene stories appear in the existing library next to paced and chat ones. Add a
small **format badge** (`🎬 Scene`) on the story card when
`story.presentation === 'scene'`, beside the existing `💬 Chat` badge. (Paced
stays unbadged as the default.)

## Content

Author **~3 Chinese scene stories at HSK 1–2** in the existing Claude-authored
lane:

- New entries in `data/authored-stories.json` with `"presentation": "scene"`,
  each `content` line prefixed with a leading emoji + space (e.g.
  `🌧️ 今天下雨了。`), short narrative lines using in-level vocabulary.
- Because scenes are narrative and benefit from the English toggle, each scene
  story carries a **line-parallel `english_content`** (one English line per
  `content` line — the emoji is Chinese-side only; English lines are plain).
- `authored-stories.mjs` already passes `presentation` through on insert
  (added in Phase 2) — no change needed there.
- Seeded via the existing authored-stories pipeline (run by the owner with their
  keys); the e2e mock gets one scene-story fixture so the renderer is testable
  without the pipeline.

## Testing

- **Unit (`src/sceneReading.test.js`):** `splitScene` — leading emoji + space
  stripped; multi-codepoint emoji (variation selector `️`, skin-tone modifier,
  ZWJ sequence like 👨‍👩‍👧) treated as one unit; line with no emoji returned
  unchanged with `emoji === ''`; a line that is *only* an emoji; emoji mid-line
  is **not** stripped (only a leading run counts).
- **Unit (`src/authoredStories.test.js`):** the existing validators already
  accommodate this lane. The "English, when present, is line-parallel" check
  compares `content` line count to `english_content` line count (emoji prefixes
  don't affect the count), so it runs and must pass; the speaker check is
  language-scoped (Chinese exempt). The existing ≤40-char readable-line bound
  uses `splitSpeaker(line).text`, which for a scene line still includes the
  leading emoji — so either exempt scene emoji from that measure or apply
  `splitScene` first (the plan decides; the intent is that the *language* text
  stays ≤40). Add a `scene`-story author-intent guard: most lines carry a
  leading emoji (`splitScene` returns a non-empty `emoji`).
- **E2E (Playwright, mock backend):** add a `presentation:'scene'` story fixture;
  assert open → launch → Start → first scene (emoji **and** first line visible)
  → tap advances (progress `1/3 → 2/3`) → tap a word opens the sheet → reach the
  end → finish overlay. Confirm the Paced and Chat e2e still pass (the shared
  `emoji` addition must not regress them).
- Build + lint clean; real-component visual check (scene stage, emoji size,
  light/dark, reduced-motion) via the throwaway-harness pattern.

## Rollout

Ship the `SceneReader` + `splitScene` + the per-beat `emoji` with the ~3 authored
scene stories. Because scene is opt-in per story (`presentation='scene'`), the
rest of the library is unaffected. This completes the format trio
(**Paced · Chat · Scene**); real illustrated art is a separate future spec.

Update `ROADMAP.md`: move **Illustrated scene stories** from 🚧 Now → ✅ Shipped
(worded honestly as an emoji picture-book format, with real illustrations noted
as a future step if desired), so the live Discord roadmap stays accurate.

## Open questions

1. Emoji size / card proportions and the cross-fade curve — tune during the
   visual check (start ~72px emoji, ~250ms fade).
2. Should a scene line with no authored emoji show a neutral placeholder (e.g.
   a faint `▫`) or just render text-only for that beat? (Lean: render text-only;
   don't invent a placeholder.)
3. Group/very-short stories: scene format reads best at ~6–12 beats; authoring
   targets that range (not a hard limit).
