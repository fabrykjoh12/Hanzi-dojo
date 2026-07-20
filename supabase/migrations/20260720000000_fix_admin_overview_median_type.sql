-- Fix: admin_overview declared median_session_ms as numeric, but percentile_cont
-- returns double precision, so the function raised
--   "structure of query does not match function result type" on every call,
-- which surfaced in the admin dashboard as "Couldn't load analytics".
-- Cast the median subquery result to numeric to match the declared return type.
--
-- Apply in the Supabase SQL editor.
create or replace function public.admin_overview(from_ts timestamptz, to_ts timestamptz)
returns table (signups bigint, dau bigint, wau bigint, sessions bigint, median_session_ms numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select
    (select count(*) from analytics_events e
       where e.name = 'signup_completed' and e.created_at >= from_ts and e.created_at < to_ts),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '1 day'),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '7 days'),
    (select count(*) from analytics_events e
       where e.name = 'session_started' and e.created_at >= from_ts and e.created_at < to_ts),
    (select percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric)
       from analytics_events e
       where e.name = 'session_ended' and (e.props ? 'duration_ms')
         and e.created_at >= from_ts and e.created_at < to_ts)::numeric;
end;
$$;

notify pgrst, 'reload schema';
