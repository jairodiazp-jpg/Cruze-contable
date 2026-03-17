
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
