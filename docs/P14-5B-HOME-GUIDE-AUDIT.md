# P14-5B — Home as a guided daily flow

**Status:** concepts rendered, one recommended, **production Home untouched.**
**Date:** 2026-08-13.

P14-5 made Home's material better and its composition no better. On a device it
read as *messy, over-designed, faintly generated, and not useful enough* — so the
composition is reopened and the direction changes: Home stops being a dashboard
and becomes the learner's **guide** through one day of training.

The loop is **Cards → Story → Practice**, and the rule the whole screen hangs on
is that **exactly one step is loud at a time**.

Navigation, Study, Stories, Practice, Profile and onboarding are unchanged and
stay frozen. Home may *orchestrate* them; it reimplements none of them.

---

## 1. What the app genuinely knows

The guide can only be as honest as the state behind it, so this was settled
first — against the live schema and the modules that already fetch it, not from
memory. Everything the concepts display comes from this table.

| The guide wants to know | Where it comes from today | Reliable? |
|---|---|---|
| Reviews due | `homeCounts.dueCount + learnCount`, level-scoped, day-based availability | **Yes** |
| New cards available | `homeCounts.newCount` — already capped by the daily-goal remainder | **Yes** |
| Cards done today | `daily_activity.studied_cards` for today. `homeCounts` already fetches the row but keeps only the **dates** (for `rhythm7`); `newDoneToday` counts new cards only | **Almost** — one additive field |
| An unfinished card session | **Nothing.** Study builds its queue fresh on every entry; there is no session row and no resume state | **No** |
| Current / unlocked story | `getSessionRewardTeaser` (reward chapter: `locked` · `banked` · `unlocked-today` · `all-unlocked` · `series-complete`), falling back to `getDailyStoryCard` | **Yes** |
| Current chapter | `chapterInfo()` → number, title, native label | **Yes** |
| % known | `calculateStoryReadability` — computed on the **daily-story** path only | **Partly** |
| Story read today | `story_reads.read_at` (the row is fetched; only IDs are used today) and `story_reward_claims.claim_date` | **Almost** — one date compare |
| Weak / slipping words | `homeCounts.weakCount` — lapses ≥ 2 and stability < 21 | **Yes** |
| Which Practice activity to recommend | `practicePlan.pickPrimary()` — weak words → grammar due → Listening. Existing, tested, and **not** an "AI recommendation": two counts and a fallback | **Yes** |
| Practice done today | **Nothing.** No per-day practice record exists. `writing_stats.last_practiced_at` covers the Writing drill alone; `analytics_events` is a write-only measurement surface and must not become product state | **No** |
| How long the session takes | `sessionEstimate` — derived from the actual queue composition. Story and Practice have no derivable duration | **Cards only** |

**Consequences, all of which the concepts obey:**

- Nothing on Home may say *"continue where you left off"* — that state does not exist.
- A reward chapter shows **no % known**; the daily story does. The step drops the
  fact rather than inventing one.
- **Practice is never "done because you did it."** It completes on *nothing needs
  attention* (no weak words, no grammar due), which is a true statement about the
  data. That is the honest version of step 3's tick.
- The context line carries a duration **only** while Cards is the active step.

**Two additive reads would raise fidelity, with no new tables and no new
backend** — both from rows already being fetched:

1. keep `studied_cards` for today out of the `daily_activity` row `homeCounts`
   already reads → "22 cards practiced" instead of "You're caught up";
2. compare `story_reads.read_at` against today → step 2 can tick.

Until they exist the guide degrades to a quieter true line, never a guess.

---

## 2. The rules, as a tested module

`src/homeGuide.js` is the decision half — pure, no React, no Supabase, 18 tests
in `homeGuide.test.js`. All three concepts render **the same** output of it, so
the comparison below is about composition and nothing else.

- **One active step.** The first step with work in it. Everything after is
  `upcoming`; `done` and `unavailable` keep their own status wherever they sit.
- **A CTA exists only on the active step** (asserted).
- **It never manufactures work.** No story → `unavailable`, stated plainly. A
  locked chapter names the mechanic that opens it ("Finish cards to unlock")
  instead of hiding it.
- **An unknown material fails safe:** counts unloaded or failed → status
  `unknown`, no numbers, and the step is still reachable. A screen that cannot
  count must not lock the door.
- **Two completion headlines, because they are two different days.** Work
  happened → *Training complete* with what happened. Nothing waiting and nothing
  done → *Nothing waiting today · You're caught up*. One headline for both
  congratulates a learner for opening the app, which is the fake-achievement
  pattern CLAUDE.md §1 rules out. The render lab is what made this obvious.

---

## 3. A finding worth more than the concepts: the artwork is 16:9

Production story art is **1344×756** — a painted 16:9 scene with the characters
centred (`public/story-covers/generated`, and every published Chinese story has
one). P14-5's Home crops it into a **72px near-square**, which throws away most
of the picture and all of its composition. Stories' shelf uses 2:3 posters, which
crop it too.

Every concept here shows the artwork at the ratio it was drawn at, and the
difference is not subtle: it is the one element that makes Home look like a
product with content in it rather than a settings screen with a thumbnail.

---

## 4. The three concepts

Rendered at 320 / 390 / 430 × light / dark × five learner states — Cards active,
Story active, Practice active, training complete, and a **quiet day** (caught up,
no chapter, nothing slipping, nothing done). 90 frames. `/dev` → "Home concepts",
captured by `tests/e2e/p14-home-concepts.spec.js` (gated on `P14_CONCEPTS`, so CI
never runs it).

All three are built **only** from the existing token scale — no new hex, font
size, radius or literal shadow. `designSystem.guard.test.js` counts dev files
too, which is deliberate: a concept that needs a value the system cannot express
is a concept that cannot ship.

### A — Editorial Guide *(recommended)*
Almost no bounded surfaces. A small context line; the count set in `display`
type with its noun under it; one dimensional object cropped by the page edge; one
solid vermilion button; then the rest of the sequence as numbered lines under a
hairline, each carrying the real artwork of what is coming. Progress is pinned to
the foot of the page.

### B — Guided Dojo
The same sequence as a training-hall register: an ink rail down the left, a
numbered seal per station, and the current station raised on a paper plaque with
a lacquer spine. Material depth instead of type scale.

### C — Playful Guide
The strongest state change: the sequence lives in a compact ribbon at the top and
the current step is a full lacquer plate below it. When a step completes the plate
is *replaced* rather than resized.

### Scored, harshly (10 = the bar the brief set)

| | A | B | C |
|---|---|---|---|
| 1. Next action obvious in <1s | 9 | 9 | **10** |
| 2. Looks like a professional native app | 7 | **9** | 9 |
| 3. Avoids the AI-dashboard look | **9** | 8 | 6 |
| 4. Feels like Hanzi Dojo | 8 | **9** | 8 |
| 5. Cards → Story → Practice obvious | 9¹ | **10** | 9 |
| 6. Enough whitespace | **9** | 7 | 7 |
| 7. Real artwork looks important | **10** | 7 | 8 |
| 8. Only one dominant object | 9 | 9 | 9 |
| 9. Dark mode intentionally designed | 8 | 8 | **9** |
| 10. Survives boring / empty states | **9** | 7 | 6² |
| **Total** | **87** | 83 | 81 |

¹ 6 on the first pass. A marked its sequence with a dot, a ring and a tick —
three shapes that say *state* and nothing that says *order*, which is the one
thing Home exists to communicate. The number is now the mark and the tick
replaces it once a step is behind you. That single change is what moved A ahead.

² C had **no quiet register**: a day with nothing waiting still got the full
lacquer plate, shouting at a learner who is simply up to date. The lab version now
falls back to paper for that state — a special case A and B never needed.

### What the first render pass got wrong (all fixed, all worth recording)

- **200px of dead space** under every concept. Progress now pins to the foot of
  the page, which is where context belongs — and the air above it reads as
  deliberate instead of left over.
- **The paper deck object read as an edit pencil.** A tapered diagonal stroke on
  a card is the compose glyph; this is the third time that misread has appeared in
  P14 (twice in P14-3). Two ruled lines say "word card" without drawing a word.
- **The objects were too pale.** Faces mixed *into* the surface at 52–88% gave
  three pink rectangles; the accent now carries the faces and depth comes from
  mixing toward `--text`.
- **A 40px one-liner per step read as a settings row.** The sequence is three
  objects on the screen, not three rows in a list.
- **Dark mode looked washed** — the lab drew the page's background image at full
  strength instead of `var(--bg-image-opacity)` (0.4 paper / 0.06 dark). A lab bug,
  but it would have been a real one had the pattern been copied into Home.
- **The completed day lost its record in B**, and **C printed "Today's training"
  twice.**

---

## 5. Recommendation

**Concept A — Editorial Guide, with the numbered sequence.**

It wins on the three criteria that this phase exists for: it has the fewest drawn
boxes of the three (the anti-AI rule is a rule about *count*), it treats the
artwork as content rather than as a thumbnail, and it is the only one that needs
no special case to stay calm on a boring day. B's register is genuinely excellent
and is the fallback if a device says A reads too flat; C is the one to revisit if
Home ever wants more energy than restraint.

**On migration, A should take exactly two things from the others and nothing
else:** B's numbered marks (already borrowed above) and C's rule that a
nothing-waiting day is drawn on paper, not on lacquer.

**Removed from Home, and the case for each:** the week visualisation (a
yes-or-no per day that changes nothing about what to do now), the ten-segment
progress rail (progress is context; one line and a hairline is enough), the large
lacquer hero as a *permanent* fixture (it becomes the active step, which is
sometimes not Cards at all), and the 72px cover (replaced by the artwork at its
real ratio). Detailed history belongs in Profile, which already has it.

**Not built, deliberately:** no XP, no streak, no currency, no lesson path, no
confetti. The completion state is one line, one summary and — only when something
was actually earned — one seal.

---

## 6. What migration will and will not touch

- **Will:** `Home.jsx` composition; `homeGuide.js` (already landed, tested);
  `homeCounts.js` for the one additive field; `homeStory.js`/`storyRewardData.js`
  for the read-today date compare.
- **Will not:** navigation, caching (`dataCache` keys and invalidation stay as
  they are), the Study queue and FSRS, story unlock mechanics, the Story Reader,
  Practice drill behaviour, Android Back, tab persistence.
- **Deleted at migration:** `HomeConcepts.jsx`, `homeConceptFixtures.js` and the
  harness spec. The winning concept's objects move into `heroObjects.jsx`.
