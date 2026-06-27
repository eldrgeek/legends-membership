-- ============================================================================
-- Seed: candidate goals for the Chapter President Communication subcommittee
-- group = 'chapter-presidents'
--        (matches data-group on subcommittee-chapter-presidents.html)
-- ============================================================================
--
-- These are STARTER goals — "better than a blank slate." They are seeded as
-- status='approved' so they are visible to everyone immediately, but the
-- committee is expected to edit, reword, reprioritize, or remove them and to
-- propose their own. They are directional and carry no hard commitments.
--
-- Source: the original hand-authored "Subcommittee Goals" list that lived
-- inline on subcommittee-chapter-presidents.html before the Goals component
-- replaced it, reworded to read as directional candidate goals.
--
-- Model (public.goals — see migrations/goals.sql):
--   group        = 'chapter-presidents'
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
SELECT 'chapter-presidents',
  'Establish regular, two-way communication with chapter presidents',
  'Build and maintain consistent, two-way lines of communication with all chapter presidents nationwide — not just pushing information out, but actively listening. Each chapter president should know exactly who to call and feel confident their voice reaches the national committee.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Establish regular, two-way communication with chapter presidents');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Discover what is working — successful programs & initiatives',
  'Conduct structured outreach to every chapter president to identify the programs and initiatives they have found most successful — community events, member engagement, fundraising, partnerships. Compile and share these best practices across all chapters so the whole network benefits from what is already working.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Discover what is working — successful programs & initiatives');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Learn what is coming — upcoming programs & community service plans',
  'Ask each chapter president what new programs, initiatives, or community service projects they are planning for the year ahead. Understand their goals, resource needs, and potential barriers early so the national committee can provide support, connect similar chapters, and coordinate timing for maximum impact.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Learn what is coming — upcoming programs & community service plans');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Hold regular check-ins and report to committee and board',
  'Conduct regular check-ins with chapter presidents and submit written reports to the full Membership Services Committee. At committee and board meetings, present a structured summary of chapter president feedback, active initiatives, and any issues requiring board-level attention.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Hold regular check-ins and report to committee and board');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Coordinate joint chapter initiatives',
  'Facilitate coordination across chapters for joint events, community service drives, and outreach programs that benefit the entire Legends network. Use intelligence gathered from chapter presidents to connect chapters with shared goals rather than letting them work in parallel.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Coordinate joint chapter initiatives');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Deliver timely updates to chapter presidents',
  'Provide chapter presidents with timely updates on committee decisions, available resources, new programs, and organizational priorities — so they can lead their chapters with complete and current information.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Deliver timely updates to chapter presidents');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Maintain the chapter president directory',
  'Keep an up-to-date master directory of all chapter presidents with current contact information, accessible to committee leadership and refreshed regularly.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Maintain the chapter president directory');

INSERT INTO public.goals ("group", title, description, created_by, created_at, status, approved_by, approved_at)
SELECT 'chapter-presidents',
  'Build a shared communication protocol & best-practices library',
  'Develop a shared communication template and reporting protocol so chapter feedback flows consistently to national leadership, and build a living best-practices library — drawn from what chapter presidents report is actually working — available to every chapter in the network.',
  'mw@mike-wolf.com', '2026-06-26T00:00:00Z', 'approved', 'mw@mike-wolf.com', '2026-06-26T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.goals WHERE "group" = 'chapter-presidents' AND title = 'Build a shared communication protocol & best-practices library');

COMMIT;

-- ============================================================================
-- End of seed. 8 candidate goals for group 'chapter-presidents'.
-- ============================================================================
