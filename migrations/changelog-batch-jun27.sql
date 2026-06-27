-- ============================================================================
-- June 27 follow-ups: re-attribute seed goals to "Bill AI" + log recent changes
-- Apply via the Supabase SQL editor (owner; bypasses RLS). Idempotent.
-- ============================================================================

BEGIN;

-- Re-attribute AI-proposed seed goals from Mike to "Bill AI".
-- (Member-proposed goals set created_by to the member email and are untouched.)
UPDATE public.goals SET created_by = 'Bill AI'
  WHERE created_by = 'mw@mike-wolf.com';

-- Changelog entries for the latest changes -----------------------------------

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','bug',
  'Change Log: fixed Quinn review re-open loop',
  'Reviewing a change whose page was the Change Log itself loaded that page into its own preview iframe, which re-ran the review machinery and stacked multiple Quinn voice sessions in a loop. Reviews now run only in the top window and never embed the Change Log inside its own preview.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-19'),
  'accepted', NULL, 'a1081fd6', '2026-06-27T13:00:00Z','2026-06-27T13:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-19');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Test suite is green again',
  'Fixed the previously failing tests, which were lagging behind the current markup and the shared guide engine rather than catching real bugs. The suite now passes, with three documented skips for a stop-tour feature that is not implemented in the engine.',
  '/', jsonb_build_object('batch_id','jun26-20'),
  'accepted', NULL, '199bb376', '2026-06-27T13:05:00Z','2026-06-27T13:05:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-20');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Seed goals attributed to Bill AI',
  'The seeded candidate goals are now attributed to Bill AI rather than a committee member, since they were AI-proposed starting points. Goals proposed by members keep their own attribution.',
  '/subcommittee-scholarships', jsonb_build_object('batch_id','jun26-21'),
  'accepted', NULL, NULL, '2026-06-27T13:10:00Z','2026-06-27T13:10:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-21');

COMMIT;

-- Verify:
SELECT created_by, count(*) FROM public.goals GROUP BY created_by ORDER BY created_by;
