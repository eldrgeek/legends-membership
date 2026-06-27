-- ============================================================================
-- Migration: allow profiles.role = 'committee' (third nested role)
-- ============================================================================
--
-- Role model is NESTED: admin ⊇ committee ⊇ member. The admin role picker now
-- assigns one of three roles to profiles.role: 'admin', 'committee', 'member'.
--
-- STATUS OF profiles.role IN THIS REPO:
--   The `profiles` table is provisioned directly in Supabase (no CREATE TABLE
--   lives in this repo). Everywhere the role is read it is treated as FREE TEXT:
--     - migrations/goals.sql            → role IN ('admin','committee')
--     - netlify/functions/admin-users.js → PATCH profiles SET role = '<string>'
--   No CHECK constraint / enum / CREATE TYPE for the role exists in the repo.
--
--   IF the live column is genuinely free-text (text/varchar with no CHECK), then
--   NO MIGRATION IS NEEDED — writing role='committee' already works and you can
--   skip this file entirely.
--
--   This file exists ONLY for the case where the live DB has a CHECK constraint
--   (or enum) restricting role to e.g. ('admin','member'). It is ADDITIVE: it
--   widens the allowed set to include 'committee'. It alters the role model, so
--   FLAG FOR HUMAN REVIEW before applying.
--
-- ⚠️ DO NOT auto-run on deploy. Apply intentionally via the Supabase SQL editor
--    (project omfwcodoimjmbrhssvfl) only if profiles.role is CHECK-constrained.
--
-- Idempotent: safe to re-run. The DO block is a no-op when no role CHECK exists.
-- ============================================================================

-- Drop any existing CHECK constraint on profiles.role that does NOT already
-- permit 'committee', then recreate it widened to the three nested roles.
-- If profiles.role is plain text with no CHECK, this block finds nothing and
-- does nothing (so it is harmless to run even in the free-text case).
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t       ON t.oid = c.conrelid
    JOIN pg_namespace n   ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%committee%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname);
    EXECUTE format(
      'ALTER TABLE public.profiles ADD CONSTRAINT %I CHECK (role IN (''admin'', ''committee'', ''member''))',
      con.conname
    );
  END LOOP;
END $$;

-- If instead profiles.role is backed by a Postgres ENUM type named e.g.
-- 'user_role' or 'app_role', uncomment and adapt ONE of the following to add the
-- 'committee' value (ENUM values cannot be added inside a transaction block):
--   ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'committee';
--   ALTER TYPE public.app_role  ADD VALUE IF NOT EXISTS 'committee';
