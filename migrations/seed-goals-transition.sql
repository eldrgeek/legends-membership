-- ============================================================================
-- Seed: candidate goals for the Legends Life / Transition Services subcommittee
-- group = 'transition'  (matches data-group on transition-services.html)
-- ============================================================================
--
-- These are STARTER goals — "better than a blank slate." They are seeded as
-- status='approved' so they are visible to everyone immediately, but the
-- committee is expected to edit, reword, reprioritize, or remove them and to
-- propose their own. They are directional and carry no hard commitments.
--
-- Source: the original hand-authored "Subcommittee Goals" list that lived
-- inline on transition-services.html (the Legends Life subcommittee page)
-- before the Goals component replaced it, reworded to read as directional
-- candidate goals. The Legends Assist / Legends Growth / Legends Legacy tiering
-- and the phased rollout box remain on the page above the goals component.
--
-- Model (public.goals — see migrations/goals.sql):
--   group        = 'transition'
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
SELECT 'transition',
  'Launch Legends Assist — one trusted point of entry',
  'Establish Legends Assist as the front door to the entire Legends Life platform, so every member with a question, challenge, opportunity, or need knows exactly where to start. Legends Assist coordinates referrals to NBRPA programs, local chapters, healthcare providers, career resources, and financial education partners — a personalized, warm handoff rather than a phone directory.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Launch Legends Assist — one trusted point of entry');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Provide career transition resources for second-career planning',
  'Offer comprehensive career transition resources for former professional basketball players — second-career planning, entrepreneurship, coaching, broadcasting, public speaking, and beyond. Connect members with career development partners, executive networking, the Business Leaders Council, and educational pathways through HBCU and university partners.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Provide career transition resources for second-career planning');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Connect members to financial, health & wellness support',
  'Connect members with vetted financial planning professionals, wealth preservation resources, healthcare partners, and wellness programs tailored to former professional athletes. Health programming spans heart health, brain health, orthopedic wellness, mental health, healthy aging, and chronic pain management.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Connect members to financial, health & wellness support');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Build peer mentorship — the Legends Mentor Initiative',
  'Build peer mentorship networks among retired players, pairing Legends who have navigated successful transitions with members earlier in their post-career journey. Extend mentorship to younger retired players, HBCU basketball players, and youth in local communities — activating the Brotherhood for lasting impact.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Build peer mentorship — the Legends Mentor Initiative');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Conduct member needs assessments',
  'Run Member Needs Assessments to understand each member''s individual support requirements — career stage, health priorities, financial situation, family needs — and match them with the most relevant programs and resources.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Conduct member needs assessments');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Coordinate with the NBA, NBPA & alumni associations',
  'Coordinate with the NBA, NBPA, and alumni associations to build a seamless player lifecycle — where active players enter retirement already connected to the Legends Life platform through Legends Launch (the NBA–NBPA–NBRPA Transition Pathway). Avoid duplication, expand resources, and create warm introductions between organizations.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Coordinate with the NBA, NBPA & alumni associations');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Guide members through life insurance, estate & retirement benefits',
  'Help members navigate life insurance options, estate planning resources, and retirement benefit programs available to former professional basketball players — ensuring every Legend is financially protected and prepared for every stage of life beyond the game.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Guide members through life insurance, estate & retirement benefits');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'transition',
  'Activate Legends Legacy — Brotherhood, community & lasting impact',
  'Activate the Legends Legacy tier — community leadership, youth development, hospital visits, senior member support, the Legends Speakers Bureau, and NBRPA World Basketball Day — so every Legend has the opportunity to give back, stay connected, and build a lasting legacy beyond their playing career.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'transition' AND title = 'Activate Legends Legacy — Brotherhood, community & lasting impact');

COMMIT;

-- ============================================================================
-- End of seed. 8 candidate goals for group 'transition'.
-- ============================================================================
