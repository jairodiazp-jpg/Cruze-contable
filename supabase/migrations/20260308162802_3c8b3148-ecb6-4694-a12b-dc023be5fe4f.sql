
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
