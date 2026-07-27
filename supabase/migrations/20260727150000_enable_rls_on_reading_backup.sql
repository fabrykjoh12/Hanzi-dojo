-- Close an open door on the pre-fix readings backup.
--
-- `_reading_backup_20260725` is the snapshot of `vocabulary` readings taken
-- before the HSK 3-6 reading corrections, so those can be reverted. It was
-- created with RLS **disabled**, which left all 1,871 rows readable AND
-- writable by anyone holding the public anon key — the key that ships in the
-- frontend bundle. Surfaced by the Supabase security advisor, not by a report.
--
-- Nothing reads it: no query in `src/`, no content script, no worker route, no
-- other migration. It exists purely as a restore point.
--
-- Enabling RLS with **no policies** is therefore the correct end state, not an
-- oversight. PostgREST denies every anon and authenticated request, while the
-- service key bypasses RLS entirely — and a restore would run under the service
-- key anyway (see `.env.script`). If this table is ever queried from the app,
-- that is a bug in the caller, not a missing policy here.
--
-- Applied to production 2026-07-27, before this file was committed.

alter table public._reading_backup_20260725 enable row level security;
