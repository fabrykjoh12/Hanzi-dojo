# SRS / scheduling / data-integrity review — commit 9a9f58f

Scheduler discovered: ts-fsrs **5.4.1** (package-lock + node_modules), `fsrs(generatorParameters({ request_retention: r, enable_fuzz: true }))` (src/srs.js:62-70); r = profile dial 0.85/0.90/0.95, default 0.9; library-default learning steps 1m/10m, relearning 10m, short-term on. Grade map 0..3 → Again/Hard/Good/Easy (srs.js:139-144) is correct. Learning/relearning persisted with `due_at = now` (srs.js:237) by design (CLAUDE.md §4).

Harnesses (audit-only, outside checkout; run with checkout's vitest via `vitest.config.mjs` here):
- `addtodeck.test.js` — real `buildStudySession` over the repo's capped PostgREST fake.
- `sync.test.js` — real `enqueueGrade`/`flushOutbox`/`gradeCardWrite` + JS model of `grade_card` (20260906120000) incl. PostgREST uuid cast.
- `sched.test.js` — fake clock, run under TZ=UTC, Pacific/Auckland, America/Los_Angeles (logs `sched-*.log`).
- `mastery.test.js` — time-to-"mastered".
Checkout verified clean (`git status` empty) after runs.

Prod (read-only aggregates, bvqvturqupbggxaeihvi): 2,376 cards; 1,070 inert claims; 0 scheduler-state rows with reps<1; 0 new rows with reps>=1; 88 `state='new', reps=0, prior_known_at null` rows across 6 users (all >2 days old, oldest 2026-07-02); `20260822180000` absent from schema_migrations and its constraint absent; latest applied 20261028123444; test_attempts.attempt_date default CURRENT_DATE, DB TimeZone UTC; review_logs 2,967 (640 without client_op_id); 0 cards with logs>reps, 60 with logs<reps; 168 user-days with logs: 24 have daily_activity.studied_cards < log count (14 below half), 8 have no activity row (UTC-bucketed, approximate).

---

## SRS-01 — Words added to the deck are never studied (and eat today's new-word allotment)
- Severity **High** — the reader→deck→review loop (the product's differentiator) silently drops words; real users affected today.
- Evidence: reproduced-automated + prod aggregate. Confidence H.
- Refs: every add-to-deck inserts `state:'new', reps 0`: src/Words.jsx:59-62, src/StoryReaderImmersive.jsx:528-534 and :546-560, src/useStoryReaderCore.js:408-413, src/Dictionary.jsx:193-196, `dict_add_to_deck` (supabase/migrations/20260907010000_cap_dict_add_to_deck.sql:250-251). Study queue: src/sessionPrep.js:119 (carded vocab → `startedVocab`), :155 (new items = vocab WITHOUT a card), :122-123 → src/studyAvailability.js `dueLearningCards`/`dueReviewCards` → src/srs.js:175-177 (`isCardDue` returns false for state 'new'); calibration only picks prior-known claims (src/calibration.js `isCalibrationReady`). Allotment: src/sessionPrep.js:110 and src/homeCounts.js:71 count any non-claim card created today.
- Expected: an added word enters the next session as a new card. Actual: harness — 3 added words, 0 served; 10 words added today with daily_new_cards 10 → session queue **0**. Words.jsx:32-38 then labels them "Learning". Prod: 88 such stranded cards / 6 users.
- ROADMAP.md:115 "Save any dictionary word to your deck" (✅ Shipped) is false in effect.
- Fix: in sessionPrep, treat unclaimed reps-0 'new' cards as new items (with their `id`), ahead of/within the allotment; count only `reps>=1`-or-served cards in introducedToday; same in homeCounts. Acceptance: addtodeck.test.js shows added words served and allotment not double-spent; prod count of stranded rows trends to 0.
- Milestone: beta.

## SRS-02 — Offline: a brand-new card graded twice in one session queues a write that can never sync
- Severity **High** — offline grading is a store-app promise; the hit is near-certain (any new card graded Again/Hard/Good stays in the queue and is graded again).
- Evidence: reproduced-automated (grade_card + PostgREST uuid-cast modelled). Confidence H.
- Refs: src/Study.jsx:799 (`cardId = 'local-…'`), :857 (reinserted item `id: cardId`), :807 (`cardId: card.id || null` → next op carries `'local-…'`); src/syncQueue.js:333/580 (only P0001 'Card not found' is dropped; a 22P02 uuid error is retained forever, no attempt counter); grade_card `p_card_id uuid`.
- Actual (harness): grade 1 → op cardId null (learning, reps 1); grade 2 → op cardId `local-…` (review, reps 2). Flush: 1 flushed, 1 left; second flush 0; outbox never drains; server card stays `learning reps 1` (graduation lost), 1 log, activity 1 of 2. If the network returns mid-session the next online grade of that card sends `local-…` to the RPC → `write.ok=false` → fatal `saveError` banner and the card cannot be graded until reload (Study.jsx:761-764).
- Fix: never send a `local-` id; keep cardId null until replay, or have replay map local ids to the inserted id (vocab-keyed), and classify 22P02 on an op as unreplayable. Acceptance: harness flushes both ops, server ends `review reps 2`, outbox empty.
- Milestone: beta.

## SRS-03 — daily_activity counts are overwritten by every new Study mount ('set' mode from a zero counter)
- Severity **Medium** — scheduling unaffected; per-day counts (Profile calendar intensity, month report, metrics) undercount.
- Evidence: reproduced-automated + prod aggregate (consistent, not conclusive). Confidence H (mechanism), M (prod attribution).
- Refs: src/Study.jsx:253 (`activityRef` starts at 0 each mount), :740 + :755-762 (absolute counts, `mode:'set'`, `date: todayStr()` per grade); grade_card daily-activity `else excluded.*` (20260906120000).
- Actual: morning session 20 grades → studied 20; evening session 3 grades → **3**. Two tabs: last writer wins. A session crossing local midnight writes its cumulative count into the new day. Prod: 24/168 user-days studied_cards < review_logs (14 below half).
- Fix: online path uses `mode:'increment'` with per-grade deltas (opId already makes replay idempotent). Acceptance: harness 20+3 → 23.
- Milestone: public.

## SRS-04 — "Mastered"/"learned" copy overclaims what self-rating shows
- Severity **Medium** (honesty/calibration; not a code defect). Evidence: reproduced-automated (numbers) + static. Confidence M.
- Refs: src/knowledgeState.js `isMastered` (stability ≥ 21, reps ≥ 1); src/Words.jsx:29,34 label "Mastered"; src/testLogic.js:108-111 test unlock at 90% mastered OR 90% coverage; src/studyTally.js `newLearned: wasNew` (any first grade incl. Again and calibration checks) → src/SessionRecap.jsx:281 "You learned your first N words".
- Numbers (fuzz on, 0.9): Easy on first sight then Easy at due → S 8.3 → 54.6, "Mastered" on **day 6 after 2 self-rated presses**; Good-only → mastered after 4 grades, day 15. Level test itself still needs 30/30 demonstrated recall, so progression is protected; the label is not.
- Fix direction: reserve "Mastered" for stability ≥21 AND ≥N reviews/min age, or relabel ("Long-term"); count `newLearned` only for grade ≥ 2. Milestone: public.

## SRS-05 — Learning-step button labels promise times that are not honoured
- Severity Low. Evidence: reproduced-automated. Confidence H.
- Refs: src/srs.js:237 (`due_at = now` for learning), :258-262 (gap = minutes clamped 2..20, positional), studyQueue `reinsertSoon` (pos = min(gap, rest.length)).
- Numbers: new card preview `1 min / 6 min / 10 min / 6 days`; after Good, regrading 30 s later vs 10 min later gives the identical result (review, 2 days, S 2.307). With a short queue the card returns immediately. Intended per CLAUDE.md §4, so only the label is wrong. Fix: label learning buttons "Again soon"/"Later this session". Milestone: optional.

## SRS-06 — Level-test attempt limit resets at UTC midnight, copy says "tomorrow"
- Severity Low. Evidence: static-complete-path + prod catalog. Confidence H.
- Refs: src/testLogic.js:161 (`toISOString().slice(0,10)`), test_attempts.attempt_date default CURRENT_DATE (DB TZ UTC), src/Test.jsx:562-568. Auckland (NZDT) resets 13:00 local, Los Angeles 16:00 PST; everything else in the app is local-day. Fix: send local `todayStr()` as attempt_date on insert and query by it. Milestone: post-launch.

## SRS-07 — 20260822180000 still unapplied (doc claim verified)
- Severity Low today. Evidence: prod catalog + static. Confidence H.
- docs/BACKLOG.md:387-395 is accurate: migration absent, constraint absent, 0 violating rows of 2,376. src/devTools.js:29-35 `learningCardRow` still writes `state:'learning'` without reps. Consequence without it: an old store build or admin tool can write scheduled state with reps 0; such a row is served (isScheduledForLearning) but never counts as learned/mastered until graded, and its first grade writes reps 1 (guard passes). No current data damage. Fix: fix devTools row, apply. Milestone: public (before store builds proliferate — no min-version gate).

## SRS-08 — Undo writes scheduler state outside grade_card, errors unchecked
- Severity Low. Evidence: static-complete-path. Confidence M.
- Refs: src/Study.jsx:899-916 (bare UPDATE incl. reps; result unread), :919-921. Online grade then offline undo: UPDATE fails silently, server keeps the undone grade, local card restored; the re-grade is queued with the same reps → refused as stale on replay, silently. Also overwrites another device's newer grade (already in docs/BACKLOG.md:396-399 — still open). Fix: undo RPC with the reps guard, disable undo when offline for an online-written grade. Milestone: post-launch.

## SRS-09 — Level-up writes unchecked after a passed test
- Severity Low. Evidence: static. Confidence M.
- Refs: src/Test.jsx:471-486 — `level_unlocks` upsert and `language_tracks.current_level` update results ignored; results screen shows "Perfect score" even if either failed (attempt row also unchecked, :381-394). Fix: read errors, show retry. Milestone: public.

## SRS-10 — Achievements' "mastered" bypasses the canonical predicate
- Severity Low/optional. Static. src/Study.jsx:433-434 uses `stability >= 21` and `c.learned` directly instead of isMastered/isLearned (reps ≥ 1). No effect on current prod data (0 legacy rows; claims carry null stability). Milestone: optional.

---

## Verified OK (no finding)
- Day-based availability: review due exactly at local 23:59:59.999 is due, 1 ms later is not; correct in UTC/Auckland/LA. DST: local day measured 23 h / 25 h on transition days (LA 2026-03-08 / 11-01, Auckland 2026-09-27 / 04-05) — endOfLocalDay correct.
- Clock skew: last_review 2 h in the future → no throw, Good → 7 d. Overdue 95 d (S 5) Good → 59 d (S 56.55); Again → relearning, lapses 1, S 1.49.
- Stale replay: offline Again queued, web Good applied (reps 5), replay refused → server keeps reps 5 / S 32.03, 1 log, outbox drained. Duplicate opId → already_applied, logs and increment unchanged.
- Prod integrity: 0 cards with review_logs > reps (guard signature clean).
- 1000-row paging present on core reads in partition (getTrackCards, session/test/home/known-words vocabulary, recap cards); story_reads/stories unpaged but bounded.
- Reset RPC deletes cards, logs, writing_stats, story rows, test_attempts, level_unlocks per track; outbox drop + cache gaps already documented in BACKLOG (still open).

## Gaps
- Study.jsx read ~lines 225-960, 1120-1200 only; Test.jsx 248-500, 560-580. UI components (Home*, Onboarding, KnownWords, OfflineBar) only grepped for copy/queries.
- grade_card concurrency and PostgREST cast error modelled in JS, not executed against Postgres. No device/webview runs.
- Prod activity-vs-logs comparison buckets logs by UTC date; learner-local days differ.
