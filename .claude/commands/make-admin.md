Give me the SQL to make my account an admin so I can see the analytics dashboard at /dashboard.

Ask me for my user ID if I haven't provided it (Supabase → Authentication → Users). Then give me this SQL to run in the Supabase SQL editor, with the placeholder filled in:

update public.profiles set is_admin = true where id = 'YOUR_USER_ID';

Remind me that:
- This requires the migration `supabase/migrations/20260715000000_add_admin_analytics.sql` to be applied first.
- The dashboard also needs the analytics events migration `20260713120000_add_analytics_events.sql` applied and some traffic (or run `seed-analytics.mjs --apply` for synthetic data).
- To revoke admin: set `is_admin = false` for that id.
