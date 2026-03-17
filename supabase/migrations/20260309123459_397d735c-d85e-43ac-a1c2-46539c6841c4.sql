
-- Domain database for category-based blocking
CREATE TABLE public.firewall_domain_database (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, domain)
);

ALTER TABLE public.firewall_domain_database ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view domains" ON public.firewall_domain_database
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage domains" ON public.firewall_domain_database
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Blocked applications table
CREATE TABLE public.blocked_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL,
  process_name text NOT NULL,
  category text DEFAULT 'general',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(process_name)
);

ALTER TABLE public.blocked_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view blocked apps" ON public.blocked_applications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins techs can manage blocked apps" ON public.blocked_applications
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role));

-- Firewall schedules table
CREATE TABLE public.firewall_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firewall_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view schedules" ON public.firewall_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins techs can manage schedules" ON public.firewall_schedules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role));

-- Bypass attempts log
CREATE TABLE public.firewall_bypass_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  attempt_type text NOT NULL,
  details jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firewall_bypass_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service can insert bypass attempts" ON public.firewall_bypass_attempts
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role));

-- Enable realtime for bypass attempts
ALTER PUBLICATION supabase_realtime ADD TABLE public.firewall_bypass_attempts;
