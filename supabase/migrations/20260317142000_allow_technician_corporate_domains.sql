-- Allow technicians to create and update corporate domains.
-- This unblocks domain onboarding flow for technical operators.

DROP POLICY IF EXISTS "corp_dom_insert" ON public.corporate_domains;
CREATE POLICY "corp_dom_insert" ON public.corporate_domains
  FOR INSERT TO authenticated WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'))
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "corp_dom_update" ON public.corporate_domains;
CREATE POLICY "corp_dom_update" ON public.corporate_domains
  FOR UPDATE TO authenticated USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'))
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
