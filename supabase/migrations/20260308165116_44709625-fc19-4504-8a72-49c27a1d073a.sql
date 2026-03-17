
CREATE TABLE public.firewall_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  action TEXT NOT NULL DEFAULT 'allow',
  protocol TEXT NOT NULL DEFAULT 'tcp',
  port_start INTEGER NOT NULL,
  port_end INTEGER,
  source_ip TEXT,
  destination_ip TEXT,
  profile_id UUID REFERENCES public.role_profiles(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  error_log TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view firewall rules" ON public.firewall_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert firewall rules" ON public.firewall_rules FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update firewall rules" ON public.firewall_rules FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete firewall rules" ON public.firewall_rules FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_firewall_rules_updated_at BEFORE UPDATE ON public.firewall_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
