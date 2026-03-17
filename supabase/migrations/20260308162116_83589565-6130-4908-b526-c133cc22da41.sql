
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
