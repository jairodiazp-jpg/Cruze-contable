-- Repair users with invalid or inactive company links and ensure role consistency.

-- 1) Nullify broken company references (non-existing or inactive companies).
UPDATE public.profiles p
SET company_id = NULL
WHERE p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p.company_id
      AND c.active = true
  );

-- 2) Create deterministic personal company for every remaining orphan profile.
WITH orphan_profiles AS (
  SELECT p.id,
         COALESCE(
           NULLIF(trim(p.full_name), ''),
           NULLIF(trim(split_part(coalesce(p.email, ''), '@', 1)), ''),
           'Usuario'
         ) AS display_name
  FROM public.profiles p
  WHERE p.company_id IS NULL
), ensure_companies AS (
  INSERT INTO public.companies (name, slug, active)
  SELECT
    'Empresa de ' || orphan_profiles.display_name,
    'empresa-' || substr(replace(orphan_profiles.id::text, '-', ''), 1, 12),
    true
  FROM orphan_profiles
  ON CONFLICT (slug) DO UPDATE
  SET active = true,
      name = EXCLUDED.name
  RETURNING id, slug
)
UPDATE public.profiles p
SET company_id = c.id
FROM public.companies c
WHERE p.company_id IS NULL
  AND c.slug = 'empresa-' || substr(replace(p.id::text, '-', ''), 1, 12);

-- 3) Ensure each user with company has at least one role.
WITH users_without_roles AS (
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
FROM users_without_roles
ON CONFLICT (user_id, role) DO NOTHING;
