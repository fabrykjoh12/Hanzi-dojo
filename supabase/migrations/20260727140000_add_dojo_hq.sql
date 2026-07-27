-- Dojo HQ, backed by the app's own Supabase project.
--
-- Dojo HQ (`/hq`, `src/DojoHQ.jsx`) is the internal collaboration board: ideas,
-- plans, bugs, fixes and testing. Until now its data layer was either
-- localStorage (per-device, tied to a made-up `local-user` identity, and
-- non-functional in environments without web storage) or a Cloudflare worker
-- authenticated with an invite code (again a device identity, not an account).
-- This migration moves the board into Postgres, keyed to the signed-in account.
--
-- ONE BOARD, SHARED BY ADMINS. There is deliberately no workspace or invite
-- system: every account with `profiles.is_admin = true` sees and writes the same
-- board, which is exactly the audience the `/hq` route is already gated on in
-- `src/App.jsx`. `workspace_id` is kept as a plain text column with a constant
-- default so the existing UI queries (`.eq('workspace_id', …)`, the realtime
-- filters) keep working unchanged, and so a second board could be added later
-- without a table rewrite.
--
-- Regular learners can neither read nor write a single row: every policy
-- requires the caller to be an admin.
--
-- Apply in the Supabase SQL editor. Until it is applied, Dojo HQ shows a calm
-- "database not connected yet" screen rather than an empty board (CLAUDE.md §10).
-- Every statement is safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Items --------------------------------------------------------------------
-- Column names match what src/DojoHQ.jsx already reads and writes, so the UI
-- needed no rewrite. The delivery fields (milestone_id … blocked_reason) are the
-- ones the item detail panel edits; they exist here so those edits persist
-- instead of failing on an unknown column.

create table if not exists public.dojo_items (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   text not null default 'admin-hq',
  created_by     uuid references auth.users(id) on delete set null,
  assigned_to    uuid references auth.users(id) on delete set null,
  title          text not null,
  description    text not null default '',
  item_type      text not null default 'idea'
                   check (item_type in ('idea', 'plan', 'implement', 'test', 'fix', 'bug')),
  status         text not null default 'inbox'
                   check (status in ('inbox', 'planned', 'progress', 'review', 'done')),
  priority       text not null default 'medium'
                   check (priority in ('low', 'medium', 'high', 'urgent')),
  tags           text[] not null default '{}',
  due_date       date,
  milestone_id   uuid,                     -- milestones live in the HQ2 control room, not here
  depends_on     uuid[] not null default '{}',
  github_branch  text,
  github_pr_url  text,
  ci_status      text not null default 'none'
                   check (ci_status in ('none', 'pending', 'passing', 'failing')),
  blocked_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- The board loads one workspace at a time, newest-touched first.
create index if not exists dojo_items_workspace_updated_idx
  on public.dojo_items (workspace_id, updated_at desc);
create index if not exists dojo_items_assigned_idx
  on public.dojo_items (assigned_to);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Comments and attachments -------------------------------------------------
-- Both cascade from the item: deleting an item from the board must not leave
-- orphaned discussion or file rows behind.

create table if not exists public.dojo_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'admin-hq',
  item_id      uuid not null references public.dojo_items(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists dojo_comments_item_idx on public.dojo_comments (item_id, created_at);

create table if not exists public.dojo_attachments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'admin-hq',
  item_id      uuid not null references public.dojo_items(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  size_bytes   bigint not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists dojo_attachments_item_idx on public.dojo_attachments (item_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at ---------------------------------------------------------------
-- The board sorts on updated_at, so it has to be maintained server-side: the
-- client patches single columns (a drag between columns writes only `status`)
-- and must not be trusted to keep an ordering key current.

create or replace function public.dojo_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dojo_items_touch_updated_at on public.dojo_items;
create trigger dojo_items_touch_updated_at
before update on public.dojo_items
for each row
execute function public.dojo_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS: admins only ---------------------------------------------------------
-- Same shape as the admin policies in 20260722140000_add_tts_audio.sql. The
-- subselect reads the caller's OWN profile row, which the existing own-row
-- profiles policy already allows, so no extra profiles grant is needed.

alter table public.dojo_items enable row level security;
alter table public.dojo_comments enable row level security;
alter table public.dojo_attachments enable row level security;

drop policy if exists "admins read dojo_items" on public.dojo_items;
create policy "admins read dojo_items" on public.dojo_items
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins insert dojo_items" on public.dojo_items;
create policy "admins insert dojo_items" on public.dojo_items
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins update dojo_items" on public.dojo_items;
create policy "admins update dojo_items" on public.dojo_items
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins delete dojo_items" on public.dojo_items;
create policy "admins delete dojo_items" on public.dojo_items
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins read dojo_comments" on public.dojo_comments;
create policy "admins read dojo_comments" on public.dojo_comments
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- A comment is attributed to whoever wrote it: an admin may only insert comments
-- authored by themselves.
drop policy if exists "admins insert dojo_comments" on public.dojo_comments;
create policy "admins insert dojo_comments" on public.dojo_comments
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "admins delete dojo_comments" on public.dojo_comments;
create policy "admins delete dojo_comments" on public.dojo_comments
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins read dojo_attachments" on public.dojo_attachments;
create policy "admins read dojo_attachments" on public.dojo_attachments
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins insert dojo_attachments" on public.dojo_attachments;
create policy "admins insert dojo_attachments" on public.dojo_attachments
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins delete dojo_attachments" on public.dojo_attachments;
create policy "admins delete dojo_attachments" on public.dojo_attachments
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Members ------------------------------------------------------------------
-- The board needs a list of people it can assign work to. That list is "every
-- admin". A security-definer function is used rather than a broad SELECT policy
-- on `profiles`, so this does NOT open every learner's profile to admins — it
-- returns exactly the admin accounts, and only the local part of an email (never
-- the full address) when an admin has no display name set yet.
--
-- assert_admin() (20260715000000_add_admin_analytics.sql) raises for everyone
-- else, including a signed-out caller.

create or replace function public.dojo_hq_members()
returns table (user_id uuid, display_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select
    p.id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Dojo-medlem'
    )::text,
    'admin'::text
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.is_admin
  order by 2;
end;
$$;

revoke execute on function public.dojo_hq_members() from public;
grant execute on function public.dojo_hq_members() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Attachment storage -------------------------------------------------------
-- A private bucket for screenshots pasted onto items. Guarded: on a project
-- where the storage schema is not owned by the migration role, the bucket and
-- its policies are skipped rather than failing the whole migration — the board
-- then works fully except for image uploads.

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('dojo-attachments', 'dojo-attachments', false)
  on conflict (id) do nothing;

  execute 'drop policy if exists "admins read dojo attachments" on storage.objects';
  execute $p$create policy "admins read dojo attachments" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'dojo-attachments'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    )$p$;

  execute 'drop policy if exists "admins upload dojo attachments" on storage.objects';
  execute $p$create policy "admins upload dojo attachments" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'dojo-attachments'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    )$p$;

  execute 'drop policy if exists "admins delete dojo attachments" on storage.objects';
  execute $p$create policy "admins delete dojo attachments" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'dojo-attachments'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    )$p$;
exception when others then
  raise notice 'Dojo HQ storage setup skipped: %', sqlerrm;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Realtime -----------------------------------------------------------------
-- The board subscribes to postgres_changes on these tables so the other admin's
-- edits appear without a refresh. Guarded for the same reason as above: without
-- the publication the board still works, it just refreshes on its own actions.

do $$
begin
  alter publication supabase_realtime add table public.dojo_items;
exception when others then
  raise notice 'dojo_items not added to supabase_realtime: %', sqlerrm;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.dojo_comments;
exception when others then
  raise notice 'dojo_comments not added to supabase_realtime: %', sqlerrm;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.dojo_attachments;
exception when others then
  raise notice 'dojo_attachments not added to supabase_realtime: %', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
