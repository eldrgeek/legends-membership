-- Community chat: presence/typing/clear feature additions.
-- Apply in the Supabase SQL editor (project omfwcodoimjmbrhssvfl).
--
-- Presence and typing indicators are Realtime *channel* features (presence +
-- broadcast) and need no schema changes. This migration only adds:
--   1. A per-user "delete my own message" policy (standard chat behaviour).
--   2. REPLICA IDENTITY FULL so Realtime DELETE events carry the room column,
--      letting subscribers filter deletes by room and drop the right message.
--
-- Admin "clear this room" is performed server-side by the
-- netlify/functions/community-clear.js function using the service-role key,
-- so it deliberately does NOT get a broad client delete policy.

-- 1. Authors can delete their own messages.
drop policy if exists "users can delete their own community messages" on public.community_messages;
create policy "users can delete their own community messages"
  on public.community_messages
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 2. Emit full old-row data on DELETE so realtime payloads include `room`.
alter table public.community_messages replica identity full;

-- (Optional) ensure the table is in the realtime publication. No-op if present.
do $$
begin
  alter publication supabase_realtime add table public.community_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
