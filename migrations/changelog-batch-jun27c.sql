-- Log the changes shipped after the Bill-bubble entry. Each as awaiting-review
-- so it shows an Accept button to sign off on. Idempotent on batch_id.
BEGIN;

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Membership roster embedded as a Google Sheet',
  'The New Membership and Retention page now embeds the membership roster as the Google Sheet instead of the hard-to-read generated table. It renders read-only inline (clean and legible) with an Open in Google Sheets button to edit. Google does not allow editing inside an embedded frame, so editing happens in the Google tab.',
  '/subcommittee-membership', jsonb_build_object('batch_id','jun26-24'),
  'awaiting-review', NULL, '1b8d9dc0', '2026-06-27T17:00:00Z','2026-06-27T17:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-24');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Scholarship America overview shown inline',
  'The Scholarship America overview PDF now renders inline on the Scholarships and Grants page instead of being only a download link.',
  '/subcommittee-scholarships', jsonb_build_object('batch_id','jun26-25'),
  'awaiting-review', NULL, '59212fb0', '2026-06-27T17:05:00Z','2026-06-27T17:05:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-25');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Scholarships page trimmed',
  'Removed the stats tiles and About block that sat between the Scholarship America partnership text and the overview PDF, so the text leads straight into the document.',
  '/subcommittee-scholarships', jsonb_build_object('batch_id','jun26-26'),
  'awaiting-review', NULL, '59edf726', '2026-06-27T17:10:00Z','2026-06-27T17:10:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-26');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Legends Life: phased-approach panel removed',
  'Removed the colored phased-approach panel that sat between the Subcommittee Goals heading and the goals on the Legends Life page.',
  '/transition-services', jsonb_build_object('batch_id','jun26-27'),
  'awaiting-review', NULL, 'e595a49d', '2026-06-27T17:15:00Z','2026-06-27T17:15:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-27');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Legends Life strategy document embedded',
  'The Legends Life strategy document is now embedded inline on the page (Google Doc, read-only view) with an Open in Google Docs button to edit, instead of a click-to-open PDF.',
  '/transition-services', jsonb_build_object('batch_id','jun26-28'),
  'awaiting-review', NULL, 'f6853371', '2026-06-27T17:20:00Z','2026-06-27T17:20:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-28');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Committee contact directory rendered as a table',
  'The committee contact directory is now a clean table (Name, Role, Email, Phone) pulled from the member profile cards, instead of a card grid.',
  '/members', jsonb_build_object('batch_id','jun26-29'),
  'awaiting-review', NULL, 'e5323ab5', '2026-06-27T17:25:00Z','2026-06-27T17:25:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-29');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Change-log entries set to awaiting sign-off',
  'The existing change-log entries were set to awaiting-review so each shows an Accept button you can sign off on, consistent with the newest entries.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-30'),
  'awaiting-review', NULL, NULL, '2026-06-27T17:30:00Z','2026-06-27T17:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-30');

INSERT INTO public.change_requests (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Community chat: self-serve rooms',
  'Community chat rooms are now self-serve. Any signed-in member can create a new room with the + New room button, and it appears live in everyone''s sidebar. Backed by a new chat_rooms table; General, Introductions and Events are preserved.',
  '/community-chat', jsonb_build_object('batch_id','jun26-31'),
  'awaiting-review', NULL, 'fe8222bc', '2026-06-27T17:35:00Z','2026-06-27T17:35:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-31');

COMMIT;
SELECT count(*) AS total, count(*) FILTER (WHERE status='awaiting-review') AS awaiting FROM public.change_requests;
