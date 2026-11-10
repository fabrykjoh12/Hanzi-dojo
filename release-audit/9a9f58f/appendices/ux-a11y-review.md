# UI / accessibility / mobile review (UX-*)

The reviewer could not write this file itself, so this is its hand-back report, transcribed by the lead.

- **Evidence:** a curated set of screenshots in `../evidence/ux/shots/` (the full set of 299 was too large to commit) and scripts and results in `../evidence/ux/scripts/`. The scripts expect a `vite --mode e2e` server on :5188 and the repo's `tests/fixtures/mockSupabase.js`, with every other host blocked.
- **Ledger:** `ledgers/ux-ledger.txt` (233 files).
- **Lead re-checks:**
  - UX-02: `m-study-back-568x320-light.png`. The card shows the pinyin and meaning but not the hanzi 花, and the hanzi cannot be scrolled to.
  - UX-01: `m-study-back-390x844-dark.png`. The grade buttons stay light pastel in dark mode.
  - UX-04: code path at `src/nativeShell.js:75-80` and `src/NativeShellBridge.jsx:85-90`. `backAction` returns `'exit'` whenever the path is `/`.

## Method
- **Server:** the reviewer's own `vite --mode e2e` server, with the mock Supabase and no real backend.
- **Not an unprimed test:** the reviewer read the code first, so this is an expert walkthrough, not a first-time user test.
- **Render matrix:** 200 renders (20 screens × 320/390/430/768/1280 × light and dark), plus 640×400 (200% zoom) and 4 landscape phone sizes.
- **Accessibility checks:**
  - axe-core on 40 screen/theme pairs.
  - A keyboard-only pass.
  - A scan for `lang` attributes.
  - Reduced-motion emulation.
- **No real devices and no VoiceOver/TalkBack.** Timings were taken in dev mode, so they are rough indicators only.

## Verified OK
- No horizontal overflow in any render.
- Keyboard grading works: Space reveals, and 1–4 grade.
- The finish overlay traps focus. Reader settings close on Escape and return focus.
- Reduced motion is honoured.
- No page or console errors.
- The pre-login funnel holds together.

## Findings
- **UX-01 (Medium).** In dark mode the grade buttons keep hard-coded light pastels, so the interval text is 2.3:1. Card pinyin uses the raw accent, 2.94:1. Refs: `Study.jsx:58-63, 1712-1714, 1475`.
- **UX-02 (Medium).** On short screens (iPhone landscape is allowed by `Info.plist:65-70`; also 200% zoom) the revealed flashcard's word is clipped and cannot be scrolled to.
  - Cause: the scroll area also centres its content.
  - The hidden nav still reserves about 60px.
  - Refs: `Study.jsx:1439-1446`, `studyLayout.js:114-117, 135-137`.
- **UX-03 (Medium).** `lang="zh-Hans"` is missing on the flashcard, the stories shelf (14 of 14), Words (44 of 44), Profile and Landing. The card front's `aria-label` also hides the hanzi from screen readers. Refs: `Study.jsx:1328-1334, 1493, 1507`, `Words.jsx:230`.
- **UX-04 (Medium).** Android hardware Back exits the app at `/`. That covers about 7 onboarding steps, the auth form, the tour and Home dialogs, so the user's answers are lost.
- **UX-05 (Medium).** The word popover never takes focus and is not `aria-modal`. Its buttons come after every word in the Tab order. Likely cause: `focus()` runs while the box is still `visibility:hidden`. Refs: `WordLookupSheet.jsx:81-90, 125, 163`.
- **UX-06 (Low).** Home shows a lock and "Finish cards to unlock", but tapping opens the story, and Stories offers "Start reading" for the same story. Refs: `homeModel.js:80`, `Home.jsx:340-347, 370`.
- **UX-07 (Low).** The raw accent is used as text in dark mode (2.8–2.94:1) on:
  - Words pinyin
  - Test counters
  - Writing
  - the dictionary pill
  - the Discord link
  - the popover headword
- **UX-08 (Low).** The OS dark setting is never followed: pre-login screens are always light, and new accounts default to light.
- **UX-09 (Low).** Light-mode contrast near-misses:
  - sage primary button 4.07:1
  - inactive segmented control 4.39:1
  - Words "Learning" chip 2.92:1
  - locked achievements 2.36:1
- **UX-10 (Low).** Small touch targets:
  - Home profile button 34px (the only mobile route to Settings and Test)
  - story-detail Back 30px
  - Exit/Undo 38px
  - Dictionary "Add to deck" 22px wide
  - Test info 18px
  - Settings switch 28px tall
  - manhua words 20×20
- **UX-11 (Low, taste).** The mobile tab bar labels only the active tab, and Practice uses a generic grid icon.
- **UX-12 (Low).**
  - Readers have no `<h1>`.
  - axe reports 82 `label-content-name-mismatch` violations.
  - Pre-login pages have no `<main>` landmark.
- **UX-13 (Low).** 1,004 fixed px font sizes against 3 rem, so text does not follow iOS Dynamic Type. Not device-tested.

## Per-screen ratings
Each pair is usability / visual, out of 10:

| Screen | Usability | Visual |
|---|---|---|
| Landing | 8 | 8 |
| Pre-login | 8 | 8 |
| Auth | 7 | 7 |
| Home | 8 | 8 |
| Study, portrait light | 9 | 8 |
| Study, dark | 7 | 4 |
| Study, landscape or zoom | 3 | 5 |
| Recap | 8 | 8 |
| Stories | 8 | 8 |
| Story detail | 8 | 8 |
| Paced reader | 8 | 8 |
| Manhua reader | 7 | 9 |
| Finish | 8 | 7 |
| Practice | 8 | 7 |
| Dictionary | 7 | 7 |
| Profile | 7 | 7 |
| Settings | 7 | 7 |
| Test | 7 | 7 |
| Words | 7 (5 in dark) | 7 |
| 404 | 9 | 8 |

## Performance (dev mode; lab proxy only, not field data)
- **First text (FCP):** landing 0.54 s, Home 0.58 s, Stories 1.3 s, manhua reader 1.44 s.
- **Manhua reader:** 351 ms of long tasks on a desktop CPU, with 1,074 DOM nodes. Profile it on a low-end Android.
- **Card reveal:** about 5 ms.
- **Production bundle (measured by the lead):** main chunk 459.7 kB (144.4 kB gzip) and vendor-supabase 200.9 kB (51.5 kB gzip).

## Not exercised
- The native splash and welcome screens.
- PublicStory.
- The interactive chat story.
- StuckWordCoach, FirstMissionWelcome and PlacementTest.
- Offline mode.
- Password reset.
- A true empty fresh-signup state, because the mock ignores most query filters.
