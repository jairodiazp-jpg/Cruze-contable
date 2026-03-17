
CREATE TABLE public.vpn_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  vpn_type TEXT NOT NULL DEFAULT 'openvpn',
  server_address TEXT NOT NULL,
  server_port INTEGER DEFAULT 1194,
  protocol TEXT DEFAULT 'udp',
  auth_type TEXT DEFAULT 'certificate',
  config_data TEXT,
  connection_status TEXT DEFAULT 'disconnected',
  last_connected_at TIMESTAMPTZ,
  assigned_ip TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_log TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vpn_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vpn configs" ON public.vpn_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert vpn configs" ON public.vpn_configs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update vpn configs" ON public.vpn_configs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete vpn configs" ON public.vpn_configs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vpn_configs_updated_at BEFORE UPDATE ON public.vpn_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.vpn_configs;
