-- July 8, 2026 — Add July 7 meeting minutes to minutes.html
-- Non-breaking content addition; pushed directly to master.

BEGIN;

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Greg (via Mike)','mw@mike-wolf.com','owner','change',
  'July 7 meeting minutes added to Minutes page',
  'Added July 7, 2026 Member Services Committee meeting minutes to minutes.html. Content sourced from Zoom AI meeting summary forwarded by Greg Foster. Covers: Chapter President Communications feedback (4 chapters), Leslie''s "Legends of Basketball Journey" 6-phase transition strategy, Coach Hollins'' scholarship criteria (Legacy Grant, Earl Lloyd Scholarship, HBCU Scholarship) with Scholarship America as process manager, Purvis'' Legends Life platform (Legends Assist / Legends Growth / Legends Legacy), Antonio Davis'' staff hiring update (3 new positions, $80K–$120K salary range), and committee discussion on messaging consistency and long-term engagement systems.',
  '/minutes', jsonb_build_object('batch_id','jul08-01'),
  'accepted', NULL, NULL, '2026-07-08T09:25:43Z', '2026-07-08T09:25:43Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jul08-01');

COMMIT;

SELECT count(*) AS total FROM public.change_requests;
