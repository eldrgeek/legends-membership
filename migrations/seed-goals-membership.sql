-- ============================================================================
-- Seed: candidate goals for the New Membership & Retention subcommittee
-- group = 'membership'  (matches data-group on subcommittee-membership.html)
-- ============================================================================
--
-- These are STARTER goals — "better than a blank slate." They are seeded as
-- status='approved' so they are visible to everyone immediately, but the
-- committee is expected to edit, reword, reprioritize, or remove them and to
-- propose their own. Specific percentage/headcount targets from the original
-- inline list have been kept DIRECTIONAL here (no hard numeric commitments);
-- the committee sets concrete targets itself in the live Goals component.
--
-- Source: the original hand-authored "Membership Targets & Goals" list that
-- lived inline on subcommittee-membership.html before the Goals component
-- replaced it, reworded to read as directional candidate goals.
--
-- Model (public.goals — see migrations/goals.sql):
--   group        = 'membership'
--   status       = 'approved'   (world-readable; committee can re-open/edit)
--   created_by   = 'mw@mike-wolf.com'  (system/owner seed attribution)
--   approved_by  = 'mw@mike-wolf.com'
--   approved_at  = created_at  (2026-06-26, the seed date)
--
-- Idempotency: each INSERT is INSERT ... SELECT ... WHERE NOT EXISTS keyed on
-- (group, title). Re-running this file is a no-op once the rows exist.
--
-- DO NOT auto-run on deploy. Apply intentionally via the Supabase SQL editor
-- (project omfwcodoimjmbrhssvfl), AFTER migrations/goals.sql has created the
-- public.goals table.
-- ============================================================================

BEGIN;

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Grow new member enrollment year over year',
  'Drive steady year-over-year growth in new member enrollment across all chapters, tracked quarterly against a baseline set at the start of each program year. The committee will set the specific growth target.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Grow new member enrollment year over year');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Raise the annual membership renewal rate',
  'Lift and sustain a strong annual membership renewal rate across all chapters. Renewal rates will be tracked per chapter and reported to the full committee quarterly. The committee will set the target renewal rate.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Raise the annual membership renewal rate');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Reach every lapsed member with personal outreach',
  'Personally contact lapsed members promptly after their lapse date — phone calls from fellow Legends, not form letters — and work to re-enroll a meaningful share of them each year.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Reach every lapsed member with personal outreach');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Report membership metrics to the committee each quarter',
  'Track and report each quarter: new member count, renewal rate by chapter, and total outreach contacts made to lapsed members — so the full committee always has a current picture of membership health.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Report membership metrics to the committee each quarter');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Cultivate recently retired alumni not yet in the network',
  'Identify and build relationships with recently retired NBA, ABA, WNBA, and Harlem Globetrotter alumni who are not yet in the Legends network, prioritizing outreach in the first few years post-retirement when transition support matters most.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Cultivate recently retired alumni not yet in the network');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Attract younger members through targeted outreach',
  'Develop targeted outreach to players who have retired recently — a critical window when membership value is highest. Build relationships with current NBA, WNBA, ABA, and Globetrotter alumni organizations to create warm introductions to the Legends network.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Attract younger members through targeted outreach');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'membership',
  'Run an annual win-back campaign for former members',
  'Conduct a dedicated annual campaign to re-engage former Legends members who have lapsed — emphasizing what has changed, what new programs and benefits are now available, and what the member stands to gain by returning.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'membership' AND title = 'Run an annual win-back campaign for former members');

COMMIT;

-- ============================================================================
-- End of seed. 7 candidate goals for group 'membership'.
-- ============================================================================
