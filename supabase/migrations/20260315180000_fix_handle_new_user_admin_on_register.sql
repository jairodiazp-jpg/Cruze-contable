-- ============================================================
-- FIX: handle_new_user now creates the company and assigns
-- 'admin' role when the user registers with a company_name.
-- Users joining via invitation get no company and keep 'user'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_name text;
  v_company_slug text;
  v_company_id   uuid;
BEGIN
  -- Extract metadata provided at sign-up
  v_company_name := trim(COALESCE(NEW.raw_user_meta_data->>'company_name', ''));
  v_company_slug := trim(COALESCE(NEW.raw_user_meta_data->>'company_slug', ''));

  -- Always create the profile first
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NEW.email
  );

  IF v_company_name <> '' THEN
    -- Ensure slug is non-empty and unique enough
    IF v_company_slug = '' THEN
      v_company_slug := lower(regexp_replace(v_company_name, '[^a-z0-9]+', '-', 'gi'))
                        || '-' || extract(epoch FROM now())::bigint::text;
    END IF;

    -- Create the company
    INSERT INTO public.companies (name, slug)
    VALUES (v_company_name, v_company_slug)
    RETURNING id INTO v_company_id;

    -- Link the user to the new company
    UPDATE public.profiles SET company_id = v_company_id WHERE id = NEW.id;

    -- Registering user is the company admin
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    -- Invited user: no company yet, role 'user' until invitation is accepted
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
