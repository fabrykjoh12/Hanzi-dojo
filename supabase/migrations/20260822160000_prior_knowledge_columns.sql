-- supabase/migrations/20260822160000_prior_knowledge_columns.sql
-- Prior knowledge, told apart from earned memory.
--
-- Until now, "I already know this word" wrote a finished flashcard: state
-- 'review', stability 21 (exactly the mastery threshold), learned true — three
-- weeks of proven recall asserted on the strength of one tap, and
-- indistinguishable in the database from a word the learner had actually
-- studied. This migration adds the three columns that let a claim be stored as
-- what it is: a claim.
--
-- The claim row itself is deliberately INERT — state 'new', every FSRS field
-- null or zero — so it carries no scheduler state that could be mistaken for
-- evidence. That shape is what makes this safe to deploy ahead of the code:
--
--   * an old client sees an ordinary unstarted card and treats the word as
--     unknown (it under-claims, which is the safe direction);
--   * isCardDue() returns false for state 'new' whatever due_at holds, so a
--     claim can never enter the review or learning queues;
--   * the row still exists, so the word is never re-offered as a new card.
--
-- Everything here is ADDITIVE and idempotent. No existing column, policy, RPC
-- or CHECK constraint is altered:
--
--   * prior_known_at and prior_source are never written by grading, exactly
--     like source_sentence and the source_story_* trio before them, so
--     provenance survives every review. verified_at is the exception: the
--     companion migration 20260822170000 teaches grade_card to stamp it in the
--     SAME transaction as the grade, because the inert CHECK below would
--     otherwise reject a claim's first real review. Apply BOTH together.
--   * reset_language_progress and delete_my_account already clear `cards`,
--     so claims are removed with everything else and neither RPC changes.
--   * cards_state_check is untouched — a claim reuses 'new' rather than
--     inventing a fifth state that an unmigrated client could not map.

alter table public.cards
  -- When the learner claimed this word. NULL (the overwhelmingly common case)
  -- means "no claim was ever made" — this is an ordinary card.
  add column if not exists prior_known_at timestamptz,
  -- Where the claim came from. Recorded for the first time: today this value
  -- exists only inside an analytics event and is never persisted.
  add column if not exists prior_source text,
  -- When the claim was first backed by a real graded review. Redundant against
  -- reps >= 1, but it makes "claimed, still unproven" a single indexed
  -- predicate, which is what the calibration queue selects on.
  add column if not exists verified_at timestamptz;

-- Provenance is a closed set. A value outside it is a bug, not a new source.
--   placement            — the levels below a higher starting level
--   assumed_prerequisite — reserved for prerequisite assumptions not tied to
--                          an explicit placement choice
--   paste                — an imported/pasted word list (Anki, Pleco, plain text)
--   checklist            — ticked by hand in the browsable word list
--   legacy_claim         — a pre-existing fabricated row converted by the data
--                          migration, whose original source was never recorded
alter table public.cards
  drop constraint if exists cards_prior_source_check;
alter table public.cards
  add constraint cards_prior_source_check
  check (
    prior_source is null
    or prior_source in ('placement', 'assumed_prerequisite', 'paste', 'checklist', 'legacy_claim')
  );

-- A claim must never carry scheduler state. This is the structural guarantee
-- behind the whole model: an unverified claim has no stability, no difficulty,
-- no review history and no last_review to inherit, so no query — present or
-- future, filtered or not — can read mastery out of it.
--
-- Deliberately scoped to UNVERIFIED claims only: once a claim is calibrated it
-- becomes an ordinary card that happens to remember where it came from, and it
-- then carries real FSRS state like any other.
alter table public.cards
  drop constraint if exists cards_unverified_claim_is_inert;
alter table public.cards
  add constraint cards_unverified_claim_is_inert
  check (
    prior_known_at is null
    or verified_at is not null
    or (
      state = 'new'
      and coalesce(reps, 0) = 0
      and coalesce(lapses, 0) = 0
      and stability is null
      and difficulty is null
      and last_review is null
      and learned = false
      and is_easy = false
    )
  );

-- ── Metadata invariants (B2.2) ──────────────────────────────────────────────
-- Impossible combinations must be impossible, not merely unlikely. Every one of
-- these validates against production as it stands, because every existing row
-- has all three columns NULL.

-- A claim always knows where it came from, and provenance never exists without
-- a claim. Stated as an equivalence so neither half can drift.
alter table public.cards drop constraint if exists cards_prior_claim_has_source;
alter table public.cards add constraint cards_prior_claim_has_source
  check ((prior_known_at is null) = (prior_source is null));

-- Verification is verification OF a claim. A card that was never claimed has
-- nothing to verify, so verified_at on it would be meaningless.
alter table public.cards drop constraint if exists cards_verified_requires_claim;
alter table public.cards add constraint cards_verified_requires_claim
  check (verified_at is null or prior_known_at is not null);

-- DELIBERATELY NOT CONSTRAINED: the ordering of the two timestamps.
--
-- An earlier draft added cards_verified_after_claim, asserting
-- `verified_at >= prior_known_at` on the reasoning that you cannot check a
-- claim before it was made. That is true of events, and false of these two
-- columns, because they are stamped by DIFFERENT CLOCKS:
--
--   prior_known_at  — the DEVICE clock. knowledgeState.priorKnownCardRow()
--                     builds the claim row client-side, so its value is
--                     whatever the phone or browser believed the time was.
--   verified_at     — the SERVER clock. 20260822170000 stamps it with now()
--                     inside grade_card, precisely so the client cannot steer
--                     a timestamp the model treats as authoritative.
--
-- A device two hours AHEAD of the server therefore writes a claim stamped
-- 14:00, and an immediate, entirely genuine calibration grade a second later
-- stamps verified_at at the server's 12:00. The ordering check would reject
-- that write and the learner's real review would fail — the exact inverse of
-- the skew case 20260822170000 fixed, and unfixable at this layer: making the
-- constraint hold would mean either back-deriving prior_known_at server-side
-- (a larger change than v1 needs) or clamping verified_at with
-- greatest(now(), prior_known_at), which would let the device push a
-- supposedly server-authoritative timestamp into the future — the very thing
-- server-derivation exists to prevent.
--
-- Two timestamps from two clock domains should not be ordered by the database.
-- Nothing depends on the ordering: "claimed, still unproven" is
-- `verified_at is null`, and the fact that a genuine observation happened is
-- carried by reps >= 1, which no clock can fake. What IS enforced stays
-- enforced — verified_at requires a claim, provenance and claim are
-- equivalent, and an unverified claim is inert.
--
-- The drop is kept so an environment that ran an earlier copy of this file
-- converges on re-run.
alter table public.cards drop constraint if exists cards_verified_after_claim;

-- The calibration queue: claimed, not yet checked. Partial, so it indexes only
-- the rows calibration actually selects and stays small.
create index if not exists cards_prior_pending_idx
  on public.cards (user_id, prior_known_at)
  where prior_known_at is not null and verified_at is null;

notify pgrst, 'reload schema';
