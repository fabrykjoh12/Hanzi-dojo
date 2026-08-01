-- Honest dashboard metrics. Idempotent (create or replace; grants survive).
--
-- Fixes three classes of wrong numbers on /dashboard (docs/METRICS.md is the
-- companion dictionary; the UI labels were updated in the same change):
--
-- 1) Story completion could exceed 100% ("103% · 37/36"). admin_story_stats
--    counted raw events, so re-reads and duplicate finish events inflated the
--    numerator, and a completion whose open fell before the window had no
--    matching denominator. Story events carry no story id historically, so
--    per-story dedupe is impossible for old rows; the metric is therefore
--    redefined on READERS: opened = distinct actors (account, else anonymous
--    browser session) with a story_opened in range; completed = those SAME
--    actors with a story_completed in range. completed ⊆ opened by
--    construction, so the rate is always 0–100 and means "share of readers who
--    opened a story this period and finished at least one".
--    (Story events now also carry props.story_id going forward, which enables
--    real per-story completion later without touching this shape.)
--
-- 2) Staff traffic polluted every aggregate. On a small beta the maintainers'
--    own testing dominates. Every function now excludes events whose user_id
--    belongs to an is_admin profile (anonymous pre-auth staff events cannot be
--    identified and remain counted — documented in docs/METRICS.md). The UI
--    states the exclusion.
--
-- 3) Duplicate events could double-count: signups is now distinct accounts,
--    sessions is now distinct session ids, instead of raw event counts.
--
-- DAU / WAU stay LIVE trailing windows (1 / 7 days from now()) rather than
-- range-scoped — that is what those tiles mean — and the UI now says so
-- instead of implying they follow the 7/30/90-day picker.

create or replace function public.admin_overview(from_ts timestamptz, to_ts timestamptz)
returns table (signups bigint, dau bigint, wau bigint, sessions bigint, median_session_ms numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with staff as (select id from profiles where is_admin)
  select
    (select count(distinct coalesce(e.user_id::text, e.session_id)) from analytics_events e
       where e.name = 'signup_completed' and e.created_at >= from_ts and e.created_at < to_ts
         and (e.user_id is null or e.user_id not in (select id from staff))),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '1 day'
         and e.user_id not in (select id from staff)),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '7 days'
         and e.user_id not in (select id from staff)),
    (select count(distinct e.session_id) from analytics_events e
       where e.name = 'session_started' and e.created_at >= from_ts and e.created_at < to_ts
         and (e.user_id is null or e.user_id not in (select id from staff))),
    (select (percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric))::numeric
       from analytics_events e
       where e.name = 'session_ended' and (e.props ? 'duration_ms')
         and e.created_at >= from_ts and e.created_at < to_ts
         and (e.user_id is null or e.user_id not in (select id from staff)));
end;
$$;

-- Stages keep their historical identity basis (pre-auth stages count browser
-- sessions, signed-in stages count accounts), so they are NOT strictly nested —
-- the UI now presents them as "Activation stages", not a funnel.
create or replace function public.admin_funnel(from_ts timestamptz, to_ts timestamptz)
returns table (stage text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with staff as (select id from profiles where is_admin),
  e as (
    select * from analytics_events
    where created_at >= from_ts and created_at < to_ts
      and (user_id is null or user_id not in (select id from staff))
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
        from e
        where name = 'signup_completed' and user_id is not null
        group by user_id
      ) s
      where exists (
        select 1 from e a
        where a.user_id = s.user_id and a.created_at::date > s.signup_day
      )
    )::bigint, 6
  ) x
  order by x.ord;
end;
$$;

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
    and e.user_id not in (select id from profiles where is_admin)
  group by e.created_at::date
  order by day;
end;
$$;

create or replace function public.admin_retention(cohort_from timestamptz, cohort_to timestamptz)
returns table (cohort_day date, cohort_size bigint, d1 bigint, d7 bigint, d30 bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with staff as (select id from profiles where is_admin),
  cohorts as (
    select user_id, min(created_at)::date as signup_day
    from analytics_events
    where name = 'signup_completed' and user_id is not null
      and user_id not in (select id from staff)
    group by user_id
    having min(created_at) >= cohort_from and min(created_at) < cohort_to
  ),
  activity as (
    select distinct user_id, created_at::date as active_day
    from analytics_events
    where user_id is not null
      and user_id not in (select id from staff)
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

-- Reader-based story stats (see the header comment): opened = distinct actors
-- who opened; completed = the subset of those actors who also finished in range.
create or replace function public.admin_story_stats(from_ts timestamptz, to_ts timestamptz)
returns table (language text, opened bigint, completed bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with staff as (select id from profiles where is_admin),
  e as (
    select coalesce(ae.language, 'unknown') as lang,
           coalesce(ae.user_id::text, ae.session_id, 'anon') as actor,
           ae.name
    from analytics_events ae
    where ae.name in ('story_opened', 'story_completed')
      and ae.created_at >= from_ts and ae.created_at < to_ts
      and (ae.user_id is null or ae.user_id not in (select id from staff))
  ),
  o as (select distinct lang, actor from e where e.name = 'story_opened'),
  c as (select distinct lang, actor from e where e.name = 'story_completed')
  select o.lang as language,
         count(*)::bigint as opened,
         count(c.actor)::bigint as completed
  from o
  left join c on c.lang = o.lang and c.actor = o.actor
  group by o.lang
  order by count(*) desc;
end;
$$;

notify pgrst, 'reload schema';
