-- Bootstrap completo generado desde supabase/migrations
-- Fecha: 2026-03-14


-- ==============================================
-- BEGIN 20260307180056_06c32f5d-b08a-4afa-a337-4b05c1bc7154.sql
-- ==============================================

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'technician', 'user');

-- Create enum for equipment status
CREATE TYPE public.equipment_status AS ENUM ('disponible', 'asignado', 'mantenimiento', 'retirado');

-- Create enum for equipment type
CREATE TYPE public.equipment_type AS ENUM ('laptop', 'desktop', 'monitor', 'impresora', 'telefono', 'tablet', 'otro');

-- Create enum for ticket status
CREATE TYPE public.ticket_status AS ENUM ('abierto', 'en_proceso', 'en_espera', 'resuelto', 'cerrado');

-- Create enum for ticket priority
CREATE TYPE public.ticket_priority AS ENUM ('baja', 'media', 'alta', 'critica');

-- Create enum for ticket category
CREATE TYPE public.ticket_category AS ENUM ('hardware', 'software', 'red', 'acceso', 'otro');

-- Create enum for delivery status
CREATE TYPE public.delivery_status AS ENUM ('entregado', 'devuelto');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Equipment table
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  serial TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  type equipment_type NOT NULL DEFAULT 'otro',
  ram TEXT,
  storage TEXT,
  os TEXT,
  status equipment_status NOT NULL DEFAULT 'disponible',
  location TEXT,
  assigned_to TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  requester TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  category ticket_category NOT NULL DEFAULT 'otro',
  priority ticket_priority NOT NULL DEFAULT 'media',
  subject TEXT NOT NULL,
  description TEXT,
  assigned_tech TEXT,
  status ticket_status NOT NULL DEFAULT 'abierto',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket comments
CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliveries table
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL,
  department TEXT,
  position TEXT,
  equipment_id UUID REFERENCES public.equipment(id),
  equipment_desc TEXT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  observations TEXT,
  status delivery_status NOT NULL DEFAULT 'entregado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge base articles
CREATE TABLE public.kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  solution TEXT,
  category TEXT,
  author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sequence generators for readable codes
CREATE SEQUENCE IF NOT EXISTS equipment_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS delivery_code_seq START 1;

-- RLS Policies

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User roles: only admins can manage
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Equipment: authenticated users can read, admins/techs can modify
CREATE POLICY "Authenticated can view equipment" ON public.equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert equipment" ON public.equipment FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can update equipment" ON public.equipment FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete equipment" ON public.equipment FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Tickets: authenticated can read, users can create, admins/techs can modify
CREATE POLICY "Authenticated can view tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins techs can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Ticket comments
CREATE POLICY "Authenticated can view comments" ON public.ticket_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add comments" ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (true);

-- Deliveries
CREATE POLICY "Authenticated can view deliveries" ON public.deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert deliveries" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update deliveries" ON public.deliveries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));

-- KB Articles: all authenticated can read, admins/techs can modify
CREATE POLICY "Authenticated can view articles" ON public.kb_articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert articles" ON public.kb_articles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update articles" ON public.kb_articles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete articles" ON public.kb_articles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- END 20260307180056_06c32f5d-b08a-4afa-a337-4b05c1bc7154.sql


-- ==============================================
-- BEGIN 20260307180116_30b048bc-eb29-440c-aede-69f312fc4d53.sql
-- ==============================================

-- Fix permissive INSERT policies by requiring auth.uid() is not null
DROP POLICY "Authenticated can create tickets" ON public.tickets;
CREATE POLICY "Authenticated can create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Authenticated can add comments" ON public.ticket_comments;
CREATE POLICY "Authenticated can add comments" ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- END 20260307180116_30b048bc-eb29-440c-aede-69f312fc4d53.sql


-- ==============================================
-- BEGIN 20260308001834_d80798ca-96b7-494e-9142-63501e2f9f5d.sql
-- ==============================================

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

-- END 20260308001834_d80798ca-96b7-494e-9142-63501e2f9f5d.sql


-- ==============================================
-- BEGIN 20260308161631_2d97f4b6-eed9-4a61-8e58-bfb2e16ec1e1.sql
-- ==============================================

-- Table for role profiles
CREATE TABLE public.role_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  permissions_level text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table for software items associated with each profile
CREATE TABLE public.role_profile_software (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.role_profiles(id) ON DELETE CASCADE NOT NULL,
  software_name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  install_command text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_profile_software ENABLE ROW LEVEL SECURITY;

-- RLS policies for role_profiles
CREATE POLICY "Authenticated can view profiles" ON public.role_profiles FOR SELECT USING (true);
CREATE POLICY "Admins can insert profiles" ON public.role_profiles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update profiles" ON public.role_profiles FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete profiles" ON public.role_profiles FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- RLS policies for role_profile_software
CREATE POLICY "Authenticated can view software" ON public.role_profile_software FOR SELECT USING (true);
CREATE POLICY "Admins can insert software" ON public.role_profile_software FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update software" ON public.role_profile_software FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete software" ON public.role_profile_software FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Seed default profiles
INSERT INTO public.role_profiles (name, display_name, description, permissions_level) VALUES
  ('practicante', 'Practicante', 'Perfil para practicantes con herramientas básicas y permisos estándar', 'standard'),
  ('tecnico', 'Técnico', 'Perfil para técnicos con herramientas de soporte y permisos de administrador local', 'local_admin'),
  ('profesional', 'Profesional', 'Perfil para profesionales con herramientas especializadas, VPN y correo corporativo', 'standard');

-- Seed software for Practicante
INSERT INTO public.role_profile_software (profile_id, software_name, category, install_command, is_required)
SELECT rp.id, s.software_name, s.category, s.install_command, s.is_required
FROM public.role_profiles rp,
(VALUES
  ('Google Chrome', 'navegador', 'winget install Google.Chrome --silent', true),
  ('Microsoft Office', 'suite_office', 'winget install Microsoft.Office --silent', true),
  ('7-Zip', 'utilidades', 'winget install 7zip.7zip --silent', true),
  ('Adobe Acrobat Reader', 'utilidades', 'winget install Adobe.Acrobat.Reader.64-bit --silent', true)
) AS s(software_name, category, install_command, is_required)
WHERE rp.name = 'practicante';

-- Seed software for Técnico
INSERT INTO public.role_profile_software (profile_id, software_name, category, install_command, is_required)
SELECT rp.id, s.software_name, s.category, s.install_command, s.is_required
FROM public.role_profiles rp,
(VALUES
  ('Google Chrome', 'navegador', 'winget install Google.Chrome --silent', true),
  ('Microsoft Office', 'suite_office', 'winget install Microsoft.Office --silent', true),
  ('AnyDesk', 'soporte_remoto', 'winget install AnyDesk.AnyDesk --silent', true),
  ('PuTTY', 'red', 'winget install PuTTY.PuTTY --silent', true),
  ('Wireshark', 'red', 'winget install WiresharkFoundation.Wireshark --silent', false),
  ('Advanced IP Scanner', 'red', 'winget install Famatech.AdvancedIPScanner --silent', true),
  ('Notepad++', 'utilidades', 'winget install Notepad++.Notepad++ --silent', true)
) AS s(software_name, category, install_command, is_required)
WHERE rp.name = 'tecnico';

-- Seed software for Profesional
INSERT INTO public.role_profile_software (profile_id, software_name, category, install_command, is_required)
SELECT rp.id, s.software_name, s.category, s.install_command, s.is_required
FROM public.role_profiles rp,
(VALUES
  ('Google Chrome', 'navegador', 'winget install Google.Chrome --silent', true),
  ('Microsoft Office', 'suite_office', 'winget install Microsoft.Office --silent', true),
  ('Microsoft Teams', 'comunicacion', 'winget install Microsoft.Teams --silent', true),
  ('OneDrive', 'almacenamiento', 'winget install Microsoft.OneDrive --silent', true),
  ('FortiClient VPN', 'vpn', 'winget install Fortinet.FortiClientVPN --silent', true),
  ('Outlook', 'correo', 'winget install Microsoft.Outlook --silent', true),
  ('Adobe Acrobat Reader', 'utilidades', 'winget install Adobe.Acrobat.Reader.64-bit --silent', true)
) AS s(software_name, category, install_command, is_required)
WHERE rp.name = 'profesional';

-- Enable realtime for role_profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_profiles;

-- END 20260308161631_2d97f4b6-eed9-4a61-8e58-bfb2e16ec1e1.sql


-- ==============================================
-- BEGIN 20260308162116_83589565-6130-4908-b526-c133cc22da41.sql
-- ==============================================

-- Backups metadata table
CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  hostname text NOT NULL,
  backup_date date NOT NULL DEFAULT CURRENT_DATE,
  folders text[] NOT NULL DEFAULT '{}',
  total_size_bytes bigint NOT NULL DEFAULT 0,
  file_count integer NOT NULL DEFAULT 0,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  error_log text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view backups" ON public.backups FOR SELECT USING (true);
CREATE POLICY "Admins techs can insert backups" ON public.backups FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update backups" ON public.backups FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete backups" ON public.backups FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Storage bucket for backups
INSERT INTO storage.buckets (id, name, public) VALUES ('backups', 'backups', false);

-- Storage RLS: authenticated users can read
CREATE POLICY "Authenticated can read backups" ON storage.objects FOR SELECT USING (bucket_id = 'backups' AND auth.uid() IS NOT NULL);
-- Admins/techs can upload
CREATE POLICY "Admins techs can upload backups" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'backups' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician')));
-- Admins can delete backup files
CREATE POLICY "Admins can delete backup files" ON storage.objects FOR DELETE USING (bucket_id = 'backups' AND has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.backups;

-- END 20260308162116_83589565-6130-4908-b526-c133cc22da41.sql


-- ==============================================
-- BEGIN 20260308162802_3c8b3148-ecb6-4694-a12b-dc023be5fe4f.sql
-- ==============================================

-- Email provisioning configurations
CREATE TABLE public.email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  display_name text NOT NULL,
  provider text NOT NULL DEFAULT 'outlook',
  domain text NOT NULL,
  imap_server text,
  imap_port integer DEFAULT 993,
  smtp_server text,
  smtp_port integer DEFAULT 587,
  exchange_server text,
  use_exchange boolean DEFAULT false,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  error_log text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view email configs" ON public.email_configs FOR SELECT USING (true);
CREATE POLICY "Admins techs can insert email configs" ON public.email_configs FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update email configs" ON public.email_configs FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete email configs" ON public.email_configs FOR DELETE USING (has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.email_configs;

-- END 20260308162802_3c8b3148-ecb6-4694-a12b-dc023be5fe4f.sql


-- ==============================================
-- BEGIN 20260308164830_7509d3e0-ce85-4b90-8e5a-de97cc020de9.sql
-- ==============================================

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

-- END 20260308164830_7509d3e0-ce85-4b90-8e5a-de97cc020de9.sql


-- ==============================================
-- BEGIN 20260308165116_44709625-fc19-4504-8a72-49c27a1d073a.sql
-- ==============================================

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

-- END 20260308165116_44709625-fc19-4504-8a72-49c27a1d073a.sql


-- ==============================================
-- BEGIN 20260308173503_230d7e1b-bd5f-4569-be4d-cfa0945b6b96.sql
-- ==============================================
UPDATE public.user_roles SET role = 'admin' WHERE user_id = '391e95e6-1053-4601-b980-2a898e95db92';

-- END 20260308173503_230d7e1b-bd5f-4569-be4d-cfa0945b6b96.sql


-- ==============================================
-- BEGIN 20260308215045_cd4023dc-99f6-4674-bee1-e42299ce2c55.sql
-- ==============================================

CREATE TABLE public.enrollment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_by_device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.enrollment_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage enrollment tokens"
ON public.enrollment_tokens FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Techs can view enrollment tokens"
ON public.enrollment_tokens FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'technician'::app_role));

-- END 20260308215045_cd4023dc-99f6-4674-bee1-e42299ce2c55.sql


-- ==============================================
-- BEGIN 20260309003220_e7cca0dc-d1b6-4c3e-af97-3c348afde90a.sql
-- ==============================================
ALTER TABLE public.devices ADD COLUMN report_interval integer NOT NULL DEFAULT 60;

-- END 20260309003220_e7cca0dc-d1b6-4c3e-af97-3c348afde90a.sql


-- ==============================================
-- BEGIN 20260309123459_397d735c-d85e-43ac-a1c2-46539c6841c4.sql
-- ==============================================

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

-- END 20260309123459_397d735c-d85e-43ac-a1c2-46539c6841c4.sql


-- ==============================================
-- BEGIN 20260310004819_217874e2-f562-463a-8780-706471e7ded7.sql
-- ==============================================

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

-- END 20260310004819_217874e2-f562-463a-8780-706471e7ded7.sql


-- ==============================================
-- BEGIN 20260314101500_b9f0f2c3_agent_orchestration_queue.sql
-- ==============================================
-- Agent orchestration and async queue foundations for SaaS multi-tenant scale

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  agent_type text NOT NULL CHECK (agent_type IN ('planning-agent', 'automation-agent', 'scraping-agent', 'analysis-agent', 'notification-agent')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agent_tasks_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('planning-agent', 'automation-agent', 'scraping-agent', 'analysis-agent', 'notification-agent')),
  task_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tasks_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  agent_type text NOT NULL,
  run_status text NOT NULL DEFAULT 'running' CHECK (run_status IN ('running', 'completed', 'failed', 'cancelled')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  input_payload jsonb,
  output_payload jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'webhook')),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  read_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agents_company_id ON public.agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_status ON public.agent_tasks_queue(company_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_priority ON public.agent_tasks_queue(company_id, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_company_id ON public.agent_runs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company_user ON public.notifications(company_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_company_metric_time ON public.analytics(company_id, metric_name, captured_at DESC);

-- High-impact indexes for existing multi-tenant tables
CREATE INDEX IF NOT EXISTS idx_devices_company_id ON public.devices(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_company_id ON public.system_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_company_id ON public.script_executions(company_id);
CREATE INDEX IF NOT EXISTS idx_backups_company_id ON public.backups(company_id);

-- RLS policies
CREATE POLICY "Users can view company agents" ON public.agents
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage company agents" ON public.agents
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Users can view own company queued tasks" ON public.agent_tasks_queue
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage own company queued tasks" ON public.agent_tasks_queue
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Users can view own company agent runs" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert agent runs" ON public.agent_runs
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view own company notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view own company analytics" ON public.analytics
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert analytics" ON public.analytics
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enqueue_agent_task(
  p_company_id uuid,
  p_agent_type text,
  p_task_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_priority integer DEFAULT 5,
  p_scheduled_for timestamptz DEFAULT now(),
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  INSERT INTO public.agent_tasks_queue (
    company_id,
    agent_type,
    task_type,
    payload,
    priority,
    scheduled_for,
    created_by
  ) VALUES (
    p_company_id,
    p_agent_type,
    p_task_type,
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_priority, 5),
    COALESCE(p_scheduled_for, now()),
    p_created_by
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_task(uuid, text, text, jsonb, integer, timestamptz, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics;

-- END 20260314101500_b9f0f2c3_agent_orchestration_queue.sql


-- ==============================================
-- BEGIN 20260314112000_3f4a2d11_agent_api_rate_limit.sql
-- ==============================================
create extension if not exists pgcrypto;

create table if not exists public.agent_api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('user', 'agent', 'ip')),
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key_hash)
);

create index if not exists idx_agent_api_rate_limits_scope_window
  on public.agent_api_rate_limits (scope, window_started_at);

create or replace function public.consume_agent_api_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_key_hash text := encode(digest(p_key, 'sha256'), 'hex');
  v_record public.agent_api_rate_limits%rowtype;
  v_remaining integer;
  v_retry_after integer;
begin
  if p_scope not in ('user', 'agent', 'ip') then
    return jsonb_build_object('allowed', false, 'error', 'invalid_scope');
  end if;

  if p_limit <= 0 or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', false, 'error', 'invalid_limit_window');
  end if;

  select *
    into v_record
    from public.agent_api_rate_limits
   where scope = p_scope
     and key_hash = v_key_hash
   for update;

  if not found then
    insert into public.agent_api_rate_limits (scope, key_hash, window_started_at, request_count)
    values (p_scope, v_key_hash, v_now, 1)
    returning * into v_record;

    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(p_limit - 1, 0),
      'retry_after_seconds', 0
    );
  end if;

  if v_record.window_started_at < v_window_start then
    update public.agent_api_rate_limits
       set window_started_at = v_now,
           request_count = 1,
           updated_at = v_now
     where id = v_record.id
     returning * into v_record;

    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(p_limit - 1, 0),
      'retry_after_seconds', 0
    );
  end if;

  if v_record.request_count < p_limit then
    update public.agent_api_rate_limits
       set request_count = request_count + 1,
           updated_at = v_now
     where id = v_record.id
     returning * into v_record;

    v_remaining := greatest(p_limit - v_record.request_count, 0);

    return jsonb_build_object(
      'allowed', true,
      'remaining', v_remaining,
      'retry_after_seconds', 0
    );
  end if;

  v_retry_after := greatest(
    p_window_seconds - extract(epoch from (v_now - v_record.window_started_at))::integer,
    1
  );

  return jsonb_build_object(
    'allowed', false,
    'remaining', 0,
    'retry_after_seconds', v_retry_after
  );
end;
$$;

revoke all on function public.consume_agent_api_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_agent_api_rate_limit(text, text, integer, integer) to service_role;

-- END 20260314112000_3f4a2d11_agent_api_rate_limit.sql


-- ==============================================
-- BEGIN 20260314133000_performance_composite_indexes.sql
-- ==============================================
-- Composite indexes to improve common multi-tenant reads and sort patterns.

CREATE INDEX IF NOT EXISTS idx_tickets_company_status_created_at
  ON public.tickets(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_company_priority_created_at
  ON public.tickets(company_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_company_health_last_seen
  ON public.devices(company_id, health_status, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_devices_company_created_at
  ON public.devices(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_executions_company_created_at
  ON public.script_executions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_company_status_created_at
  ON public.backups(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_company_category_created_at
  ON public.system_logs(company_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_read_created_at
  ON public.notifications(company_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_company_captured_at
  ON public.analytics(company_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_status_priority_created_at
  ON public.agent_tasks_queue(company_id, status, priority, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_schedule
  ON public.agent_tasks_queue(company_id, status, scheduled_for ASC);

-- END 20260314133000_performance_composite_indexes.sql


-- ==============================================
-- BEGIN 20260314150000_autonomous_agents_architecture.sql
-- ==============================================
-- Autonomous multi-agent architecture: workflow orchestration, inter-agent communication, and audit-ready execution.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agents_agent_type_check'
      AND conrelid = 'public.agents'::regclass
  ) THEN
    ALTER TABLE public.agents DROP CONSTRAINT agents_agent_type_check;
  END IF;
END;
$$;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_agent_type_check
  CHECK (
    agent_type IN (
      'planning-agent',
      'execution-agent',
      'evaluation-agent',
      'automation-agent',
      'scraping-agent',
      'analysis-agent',
      'notification-agent'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_tasks_queue_agent_type_check'
      AND conrelid = 'public.agent_tasks_queue'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks_queue DROP CONSTRAINT agent_tasks_queue_agent_type_check;
  END IF;
END;
$$;

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_agent_type_check
  CHECK (
    agent_type IN (
      'planning-agent',
      'execution-agent',
      'evaluation-agent',
      'automation-agent',
      'scraping-agent',
      'analysis-agent',
      'notification-agent'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_tasks_queue_status_check'
      AND conrelid = 'public.agent_tasks_queue'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks_queue DROP CONSTRAINT agent_tasks_queue_status_check;
  END IF;
END;
$$;

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE public.agent_tasks_queue
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depends_on_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  root_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  workflow_name text NOT NULL,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_task_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  from_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  to_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  message_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_workflow_status
  ON public.agent_tasks_queue(company_id, workflow_id, status, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_parent
  ON public.agent_tasks_queue(company_id, parent_task_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_company_status
  ON public.agent_workflows(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_workflow_time
  ON public.agent_task_messages(company_id, workflow_id, created_at DESC);

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_workflow_fk
  FOREIGN KEY (workflow_id)
  REFERENCES public.agent_workflows(id)
  ON DELETE CASCADE;

CREATE POLICY "Users can view own company workflows" ON public.agent_workflows
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage own company workflows" ON public.agent_workflows
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Service role can manage workflows" ON public.agent_workflows
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own company task messages" ON public.agent_task_messages
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can manage task messages" ON public.agent_task_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enqueue_agent_workflow(
  p_company_id uuid,
  p_goal text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_task_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  IF p_goal IS NULL OR length(trim(p_goal)) = 0 THEN
    RAISE EXCEPTION 'goal is required';
  END IF;

  INSERT INTO public.agent_workflows (
    company_id,
    workflow_name,
    goal,
    status,
    context,
    created_by,
    started_at,
    updated_at
  ) VALUES (
    p_company_id,
    'autonomous-workflow',
    p_goal,
    'pending',
    COALESCE(p_payload, '{}'::jsonb),
    p_created_by,
    now(),
    now()
  )
  RETURNING id INTO v_workflow_id;

  INSERT INTO public.agent_tasks_queue (
    company_id,
    workflow_id,
    agent_type,
    task_type,
    payload,
    priority,
    status,
    created_by,
    scheduled_for,
    updated_at
  ) VALUES (
    p_company_id,
    v_workflow_id,
    'planning-agent',
    'plan_workflow',
    jsonb_build_object('goal', p_goal, 'context', COALESCE(p_payload, '{}'::jsonb)),
    1,
    'pending',
    p_created_by,
    now(),
    now()
  )
  RETURNING id INTO v_task_id;

  UPDATE public.agent_workflows
  SET root_task_id = v_task_id,
      updated_at = now()
  WHERE id = v_workflow_id;

  RETURN v_workflow_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_workflow(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_agent_workflow(uuid, text, jsonb, uuid) TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_workflows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_task_messages;

-- END 20260314150000_autonomous_agents_architecture.sql


-- ==============================================
-- BEGIN 20260314164000_script_execution_correlation_envelope.sql
-- ==============================================
-- Correlation envelope for agent action execution safety.
-- Adds ticket/action correlation and anti-replay controls.

ALTER TABLE public.script_executions
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS action_nonce text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text),
  ADD COLUMN IF NOT EXISTS action_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS nonce_consumed_at timestamptz;

-- Ensure legacy rows are backfilled deterministically.
UPDATE public.script_executions
SET
  action_id = COALESCE(action_id, gen_random_uuid()),
  action_nonce = COALESCE(action_nonce, md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text)),
  action_expires_at = COALESCE(action_expires_at, created_at + interval '30 minutes')
WHERE action_id IS NULL OR action_nonce IS NULL OR action_expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_executions_action_id
  ON public.script_executions(action_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_executions_action_nonce
  ON public.script_executions(action_nonce);

CREATE INDEX IF NOT EXISTS idx_script_executions_ticket_company
  ON public.script_executions(ticket_id, company_id);

CREATE INDEX IF NOT EXISTS idx_script_executions_nonce_consumed
  ON public.script_executions(nonce_consumed_at);

-- END 20260314164000_script_execution_correlation_envelope.sql

