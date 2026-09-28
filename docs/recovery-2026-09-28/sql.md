# Durable review SQL recovery

Status: local implementation and disposable PostgreSQL execution only. **Not applied to Supabase.**

## Contract shared with the application

`grade_card_v2(p_vocab_id uuid, p_card_id uuid, p_updates jsonb, p_log jsonb, p_day date, p_op_id uuid, p_expected jsonb, p_user_id uuid, p_generation bigint)` accepts one immutable application-produced intent. `p_expected` is the complete previously read card or SQL null for expected absence. The owner must equal `auth.uid()`. An existing card requires its actual ID, exact typed snapshot, and current profile generation. Unknown operations from before a progress reset fail closed. Clients must fetch the complete card and profile before preparing grades; no legacy fallback is safe when v2 is unavailable.

`undo_grade_v2(p_op_id uuid, p_user_id uuid)` refers to the same grade operation. Both return `{status, card_id, log_id, card, already_applied}`; grade also returns `inserted`. Status is `applied` or `undone`. Replay returns the **current** card with the original card identity, or null if that identity was removed. It never returns a historical after-image or a replacement card for the same vocabulary. Conflicts use SQLSTATE `40001` with `REVIEW_CONFLICT`; identity/privilege violations use `42501`. Malformed scheduler observations use `22023`.

`claim_story_reward_v2(p_language text, p_system text, p_claim_date date, p_story_id uuid, p_user_id uuid)` binds an offline reward to the account that queued it before forwarding the existing reward RPC. A missing or mismatched authenticated owner fails with `42501`; anonymous invocation is revoked. The wrapper shares the learner lock. The legacy reward endpoint remains unchanged.

The typed snapshot includes `id`, `user_id`, `vocab_id`, `revision`, `state`, `learning_step`, `interval_days`, `due_at`, `is_easy`, `learned`, `stability`, `difficulty`, `reps`, `lapses`, `last_review`, `scheduled_days`, `elapsed_days`, `prior_known_at`, `prior_source`, `verified_at`, and `first_reviewed_at`. ISO timestamp formatting and real-number serialization normalize through the actual PostgreSQL card row type. Joined vocabulary and display metadata are excluded.

`first_reviewed_at` is additive. It records the original scheduler timestamp when a card first receives a real observation, so a previously saved inert card is counted on its first studied day and offline replay does not change that time. Existing historical observations are not backfilled with invented dates. Calibration `verified_at` remains a server timestamp and requires a prior claim. Undo restores both fields. The timestamp remains null for historical rows whose introduction time is not known; the client must disclose its historical fallback rather than claiming exact recovered history.

## Transaction and access behavior

- One learner-scoped advisory transaction lock coordinates v2 grade, Undo, legacy grade and both reset aliases. Profile/card/log/day rows are locked where read-modify-write is required.
- A grade atomically writes the card, review log, additive daily activity and durable receipt. Every card update advances a server-managed revision, including direct legacy updates.
- Undo requires the exact after-snapshot and revision, matching review log and sufficient original-day counters. It subtracts only its own original category contributions. A first-observation Undo leaves an inert card; it does not delete learner cards.
- The owner-scoped receipt has no card/log foreign key, survives Undo and progress reset, and cascades only with account/profile deletion. Authenticated clients can read only their own receipts and cannot mutate them directly.
- Profile generation and card revision/first-observation fields reject direct client changes, including hostile inserts. Helpers, anonymous RPC access and Supabase default EXECUTE grants are explicitly revoked.
- Both deployed reset signatures preserve the latest story-reward migration behavior (scoped story unlocks and reward claims deleted; active series cleared), their history option, advance generation, retain review receipts and never delete vocabulary.
- The legacy `grade_card` signature remains available, with complete real scheduler observations and additive counts instead of client absolute totals. After a reset, legacy requests with no explicit existing card ID are ambiguous and are rejected. A client refresh/upgrade is required; silent resurrection is forbidden. Pre-migration log receipts are read-only deduplication evidence and cannot be reused as a new v2 operation.

## Reproduction

Run from the repository root after normal project dependencies are installed:

```sh
npm install --prefix /tmp/hanzi-review-sql --no-save @electric-sql/pglite@0.5.8
node verify-review-sql.mjs --pglite /tmp/hanzi-review-sql/node_modules/@electric-sql/pglite/dist/index.js
```

During parallel reconstruction, `--intent-module ../hanzi-persistence/src/studyGradeIntent.js` points at the same real producer before integration. The harness uses Vite's SSR loader to resolve the application's extensionless imports, then calls the actual `schedule()` and `createStudyGradeIntent()`. It executes the complete repository base schema and prerequisite migrations, including the latest `20260809090000_story_chapter_rewards.sql` reset/reward definitions, in a disposable PGlite instance, with only the unavailable `pgcrypto` extension-loader statement omitted because core `gen_random_uuid()` is already present. It applies the new migration repeatedly, including after a saved grade, and simulates Supabase roles and default grants. No production credentials or database connection are involved.

The result file records source hashes, PostgreSQL version, raw execution time and individual outcomes. Tests cover duplicate payloads, exact snapshot/revision conflicts, current-card replay, new and calibration Undo, original-day/cross-session counters, both reset aliases, generation conflicts, repeated replacement identities, grade and late-Undo rollback, damaged aggregates, legacy/v2 transitions, malformed input, anonymous/helper denial, owner RLS, hostile inserts/updates, strict reward-owner identity, both story-reward reset aliases with another owner preserved, and account deletion. Independent review caught an omitted latest story-reset behavior; the migration and real prerequisite fixture now cover that regression.

## Remaining release gates

The PGlite fixture is a single-connection PostgreSQL execution. It proves SQL behavior, permissions, rollback and sequential interleavings, **not separate-connection concurrency**. Before deployment: review production prerequisites/data compatibility, run two real database connections through competing first grades, grade/reset and grade/Undo orderings, verify the PostgREST schema cache and deployed signatures/grants, and test the installed app's offline/account-switch lifecycle. Applying this migration or running any production mutation remains outside this local recovery step.
