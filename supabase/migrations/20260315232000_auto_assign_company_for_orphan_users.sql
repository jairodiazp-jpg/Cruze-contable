-- Ensure every auth user has a profile and a valid company assignment.
-- This migration backfills legacy users that still have NULL company_id.

-- 1) Create missing profiles for auth users.
INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  lower(u.email),
  NULLIF(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 2) Create a deterministic personal company for each orphan profile.
WITH orphan_profiles AS (
  SELECT
    p.id,
    p.email,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      NULLIF(trim(split_part(coalesce(p.email, ''), '@', 1)), ''),
      'Usuario'
    ) AS display_name
  FROM public.profiles p
  WHERE p.company_id IS NULL
), ensure_companies AS (
  INSERT INTO public.companies (name, slug)
  SELECT
    'Empresa de ' || orphan_profiles.display_name,
    'empresa-' || substr(replace(orphan_profiles.id::text, '-', ''), 1, 12)
  FROM orphan_profiles
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name
  RETURNING id, slug
)
UPDATE public.profiles p
SET company_id = c.id
FROM public.companies c
WHERE p.company_id IS NULL
  AND c.slug = 'empresa-' || substr(replace(p.id::text, '-', ''), 1, 12);

-- 3) Guarantee at least one role for users that were orphaned.
WITH orphaned_users AS (
  SELECT p.id
  FROM public.profiles p
  WHERE p.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
    )
)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM orphaned_users
ON CONFLICT (user_id, role) DO NOTHING;
