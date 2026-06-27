-- ============================================================================
-- Seed: candidate goals for the Scholarships & Grants subcommittee
-- group = 'scholarships'  (matches data-group on subcommittee-scholarships.html)
-- ============================================================================
--
-- These are STARTER goals — "better than a blank slate." They are seeded as
-- status='approved' so they are visible to everyone immediately, but the
-- committee is expected to edit, reword, reprioritize, or remove them and to
-- propose their own. They carry NO dollar figures and NO hard commitments;
-- they are directional and fully editable in the live Goals component.
--
-- Source: the original hand-authored "Subcommittee Goals" list that lived
-- inline on subcommittee-scholarships.html before the Goals component replaced
-- it, lightly reworded to read as directional candidate goals.
--
-- Model (public.goals — see migrations/goals.sql):
--   group        = 'scholarships'
--   status       = 'approved'   (world-readable; committee can re-open/edit)
--   created_by   = 'mw@mike-wolf.com'  (system/owner seed attribution)
--   approved_by  = 'mw@mike-wolf.com'
--   approved_at  = created_at  (2026-06-26, the seed date)
--
-- Idempotency: each INSERT is INSERT ... SELECT ... WHERE NOT EXISTS keyed on
-- (group, title). Re-running this file is a no-op once the rows exist, and it
-- will not clobber edits the committee makes to wording/description.
--
-- DO NOT auto-run on deploy. Apply intentionally via the Supabase SQL editor
-- (project omfwcodoimjmbrhssvfl), AFTER migrations/goals.sql has created the
-- public.goals table.
-- ============================================================================

BEGIN;

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Maintain a complete scholarship & grant listing',
  'Keep a complete, current list of all scholarships and grants available through Legends of Basketball published on this website, updated as new opportunities are added or existing programs change.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Maintain a complete scholarship & grant listing');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Partner with Scholarship America for full administration',
  'Leverage Scholarship America''s end-to-end program administration for scholarship operations — from application intake through award disbursement and compliance reporting.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Partner with Scholarship America for full administration');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Grow scholarship awards year over year',
  'Establish an initial cohort of scholarship awards in the first program year and grow the number of awards each year thereafter. The committee will set specific annual targets as funding allows.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Grow scholarship awards year over year');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Track applications, awards & student progress',
  'Maintain records of all applications received, awards given, and ongoing student progress for every scholarship recipient in the program.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Track applications, awards & student progress');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Promote scholarship opportunities to all members & families',
  'Actively promote scholarship opportunities to all Legends of Basketball members and their eligible family members through chapter communications, the website, and direct outreach.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Promote scholarship opportunities to all members & families');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Pursue external grants — NBA Foundation & beyond',
  'Actively pursue grants from the NBA Foundation and other external sources to grow the scholarship fund beyond member-supported levels.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Pursue external grants — NBA Foundation & beyond');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'scholarships',
  'Report scholarship impact annually to the full committee',
  'Report scholarship program impact annually to the full Membership Services Committee, including total awards given, funds disbursed, student outcomes, and program growth.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'scholarships' AND title = 'Report scholarship impact annually to the full committee');

COMMIT;

-- ============================================================================
-- End of seed. 7 candidate goals for group 'scholarships'.
-- ============================================================================
