-- Dashboard surface for client error monitoring. Idempotent.
--
-- errorMonitor.js has been recording capped, privacy-safe 'client_error'
-- events (error name, 40-char message, route, source — never stacks or typed
-- text) since 2026-08-01; this RPC aggregates them for /dashboard so
-- production failures are visible without SQL. Same admin gate as every other
-- admin_* function.
--
-- Deliberately does NOT exclude staff accounts, unlike the engagement
-- metrics: a crash hit by a maintainer is still a real crash. The dashboard
-- panel says so.

create or replace function public.admin_client_errors(from_ts timestamptz, to_ts timestamptz)
returns table (error_name text, message text, route text, hits bigint, last_seen timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select
    coalesce(e.props->>'error_name', 'Error') as error_name,
    coalesce(e.props->>'message', '') as message,
    coalesce(e.props->>'route', '') as route,
    count(*)::bigint as hits,
    max(e.created_at) as last_seen
  from analytics_events e
  where e.name = 'client_error'
    and e.created_at >= from_ts and e.created_at < to_ts
  group by 1, 2, 3
  order by count(*) desc, max(e.created_at) desc
  limit 50;
end;
$$;

revoke execute on function public.admin_client_errors(timestamptz, timestamptz) from public;
grant execute on function public.admin_client_errors(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
