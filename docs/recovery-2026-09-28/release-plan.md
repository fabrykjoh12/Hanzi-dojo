# Recovery release plan — 28 September 2026

This plan preserves the original three milestones: **next redesigned
TestFlight build; public-release readiness; post-launch improvements**. It
does not describe any of them as complete. Work is reconstructed from upstream
`8a26ecbc40eb1c1723b5d1c09ee15baf17cd2b19`; the lost candidate's test counts,
score and screenshots are historical evidence only. See [RECOVERY.md](RECOVERY.md).

## Evidence and authorization

- **Fresh source inspection:** the package scripts, native configuration,
  dispatch workflows, grant tests and release documents cited below were read
  in this reconstruction. This establishes their contents, not production
  configuration, secret availability or a working installed app.
- **Fresh focused verification:** the native dispatch changes in this increment
  passed `VITEST_MAX_WORKERS=2 npx vitest run native-ci-contract.test.mjs
  workflow-authority.test.mjs` — 96 tests, 2 files; targeted ESLint and
  `git diff --check` also passed. These execute the extracted workflow shell
  guards with a fixture verifier and real artifact searches. They do not build,
  sign, upload or exercise App Store Connect.
- **Previously read:** tracker states, production findings and older release
  outcomes below are dated reports, not fresh live checks. No Linear, Supabase,
  Apple or Google account was queried or mutated for this document.
- The owner authorized public GitHub recovery checkpoints on
  `codex/recovery-redesign-2026-09-28`. A checkpoint is not a merge to `main`,
  app publication, database apply or permission to update Linear. The earlier
  automatic approval review rejected a Linear mutation; its updates remain
  unapplied. Original conditional TestFlight authorization remains conditional
  on the actual quality, backend, native and signing gates. Do not add a
  redundant approval step merely because preparation and upload are separate
  states; do not treat checkpoint permission as satisfying those conditions.

## Reconstructed candidate evidence

Code checkpoint `5e8832c6e8e7ae6a55958057c599502a1eb92b00` passed GitHub canonical verification (5,039 unit tests plus builds/bundle/icons) and native verification. Local behavioral browser checks passed 181/181 with no retries; the final Auth-only style correction has a separate 12/12 pass. The exact-source rendered review covers 32 states, with no horizontal overflow or page exceptions. Actual disposable PostgreSQL checks pass 24/24. See [independent review](INDEPENDENT-REVIEW.md) for the provisional 8.21/10 result, scope and all seven dimensions (each at least 8).

GitHub Playwright remains red: 183 passed, three reviewed visual comparisons failed and six skipped. The three differences are the intended Landing mobile and Stories desktop/mobile redesigns. Baselines must be produced by the existing `visual-baseline.yml` workflow on the recovery branch, inspected, and followed by fresh comparison CI. Current connector tools can read/rerun workflows but cannot dispatch a new one; no dispatch has been performed. The legacy Cloudflare Workers integration also fails separately.

These results close local reconstruction checks within their stated scope. They do not apply the migration, prove live concurrency or create an installed native release. The verdict remains HOLD for the gates below.

## Milestone 1 — next redesigned TestFlight build

### Product and independent acceptance

Complete and inspect the actual first-use → Home → review → recap → story →
Practice loop, including retry, offline/restart, Undo, reset, lookup, chapter
navigation, settings and speaking retry. Preserve providers, learning semantics
and user data. Verify real Chinese and pinyin; long/short content; empty,
loading and failure states; 320/390/430px and desktop; both themes; enlarged
text, keyboard, reduced motion, contrast and safe areas.

The original review contract remains: seven equally weighted dimensions,
mean above 8, each dimension at least 8, and no unresolved critical blocker in
the inspected milestone. A fresh independent reviewer owns the judgment and
records the scope and source identity. No implementation agent self-awards a
score, and a local screenshot does not prove native OS accessibility or learner
outcomes.

### Backend gate before an app relying on v2 is distributed

Reconstruct, review and commit the durable review migration and its client
integration. The target contract is `grade_card_v2` with immutable operation
ID, owner, expected card/revision, original study day and reset generation;
`undo_grade_v2` targets the original operation ID. The server must atomically
write card/log/activity/ledger, return the current card on duplicate receipt,
preserve undone/reset receipts, reject stale snapshots and old generations,
and subtract only Undo's own daily contribution. First-grade Undo retains an
inert new card. Legacy grades share the learner lock and use additive counters.

Required local SQL checks execute the actual migration and app-produced intent:

1. Duplicate/lost acknowledgement, changed-payload reuse, original day after a
   date change, current-card receipt and replay after Undo/reset.
2. Anonymous execution, explicit default function grants, cross-account
   first-card/existing-card attempts, ledger RLS and protected reset generation.
3. New, learning, review and prior-knowledge categories; multiple sessions and
   mixed legacy/v2 activity; Undo's one contribution without clamping damage.
4. Injected failures at late grade and Undo stages roll every write back;
   retries remain idempotent. Newer/direct card writes cause conflict.
5. Both real reset aliases hold the learner lock, increment generation and
   retain receipts. Test both serial orders, unsent first-card work across reset,
   and repeated replacement identities.
6. Apply twice; test exact RPC argument/result shapes with `schedule()` and
   `createStudyGradeIntent()` output. Preserve structural grant coverage: the historical inventory is bounded to its migration date, with ordered forward checks for later private function grants.

Required client checks use real IndexedDB transactions: no network send before
commit; storage failure never claims success; lost grade/Undo acknowledgement
then reload; two tabs; owner isolation; stale acknowledgement versus Undo;
compaction versus pending Undo; partial query scopes and overlapping caches;
two resets with an untouched old cache; current newer receipt never reinserted
using an old Again decision. Unresolved vocabulary must leave every queue,
including blocked legacy outbox work, and pending first encounters consume the
local daily-new allowance. Cache clearing must preserve the journal.

Local single-process SQL cannot prove concurrent database sessions or the
deployed PostgREST/RLS configuration. Before rollout, inspect applied migrations
and live catalog/grants; apply only the committed reviewed migration through the
authorized deployment process; then validate authenticated RPCs and independent
connections racing grade/Undo/reset. Run security advisors and keep exact results.
The historical index `20260724170000_harden_policies_and_vocab_index.sql` must
not be blindly applied after `20260907010000_cap_dict_add_to_deck.sql` (the
[backlog](../BACKLOG.md) records the incompatible index ordering).

Old outbox grades lack a trustworthy before-state: preserve them visibly and
block unsafe replay, rather than inventing snapshots or silently dropping work.
Plan evidence-based recovery and a coordinated client upgrade. Direct legacy
table writes remain outside v2's RPC guarantees; do not call the whole write
surface server-authoritative on the strength of these new RPCs alone.

### Build and native gate

Run the canonical `npm run verify:pr` on the candidate and retain the exact
commit/result. This runs lint, units, the two web build variants, public-bundle
inspection and icon checks in the order defined by [package.json](../../package.json).
Run meaningful browser regressions; PR `check`, `playwright` and `native-gate`
must report on the candidate head. A recovery-branch push without a PR does not
establish those PR gates. CI owns visual baselines; review intentional image
changes without widening tolerances or changing global timeouts.

Separately run `npm run verify:native` followed by `npx cap sync android` and
`npx cap sync ios`, checking for tracked native-project drift. Use an isolated
worktree/build slot: every variant writes `dist/client`, so parallel builds in
one checkout can inspect the wrong artifact. The native verifier checks shell
agreement, builds with **both** `DOJO_PUBLIC_BUILD=1` and `DOJO_NATIVE_BUILD=1`,
scans the built public bundle and tests bundled fonts in Chromium.

This increment restores both dispatch lanes to that same verified native build,
with Chromium installed first and required `VITE_SUPABASE_URL` plus
`VITE_SUPABASE_ANON_KEY` provided at build time. Each lane quietly confirms both
values occur in the resulting assets before `cap sync` or signing. The values
are publishable configuration, never service credentials. No trigger, permission,
concurrency, signing, certificate revocation or distribution behavior changes.
These source fixes still need the candidate's actual artifact verification and
remote lane result; the 96 focused tests do not substitute for either.

Current identifiers read from source:

- Capacitor, iOS bundle and Android application ID: `com.hanzidojo.app`.
- Capacitor `webDir` / Vite output: `dist/client`.
- Supabase project reference: `bvqvturqupbggxaeihvi`; no secret values recorded.
- Native auth callback: `com.hanzidojo.app://auth-callback`; password recovery:
  `com.hanzidojo.app://password-reset`. Verify both allowlists and real inbox flows.
- Apple native token audience: `com.hanzidojo.app`. Provider configuration and
  real Apple sign-in remain live/device checks, not facts proved by source.

### Signed archive, upload and device acceptance

[ios-testflight.yml](../../.github/workflows/ios-testflight.yml) is dispatch-only;
`upload` defaults to false. It selects Xcode, requires major version at least
26 on `macos-26`, sets the build number from `github.run_number`, manually signs
and exports an IPA, retains `hanzi-dojo-ios-<run_number>` for 14 days, and uploads
only when `upload=true`. This describes the current lane, not a fresh external
SDK-policy determination. Check the selected toolchain at release time.

The lane requires `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` and
`APPLE_TEAM_ID`, in addition to the publishable app configuration. Presence,
scope and validity were not checked here. The App Store Connect key is separate
from user sign-in configuration. `ios-signing-check.yml` is the existing
read-only inventory diagnostic; its status context is `ios-signing-check`.

**Even `upload=false` is not a read-only operation:**
[asc-signing-assets.mjs](../../.github/scripts/asc-signing-assets.mjs) revokes
existing distribution certificates, creates a new one, and replaces its named
profile. Verify the recorded assumption that the revoked keys are disposable
CI assets before exercising the lane. Do not silently change that policy.

[android-build.yml](../../.github/workflows/android-build.yml) uses Java 21 and
`github.run_number` as versionCode. All four existing signing secrets
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`) produce a signed AAB; missing configuration yields a
debug APK, which is not a Play release. This lane stores an artifact and does
not upload it to Play.

Record distinct states with current identifiers: **prepared → verified →
archived/exported → uploaded → processed → available to the intended testers**.
An upload success does not prove processing, test-group availability or device
acceptance. Record commit, workflow run, marketing/build version and Apple
processing result. No signing/archive/upload is claimed by this reconstruction.

On the installed candidate, verify cold start, Apple/Google auth, email recovery,
audio and interruptions, background/foreground, offline restart/reconnect,
storage denial/upgrade, keyboard/back, safe areas, VoiceOver and OS text scaling.
Recheck the previously observed Apple sign-in plugin 7 / Capacitor core 8 warning;
the current package ranges still span those majors. Successful `cap sync` alone
does not establish compatibility. Candidate-specific device checks naturally
follow availability of that build, and block a broader tester invite/public
release until resolved. Marketing completion is not a prerequisite for the
next controlled TestFlight build; correctness and accessibility remain gates.

## Milestone 2 — public-release readiness

Finish the installed-app tester round and full [manual test list](../TESTING.md),
with a fresh account through signup, onboarding, first review/story, reset and
account deletion. Verify provider branding, redirect settings, mail delivery,
permission-denied flows and honest fallback behavior for unsupported native
features. An absent optional notification/speech feature must not be advertised
as functional; an old checklist's feature ambition is not by itself proof of
an external store requirement.

Owner review of `/privacy`, `/terms`, `/support` and `/methodology` remains
required; [store listing copy](../STORE-LISTING.md) is a draft. Complete actual
privacy/data declarations, review access, age-rating answers, final device
screenshots, listing metadata and the deliberate store submission/release cut.
Do not infer public-release authorization from the recovery checkpoint.

Obtain qualified Chinese editorial sign-off for stories and the 14 grammar
topics; assistants cannot self-certify it. Recheck vocabulary/audio reachability,
reading/gloss defects, held chapters and coverage against live content rather
than recycling old counts. The backlog's 21 September report says 1,168 audio
paths repaired and 3,323 HSK 3–6 words still silent; these are historical
measurements. Older claims of complete audio conflict with that newer report.
Use `check-published` and vocabulary integrity checks when their content scope
changes, and read warnings. Broader release must not promise an incomplete band.

Recheck the historical FAB-26 security findings, including `pg_net` ownership
and exposed schemas, the observation constraint, legitimate direct card writers,
private RPC grants and advisors. Structural migration tests explicitly do not
prove production grants. Do not weaken them to accommodate a new helper: revoke
its explicit PUBLIC/anon/authenticated grants as appropriate, and test actual
roles/default privileges. An old Done issue is not current acceptance evidence.

## Milestone 3 — post-launch improvements

Use learner feedback and measured outcomes to prioritize content volume,
recommendation quality, recall ergonomics and performance. FSRS parameter tuning
requires real review volume; do not replace the validated scheduler during the
release reconstruction. Continue bounded logic extraction and cache/data-layer
work with regression coverage. Optional OTA, expanded native speech and other
deferred features need their own product and release decisions. Keep marketing
and learning claims supported by observed behavior.

## Previously read Linear inventory — not re-verified now

Project: **Hanzi Dojo Master Control**, ID
`2dea4996-e8fa-4276-9fc5-87cbf7bfc242`. The prior session read 52 issues. Exact
known names and then-observed states supplied by the coordinator:

| Issue | Name / retained scope | Previously read state |
|---|---|---|
| FAB-13 | Build current Hanzi Dojo release-readiness baseline | In Progress |
| FAB-28 | Audit FSRS scheduling/card-state correctness end-to-end | In Progress |
| FAB-34 | Run screen-by-screen visual polish/consistency audit | Todo |
| FAB-24 | Run release accessibility, performance, failure-state pass | Todo |
| FAB-33 | Clean up/polish Practice page for v1 | Todo |
| FAB-27 | Release parent (exact title not retained) | Todo, Urgent; 21 dependencies, 16 unresolved |
| FAB-20 / FAB-23 / FAB-63 | Native gates (exact titles not retained) | Todo |
| FAB-14 | Home click work (exact title not retained) | In Review |
| FAB-42 | Content work under FAB-36 (exact title not retained) | In Progress; FAB-36 was Done |
| FAB-64 / FAB-65 / FAB-66 | Audio follow-ups (exact titles not retained) | Backlog |

Draft updates to FAB-13/28/34/24/33 were not applied after the first automatic
approval rejection, and readback then found them unchanged. This plan performs
no tracker update and treats all statuses above as historical. Re-read the
tracker before making a current dependency or completion claim.

## Known stale instructions to interpret using current code

- `PRE-RELEASE-CHECKLIST.md` still calls `build:public` the native build and
  describes `cap:sync` that way. Current package scripts use `build:native`;
  the distinction controls bundled fonts.
- `RELEASE-CHECKLIST.md` lists an older subset/count of tests. `CLAUDE.md` and
  `package.json` define the canonical `verify:pr`; native and e2e are separate.
- The old PM board's “No open release blockers” and 665-test snapshot are
  historical. They do not clear this reconstruction or the backend/device gates.
- Older notes say editing a roadmap immediately posts to Discord, or describe
  `main` as unprotected. Current documented behavior is merge-to-main posting
  and a recorded ruleset requiring `check`, `playwright`, `native-gate`; the
  actual external ruleset still needs readback before integration.
- Earlier Services-ID instructions describe web Apple sign-in. Current source
  uses native Apple identity tokens. Verify that actual provider path instead
  of resurrecting the retired credential flow.

**Current verdict: HOLD.** Native dispatch source parity is prepared and
focused-tested. Canonical, browser, actual SQL, native artifact, deployed
backend, signing and installed-device evidence must be attached to the recovered
candidate as those stages complete; no historical score or pass clears them.
