# Findings register — HanziDojo @ 9a9f58f (2026-11-09)

One entry per finding, deduplicated across the five domain reviews and the challenge pass. `source_ids` point to the domain appendix that holds the full reasoning (prefixes SEC/SRS/CNT/UX/ENG/CH; LEAD means the lead's own trace). Severity and confidence are rated separately. Changes made after the challenge pass are listed in `appendices/challenge.md`.

Machine-readable copies: `findings.json` and `findings.csv`. They use the same IDs and the same priorities.

## HD-AUD-001 — Words saved from reader, dictionary or Words list are never served in Study (88 stranded cards, 6 learners, since 2026-07-02)
- **Severity:** High · **Confidence:** H · **Evidence:** reproduced-automated + prod aggregate · **Source:** SRS-01
- **Category / platform:** Scheduling / core loop / all
- **Evidence refs:** src/sessionPrep.js:110-112,126-129,155-160 (saved rows count as introduced today, enter startedVocab, excluded from newItems — a saved current-level word also leaves the curriculum new queue); src/studyAvailability.js:35-43; src/srs.js:175-177; inserters useStoryReaderCore.js:408-413, StoryReaderImmersive.jsx:546, Dictionary.jsx:193, Words.jsx:59, Analyzer.jsx:88-104 ('Add all' bulk — can exhaust the daily allowance) and :113, ChatMission.jsx:176, dict_add_to_deck
- **Milestone / priority:** beta — Must fix
- **Fix direction:** Serve saved 'new' cards (reps 0, no prior claim) as new items ahead of curriculum vocab, within the daily new allowance; stop counting them as 'introduced today' until first graded.
- **Acceptance:** Unit spec: a saved card appears in the next session; e2e: save word in reader → Flashcards shows it; prod count of stranded cards trends to 0 after release.
- **Effort (relative, uncertain):** S (1-2 days incl. tests)

## HD-AUD-002 — Offline: grading a brand-new card twice queues a write with a 'local-…' card id that fails the uuid cast on every replay; that op stays queued forever (other ops still flush) and the graduation is lost
- **Severity:** High · **Confidence:** H · **Evidence:** reproduced-automated (grade_card modelled in JS) · **Source:** SRS-02
- **Category / platform:** Data integrity / offline / all (offline)
- **Evidence refs:** src/Study.jsx:799,807,857; src/syncQueue.js:333,580
- **Milestone / priority:** beta — Must fix
- **Fix direction:** Resolve local ids to (vocab_id) upsert path on replay or coalesce writes per vocab; treat 22P02 as a permanent failure with a visible recovery rather than infinite retry.
- **Acceptance:** Audit harness appendices/harnesses/sync.test.js flushes 2/2; offline e2e: grade new card twice, reconnect → outbox empty, server reps 2.
- **Effort (relative, uncertain):** S-M

## HD-AUD-003 — TestFlight lane blocked: Apple Program License Agreement not accepted by the Account Holder; last good build 2026-08-16
- **Severity:** High · **Confidence:** H · **Evidence:** reproduced (CI logs, runs 42547830386/42549643275) · **Source:** ENG-03
- **Category / platform:** Distribution / iOS
- **Evidence refs:** .github/scripts/asc-signing-assets.mjs:81,89; ios-testflight.yml
- **Milestone / priority:** beta — Must fix (owner)
- **Fix direction:** Account Holder accepts the latest PLA in the Apple Developer portal; re-run iOS build → TestFlight.
- **Acceptance:** A green ios-testflight run from main; new build visible in App Store Connect.
- **Effort (relative, uncertain):** XS (owner, ~5 min)

## HD-AUD-004 — Android store build has no VITE_SUPABASE_URL/ANON_KEY → app would open on 'Site can't start'; no signed AAB has ever been produced
- **Severity:** High · **Confidence:** H · **Evidence:** static-complete-path + CI history · **Source:** ENG-02
- **Category / platform:** Distribution / Android
- **Evidence refs:** .github/workflows/android-build.yml:58-59 vs ios-testflight.yml:95-123; src/supabase.js:4-28; build.gradle:45
- **Milestone / priority:** beta (Play internal) — Must fix
- **Fix direction:** Mirror the iOS env + bundle-contains-URL guard; wire the upload keystore secret; fail when unsigned.
- **Acceptance:** android-build run produces a signed AAB whose bundle contains the Supabase URL; app signs in on a device.
- **Effort (relative, uncertain):** S + owner keystore

## HD-AUD-005 — Store builds ship the web bundle (build:public), not build:native: apps fetch Google Fonts on launch, contradicting /privacy ('apps never contact Google')
- **Severity:** High · **Confidence:** H · **Evidence:** static-complete-path (lead re-checked) · **Source:** ENG-01
- **Category / platform:** Privacy / distribution / iOS, Android
- **Evidence refs:** ios-testflight.yml:116; android-build.yml:59; index.html:22-28; src/TrustPages.jsx:216-217; docs/PRIVACY-AUDIT.md:208
- **Milestone / priority:** beta — Must fix
- **Fix direction:** Use npm run build:native in both store workflows; pin it in native-ci-contract.test.mjs; add the store-bundle no-Google check to the store workflows.
- **Acceptance:** Store workflow logs show build:native; verify-native-fonts passes on the shipped dist; contract test fails if reverted.
- **Effort (relative, uncertain):** XS

## HD-AUD-006 — HSK 3-6 flashcards (heuristic hits from HSK 1) teach wrong/proper-noun senses (页 'xié head', 孙子 'Sun Tzu', 成功 'Chenggong town', 联想 'Lenovo', 友好 'Youhao district'; seed data also 中 'Zhōng China', 加 'Canada' at HSK 3). Prod heuristic: capitalised readings L1 4 / L3 8 / L4 10 / L5 12 / L6 10; proper-noun glosses L3 9 / L4 10 / L5 10 / L6 22 (needs curation)
- **Severity:** High · **Confidence:** H · **Evidence:** reproduced (prod SQL, lead re-checked) · **Source:** CNT-01
- **Category / platform:** Chinese content / all
- **Evidence refs:** public.vocabulary (prod); docs/BACKLOG.md:448 (marked applied: readings only); src/tts/sources.js:16-34
- **Milestone / priority:** beta (HSK 1-3 subset or briefed testers) / public (all) — Must fix
- **Fix direction:** Scripted detection (capitalised readings, district/county/city/proper-noun glosses) → curated corrections committed as a migration → Chinese reviewer sign-off → only then regenerate affected audio.
- **Acceptance:** Detector query returns 0 rows; reviewer signs the changed list; spot list above correct in prod.
- **Effort (relative, uncertain):** M (+ editor)

## HD-AUD-007 — No evidence an App Review demo account with a reachable story and review session exists
- **Severity:** Medium · **Confidence:** M · **Evidence:** suspected (cannot verify without reading auth rows) · **Source:** ENG-05
- **Category / platform:** Store readiness / iOS (and external TestFlight)
- **Evidence refs:** docs/RELEASE-BLOCKER-REMEDIATION.md:28,327; docs/STORE-LISTING.md
- **Milestone / priority:** public (gate B4); beta if external TestFlight (gate A10) — Must verify
- **Fix direction:** Owner creates a dedicated reviewer account seeded (Creative Mode) so a story and due reviews are reachable; record in review notes.
- **Acceptance:** Fresh install → sign in with reviewer creds → reach a story and a review in <2 min.
- **Effort (relative, uncertain):** S (owner)

## HD-AUD-008 — Daily studied count is sent as an absolute from a per-session counter; later sessions, second tab or midnight overwrite it (24/168 user-days below review-log totals)
- **Severity:** Medium · **Confidence:** H · **Evidence:** reproduced-automated + prod aggregate · **Source:** SRS-03
- **Category / platform:** Data integrity / metrics / all
- **Evidence refs:** src/Study.jsx:253,740,755-757; grade_card daily_activity 'set' mode
- **Milestone / priority:** public — Should improve
- **Fix direction:** Send 'increment' deltas with op-id dedupe (already idempotent via review_logs) or derive day counts from review_logs.
- **Acceptance:** Harness: 20 grades then 3 grades → 23; prod mismatch query trends to 0 for new days.
- **Effort (relative, uncertain):** S

## HD-AUD-009 — 'Mastered' reachable after two self-rated Easy presses (day 6); recap 'You learned your first N words' counts Again and calibration grades
- **Severity:** Low · **Confidence:** M · **Evidence:** reproduced-automated + static · **Source:** SRS-04
- **Category / platform:** Learning honesty / all
- **Evidence refs:** src/knowledgeState.js isMastered; src/Words.jsx:29; src/studyTally.js newLearned; src/SessionRecap.jsx:281
- **Milestone / priority:** public — Should improve
- **Fix direction:** Rename to 'long-term' / require ≥N successful reviews over ≥X days for the 'Mastered' label; recap counts only non-Again first grades. Level test (30/30) unchanged.
- **Acceptance:** Spec: two Easy presses do not yield 'Mastered'; recap copy matches METRICS.md definition.
- **Effort (relative, uncertain):** S (+ product call)

## HD-AUD-010 — Reader shows each word's single stored reading regardless of context (地 ground→'de' ~40×, 长 zhǎng→cháng ~8×, 行 xíng→háng ~4×); screen pinyin can disagree with narration
- **Severity:** Medium · **Confidence:** H · **Evidence:** reproduced-automated (179 stories) · **Source:** CNT-02
- **Category / platform:** Reader / Chinese / all
- **Evidence refs:** src/storyReading.js:808-849 (segmentLine/token building); no per-token reading override anywhere in src/
- **Milestone / priority:** public — Should improve
- **Fix direction:** Per-token reading overrides from the authored/utterance pipeline (which already has context fixes) with fallback to vocab reading; at minimum a polyphone override table for the listed cases.
- **Acceptance:** Re-run harnesses/poly-audit.mjs → 0 known polyphone mismatches; reviewer spot check.
- **Effort (relative, uncertain):** M

## HD-AUD-011 — 3,305 active HSK 3-6 words have no word audio (L3 383, L4 631, L5 986, L6 1304)
- **Severity:** Medium · **Confidence:** H · **Evidence:** prod SQL · **Source:** CNT-04
- **Category / platform:** Audio / all
- **Evidence refs:** public.vocabulary/tts_audio; docs/BACKLOG.md:224 vs :235
- **Milestone / priority:** public — Should improve
- **Fix direction:** After HD-AUD-006 reading fixes, run the per-level tts-flashcards pass; keep graceful silent state meanwhile.
- **Acceptance:** Count of active HSK3-6 words without ready audio = 0 (or documented exclusions).
- **Effort (relative, uncertain):** S compute + review

## HD-AUD-012 — Android hardware Back exits the app at '/', which also hosts ~7 onboarding steps, auth, tour and Home dialogs — answers lost
- **Severity:** Medium · **Confidence:** H · **Evidence:** static-complete-path (device not tested) · **Source:** UX-04
- **Category / platform:** Native shell / Android
- **Evidence refs:** src/nativeShell.js:75-80; src/NativeShellBridge.jsx:85-90
- **Milestone / priority:** beta (Play internal only) — Must fix
- **Fix direction:** Let in-screen state (onboarding step, open dialog/sheet) consume Back first via a registered handler stack; exit only from Home idle.
- **Acceptance:** Unit spec for backAction with overlay/step state; device: Back steps through onboarding.
- **Effort (relative, uncertain):** S

## HD-AUD-013 — Revealed flashcard clips the hanzi and cannot scroll to it on short viewports; iOS target declares iPad + iPhone landscape with no testing
- **Severity:** Medium · **Confidence:** H · **Evidence:** reproduced-runtime (screenshot) · **Source:** UX-02 + ENG-06
- **Category / platform:** Mobile layout / iOS landscape, iPad, 200% zoom
- **Evidence refs:** src/Study.jsx:1439-1446; src/studyLayout.js:114-117,135-137; ios/App/App/Info.plist:65-77; project.pbxproj:318,339
- **Milestone / priority:** beta (lock portrait / iPhone-only) ; public (layout fix) — Must fix
- **Fix direction:** Beta: restrict to iPhone portrait (or test iPad). Public: use margin:auto centring inside the scroller so overflow is reachable.
- **Acceptance:** Screenshot at 568×320 and 640×400 shows the hanzi; iPad decision recorded.
- **Effort (relative, uncertain):** XS (config) / S (layout)

## HD-AUD-014 — Dark mode study grade buttons use hard-coded light pastels (interval text 2.3:1) and raw accent pinyin (2.94:1) — violates token/ink() rules
- **Severity:** Medium · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-01
- **Category / platform:** Visual / a11y / all (dark mode)
- **Evidence refs:** src/Study.jsx:58-63,1475,1712-1714
- **Milestone / priority:** public — Must fix
- **Fix direction:** Token-ise the grade palette with dark variants; wrap accent text in ink().
- **Acceptance:** axe color-contrast passes on Study back in dark mode.
- **Effort (relative, uncertain):** S

## HD-AUD-015 — Chinese text lacks lang='zh-Hans' on flashcard, shelf, Words, Profile, Landing; card front aria-label hides the hanzi
- **Severity:** Medium · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-03
- **Category / platform:** Accessibility / all
- **Evidence refs:** src/Study.jsx:1328-1334,1493,1507; src/Words.jsx:230 (good: Home.jsx:374)
- **Milestone / priority:** public — Must fix
- **Fix direction:** Apply langAttr() wrapper on every CJK text node; drop overriding aria-label.
- **Acceptance:** lang scan script (evidence/ux/scripts/langscan.mjs) reports 0 untagged CJK runs on main screens.
- **Effort (relative, uncertain):** S

## HD-AUD-016 — Word popover never receives focus, not aria-modal; its actions come after every word in tab order
- **Severity:** Medium · **Confidence:** M · **Evidence:** reproduced-automated · **Source:** UX-05
- **Category / platform:** Accessibility / reader / all
- **Evidence refs:** src/WordLookupSheet.jsx:81-90,125,163
- **Milestone / priority:** public — Must fix
- **Fix direction:** Focus after visibility toggles (rAF/after layout); dialog semantics; restore focus to token on close.
- **Acceptance:** evidence/ux/scripts/sheetfocus.mjs: focus lands in sheet; Escape returns to token.
- **Effort (relative, uncertain):** S

## HD-AUD-017 — Play-required web deletion page (/support) lacks what is deleted/retained and retention period; review notes cite /profile
- **Severity:** Medium · **Confidence:** H · **Evidence:** static · **Source:** ENG-04
- **Category / platform:** Store / privacy / Android (Play)
- **Evidence refs:** src/TrustPages.jsx:441-450; docs/RELEASE-BLOCKER-REMEDIATION.md:25; docs/STORE-LISTING.md
- **Milestone / priority:** public — Must fix
- **Fix direction:** Owner supplies backup-retention window; publish the drafted copy; align review notes.
- **Acceptance:** Page lists deleted data, retained data, retention; Play Console deletion URL set.
- **Effort (relative, uncertain):** XS + owner fact

## HD-AUD-018 — No release-cut discipline: store builds dispatchable from any branch without green-CI/tag gate; version hard-coded 1.0; Android signing silently falls back to unsigned
- **Severity:** Medium · **Confidence:** H · **Evidence:** static · **Source:** ENG-08
- **Category / platform:** Release process / iOS, Android
- **Evidence refs:** .github/workflows/ios-testflight.yml, android-build.yml; android/app/build.gradle:23,45; project.pbxproj:312
- **Milestone / priority:** public — Should improve
- **Fix direction:** Restrict dispatch to main/tags, require CI success on the SHA, auto-increment build number, fail unsigned release builds; write the cut procedure.
- **Acceptance:** Dispatch from a feature branch is refused; build numbers monotonic; procedure doc exists.
- **Effort (relative, uncertain):** S

## HD-AUD-019 — Backup/PITR, restore and rollback unproven; prod migration history (29) can't reproduce schema from repo (68 files, different timestamps); no uptime check
- **Severity:** Medium · **Confidence:** M · **Evidence:** suspected · **Source:** ENG-09
- **Category / platform:** Operations / backend
- **Evidence refs:** docs/DEPLOY.md; Supabase list_migrations vs supabase/migrations/
- **Milestone / priority:** public — Must verify
- **Fix direction:** Record plan/PITR; perform one restore drill into a scratch project; write web rollback (Vercel promote) + DB forward-fix policy; add uptime ping.
- **Acceptance:** Restore drill log; rollback section in DEPLOY.md; schema diff of repo-built vs prod is empty or documented.
- **Effort (relative, uncertain):** M

## HD-AUD-020 — grade_card / RLS / delete_my_account are only regex-tested against SQL text; CI has no Postgres
- **Severity:** Medium · **Confidence:** H · **Evidence:** static · **Source:** ENG-10
- **Category / platform:** Test quality / backend
- **Evidence refs:** gradeCardStaleReplay.test.mjs:8-14; .github/workflows/ci.yml
- **Milestone / priority:** public (deletion+RLS) / post-launch (rest) — Should improve
- **Fix direction:** Add a supabase-local or pg service job running pgTAP/SQL tests for grade_card idempotency, RLS cross-user denial, delete_my_account cascade.
- **Acceptance:** CI job executes SQL tests and fails on a seeded regression.
- **Effort (relative, uncertain):** M

## HD-AUD-021 — Dojo HQ invite-code holders can author the prompt launched into Claude Code on the maintainer's PC; bridge --self-update executes unsigned code fetched from the HQ site; worker workspace creation unauthenticated
- **Severity:** Medium · **Confidence:** M · **Evidence:** static-complete-path (lead re-checked) · **Source:** SEC-01
- **Category / platform:** Security (internal tooling) / maintainer PC
- **Evidence refs:** tools/dojo-bridge.mjs:255-281,444-460; worker/index.js:160
- **Milestone / priority:** post-launch (internal; not learner-facing) — Should improve
- **Fix direction:** Pin/sign bridge updates (hash from repo), require explicit local confirmation before launch, authenticate workspace creation. Mitigation present: Claude launched in manual permission mode.
- **Acceptance:** Self-update refuses unsigned payload; launch shows local confirmation.
- **Effort (relative, uncertain):** S

## HD-AUD-022 — Reader 'Add to deck' failures are silent (no error, no outbox), logic duplicated in two readers; an already-in-deck word cannot be sent back to review
- **Severity:** Medium · **Confidence:** H · **Evidence:** static-complete-path · **Source:** LEAD
- **Category / platform:** Reader / core loop / all
- **Evidence refs:** src/useStoryReaderCore.js:408-428; src/StoryReaderImmersive.jsx:546-576; src/WordLookupSheet.jsx:194-197
- **Milestone / priority:** public — Should improve
- **Fix direction:** Extract one tested addToDeck module with error feedback and outbox use; decide (product) whether 'still hard' marks an existing card for earlier review.
- **Acceptance:** Spec: failed insert surfaces a toast; offline add replays; single implementation.
- **Effort (relative, uncertain):** S

## HD-AUD-023 — Custom-scheme deep link com.hanzidojo.app:/\evil.com maps to '/\evil.com' → falls back to location.assign → opens attacker URL in system browser; react-router 7.17 has GHSA-wrjc-x8rr-h8h6 (high per npm audit)
- **Severity:** Low · **Confidence:** M · **Evidence:** static-complete-path (mapping reproduced in node) · **Source:** SEC-02 + npm audit
- **Category / platform:** Security / dependency / Android
- **Evidence refs:** src/nativeShell.js:66-71; src/NativeShellBridge.jsx:60; package-lock react-router 7.17.0; evidence/audit-prod.log
- **Milestone / priority:** beta — Should improve
- **Fix direction:** Reject paths containing backslash or '//' in deep-link mapping; upgrade react-router(-dom) past 7.18.1.
- **Acceptance:** Spec for nativeShell rejecting backslash paths; npm audit --omit=dev clean.
- **Effort (relative, uncertain):** XS

## HD-AUD-024 — Sign-out does not clear IndexedDB; the stories offline snapshot (cards, reads, unlocks, recent reviews) is not user-keyed and is visible offline to the next account
- **Severity:** Low · **Confidence:** H · **Evidence:** static-complete-path · **Source:** SEC-03
- **Category / platform:** Privacy / shared devices
- **Evidence refs:** src/Stories.jsx:351,408-423; src/App.jsx:385; src/Profile.jsx:936
- **Milestone / priority:** public — Should improve
- **Fix direction:** Key snapshots by user id and clear all offline stores on sign-out/account switch.
- **Acceptance:** e2e: user A signs out, user B offline sees none of A's data.
- **Effort (relative, uncertain):** S

## HD-AUD-025 — Web host sends no CSP, frame-ancestors/X-Frame-Options or Referrer-Policy (signed-in app frameable)
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** SEC-04
- **Category / platform:** Security headers / web
- **Evidence refs:** vercel.json
- **Milestone / priority:** public — Should improve
- **Fix direction:** Add headers block (frame-ancestors 'none', Referrer-Policy, conservative CSP report-only first).
- **Acceptance:** curl -I shows headers; app still loads fonts/audio/YouTube.
- **Effort (relative, uncertain):** XS-S

## HD-AUD-026 — Leaked-password protection disabled; minimum password length 6
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced (Supabase advisor) · **Source:** SEC-05
- **Category / platform:** Auth / all
- **Evidence refs:** Supabase advisor auth_leaked_password_protection; src/authValidation.js:6; src/PasswordReset.jsx:63
- **Milestone / priority:** public — Should improve
- **Fix direction:** Enable HIBP check; raise min length to 8+ (client + Auth config).
- **Acceptance:** Advisor clean; signup rejects a known-breached password.
- **Effort (relative, uncertain):** XS (owner toggle)

## HD-AUD-027 — feedback.message/context unbounded; feedback.email client-supplied (spoofable)
- **Severity:** Low · **Confidence:** H · **Evidence:** static (live constraints) · **Source:** SEC-06
- **Category / platform:** Abuse / backend
- **Evidence refs:** src/Feedback.jsx:66-68; feedback table constraints
- **Milestone / priority:** public — Should improve
- **Fix direction:** Length CHECKs; derive email server-side.
- **Acceptance:** Oversized insert rejected.
- **Effort (relative, uncertain):** XS

## HD-AUD-028 — Anonymous analytics inserts have no rate limit (rows bounded) — dashboard metrics can be inflated
- **Severity:** Low · **Confidence:** H · **Evidence:** static (live policy) · **Source:** SEC-07
- **Category / platform:** Abuse / metrics / backend
- **Evidence refs:** policy 'analytics insert own or anon'
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Edge rate limit or session-scoped caps; dashboard notes the limitation.
- **Acceptance:** —
- **Effort (relative, uncertain):** S

## HD-AUD-029 — All progression gates trust the client for the user's own rows (cards reps/stability, level_unlocks, story_unlocks, current_level); CLAUDE.md §3b not DB-enforced; creativeMode.js writes reps (admin)
- **Severity:** Low · **Confidence:** H · **Evidence:** static (live policies) · **Source:** SEC-08
- **Category / platform:** Integrity (self-only) / backend
- **Evidence refs:** cards/level_unlocks/language_tracks policies; src/creativeMode.js:128,137,178
- **Milestone / priority:** post-launch — Optional (accepted risk)
- **Fix direction:** Accept for a free single-player app; document as accepted risk; keep server-side gates on the roadmap.
- **Acceptance:** Decision recorded.
- **Effort (relative, uncertain):** —

## HD-AUD-030 — Unrelated 'BodyOS' app table shares the Supabase project/auth pool (0 rows); delete_my_account also deletes BodyOS data; privacy text silent; 3 auth users without a profile (cause unknown); PRIVACY-AUDIT.md contradicts itself (:274 vs :1250)
- **Severity:** Low · **Confidence:** M · **Evidence:** static + live metadata · **Source:** SEC-09
- **Category / platform:** Privacy / data boundary / backend
- **Evidence refs:** public.bodyos_app_state; supabase/migrations/20260807130000_delete_my_account.sql:48-49
- **Milestone / priority:** public — Must verify (owner decision)
- **Fix direction:** Owner decides: drop the BodyOS objects or move BodyOS to its own project; investigate the 3 profile-less users.
- **Acceptance:** Decision recorded; table absent or disclosed.
- **Effort (relative, uncertain):** XS-S

## HD-AUD-031 — dict_add_to_deck global cap (500/day) vs per-user 200: three free accounts can block new dictionary words for everyone for a day
- **Severity:** Low · **Confidence:** H · **Evidence:** static (live source) · **Source:** SEC-10
- **Category / platform:** Abuse / backend
- **Evidence refs:** supabase/migrations/20260907010000_cap_dict_add_to_deck.sql
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Raise global cap or scope it to new-account age; alert when hit.
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-032 — Local dojo-bridge accepts no-Origin requests and doesn't check Host (DNS-rebinding read of status/ROADMAP/TASKS)
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** SEC-12
- **Category / platform:** Security (internal tooling) / maintainer PC
- **Evidence refs:** tools/dojo-bridge.mjs:283-285
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Check Host is 127.0.0.1/localhost; require Origin on non-GET.
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-033 — ~40 tag-pinned actions, some workflow_dispatch inputs interpolated into shell (write-access only), 4 workflows without permissions:
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** SEC-13
- **Category / platform:** CI security / CI
- **Evidence refs:** .github/workflows/vocab-complete.yml:69; regen-content.yml:113
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** SHA-pin, env-indirect inputs, default permissions: read.
- **Acceptance:** —
- **Effort (relative, uncertain):** S

## HD-AUD-034 — Default broad grants to anon (RLS blocks), pg_net/pg_trgm in public, empty duplicate 'Audio' bucket, buckets without size/MIME limits, RLS-no-policy backup tables
- **Severity:** Low · **Confidence:** H · **Evidence:** live metadata · **Source:** SEC-11
- **Category / platform:** DB hygiene / backend
- **Evidence refs:** Supabase security advisor; storage.buckets
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Clean up in one hygiene migration.
- **Acceptance:** Advisor WARNs reduced.
- **Effort (relative, uncertain):** XS

## HD-AUD-035 — Grade buttons show 1 min / 6 min / 10 min but learning cards are re-queued by position (documented design) — labels misdescribe behaviour
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** SRS-05
- **Category / platform:** Scheduling copy / all
- **Evidence refs:** src/srs.js:237,258
- **Milestone / priority:** public — Should improve
- **Fix direction:** Label as 'again soon' / 'later this session' or honour time.
- **Acceptance:** Copy matches behaviour.
- **Effort (relative, uncertain):** XS

## HD-AUD-036 — Level-test 3-attempts/day resets at UTC midnight while UI says 'come back tomorrow'
- **Severity:** Low · **Confidence:** H · **Evidence:** static + prod catalog · **Source:** SRS-06
- **Category / platform:** Scheduling / timezone / all
- **Evidence refs:** src/testLogic.js:161; test_attempts.attempt_date default CURRENT_DATE (UTC); src/Test.jsx:567
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Pass client local date.
- **Acceptance:** Spec in TZ=Pacific/Auckland.
- **Effort (relative, uncertain):** XS

## HD-AUD-037 — 20260822180000_scheduler_state_requires_observation not applied (0 violating rows); devTools.js:29 still writes a reps-less learning card
- **Severity:** Low · **Confidence:** H · **Evidence:** prod catalog · **Source:** SRS-07
- **Category / platform:** Migration state / backend
- **Evidence refs:** docs/BACKLOG.md:387; src/devTools.js:29
- **Milestone / priority:** public — Should improve
- **Fix direction:** Fix devTools then apply per BACKLOG order.
- **Acceptance:** Constraint present in pg_constraint.
- **Effort (relative, uncertain):** XS

## HD-AUD-038 — Undo writes back with unchecked bare update; grade online then undo offline leaves the undone grade on the server and the re-grade is refused on replay
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** SRS-08
- **Category / platform:** Data integrity / all (offline)
- **Evidence refs:** src/Study.jsx:899-921; docs/BACKLOG.md:396
- **Milestone / priority:** public — Should improve
- **Fix direction:** Route undo through an RPC with op-id and error handling.
- **Acceptance:** Harness scenario converges.
- **Effort (relative, uncertain):** S

## HD-AUD-039 — After a passed test the level-unlock and level-up writes are unchecked — results can say 'Perfect score' while unlock failed
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** SRS-09
- **Category / platform:** Progression / all
- **Evidence refs:** src/Test.jsx:381,471-486
- **Milestone / priority:** public — Should improve
- **Fix direction:** Check errors, retry/outbox, show honest state.
- **Acceptance:** Spec with failing insert shows retry.
- **Effort (relative, uncertain):** XS

## HD-AUD-040 — Achievements 'mastered' count uses stability only (bypasses shared isMastered rule)
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** SRS-10
- **Category / platform:** Consistency / all
- **Evidence refs:** src/Study.jsx:433-434
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Use knowledgeState.isMastered.
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-041 — Older LLM stories: da413ec2 spaces between words; 1fc8cc5c ends mid-action; 3e7835ea '小云说：' parsed as a speaker name
- **Severity:** Low · **Confidence:** M · **Evidence:** static (sample) · **Source:** CNT-03
- **Category / platform:** Chinese content / all
- **Evidence refs:** src/storyReading.js:143-153; story ids listed
- **Milestone / priority:** public — Must verify (editor)
- **Fix direction:** Editorial review of the 25 non-repo stories; speaker parser rule for 说：.
- **Acceptance:** Reviewer sign-off list.
- **Effort (relative, uncertain):** S + editor

## HD-AUD-042 — Story '% known' excludes out-of-list words from the denominator (140/179 stories), relearning counted inconsistently; no METRICS.md entry
- **Severity:** Low · **Confidence:** H · **Evidence:** static + automated · **Source:** CNT-05
- **Category / platform:** Metrics honesty / all
- **Evidence refs:** src/storyReading.js:872-927; docs/METRICS.md:118-121
- **Milestone / priority:** public — Should improve
- **Fix direction:** Define the metric in METRICS.md and include all tokens (or label 'of course words').
- **Acceptance:** Metric doc + spec.
- **Effort (relative, uncertain):** S

## HD-AUD-043 — Scroll reader auto-read stops at silent '……' lines when speechSynthesis is absent (8 stories)
- **Severity:** Low · **Confidence:** M · **Evidence:** static (suspected on device) · **Source:** CNT-07
- **Category / platform:** Reader / audio / Android WebView
- **Evidence refs:** src/StoryReaderImmersive.jsx:627,653-660 (paged reader correct: useStoryReaderCore.js:220-235)
- **Milestone / priority:** beta (verify on device) — Must verify
- **Fix direction:** Port the paged reader's skip logic.
- **Acceptance:** Device: story 2e5905de reads through.
- **Effort (relative, uncertain):** XS

## HD-AUD-044 — Tone-pair drill never available at HSK 1-2 (readings lack syllable spaces; pool L1=3, L2=0, needs 4)
- **Severity:** Low · **Confidence:** H · **Evidence:** SQL + static · **Source:** CNT-08
- **Category / platform:** Practice / all
- **Evidence refs:** src/Tones.jsx:62,224
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Syllabify with existing pinyin parser.
- **Acceptance:** Pool ≥4 at L1.
- **Effort (relative, uncertain):** XS

## HD-AUD-045 — Erhua readings (一点儿) never phoneme-pinned (no 'r' syllable)
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced · **Source:** CNT-09
- **Category / platform:** Audio pipeline / all
- **Evidence refs:** src/pinyin.js:34-108
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Add erhua handling.
- **Acceptance:** Spec.
- **Effort (relative, uncertain):** XS

## HD-AUD-046 — Font OFL licence texts not shipped in the native bundle (and Mona Sans OFL missing) though NOTICE.md says they are; /terms doesn't link the notice
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** CNT-10
- **Category / platform:** Rights / iOS, Android
- **Evidence refs:** vite.config.js; src/webfonts.css:8-9; NOTICE.md; src/TrustPages.jsx:381-384
- **Milestone / priority:** public — Must fix
- **Fix direction:** Copy licence files into the native build; add a reachable attributions screen/link.
- **Acceptance:** Licence text reachable inside the app.
- **Effort (relative, uncertain):** XS

## HD-AUD-047 — Manhua art provenance mostly unrecorded (1/117 entries); /terms doesn't disclose LLM-drafted story text/translations
- **Severity:** Low · **Confidence:** H · **Evidence:** automated (fetch-manhua-art --check) · **Source:** CNT-11
- **Category / platform:** Rights / disclosure / all
- **Evidence refs:** fetch-manhua-art.mjs; artProvenance.mjs; src/TrustPages.jsx
- **Milestone / priority:** public — Should improve
- **Fix direction:** Backfill provenance; add a one-line generated-content disclosure.
- **Acceptance:** Check passes; disclosure present.
- **Effort (relative, uncertain):** S

## HD-AUD-048 — allowBackup=true with no extraction rules — WebView storage (session tokens, outbox) included in Google backups
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** ENG-07
- **Category / platform:** Privacy / native / Android
- **Evidence refs:** android/app/src/main/AndroidManifest.xml:4
- **Milestone / priority:** public — Should improve
- **Fix direction:** allowBackup=false or dataExtractionRules excluding WebView data.
- **Acceptance:** Manifest updated; Data safety answer consistent.
- **Effort (relative, uncertain):** XS

## HD-AUD-049 — PRE-RELEASE-CHECKLIST.md has stale claims (devTools is_easy, dead StoryReader, deletion/Apple failing, 'app build is build:public'); creativeMode reps writes still open
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** ENG-11
- **Category / platform:** Documentation / —
- **Evidence refs:** docs/PRE-RELEASE-CHECKLIST.md:14-27,41-44,320-324
- **Milestone / priority:** beta — Should improve
- **Fix direction:** Refresh the checklist from this audit.
- **Acceptance:** Checklist consistent with code.
- **Effort (relative, uncertain):** XS

## HD-AUD-050 — App.entitlements not referenced in pbxproj (only CI adds CODE_SIGN_ENTITLEMENTS) — any other archive loses Sign in with Apple
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** ENG-12
- **Category / platform:** Native config / iOS
- **Evidence refs:** ios/App/App.xcodeproj/project.pbxproj; ios-testflight.yml:247
- **Milestone / priority:** public — Should improve
- **Fix direction:** Reference entitlements in the project.
- **Acceptance:** Local archive includes the entitlement.
- **Effort (relative, uncertain):** XS

## HD-AUD-051 — Native splash still shows the pre-V2 mark; drawable-night splash 320×240 vs 320×480
- **Severity:** Low · **Confidence:** M · **Evidence:** static/visual · **Source:** ENG-13
- **Category / platform:** Brand / iOS, Android
- **Evidence refs:** android/app/src/main/res/drawable*/splash.png; docs/PRE-RELEASE-CHECKLIST.md:89; evidence/splash-vs-icon.png
- **Milestone / priority:** public — Should improve
- **Fix direction:** Regenerate splash set with V2 mark.
- **Acceptance:** Visual check on device.
- **Effort (relative, uncertain):** XS

## HD-AUD-052 — No native push (reminders hidden in apps — disclosed accurately), no universal-link files, no source maps or native crash reporting, gradle wrapper not checksum-verified
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** ENG-14
- **Category / platform:** Operations / native / iOS, Android
- **Evidence refs:** src/push.js; public/.well-known (absent)
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Crash reporting/source maps before wide release; others per roadmap.
- **Acceptance:** —
- **Effort (relative, uncertain):** M

## HD-AUD-053 — Home shows a lock + 'Finish cards to unlock' but tapping opens the story; Stories offers 'Start reading' for the same story
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-runtime · **Source:** UX-06
- **Category / platform:** UX consistency / all
- **Evidence refs:** src/homeModel.js:80; src/Home.jsx:340-347,370
- **Milestone / priority:** public — Should improve (product call)
- **Fix direction:** Make Home and Stories agree on lock state.
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-054 — Raw accent used as text in dark mode (2.8-2.94:1): Words pinyin, Test counters, Writing, dictionary pill, Discord link, popover headword
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-07
- **Category / platform:** Visual / a11y / dark mode
- **Evidence refs:** src/Words.jsx:231,240; src/Test.jsx:543,582,710
- **Milestone / priority:** public — Should improve
- **Fix direction:** Wrap in ink().
- **Acceptance:** axe contrast pass.
- **Effort (relative, uncertain):** XS

## HD-AUD-055 — OS dark-mode preference never followed (pre-login always light; new accounts default light)
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-08
- **Category / platform:** Theming / all
- **Evidence refs:** src/App.jsx:148,168-171,246-247
- **Milestone / priority:** post-launch — Optional
- **Fix direction:** Default to system.
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-056 — Light-mode contrast near-misses: sage primary 4.07:1, segmented 4.39:1, 'Learning' chip 2.92:1, locked achievements 2.36:1
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-09
- **Category / platform:** A11y contrast / light mode
- **Evidence refs:** src/Study.jsx:50; axe JSON
- **Milestone / priority:** public — Should improve
- **Fix direction:** Darken tokens.
- **Acceptance:** axe pass.
- **Effort (relative, uncertain):** XS

## HD-AUD-057 — Small targets: Home profile 34px (only mobile route to Settings/Test), story Back 30px, Exit/Undo 38px, Dictionary add 22px, Test info 18px, Settings switch 28px, manhua words 20×20
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-10
- **Category / platform:** Touch targets / mobile
- **Evidence refs:** evidence/ux/scripts/matrix-axe390.json
- **Milestone / priority:** public — Should improve
- **Fix direction:** Raise hit areas to 44px.
- **Acceptance:** Target-size audit pass.
- **Effort (relative, uncertain):** S

## HD-AUD-058 — Mobile tab bar labels only the active tab; Practice uses a generic grid icon
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-runtime · **Source:** UX-11
- **Category / platform:** Navigation (taste) / mobile
- **Evidence refs:** src/MobileNav.jsx; src/navConfig.js
- **Milestone / priority:** optional — Optional
- **Fix direction:** Label all tabs (test with learners).
- **Acceptance:** —
- **Effort (relative, uncertain):** XS

## HD-AUD-059 — Readers lack h1; 82 label-content-name-mismatch; pre-login pages lack <main>
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced-automated · **Source:** UX-12
- **Category / platform:** A11y structure / all
- **Evidence refs:** axe results
- **Milestone / priority:** public — Should improve
- **Fix direction:** Add headings/landmarks; align aria-labels with visible text.
- **Acceptance:** axe clean for these rules.
- **Effort (relative, uncertain):** S

## HD-AUD-060 — 1,004 fixed px font sizes vs 3 rem — no Dynamic Type; Android textZoom may stress fixed layouts (untested)
- **Severity:** Low · **Confidence:** M · **Evidence:** static · **Source:** UX-13
- **Category / platform:** A11y / native text size / iOS, Android
- **Evidence refs:** src/*.jsx
- **Milestone / priority:** post-launch — Must verify (device)
- **Fix direction:** Device test at largest text sizes; then decide.
- **Acceptance:** Device notes.
- **Effort (relative, uncertain):** —

## HD-AUD-061 — visual.spec.js privacy-desktop snapshot differs in this sandbox (same commit green on GitHub CI) — environment font rasterisation, not a product defect
- **Severity:** Low · **Confidence:** H · **Evidence:** reproduced (sandbox) · **Source:** LEAD
- **Category / platform:** Test environment / CI vs sandbox
- **Evidence refs:** evidence/e2e.log; GitHub Actions E2E run on 9a9f58f = success
- **Milestone / priority:** — — No action (disposition: environment)
- **Fix direction:** None.
- **Acceptance:** —
- **Effort (relative, uncertain):** —

## HD-AUD-062 — Readability keyed by written form (documented in VOCAB-INGESTION §3); no live Chinese impact
- **Severity:** Low · **Confidence:** H · **Evidence:** static · **Source:** CNT-06
- **Category / platform:** Reader data model / —
- **Evidence refs:** docs/VOCAB-INGESTION.md §3
- **Milestone / priority:** — — No action (latent, already tracked)
- **Fix direction:** None.
- **Acceptance:** —
- **Effort (relative, uncertain):** —

## HD-AUD-063 — Account deletion never revokes Sign in with Apple tokens (no Apple REST revoke call in src/, supabase/ or worker/); delete_my_account only deletes auth.users
- **Severity:** Medium · **Confidence:** M · **Evidence:** static (absence confirmed by lead grep) · **Source:** CH-01
- **Category / platform:** Store / privacy / iOS
- **Evidence refs:** supabase/migrations/20260807130000_delete_my_account.sql; src/accountDeletion.js; src/nativeAuth.js
- **Milestone / priority:** public (iOS) — Must fix
- **Fix direction:** Store the SIWA authorization code/refresh token at sign-in (server side) and call Apple's revoke endpoint from a server function during deletion; re-check Apple's current account-deletion guidance.
- **Acceptance:** Deleting a SIWA test account removes the app from the Apple ID's 'Sign in with Apple' list.
- **Effort (relative, uncertain):** M (needs server function + Apple key)
