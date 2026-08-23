-- supabase/migrations/20260822180000_scheduler_state_requires_observation.sql
--
-- ⚠️ APPLY THIS LAST. It is the FINAL step of the prior-knowledge rollout, and
-- it MUST NOT be applied until the legacy data migration has completed:
-- production currently holds 594 rows in exactly the shape this forbids, and
-- applying it early would (correctly) fail on all of them.
--
-- Order: additive schema (…160000 + …170000) → frontend → snapshot → manifest
--        → legacy apply → post-apply verification → THIS.
--
-- WHAT IT ENFORCES. A card that carries FSRS scheduler state must have been
-- observed at least once:
--
--   state in ('learning','relearning','review')  ⟹  reps >= 1
--
-- WHY. `reps >= 1` is the fact that means "a human graded this word inside
-- Hanzi Dojo" (knowledgeState.js, CLAUDE.md §7.3b). The whole knowledge model
-- rests on it: isLearned, isMastered and the level-test gate all require it. The
-- old prior-knowledge writer produced state 'review' with reps 0 — three weeks
-- of asserted stability behind zero observations — and this constraint makes
-- that shape unrepresentable rather than merely discouraged.
--
-- WHY IT MATTERS AFTER LAUNCH. Store-released apps bundle a frozen web build,
-- releases are workflow_dispatch-only, and there is no minimum-version gate
-- anywhere (app_version is recorded in analytics and never checked). So an
-- arbitrarily old client can keep writing the legacy seed shape indefinitely.
-- With this constraint that write is REJECTED. An old client failing a bad
-- legacy write is strictly preferable to it silently re-corrupting the model —
-- and the failure is confined to that one write, because seedClaim's insert is
-- already best-effort and never blocks onboarding.
--
-- PROVEN AGAINST THE CANONICAL LIFECYCLE. Every transition that can produce one
-- of the three scheduler states runs through srs.schedule() → ts-fsrs repeat(),
-- which increments reps on every call, so any card leaving 'new' has reps >= 1:
--   * new → learning/review   first grade, reps 0 → 1
--   * learning → review       graduation, reps keeps climbing
--   * review → relearning     a lapse, reps keeps climbing
--   * calibration check       first real review of a claim, reps 0 → 1
-- And every path that produces reps = 0 writes state 'new':
--   * a brand-new card (sessionPrep newItems, the add-to-deck inserts)
--   * an inert prior-knowledge claim (knowledgeState.priorKnownCardRow)
--   * Study.resetCard, which sets state 'new' and reps 0 together
--   * the legacy conversion patch, likewise
--
-- PROVEN AGAINST PRODUCTION (read-only, 2026-08-22): of 1,812 cards, the only
-- violations are the 594 legacy seed rows — every one of which also carries
-- stability 21 / difficulty 5 / elapsed_days 0, i.e. the seed fingerprint.
-- There are ZERO violations among learning/relearning rows and ZERO cards in
-- state 'new' carrying reps >= 1.
--
--   select count(*) filter (where state in ('learning','relearning','review')
--                             and coalesce(reps,0) = 0) as violations,       -- 594
--          count(*) filter (where state = 'review' and coalesce(reps,0) = 0
--                             and stability = 21 and difficulty = 5
--                             and elapsed_days = 0) as of_which_legacy_seed  -- 594
--     from cards;
--
-- Re-run that immediately before applying: it must return 0 / 0.

alter table public.cards
  drop constraint if exists cards_scheduler_state_requires_observation;
alter table public.cards
  add constraint cards_scheduler_state_requires_observation
  check (
    state not in ('learning', 'relearning', 'review')
    or coalesce(reps, 0) >= 1
  );

notify pgrst, 'reload schema';
