# P12 — the first-time-user journey: audit, three concepts, recommendation

**Status: implemented — §12 records what shipped.** The audit itself (§0–§11)
was written against `claude/hanzi-dojo-continuation-e3vnbg` @ `f9baf7f`
(TestFlight build 40) and describes THAT build; §1's state tables and §3's
defects are history now, kept because the fixes are only legible next to them.

This supersedes [`ONBOARDING-AUDIT.md`](ONBOARDING-AUDIT.md) as the *current*
picture. That document is the P9 rebuild's reasoning and is still worth reading
for why the nine-screen wizard died — but §1 and §2 of it describe an app that no
longer exists, and it closes with "Concept A approved and being built", which is
now shipped. Where the two disagree, this file is the one that was measured.

**The brief, restated:** a learner should reach the end of onboarding having
*done* the daily loop, not been shown a description of it — and should understand
the flashcard, the four grades, that words can be heard, and why Stories are the
point.

---

## 0 · The fact that reframes the whole audit

**Nobody has been through the current onboarding.**

| | |
|---|---|
| Non-staff accounts created since the tutorial shipped (2026-08-10) | **0** |
| Distinct people in the `tutorial_*` funnel, all time | **1**, on 2026-08-11 |
| Distinct people in `landing_viewed` | 468 |
| Non-staff accounts, all time | 29 |

All 29 accounts went through the **old** nine-screen wizard. The single tutorial
funnel run is one device on the day the build was cut — the maintainer's own QA.

So this is not "the shipped onboarding is failing." It is:

1. **The shipped onboarding is unmeasured**, and
2. **the previous cohort tells us exactly which half of the loop does not land.**

That second point is the load-bearing evidence in this document:

| Of 29 non-staff accounts | |
|---|---|
| Studied at least one card | 24 |
| Read at least one story | **8** |
| **Studied but never read a story** | **16** |
| Did both halves | 8 |
| Claimed a session's story reward | 3 |
| Came back on a second day | 10 |
| Only ever one active day | 13 |
| Started above HSK 1 | 4 |
| Never studied anything | 5 |

**Two thirds of the people who used the flashcards never once opened a story.**
The flashcard half of the product teaches itself. The half that makes Hanzi Dojo
different from Anki does not — and that is a *motivation* failure, not a
navigation one. Every concept below is judged primarily on whether it fixes that.

Funnel, for the old wizard cohort (people, not events):

```
landing_viewed        468
prelogin_signup_started 64   ← 13.7% of visitors asked for an account
onboarding_started      32   ← 50% of those actually got one
onboarding_completed    19   ← 59% of those finished the level question
```

`signup_started` 10 / `signup_completed` 3 look alarming and are not: those two
fire only on the email/password path (`Auth.jsx:61,72`). Google and Apple never
fire them. That is a measurement hole, not a conversion cliff — but it does mean
**we cannot currently tell how many accounts come from OAuth vs email.**

---

## 1 · What a brand-new learner sees, state by state

Two entry surfaces. They diverge at screen 1 and converge at screen 2.

### Web (`hanzi-dojo.com`)

| # | State | Component | What is on screen | Interactive? |
|---|-------|-----------|-------------------|--------------|
| 1 | Marketing page | `Landing.jsx` | Hero, a fake story mock, **three method cards**, a **four-icon "your daily loop" diagram**, two CTAs, a reading-test link, footer. One long scroll | scroll + tap |
| 2 | Tutorial welcome | `Tutorial.jsx` | Wordmark, "Learn Chinese through words and stories.", **Start** | tap |

### Native (App Store / Play)

| # | State | Component | What is on screen | Interactive? |
|---|-------|-----------|-------------------|--------------|
| 0 | Splash | `SplashIntro` | Ensō drawing itself, hands over when the app is ready | wait |
| 1 | Welcome | `NativeWelcome.jsx` | Logo, wordmark, two lines, **Begin training** / *I already have an account* | tap |
| 2 | Tutorial welcome | `Tutorial.jsx` | as above | tap |

`initialLandingMode(native)` in `prelogin.js` is the whole fork, and it is the
one pure function the rule lives in — correct per CLAUDE.md §1.

### Then, identically on both (the tutorial: 13 states, 12 taps)

| # | State id | What the learner does | What it teaches |
|---|----------|----------------------|-----------------|
| 3 | `card-1-front` | Taps the real card. Coach line: **"Tap to reveal"** | the flip |
| 4 | `card-1-back` | Sees 你好 / nǐ hǎo / hello. Coach: **"Tap to hear it"** on the audio control, **"How familiar was this word?"** over the grades, and the four buttons carry **one-word meanings** ("New to me / Barely knew it / Knew it / Already knew it"). Presses one | pronunciation exists; what the four grades mean |
| 5 | `card-2-front` | Coach: **"Your grade decides when you see it again."** | scheduling, *as a sentence* |
| 6 | `card-2-back` | 谢谢. No coaching. Grades bare | — |
| 7–8 | `card-3-*` | 再见. Nothing but the product | — |
| 9 | `recap` | ✓ chip, **"Session complete / 3 words practiced"**, *Continue*. Success haptic | a session ends |
| 10 | `unlock` | 📖 chip, **"Story unlocked / Finishing a session opens the next chapter."**, *Read it*. Success haptic | what finishing buys |
| 11 | `story-1` | Italic setting line, then a panel: *The shopkeeper* — **你好！** — "Hello!" with 你好 marked | the word, alive |
| 12 | `story-2` | *Mei* — **谢谢。再见！** + **"You just read the words you learned."** | the payoff |
| 13 | `loop` | Four stacked words: **Learn / Review / Unlock / Read**, *Create account* | the loop, *as a list* |

Twelve taps: Start, then 3 × (reveal + grade), then Continue, Read it, Continue,
Continue, Create account.

### Then

| # | State | Component | What happens |
|---|-------|-----------|--------------|
| 14 | Account | `Auth.jsx` | **Opens on the Log in tab — see §3.1.** Email + password, Google, Apple (native only), Terms/Privacy links |
| 15 | Level | `Onboarding.jsx` | One question, "Where should we start you?", three radio rows. *I know my HSK level* expands tier rows; a gated tier opens `PlacementTest`. Writes `profiles` + `language_tracks`, seeds prior knowledge if level > 1, **clears prelogin prefs**, → Cards |
| 16 | First session | `Study.jsx` | The real thing, capped at **5 new cards** (`firstRun.js`). **No coaching at all** — deliberate (`Study.jsx:946`) |
| 17 | Recap | `SessionRecap.jsx` | "Your first words, learned", two stat tiles, a **Recommended next** accent CTA, a story-unlock card, sometimes a chat mission |
| 18 | Reader | `StoryReaderImmersive` | Only if they tap through |
| 19 | Home, first visit | `TourOverlay` | **A 4-step coach-mark tour fires — see §3.2** |
| 20 | Stories, first visit | `TourOverlay` | A 2-step tour (chapter one is free; locks say why) |

---

## 2 · The twelve questions, answered

**What a brand-new user currently sees** — §1. Roughly 20 states, of which 13 are
the tutorial and 12 are taps.

**Where account creation happens** — after the tutorial, at state 14. Nothing
before it writes to the database, and `tutorial.spec.js:311` proves it. The
tutorial marks itself *done* at the hand-off rather than at signup, so a learner
who bails at the form and comes back lands on the form, not the introduction
(`landingEntry` in `prelogin.js`). That is a good decision and it is tested.

**How HSK/current level is chosen** — one question, three answers
(`Onboarding.jsx:41`). *New* → HSK 1. *I know some* → HSK 1, with the public
reading test's estimate honoured if one exists, and a "take a quick test instead"
link. *I know my HSK level* → the tier rows, with a placement test gating the
higher ones. Placing above level 1 silently seeds the levels below as spread-out
check-ups. Only **4 of 29** accounts started above HSK 1.

**What the tutorial actually teaches** — declared, not guessed:
`TEACHING_GOALS` in `tutorialScript.js` names eleven goals and
`tutorialScript.test.js` proves a walkthrough visits all of them. They are:
reveal, pronunciation, grading, the four grade meanings, session completion,
story unlock, words in context, and the product loop.

**Real flashcard interaction, or reading instructions?** — **Real.** This is the
strongest thing about the current design and it should survive any redesign. The
tutorial imports `Flashcard.jsx` and `GradeRow.jsx` — the *same components* the
study screen renders, sized by the *same* `studyLayout()`, with the same status
band and grade palette. `tutorial.spec.js` asserts the card's inset band shadow
and the grade row's four distinct fills and 44px targets. There is no lookalike.

**Are reveal, audio and Again/Hard/Good/Easy actually taught?** — Reveal: yes, by
doing. Audio: the control is *offered* and pointed at, and progress never depends
on hearing anything (`teachesAt` is explicit that offering is the lesson, and a
spec proves the tutorial finishes without a sound). Grades: yes — and better than
the real screen, because card 1 replaces the interval preview with **what each
grade means**. Two gaps:

- The learner **never sees a schedule interval.** `labels={v.glosses || ['','','','']}`
  (`Tutorial.jsx:284`) means cards 2 and 3 show bare grade names. The real row
  shows "10m / 1d / 4d / 9d" from `previewLabels`. So "your grade decides when you
  see it again" is *asserted on card 2 and never demonstrated.*
- The tutorial's header rail is "1 / 3" and a coaching line. The real rail is a
  segmented **session-mix bar** with new/learning/review counts and an **Undo**
  button. Neither is ever introduced.

**Does the tutorial demonstrate why Stories matter?** — Partly, and this is the
weak seam. It *states* the rule ("Finishing a session opens the next chapter"),
then shows two lines with the three new words marked and says "You just read the
words you learned." What it never does is show the learner the scene **before**
they could read it. There is no contrast, so there is no felt payoff — only a
claim of one. Given §0's finding that 16 of 24 studying learners never opened a
story, this is the single most important gap in the document.

**When the first real study session begins** — immediately after the level
question. `Onboarding.finish()` → `navigate('study')`. There is deliberately no
bridge screen (the old "preparing your training path" is gone).

**What happens after completing it** — `SessionRecap`: "Your first words,
learned", today/tomorrow tiles, and a **Recommended next** button that is always
a story when one is available.

**Is a story/reward unlocked or demonstrated?** — Both, twice, in two different
visual languages. The tutorial demonstrates a *fictional* unlock with a bespoke
screen; the real session produces a *real* one with `ChapterUnlockCard` /
`StoryUnlockCard`, which look nothing like it. Only **3 of 29** accounts ever
claimed a reward.

**Where users could get confused, skip something important, or abandon** — §3
and §5.

**Does onboarding duplicate UI that already exists?** — §4. Yes, in three places,
and the loop is explained **four separate times**.

---

## 3 · Three verified defects

These are bugs in the shipped build, not design opinions. Each was reproduced.

### 3.1 "Create account" opens the **Log in** form  ⚠️ the worst one

`Auth.jsx:20` is `useState(Boolean(intro))`. `intro` was passed by the old
pre-signup wizard. **The wizard is gone and nothing passes `intro` any more** —
`Landing.jsx:199` renders `<Auth notice={…} onBack={…} />` with no `intro`, and it
is the only caller in the codebase.

Driven through the real flow at 390px, the state after tapping **Create account**:

```
Log in   aria-pressed="true"   weight 600     ← active tab
Sign up  aria-pressed="false"  weight 400
submit button text: "Log in"
password requirement hint ("At least N characters"): absent
```

A learner finishes ninety seconds of tutorial, taps **Create account**, is handed
a **Log in** form, types an email and a password, presses **Log in**, and gets an
authentication error for an account that does not exist. This sits exactly on the
step where §0 measures a 50% drop.

`landing.spec.js:88` asserts `getByLabel('Email')` is visible — true on both
tabs, which is why no test caught it.

### 3.2 The Home tour's tutorial-suppression never fires

`Home.jsx:135` passes `suppressed: isTutorialDone()`. `isTutorialDone()` reads
`prelogin:prefs`. `Onboarding.finish()` calls `clearPreloginPrefs()`
(`Onboarding.jsx:149`), which does `localStorage.removeItem` on that whole key.
Every new account passes through `Onboarding` before it can reach Home
(`App.jsx:575`). So by the time Home first mounts, the flag is always gone.

Reproduced with a fresh-account profile:

```
tutorial flag PRESENT  → NO DIALOG                (suppression works)
tutorial flag CLEARED  → "Step 1 of 4 — Start here each day…"
```

The clearing is itself correct and was a deliberate fix (an app killed mid-setup
used to lose the reading test's estimate). The bug is that a *device-scoped
teaching record* and a *transitional handoff blob* share one storage key. Result:
a learner who just watched a session complete, a story unlock, and read two lines
of Chinese is then told, in a dimmed overlay, that "this is today's session" —
the exact third telling the suppression exists to prevent.

### 3.3 On Android, hardware Back quits the app during onboarding

The entire pre-login flow — `NativeWelcome` → 13 tutorial states → `Auth` — is
`useState` inside `Landing.jsx` at path `/`. No shell is mounted, so
`runBackHandler()` returns `null` (`backHandler.js`), and `NativeShellBridge`
falls back to `backAction('/', canGoBack)`, which short-circuits on `atRoot` and
returns **`'exit'`** → `App.exitApp()`.

Not destructive — the tutorial position is on the device and resumes — but Back
on card 2 closes the app with no warning, on the platform where Back is the most
used gesture there is.

---

## 4 · Duplication census

| # | Thing | Onboarding's version | The real app's version | Verdict |
|---|-------|---------------------|------------------------|---------|
| 1 | The flashcard | `Flashcard.jsx` | `Flashcard.jsx` | **Correct reuse.** Keep |
| 2 | The grade row | `GradeRow.jsx` | `GradeRow.jsx` | **Correct reuse** — but no intervals (§2) |
| 3 | Session complete | bespoke: 64px chip, title, one line, one pill | `SessionRecap.jsx`: 58px chip in a card, two stat tiles, accent "Recommended next", unlock cards | **Duplicate.** The learner is taught a completion screen they will never see again |
| 4 | Reading a story | bespoke: speaker eyebrow, `<mark>` underline, translation under | `StoryReaderImmersive`: full-screen, tappable words, pinyin, audio, progress | **Duplicate.** "What reading looks like" is taught with something that is not the reader |
| 5 | The loop | `loop` state — four stacked words | — | **Triplicate.** Also the web landing's four-icon diagram, also the Home tour's `home-nav` mark |
| 6 | "This is today's session" | tutorial's whole first act | Home tour step 1 | **Duplicate**, and currently *both* fire (§3.2) |
| 7 | Level question | `Onboarding.jsx` | Settings' level controls | Fine — one screen, asked once |

The loop is explained **four times**: the landing diagram, the tutorial's `loop`
slide, the Home tour's last mark, and the recap's "Recommended next".

Of the tutorial's 13 states, **4 are slides** — `welcome`, `recap`, `unlock`,
`loop`. `loop` is the purest example of the thing the brief rules out: it names,
in four words, the thing the learner has just spent ninety seconds performing.

---

## 5 · Where a learner gets confused, skips, or abandons

| Risk | Where | Severity |
|------|-------|----------|
| Taps "Create account", gets a login form, fails to sign in | state 14 | **critical** — §3.1 |
| **No Skip anywhere in the tutorial.** `actionsFor()` offers only forward actions; there is no skip, no back, no progress bar beyond "1 / 3" on cards. `ONBOARDING-AUDIT.md` and the store listing both claim "Skip tour is always one tap away" — that is the *coach-mark* tour, not this | states 3–13 | **high.** A returning-but-signed-out learner, or anyone impatient, has no exit but Back — which on Android quits the app (§3.3) |
| Third telling of "this is your session" in a dimmed overlay | state 19 | high — §3.2 |
| The story payoff is claimed, not felt — no "before" | states 11–12 | **high.** This is the 16-of-24 finding |
| Grades are taught with meanings, then the real screen shows intervals instead | states 4→16 | medium. Two different sub-labels for the same four buttons |
| The real session's mix bar and Undo appear with no introduction | state 16 | medium |
| A learner who says "I know some Chinese" is put at HSK 1 with no explanation beyond one small line | state 15 | low, but it is the only place the app can be wrong about them for weeks |
| Web visitors read a four-icon loop diagram, then perform the loop, then read it again | states 1→13 | low (marketing surface, per CLAUDE.md §1) |
| Audio silently unavailable (broken clip) shows a struck-through speaker with no explanation | state 4 | low — never blocks |

---

## 6 · Three concepts

Common to all three: the real `Flashcard` and `GradeRow`; the sandbox rule
(onboarding writes **nothing** — no card, no review, no profile — enforced by
`tutorialScript.js` importing nothing that could, plus a spec); no streaks; no
fake urgency.

---

### Concept A — Mini first session

**This is the incumbent.** It is what build 40 ships. Describing it as an option
means: fix the three defects, cut the `loop` slide, add Skip, and stop.

**Flow** — 13 states, 12 taps: welcome → 3 cards (reveal + grade each) → recap →
unlock → 2 story panels → loop → account → level → real session.

**What the learner does** — flips three real cards, hears a word if they choose
to, presses three real grade buttons, reads two lines of Chinese.

**What they learn** — the flip, the audio control, what the four grades mean, that
a session ends, that ending it opens a story, that the words appear in it.

**Account** after the tutorial. **HSK** after the account, one question.

**Stories** introduced as a bespoke two-panel payoff with the new words marked.

**Skip/back** — none today. Would need adding.

**Returning user** — solid and tested: position saved per state; a *finished*
tutorial sends the next launch straight to the account form; "Log in" from the
landing page never shows the tutorial; a nonsense saved position restarts rather
than resuming into a lie.

**Engineering** — near zero. Three bug fixes, one state deleted, one Skip button.
~1 commit for the fixes, ~1 for the trim.

**Risks** — it does not fix the 16-of-24 problem. The payoff is still a claim.
And it keeps two screens (recap, story) that teach a UI the app does not have.

---

### Concept B — Story-first loop

**The premise:** show the learner something they cannot read, teach them the
words, show it again. The payoff is *experienced*, not described.

**Flow** — 15 states, ~13 taps:

| # | State | The learner |
|---|-------|-------------|
| 1 | `scene-before` | Sees the tea-shop exchange in Chinese only — **你好！… 谢谢。再见！** — no translation, no pinyin. One line under it: *"This is where you're going. Three words gets you there."* One button: **Teach me** |
| 2–7 | 3 real cards | Exactly A's cards, unchanged — reveal, hear, grade |
| 8 | `recap` | Session complete |
| 9 | `scene-after` | **The same scene again**, now with the three words marked and translated. Nothing is claimed; the learner can simply read it |
| 10 | `unlock` | "That was chapter one. Finishing a session opens the next" |
| 11 | account → level → real session | |

**What they learn** — everything A teaches, *plus* the one thing A only asserts:
that studying converts unreadable Chinese into readable Chinese. It is the
product's entire thesis, delivered as an experience in about 100 seconds.

**Account / HSK** — unchanged from A (after the tutorial; one question after).

**Stories** — no longer a reward *announcement*. The story is the frame around the
whole tutorial: it opens the tutorial and closes it.

**Skip/back** — Skip from any state (lands on the account form, marked done).
Back one state from anything except the first, which is where Android Back should
mean "leave".

**Returning user** — identical machinery to A; two more phases in `position()`
and `resumeTutorialState`, both already generic.

**Engineering** — **small.** One new fixture (the scene, twice), two new phases,
two new `TEACHING_GOALS`, `position()` arithmetic, and one screen component that
renders `StoryLine` with marking off. The existing state machine was built for
exactly this kind of extension — phases are named by what the learner is doing
and `withGoals` derives coverage automatically. Perhaps 2 commits.

**Risks** — a wall of unreadable Chinese on screen 1 could read as intimidating
rather than intriguing; the copy carries all of that weight. And the before/after
only lands if the *same* text is visibly the same text — a different scene would
destroy the effect.

---

### Concept C — Guided real session

**The premise:** no tutorial content at all. Put the learner in the real Cards
screen and layer temporary guidance over the first few interactions.

**Flow** — account → level question → real 5-card first-run session with coach
marks on card 1 ("tap to reveal"), card 1 back (audio, grades), card 2 ("your
grade decides when you see it again") → real `SessionRecap` → real reader.

**What they learn** — the real screen, including the mix bar, Undo, the example
sentence and the real recap. Nothing is taught twice because nothing is a stand-in.

**Account and HSK** — **both must come first**, and this is the fatal constraint.
The real Study screen needs a session, a profile, a track and a card queue; every
card graded is an FSRS write. So C asks a visitor who has seen nothing but a
landing page to create an account. §0 measures 468 visitors → 64 account asks →
32 accounts *with* a pre-signup taste in front of it. C removes that taste.

**Stories** — only at the recap, as the real unlock. The learner reaches the story
after signing up, choosing a level, and grading five cards. For the two-thirds who
never open a story, this is strictly later than today.

**Skip/back** — the coach marks are dismissible (the `tour.js` mechanism already
does this well); the session itself is the app, so Back is the app's Back.

**Returning user** — trivially correct: there is no separate flow to resume.

**Engineering** — **medium-to-large, and it is mostly deletion plus risk.** Delete
`Tutorial.jsx`, `tutorialScript.js`, `tutorialFixtures.js`, `useTutorialAudio.js`
and their specs (~1,100 lines and ~40 tests). Then add coach marks *inside*
`Study.jsx`, which is the 1,550-line file CLAUDE.md §3 specifically names as the
one that must stop growing branches — and it would mean re-opening Study, which
is **frozen** as of build 39.

**Risks** — the big one: it inverts the funnel change P9 made on purpose, and the
only data we have says the funnel is already lossy at exactly that point. Second:
`Study.jsx` becomes the onboarding owner. Third: the first real session is
genuinely variable (audio may be missing, a story may not be unlockable, the
queue depends on seeded content) — a tutorial that can fail differently for
different learners is not a tutorial.

---

## 7 · Can B become C?

The user's question: use a tiny story as the motivation, but teach the actual
Study controls using the real production Study interface rather than a fake
tutorial flashcard.

**Yes — and most of it is already true.** The tutorial does not contain a fake
flashcard. It renders `Flashcard.jsx` and `GradeRow.jsx`, the real components,
through the real `studyLayout()`. The "fake tutorial flashcard" this question
guards against was deleted in P9 (`FlashcardIntro.jsx` is gone).

So the honest decomposition of C is three separable things:

| Part of C | Can it be pulled pre-account? | Should it? |
|---|---|---|
| The real **card + grades** | **Already are.** | Yes — done |
| The real **schedule intervals** on the grade buttons | Yes. `previewLabels` needs a card-shaped object, not a database — a fixture card with a plausible stability produces honest-looking intervals | **Yes.** It closes the "asserted, never demonstrated" gap in §2 |
| The real **recap screen** | Partly. `SessionRecap` takes plain props (`recap`, `forecast`, `storyUnlock`) and its only import risk is the chat-mission branch. It could be fed fixture props | Yes, if it can be done without loosening its interface |
| The real **reader** | No, and it should not be. `StoryReaderImmersive` needs a story row, `story_vocab`, segmentation and audio. Making a 100-second tutorial depend on the shelf is exactly what `tutorialFixtures.js` was written to avoid | **No** |
| The real **queue** (FSRS, `cards`, writes) | No | **No.** The sandbox is the reason the tutorial cannot ruin a learner's first schedule, and a spec enforces it |

**Conclusion: B → C is not a transition, it is a gradient, and the app is already
partway along it.** The correct move is B's framing plus two more steps along C's
gradient (real intervals, real-looking recap), stopping firmly short of the real
queue and the real reader.

---

## 8 · Recommendation

**Build B, as an amendment to A, taking two steps toward C. Do not build C.**

Named: **the story frame**.

Why:

1. **It targets the measured failure.** 16 of 24 studying learners never opened a
   story. A is silent on that. C makes the story *later*. B makes the story the
   first and last thing the learner sees.
2. **It keeps everything that already works.** The real card, the real grades, the
   sandbox, the resume, the funnel events, the twelve-tap length, the
   account-after-value order, and the eleven declared teaching goals with their
   proof test. B adds two phases to a state machine explicitly designed to be
   extended that way.
3. **It removes the slide the brief rules out.** The `loop` state names the loop
   the learner just performed; `scene-after` *is* the loop, performed. The four
   words are deleted, not relocated.
4. **C's cost is in the wrong currency.** It buys fidelity by spending funnel
   position, `Study.jsx`'s freeze, and 1,100 tested lines — to teach a mix bar and
   an Undo button.
5. **It is cheap.** Two commits of feature work on top of one commit of bug fixes.

The two steps toward C: **real schedule intervals** on the grade row from card 2
onward, and a **recap that looks like the real recap**. Both remove a "taught one
thing, shown another" seam without touching a frozen screen.

**And the three §3 defects ship first, separately, ahead of any redesign.** §3.1
in particular is losing accounts *today*, and it is a two-line fix.

---

## 9 · Implementation plan

Six commits. Each is independently shippable and independently verifiable. **P12-0
is worth cutting a build for on its own** — do not hold a live signup bug behind a
redesign.

### P12-0 — the three defects (bug fix, no redesign)

- `Landing.jsx` passes an explicit signup intent to `Auth`; `Auth` takes a real
  prop for which tab it opens on rather than inferring it from the presence of a
  now-dead `intro` string. Decision goes in a pure function, per CLAUDE.md §1 —
  something like `authEntryTab({ fromTutorial, notice })` in `prelogin.js`, tested.
- Split the tutorial's *done* record out of `prelogin:prefs` so
  `clearPreloginPrefs()` stops erasing a teaching record. Cleanest fix: the
  teaching record belongs where the other teaching record lives — the
  `offline.js` prefs store that `tour.js` already uses — so onboarding-seen state
  is in one place and the transitional blob keeps its own lifetime. Keep reading
  the old key as a fallback so an in-flight learner is not restarted.
- `backAction` learns that the pre-login flow is not the root: give `Landing`'s
  mode a real path (or register a back handler for it), so Back steps
  welcome ← tutorial ← auth and only exits from the first screen.
- Tests: `prelogin.test.js` for the tab decision and the record split;
  `nativeShell.test.js` for the back action; `landing.spec.js` asserts the
  **Sign up** tab is the active one after "Create account" (the assertion that
  would have caught this); a new e2e that a tutorial-completing account gets **no**
  Home coach marks.

### P12-1 — `scene-before` / `scene-after` (the story frame)

- `tutorialFixtures.js`: one `TUTORIAL_SCENE` carrying the exchange once, plus the
  translation and the marked words. The existing `TUTORIAL_STORY` panels become
  the "after" rendering of that same text — **one source, two renderings**, so the
  before and after can never drift apart.
- `tutorialScript.js`: two phases (`SCENE_BEFORE`, `SCENE_AFTER`), two goals
  (`sceneUnreadable`, `scenePayoff`), `position()` arithmetic, `defaultWalkthrough`
  extended. Delete `PHASES.LOOP` and `TUTORIAL_COPY.loop`; `scene-after` carries
  the final CTA.
- `Tutorial.jsx`: one new branch rendering `StoryLine` with marking off for the
  "before", on for the "after". Reuse the existing component; no new visual system.
- Copy is the risk (§6): "before" must read as an invitation, not a wall.

### P12-2 — Skip

- Skip available from every state, top-right, quiet. Skipping marks the tutorial
  done and lands on the account form — the same hand-off finishing produces,
  because a learner who skips has still decided to sign up.
- One funnel event (`tutorial_skipped`, with the state id) so we learn *where*
  people leave. This is the measurement the tutorial currently cannot make.

### P12-3 — real schedule intervals

- Give cards 2 and 3 real `previewLabels` output from a fixture card. Card 1 keeps
  the grade *meanings* — that trade was right and is tested.
- Assert the intervals are real strings, and that card 1 still shows meanings.

### P12-4 — a recap that matches the real one

- Either feed `SessionRecap` fixture props, or bring the tutorial's recap into
  visual line with it. Prefer the former **only if** it needs no loosening of
  `SessionRecap`'s interface; if it does, the latter is safer and this stays a
  presentation change.
- Must not pull Supabase, the chat mission, or the reader into the tutorial's
  import graph — the sandbox test is the gate and it stays green.

### P12-5 — docs

`ROADMAP.md` (user-facing), this file's outcome section, `SESSION-HANDOFF.md`,
and `ONBOARDING-AUDIT.md` gets a header line pointing here.

### Verification, every commit

`npm run lint`, full vitest, `npm run build`, `npm run build:public`, full
Playwright, `npx cap sync`. Plus the sandbox spec (`tutorial.spec.js:311`, "writes
nothing") and the goal-coverage test, which are the two that stop this redesign
from doing damage.

---

## 10 · Risks carried forward

1. **The "before" scene can intimidate.** Mitigation: three characters' worth of
   Chinese, not a paragraph, and copy that frames it as a destination. This is the
   one thing worth a device round on its own.
2. **We still cannot measure the tutorial.** Six funnel events exist and one
   person has ever fired them. P12-2's skip event and a real cohort are the only
   fix; every ordering decision after this stays a judgement call until then.
3. **`signup_started` / `signup_completed` are blind to OAuth.** Worth fixing so
   §0's funnel can be read at all — but it is an analytics change, not onboarding,
   and it should be its own commit.
4. **The level question is still a guess for "I know some Chinese".** 4 of 29
   accounts started above HSK 1. Out of scope here; noted.
5. **Story reading is the real problem and onboarding is only half the lever.**
   B makes the first story vivid. Whether learners *keep* reading is a Stories and
   Home question, and both are frozen. Do not expect P12 to move the 16-of-24
   number on its own.

---

## 11 · What is explicitly out of scope

Home, Stories, Practice, Profile, Study, navigation, global tokens. The web
marketing page's feature cards and loop diagram stay (CLAUDE.md §1 keeps the web
as the public surface). `PlacementTest`, the tier rows, and the prior-knowledge
seed are untouched. The Stories coach-mark tour keeps its two marks.

---

## 12 · What shipped (P12-0 … P12-4, 2026-08-12)

All approved work is implemented. Fixed product decisions honoured throughout:
account stays after the value moment; Concept C was not built; the B→C gradient
stopped at interval previews and a production-shaped recap.

| commit | what |
|--------|------|
| `56402c4` | **P12-0** — the three §3 defects. Shipped alone as **TestFlight build 41** |
| `a336ab8` | **P12-1** — the story frame: scene-before / scene-after from one `TUTORIAL_SCENE`; the loop slide deleted |
| `617c55e` | **P12-2** — Skip on every state; `tutorial_skipped { state_id }` |
| `9170d81` | **P12-3** — schedule previews on cards 2–3, fixture-pinned against the production preview |
| `30b88ee` | **P12-4** — recap/unlock in `SessionRecap`'s visual system, without the component |

**The walk now** (12 states, 11 taps): welcome → scene-before (the exchange,
Chinese only — "You probably can't read this yet. It takes three words.") →
card 1 front/back (grade meanings) → card 2 front/back (schedule previews) →
card 3 front/back (bare product) → recap (production-shaped, Today tile) →
unlock → scene-after (same fixture, marked + translated — "The same scene —
this time you can read it." → Create account) → account.

Guarantees, each pinned by a spec: the two scene states hold the **same
object**; the scene's Chinese minus the three taught words is pure punctuation
(so the payoff claim is literally true); the loop slide never returns; a
pre-P12 saved position in a `story`/`loop` phase restarts while an old CARD
position still resumes; `retreat()` walks the new shape; the sandbox import
graph is unchanged (only tests reach the scheduler); the fixture intervals
match the production preview byte-for-byte on the learning steps and sit inside
the fuzz band on Easy.

Measured at 320/390/430, light and dark: every state fits its viewport — zero
overflow on both axes everywhere. The only sub-44px targets anywhere are the
real card's own Replay/speed controls, identical to production Study
(pre-existing; not introduced here). Skip is a 44px target on every state.

Deliberately kept: the `unlock` beat between recap and scene-after. It carries
the `storyUnlock` teaching goal ("finishing a session opens the next chapter" —
the rule itself), and the recap→unlock→read sequence mirrors what a real
session produces. Deleting it was considered and rejected as beyond the
approved scope.

---

## 13 · P12-6 — the reading lesson (2026-08-12)

The scene payoff taught one promise: *your flashcards make stories readable.*
It could not teach the second, and the second is the one that removes the fear
of starting: **you don't have to know every word before you read, because
inside a story an unknown word is one tap away.**

So one more line follows the payoff — and only after it, so the payoff scene
stays a scene the learner can read *completely*:

> *One more line — Mei looks outside.*
> **下雨。**
> See a word you don't know? Tap it.

`下雨` is drawn the way the real reader draws a new word: underlined, faintly
tinted, part of the sentence — not a chip, because a filled rounded box at 30px
reads as a button and the lesson is that *words in text* are tappable. Its type
already clears 44px, so the target is honest without a visible box making it so.
The word is **not** translated on the page.

**The gate is in the state machine, not the UI.** `actionsFor(TAP_WORD)` returns
`[LOOKUP]` until the word has been opened once, and only then adds `CONTINUE`.
There is no Continue to hide, no button to disable, and no way to reach the
account by tapping past it — Skip remains the only other door, which is exactly
the escape the design already has. Re-tapping reopens the answer and is
explicitly not progress. `retreat()` un-looks first and then leaves, so Back
re-arms the question; `looked` is never persisted, so a resumed tutorial
performs the tap on the run it is on.

**The answer is the production component.** `WordLookupSheet` — the same one the
paced, chat, scene, manhua and immersive readers use — anchored over the word as
a popover, showing hanzi, `xià yǔ`, the `HSK 1` chip, "to rain", "From this
line" with the word lit inside it, and a play button fed by the public bucket
clip. Nothing was rebuilt and nothing was widened for the tutorial: the only
change to the component is that **`onAddToDeck` is now optional**, so a caller
with no deck (a pre-login tutorial) draws no bookmark instead of a button that
could only dead-end. All eight production callers pass it, so production is
untouched. `dictWordFor` returns null for a word with a vocabulary row, so the
sheet never reaches the dictionary here — and the e2e that proves the tutorial
writes nothing now walks through the lookup to keep it that way.

The account ask moved to this state; `scene-after` continues instead. No extra
slide, no dictionary tour, no saving, no flashcard creation, no second tap.

**Shape now:** 14 states (`tap-word` counts its before and after), **13 taps**.
Measured at 320/390/430 × light/dark, in all three of its conditions (gated,
sheet open, dismissed): zero overflow on both axes, zero sub-44px targets.

| commit | what |
|--------|------|
| *(P12-6)* | the reading lesson: one line, one unknown word, the production lookup, gated on the tap |
