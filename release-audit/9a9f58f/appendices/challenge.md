# Challenge review — HanziDojo audit @ 9a9f58f
Code traced at scratchpad/main (9a9f58f). Verdicts: CONFIRMED / WEAKENED / REFUTED / NOT RE-TRACEABLE.

## A. High findings
1. HD-AUD-001 CONFIRMED, and wider than stated. sessionPrep.js:126-129 puts every owned card in startedVocab; :155-160 newItems excludes them; studyAvailability.js:35-43 serves only learning/relearning/review. Inserters writing state 'new': useStoryReaderCore.js:413, Dictionary.jsx:193, Words.jsx:59, plus ones the audit missed: Analyzer.jsx:92 ("Add all", bulk) and :113, ChatMission.jsx:176. Two things make it worse: (a) a saved CURRENT-level word also drops out of the curriculum new queue for good; (b) saved rows count toward introducedToday (sessionPrep.js:110-112), so one Analyzer "Add all" can use up the whole day's new-card allowance while serving nothing. Severity: keep High, not Critical. No data is lost, and the fix heals all 88 stranded rows retroactively. Must-fix for beta stays correct. The Analyzer comment at :101 ("now learning") is false.
2. HD-AUD-002 CONFIRMED. Study.jsx:799 sets a 'local-' id; :855 re-queues {id: cardId}; the next offline grade sends cardId: card.id (:807) = 'local-…'. syncQueue.js:574-579 deletes an op only when isUnreplayable, so a 22P02 is kept and retried forever. The op is skipped (`continue`), not head-of-line blocking, so "never drains" means that op stays queued, not the whole queue. High is right: any new card graded twice in an offline session triggers it.
3. HD-AUD-003 NOT RE-TRACEABLE (the CI logs are not in evidence/). Plausible. It is an owner action, so it should be tracked as a gate item rather than a defect severity.
4. HD-AUD-004 CONFIRMED. android-build.yml:58-59 runs build:public with no VITE_ env. iOS has both the env and the guard (ios-testflight.yml:103-122). Secrets are missing too (keystore fallback at :76-80).
5. HD-AUD-005 CONFIRMED. Both lanes run build:public. Only build:native strips the Google tags (vite.config.js plugin; package.json:9), and TrustPages.jsx:216-217 claims the apps never contact Google. Calibration: High for public (a false privacy claim feeds the App Privacy label). For internal TestFlight it does no learner harm; it gates beta only because the fix is XS.
6. HD-AUD-006 CONFIRMED in the repo seed (data/hsk4.json:200 Chenggong, :2730 Youhao; hsk6 Lenovo). Missed point: HSK 3 is affected as well — data/hsk3.json has 中 'Zhōng China', 加 'Jiā Canada; surname Jia', 越 'Yuè peoples…'. Confirm these in prod.
7. HD-AUD-007 WEAKENED as a "High defect". It is an unverified owner task (confidence M). Better as a gate item (B4), and also an A-gate item if the beta uses EXTERNAL TestFlight, because Beta App Review asks for sign-in credentials.

## B. Medium findings
8. 008 CONFIRMED: Study.jsx:253 counter starts at 0 per mount; :756 sends mode 'set'; the latest grade_card (20260906120000:360) overwrites with no greatest().
9. 009 WEAKENED to Low / product call. isMastered (knowledgeState.js:121-125) is exactly the CLAUDE.md §4 rule (stability >= 21 plus a genuine observation), and the level test (30/30) is still the real gate. The recap-wording part stands.
10. 010 CONFIRMED in substance (no per-token reading override exists anywhere in src). But the cited storyReading.js:742-756 is coverableBy(), not reading logic, so the reference has drifted. Fix the refs.
11. 012 CONFIRMED: nativeShell.js:75-80 returns 'exit' at '/'; NativeShellBridge.jsx:85-90 calls exitApp. Android-only, and Android beta is blocked by 004 anyway, so this is not on the critical path.
12. 013 CONFIRMED: Study.jsx:1439-1446 uses justifyContent:center inside an overflowY:auto flex column; Info.plist:65-77 allows landscape; pbxproj:318,339 TARGETED_DEVICE_FAMILY "1,2". iPad support means App Review will test on iPad (2.4.1) → public gate.
13. 014 CONFIRMED: Study.jsx:58-63 hard-codes hex palettes; :1475 colours the pinyin with raw accent and no ink().
14. 017 CONFIRMED: TrustPages.jsx:441-450 says only "all its data", with no retained data and no retention period. Client and RPC deletion are otherwise sound (delete_my_account plus profile cascades; feedback/grammar_reviews/writing_stats/story_* all cascade; accountDeletion.js clears outbox and downloads).
15. 022 CONFIRMED: useStoryReaderCore.js:408-428 has no error branch and returns early if already in the deck.

## C. New findings
CH-01 (Medium→High for public iOS; static absence). There is no Sign in with Apple token revocation on account deletion. grep finds no Apple revoke anywhere in src/ or supabase/. delete_my_account only deletes auth.users. Apple's account-deletion rule (Guideline 5.1.1(v)) requires apps that offer SIWA to revoke tokens through the Apple REST API. Add it to B3/B5.
CH-02 (Medium; static). Analyzer "Add all" (Analyzer.jsx:88-104) amplifies 001 as described in A1. Fix it with 001.
CH-03 (Low; process). The audit's own trail is inconsistent:
- REPORT.md:431 and audit-state.md cite appendices/challenge.md, which did not exist.
- coverage-not-reviewed.txt lists StoryReaderImmersive.jsx, useStoryReaderCore.js and Dictionary.jsx as not reviewed, yet 001, 022 and 043 cite them. The ledger is a union across domains and cannot be read as a per-file coverage claim.

Surfaces checked with no defect found:
- Onboarding/placement writes (inert claims, failure recorded).
- LanguageSwitcher/Onboarding/Landing gated to the public set.
- errorMonitor: name, 40-char message and route only. No stack, no input values seen, though the 40-char message could carry a server error echo.
- sw.js: content-hashed audio paths, network-only REST, vite:preloadError handled, not registered in native.
- Speaking reports itself unavailable in native (speechSupport.js).
- Password reset: native recovery redirect exists. The Supabase redirect allow-list is an unverified config item.
Not reached: Writing, Listen, FillBlank, SentenceBuilder, Grammar, YouTube, KnownWords, PublicStory (anonymous RPC public_story, body not read).

## D. Gate and verdict logic
G1. Both NO-GOs follow from the evidence. Beta: 001, 002, 003, 004, 005 and 013 (config only) are correct blockers.
G2. Make 012 a blocker only for Play internal, not TestFlight.
G3. A4 cites 022, but 022 is prioritised "public — Should improve". Reconcile one way or the other.
G4. The A8 "safe narrowing: HSK 1–2" cannot be enforced. Onboarding offers higher tiers plus placement (Onboarding.jsx:126-171), and the HSK 3 seed is affected too. Either fix the HSK 3 senses, or brief testers and accept the risk. Don't claim that narrowing removes it.
G5. 006 for beta: relevant whenever testers can place at HSK 3+, which they can. I'd make "HSK 3 subset fixed or testers briefed" an explicit beta condition.
G6. B11 "Fail" rests only on Low items, and B6 rests on Should-improve Mediums. That contradicts the stated priorities. Either promote those items or mark both gates "Pass with known issues". The react-router high advisory (GHSA-wrjc-x8rr-h8h6) is a one-line npm audit fix and is worth doing before beta regardless.
G7. Missing from Gate B: CH-01, and iPad screenshots plus an iPad test pass (implied by 013 if iPad stays). Missing from Gate A when the beta uses external TestFlight: 007 and the Beta App Review info.
G8. 001 at Critical: not warranted (see A1). Keep High plus beta-blocking.

---
## Lead resolution of the challenges (2026-11-09)
- **A1 / CH-02:** accepted. HD-AUD-001 now includes Analyzer "Add all" (Analyzer.jsx:88-104, 113) and ChatMission.jsx:176 as inserters. It also records that a saved current-level word drops out of the curriculum new queue and still consumes the daily allowance. Severity stays High (no data loss; the fix heals rows retroactively).
- **A2:** accepted. Reworded: one op stays queued forever, while the other ops still flush.
- **A3:** resolved. The CI log excerpt is now in `evidence/ios-testflight-failure.txt` (name redacted). The issue is treated as an owner action on gate A2.
- **A6:** accepted and confirmed in prod (read-only aggregate): HSK 3 has 8 capitalised readings and 9 proper-noun glosses, HSK 1 has 4 capitalised readings, and L4–L6 have more. This is a heuristic count that needs curation, because some capitals are legitimate proper nouns. HD-AUD-006 now names HSK 3, so it is beta-relevant.
- **A7:** accepted. HD-AUD-007 is now Medium, Must verify, gate B4, and gate A10 if external TestFlight is used.
- **B9:** accepted. HD-AUD-009 is now Low (the recap copy and the "Mastered" wording are a product call).
- **B10:** accepted. HD-AUD-010 refs are corrected to segmentLine and token building (storyReading.js:808-849). The claim is about the absence of any per-token reading override in `src/`.
- **CH-01:** accepted and confirmed by lead grep: there is no Apple token revocation anywhere in `src/`, `supabase/` or `worker/`. Added as HD-AUD-063 (Medium; Must fix for the public iOS release; requirement wording to be re-checked against Apple's current deletion guidance).
- **CH-03:** accepted. The challenge.md reference now exists. `coverage-not-reviewed.txt` is a union across domain lenses, so a file listed there may still have been traced for a specific finding (REPORT §3 now says so).
- **G2:** accepted. The 012 Back fix is required for Play internal only.
- **G3:** accepted. A4 now cites 001 only; 022 stays public.
- **G4/G5:** accepted. The "HSK 1–2 narrowing" claim is removed. The beta condition is now: fix the 006 subset at HSK 1–3, or brief testers explicitly.
- **G6:** accepted. B11 is now "Pass with known Low issues". For B6 the lead promoted 014/015/016 to Must fix for public, because they are real access barriers on core screens (Study, the reader). 023 (npm audit fix) is recommended before beta.
- **G7:** accepted. CH-01 added to B3, iPad to B5, and 007 to A10.
