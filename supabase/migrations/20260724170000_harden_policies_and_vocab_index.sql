-- supabase/migrations/20260724170000_harden_policies_and_vocab_index.sql
-- Two pieces of database tech debt from docs/BACKLOG.md, both defensive:
--   1) make the reference-dictionary RLS policies re-runnable (idempotency)
--   2) bound concurrent dictionary-word inserts with a partial unique index
-- Nothing here changes what any policy ALLOWS, and no data is written or
-- deleted. Every statement is safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Idempotent reference-dictionary policies.
--
-- 20260719120000_add_reference_dictionary.sql created its two policies with bare
-- `create policy`, so re-running that file errors with "policy already exists"
-- instead of being the no-op every other migration in this repo is. We do NOT
-- edit that historical file — it is already applied in production, and rewriting
-- applied history is how you get an environment that no longer matches its own
-- migration log. Instead we restate the policies here, drop-then-create, which
-- leaves any environment (fresh or already-migrated) in the same known state.
--
-- These are a FAITHFUL reproduction of the originals: authenticated-only SELECT,
-- `using (true)` (both tables are shared read-only reference data, not per-user
-- rows — the data-minimization happens in the security-definer search RPCs).
-- Deliberately unchanged: no insert/update/delete policy is added, so the tables
-- stay writable only by the service role / seed scripts.

alter table public.dict_entries enable row level security;
alter table public.dict_examples enable row level security;

drop policy if exists "authenticated can read dict_entries" on public.dict_entries;
create policy "authenticated can read dict_entries" on public.dict_entries for select to authenticated using (true);

drop policy if exists "authenticated can read dict_examples" on public.dict_examples;
create policy "authenticated can read dict_examples" on public.dict_examples for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) One dictionary-sourced vocabulary row per (language, system, word).
--
-- `dict_add_to_deck` (20260719130000_flashcard_anything.sql) looks for an
-- existing vocabulary row and inserts a `level = NULL` "dictionary-sourced" row
-- when it finds none. That check-then-insert is not atomic: two concurrent calls
-- for the same word (two tabs, an offline flush racing a tap, a double-tap on a
-- slow connection) can both see "no row" and both insert — leaving duplicate
-- vocabulary rows for one word. `vocabulary` is GLOBALLY SHARED, so a duplicate
-- created by one learner is visible to everyone.
--
-- The index below makes the second inserter fail instead of duplicating. It is
-- PARTIAL — `where level is null` — on purpose: the curriculum genuinely
-- contains duplicate words at graded levels (e.g. 水 and 高い appear twice in
-- JLPT N5, see CLAUDE.md §0.00), so a full unique index would be wrong and would
-- fail to create. Only the dictionary-sourced (NULL-level) space is constrained.
--
-- ⚠️ PRE-FLIGHT — RUN THIS FIRST, BEFORE APPLYING THIS MIGRATION ⚠️
-- If duplicates already exist in production the `create unique index` below
-- fails, and this whole migration rolls back. Run this select in the Supabase
-- SQL editor first:
--
--   select language, system, word, count(*) as n, array_agg(id) as ids
--   from public.vocabulary
--   where level is null
--   group by language, system, word
--   having count(*) > 1
--   order by n desc;
--
-- If it returns ZERO rows: apply this migration as-is, nothing else to do.
--
-- If it returns rows: DO NOT delete anything blindly — each duplicate id may
-- already have `cards` (a learner's FSRS history) pointing at it, and deleting
-- the vocabulary row would take that review history with it. Decide by hand:
-- for each group, keep the id with cards attached (check
-- `select vocab_id, count(*) from public.cards where vocab_id = any(<ids>)
--  group by vocab_id`), repoint or drop the others deliberately, and only then
-- apply this migration. This migration intentionally performs NO cleanup.
--
-- (Plain `create index`, not `concurrently`: CONCURRENTLY cannot run inside the
-- transaction a migration file is applied in. The NULL-level slice of
-- `vocabulary` is small — dictionary saves only — so the brief write lock is
-- acceptable. If it ever isn't, run the CONCURRENTLY form by hand instead; the
-- `if not exists` below then makes this statement a no-op.)
create unique index if not exists vocabulary_dict_word_uniq
on public.vocabulary (language, system, word)
where level is null;

notify pgrst, 'reload schema';
