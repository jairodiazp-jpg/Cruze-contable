
-- Enum for device health
CREATE TYPE public.device_health AS ENUM ('healthy', 'warning', 'critical', 'offline');

-- Enum for connection type
CREATE TYPE public.connection_type AS ENUM ('ethernet', 'wifi', 'vpn', 'unknown');

-- Enum for script execution status
CREATE TYPE public.script_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- Enum for log severity
CREATE TYPE public.log_severity AS ENUM ('info', 'warning', 'error', 'critical');

-- Devices table
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  hostname TEXT NOT NULL,
  serial_number TEXT,
  user_assigned TEXT,
  department TEXT,
  role_type TEXT DEFAULT 'usuario',
  operating_system TEXT,
  ip_address TEXT,
  connection_type public.connection_type DEFAULT 'unknown',
  vpn_status TEXT DEFAULT 'disconnected',
  last_seen TIMESTAMP WITH TIME ZONE,
  health_status public.device_health DEFAULT 'offline',
  agent_installed BOOLEAN DEFAULT false,
  agent_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Script executions table
CREATE TABLE public.script_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  script_name TEXT NOT NULL,
  script_type TEXT NOT NULL DEFAULT 'custom',
  script_content TEXT,
  status public.script_status DEFAULT 'pending',
  output TEXT,
  error_log TEXT,
  executed_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System logs table
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  severity public.log_severity DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Device diagnostics table
CREATE TABLE public.device_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  cpu_usage NUMERIC,
  ram_usage NUMERIC,
  disk_usage NUMERIC,
  internet_status TEXT,
  wifi_status TEXT,
  ethernet_status TEXT,
  dns_status TEXT,
  latency_ms NUMERIC,
  packet_loss NUMERIC,
  overall_health public.device_health DEFAULT 'healthy',
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Updated_at triggers
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_diagnostics ENABLE ROW LEVEL SECURITY;

-- Devices policies
CREATE POLICY "Authenticated can view devices" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update devices" ON public.devices FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete devices" ON public.devices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Script executions policies
CREATE POLICY "Authenticated can view executions" ON public.script_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert executions" ON public.script_executions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update executions" ON public.script_executions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));

-- System logs policies
CREATE POLICY "Authenticated can view logs" ON public.system_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert logs" ON public.system_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));

-- Diagnostics policies
CREATE POLICY "Authenticated can view diagnostics" ON public.device_diagnostics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert diagnostics" ON public.device_diagnostics FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));

-- Enable realtime for devices and logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.script_executions;
