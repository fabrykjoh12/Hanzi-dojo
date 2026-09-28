# Hanzi Dojo recovery checkpoint

## State and authority

This is a reconstruction from upstream `8a26ecbc40eb1c1723b5d1c09ee15baf17cd2b19`.
The previously reviewed local candidate and its local ZIP were lost when the temporary workspace disappeared. No copy was recovered from the checked local paths or Library searches. The lost commit was `6b67461b159f01797135136754a2ad2e62822be8`; it was never pushed. A commit ID without its objects cannot restore those changes.

The previous session recorded a provisional 8.14/10 review, 5,030 passing unit tests, 217 browser checks, and 15 SQL checks. **Those are historical reports, not verification of this reconstruction.** Its source, screenshots and logs are unavailable. Do not reuse that pass or invent replacement evidence.

On 28 September 2026, the owner explicitly authorized pushing recovery checkpoints to a dedicated branch in the public `fabrykjoh12/Hanzi-dojo` GitHub repository. The recovery branch is `codex/recovery-redesign-2026-09-28`. This is permission to save source and project verification there. It does not authorize a public app release, a main-branch merge, publishing credentials or learner data, or the separately rejected Linear mutations. TestFlight remains subject to the original specification's quality, backend, native and signing gates.

## Saving and continuation procedure

1. Treat the remote recovery branch as the durable source of truth. A local commit, ZIP, screenshot or download link is not a remote checkpoint.
2. Reconstruct a coherent bounded increment; record what works, the exact checks run, and what remains unverified.
3. Run the repository's canonical `npm run verify:pr` before committing. Preserve existing required gates; use isolated build directories because build variants share `dist/`.
4. Push the increment to the recovery branch and read the remote branch SHA back. Only call it saved after the remote SHA matches the intended commit.
5. Keep this record and concise supporting evidence with the code. Open a draft PR for remote CI; do not equate a draft checkpoint with release readiness.
6. At session start, fetch the recovery branch, read this record and the latest status, and compare local/remote SHAs before editing. If the workspace disappeared, clone the repository and check out that branch. Do not rebuild already-pushed changes from conversation memory.

Recovery commands once the branch has a checkpoint:

```sh
git clone https://github.com/fabrykjoh12/Hanzi-dojo.git
cd Hanzi-dojo
git switch --track origin/codex/recovery-redesign-2026-09-28
npm ci
```

No automatic background saver is installed. Checkpoints are explicit commits and verified pushes during the working session. GitHub checkpoints preserve work already pushed; changes made since the last checkpoint can still be lost.

## Work being reconstructed

The following are retained design and engineering notes, **not claims that the current branch implements them yet**. Implement against the actual source and preserve existing data, architecture, providers, language configuration, instructions and authority controls. The stack remains React JSX, Vite, Capacitor, Supabase and FSRS.

### Durable reviews, Undo and reset

- Separate the immutable review-operation journal from downloadable vocabulary/cache data. Required IndexedDB writes must finish transaction commit before sending an RPC or declaring an offline review saved. Storage denial must produce an actionable failure, not a false success.
- Every operation has a stable ID, owner, vocabulary/card identity, original day, immutable expected card snapshot, profile reset generation, proposed FSRS update, log and before-state. Retrying reuses exactly that payload. Do not fall back from a missing v2 RPC to unsafe legacy writes.
- Local records use compare-and-swap over status/card identity/revision/ordinal. A late duplicate grade response must not overwrite Undo or a reset tombstone. Same operation IDs cannot cross accounts; two pending intents for one vocabulary entry must not silently overwrite each other.
- Keep per-owner serial recovery and durable Undo intent. Online grade only advances after acknowledgement; offline grade may advance only when durable. Offline Undo remains pending and does not claim a rollback. Retired operation retry must remain a conflict. A conflict offers safe exit/reload rather than inventing success.
- Scoped card queries take a journal baseline before fetching. Reconcile only rows represented by that baseline and query scope. Absence or replacement retires the matching old identity; same-identity receipts must survive overlapping caches. Retired/null-card tombstones remove only their own obsolete identity, never a replacement card. Do not compact across different card IDs or remove reset tombstones; repeated reset chains must remain safe.
- Pending vocabulary IDs include owner-matched legacy outbox rows. Legacy grades should fail closed and remain visible, not replay unsafely. Both explicit operation ownership and embedded event ownership must match. Ownerless operations cannot inherit the current account.
- Download-cache clearing must preserve review intents; account deletion must clear the owner's journal. A local/cross-tab journal notification invalidates prepared sessions but observer failures cannot veto persistence. OfflineBar should refresh count on journal changes, not launch recursive recovery on every write.
- Session preparation recovers first when online, excludes pending cards from all pools, counts genuine introductions plus pending new introductions against the daily cap, and still includes inert owned new cards. Home and Study must use the same definitions. Query failure is not a zero-history learner.
- Study intent creation belongs in tested pure logic. Preserve real FSRS output; no manual mastery/reps invention. Only reinsert an Again card if the acknowledged current card is exactly the intended schedule/identity/revision. A duplicate receipt after another device progressed the card must not reinsert it.
- Profile reset needs to invalidate prepared sessions and reload profile generation even for an inactive track. Reset and other schedule-changing updates need revision-aware conflict handling. App-level integration is owned centrally.

### SQL protocol

- Add card revision and protected profile review generation, plus an owner-scoped operation ledger. Keep receipts through card/log reset, with account deletion cleanup. Schema, RLS, private helper grants, column protections and client execution grants must be explicit.
- `grade_card_v2` validates owner, generation, exact normalized expected snapshot or expected absence, and immutable repeated payload. Acquire a learner advisory transaction lock shared with legacy grade/reset, then card/day locks. Grade, log, activity and receipt commit atomically. A known identical operation is recognized before checking reset generation; unknown old-generation operations cannot resurrect reset progress.
- Return the **current** card on a duplicate receipt, not the historical after-image. Return no card if reset removed it. Preserve exact original day and increment activity additively; never overwrite totals from a stale client snapshot.
- `undo_grade_v2` persists the original operation identity, accepts exactly the original after-version, subtracts only that operation's original-day/category contribution, removes only its log, and restores the original state. A first-grade Undo keeps an inert new card. Damaged aggregates or changed rows conflict rather than clamping. Tombstones make retries idempotent.
- Both reset aliases must advance generation under the shared lock, retain ledger receipts, and preserve sanctioned data rules. Legacy signatures remain compatible but cannot defeat reset tombstones or overwrite server totals.
- Execute actual migrations against an isolated database with owner/anonymous roles, duplicate retries, payload mismatch, Undo, reset, replacement identities, rollback and grants. String contract checks alone are insufficient. Local single-process SQL is not proof of production multi-connection concurrency, deployment, RLS configuration, or live upgrade behavior.

### Home, Practice and first use

- Quiet Studio direction: semantic neutral surfaces, clear type, Chinese content central, accent used sparingly for actions and state, coherent both themes. No dashboard clutter, decorative statistics, fake personalization or unsupported learning claims.
- Home has one whole-queue Start reviewing action, true queue counts and a clear next story with its full actual title and known-word coverage. Weekly progress is calm and unboxed. Profile and recurring controls are at least 44px.
- Practice starts with a contextual recommendation and reachable exercise choices. Root view has no meaningless Back button. Existing providers and practice functionality remain intact.
- Auth and landing preserve the chosen language/course before moving steps. Flashcard introduction uses equal intrinsic card-face areas and remains readable at 320px and enlarged text.

### Navigation, Stories and readers

- Persistent equal Stories / Home / Practice dock, **Home in the middle**. Measure dock height for content padding, including wrapping/enlarged labels and safe areas. Targets remain at least 44px; keyboard focus and reduced motion are respected. Desktop sidebar has usable expanded/collapsed states without decorative watermark clutter.
- Stories must derive selected content from the route. Avoid the previous eager local-state/effect race which briefly exposed the interactive browse shelf during opening, Back, or Next. Keep series origin through chapter navigation, browser history and reload, validating membership. A missing target is a safe missing/loading state, not an interactive browse flash.
- Use actual untruncated story titles, honest known-word coverage and an accessible explanation of its denominator. Avoid claiming personal selection without evidence. Covers show their real art and gracefully handle missing images. Test with the app's real storage-relative asset format.
- Readers have comfortably sized wrap-safe launch/finish/recap/audio controls, honest progress and contrasting pinyin/selected settings/active speaker in both themes. The settings outside-click handler must not close the menu on a settings choice before the click can register.
- Speaking scores are per prompt; retry replaces a score instead of double-counting. Stop recognition when moving on and ignore stale callbacks from an earlier prompt/session. Browser speech behavior does not establish installed native support.
- Skip-link hiding must follow its own size rather than a fixed offset that leaks at text zoom. Source font loading and complete Chinese fallback must be verified so missing glyphs are not mistaken for layout defects.

## Verification and review contract

Seven equally weighted dimensions: visual craft; product identity/coherence; navigation/comprehension; interaction efficiency; learning/language presentation; accessibility/device behavior; implementation reliability. Anchors: 5 usable with substantial weaknesses, 8 polished/coherent with no material weakness in inspected scope, 9 exceptional with concrete evidence. Mean must exceed 8 and every dimension reach 8; no unresolved critical blocker in the milestone. Scores are provisional expert judgment, not learner-outcome proof.

Inspect actual first-use, Home to review to recap, failure/retry/Undo, offline/recovery, Stories browsing to reader/lookup/completion/series return, Practice exercise and speaking retry, profile and settings. Use representative Chinese, pinyin/tone marks, short/long content, empty/error/loading states; 320/390/430px and desktop, light/dark, text enlargement, keyboard, reduced motion, contrast and safe area. Record source identity with captures. Keep baseline and changed-state evidence comparable. A fresh independent review agent owns the final score; implementation agents cannot self-certify the pass.

Run canonical verify:pr, meaningful browser regressions, actual SQL protocol checks, native shell/build/font check and Capacitor sync in an isolated copy. Preserve ordinary timeouts and CI's visual-baseline authority; no weakening tests to obtain a pass. Keep raw failures and corrections traceable. No sensitive environment values, tokens, learner rows or private user content belong in committed logs/screenshots.

Installed iOS/Android lifecycle, provider authentication, audio/speech, VoiceOver/OS Dynamic Type, offline restart/upgrade, production concurrency and actual migration rollout need their own evidence. The prior Apple sign-in plugin/core-version warning was unresolved; inspect current compatibility rather than assuming it is harmless. No signing/archive/upload was previously performed.

## Release and tracker continuity

The original task has three milestones: next redesigned TestFlight build; public-release readiness; post-launch improvements. Do not gate the next beta on unrelated marketing, but do not waive core correctness or accessibility for beta.

Last session read 52 Linear project issues. The five prepared but **unapplied** updates were FAB-13 (readiness), FAB-28 (FSRS), FAB-34 (visual audit), FAB-24 (accessibility/performance/failures), FAB-33 (Practice). An automatic approval review rejected the first mutation; readback showed all unchanged. Do not represent them as updated or reattempt until explicit destination authorization applies. Those statuses are historical, not a fresh tracker audit.

Other retained release references: FAB-27 release parent had 21 dependencies with 16 unresolved; FAB-20/23/63 native gates, FAB-14 Home, FAB-42 content under FAB-36, FAB-64/65/66 audio. Recheck before making current-state claims. A Done issue is not fresh acceptance evidence.

The release remains HOLD until the reconstructed candidate has a new independent review and the relevant backend/native/CI gates pass. Publish exact achieved state: prepared, built, uploaded, processed or available to testers, supported by current identifiers. Never describe code preparation as a TestFlight release.

## Initial checkpoint scope

At this first checkpoint the upstream app is restored, the remote recovery branch exists, and these retained notes are preserved. Reconstructed application changes and fresh visual/SQL/native evidence are still pending. Subsequent status entries must replace this initial state with concrete commit/check references.
