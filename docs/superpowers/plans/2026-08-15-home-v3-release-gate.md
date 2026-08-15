# Home V3 Production Regression and TestFlight Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the approved Home V3 and three-root mobile navigation preserve production behavior across data states, routes, devices, native history, and the full release gate before conditionally uploading TestFlight.

**Architecture:** Keep the approved UI fixed. Add pure state/compatibility decisions with focused Vitest coverage, connect them to existing Supabase truth (`cards`, `story_reads`, grammar due counts), then exercise the real React routes through deterministic Playwright fixtures. Release only the exact verified and pushed commit; TestFlight remains conditional on an available signed macOS archive lane.

**Tech Stack:** React 19 JSX, Vite 8, Vitest, Playwright, Capacitor 8, GitHub Actions, Xcode/TestFlight when a signing lane exists.

## Global Constraints

- Do not redesign Home or navigation.
- Keep Stories — Home — Practice visible; preserve `/study`, StoryReader routes, deep links, browser history, and native Back behavior.
- Legacy `/cards` resolves to `/study`; legacy `/more` resolves to `/profile`, both with history replacement.
- Motion stays at CTA 120/140ms, navigation 210ms, page settle 190ms, stage change 340ms, reduced motion 130ms.
- No push or TestFlight upload while any required check is red.
- Stop after TestFlight upload or after reporting a concrete release blocker.

---

### Task 1: Lock route and identity compatibility

**Files:**
- Modify: `src/routes.js`
- Modify: `src/App.jsx`
- Modify: `src/routes.test.js`
- Verify: `src/MobileNav.jsx`, `src/HomeV2NavGlyphs.jsx`

**Interfaces:**
- Produces: `legacyRedirectPath(pathname)` returning `/study`, `/profile`, or `null`.
- Preserves: `pathToView()`, `viewToPath()`, `storyRoute()`, and native deep-link routing.

- [ ] Add failing route tests asserting `/cards` → `/study` and `/more` → `/profile`, including trailing slashes.
- [ ] Run `npx vitest run src/routes.test.js` and confirm the new assertions fail.
- [ ] Implement `legacyRedirectPath()` and an App-level `replace: true` redirect without adding legacy items to visible navigation.
- [ ] Run route, native-shell, nav-config, and mobile-nav-state suites and confirm they pass.
- [ ] Record that production Stories uses `StoriesGlyph`, Practice uses `PracticeGlyph`, and Home uses `HomeGlyph` from `HomeV2NavGlyphs.jsx`.

### Task 2: Make the daily Home state machine data-backed

**Files:**
- Modify: `src/homePresentation.js`
- Modify: `src/homePresentation.test.js`
- Modify: `src/homeStory.js`
- Create: `src/homeStory.test.js`
- Modify: `src/Home.jsx`

**Interfaces:**
- Produces: `homeDailyStage({ counts, daily })` returning `cards`, `story`, `practice`, `complete`, or `caught-up`.
- Extends daily story data with `completedToday`, derived from `story_reads.read_at`; never from mock-only flags.

- [ ] Add failing pure tests covering cards waiting, cards clear/story ready, story completed/grammar due, all work complete, no story available, and failed counts.
- [ ] Add a failing story-read-date test proving `completedToday` is derived from a real `read_at` timestamp for the learner’s local day.
- [ ] Run the focused tests and confirm red.
- [ ] Implement the minimal pure decisions and query `story_id,read_at` from `story_reads`.
- [ ] Bind the approved compressed Cards, primary Story, primary Practice, calm complete, and honest caught-up states without changing fixed geometry or typography.
- [ ] Run the focused tests and confirm green.

### Task 3: Lock Home → Study → Home agreement

**Files:**
- Modify: `tests/pages/HomePage.js`
- Modify: `tests/e2e/home.spec.js`
- Modify: `tests/fixtures/mockSupabase.js` only if mutable deterministic card state is needed.
- Verify: `src/homeRefresh.js`, `src/homeCounts.js`, `src/studyAvailability.js`, `src/Study.jsx`.

**Interfaces:**
- Consumes: existing `shouldRefreshHome('study', ...) === true` and canonical Study availability.
- Proves: the return to `/` refetches counts and advances the Home stage.

- [ ] Update stale Home page-object locators to the approved V3 copy and landmarks.
- [ ] Add an E2E path: Home → Start cards → reveal → grade → finish → return Home.
- [ ] Assert the refetched hero count, Story unlock, next action, URL/history, and absence of an obsolete Cards tab.
- [ ] Run `npx playwright test tests/e2e/home.spec.js tests/e2e/study.spec.js` and resolve only concrete regressions.

### Task 4: Prove geometry, fonts, states, motion, and native contracts

**Files:**
- Create: `tests/e2e/home-v3-regression.spec.js`
- Verify: `src/MobileNav.jsx`, `src/Home.jsx`, `src/index.css`, `src/nativeShell.test.js`, `src/routes.test.js`.

**Interfaces:**
- Matrix: 320/390/430 × light/dark × Home/Stories/Practice active.
- Geometry assertions: no horizontal overflow, nav inside viewport/safe-area model, content clearance, ≥44px buttons, one-line labels, neutral Home on side states.

- [ ] Add deterministic route/state fixtures without production-only test switches.
- [ ] Assert Mona Sans is loaded, Chinese headings use the approved stack, and font readiness does not move measured headline bounds.
- [ ] Assert motion durations and reduced-motion values from computed styles; capture a bounded frame sample for clipping/layout changes.
- [ ] Run the new matrix suite and the existing native-shell, routes, story reader, and study mobile-fit suites.
- [ ] Capture final proof screenshots outside committed product assets.

### Task 5: Run the exact release tree

**Files:**
- Modify: `ROADMAP.md`
- Inspect: all intended production, test, native, and asset diffs.

**Interfaces:**
- Required commands: `npm run lint`, `npm test`, `npm run build`, `npm run build:public`, `npx cap sync ios`, relevant focused suites, and `npm run e2e`.

- [ ] Remove lab-only and tooling artifacts from the commit scope; retain only production assets, source, tests, native sync changes, plan, and roadmap.
- [ ] Run all required commands on the exact final tree and record exit codes/counts.
- [ ] Confirm iOS synced web assets contain the exact final build while respecting repository ignore rules.
- [ ] Review `git diff --check`, the final staged diff, and the commit scope.

### Task 6: Push, authoritative CI, and conditional TestFlight

**Files:**
- Modify only release metadata required by the existing signed lane.

**Interfaces:**
- Produces: one migration commit SHA, one pushed branch/PR head, and—only if available—one IPA whose embedded source SHA equals that commit.

- [ ] Commit the explicit intended file set and push `codex/home-v3-final-craft`.
- [ ] Open/update the PR and wait for authoritative CI on the exact head SHA; ignore only the documented dead Workers checks.
- [ ] If any required check is red, stop before TestFlight and report the failing evidence.
- [ ] If CI is green, inspect the repository’s signing/upload lane and credentials without exposing secrets.
- [ ] If a signed macOS lane exists, bump the build number, archive, validate, upload, and record the Delivery UUID.
- [ ] If no signed macOS lane exists, stop and report that concrete blocker; do not fabricate an IPA, build number, archive result, or Delivery UUID.
