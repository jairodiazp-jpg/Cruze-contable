-- Apply delivery flow constraints and role profile RLS hardening
-- after enum values are committed by previous migration.

ALTER TABLE public.deliveries
  ALTER COLUMN status SET DEFAULT 'pendiente';

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_company_device_status
  ON public.deliveries(company_id, device_id, status);

CREATE OR REPLACE FUNCTION public.validate_delivery_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_company uuid;
  current_role text;
  has_completed_profile_execution boolean;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required for deliveries';
  END IF;

  IF NEW.device_id IS NULL THEN
    RAISE EXCEPTION 'device_id is required for deliveries';
  END IF;

  SELECT d.company_id, d.role_type
  INTO current_company, current_role
  FROM public.devices d
  WHERE d.id = NEW.device_id;

  IF current_company IS NULL THEN
    RAISE EXCEPTION 'device not found for delivery';
  END IF;

  IF current_company <> NEW.company_id THEN
    RAISE EXCEPTION 'device does not belong to delivery company';
  END IF;

  IF NEW.status IN ('en_configuracion', 'configurado', 'entregado') AND (current_role IS NULL OR btrim(current_role) = '') THEN
    RAISE EXCEPTION 'cannot continue delivery flow without device role assignment';
  END IF;

  IF NEW.status = 'configurado' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.script_executions se
      WHERE se.company_id = NEW.company_id
        AND se.device_id = NEW.device_id
        AND se.script_type = 'install-profile'
        AND se.status = 'completed'
    ) INTO has_completed_profile_execution;

    IF NOT has_completed_profile_execution THEN
      RAISE EXCEPTION 'cannot mark as configurado without completed install-profile execution';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'entregado' AND OLD.status <> 'configurado' THEN
      RAISE EXCEPTION 'cannot mark delivery as entregado before configurado';
    END IF;

    IF NEW.status = 'devuelto' AND OLD.status <> 'entregado' THEN
      RAISE EXCEPTION 'cannot mark delivery as devuelto before entregado';
    END IF;
  END IF;

  IF NEW.status = 'devuelto' AND NEW.return_date IS NULL THEN
    NEW.return_date := CURRENT_DATE;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_delivery_transition ON public.deliveries;
CREATE TRIGGER trg_validate_delivery_transition
BEFORE INSERT OR UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.validate_delivery_transition();

DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins techs can insert profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins techs can update profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins techs can delete profiles" ON public.role_profiles;

CREATE POLICY "Authenticated can view profiles" ON public.role_profiles
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins techs can insert profiles" ON public.role_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Admins techs can update profiles" ON public.role_profiles
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Admins techs can delete profiles" ON public.role_profiles
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND company_id = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can view software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can insert software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can update software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can delete software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins techs can insert software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins techs can update software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins techs can delete software" ON public.role_profile_software;

CREATE POLICY "Authenticated can view software" ON public.role_profile_software
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.role_profiles rp
      WHERE rp.id = role_profile_software.profile_id
        AND (rp.company_id IS NULL OR rp.company_id = public.get_user_company_id(auth.uid()))
    )
  );

CREATE POLICY "Admins techs can insert software" ON public.role_profile_software
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.role_profiles rp
      WHERE rp.id = role_profile_software.profile_id
        AND rp.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Admins techs can update software" ON public.role_profile_software
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.role_profiles rp
      WHERE rp.id = role_profile_software.profile_id
        AND rp.company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.role_profiles rp
      WHERE rp.id = role_profile_software.profile_id
        AND rp.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Admins techs can delete software" ON public.role_profile_software
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.role_profiles rp
      WHERE rp.id = role_profile_software.profile_id
        AND rp.company_id = public.get_user_company_id(auth.uid())
    )
  );
