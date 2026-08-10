# Onboarding — audit and three concepts (P9)

**Status: proposal, awaiting approval. Nothing here is implemented.**
Written 2026-08-10 against `claude/hanzi-dojo-mobile-rebuild-c1nb3u` @ `030b87c`.

The brief: a learner should finish onboarding understanding what to do each day,
how a flashcard works, what Again/Hard/Good/Easy mean, how pronunciation works,
why Stories exist, how sessions unlock story content, and what to tap next. And
they should have *done* it, not been told it.

---

## 1 · What exists today

There is not one onboarding. There are **three separate tutorial systems**, built
at different times, that a new learner meets in sequence:

| # | System | Where | Owns |
|---|--------|-------|------|
| 1 | **The pre-signup encounter + wizard** | `Landing.jsx` | 你好 flashcard, tea-shop story, 3 questions, assembled path |
| 2 | **The post-signup setup + First Mission** | `Onboarding.jsx`, `FirstMissionWelcome.jsx`, `firstMission.js` | Level, daily goal, loop diagram, then a real 5-card session with hints |
| 3 | **The coach-mark tour** | `tour.js`, `TourOverlay.jsx` | 4 marks on Home, 3 on Stories, on first visit to each |

### The full sequence, state by state

Native app, brand-new learner. **19 states** before the app is "just the app".

| # | State | Component | Learner sees | Expected action | Teaches | Interactive? | Needed before first use? |
|---|-------|-----------|--------------|-----------------|---------|--------------|--------------------------|
| 1 | Splash | `SplashIntro.jsx` | Ensō drawing itself | wait | brand | no | yes (it is the launch) |
| 2 | Welcome | `NativeWelcome.jsx` | Mark, one line, Start / Log in | tap Start | nothing | tap | yes |
| 3 | First flashcard | `FlashcardIntro.jsx` | 你好, "Tap the card to reveal its meaning" | tap card | **the flip**, pinyin, meaning, 你+好 breakdown, speaker | **yes — real 3D flip, real Azure audio** | yes |
| 4 | Micro-story | `MicroStory.jsx` | Tea shop, 3 accumulating beats, 3 reply choices | Continue ×2, pick a reply | **words live in context**; wrong picks explain themselves | **yes** | yes |
| 5 | Encounter complete | `EncounterComplete.jsx` | Card slides onto a small stack | tap "Build my training path" | "discovered, not mastered" | no | borderline |
| 6 | Experience | `Landing.jsx` | "How much Chinese do you know?" — 6 rows | pick one | nothing | tap | **the answer is discarded — see §2** |
| 7 | Purpose | `Landing.jsx` | "Why are you learning Chinese?" — 6 multi-select | pick, Continue | nothing | tap | no |
| 8 | Minutes | `Landing.jsx` | 4 daily plans + honest estimate | pick, Continue | what a session costs | tap | **asked again at #12** |
| 9 | Path building | `PathBuilding.jsx` | 4 rows assembling | tap "Save my path" | that a plan exists | no (animation) | no |
| 10 | Account | `Auth.jsx` | Email/password, Apple on native | sign up | nothing | form | yes, eventually |
| 11 | Level | `Onboarding.jsx` step 2 | "What's your level?" — 3 tiers, optional placement test | pick, Continue | HSK tiers | tap (+ real test) | yes — but it repeats #6 |
| 12 | Daily goal | `Onboarding.jsx` step 3 | 5 / 10 / 15 **cards** a day | pick, Continue | nothing | tap | **repeats #8 in a different unit** |
| 13 | The loop | `Onboarding.jsx` step 4 | Flashcards → Stories → Videos → Writing icon row, paragraph | tap "Start your first session" | the loop, **as a diagram** | no | this is the slide the brief wants replaced |
| 14 | First Mission welcome | `FirstMissionWelcome.jsx` | "You'll learn your first 5 words. Then you'll use them in a real story." | tap "Start First Mission" | the promise | no | no — a screen between two screens |
| 15 | Guided session | `Study.jsx` + `firstMission.js` | **The real Study screen**, 5 new cards, hints on cards 1, 3, 4 | reveal, grade ×5 | **the real loop** | **yes — real cards, real scheduling** | yes |
| 16 | Session recap | `SessionRecap.jsx` | Counts, **"Story unlocked" / chapter reward**, "Read now" | tap Read now | **sessions unlock stories** | tap | yes |
| 17 | Reader | `StoryReaderImmersive.jsx` | Real chapter + "The highlighted words are the ones you just learned." | read | **payoff** | **yes** | yes |
| 18 | Home tour | `TourOverlay.jsx` | 4 coach marks: queue, then-read, week, nav | Next ×4 or Skip | where things are | tap | partly |
| 19 | Stories tour | `TourOverlay.jsx` | 3 coach marks: hero, shelf, locked | Next ×3 or Skip | the shelf | tap | partly |

**Realistic duration: 4–7 minutes**, most of it in states 6–14 where nothing is
being learned.

### How it is wired

- **Completion is not a flag.** `App.jsx` shows `Onboarding` whenever
  `!profile || !track`. Finishing writes a `profiles` row + a `language_tracks`
  row; that is the entire "has onboarded" signal.
- **`justOnboarded` is in-memory React state.** Kill the app between #13 and #14
  and the First Mission welcome never appears — the learner lands on Home.
- **First-run capping is derived from data**, not a flag: `firstRun.js` calls a
  session a first run when the account has **zero cards anywhere**, and caps new
  cards to `FIRST_RUN_NEW_CARDS = 5`. This is the single best piece of the
  current design — it survives reloads and cannot go stale.
- **Tour seen-state** lives in device-local IndexedDB prefs (`tour:seen`), gated
  to accounts younger than 14 days, with a Settings → *Replay the app tour* row.
- **Web vs native differs in exactly one place**: `initialLandingMode(native)` —
  web opens on the marketing page, the app on `NativeWelcome`. Everything from
  the flashcard onward is identical.
- **Tests today:** unit specs for `firstEncounter`, `firstMission`, `firstRun`,
  `onboardingPath`, `onboardingGoal`, `prelogin`, `tour`. E2e: `landing.spec.js`
  walks the whole pre-signup wizard; `tour.spec.js` covers the coach marks.
  **There is no test that walks signup → level → first session → story.**

---

## 2 · Weaknesses

Ordered by how much they cost a new learner.

**W1 · Grading is never explained.** The single biggest gap. Four buttons
labelled Again / Hard / Good / Easy with an interval underneath, and the only
teaching anywhere in the product is one hint on card 1: *"Did you remember it?
Tap Good."* Cards 2–5 get nothing, and Again/Hard/Easy are never defined. The
"?" help described in the roadmap is not in `Study.jsx` today. A learner who
mis-grades for a week gets a schedule that quietly does not fit them.

**W2 · Four answers are collected and thrown away.** `Landing.jsx` writes
`startLevel`, `placementLater`, `minutesPerDay`, `purposes` and `style` into
prelogin prefs. Nothing reads them — `Onboarding.jsx` only reads `language`,
`reason` (for one greeting line) and `level` (which only the public reading test
ever writes). So the learner answers **"how much Chinese do you know?" twice**
(#6, #11) and **"how much per day?" twice in different units** (#8 minutes, #12
cards). Two of the nine states before signup are pure friction.

**W3 · The loop is taught as a diagram, then experienced 5 minutes later.**
State #13 is an icon row — Flashcards → Stories → Videos → Writing — with a
paragraph. It names Videos and Writing, which a day-one learner will not touch.
This is the slide the brief explicitly wants replaced by the thing itself.

**W4 · Three tutorial systems with three different visual languages.** The
pre-signup encounter uses `BRAND_INK` and a bespoke card; `Onboarding` uses a
centred card on a background image with progress dots; the guided session is the
real product; the tour is coach marks. Nothing looks like the next thing.

**W5 · The pre-signup flashcard is not the real flashcard.** `FlashcardIntro`
has a 3D flip; `Study.jsx` has none. No grade buttons appear pre-signup at all,
so the first time a learner sees Again/Hard/Good/Easy is on a real card that will
really be scheduled. `Landing.jsx` also carries a `FlashcardMock` with hardcoded
grade colours — a third visual version of the same object.

**W6 · Progress-dot slideshows.** Both the wizard (`WizardShell`, 3 dots) and
`Onboarding` (3–4 dots) present themselves as carousels to page through — the
exact pattern the brief rules out.

**W7 · Two screens exist only to introduce the next screen.** #5 and #14 are
each one paragraph and one button.

**W8 · Competing actions.** The wizard rows carry Back + a row choice +
Continue; `Onboarding` steps carry Back + Continue; the tour carries Next + Skip.
Few states have one obvious action.

**W9 · A kill mid-onboarding loses everything.** `Onboarding` calls
`clearPreloginPrefs()` in a mount effect, *before* completion. Relaunch → the
greeting, the tasted word and the level prefill are gone, and it restarts at the
tier picker.

**W10 · Copy volume.** States 5, 13, 14 and every tour card are paragraph-length.
`firstMission.js`'s first hint — *"This is a flashcard. Tap it to reveal the
answer."* — is the brief's canonical example of what not to write.

**W11 · Nothing teaches Replay or the speed control.** One hint on card 3 says
"Tap the speaker to hear it pronounced." The 1× / 0.75× / 1.25× chip shipped in
P3 is never mentioned.

**W12 · Staleness risk is structural.** `CARD_HINTS` is keyed by *how many cards
have been graded* (0, 2, 3). Change the first-run card count, the card order, or
the layout and the hints point at nothing — silently, with no test that would
fail.

---

## 3 · Three concepts

All three assume: the encounter is rebuilt around the **real** flashcard
component, the loop is *performed* rather than diagrammed, and the wizard's
duplicate questions are deleted.

---

### Concept A — **Mini First Session**

**Philosophy.** Compress the whole product into 90 seconds of the real thing.
The learner does a three-card session on a sandboxed queue, finishes it, watches
a story unlock, reads two lines of it, and then does the same thing for real.
Teaching is progressive: card 1 is coached, card 2 is hinted, card 3 is silent.

**Sequence**

| State | Screen | Interaction | Teaches |
|-------|--------|-------------|---------|
| A1 | Welcome — mark, "Learn Chinese through words and stories.", **Start** | tap | — |
| A2 | 你好, real card chrome, "Tap to reveal" | tap card | the flip |
| A3 | Revealed: 你好 · nǐ hǎo · hello, audio plays, **Replay** visible | optional tap | pronunciation |
| A4 | Four grade buttons appear under the card. One line: *How well did you remember it?* Each button carries its own one-word gloss the first time only — forgot / barely / remembered / effortless | tap a grade (any) | **grading** |
| A5 | Card 2 — 谢谢. Same card, no coaching except the grade glosses | reveal → grade | the rhythm |
| A6 | Card 3 — 再见. Nothing on screen but the card | reveal → grade | they can do it |
| A7 | Session complete — real recap chrome. "3 words learned", then **Story unlocked** slides in | tap **Read it** | sessions unlock stories |
| A8 | Two-panel scene using 你好 and 谢谢, the learned words marked | tap through | **the payoff** |
| A9 | The loop, four words on four lines, no icons: Learn · Review · Unlock · Read | tap **Create account** | the frame |
| A10 | Account | sign up | — |
| A11 | One question: *I'm new to Chinese / I know some / I know my HSK level* | tap | level |
| A12 | Home, with the queue panel already highlighted and one line: *Your first session is ready.* | tap **Start** | what to tap |

**Duration** ~90 seconds to A9, ~2 minutes to the real session.

**Teaches** daily action · the flip · all four grades · Replay · why Stories
exist · session→unlock · what to tap next. All seven brief items.

**Advantages** shortest path to the whole loop; every state is one action;
grading is taught at the exact moment it is first needed; the sandbox can never
corrupt real scheduling; works fully without audio.

**Disadvantages** the three cards are simulated, so the learner "loses" that
work and repeats 你好 in the real session minutes later; needs a small sandbox
queue that must stay in sync with the real card component.

**Engineering complexity — Medium.** The one genuinely new thing is a *presenter*
mode for the flashcard: the same visual card, driven by fixture data instead of
Supabase. Everything else is deletion and re-sequencing.

**Reuse** `Study.jsx`'s card block and `GradeButton` (extracted), `gradePalette`,
`cardMarker`, `studyLayout`, `useStudyAudio`, `SessionRecap`'s unlock panel,
`firstEncounter.js` fixtures, `haptics`, `SessionPaused` chrome.

---

### Concept B — **The Locked Door**

**Philosophy.** Lead with the gap. Show real Chinese the learner cannot read,
teach exactly the words that unlock it, then return to the same scene and let
them read it. The product's argument — *immersion works when it is at your
level* — becomes something that happens to them in the first minute rather than
a claim.

**Sequence**

| State | Screen | Interaction | Teaches |
|-------|--------|-------------|---------|
| B1 | A real story panel, unglossed: 你好！ / 谢谢你。 / 再见。 Below it: *You can't read this yet. It takes three words.* **Show me** | tap | the goal |
| B2 | Card 1 — 你好, "Tap to reveal" | tap | the flip |
| B3 | Revealed + audio + Replay; grade row with first-time glosses | tap a grade | pronunciation, **grading** |
| B4 | Card 2 — 谢谢, hint-free | reveal → grade | rhythm |
| B5 | Card 3 — 再见, silent | reveal → grade | independence |
| B6 | **The same panel returns**, this time with the three words lit and glossed. One line: *You just read Chinese.* | read, tap | the payoff, earned |
| B7 | Story unlocked → "this is what finishing a session does" — one line, real recap chrome | tap | session→unlock |
| B8 | Account | sign up | — |
| B9 | One level question | tap | level |
| B10 | Home, queue highlighted, **Start your first session** | tap | what to tap |

**Duration** ~75–100 seconds.

**Teaches** everything in A except the *daily* framing, which B states once at
B7 rather than showing.

**Advantages** the strongest emotional beat in the three; the before/after is a
single controlled comparison, which is exactly what makes it land; it justifies
Stories before asking for an account; highly shareable as a store-listing video.

**Disadvantages** the opening screen is deliberately incomprehensible, which is
a risk on a cold install — a learner who taps away at B1 never sees anything;
the "session" reads as a means to the door rather than as the daily habit, so
the *routine* has to be taught later; the three words are fixed forever, so B1's
scene can never be personalised by level.

**Engineering complexity — Medium.** Same presenter-mode card as A, plus one
two-state story panel (locked / unlocked). The panel is small enough to be a
purpose-built component rather than the real reader.

**Reuse** as A, plus `storyReading.js`'s segmentation for the lit words if the
panel is built from real story data.

---

### Concept C — **Guided Real Session**

**Philosophy.** Do not simulate anything. Sign the learner up first, then teach
on their actual first five cards, with coaching that fades. When onboarding ends
they have real reviews scheduled for tomorrow — the tutorial *is* day one.

**Sequence**

| State | Screen | Interaction | Teaches |
|-------|--------|-------------|---------|
| C1 | Welcome + one line | tap Start | — |
| C2 | One level question | tap | level |
| C3 | Account | sign up | — |
| C4 | Real Study, card 1: card + "Tap to reveal" | tap | the flip |
| C5 | Revealed, audio, Replay pointed at once | tap Replay (optional) | pronunciation |
| C6 | Grade row with glosses, one line above it | grade | **grading** |
| C7–C10 | Cards 2–5, coaching removed one piece per card | reveal → grade | rhythm, independence |
| C11 | Real `SessionRecap` with the real chapter reward | tap **Read now** | session→unlock |
| C12 | Real reader, learned words marked | read | payoff |
| C13 | Home tour, trimmed to 2 marks | tap | what to tap next |

**Duration** ~2–3 minutes (five real cards, not three).

**Teaches** all seven, and the learner keeps the progress.

**Advantages** nothing is simulated, so nothing can drift out of sync with the
product — the staleness class of bug (W12) mostly disappears; no repeated words;
the strongest "you have already started" feeling; least new UI of the three.

**Disadvantages** **the account comes before any value** — the brief's own
concern, and the current flow's best decision (encounter before signup) would be
thrown away; teaching happens inside `Study.jsx`, the file the codebase most
wants to stop growing; a mis-tap during coaching writes a real FSRS grade; the
first session is now load-bearing for teaching, so any change to it is a change
to onboarding.

**Engineering complexity — High.** Not because any one piece is hard, but
because the coaching lives inside real scheduling. Every hint needs a state
machine that survives a reload mid-session, and `Study.jsx` grows again.

**Reuse** almost everything — `Study.jsx`, `SessionRecap`, the real reader,
`firstRun.js`, `firstMission.js`, `TourOverlay`.

---

## 4 · Account placement — recommendation

**Option B: interactive tutorial → account → real first session.** Keep what the
current flow already gets right.

| | A: account first | **B: tutorial → account** | C: partial → account → rest |
|---|---|---|---|
| Friction | highest — an email before any reason to care | **lowest** | medium |
| Value before ask | none | **a word learned, used, read** | partial |
| Persistence | trivial | prelogin prefs already carry it | two hand-off points to keep correct |
| OAuth/native | unchanged | unchanged | unchanged |
| Conversion | worst | **best** | untested |
| Can we run it signed-out? | n/a | **yes — already do** | yes |

The tutorial interactions need no account today (`FlashcardIntro` and
`MicroStory` read fixtures and public audio), and prelogin prefs already carry
the answers across signup. The only fix needed is **W9**: stop clearing prefs on
`Onboarding` mount; clear them on `handleFinish` instead.

One change to the boundary: put the **level question after signup, not before**
(it is the one answer we must persist to a row anyway), and delete the pre-signup
experience question that currently duplicates it.

**No auth architecture changes.** `Auth.jsx`, `nativeAuth.js` and the Apple flow
stay exactly as they are.

---

## 5 · HSK level — recommendation

**Ask once, after signup, in three rows.** The brief's own wording is right:

> I'm new to Chinese · I know some Chinese · I know my HSK level

- *New* → HSK 1. No further questions.
- *Some* → HSK 1, and offer the placement test as a link, not a step.
- *I know my HSK level* → reveal the tier rows (the existing `resolveTiers` UI),
  including the placement test for the tiers that require one.

This keeps `PlacementTest.jsx` and `tiers.js` intact, keeps the honest rule that
higher tiers must be proven, and stops a beginner having to parse three tiers
before they have seen a card. **Delete** the pre-signup experience question (W2)
and the separate daily-goal step — seed `daily_new_cards` to 10 and let Settings
change it, since the first session is capped at 5 regardless.

---

## 6 · Returning users

| Situation | Today | Proposed |
|---|---|---|
| Brand-new account | full 19 states | the chosen concept |
| Existing user installs the iOS app | correct — `profile`+`track` exist, straight to Home | unchanged |
| Returning user with progress | correct | unchanged |
| Killed mid-onboarding | **broken** (W9) — prefs cleared, restarts at tiers | resume at the state they left, prefs intact |
| Killed between setup and First Mission | **welcome silently skipped** — `justOnboarded` is memory-only | persist a `tutorial_state` on the profile |
| Reinstall | correct | unchanged |
| Logout → login | correct | unchanged |
| Wants to replay | Settings replays **only the coach-mark tour** | Settings → *Replay the intro* replays the tutorial in sandbox mode, never touching real cards |

The one new piece of persistence: a small `tutorial_state` column (or a key in
the existing profile prefs) holding `null | 'tutorial' | 'done'`. It must never
gate an account that already has cards — `firstRun.js`'s data-derived rule stays
the authority on "brand new".

---

## 7 · Design, haptics, accessibility

**Design.** No new visual language. The tutorial card *is* the study card: same
`--surface`, same 26px radius, same `cardMarker` band, same `gradePalette`
buttons, same `studyLayout` sizing. Delete `FlashcardMock` from `Landing.jsx`
and the 3D flip from the tutorial (the real card does not flip). No progress
dots, no illustrations, no mascot. One accent: the Chinese `#B83A24` through
`ink()`. Motion: the existing `navMotion` vocabulary only, and `prefersReducedMotion`
already gates the two animations in the encounter.

**Haptics** (`haptics.js` has `tapFeedback` and `successFeedback` today):

| Moment | Feedback |
|---|---|
| Reveal | none — the flip is its own feedback |
| Grade | `tapFeedback` (selection) |
| Card 3 graded / session complete | `successFeedback` |
| Story unlocked | `successFeedback`, once |
| Everything else | nothing |

**Accessibility.** Completion must never depend on hearing audio — pinyin and
gloss are always on screen, and every state advances by tap. Grade glosses are
real text, not colour. The card announces via `aria-label` as it does now; the
grade row is a normal button row. `prefers-reduced-motion` swaps every transition
for an instant change. Type must survive Dynamic Type — the tutorial reuses
`studyLayout`, which already shrinks rather than clips. Both themes come free
from the tokens.

---

## 8 · Recommendation

**Ship Concept A (Mini First Session), with B's before/after built into its story
beat (A8).**

| Criterion | Why A |
|---|---|
| Clarity | teaches all seven brief items, each at the moment it is needed |
| Differentiation | the story payoff is the argument; A8 can carry B's reveal without B's risk of opening on something incomprehensible |
| Completion rate | 9 states, one action each, ~90 seconds — the shortest of the three, and no email before value |
| Engineering risk | **Medium, and bounded** — the sandbox cannot touch FSRS, so the worst failure is a bad tutorial, not a bad schedule |
| Maintenance | one new presenter mode + fixtures; the hint system keyed to *card index* (W12) disappears entirely |
| Teaches Stories | naturally — the unlock is earned three cards in, not explained |
| Transition to real use | A12 hands them to the real queue with the real panel already highlighted |

**Why not B alone:** its opening screen is deliberately unreadable, which is a
real risk on a cold install, and it teaches the *door* better than the *daily
habit*. Its best moment is worth stealing; its opening is not worth the risk.

**Why not C:** it requires the account first, which throws away the flow's
strongest existing property, and it grows `Study.jsx` — the file CLAUDE.md §3
specifically names as the place logic must stop accumulating. Worth revisiting
once the study screen has been decomposed.

---

## 9 · Implementation outline (Concept A)

Five commits, each shippable and green on its own.

1. **Extract the flashcard from `Study.jsx`.** A `Flashcard.jsx` presentational
   component + a `GradeRow.jsx`, both driven entirely by props. `Study.jsx`
   renders them with live data; nothing changes visually. Pure refactor, pinned
   by the existing study e2e specs and a new snapshot of the extracted parts.
2. **`tutorialScript.js` — the pure state machine.** States, the fixture cards,
   what coaching is visible at each state, what the next action is. No React, no
   Supabase. This is where the brief's seven teaching goals become assertions.
3. **`Tutorial.jsx` — the runner.** Renders `Flashcard`/`GradeRow` from the
   script, plus the mini recap and the two-panel story beat. Signed-out safe;
   never writes a card.
4. **Re-sequence the entry.** `Landing.jsx` loses the experience/purpose/minutes
   questions and `PathBuilding`; `Onboarding.jsx` collapses to the single
   three-row level question; `FirstMissionWelcome.jsx` and `EncounterComplete.jsx`
   are deleted. Fix W9 (clear prefs on finish, not on mount). Persist
   `tutorial_state`.
5. **Land the learner.** Home opens with the queue panel emphasised and one line;
   the Home tour drops from 4 marks to 2 (nav + week), since the queue and the
   story reward were both taught by doing. Settings' replay row replays the
   tutorial in sandbox mode.

**Deliberately out of scope:** the tab hierarchy (P8), the Stories tour, the
public marketing landing page, auth, and `firstRun.js`'s 5-card cap — which
stays exactly as it is.

---

## 10 · Files affected

**New:** `Flashcard.jsx`, `GradeRow.jsx`, `Tutorial.jsx`, `tutorialScript.js`
(+ `.test.js`), `tutorialFixtures.js`.

**Changed:** `Study.jsx` (render the extracted parts; delete `firstMissionCardHint`
usage), `Landing.jsx` (drop 3 question states + path building), `Onboarding.jsx`
(4 steps → 1), `App.jsx` (the `justOnboarded` gate becomes a persisted tutorial
gate), `Home.jsx` (first-visit emphasis), `Settings.jsx` (replay copy),
`tour.js` (Home tour 4 → 2), `firstMission.js` (reader hint survives; card hints
go), `prelogin.js` (drop the unread keys).

**Deleted:** `FirstMissionWelcome.jsx`, `EncounterComplete.jsx`,
`PathBuilding.jsx`, `FlashcardIntro.jsx`, `MicroStory.jsx`, the unread half of
`onboardingPath.js`, `FlashcardMock` in `Landing.jsx`.

**Migration:** one idempotent column for `tutorial_state` (or a prefs key — no
migration at all, decided at commit 4).

**Docs:** `ROADMAP.md`, this file, `docs/MOBILE-DEVICE-QA.md` (a first-launch
section), `CLAUDE.md`'s index.

---

## 11 · Testing strategy

**Unit — `tutorialScript.test.js` is where the brief becomes executable.**

- every state has exactly one advancing action
- the script visits all seven teaching goals, by name
- coaching decreases monotonically: card 1 coached, card 2 hinted, card 3 silent
- the grade glosses appear on the first grade row and never again
- the script terminates, and cannot loop
- reduced-motion and no-audio paths reach the end state
- fixture words all resolve to real vocabulary ids with real audio

**Unit — regression.** `Flashcard`/`GradeRow` render identically from tutorial
fixtures and from a live card (same tokens, same sizes). This is what stops the
tutorial and the product drifting apart.

**e2e — one spec, the whole path.** `tests/e2e/onboarding.spec.js`: welcome →
three cards → recap → story → account → level → **the real Study screen**, at
390×844 and 320×568. Asserts no horizontal overflow and that every state's
primary action is above the fold.

**e2e — the states nobody tests today.** Killed mid-tutorial resumes; an existing
account never sees the tutorial; Settings replay does not write a card.

**Device QA.** A new §I in `docs/MOBILE-DEVICE-QA.md`: cold install → tutorial on
a real phone, with the silent switch on, with VoiceOver, and with Reduce Motion.

**What cannot be tested here:** whether 90 seconds is the right length, and
whether the grade glosses actually land. Both are questions for the first
testers, not for CI.
