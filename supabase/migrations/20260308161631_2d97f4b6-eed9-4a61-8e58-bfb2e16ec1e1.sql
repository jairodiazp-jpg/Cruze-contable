
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
