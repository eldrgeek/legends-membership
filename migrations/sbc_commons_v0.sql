-- SBC Commons v0 (Second Breakfast Club neighborhood, soma-city /sbc route)
-- Applied 2026-08-13, Dee (Fable 5, CCc), night-shift build.
-- Spec: SOMA/specs/sbc-commons-v0.md · Decision: SOMA/council/sessions/2026-08-12-convening-III.md
--
-- DELIBERATE SUBSTITUTION vs the spec's literal "sbc_members" ask: the SCC-III
-- C1/C2 fix (2026-08-12, same day) already shipped a hardened, tested
-- communities + community_members + is_member_of() membership layer
-- (legends-membership-site/migrations/community_members.sql, 16/16 verify-rls-gate
-- pass). Reusing it here — a new 'sbc' community row, rather than a parallel
-- sbc_members table — is "don't write a tool that already exists" applied to
-- schema. sbc_presence/sbc_notes are new because they are genuinely SBC-specific.
--
-- Additive and idempotent (safe to re-run).

-- 1. The community + its first (only, tonight) member.
insert into public.communities (id, name, visibility)
values ('sbc', 'Second Breakfast Club', 'unlisted')
on conflict (id) do nothing;

-- display_name doubles as the house-slug linkage the client uses to match a
-- signed-in member to their house in the static resident list (src/sbc/sbcResidents.ts).
insert into public.community_members (community_id, user_id, display_name, role)
values ('sbc', 'e411d3d3-d2fb-4dae-8f26-6d7542f17346', 'mike', 'steward')
on conflict (community_id, user_id) do nothing;

-- 2. Lit-window presence. One row per member; GHOST IS THE DEFAULT
--    (window_lit false). No last-seen rendered by the client — updated_at
--    exists for operational debugging only, never shown in the UI.
create table if not exists public.sbc_presence (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  window_lit  boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.sbc_presence enable row level security;

drop policy if exists "sbc members read presence" on public.sbc_presence;
create policy "sbc members read presence"
  on public.sbc_presence
  for select
  to authenticated
  using (public.is_member_of('sbc'));

drop policy if exists "sbc members insert own presence" on public.sbc_presence;
create policy "sbc members insert own presence"
  on public.sbc_presence
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_member_of('sbc'));

drop policy if exists "sbc members update own presence" on public.sbc_presence;
create policy "sbc members update own presence"
  on public.sbc_presence
  for update
  to authenticated
  using (user_id = auth.uid() and public.is_member_of('sbc'))
  with check (user_id = auth.uid() and public.is_member_of('sbc'));

-- 3. Notes — a house or the commons board. author_id is nullable so a
--    service-role seed (the groundskeeper's welcome note) can be authored
--    without a real account; client-side inserts always set author_id = auth.uid().
create table if not exists public.sbc_notes (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references auth.users(id) on delete set null,
  author_name text not null,
  target      text not null check (target = 'commons' or target ~ '^house:[a-z0-9-]+$'),
  body        text not null check (char_length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

alter table public.sbc_notes enable row level security;

drop policy if exists "sbc members read notes" on public.sbc_notes;
create policy "sbc members read notes"
  on public.sbc_notes
  for select
  to authenticated
  using (public.is_member_of('sbc'));

drop policy if exists "sbc members write notes" on public.sbc_notes;
create policy "sbc members write notes"
  on public.sbc_notes
  for insert
  to authenticated
  with check (author_id = auth.uid() and public.is_member_of('sbc'));

-- 4. Emptiness-proof seed: one welcome note from the fleet, authored as
--    "the groundskeeper" (author_id null = system-authored, inserted via
--    service role so RLS's author_id=auth.uid() check is bypassed by design).
insert into public.sbc_notes (author_id, author_name, target, body)
select null, 'the groundskeeper', 'commons',
       'Windows are dark tonight, but the porch light''s on and the coffee''s always warm — welcome home.'
where not exists (
  select 1 from public.sbc_notes where target = 'commons' and author_name = 'the groundskeeper'
);
