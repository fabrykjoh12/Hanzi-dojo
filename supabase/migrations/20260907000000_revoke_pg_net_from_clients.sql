-- supabase/migrations/20260907000000_revoke_pg_net_from_clients.sql
-- Take the database's outbound-HTTP functions away from client roles.
--
-- WHY. `pg_net` was installed by 20260715230000 for the feedback → Discord
-- relay. Its twelve `net.*` functions carry Postgres's DEFAULT function ACL,
-- which grants EXECUTE to PUBLIC — so `anon` and `authenticated` can both call
-- them. Measured, not assumed:
--
--   has_schema_privilege('anon','net','USAGE')                      -> true
--   has_function_privilege('authenticated','net.http_post(...)',…)  -> true
--
-- Anyone who reaches one of those makes THE DATABASE issue arbitrary outbound
-- HTTP: an SSRF primitive originating inside Supabase's network, usable to
-- probe internal endpoints or to exfiltrate the result of a query to a host the
-- caller controls.
--
-- The only thing standing in the way today is that PostgREST does not expose
-- the `net` schema, so `/rest/v1/rpc/http_post` 404s. That is a CONFIG VALUE,
-- not a grant — one setting away from being reachable, and not something a
-- security boundary should rest on.
--
-- WHY THIS IS SAFE TO DO NOW. pg_net is completely unused.
-- 20260825120000_drop_feedback_discord_relay.sql removed `notify_discord_
-- feedback`, which was its only consumer in `public`, and no trigger on
-- `feedback` and no `public` function references `net.http` any more. Revoking
-- therefore breaks nothing: there is nothing left to break.
--
-- REVOKED FROM public FIRST, AND THAT IS THE POINT. The grant is not held by
-- `anon` and `authenticated` individually — it is the default PUBLIC ACL, which
-- both roles inherit. Revoking from the two named roles alone would leave the
-- PUBLIC grant intact and this migration would be a no-op that looked like a
-- fix.
--
-- The extension itself is left installed rather than dropped. Dropping it is
-- also defensible — nothing uses it — but a DROP EXTENSION is not reversible
-- without re-creating the objects, and a revoke closes the hole completely.
--
-- Idempotent: the schema guard makes it safe on an environment where pg_net was
-- never installed, and REVOKE is idempotent by nature.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    -- PUBLIC first: it is the grant that actually exists.
    execute 'revoke all on all functions in schema net from public';
    execute 'revoke all on all functions in schema net from anon';
    execute 'revoke all on all functions in schema net from authenticated';

    -- And the schema itself, so a function added by a future pg_net upgrade
    -- does not arrive reachable.
    execute 'revoke usage on schema net from public';
    execute 'revoke usage on schema net from anon';
    execute 'revoke usage on schema net from authenticated';

    -- Default privileges for anything created in that schema later.
    execute 'alter default privileges in schema net revoke execute on functions from public';
  end if;
end $$;

notify pgrst, 'reload schema';
