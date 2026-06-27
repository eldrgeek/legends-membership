-- ============================================================================
-- Change Log reset + per-change entries for the June 26-27 batch
-- ============================================================================
-- Mike asked to (a) clear all existing items in the change log and (b) have
-- each change from this batch show up as its own entry going forward.
--
-- The live change log renders from public.change_requests. This script:
--   1. Archives the current rows into change_requests_archive_20260627 (so the
--      prior history, incl. the legacy cl-001..cl-026 migration, is recoverable).
--   2. Clears change_requests.
--   3. Inserts one row per change in this batch, each keyed to its commit and
--      idempotent on context->>'batch_id' (safe to re-run).
--
-- Apply intentionally via the Supabase SQL editor (runs as owner, bypasses RLS).
-- ============================================================================

BEGIN;

-- 1. Archive current history (idempotent: replace any prior archive from today)
DROP TABLE IF EXISTS public.change_requests_archive_20260627;
CREATE TABLE public.change_requests_archive_20260627 AS
  SELECT * FROM public.change_requests;

-- 2. Clear the live change log
DELETE FROM public.change_requests;

-- 3. One entry per change in this batch -------------------------------------

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Navigation centralized into a single component',
  'The site navigation, previously copy-pasted into every page (and drifting between them), is now a single source (partials/nav.html) inlined at build time. Fixes cross-page inconsistency and makes future nav changes one edit instead of two dozen.',
  '/', jsonb_build_object('batch_id','jun26-01'),
  'accepted', NULL, 'e013a09b', '2026-06-26T18:00:00Z', '2026-06-26T18:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-01');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','bug',
  'Committee menu fixed on the Change Log page',
  'The Committee dropdown on the Change Log page showed only one entry while other dropdowns were normal. Root cause was nav drift: this page had lost its Subcommittees section. Resolved by the navigation component, which restored the full Committee menu sitewide.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-02'),
  'accepted', NULL, 'e013a09b', '2026-06-26T18:05:00Z', '2026-06-26T18:05:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-02');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Goals: reusable propose/approve component',
  'New reusable Goals component. Any signed-in member can propose a goal; proposals are visible only to committee members until a committee member approves them, after which they are visible to all. Committee members reorder goals by drag and drop, with each member preference recorded for a future consensus view. Admins count as committee members.',
  '/', jsonb_build_object('batch_id','jun26-03'),
  'accepted', NULL, 'f9d47b9e', '2026-06-26T19:00:00Z', '2026-06-26T19:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-03');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Goals seeded for Scholarships and Grants',
  'Replaced the static goals list on the Scholarships and Grants subcommittee page with the Goals component and seeded seven candidate goals appropriate to that subcommittee.',
  '/subcommittee-scholarships', jsonb_build_object('batch_id','jun26-04'),
  'accepted', NULL, '6b1c67d6', '2026-06-26T19:20:00Z', '2026-06-26T19:20:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-04');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Goals seeded for New Membership and Retention',
  'Replaced the static goals list on the New Membership and Retention subcommittee page with the Goals component and seeded seven candidate goals appropriate to that subcommittee.',
  '/subcommittee-membership', jsonb_build_object('batch_id','jun26-05'),
  'accepted', NULL, 'c33523f6', '2026-06-26T19:25:00Z', '2026-06-26T19:25:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-05');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Goals seeded for Chapter President Communication',
  'Replaced the static goals list on the Chapter President Communication subcommittee page with the Goals component and seeded eight candidate goals appropriate to that subcommittee.',
  '/subcommittee-chapter-presidents', jsonb_build_object('batch_id','jun26-06'),
  'accepted', NULL, '11b4f58a', '2026-06-26T19:30:00Z', '2026-06-26T19:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-06');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Goals seeded for Legends Life (Transition Services)',
  'Replaced the static goals list on the Legends Life (Transition Services) page with the Goals component and seeded eight candidate goals appropriate to that group.',
  '/transition-services', jsonb_build_object('batch_id','jun26-07'),
  'accepted', NULL, '4ec95e44', '2026-06-26T19:35:00Z', '2026-06-26T19:35:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-07');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Admin can assign members across three roles',
  'The admin role picker now assigns and reassigns any user across three nested roles: admin, committee member, and member (admin includes committee, committee includes member).',
  '/admin', jsonb_build_object('batch_id','jun26-08'),
  'accepted', NULL, '581b7235', '2026-06-26T20:00:00Z', '2026-06-26T20:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-08');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Removed Invite a Committee Member from admin',
  'Removed the Invite a Committee Member box from the admin page; it is superseded by the role picker.',
  '/admin', jsonb_build_object('batch_id','jun26-09'),
  'accepted', NULL, '54a7af01', '2026-06-26T20:05:00Z', '2026-06-26T20:05:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-09');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','bug',
  'Admin home: menu no longer crowds the brand',
  'On signed-in admin views the long navigation menu overflowed leftward and overlapped the site brand. The nav now tightens spacing and wraps the signed-in controls to a second line instead of colliding with the brand.',
  '/', jsonb_build_object('batch_id','jun26-10'),
  'accepted', NULL, 'de15d371', '2026-06-27T01:00:00Z', '2026-06-27T01:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-10');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Resources menu and page renamed to Documents',
  'The first Resources dropdown and the Resources page are renamed to Documents (the page title is now Documents). Links and tour selectors are unchanged.',
  '/resources', jsonb_build_object('batch_id','jun26-11'),
  'accepted', NULL, 'd160c32c', '2026-06-27T01:20:00Z', '2026-06-27T01:20:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-11');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Health and retirement amounts set to TBA',
  'Replaced the dollar amounts in the Player Benefits (Health and Retirement) page with TBA, and matched the duplicated ABA recognition figures on the Membership Offerings page for consistency. Membership pricing and phone numbers were left unchanged.',
  '/player-benefits', jsonb_build_object('batch_id','jun26-12','also_commit','a13ad318'),
  'accepted', NULL, '96a6285b', '2026-06-27T01:35:00Z', '2026-06-27T01:35:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-12');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Membership roster embedded on the page',
  'The membership roster spreadsheet, previously download-only, is now embedded inline as a filterable, scrollable table that renders the current file. The download link is retained as a fallback.',
  '/subcommittee-membership', jsonb_build_object('batch_id','jun26-13'),
  'accepted', NULL, 'b7982ebc', '2026-06-27T01:50:00Z', '2026-06-27T01:50:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-13');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Committee contact directory completed',
  'Filled out the Committee Contact Directory from the contact information on each member profile card (added the missing member and corrected one role). Profile cards were not changed.',
  '/members', jsonb_build_object('batch_id','jun26-14'),
  'accepted', NULL, '2535def2', '2026-06-27T02:05:00Z', '2026-06-27T02:05:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-14');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Quinn introduces herself once, not every visit',
  'Quinn (the change-review assistant) now gives her full introduction only on the first review per browser and a short greeting thereafter, mirroring how Bill behaves.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-15'),
  'accepted', NULL, 'c6c7260', '2026-06-27T02:20:00Z', '2026-06-27T02:20:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-15');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','bug',
  'Change Log: fixed odd nothing-was-done note',
  'A completed item that simply lacked a recorded page or commit was being misclassified as blocked, so Quinn and the page showed a stark nothing-was-done note. Now only genuinely blocked items show that empty state; completed items summarize normally and offer sign-off.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-16'),
  'accepted', NULL, '360ca23', '2026-06-27T02:35:00Z', '2026-06-27T02:35:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-16');

INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'agent','Mike','mw@mike-wolf.com','owner','change',
  'Change log cleared and now logs each change',
  'Cleared the prior change log items (archived for recovery) and switched to logging each change in this batch as its own entry, keyed to its commit.',
  '/admin-changelog', jsonb_build_object('batch_id','jun26-17'),
  'accepted', NULL, '360ca233', '2026-06-27T02:40:00Z', '2026-06-27T02:40:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'batch_id'='jun26-17');

COMMIT;

-- Verify after running:
--   SELECT title, type, status, commit_sha, created_at FROM public.change_requests ORDER BY created_at;
--   SELECT count(*) FROM public.change_requests_archive_20260627;  -- prior history preserved
