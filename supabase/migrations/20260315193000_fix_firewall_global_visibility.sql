-- Restore visibility of global firewall catalogs (company_id IS NULL)
-- while keeping tenant isolation for company-scoped rows.

DROP POLICY IF EXISTS "Authenticated can view domains" ON public.firewall_domain_database;
CREATE POLICY "Authenticated can view domains" ON public.firewall_domain_database
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "Authenticated can view blocked apps" ON public.blocked_applications;
CREATE POLICY "Authenticated can view blocked apps" ON public.blocked_applications
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "Authenticated can view schedules" ON public.firewall_schedules;
CREATE POLICY "Authenticated can view schedules" ON public.firewall_schedules
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts;
CREATE POLICY "Authenticated can view bypass attempts" ON public.firewall_bypass_attempts
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );
