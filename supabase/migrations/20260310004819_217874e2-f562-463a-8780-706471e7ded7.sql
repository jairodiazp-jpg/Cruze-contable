
-- =============================================
-- MULTI-TENANT: Companies table
-- =============================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  domain text,
  plan text NOT NULL DEFAULT 'basic',
  max_devices integer NOT NULL DEFAULT 50,
  max_users integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Add company_id to profiles
-- =============================================
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- =============================================
-- Security definer function to get user's company
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id
$$;

-- =============================================
-- Add company_id to all existing tables
-- =============================================
ALTER TABLE public.devices ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.equipment ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.deliveries ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.backups ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.system_logs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.script_executions ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.device_diagnostics ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.email_configs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.vpn_configs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.firewall_rules ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.firewall_domain_database ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.blocked_applications ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.firewall_schedules ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.firewall_bypass_attempts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.kb_articles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.enrollment_tokens ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.role_profiles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- =============================================
-- Licenses table (NEW)
-- =============================================
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  product text NOT NULL,
  license_key text NOT NULL,
  license_type text NOT NULL DEFAULT 'retail',
  assigned_device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  assigned_user text,
  status text NOT NULL DEFAULT 'available',
  activation_date date,
  expiration_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS for companies
-- =============================================
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- RLS for licenses
-- =============================================
CREATE POLICY "Users can view company licenses" ON public.licenses
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins techs can manage licenses" ON public.licenses
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
    AND company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
    AND company_id = get_user_company_id(auth.uid())
  );

-- =============================================
-- UPDATE existing RLS policies to include company_id filtering
-- =============================================

-- DEVICES: Update SELECT policy
DROP POLICY IF EXISTS "Authenticated can view devices" ON public.devices;
CREATE POLICY "Authenticated can view devices" ON public.devices
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- TICKETS: Update SELECT policy  
DROP POLICY IF EXISTS "Authenticated can view tickets" ON public.tickets;
CREATE POLICY "Authenticated can view tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- EQUIPMENT
DROP POLICY IF EXISTS "Authenticated can view equipment" ON public.equipment;
CREATE POLICY "Authenticated can view equipment" ON public.equipment
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- DELIVERIES
DROP POLICY IF EXISTS "Authenticated can view deliveries" ON public.deliveries;
CREATE POLICY "Authenticated can view deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- BACKUPS
DROP POLICY IF EXISTS "Authenticated can view backups" ON public.backups;
CREATE POLICY "Authenticated can view backups" ON public.backups
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- SYSTEM LOGS
DROP POLICY IF EXISTS "Authenticated can view logs" ON public.system_logs;
CREATE POLICY "Authenticated can view logs" ON public.system_logs
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- SCRIPT EXECUTIONS
DROP POLICY IF EXISTS "Authenticated can view executions" ON public.script_executions;
CREATE POLICY "Authenticated can view executions" ON public.script_executions
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- DEVICE DIAGNOSTICS
DROP POLICY IF EXISTS "Authenticated can view diagnostics" ON public.device_diagnostics;
CREATE POLICY "Authenticated can view diagnostics" ON public.device_diagnostics
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- EMAIL CONFIGS
DROP POLICY IF EXISTS "Authenticated can view email configs" ON public.email_configs;
CREATE POLICY "Authenticated can view email configs" ON public.email_configs
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- VPN CONFIGS
DROP POLICY IF EXISTS "Authenticated can view vpn configs" ON public.vpn_configs;
CREATE POLICY "Authenticated can view vpn configs" ON public.vpn_configs
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- FIREWALL RULES
DROP POLICY IF EXISTS "Authenticated can view firewall rules" ON public.firewall_rules;
CREATE POLICY "Authenticated can view firewall rules" ON public.firewall_rules
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- FIREWALL DOMAIN DATABASE
DROP POLICY IF EXISTS "Authenticated can view domains" ON public.firewall_domain_database;
CREATE POLICY "Authenticated can view domains" ON public.firewall_domain_database
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- BLOCKED APPLICATIONS
DROP POLICY IF EXISTS "Authenticated can view blocked apps" ON public.blocked_applications;
CREATE POLICY "Authenticated can view blocked apps" ON public.blocked_applications
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- FIREWALL SCHEDULES
DROP POLICY IF EXISTS "Authenticated can view schedules" ON public.firewall_schedules;
CREATE POLICY "Authenticated can view schedules" ON public.firewall_schedules
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- FIREWALL BYPASS ATTEMPTS
DROP POLICY IF EXISTS "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts;
CREATE POLICY "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- KB ARTICLES
DROP POLICY IF EXISTS "Authenticated can view articles" ON public.kb_articles;
CREATE POLICY "Authenticated can view articles" ON public.kb_articles
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- ENROLLMENT TOKENS
DROP POLICY IF EXISTS "Techs can view enrollment tokens" ON public.enrollment_tokens;
CREATE POLICY "Techs can view enrollment tokens" ON public.enrollment_tokens
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'technician'::app_role)
    AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
  );

-- ROLE PROFILES
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.role_profiles;
CREATE POLICY "Authenticated can view profiles" ON public.role_profiles
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));

-- Enable realtime for licenses
ALTER PUBLICATION supabase_realtime ADD TABLE public.licenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
