# Device QA — the mobile shell

For TestFlight (iPhone) and the Android build. **One pass, no fixing while you
test** — write findings down and we decide from evidence afterwards.

Everything here is behaviour the simulator and the e2e suite cannot judge:
touch latency, whether a transition reads as motion or as lag, haptics, the
silent switch, and the one question that matters most (§F).

**Record for every issue:** device · screen/flow · steps · expected · actual ·
category (navigation / motion / layout / native integration / data /
accessibility) · **P0** release blocker, **P1** hurts app feel, **P2** minor
polish.

---

## A · Launch

Cold launch (force-quit first), in dark mode, then in light mode, then resume
after backgrounding for ~30 seconds.

- [ ] No white flash before the first paint — dark mode especially
- [ ] Ensō splash hands over to a ready screen, not a half-loaded one
- [ ] No font swap or layout jump once text appears
- [ ] Status bar (clock, battery) matches the theme, both modes
- [ ] Resume shows the app as you left it — no loading screen, no reload

Then background it for **20+ minutes** and resume:

- [ ] Home's numbers refresh quietly, nothing blanks
- [ ] Background for a few seconds instead: nothing visibly happens at all

Scroll a long screen — Practice, Stories, Profile — and watch the **right edge**:

- [ ] No grey bar rides the edge of the screen while scrolling (the web view's
      own scroll indicator; hidden in the native shells, verifiable only here)
- [ ] Scrolling itself is unchanged: it still flings, decelerates and rubber-
      bands, and coming back to a screen still lands where you left it

## B · Tabs

Home → Cards → Stories → Practice → Home, several laps, briskly.

- [ ] Touch response is immediate — no dead first tap
- [ ] The selected tab is always the screen you are on
- [ ] Nothing visibly reloads or re-fetches
- [ ] Scroll position and any typed text survive the round trip
- [ ] No skeleton flash, no entrance animation replaying

**Record explicitly — the 150ms tab fade feels:** good / slightly slow /
clearly slow. Do not change it before this is answered on a real device.

### B2 · The bar itself (P8 — the questions this build exists to answer)

Answer in words, not ticks. The bar is **Home · Stories · Cards · Practice ·
More** with Cards in the physical centre, five icons drawn for this app, and
still no count, no top indicator and no raised button. Cards alone carries a
**container**: a 42×34 rounded box behind its glyph, inside the bar,
barely-there neutral at rest and accent-tinted when selected. Cards' glyph is
27.5px, the other four 21–22px, and Practice is drawn quieter than it was.

**The one that decides the task — this is an A/B against build 34:**

1. [ ] Build 34 read **Practice · Home · Cards · Stories · More**. This one
       reads **Home · Stories · Cards · Practice · More**. Which is better in
       the hand? Home now starts the row, where the eye starts and where the app
       opens; Stories sits beside Cards so the centre of the bar is the language
       itself; Practice is demoted rightward to what it is. The old order bought
       a contiguous Home → Cards → Stories loop and paid for it by opening on a
       drawer. **Judge it physically — do not reason back to the loop.** If
       neither feels right, that reopens the information architecture rather
       than a third permutation.
       - [ ] Does the row feel **balanced**, or does the centre feel crowded now
             that Stories and Cards are adjacent?
       - [ ] Does **Practice** feel appropriately secondary at index 3?

**The Cards-emphasis pass, in priority order:**

2. [ ] Does the eye **immediately** understand that Cards is the core action —
       and does it still read as a **tab**, not a button parked on the bar?
3. [ ] **The risk this pass introduced, now cut by 45%:** at rest, Cards has a
       container and no other tab does. A box behind a tab is Android's
       convention for *selected*. It has already been quieted once — measured
       against the bar's own ground it moves 6 of 255 at rest against 19 when
       selected — so the question is whether it went far enough, and whether it
       is now so faint it does nothing. On Home, Stories and Practice, is there
       any moment where you read Cards as the selected tab? Can you see the
       container at all in daylight? Report which of the two it is.
4. [ ] Is the active container **restrained**? It is a 12% tint of the accent,
       not a red block, deliberately. Too loud / about right / too faint?
5. [ ] Does **Practice** still read as a shelf of drills now that it is drawn
       quieter, or has it gone too far and become decoration? (It was measurably
       the heaviest object on the bar before this pass — 158px² of ink against
       Cards' 147 — which is what "Practice competes with Cards" was.)
6. [ ] Is the Cards glyph recognisable as **flashcards** at 27.5px? It is two
       portrait cards now, one behind the other, where it used to be two
       landscape ones that read as abstract rectangles.
7. [ ] Do the five icons still look like **one designed family** after the
       rebalance?
8. [ ] Do **Home → Cards → Stories** read as the central learning loop?
9. [ ] Is the **selected tab obvious without the underline**, in dark mode
       especially? Measured, active and inactive differ by hue and almost not at
       all by brightness (1.26:1 dark), so the outline→filled swap is carrying
       it — check that it does.
10. [ ] Does the bar **feel any taller**? It must not — 58px, unchanged, and the
       container is inside that.
11. [ ] Does the **320px Study screen** feel marginally less cramped? (It gained
       4px it was never using.) Check the bar on a 320 too: the container has
       11px of column either side of it there.
12. [ ] Is the **level test discoverable from Practice**, and does its locked row
       explain what opens it?
13. [ ] Does the whole bar look **less like a stock template** than build 33 did?

## C · Study

Cards → grade several → play pronunciation → **X** → paused → Resume → grade
one more → **Finish for now**.

- [ ] Tab bar hides cleanly as the card appears; Study takes the freed space
      without a jump
- [ ] Haptics on grading feel right — present, not chatty
- [ ] **Pronunciation plays with the iPhone silent switch ON** (the whole
      reason for the AVAudioSession work)
- [ ] Audio stops the moment you leave Study — switch tabs mid-playback
- [ ] X reads as "leave this session", not as a pause button
- [ ] The paused screen is understandable in one glance, and the counts are right
- [ ] Resume continues the same session; Finish keeps the progress

Then, with the answer of a card revealed: **X** → another tab → back to Cards.

- [ ] The Continue screen appears in **silence** — no word plays behind it
- [ ] Do the tab round trip several more times: still silent, every time
- [ ] Continue → the same card, still revealed → Replay still speaks it
- [ ] In dark mode, the band across the top of the card is a quiet tint of the
      card, not a bright bar laid across it — and in light mode it looks exactly
      as it always has

## D · Stories

Shelf → scroll well down → open a series → open chapter 1 → exit → Back →
shelf.

- [ ] Series slides in from the right and leaves the same way
- [ ] Reader arrives differently from the series page (it rises)
- [ ] Reader's top and bottom bars stay put during and after the transition —
      **watch this one on iOS**, it is the case the no-transform rule exists for
- [ ] Exiting the reader lands on the **series**, not the shelf
- [ ] The shelf comes back at exactly the offset you left it
- [ ] No loading flash, no blank frame, no network spinner anywhere
- [ ] Stories stays the selected tab throughout

## E · Continue Reading

Stories → Continue Reading → Reader → exit.

- [ ] Opens the right chapter
- [ ] Exit lands on the shelf — never Home
- [ ] Progress on the shelf updates without a reload

## F · The whole loop — the important one

Home → Cards → Study → session recap → unlock a chapter → open the reward →
Reader → finish → back into the app. Use it like a learner, not a tester.

**One question, all the way through:**

> At what exact moment, if any, does this start feeling like a website rather
> than an app?

Write down the precise screen or transition. "Somewhere in Stories" is not
useful; "the half-second after the recap's Read now" is.

## G · Android hardware Back

Physical Back key only.

- [ ] Stories → Series → Reader → Back → Series → Back → shelf
- [ ] Cards → session → Back → paused → Back → Home → Back → exits the app
- [ ] More sheet open → Back closes **only** the sheet
- [ ] Settings → Back → Profile (not the tab underneath)
- [ ] Profile → Back → the tab you opened it from
- [ ] FillBlank opened from Practice → Back → Practice
- [ ] FillBlank opened from a story reward → Back → Stories
- [ ] A deep-linked series → Back → the shelf, still inside the app

**Never** several presses walking a browsing history.

## H · State and memory

Switch hard between all four tabs, in and out of Stories and the reader, for a
few minutes.

- [ ] No blank pane, ever
- [ ] No screen that comes back wrong or empty
- [ ] No unexpected reload
- [ ] No slowdown building up
- [ ] The shelf never loses its place

---

## Known, already fixed — confirm they stay fixed

Two bugs were found by measurement just before this pass. Both are the kind
that only show on a device, so confirm them explicitly:

1. **A pushed screen used to render below an empty full-height box.** Opening
   "Your words" from Practice put the screen 3,714px down the page — a blank
   screen with the real one under the fold. Check any pushed screen (Words,
   Dictionary, a series page) opens **at the top**.
2. **Scroll position carried across a push.** Opening a screen from a
   scrolled-down list landed part-way down the new screen. Check a push always
   starts at the top and a Back always returns to where you were.

## Not implemented — do not file these

- **iOS edge swipe-back.** Deliberately absent; a fake one is worse than none.
- **The outgoing screen does not animate.** Only the arriving one moves.
- **An app left open across midnight** updates on resume, not on the stroke of
  midnight while you watch it.
