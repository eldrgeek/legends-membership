-- Community chat: self-serve rooms.
-- Apply in the Supabase SQL editor (project omfwcodoimjmbrhssvfl).
--
-- Until now the chat rooms were a hardcoded list in js/legends-chat-app.js
-- (General / Introductions / Events). This migration adds a `chat_rooms`
-- table so ANY signed-in member can create a new room, visible to everyone
-- in real time. Messages keep using the existing `community_messages.room`
-- text column; a room id here is just that same string.
--
-- This migration is additive and idempotent (safe to re-run).

-- 1. The rooms table. `id` is a slug (e.g. 'new-mentorship'); `name` is the
--    human label. `created_by` records the creator's email ('system' for seeds).
create table if not exists public.chat_rooms (
  id          text primary key,
  name        text not null,
  created_by  text,
  created_at  timestamptz default now()
);

-- 2. Row level security.
alter table public.chat_rooms enable row level security;

-- Anyone (anon + authenticated) may read the room list.
drop policy if exists "anyone can read chat rooms" on public.chat_rooms;
create policy "anyone can read chat rooms"
  on public.chat_rooms
  for select
  using (true);

-- Any signed-in user may create a room.
drop policy if exists "authenticated users can create chat rooms" on public.chat_rooms;
create policy "authenticated users can create chat rooms"
  on public.chat_rooms
  for insert
  to authenticated
  with check (true);

-- (No update/delete policy: rooms are durable once created.)

-- 3. Realtime: emit full row data and ensure the table is published so new
--    rooms appear live for everyone. No-op if already present.
alter table public.chat_rooms replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- 4. Seed the three rooms that were previously hardcoded, preserving their ids
--    so existing messages (room = 'general' | 'introductions' | 'events') stay
--    attached. created_at defaults order them first in the sidebar.
insert into public.chat_rooms (id, name, created_by) values
  ('general',        'General',        'system'),
  ('introductions',  'Introductions',  'system'),
  ('events',         'Events',         'system')
on conflict (id) do nothing;
