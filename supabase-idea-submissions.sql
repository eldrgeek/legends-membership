-- ============================================================
-- Legends of Basketball — idea_submissions table + RLS
--
-- PASTE THIS INTO:
--   https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/sql/new
-- then click Run.
--
-- This table backs the "Share an Idea" form on resources.html,
-- now served by netlify/functions/submit-recommendation.js.
-- All writes use the service-role key (bypasses RLS).
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.idea_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  name        text,
  email       text,
  idea        text NOT NULL,
  source      text DEFAULT 'web',
  ip          text,
  user_agent  text
);

-- 2. Enable Row Level Security
ALTER TABLE public.idea_submissions ENABLE ROW LEVEL SECURITY;

-- 3. No public select/insert — all access is via service-role function only.

-- 4. Admin SELECT policy — admins can read all idea submissions
DROP POLICY IF EXISTS "idea_submissions_select_admin" ON public.idea_submissions;
CREATE POLICY "idea_submissions_select_admin"
  ON public.idea_submissions
  FOR SELECT
  USING ( public.current_user_role() = 'admin' );

-- 5. Admin DELETE policy (for pruning test data)
DROP POLICY IF EXISTS "idea_submissions_delete_admin" ON public.idea_submissions;
CREATE POLICY "idea_submissions_delete_admin"
  ON public.idea_submissions
  FOR DELETE
  USING ( public.current_user_role() = 'admin' );
