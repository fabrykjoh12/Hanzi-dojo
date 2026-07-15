-- Admin-only analytics: an is_admin flag on profiles + security-definer
-- aggregation functions over analytics_events. Functions return ONLY aggregates
-- (never raw event rows) and each asserts the caller is an admin, so raw
-- analytics never leave the database and the anon/user client can read nothing.
--
-- Apply in the Supabase SQL editor.

-- 1. Admin flag ---------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 2. Admin guard (raises if the caller is not an admin) ------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  ) then
    raise exception 'not authorized';
  end if;
end;
$$;

-- 3. Headline KPIs ------------------------------------------------------------
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
         and e.created_at >= from_ts and e.created_at < to_ts);
end;
$$;

-- 4. Activation funnel --------------------------------------------------------
-- Pre-auth stages (landing/signup) counted by distinct session_id; post-auth by
-- distinct user_id. 'returned' = users with any event on a day after signup.
create or replace function public.admin_funnel(from_ts timestamptz, to_ts timestamptz)
returns table (stage text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with e as (
    select * from analytics_events
    where created_at >= from_ts and created_at < to_ts
  )
  select x.stage, x.count from (
    select 'landing'::text as stage, count(distinct session_id)::bigint as count, 1 as ord
      from e where name = 'landing_viewed'
    union all
    select 'signup', count(distinct session_id)::bigint, 2
      from e where name = 'signup_completed'
    union all
    select 'onboarding', count(distinct user_id)::bigint, 3
      from e where name = 'onboarding_completed'
    union all
    select 'first_mission', count(distinct user_id)::bigint, 4
      from e where name = 'first_mission_completed'
    union all
    select 'first_story', count(distinct user_id)::bigint, 5
      from e where name = 'first_story_completed'
    union all
    select 'returned', (
      select count(distinct s.user_id) from (
        select user_id, min(created_at)::date as signup_day
        from analytics_events
        where name = 'signup_completed' and user_id is not null
        group by user_id
      ) s
      where exists (
        select 1 from analytics_events a
        where a.user_id = s.user_id and a.created_at::date > s.signup_day
      )
    )::bigint, 6
  ) x
  order by x.ord;
end;
$$;

-- 5. DAU time series ----------------------------------------------------------
create or replace function public.admin_active_users(from_ts timestamptz, to_ts timestamptz)
returns table (day date, dau bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select e.created_at::date as day, count(distinct e.user_id)::bigint as dau
  from analytics_events e
  where e.user_id is not null and e.created_at >= from_ts and e.created_at < to_ts
  group by e.created_at::date
  order by day;
end;
$$;

-- 6. Retention by signup cohort ----------------------------------------------
create or replace function public.admin_retention(cohort_from timestamptz, cohort_to timestamptz)
returns table (cohort_day date, cohort_size bigint, d1 bigint, d7 bigint, d30 bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with cohorts as (
    select user_id, min(created_at)::date as signup_day
    from analytics_events
    where name = 'signup_completed' and user_id is not null
    group by user_id
    having min(created_at) >= cohort_from and min(created_at) < cohort_to
  ),
  activity as (
    select distinct user_id, created_at::date as active_day
    from analytics_events where user_id is not null
  )
  select c.signup_day as cohort_day,
         count(distinct c.user_id)::bigint as cohort_size,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 1)::bigint as d1,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 7)::bigint as d7,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 30)::bigint as d30
  from cohorts c
  left join activity a on a.user_id = c.user_id
  group by c.signup_day
  order by c.signup_day;
end;
$$;

-- 7. Story open vs complete ---------------------------------------------------
create or replace function public.admin_story_stats(from_ts timestamptz, to_ts timestamptz)
returns table (language text, opened bigint, completed bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select coalesce(e.language, 'unknown') as language,
         count(*) filter (where e.name = 'story_opened')::bigint as opened,
         count(*) filter (where e.name = 'story_completed')::bigint as completed
  from analytics_events e
  where e.name in ('story_opened', 'story_completed')
    and e.created_at >= from_ts and e.created_at < to_ts
  group by coalesce(e.language, 'unknown')
  order by opened desc;
end;
$$;

-- 8. Grants: any authenticated user may CALL the functions, but each function
-- refuses non-admins via assert_admin(). No table SELECT is granted.
grant execute on function public.admin_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_funnel(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_active_users(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_retention(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_story_stats(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
