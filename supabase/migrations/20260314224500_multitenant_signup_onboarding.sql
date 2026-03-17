-- Ensure every newly-registered user is provisioned into a company tenant
-- when company metadata is provided from signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name text;
  v_company_slug text;
  v_company_id uuid;
BEGIN
  v_company_name := nullif(trim(COALESCE(NEW.raw_user_meta_data ->> 'company_name', '')), '');
  v_company_slug := nullif(trim(COALESCE(NEW.raw_user_meta_data ->> 'company_slug', '')), '');

  IF v_company_name IS NOT NULL THEN
    IF v_company_slug IS NULL THEN
      v_company_slug := regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g');
      v_company_slug := trim(both '-' from v_company_slug);
      IF v_company_slug = '' THEN
        v_company_slug := 'empresa';
      END IF;
      v_company_slug := v_company_slug || '-' || substring(NEW.id::text, 1, 8);
    END IF;

    INSERT INTO public.companies (name, slug)
    VALUES (v_company_name, v_company_slug)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, company_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    v_company_id
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
