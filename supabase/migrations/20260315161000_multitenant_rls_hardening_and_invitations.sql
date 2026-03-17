-- Harden tenant isolation and add internal company invitations.

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.company_id IS NOT NULL
      AND p.company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_user_in_company(_actor_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.profiles target ON target.id = _target_user_id
    WHERE actor.id = _actor_id
      AND actor.company_id IS NOT NULL
      AND actor.company_id = target.company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ticket_in_company(_actor_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets t
    JOIN public.profiles actor ON actor.id = _actor_id
    WHERE t.id = _ticket_id
      AND actor.company_id IS NOT NULL
      AND t.company_id = actor.company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_role_profile_in_company(_actor_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_profiles rp
    JOIN public.profiles actor ON actor.id = _actor_id
    WHERE rp.id = _profile_id
      AND actor.company_id IS NOT NULL
      AND rp.company_id = actor.company_id
  )
$$;

CREATE TABLE IF NOT EXISTS public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_company_invitations_company_id
  ON public.company_invitations(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_invitations_email
  ON public.company_invitations(company_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_invitations_pending_email
  ON public.company_invitations(company_id, lower(email))
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS update_company_invitations_updated_at ON public.company_invitations;
CREATE TRIGGER update_company_invitations_updated_at
  BEFORE UPDATE ON public.company_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins can view company invitations" ON public.company_invitations;
CREATE POLICY "Admins can view company invitations"
ON public.company_invitations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.is_company_member(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Admins can create company invitations" ON public.company_invitations;
CREATE POLICY "Admins can create company invitations"
ON public.company_invitations FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND invited_by = auth.uid()
  AND public.is_company_member(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Admins can update company invitations" ON public.company_invitations;
CREATE POLICY "Admins can update company invitations"
ON public.company_invitations FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.is_company_member(auth.uid(), company_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.is_company_member(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Admins can delete company invitations" ON public.company_invitations;
CREATE POLICY "Admins can delete company invitations"
ON public.company_invitations FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.is_company_member(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;

CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id));

CREATE POLICY "Admins can update own company" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins techs can view company profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Admins can update company profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view company roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_in_company(auth.uid(), user_id)
  );

CREATE POLICY "Admins can insert company roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_in_company(auth.uid(), user_id)
  );

CREATE POLICY "Admins can update company roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_in_company(auth.uid(), user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_in_company(auth.uid(), user_id)
  );

CREATE POLICY "Admins can delete company roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_in_company(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "Authenticated can view equipment" ON public.equipment;
DROP POLICY IF EXISTS "Admins can insert equipment" ON public.equipment;
DROP POLICY IF EXISTS "Admins can update equipment" ON public.equipment;
DROP POLICY IF EXISTS "Admins can delete equipment" ON public.equipment;

CREATE POLICY "Authenticated can view equipment" ON public.equipment
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins can insert equipment" ON public.equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can update equipment" ON public.equipment
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete equipment" ON public.equipment
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins techs can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins can delete tickets" ON public.tickets;

CREATE POLICY "Authenticated can view tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Authenticated can create tickets" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can update tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete tickets" ON public.tickets
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Authenticated can add comments" ON public.ticket_comments;

CREATE POLICY "Authenticated can view comments" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (public.is_ticket_in_company(auth.uid(), ticket_id));

CREATE POLICY "Authenticated can add comments" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ticket_in_company(auth.uid(), ticket_id));

DROP POLICY IF EXISTS "Authenticated can view deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins techs can insert deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins techs can update deliveries" ON public.deliveries;

CREATE POLICY "Authenticated can view deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert deliveries" ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view backups" ON public.backups;
DROP POLICY IF EXISTS "Admins techs can insert backups" ON public.backups;
DROP POLICY IF EXISTS "Admins techs can update backups" ON public.backups;
DROP POLICY IF EXISTS "Admins can delete backups" ON public.backups;

CREATE POLICY "Authenticated can view backups" ON public.backups
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert backups" ON public.backups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update backups" ON public.backups
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete backups" ON public.backups
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view devices" ON public.devices;
DROP POLICY IF EXISTS "Admins techs can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Admins techs can update devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can delete devices" ON public.devices;

CREATE POLICY "Authenticated can view devices" ON public.devices
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert devices" ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update devices" ON public.devices
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete devices" ON public.devices
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view executions" ON public.script_executions;
DROP POLICY IF EXISTS "Admins techs can insert executions" ON public.script_executions;
DROP POLICY IF EXISTS "Admins techs can update executions" ON public.script_executions;

CREATE POLICY "Authenticated can view executions" ON public.script_executions
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert executions" ON public.script_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update executions" ON public.script_executions
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view logs" ON public.system_logs;
DROP POLICY IF EXISTS "Admins techs can insert logs" ON public.system_logs;

CREATE POLICY "Authenticated can view logs" ON public.system_logs
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view diagnostics" ON public.device_diagnostics;
DROP POLICY IF EXISTS "Admins techs can insert diagnostics" ON public.device_diagnostics;

CREATE POLICY "Authenticated can view diagnostics" ON public.device_diagnostics
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert diagnostics" ON public.device_diagnostics
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view email configs" ON public.email_configs;
DROP POLICY IF EXISTS "Admins techs can insert email configs" ON public.email_configs;
DROP POLICY IF EXISTS "Admins techs can update email configs" ON public.email_configs;
DROP POLICY IF EXISTS "Admins can delete email configs" ON public.email_configs;

CREATE POLICY "Authenticated can view email configs" ON public.email_configs
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert email configs" ON public.email_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update email configs" ON public.email_configs
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete email configs" ON public.email_configs
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view vpn configs" ON public.vpn_configs;
DROP POLICY IF EXISTS "Admins techs can insert vpn configs" ON public.vpn_configs;
DROP POLICY IF EXISTS "Admins techs can update vpn configs" ON public.vpn_configs;
DROP POLICY IF EXISTS "Admins can delete vpn configs" ON public.vpn_configs;

CREATE POLICY "Authenticated can view vpn configs" ON public.vpn_configs
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert vpn configs" ON public.vpn_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update vpn configs" ON public.vpn_configs
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete vpn configs" ON public.vpn_configs
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view firewall rules" ON public.firewall_rules;
DROP POLICY IF EXISTS "Admins techs can insert firewall rules" ON public.firewall_rules;
DROP POLICY IF EXISTS "Admins techs can update firewall rules" ON public.firewall_rules;
DROP POLICY IF EXISTS "Admins can delete firewall rules" ON public.firewall_rules;

CREATE POLICY "Authenticated can view firewall rules" ON public.firewall_rules
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert firewall rules" ON public.firewall_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update firewall rules" ON public.firewall_rules
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete firewall rules" ON public.firewall_rules
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view domains" ON public.firewall_domain_database;
DROP POLICY IF EXISTS "Admins can manage domains" ON public.firewall_domain_database;

CREATE POLICY "Authenticated can view domains" ON public.firewall_domain_database
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins can manage domains" ON public.firewall_domain_database
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_company_member(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "Authenticated can view blocked apps" ON public.blocked_applications;
DROP POLICY IF EXISTS "Admins techs can manage blocked apps" ON public.blocked_applications;

CREATE POLICY "Authenticated can view blocked apps" ON public.blocked_applications
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can manage blocked apps" ON public.blocked_applications
  FOR ALL TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view schedules" ON public.firewall_schedules;
DROP POLICY IF EXISTS "Admins techs can manage schedules" ON public.firewall_schedules;

CREATE POLICY "Authenticated can view schedules" ON public.firewall_schedules
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can manage schedules" ON public.firewall_schedules
  FOR ALL TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts;
DROP POLICY IF EXISTS "Service can insert bypass attempts" ON public.firewall_bypass_attempts;

CREATE POLICY "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Service can insert bypass attempts" ON public.firewall_bypass_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated can view articles" ON public.kb_articles;
DROP POLICY IF EXISTS "Admins techs can insert articles" ON public.kb_articles;
DROP POLICY IF EXISTS "Admins techs can update articles" ON public.kb_articles;
DROP POLICY IF EXISTS "Admins can delete articles" ON public.kb_articles;

CREATE POLICY "Authenticated can view articles" ON public.kb_articles
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins techs can insert articles" ON public.kb_articles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins techs can update articles" ON public.kb_articles
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can delete articles" ON public.kb_articles
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins can manage enrollment tokens" ON public.enrollment_tokens;
DROP POLICY IF EXISTS "Techs can view enrollment tokens" ON public.enrollment_tokens;

CREATE POLICY "Admins techs can view enrollment tokens" ON public.enrollment_tokens
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'technician'::public.app_role)
    )
  );

CREATE POLICY "Admins can manage enrollment tokens" ON public.enrollment_tokens
  FOR ALL TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.role_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.role_profiles;

CREATE POLICY "Authenticated can view profiles" ON public.role_profiles
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins can insert profiles" ON public.role_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can update profiles" ON public.role_profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can delete profiles" ON public.role_profiles
  FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can insert software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can update software" ON public.role_profile_software;
DROP POLICY IF EXISTS "Admins can delete software" ON public.role_profile_software;

CREATE POLICY "Authenticated can view software" ON public.role_profile_software
  FOR SELECT TO authenticated
  USING (public.is_role_profile_in_company(auth.uid(), profile_id));

CREATE POLICY "Admins can insert software" ON public.role_profile_software
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_role_profile_in_company(auth.uid(), profile_id)
  );

CREATE POLICY "Admins can update software" ON public.role_profile_software
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_role_profile_in_company(auth.uid(), profile_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_role_profile_in_company(auth.uid(), profile_id)
  );

CREATE POLICY "Admins can delete software" ON public.role_profile_software
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_role_profile_in_company(auth.uid(), profile_id)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.company_invitations;