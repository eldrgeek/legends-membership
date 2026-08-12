-- Community membership substrate (SCC Convening III, 2026-08-12 — Locke C1/C2).
-- Apply in the Supabase SQL editor or via the Management API (project omfwcodoimjmbrhssvfl).
--
-- Before this migration the estate had authentication but NO authorization layer:
-- "authenticated" meant "owns an email address", and open signup is enabled on the
-- shared project. These tables are the minimal membership layer that community RLS
-- policies and the LiveKit token function check against.
--
-- Additive and idempotent (safe to re-run).

-- 1. Communities. `visibility` defaults to 'unlisted': existence is invisible to
--    non-members (SCC-III refusal #5 — no cross-community enumeration).
create table if not exists public.communities (
  id         text primary key,
  name       text not null,
  visibility text not null default 'unlisted' check (visibility in ('unlisted', 'listed')),
  created_at timestamptz not null default now()
);

-- 2. Membership. Provisioned only via service role (admin invite paths) — there are
--    deliberately NO insert/update/delete policies for client roles.
create table if not exists public.community_members (
  community_id text not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'member' check (role in ('steward', 'member', 'viewer')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists community_members_user_id_idx
  on public.community_members (user_id);

-- 3. THE membership predicate. SECURITY DEFINER so policies on community_members
--    itself (and any member-gated table) can call it without RLS recursion —
--    a naive self-subquery inside a community_members policy recurses (42P17).
--    Same pattern as public.current_user_role() in soma-auth-profiles-rls.sql.
create or replace function public.is_member_of(target_community text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = target_community
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_member_of(text) to authenticated;
grant execute on function public.is_member_of(text) to anon;

-- 4. RLS: members see their own communities and co-members; nobody else sees anything.
alter table public.communities enable row level security;
alter table public.community_members enable row level security;

drop policy if exists "members can read their communities" on public.communities;
create policy "members can read their communities"
  on public.communities
  for select
  to authenticated
  using (public.is_member_of(id));

drop policy if exists "members can read their community roster" on public.community_members;
create policy "members can read their community roster"
  on public.community_members
  for select
  to authenticated
  using (public.is_member_of(community_id));

-- 5. Seed the Legends community. public.profiles is the deliberately-provisioned
--    Legends people list (the signup trigger is a no-op; profiles rows are created
--    only on Legends' own provisioning path) — so it is the correct seed source.
--    profiles.role 'admin' → steward; everyone else → member.
insert into public.communities (id, name, visibility)
values ('legends', 'Legends Community', 'unlisted')
on conflict (id) do nothing;

insert into public.community_members (community_id, user_id, display_name, role)
select 'legends', p.id, p.full_name,
       case when p.role = 'admin' then 'steward' else 'member' end
from public.profiles p
on conflict (community_id, user_id) do nothing;
