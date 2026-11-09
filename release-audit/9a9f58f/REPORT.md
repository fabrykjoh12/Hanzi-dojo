# HanziDojo — release-readiness audit

**Audited commit:** `origin/main` @ `9a9f58f` (2026-11-09) · **Audit date:** 2026-11-09 · **Type:** audit and plan only. No product code, configuration, data or tracker was changed.

This is a technical and product recommendation. It is not a certification and not permission to launch. All quality scores are provisional expert judgments, not learner data.

**Contents**
1. Executive verdict
2. Baseline, build identity and scope
3. Coverage (and what is not covered)
4. Scorecard
5. Per-surface assessment
6. Release gates
7. Backlog, critical path and handoffs
8. Residual risks, owner decisions, learner-validation plan
9. Continuation and retest plan
10. Report reconciliation

---

## 1. Executive verdict

| Target | Verdict | Why (short) |
|---|---|---|
| **Next private beta** (TestFlight / Play internal) | **NO-GO** | Shown to fail: the iOS lane is blocked (HD-AUD-003), the Android build would start broken (004), and both store builds ship the wrong bundle while `/privacy` says otherwise (005). Two core-loop defects are confirmed: saved words are never studied (001), and an offline grade can be lost (002). Android Back exits mid-onboarding (012, Play internal). Wrong-sense cards reach HSK 3 testers (006). |
| **Public store release** (App Store + Play) | **NO-GO** | Everything in the beta row, plus wrong vocabulary senses across all of HSK 3–6 (006), an incomplete Play deletion page (017), unshipped font licences (046), no Sign in with Apple token revocation on deletion (063), and accessibility barriers on Study and the reader (014–016). Also unverified: a demo account, a native-speaker editorial sign-off, real-device passes, and backup/restore. |
| **Web (hanzi-dojo.com)** as the legal/public surface | **UNDETERMINED** | This sandbox could not reach the site, so the deployed build and security headers were not observed. The code shows no security headers (025). |

**What is shown to work** (the main strengths to keep):
- **Checks:** lint has 0 errors, and **5,106/5,106 unit tests** and **173/174 e2e tests** pass; the one failure is a sandbox font-rendering snapshot, and CI is green on the same commit.
- **Server-side boundaries:**
  - RLS is on for every table.
  - Every admin RPC calls `assert_admin`, and every SECURITY DEFINER function pins its search path.
  - A trigger blocks self-promotion to admin.
  - Signed-out users can call only two public RPCs.
  - Account deletion is self-serve and reaches every learner table.
- **Grading:** idempotent (`client_op_id`) and protected against stale replays, both reproduced. Local-midnight and DST handling is correct in three timezones.
- **Story corpus:** 204/204 published stories are line-aligned with full S0 narration, and 171/171 authored stories pass the repo validator.
- **Design:** calm and polished in portrait light mode; no horizontal overflow at any of the 200 tested renders.

**Top risks:**
1. **Saved words never reach review (001).** The "difficult word → review" loop is broken for 88 cards across 6 learners. Saved words also leave the curriculum queue and use up the daily new-word allowance; Analyzer "Add all" can exhaust it in one tap.
2. **The store pipelines can't currently produce a correct beta build (003/004/005).**
3. **Wrong-sense HSK 3–6 flashcards (006; HSK 3 included, so beta-relevant).** These teach errors, which is the product's core trust.
4. **Lost offline progress (002).**
5. **Little verification:** no real-device, screen-reader or native-speaker checks were possible.

**Most valuable improvements** (each is small; all are in §7):
- Fix 001.
- Switch the store builds to `build:native` and give Android its environment.
- Accept the Apple licence agreement.
- Let in-screen state handle Android Back.
- Correct and then re-voice the bad vocabulary senses.

---

## 2. Baseline, build identity and scope

- **Repo:** `fabrykjoh12/hanzi-dojo`, audited at `9a9f58fbaf8524f53bc9b41aa721764449c153fc`, from a detached worktree with `npm ci` from the lockfile. The working branch `claude/probe-frontmatter-hook-enforcement` is 24 commits behind main; only `release-audit/` was added to it.
- **Tools:** Node 22.23.4, npm 10.9.9, Playwright 1.61 with Chromium (pre-installed), Linux container.
- **Stack (verified):**
  - React 19 SPA, Vite 8, react-router-dom 7.17, plain JSX.
  - Supabase (auth, Postgres with RLS, public `audio` bucket).
  - Scheduler: **ts-fsrs 5.4.1**, retention 0.9 by default (0.85/0.9/0.95 selectable), fuzz on.
  - Capacitor 8: iOS (TestFlight lane) and Android (no store lane yet).
  - A Cloudflare worker plus a local bridge for the internal Dojo HQ.
- **Targets (CLAUDE.md §1, decided 2026-08-07):** native apps on both stores. The web is the legal/public surface only.
- **Production scale (read-only aggregates):**
  - 43 auth users, of whom 2 signed in within the last 30 days.
  - 3 admins.
  - 2,376 cards and 2,967 review logs.
  - 204 published Chinese stories.
- **Deployed identity:**
  - **Web:** `hanzi-dojo.com/version.json` could not be fetched (the egress proxy refused the host). The web deploy identity is **unverified**.
  - **CI on main @ 9a9f58f:** CI, E2E, Native, Roadmap sync and Discord all succeeded.
  - **iOS:** the last successful TestFlight build was from 97c9f3a on 2026-08-16. Both of today's runs failed (HD-AUD-003).
  - **Android:** no store build has ever been made.
- **Prior audits:** `docs/PRE-RELEASE-READINESS-AUDIT.md` (2026-08-15), `docs/RELEASE-BLOCKER-REMEDIATION.md` and `docs/PRE-RELEASE-CHECKLIST.md` were used as leads and re-checked. Stale or false claims are in HD-AUD-049, HD-AUD-005 (PRIVACY-AUDIT "F4 FIXED") and HD-AUD-006 (BACKLOG "applied").
- **GitHub issue tracker:** 0 open issues. Work is tracked in the docs (BACKLOG, PM-BOARD), so findings link to doc lines rather than issue IDs.

### Product and feature map (learner surfaces)

| Surface | Code |
|---|---|
| Public pages | Landing, `/how-much-can-you-read` assessment, Auth, password reset, `/privacy` `/terms` `/support` `/methodology`, public story `/read/:id` |
| Learner shell | Home, Study/Flashcards (+ weak), Stories shelf, series, readers (scroll/immersive, paced, manhua, chat, scene, interactive chat), Practice hub, then Writing, Listen, Speak (hidden in apps), Tones, Fill-blank, Sentence builder, Grammar and grammar practice, Strokes, Dictionary, Words/Known words, Analyzer, YouTube, Test (level test), Profile, Settings, Languages |
| Admin | `/dashboard` (both builds), `/hq` (internal build only; stripped from the public/store bundle), `/dev` (admin-gated) |
| Routes | `src/routes.js` (`KNOWN_VIEWS`) |
| Navigation | `src/navConfig.js` |
| Native shell | `src/nativeShell.js`, `src/NativeShellBridge.jsx` |

### Core data flows
- **Grading:**
  1. Study grades a card with `srs.schedule`.
  2. The write goes to the `grade_card` RPC, a SECURITY DEFINER function that updates the card, inserts the review log and updates daily activity.
  3. When offline, the write waits in the `syncQueue` outbox and replays later.
- **Reading:**
  1. The reader segments each line (`storyReading.js`).
  2. A tapped word opens the lookup sheet.
  3. "Add to deck" inserts a `cards` row directly under RLS. **HD-AUD-001: that row is then never studied.**
- **Story unlock:** client-computed learned coverage, plus `story_unlocks` and `claim_story_reward` (RPC).
- **Deletion:** the `delete_my_account` RPC cascades from `profiles` and also deletes the unrelated `bodyos_app_state` (HD-AUD-030).

---

## 3. Coverage (and what is not covered)

**Three separate measures, none a substitute for another:**

1. **File review coverage:** 1,483 tracked files at 9a9f58f.

| Bucket | Files |
|---|---|
| Read in full | 47 |
| Skimmed or targeted reading | 207 |
| Validated by script (478 binaries + content data) | 507 |
| Legitimately excluded (vendored skills, historical specs, frozen-track data) | ~115 |
| **Not reviewed** (time budget, or outside each reviewer's lens; includes ~150 test files) | **635** |
| No ledger line | 1 (`LICENSE`, since read by the lead) |

   The not-reviewed files are listed one per file with a reason in `appendices/coverage-not-reviewed.txt`. This list is a union across the five domain lenses: a file listed there may still have been traced for one specific finding (for example `StoryReaderImmersive.jsx` for 022). It was not reviewed as a whole. **The file-level review is therefore incomplete.** The prompt's "inspect every first-party file" requirement is **not met**, and this is said plainly here.
2. **Test execution coverage:** every automated suite in the repo was run (§2 and `evidence/`). No code-coverage measurement was taken, so measured code coverage is **unknown**.
3. **Journey coverage:** the table below.

| Journey | Status | How |
|---|---|---|
| Visitor → onboarding → first session → next step | Pass (mock) | UX runtime walkthrough on the mock backend, by a reviewer with prior code exposure (not unprimed) |
| Add word → learn/review → persistence | **Fail** | HD-AUD-001 (automated harness + production count) |
| Story → reader → pinyin/translation/word help/audio → save word → finish/resume | Pass with defects | Reader runtime (mock); 022, 016, 010. Audio not heard. |
| Paged and scroll reading, manhua, settings, back/forward, resume | Partial | Runtime (mock); 043 suspected on device |
| Daily return: due / none / overdue / interrupted | Pass (logic) | SRS harness with controlled clocks; gentle-return cap read in code |
| Offline grading and reconnect | **Fail** | HD-AUD-002, 038 (harness) |
| Login/logout, recovery, expired session, account switch | Partial | Static review; logout cache isolation fails (024). Password reset and expiry not run. |
| Account deletion | Static pass | RPC body and FK map checked live. Not executed (no disposable account in a non-production environment). |
| Learner → admin/internal routes and APIs | Pass (static + live catalog) | Repo e2e `hq-gate`; live policies and grants. Admin-account verification not done. |
| Two isolated learners / cross-account | Static pass | RLS predicates read live. Not executed with two accounts (no staging tenant). |
| Billing / restore purchases / UGC | N/A | Free app, no payments, no user-generated content |
| Native push, universal links | N/A for launch | Not implemented and not promised (052) |
| Real device (iOS/Android), VoiceOver/TalkBack, physical touch | **Blocked** | No devices in this environment |
| Chinese editorial and audio listening | **Blocked** | Needs a qualified native speaker. Automated structure checks only. |

**Execution matrix used:**
- Desktop Chromium (Playwright).
- Viewport emulation at 320/390/430/768/1280 px, light and dark.
- 640×400 to approximate 200% zoom, plus 4 phone-landscape sizes.

**Not tested:** WebKit, Firefox, real WKWebView or Android WebView, the production web build in a browser, slow-network or CPU throttling on a device, and field Core Web Vitals. No field metrics exist, so no LCP/INP/CLS pass is claimed.

**Evidence rules:**
- "Mock" means the repo's intercepted Supabase (`tests/fixtures/mockSupabase.js`). It demonstrates UI behaviour, not backend correctness.
- Production evidence is read-only SQL on catalog tables or aggregates. No personal rows were read.

**OWASP ASVS 5.0:** the applicability mapping in `appendices/security-review.md` follows the actual data flows: authentication, session, access control, validation, data protection, configuration, and API/RPC. Detailed requirement IDs were not enumerated one by one, so this is not an ASVS conformance claim.

**WCAG 2.2 A/AA:** checked with automated axe scans plus manual keyboard, focus, lang and reduced-motion checks (`appendices/ux-a11y-review.md`). No assistive technology was used. **This is not a conformance claim.**

---

## 4. Scorecard

**Rubric (fixed before scoring):** 0–2 unusable or unsafe · 3–4 major failures · 5–6 usable with material weaknesses · 7 generally usable with documented gaps · 8 strong, no material weakness in the verified scope · 9 excellent with broad evidence · 10 exceptional. NR means not enough evidence to rate.

| # | Area | Score | Conf. | Basis and main deductions | To reach 8 |
|---|---|---|---|---|---|
| 1 | Product value, scope, loop coherence | 6 | M | Strong concept and calm tone. Learn → read works. The read → review half is broken (001, 022), and mastery claims are over-generous (009). | Fix 001 and 022; honest mastery labels |
| 2 | Onboarding and first-session activation | 7 | M | Coherent pre-login funnel and placement (mock runtime). Android Back exits (012). No unprimed or device run. | 012; real-device first-run walkthrough |
| 3 | Navigation and daily efficiency | 7 | M | Clear daily next action, session estimate, gentle return. Small targets (057); lock contradiction (053). | 057, 053 |
| 4 | Visual craft and typography | 7 (light) / 5 (dark Study and Words) | M | Premium in light mode. Dark Study is broken (014, 054); splash still on the old mark (051). | Dark-mode tokens; splash |
| 5 | Reading/manhua and contextual help | 7 | M | 204 aligned stories, good manhua, word help. Context-blind pinyin (010); popover focus (016); silent lines (043). | 010, 016, 043 |
| 6 | Vocabulary, grading, SRS, progression | 5 | H | FSRS integration is correct and replay-safe, and time boundaries pass. But 001 (saved words never studied), 002 (offline loss), 008, 009 and 038. | 001, 002, 008, 038 |
| 7 | Chinese editorial quality and audio | 4 | M | Wrong senses in HSK 3–6 (006); 3,305 words silent (011); older-story defects (041). Narration is complete. No native-speaker review. | 006 fixed, editor sign-off, 011 |
| 8 | Functional completeness and edge cases | 6 | M | Honest error and empty states (verified in the repo e2e). Several unchecked writes (039, 022). | 022, 039 |
| 9 | Responsive / mobile / native | 5 | M | Web viewports pass. Landscape clipping (013), Back (012), undeclared iPad (013). **No device runs.** | 012, 013 + device pass |
| 10 | Accessibility | 6 | M | Live regions, focus traps and keyboard grading. Missing `lang` (015), popover focus (016), contrast (014, 056). No assistive tech used. | 014–016 + VoiceOver/TalkBack pass |
| 11 | Performance | NR | L | Production bundle 460 kB main (144 kB gzip). Dev-mode FCP ≤1.5 s on desktop. No field data and no device profiling. | Device profiling (manhua reader) |
| 12 | Reliability and offline recovery | 5 | M | Outbox and replay idempotency are good, but there is a poison write (002), undo (038) and cache leakage across users (024). | 002, 038 |
| 13 | Data integrity, persistence, migrations | 6 | M | Strong DB constraints and a stale-replay guard. One migration is pending (037). Production migration history can't rebuild the schema (019). Day counts are overwritten (008). | 008, 019, 037 |
| 14 | Authentication, authorization, security | 7 | M | No cross-user exposure found. Admin gated on the server. PKCE in the native app. Weak password policy (026); no headers (025); deep-link redirect (023); internal bridge (021). | 023, 025, 026 |
| 15 | Privacy, transparency, user controls | 5 | M | Self-serve deletion and first-party analytics. False Google Fonts claim (005), shared BodyOS pool (030), offline cache not cleared (024), backups enabled (048). | 005, 024, 030 |
| 16 | Test quality and regression protection | 6 | M | 5,106 unit + 174 e2e tests, meaningful in the sampled files. But database logic is regex-tested only (020), and no test catches 001 or 002. | 020; regression specs for 001/002 |
| 17 | Architecture and maintainability | 6 | M | Clear pure-module convention. Study and StoryReaderImmersive are 1.7–1.8k lines; add-to-deck is duplicated. Docs are extensive but partly stale (049). | Extract session and add-to-deck modules |
| 18 | Deployment, observability, recovery | 4 | M | Good CI. Store lanes broken (003, 004), no release-cut gate (018), restore unproven (019), no crash reporting or source maps (052). | 003, 004, 018, 019 |
| 19 | Content completeness, rights, help, support | 6 | M | Licensing docs; CC-CEDICT and Tatoeba credited; Azure S0. Gaps: font licences (046), art provenance (047), audio gaps (011). | 046, 047 |
| 20 | Store readiness and integrations | 4 | M | Deletion, Apple sign-in and a privacy manifest exist. Missing: a working pipeline, a demo account (007), the Play deletion page (017), iPad scope (013), and the policy claim behind 005. | §6 public gates |

No average is used for the verdict. A high visual score does not offset 001, 002 or 006.

---

## 5. Per-surface assessment

Usability and visual scores come from the UX runtime review (mock backend, viewport emulation). The full list of 20 screens is in `appendices/ux-a11y-review.md`.

| Surface | Usability / visual | Functional status | Findings |
|---|---|---|---|
| Landing and pre-login | 8 / 8 | Works (mock) | 055 |
| Auth | 7 / 7 | Works (mock); reset not run | 026 |
| Onboarding | 7 / 8 | Works on web; Android Back loses the answers | 012 |
| Home | 8 / 8 | Works | 053, 057 |
| Study, portrait light | 9 / 8 | Works; saved words missing from the queue | 001, 035 |
| Study, dark | 7 / 4 | Contrast failures | 014 |
| Study, landscape or zoom | 3 / 5 | Hanzi clipped | 013 |
| Recap | 8 / 8 | Over-counts "learned" | 009 |
| Stories shelf and detail | 8 / 8 | Works | 042, 015 |
| Paced / scroll reader | 8 / 8 | Works; context pinyin wrong | 010, 016, 022, 043 |
| Manhua reader | 7 / 9 | Works; slow on desktop CPU | 057 |
| Practice and drills | 8 / 7 | Partial (tone drill missing at HSK 1–2) | 044 |
| Dictionary | 7 / 7 | Works; saved words not studied | 001, 057 |
| Words / Known | 7 / 7 (5 dark) | Labels stranded cards "Learning" | 001, 054 |
| Test | 7 / 7 | Works; unchecked unlock writes | 039, 036 |
| Profile and Settings | 7 / 7 | Works; deletion not executed | 024, 057 |
| Trust pages | NR | Content inaccurate (Google Fonts) | 005, 017, 046 |
| Admin (`/dashboard`, `/hq`) | NR | Server-gated (static); admin flows not exercised | 021, 032 |

---

## 6. Release gates

Gates and criteria were fixed before scoring. Status values: Pass / Fail / Blocked / Not tested / N/A.

### Gate A — Next private beta (TestFlight + Play internal)

| # | Requirement | Status | Evidence / findings | Owner role | Check to close |
|---|---|---|---|---|---|
| A1 | Public scope is Chinese-only; internal tools protected on the server | **Pass** | Live policies, `guard_track_language`, HQ stripped from the store bundle (`verify:public-bundle` passed) | — | — |
| A2 | A store build can be produced from main | **Fail** | 003 (iOS licence agreement), 004 (Android environment/signing) | Account Holder; dev | Green iOS and Android lanes from main |
| A3 | The store build is the intended native bundle | **Fail** | 005 | dev | Workflows use `build:native`; contract test |
| A4 | Core loop works: study, read, save word, review | **Fail** | 001 (022 is tracked for public) | dev | e2e: save in reader → Flashcards serves it |
| A5 | Learning data is durable, including offline | **Fail** | 002 (038 is Low) | dev | Offline harness and e2e drain the outbox |
| A6 | No unresolved Critical/High security risk on included surfaces | **Pass** (static) | Security review: none at High or above | — | — |
| A7 | Supported devices are usable | **Fail** / Not tested | 013 (both); 012 (Play internal only); no device run | dev; tester | iPhone portrait-only or iPad tested; Back fix before the Play track; device smoke |
| A8 | Chinese content fit for a declared beta scope | **Fail** (known defect) | 006 includes HSK 3; onboarding and placement let testers start at HSK 3+ (Onboarding.jsx:126-171), so an "HSK 1–2 only" scope cannot be enforced | owner/editor | Fix the HSK 1–3 subset of 006 first, or brief testers explicitly and accept the risk |
| A9 | Required checks green | **Pass** | lint, unit, builds, guards, e2e (CI) | — | — |
| A10 | Testers can reach the app (internal tester list, sign-in works; Beta App Review credentials if external TestFlight) | **Not tested** | Owner console; 007 | owner | Internal track invite; demo account if external |

**Beta verdict: NO-GO.** A2–A5, A7 and A8 are shown to fail. **Narrowing that does help:** an iPhone-only internal TestFlight round (iPhone portrait) can go before the Android work (004, 012). It still needs A2 (iOS), A3, A4, A5, and either the HSK 1–3 fixes for 006 or briefed testers. The challenge pass showed that an "HSK 1–2 only" scope can't be enforced in the product, so it is not offered as a narrowing. Strongly recommended before beta: `npm audit fix` for react-router (023).

### Gate B — Public store release (adds to Gate A)

| # | Requirement | Status | Evidence / findings | Owner role |
|---|---|---|---|---|
| B1 | Chinese editorial sign-off for published stories and grammar | **Blocked** | HD-P9; 006, 010, 041 | Native-speaker editor |
| B2 | Vocabulary senses correct | **Fail** | 006 | dev + editor |
| B3 | Disclosures and deletion obligations (privacy, deletion page, Apple token revocation, generated content, licences) | **Fail** | 005, 017, 063, 046, 047, 030 | owner + dev |
| B4 | Store review access (demo account, notes) | **Not tested** | 007 | owner |
| B5 | Store paperwork (privacy labels, Data safety, age rating; iPad screenshots and an iPad test pass if iPad stays) | **Not tested** | Docs drafted (`STORE-LISTING.md`); consoles not visible; 013 | owner |
| B6 | Essential accessibility | **Fail** | 014, 015, 016 (promoted to Must fix: barriers on Study and the reader); no assistive-technology pass | dev; tester |
| B7 | Backup, restore and rollback proven | **Not tested** | 019 | owner/dev |
| B8 | Release-cut discipline and versioning | **Fail** | 018 | dev |
| B9 | Monitoring and support ownership | **Not tested** | `errorMonitor` exists; no crash reporting (052); support via Discord | owner |
| B10 | Real-device passes (`docs/TESTING.md`), audio in WKWebView, magic-link deep links | **Blocked** | No devices | tester |
| B11 | Security hardening | **Pass with known Low issues** | 023, 025, 026 (no Critical/High/Medium learner-facing security finding) | dev/owner |

**Public verdict: NO-GO.** B2, B3, B6 and B8 are shown to fail. B1, B4, B5, B7, B9 and B10 remain unverified.

---

## 7. Backlog, critical path and handoffs

Effort is relative and uncertain: XS < half a day · S 1–2 days · M up to a week. Every finding's acceptance criteria are in `FINDINGS.md`.

### 7.1 Immediate containment and beta blockers (dependency-ordered)
1. **Owner:** accept the Apple licence agreement (003). XS. Unblocks every iOS build.
2. **Dev:** store workflows use `build:native` and pin it in a contract test (005). XS.
3. **Dev and owner:** Android lane gets the Supabase environment, a signed AAB and a keystore secret (004). S, plus owner keystore. Depends on 2.
4. **Dev:** serve saved new cards in Study, with regression specs, covering every inserter including Analyzer "Add all" (001). S. Highest learner value.
5. **Dev:** fix offline local-id replay and the 22P02 handling (002). S–M.
6. **Dev:** Android Back consumes in-screen state (012). S. Needed before the Play internal track only.
7. **Dev:** make iPhone portrait-only for the beta, or test iPad (013, config). XS.
8. **Dev:** deep-link backslash rejection and react-router upgrade (023). XS.
9. **Owner and editor:** fix the HSK 1–3 subset of 006, or brief testers (A8). Run an internal-track smoke on one iPhone and one Android device (A7, A10).

### 7.2 Required for public release
- **Content:**
  - 006 detection, correction, editor sign-off, then re-voicing (011).
  - Editorial review (041, 010).
- **Disclosures:**
  - Deletion page with the retention period (017).
  - Sign in with Apple token revocation on deletion (063).
  - Generated-content and licence notices (046, 047).
  - BodyOS decision (030).
- **Accessibility:** 014, 015, 016 (Must fix), then 054, 056, 057, 059, then a VoiceOver/TalkBack pass.
- **Data integrity and honest numbers:** 008, 038, 039, 037, 042 (define story % known in METRICS.md), 035 (grade-button labels), 053 (Home vs Stories lock state).
- **Hardening:** 025, 026, 024, 048, 027.
- **Operations:**
  - Release-cut gate and versioning (018).
  - Restore drill and rollback doc (019).
  - Crash reporting and source maps (052).
- **Store:**
  - Demo account (007).
  - iPad decision and screenshots (013).
  - Privacy labels and Data safety, re-checked against 005, 024 and 048.
  - Splash (051).
  - Entitlements in the project (050).
- **Docs:** refresh the PRE-RELEASE-CHECKLIST (049).

### 7.3 High-value post-launch
- SQL tests in CI (020).
- Honest mastery model (009) if not done before launch.
- Context-aware pinyin everywhere (010).
- Dynamic Type (060).
- Rate limits (028, 031).
- Internal bridge hardening (021, 032).
- Level-test attempt reset in local time (036); shared mastery rule in achievements (040).
- Client-trusted progression: record as accepted risk, owner decision (029).
- CI pinning (033).
- DB hygiene (034).
- Native push.

### 7.4 Optional ideas
- Label every tab (058).
- Follow the OS theme (055).
- Erhua pinning (045).
- Tone drill at HSK 1–2 (044).
- "Still hard" re-queue for in-deck words (022, product call).

### Critical path, parallel work and handoffs
- **Critical path:** 003 (owner) and 005 → 004 → beta build. In parallel: 001 → 002 → 012 → device smoke → **beta**. Then 006 and the editor, plus 017/046/007/018/019 → device passes → **public**.
- **Parallel work:** content (006/011/041) runs alongside the code fixes. The editor review is the longest wait, so recruit now.
- **Handoffs:**

| Who | What |
|---|---|
| Account Holder (Apple) | 003 |
| Owner | Keystore (004), Play console, retention fact (017), demo account (007), BodyOS decision (030), HIBP toggle (026), plan/PITR (019) |
| Native-speaker editor | 006, 010, 041 |
| Device tester | A7, B10, 043, 060 |

**Missing tasks not already tracked:**
- 001, 002, 005 (BACKLOG and PRIVACY-AUDIT call this "fixed"), 004, 012, 013 (iPad), 022, 024, 030 (the shared-pool decision is contradictory in the docs), 046 and 063.

Already tracked elsewhere:
- 003 is new; the doc assumes the lane works.
- 006 is tracked as "applied", which is wrong.
- 037, 038 and 051 are in BACKLOG or the checklist.
- No tracker issues were created.

---

## 8. Residual risks, owner decisions, learner-validation plan

### Uncertainty register (not confirmed defects)
- **WKWebView audio, autoplay and story narration:** not run on a device.
- **Magic-link and password-reset deep links into the app:** not run.
- **Manhua reader on low-end Android:** 351 ms of long tasks on a desktop CPU.
- **Supabase Auth configuration** (redirect allow-list, rate limits, server-side minimum password): not readable with the available tools.
- **Web deploy identity and headers:** unreachable from this sandbox.
- **3 auth users without a profile row:** cause unknown (030).
- **The 25 older stories not in the repo:** hand-sampled only (041).

### Owner decisions needed
1. **Beta scope:** fix the HSK 1–3 part of 006 first, or ship with briefed testers? iPhone-only first, or iPad too?
2. **BodyOS:** remove it from this project, or disclose the shared account pool?
3. **Mastery wording:** what may the app call "Mastered"? (009)
4. **"Still hard" from the reader:** should a word already in the deck be pulled forward? (022)
5. **Security trade-off:** accept client-trusted progression as a known risk (029)?

### Learner-validation plan (proposed; no results exist)
- **Profiles:** 5–8 adults:
  - 3 absolute beginners
  - 2–3 at HSK 2–3
  - 1–2 heritage learners
  - at least 2 on Android and 2 on iPhone
- **Tasks:**
  1. Install and sign up.
  2. Finish the first session.
  3. Open and finish a suggested story.
  4. Save two words.
  5. Return the next day and review.
  6. Find "delete account".
- **Observe:**
  - Time to first graded card.
  - Whether saved words are recognised in review the next day.
  - Whether learners can explain what "learned" and "mastered" mean.
  - Any confusion at locks and unlocks.
- **Proposed success criteria** (proposed, not measured):
  - At least 80% complete the tasks unaided.
  - 0 lost-progress events.
  - Most learners can correctly explain why a story is unlocked.
- This validates usability, not long-term retention.

---

## 9. Continuation and retest plan

1. **After 003, 004 and 005:**
   - Dispatch both store lanes from main.
   - Check that the store `dist` contains no `fonts.googleapis` and does contain the Supabase URL.
   - Smoke-test on one iPhone and one Android device.
2. **After 001 and 002:**
   - Re-run `appendices/harnesses/addtodeck.test.js` and `sync.test.js`. Re-point their absolute paths at a fresh checkout.
   - Re-run the production count `select count(*) from cards where state='new' and coalesce(reps,0)=0 and prior_known_at is null`, which should trend down.
3. **After 006:** re-run the detector queries in `appendices/content-review.md` and get the editor's sign-off list.
4. **Re-run the full baseline:**

```bash
npm ci
```

```bash
npm run verify:pr
```

```bash
npx playwright test --trace off
```

```bash
npm audit --omit=dev
```

5. **Still owed from this audit** (blocked here):
   - Device passes.
   - VoiceOver/TalkBack.
   - Web header and version check from a host that can reach `hanzi-dojo.com`.
   - Supabase Auth configuration review.
   - Execution of deletion and two-account RLS tests in a non-production project.
   - Review of the 635 not-reviewed files (`appendices/coverage-not-reviewed.txt`), prioritising non-test `src/` modules.

---

## 10. Report reconciliation

- **Findings:** 63 in total: **6 High, 16 Medium, 41 Low.** After the challenge pass, 007 went from High to Medium, 009 from Medium to Low, and 063 (Sign in with Apple revocation) was added. By priority:

| Priority | Count |
|---|---|
| Must fix | 14 |
| Must verify | 6 |
| Should improve | 28 |
| Optional | 13 |
| No action (dispositioned) | 2 |

  Every ID appears in §7 or has an explicit disposition (061 environment; 062 latent and already tracked). No Critical findings. The challenge pass argued against making 001 Critical (no data loss, and the fix heals the stranded rows), and every challenge is resolved in `appendices/challenge.md`.
- **Executed checks:** lint, unit, two builds, two guards, npm audit (fails on the react-router advisory, HD-AUD-023), and Playwright (173 pass / 1 env-fail / 6 skipped).
- **Domain harnesses:** SRS (4 specs, 3 timezones) and content (5 scripts).
- **UX:** 200 renders, 40 axe scans, keyboard, lang scan.
- **Live database:** read-only checks.
- **Open gates:**
  - Beta: 6 Fail (A2, A3, A4, A5, A7, A8), 1 Not tested (A10).
  - Public: 4 Fail (B2, B3, B6, B8), 6 Not tested or Blocked (B1, B4, B5, B7, B9, B10), 1 Pass with known Low issues (B11).
- **Evidence:** all paths are under this directory. Screenshots are a curated set of 14 (the full 299 were left in the session scratchpad and are not committed).
