-- Security fix: prevent privilege escalation via the is_admin flag.
--
-- The "users can update own profile" RLS policy (schema.sql) lets an
-- authenticated user update ANY column of their own profile row — including
-- is_admin (added in 20260715000000_add_admin_analytics.sql). A user could run
--   supabase.from('profiles').update({ is_admin: true }).eq('id', myId)
-- to self-grant admin and then call the admin_* analytics RPCs.
--
-- RLS cannot express column-level rules, so enforce it with a BEFORE UPDATE
-- trigger. The function runs with INVOKER rights (NOT security definer) so
-- current_user reflects the CALLING role: client requests run as `authenticated`
-- and are blocked; admin provisioning from the service_role or the SQL editor
-- (postgres) is not `authenticated`, so it still works.
--
-- Apply in the Supabase SQL editor.

create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user = 'authenticated' then
    raise exception 'not authorized to modify is_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
before update on public.profiles
for each row
execute function public.guard_is_admin();
