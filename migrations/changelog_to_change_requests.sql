-- ============================================================================
-- Migration: Legacy Change Log  ->  unified public.change_requests
-- ============================================================================
--
-- Source: the static `var CHANGELOG = [...]` array in admin-changelog.html
--         (legacy entries cl-001 .. cl-026).
--
-- Each legacy entry is reformatted to the unified change_requests model and
-- ENRICHED from this repo's git history: the "description" below is the
-- precise what-changed recovered from commit messages and `git show --stat`,
-- which is more accurate than the original hand-written summary. The mapped
-- git commit SHA is recorded in commit_sha.
--
-- Model mapping applied:
--   source         = 'legacy'
--   requester_name = entry.requester (Mike / Greg)
--   requester_role = 'owner'   (both Mike and Greg are owners of this site)
--   requester_email= mw@mike-wolf.com (Mike) / gfos44@gmail.com (Greg)
--   type           = 'change', except clear bug fixes -> 'bug'
--   title          = entry.title
--   description    = enriched what-changed (from git diff/stat + commit msg)
--   page           = site path of the primary file touched (e.g. /members)
--   commit_sha     = main implementing commit (full 40-char sha not stored;
--                    short sha used as the stable natural key for idempotency)
--   status         = 'accepted'  (legacy items were all shipped),
--                    EXCEPT cl-026 which was 'deferred' in the legacy data and
--                    is preserved as 'deferred' here.
--   created_at     = entry.date (the request/ship date)
--   updated_at     = entry.date
--   vet            = NULL   (legacy items predate the vetting pipeline)
--   context        = jsonb carrying the legacy id + original summary for trace
--
-- Idempotency:
--   Each INSERT is INSERT ... SELECT ... WHERE NOT EXISTS, keyed on a stable
--   natural key. For rows with a known commit, the key is commit_sha. For rows
--   WITHOUT a confidently-pinned commit (commit_sha IS NULL), the natural key
--   is context->>'legacy_id' so re-running stays safe. Re-running this file is
--   a no-op once the rows exist.
--
-- UNPINNED / FLAGGED entries (commit_sha = NULL, see report):
--   cl-001  Initial site build (2026-05-11) predates this repo's git history;
--           earliest commit is 39aefca7 "baseline before Greg request batch"
--           (2026-05-25). No commit captures the initial build.
--
-- NOTE on a couple of legacy-summary inaccuracies surfaced by git:
--   cl-003  Original summary calls it a "magic-link" invite; the May-28
--           implementation actually used Netlify Identity invites. True
--           Supabase magic-link auth arrived later (cl-013, 2026-06-05).
--   cl-004  Original summary says "removed the Choo library dependency"; the
--           commit (d071933e) removed *Choo Smith* (a committee member entry),
--           not a JS library. Description below reflects the real change.
--
-- DO NOT auto-run as part of deploy; apply intentionally against Supabase.
-- ============================================================================

BEGIN;

-- cl-001  (commit_sha NULL — predates git history; FLAGGED)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Initial site build and Netlify deployment',
  'Built the full multi-page static site for the Membership Services Committee of Legends of Basketball (Home, Committee Members, Meeting Minutes, Resources, Systems Map, Member Assessment, About/Contact) and stood up continuous deployment from GitHub to Netlify. This work predates the earliest commit in this repository (the repo''s first recorded commit is 39aefca7 "baseline before Greg request batch", 2026-05-25), so no implementing commit could be pinned.',
  '/', jsonb_build_object('legacy_id','cl-001','legacy_summary','Built the full multi-page website for the Membership Services Committee of Legends of Basketball: Home, Committee Members, Meeting Minutes, Resources, Systems Map, Member Assessment form, and About/Contact pages. Deployed to Netlify with continuous deployment from GitHub.'),
  'accepted', NULL, NULL, '2026-05-11T00:00:00Z', '2026-05-11T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE context->>'legacy_id' = 'cl-001');

-- cl-002  -> cda8c30b
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'Content updates from Greg''s May emails',
  'Applied Greg''s May content batch: added a full Resources page (resources.html, ~443 lines) containing Leslie Johnson''s member-submitted ideas, the May 7 agenda, and a systems-map placeholder, and added the committee member page members/choo-smith.html. (Sibling commits in the same batch added the Resources nav link sitewide, darkened the blue palette with silver accents, and added the idea-sharing form.)',
  '/resources', jsonb_build_object('legacy_id','cl-002','legacy_summary','Applied content from Greg''s May 15-23 emails: updated committee member information, added the Systems Map diagram, created a Resources page with member-services documents and a one-pager. Read background context from Greg''s Zoom summary with Purvis Short and Antonio Davis.'),
  'accepted', NULL, 'cda8c30b', '2026-05-15T00:00:00Z', '2026-05-15T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'cda8c30b');

-- cl-003  -> 5285c4a1
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Magic-link invitation system for committee members',
  'Stood up the committee-member invite/auth flow. Added the Netlify Identity widget to all public pages and gated minutes/resources as committee-only (39d541f0), then wired the invite confirmation flow (5285c4a1). NOTE: the original summary describes this as "magic-link"; the May-28 implementation actually used Netlify Identity invites — true Supabase magic-link auth came later (see cl-013).',
  '/login', jsonb_build_object('legacy_id','cl-003','legacy_summary','Implemented email invite flow so new committee members can get access to gated pages via a magic-link email, without needing a password. Added confirmation UI and post-login redirect handling.','related_commits', jsonb_build_array('39d541f0','5285c4a1','a13bc0a6')),
  'accepted', NULL, '5285c4a1', '2026-05-28T00:00:00Z', '2026-05-28T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '5285c4a1');

-- cl-004  -> d071933e
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'bug',
  'Auth UX fixes: logout button, auth redirect, Choo removal',
  'Fixed auth edge cases: resolved the auth redirect loop, added the reset-password flow, and added a sign-out affordance to the nav on all pages (d373388c). NOTE: the legacy summary says "removed the Choo library dependency" — the commit (d071933e) actually removed Choo Smith (a committee-member entry) from the committee page, not a JS library.',
  '/login', jsonb_build_object('legacy_id','cl-004','legacy_summary','Fixed several auth edge cases: logout button now visible after sign-in, auth redirect handles the magic-link callback correctly, removed the Choo library dependency that was causing conflicts.','related_commits', jsonb_build_array('d071933e','d373388c','01e2af1b')),
  'accepted', NULL, 'd071933e', '2026-05-28T00:00:00Z', '2026-05-28T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'd071933e');

-- cl-005  -> dc4ad47b
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Recommendations channel: bug reports and feature requests',
  'Added the SOMA Recommendation Channel v0: new bugs.html (bug reports), features.html (feature forum), recommendations.html, rec-detail.html, and the admin-recommendations.html review surface, with nav/footer links wired across the site. Members submit bug reports and feature suggestions; Greg reviews them in admin-recommendations.html before action.',
  '/recommendations', jsonb_build_object('legacy_id','cl-005','legacy_summary','Built the Recommendations system: committee members can submit bug reports and feature suggestions via the bugs.html and features.html forms. Bill AI analyzes each submission. Greg reviews them in admin-recommendations.html before any action is taken.'),
  'accepted', NULL, 'dc4ad47b', '2026-05-29T00:00:00Z', '2026-05-29T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'dc4ad47b');

-- cl-006  -> ef73d282
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Member assessment admin panel + Bill feedback link',
  'Built the admin committee/management page (admin.html, ~260 lines) which surfaces member assessment submissions stored in Supabase (ef73d282, "Task 2 — Admin page for committee user management"). The Bill feedback affordance came in with the same-day Bill Talk integration (7d13caef). The native in-app assessment read panel was later refined on Jun 8 (9daae5b9).',
  '/admin', jsonb_build_object('legacy_id','cl-006','legacy_summary','Added a "Member Assessment Submissions" panel to the admin page showing responses from the assessment form stored in Supabase. Also added a Bill feedback link so members can report issues through the AI widget.','related_commits', jsonb_build_array('ef73d282','7d13caef','9daae5b9')),
  'accepted', NULL, 'ef73d282', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'ef73d282');

-- cl-007  -> 61859353
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Systems Map: Decap CMS integration',
  'Wired Decap CMS for web-based content editing: added static/admin-cms/config.yml and static/admin-cms/index.html and integrated the CMS link across pages (61859353, "Phases 3+4 — Decap CMS wiring + nav integration"). The same Jun-1 effort delivered the interactive D3 systems map (cf71db00) and its data layer (4fbdbe87). (Decap/Netlify-Identity CMS was later retired on Jun 8 in 058d49c9.)',
  '/admin-cms', jsonb_build_object('legacy_id','cl-007','legacy_summary','Integrated Decap CMS (formerly Netlify CMS) so the systems map content can be edited through a web-based content editor at /admin-cms, without needing to touch code.','related_commits', jsonb_build_array('61859353','cf71db00','4fbdbe87')),
  'accepted', NULL, '61859353', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '61859353');

-- cl-008  -> b223e58b
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'bug',
  'Greg''s punchlist: login link, admin nav, NBRPA->Legends, test suite',
  'Greg''s review punchlist (b223e58b "login-nav/admin-nav/NBRPA punchlist + test suite"): (1) hide the Login link when a user is already signed in; (2) show the Admin nav link in the main navigation for admins; (3) replace site-authored "NBRPA" copy with "Legends"/"Legends of Basketball" while preserving Leslie Johnson''s original member-submitted ideas verbatim; (4) added a Playwright test suite covering auth state, admin-link visibility, and the NBRPA replacement.',
  '/', jsonb_build_object('legacy_id','cl-008','legacy_summary','Four fixes from Greg''s review: (1) Login link hides when signed in. (2) Admin nav link shows in main nav for admins. (3) NBRPA->Legends sitewide, Leslie ideas preserved verbatim. (4) Playwright test suite.'),
  'accepted', NULL, 'b223e58b', '2026-06-02T00:00:00Z', '2026-06-02T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'b223e58b');

-- cl-009  -> 04faf81e  (medium confidence; see report)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Phase B: visual polish — cards, headings, typography',
  'Visual polish pass on Jun 3: card drill-down on the Leslie Johnson recommendations card plus heading-rhythm/typography refinement, alongside an Ask Bill gating report (04faf81e "Leslie card drill-down, heading rhythm, Ask Bill gating report"). Jun 3 work was dominated by the Ask Bill guide widget; this commit is the closest match to the "cards/headings/typography" description.',
  '/recommendations', jsonb_build_object('legacy_id','cl-009','legacy_summary','Phase B visual improvements: better card layouts across the site, updated headings with improved hierarchy, typography refinements for readability.','related_commits', jsonb_build_array('04faf81e','f546fa3e'),'confidence','medium'),
  'accepted', NULL, '04faf81e', '2026-06-03T00:00:00Z', '2026-06-03T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '04faf81e');

-- cl-010  -> a3266e78
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Resources dropdown in nav',
  'Consolidated the top-level nav: replaced individual Resources/Minutes/Systems Map/Assessment links with a single Resources dropdown and renamed "Coach" to "Bill" (a3266e78 "Resources dropdown nav, declutter top-level nav, Coach->Bill rename"; merged via 70c58710). Player Benefits and Membership Offerings were added to this dropdown in later commits.',
  '/resources', jsonb_build_object('legacy_id','cl-010','legacy_summary','Consolidated the Resources section in the navigation into a dropdown menu covering: Resources, Minutes, Systems Map, Assessment, Player Benefits, and Membership Offerings. Reduces nav clutter.','related_commits', jsonb_build_array('a3266e78','70c58710')),
  'accepted', NULL, 'a3266e78', '2026-06-03T00:00:00Z', '2026-06-03T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'a3266e78');

-- cl-011  -> 5a0a4da4  (medium confidence; multi-commit Jun 4 batch)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'bug',
  'Engine fixes, nav fixes, and assorted issues',
  'Jun 4 fix batch for the Ask Bill guide engine and nav: root-absolute navigation, ensure-page gate, resources-nav targeting, navigator nesting, committee scope-down (5a0a4da4), plus admin 404-link fixes and pause-navigator consolidation (518cc13d). Resolves the punchlist issues referenced in the legacy entry.',
  '/', jsonb_build_object('legacy_id','cl-011','legacy_summary','Multiple bug fixes from the June 3 review: Ask Bill engine fixes, nav behavior improvements, and resolution of issues #1, #2, and #3 from the punchlist.','related_commits', jsonb_build_array('5a0a4da4','518cc13d'),'confidence','medium'),
  'accepted', NULL, '5a0a4da4', '2026-06-04T00:00:00Z', '2026-06-04T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '5a0a4da4');

-- cl-012  -> 616c6775
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Pre-generated tour audio for Bill''s guided tour',
  'Pre-generated 22 static audio clips for Bill''s guided-tour narration and switched to static-first playback (616c6775 "pre-generated tour audio (22 static clips) + static-first playback"), so the tour no longer needs a live ElevenLabs TTS call and stays reliable if TTS is down.',
  '/', jsonb_build_object('legacy_id','cl-012','legacy_summary','Generated static audio files for Bill''s guided tour narration so the tour does not require a live TTS call. Faster and more reliable - tour audio plays even if ElevenLabs is down.'),
  'accepted', NULL, '616c6775', '2026-06-04T00:00:00Z', '2026-06-04T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '616c6775');

-- cl-013  -> 30113fff
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'SOMA Auth migration: replaced Netlify Identity with Supabase',
  'Migrated authentication off Netlify Identity onto SOMA Auth — a Supabase magic-link implementation (30113fff "migrate Netlify Identity -> SOMA Auth (Supabase magic-link)"). Follow-on commits made getRole() self-sufficient (465886ac), replaced Netlify dashboard links on admin.html with Supabase equivalents (3cea10a9), and retired the last Netlify-Identity load by removing the Decap CMS (058d49c9).',
  '/login', jsonb_build_object('legacy_id','cl-013','legacy_summary','Major auth infrastructure change: replaced Netlify Identity with SOMA Auth - a Supabase magic-link implementation (soma-auth.js).','related_commits', jsonb_build_array('30113fff','465886ac','3cea10a9','058d49c9')),
  'accepted', NULL, '30113fff', '2026-06-05T00:00:00Z', '2026-06-05T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '30113fff');

-- cl-014  -> a8ac1132
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Committee dropdown in nav + subcommittee pages',
  'Added a "Committee" nav dropdown covering Committee Members and the new Transition Services — Legends Life subcommittee page (a8ac1132 "add Committee dropdown with Transition Services — Legends Life sub-committee"). The full set of subcommittee pages (Legends Life, Membership, Scholarships) followed in the Jun 11 batch (f8cf04f3).',
  '/transition-services', jsonb_build_object('legacy_id','cl-014','legacy_summary','Added a "Committee" dropdown in the nav covering Committee Members and the new Transition Services - Legends Life subcommittee page. Built dedicated subcommittee pages for Legends Life, Membership, and Scholarships.','related_commits', jsonb_build_array('a8ac1132','f8cf04f3')),
  'accepted', NULL, 'a8ac1132', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'a8ac1132');

-- cl-015  -> 50b39838
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'June 7 meeting agenda added to minutes',
  'Added the June 7, 2026 committee meeting agenda (rescheduled from June 2) to minutes.html and resources.html (50b39838 "add June 7, 2026 committee meeting agenda").',
  '/minutes', jsonb_build_object('legacy_id','cl-015','legacy_summary','Added the June 7 meeting agenda content to the Meeting Minutes page.'),
  'accepted', NULL, '50b39838', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '50b39838');

-- cl-016  -> 9550f26a  (Jun 9 batch; representative anchor)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'Greg''s June 9 batch: player benefits, polish, submission fix, Bill bugs',
  'Large Jun 9 review batch (~15 commits). Highlights: added the Player Benefits page covering NBA/WNBA pension, health, and vesting by years of service (0d7ce126) and added it to the Resources dropdown sitewide (c2ac1a19) with a public-visibility/layout cleanup pass (9550f26a, a3d00fc3, 9e623757); fixed the Submit Idea pipeline to use the submit-recommendation function server-side (0d1291de) with a regression test (e21af090); added the AI features portal (a1934443); fixed Ask Bill tour bugs incl. cleanOnClose / return-to-home / dropdown desync (1cfe4adc, 8d9fb5ca) and feedback intake + domain scope guard (29bb68b5); plus role-gated admin panel + role persistence fix (16233fb0).',
  '/player-benefits', jsonb_build_object('legacy_id','cl-016','legacy_summary','Large batch from Greg''s review session: built out the Player Benefits page, general UI polish pass, fixed the member assessment submission flow, added the AI features portal, resolved Ask Bill tour bugs (clean restart on open/close, voice input), content and admin display fixes, visual improvements, and resource access level controls.','related_commits', jsonb_build_array('0d7ce126','c2ac1a19','9550f26a','0d1291de','a1934443','1cfe4adc','29bb68b5','16233fb0'),'confidence','medium'),
  'accepted', NULL, '9550f26a', '2026-06-09T00:00:00Z', '2026-06-09T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '9550f26a');

-- cl-017  -> ba757de5  (medium confidence; see report)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'bug',
  'Bill feedback bug fixes from Greg''s review',
  'Fixed Bill-widget feedback handling surfaced in Greg''s review: feedback-intake improvements (and a favicon + find-member keyword narrowing) on Jun 10 (ba757de5 "narrow find-member keywords + favicon + feedback intake improvements"). The fuller admin-side feedback approval workflow (with Greg auto-approve) landed later on Jun 15 (4e37161b).',
  '/admin', jsonb_build_object('legacy_id','cl-017','legacy_summary','Fixed a set of Bill widget bugs surfaced during Greg''s review session: feedback collection and display issues in the admin panel.','related_commits', jsonb_build_array('ba757de5','29bb68b5','4e37161b'),'confidence','medium'),
  'accepted', NULL, 'ba757de5', '2026-06-10T00:00:00Z', '2026-06-10T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'ba757de5');

-- cl-018  -> e9f3dc1d
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'bug',
  'Transition Services page: assessment embed fix and content edit',
  'Fixed the Member Needs Assessment embed on the Transition Services / Legends Life page: hide the site nav and footer when the assessment is embedded in an iframe so the chrome no longer renders inside the embed (e9f3dc1d "hide nav/footer when assessment is embedded in iframe"). The assessment was first embedded directly on the subcommittee page in the preceding commit (b9438150).',
  '/transition-services', jsonb_build_object('legacy_id','cl-018','legacy_summary','Fixed the Member Needs Assessment embed in transition-services.html - it was showing the full site nav and footer inside the iframe. Now uses ?embed=1 to hide the chrome when embedded. Also made content edits to the Legends Life page.','related_commits', jsonb_build_array('e9f3dc1d','b9438150')),
  'accepted', NULL, 'e9f3dc1d', '2026-06-14T00:00:00Z', '2026-06-14T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'e9f3dc1d');

-- cl-019  -> 8ef089d3
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Site change log summary page (this page)',
  'Created the admin-gated Site Change Log page itself: new admin-changelog.html (~823 lines) with a chronological list of site communications/requests, per-item status, a refinement-notes area, and a new-request form, plus a link to it from admin.html (8ef089d3 "add Site Change Log page for Greg and Mike").',
  '/admin-changelog', jsonb_build_object('legacy_id','cl-019','legacy_summary','Added this admin-gated Site Change Log page: a chronological list of all website communications and requests with status, a place for Greg to add refinement notes, and a form for new requests.'),
  'accepted', NULL, '8ef089d3', '2026-06-15T00:00:00Z', '2026-06-15T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '8ef089d3');

-- cl-020  -> f8cf04f3  (Jun 11 batch A; representative anchor)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'Greg''s June 11 batch A: minutes, nav, committee updates, Bill tour',
  'Jun 11 batch A: (1) published June 10 committee meeting minutes (d0f3d377); (2) added 4 subcommittees (Legends Life, Membership, Scholarships, Chapter Presidents) under the Committee nav dropdown (f8cf04f3); (3) added the Work Stream Delegation section to the Committee Members page (99f9e0b4); (4) moved meeting agendas from Resources to the Minutes page (daf8930e); (5) made the Bill guided tour navigate to resource pages (d4f466b3); (6) added the Chapter Presidents directory table (01de2abf); (7) added the MS&B Committee contact directory (e03af4d4).',
  '/members', jsonb_build_object('legacy_id','cl-020','legacy_summary','Large batch from Greg''s June 11 emails: June 10 minutes; 4 subcommittee pages in Committee nav dropdown; Work Stream Delegation section; agendas moved to Minutes; Bill tour navigates to resource pages; Chapter Presidents directory; MS&B contact directory.','related_commits', jsonb_build_array('d0f3d377','f8cf04f3','99f9e0b4','daf8930e','d4f466b3','01de2abf','e03af4d4')),
  'accepted', NULL, 'f8cf04f3', '2026-06-11T00:00:00Z', '2026-06-11T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'f8cf04f3');

-- cl-021  -> 5b9c2349  (Jun 11 batch B; representative anchor)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'Greg''s June 11 batch B: Platinum spreadsheet, member corrections, Ask Bill fix',
  'Jun 11 batch B: (1) added the Platinum & Gold membership spreadsheet download to the subcommittee page (5b9c2349); (2) added Choo Smith to the MS&B contact directory, correcting the earlier "Chu" spelling (e03af4d4) — then removed per Greg the same day (e623a8f8 "Remove Choo Smith from committee page per Greg Foster request"); (3) removed Hollins and Tinsley from the Work Stream Delegation section, keeping them as regular committee members (a628f4e6); (4) made the Ask Bill nav link reliably visible with an always-visible home section (35c1c91f).',
  '/subcommittee-membership', jsonb_build_object('legacy_id','cl-021','legacy_summary','Continuation of Greg''s June 11 requests: Platinum & Gold spreadsheet download; Choo Smith added (corrected from "Chu Smith"); Hollins and Tinsley removed from Work Stream Delegation; Ask Bill nav link reliably visible.','related_commits', jsonb_build_array('5b9c2349','e03af4d4','e623a8f8','a628f4e6','35c1c91f')),
  'accepted', NULL, '5b9c2349', '2026-06-11T00:00:00Z', '2026-06-11T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '5b9c2349');

-- cl-022  -> 2a4c62e3
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Purvis Short + all 4 subcommittee tabs added to Committee Members page',
  'Added Purvis Short to the committee roster and integrated all 4 subcommittee pages (Legends Life, Membership, Scholarships, Chapter Presidents) as navigable tabs within the Committee Members page (2a4c62e3 "add Purvis Short + all 4 subcommittee tabs to committee page").',
  '/members', jsonb_build_object('legacy_id','cl-022','legacy_summary','Added Purvis Short to the committee roster. Integrated all 4 subcommittee pages as navigable tabs within the Committee Members page.'),
  'accepted', NULL, '2a4c62e3', '2026-06-12T00:00:00Z', '2026-06-12T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '2a4c62e3');

-- cl-023  -> 94b5195a  (description; Scholarship-America part = 24890b58)
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Work Stream Delegation removal and Scholarship America section expansion',
  'Removed the Work Stream Delegation section from the Committee Members page since subcommittee navigation is handled by the nav dropdown (94b5195a "remove Work Stream Delegation section per Greg and Mike request"), and expanded the Scholarship America partnership section on the Scholarships subcommittee page with factual detail (24890b58 "expand Scholarship America partnership section with factual detail").',
  '/members', jsonb_build_object('legacy_id','cl-023','legacy_summary','Removed the Work Stream Delegation section from the Committee Members page; subcommittee navigation handled by the nav dropdown. Also expanded the Scholarship America partnership section on the Scholarships subcommittee page.','legacy_page','members.html','related_commits', jsonb_build_array('94b5195a','24890b58')),
  'accepted', NULL, '94b5195a', '2026-06-15T00:00:00Z', '2026-06-15T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '94b5195a');

-- cl-024  -> fb6d3213
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Date range filtering + email log backfill',
  'Added From/To date-range filtering to the Site Change Log (admin-changelog.html, +91 lines) and back-filled the missing CHANGELOG entries for the June 11 Greg batches, the June 12 Purvis Short update, and the June 15 pre-launch changes; also added scripts/scrape-email-log.py (~190 lines) to extract Legends-related completion emails from the claude@ inbox (fb6d3213 "add date range filter, backfill June 11-15 entries, add email scrape script").',
  '/admin-changelog', jsonb_build_object('legacy_id','cl-024','legacy_summary','Added date range (From / To) filtering to the Site Change Log; back-filled missing CHANGELOG entries; added scripts/scrape-email-log.py utility.','legacy_page','admin-changelog.html'),
  'accepted', NULL, 'fb6d3213', '2026-06-15T00:00:00Z', '2026-06-15T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'fb6d3213');

-- cl-025  -> f2283ff0
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Mike', 'mw@mike-wolf.com', 'owner', 'change',
  'Search box on the Site Change Log',
  'Added a live search box to the Site Change Log that filters entries by title, summary, requester, or date as you type, working alongside the existing status tabs and date-range filter (f2283ff0 "add search box to the Site Change Log").',
  '/admin-changelog', jsonb_build_object('legacy_id','cl-025','legacy_summary','Added a search box to the Site Change Log that filters entries by title, summary, requester, or date as you type.','legacy_page','admin-changelog.html'),
  'accepted', NULL, 'f2283ff0', '2026-06-15T00:00:00Z', '2026-06-15T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = 'f2283ff0');

-- cl-026  -> 6986c746  (status preserved as 'deferred')
INSERT INTO public.change_requests
  (source, requester_name, requester_email, requester_role, type, title, description, page, context, status, vet, commit_sha, created_at, updated_at)
SELECT 'legacy', 'Greg', 'gfos44@gmail.com', 'owner', 'change',
  'Add membership program PDFs to Membership Offerings page',
  'Partially addressed Greg''s Jun 15 request to add 8 PDF attachments to the Membership Offerings page (member offerings PDF first). The referenced "blank page" bug was the missing SomaAuth.init() call, already fixed earlier (09aec13e). In this pass only a clarifying note was added to the two existing SharePoint PDF links explaining they require a Legends Microsoft 365 account (6986c746 "SharePoint blank-page note + changelog entry for Greg''s PDF request"); the PDFs themselves could not be added because the email attachments were not accessible via the dispatch channel. DEFERRED pending the actual PDF files (commit to /downloads/ or provide download links).',
  '/membership-offerings', jsonb_build_object('legacy_id','cl-026','legacy_summary','Greg asked to add 8 PDF attachments to the Membership Offerings page. Blank-page bug was the missing SomaAuth.init() (already fixed, 09aec13e). PDFs could not be added (attachments not accessible via dispatch). Clarifying SharePoint note added instead.','legacy_page','membership-offerings.html','related_commits', jsonb_build_array('6986c746','09aec13e')),
  'deferred', NULL, '6986c746', '2026-06-16T00:00:00Z', '2026-06-16T00:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM public.change_requests WHERE commit_sha = '6986c746');

COMMIT;

-- ============================================================================
-- End of migration. 26 legacy entries (cl-001 .. cl-026).
-- 25 pinned to a git commit; cl-001 has commit_sha = NULL (predates history).
-- ============================================================================
