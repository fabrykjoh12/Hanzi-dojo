# The launch film — "花"

A 28-second cinematic ad for Hanzi Dojo. Six shots, no voice-over, no captions
until the end card. It is deliberately not a screen recording: the app appears
twice, in real screenshots, at the two moments where the argument needs proof.

**Watch**

| Cut | Use | Link |
|-----|-----|------|
| 16:9 · 1920×1080 · 28.0s | site hero, YouTube, Discord, X | https://d2ol7oe51mr4n9.cloudfront.net/user_3F2f9D8W1bdllmfrrKt84Fbkeot/33234f69-ee46-4cf5-8573-db596910d4da.mp4 |
| 9:16 · 1080×1920 · 28.0s | Reels, Shorts, TikTok | https://d2ol7oe51mr4n9.cloudfront.net/user_3F2f9D8W1bdllmfrrKt84Fbkeot/8aa669d8-7980-4cf4-9144-9188c67d49ed.mp4 |

## The idea

The app's promise is that words turn into stories. The film says that literally:
a character lifts off a flashcard as wet ink and unfolds into the thing it means,
and then a whole landscape writes itself out of brushstrokes. Then it cuts back to
a real phone on a real desk, because the point is that this actually happens in the
product, not in a metaphor.

Discipline that holds the whole thing together:

- **Three colours only** — bone white (paper), ink black, and the brand vermilion
  `#B83A24`. The one saturated object in the widest shot is a red umbrella.
- **No text until the end card.** No lower thirds, no feature bullets, no UI chrome
  floating in space.
- **The interface is never faked.** Shots 2 and 5 were generated with real
  screenshots as reference plates, and the motion prompts explicitly forbid the
  model from restyling, morphing or animating the UI.

## Shot list

| # | Time | Shot | Beat |
|---|------|------|------|
| 1 | 0.0–4.9 | Macro: one wet ink stroke blooming on mulberry paper, single raking lantern | the hook — something is being written |
| 2 | 4.9–9.3 | Night bus, rain: a learner reviewing the card for 花 (huā, flower) on her phone | the ordinary act the product actually is |
| 3 | 9.3–13.6 | The character lifts off the screen as 3D ink and unfolds into a peony | learning something is a transformation |
| 4 | 13.6–18.6 | White void: brushstrokes race out and become mountains, rain, a bridge — she walks in with a vermilion umbrella | vocabulary becomes a world you can enter |
| 5 | 18.6–23.0 | Macro: the same phone on a walnut desk, the story reader, a finger tapping an underlined word | the proof — this is the actual app |
| 6 | 23.0–28.0 | End card: the ensō paints itself, wordmark, tagline, URL | where to go |

Transitions: hard cut 1→2 and 4→5 (dream vs. real), dissolves 2→3 and 5→6, and a
**dissolve through white** 3→4, because shot 4 opens on a white void anyway.

Sound is the models' native audio, cross-faded and loudness-normalised to −16 LUFS:
brush on paper, rain on glass, a bus engine, one temple bell on the flower opening,
strings under the landscape, a single low bell on the logo.

## How it was made

1. **Screenshots.** `tests/fixtures/mockSupabase.js` drives the real app in e2e mode
   under Playwright, so the frames are the live UI with deterministic, fake data —
   no account, no real learner's progress. Captured plates live in
   [`screens/`](screens): the graded flashcard (花 · huā · flower, with the FSRS
   intervals on the grade row) and the story reader mid-page.
2. **Key frames.** Six stills, Nano Banana Pro, 16:9 at 2K. Shots 2 and 5 were given
   the screenshot as a reference image with an instruction to reproduce it exactly.
3. **Motion.** Each still animated with Kling 3.0 (`pro`, 5s, native audio on).
4. **Cut.** ffmpeg: `xfade` / `acrossfade` chain, fade in and out, `loudnorm`,
   H.264 CRF 18. The vertical cut is the same master centred over a blurred,
   darkened blow-up of itself, so nothing is cropped away — including the end card.

Total generation cost: 12 credits of stills + 75 of video.

## If you re-cut it

The end card is a still with real typography on it, so **do not crop the master to
2.39:1** — the `hanzi-dojo.com · free, forever` line sits in the bottom eighth of
the frame and a scope crop eats it. That is why the film is full-frame 16:9 rather
than letterboxed.

To recapture the screenshot plates after a UI change, run the app in e2e mode
(`npm run dev:e2e`) and drive it with Playwright against
`tests/fixtures/mockSupabase.js`; the two shots that matter are `/study` with the
answer revealed and a story open in the reader.
