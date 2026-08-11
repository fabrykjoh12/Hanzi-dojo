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

Answer in words, not ticks. The bar is now **Practice · Home · Cards · Stories ·
More** with Cards in the physical centre, five icons drawn for this app, and
nothing else on it — no count, no top indicator, no container, no raised button.

**The one that decides the task:**

1. [ ] Does having **Practice on the far-left edge** feel unnatural in real use?
       The left column is where the eye starts a row, and it now holds the
       quietest destination. If it feels wrong, say so and stop there — the
       answer is *not* to slide Practice between Home and Cards, because that
       breaks the contiguous Home → Cards → Stories loop the order exists for.
       It reopens the information architecture instead.

**The rest:**

2. [ ] Does the eye naturally land on **Cards**, and does it still read as a tab
       rather than a floating action button?
3. [ ] Do **Home → Cards → Stories** read as the central learning loop?
4. [ ] Do the five icons look like **one designed family**? Is the Cards glyph
       recognisable as flashcards at 25px, and does Practice read as drills now
       that the bullseye is gone?
5. [ ] Is the **selected tab obvious without the underline**, in dark mode
       especially? Measured, active and inactive differ by hue and almost not at
       all by brightness (1.26:1 dark), so the outline→filled swap is carrying
       it — check that it does.
6. [ ] Does the bar **feel any taller**? It must not — 58px, unchanged.
7. [ ] Does the **320px Study screen** feel marginally less cramped? (It gained
       4px it was never using.)
8. [ ] Is the **level test discoverable from Practice**, and does its locked row
       explain what opens it?
9. [ ] Does the whole bar look **less like a stock template** than build 33 did?

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
