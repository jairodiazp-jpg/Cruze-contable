-- Repair legacy or invited users that ended up without profiles.company_id.

WITH ranked_invites AS (
  SELECT
    lower(ci.email) AS email_key,
    ci.company_id,
    ci.role,
    ci.status,
    ROW_NUMBER() OVER (
      PARTITION BY lower(ci.email)
      ORDER BY
        CASE ci.status WHEN 'accepted' THEN 0 ELSE 1 END,
        COALESCE(ci.accepted_at, ci.created_at) DESC,
        ci.created_at DESC
    ) AS rn
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE c.active = true
    AND ci.status IN ('accepted', 'pending')
    AND (ci.status = 'accepted' OR ci.expires_at > now())
),
invite_matches AS (
  SELECT p.id AS profile_id, ri.company_id, ri.role
  FROM public.profiles p
  JOIN ranked_invites ri
    ON lower(COALESCE(p.email, '')) = ri.email_key
   AND ri.rn = 1
  WHERE p.company_id IS NULL
)
UPDATE public.profiles p
SET company_id = im.company_id
FROM invite_matches im
WHERE p.id = im.profile_id;

WITH ranked_invites AS (
  SELECT
    lower(ci.email) AS email_key,
    ci.company_id,
    ci.role,
    ci.status,
    ROW_NUMBER() OVER (
      PARTITION BY lower(ci.email)
      ORDER BY
        CASE ci.status WHEN 'accepted' THEN 0 ELSE 1 END,
        COALESCE(ci.accepted_at, ci.created_at) DESC,
        ci.created_at DESC
    ) AS rn
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE c.active = true
    AND ci.status IN ('accepted', 'pending')
    AND (ci.status = 'accepted' OR ci.expires_at > now())
)
INSERT INTO public.user_roles (user_id, role)
SELECT im.profile_id, im.role
FROM (
  SELECT p.id AS profile_id, ri.role
  FROM public.profiles p
  JOIN ranked_invites ri
    ON lower(COALESCE(p.email, '')) = ri.email_key
   AND ri.rn = 1
  WHERE p.company_id IS NOT NULL
) im
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = im.profile_id
    AND ur.role = im.role
);

WITH metadata_candidates AS (
  SELECT
    p.id AS profile_id,
    c.id AS company_id,
    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY c.created_at DESC) AS rn,
    COUNT(*) OVER (PARTITION BY p.id) AS match_count
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.companies c ON c.active = true
  WHERE p.company_id IS NULL
    AND (
      (
        NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_slug', '')), '') IS NOT NULL
        AND c.slug = NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_slug', '')), '')
      )
      OR (
        NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_slug', '')), '') IS NULL
        AND NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_name', '')), '') IS NOT NULL
        AND lower(c.name) = lower(NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_name', '')), ''))
      )
    )
),
metadata_matches AS (
  SELECT profile_id, company_id
  FROM metadata_candidates
  WHERE rn = 1
    AND match_count = 1
)
UPDATE public.profiles p
SET company_id = mm.company_id
FROM metadata_matches mm
WHERE p.id = mm.profile_id;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.company_id IS NOT NULL
  AND NULLIF(trim(COALESCE(u.raw_user_meta_data->>'company_name', '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.company_invitations ci
    WHERE lower(ci.email) = lower(COALESCE(p.email, ''))
  )
  AND NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = p.id
    AND ur.role = 'admin'::public.app_role
);