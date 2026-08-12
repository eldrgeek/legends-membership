create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  room text not null default 'general',
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.community_messages enable row level security;

-- Messages are scoped to a community; RLS gates on membership, not authentication
-- (SCC-III C2, 2026-08-12: `to authenticated using (true)` let any signed-up
-- stranger read every room and dump the membership roster). Requires
-- migrations/community_members.sql (communities, community_members, is_member_of).
alter table public.community_messages
  add column if not exists community_id text not null default 'legends'
  references public.communities(id);

drop policy if exists "community messages are readable by signed in users" on public.community_messages;
drop policy if exists "community members can read their community messages" on public.community_messages;
create policy "community members can read their community messages"
  on public.community_messages
  for select
  to authenticated
  using (public.is_member_of(community_id));

drop policy if exists "signed in users can post their own community messages" on public.community_messages;
drop policy if exists "community members can post their own community messages" on public.community_messages;
create policy "community members can post their own community messages"
  on public.community_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id and public.is_member_of(community_id));

create index if not exists community_messages_room_created_at_idx
  on public.community_messages (room, created_at);

do $$
begin
  alter publication supabase_realtime add table public.community_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
