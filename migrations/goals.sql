-- ============================================================================
-- Migration: SOMA Goals component — public.goals + public.goal_orderings
-- ============================================================================
--
-- Backs the reusable, embeddable Goals component (js/soma-goals.js). One pair of
-- tables serves EVERY subcommittee/page; a page is identified by its `group`
-- scope key (e.g. 'scholarships', 'membership', 'legends-life'). The component
-- passes that key from the embedding page's data-group attribute.
--
-- Behavior these tables encode:
--   - Any authenticated user may PROPOSE a goal → it lands as status='pending'.
--   - 'approved' goals are visible to EVERYONE (incl. anonymous read).
--   - 'pending' goals are visible ONLY to committee members (admin OR committee).
--   - Committee members may approve / edit goals and write per-member orderings.
--   - Each committee member keeps their OWN priority order per group in
--     goal_orderings (member_email + group + goal_id → position). A future
--     "consensus" view aggregates these per-member orderings; that view is NOT
--     built here, but the data model supports computing it later.
--
-- Role model:
--   "committee member" === Supabase profiles.role IN ('admin','committee').
--   ('committee' is a new role being added in a sibling change; 'admin' already
--   exists. Both count as committee here.) See public.is_committee() below.
--
-- RLS NOTE (defense in depth):
--   RLS *can* express the role check by joining profiles via a SECURITY DEFINER
--   helper (public.is_committee()), which is what we do below. HOWEVER, the
--   bootstrap admin allowlist (mw@mike-wolf.com, gfos44@gmail.com) lives only in
--   client JS — if those owners have not yet been given role='admin' in the
--   profiles table, RLS will treat them as non-committee. The client therefore
--   ALSO gates the UI (see js/soma-goals.js COMMITTEE detection). Keep the
--   profiles roles seeded so server-side RLS and client gating agree.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + drop-then-create policies, safe to
-- re-run. DO NOT auto-run on deploy — apply intentionally via the Supabase SQL
-- editor (project omfwcodoimjmbrhssvfl).
-- ============================================================================

-- ── Helper: is the current user a committee member? ─────────────────────────
-- SECURITY DEFINER so the policy can read profiles regardless of the caller's
-- own RLS on profiles, and STABLE so it can be inlined per-statement.
create or replace function public.is_committee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'committee')
  );
$$;

-- ── goals ───────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  "group"      text not null,                          -- scope key: subcommittee/page
  title        text not null check (char_length(trim(title)) between 1 and 200),
  description  text check (char_length(description) <= 4000),
  created_by   text not null,                          -- email of proposer
  created_at   timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by  text,                                   -- email of approving committee member
  approved_at  timestamptz
);

create index if not exists goals_group_status_idx on public.goals ("group", status);
create index if not exists goals_group_created_idx on public.goals ("group", created_at);

alter table public.goals enable row level security;

-- SELECT: approved goals are world-readable (incl. anon); pending goals only
-- for committee members.
drop policy if exists "approved goals readable by everyone" on public.goals;
create policy "approved goals readable by everyone"
  on public.goals
  for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "pending goals readable by committee" on public.goals;
create policy "pending goals readable by committee"
  on public.goals
  for select
  to authenticated
  using (status = 'pending' and public.is_committee());

-- INSERT: any authenticated user may propose a goal, but only as 'pending' and
-- attributed to themselves (created_by must match their JWT email).
drop policy if exists "authenticated users can propose pending goals" on public.goals;
create policy "authenticated users can propose pending goals"
  on public.goals
  for insert
  to authenticated
  with check (
    status = 'pending'
    and created_by = (auth.jwt() ->> 'email')
  );

-- UPDATE: only committee members may edit / approve goals.
drop policy if exists "committee can update goals" on public.goals;
create policy "committee can update goals"
  on public.goals
  for update
  to authenticated
  using (public.is_committee())
  with check (public.is_committee());

-- DELETE: only committee members may remove goals.
drop policy if exists "committee can delete goals" on public.goals;
create policy "committee can delete goals"
  on public.goals
  for delete
  to authenticated
  using (public.is_committee());

-- ── goal_orderings ──────────────────────────────────────────────────────────
-- One row per (member, group, goal) recording that member's personal priority
-- position. This is the substrate a future consensus view aggregates across
-- members. Only committee members write here.
create table if not exists public.goal_orderings (
  id            uuid primary key default gen_random_uuid(),
  member_email  text not null,
  "group"       text not null,
  goal_id       uuid not null references public.goals(id) on delete cascade,
  position      integer not null,
  updated_at    timestamptz not null default now(),
  unique (member_email, "group", goal_id)
);

create index if not exists goal_orderings_member_group_idx
  on public.goal_orderings (member_email, "group", position);

alter table public.goal_orderings enable row level security;

-- SELECT: committee members can read orderings (needed to load their own order,
-- and later to compute consensus across all members).
drop policy if exists "committee can read goal orderings" on public.goal_orderings;
create policy "committee can read goal orderings"
  on public.goal_orderings
  for select
  to authenticated
  using (public.is_committee());

-- INSERT / UPDATE / DELETE: a committee member may only write their OWN ordering
-- rows (member_email must match their JWT email).
drop policy if exists "committee can insert their own orderings" on public.goal_orderings;
create policy "committee can insert their own orderings"
  on public.goal_orderings
  for insert
  to authenticated
  with check (public.is_committee() and member_email = (auth.jwt() ->> 'email'));

drop policy if exists "committee can update their own orderings" on public.goal_orderings;
create policy "committee can update their own orderings"
  on public.goal_orderings
  for update
  to authenticated
  using (public.is_committee() and member_email = (auth.jwt() ->> 'email'))
  with check (public.is_committee() and member_email = (auth.jwt() ->> 'email'));

drop policy if exists "committee can delete their own orderings" on public.goal_orderings;
create policy "committee can delete their own orderings"
  on public.goal_orderings
  for delete
  to authenticated
  using (public.is_committee() and member_email = (auth.jwt() ->> 'email'));

-- ============================================================================
-- Future consensus (NOT built here): aggregate goal_orderings per group, e.g.
-- average/median position across distinct member_email, to produce a single
-- consensus ranking of approved goals. The per-member rows above are sufficient
-- to compute that view later without schema changes.
-- ============================================================================
