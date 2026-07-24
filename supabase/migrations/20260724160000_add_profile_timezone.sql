-- Timezone-correct daily review reminders.
--
-- The hourly sender (send-review-reminders.mjs) compared the current UTC hour
-- against profiles.reminder_hour_utc, so a learner outside UTC was reminded at
-- an arbitrary local time and everyone in a DST zone drifted by an hour twice a
-- year (the caveat noted in 20260702220000_add_push_reminders.sql).
--
-- timezone            the IANA zone the browser reports
--                     (Intl.DateTimeFormat().resolvedOptions().timeZone),
--                     written best-effort by the client on load and only when
--                     it is missing or has changed. Nullable with no default:
--                     a profile without one keeps the old UTC-hour behavior.
-- reminder_last_sent_at  when the sender last notified this profile, so a run
--                     that happens twice inside the same local hour (or the
--                     repeated hour of a fall-back DST day) can't double-send.
alter table public.profiles add column if not exists timezone text;
alter table public.profiles add column if not exists reminder_last_sent_at timestamptz;

-- Both columns are written by the owner (timezone, from the client) or the
-- service role (reminder_last_sent_at, from the sender), so the existing
-- own-row profiles policies already cover them — no policy change needed.

notify pgrst, 'reload schema';
