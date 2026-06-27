-- June 27 (later): log the complete Quinn-loop fix + the Bill goals hint bubble.
BEGIN;

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','bug',
  'Change Log: Quinn review loop fully fixed',
  'A deeper fix for the review loop. Opening a review loaded the change page into the preview iframe; that iframe booted its own auth off the shared session, which re-fired this page''s auth handler, which re-ran the restore step, which re-called the review, which reloaded the iframe - a loop that stacked Quinn voice sessions. Added a re-entrancy lock on the review, a run-once guard on restore, and stopped the guide widget from loading inside the preview iframe. Verified: a reproduction that fired 31 times now fires once.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-22'),
  'accepted', NULL, 'e7b8cc1f', '2026-06-27T15:30:00Z','2026-06-27T15:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-22');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Bill hint bubble on the goals board',
  'When a committee member reaches the goals section, a quiet thought bubble appears by the Ask Bill button. The first time it explains the goals board and offers to help shape an idea into a goal; after that it shows a short nudge. Tapping it opens Bill. Nothing plays automatically, and non-committee users never see it.',
  '/subcommittee-scholarships', jsonb_build_object('batch_id','jun26-23'),
  'accepted', NULL, 'd2aef968', '2026-06-27T15:35:00Z','2026-06-27T15:35:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-23');

COMMIT;
SELECT count(*) AS total_changelog_entries FROM public.change_requests;
