-- =============================================================
-- Corporate domains, email accounts, and provisioning profiles
-- =============================================================
-- Strategy: additive-only — no existing table is modified.
-- All new tables carry company_id for multi-tenant isolation.
-- =============================================================

-- ─────────────────────────────────────────
-- 1. DOMAINS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corporate_domains (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_name  TEXT NOT NULL,
  display_name TEXT,
  provider     TEXT NOT NULL DEFAULT 'custom',   -- 'google', 'microsoft', 'custom'
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending','active','error'
  -- SSO preparation fields (nullable until configured)
  sso_enabled       BOOLEAN NOT NULL DEFAULT false,
  sso_metadata_url  TEXT,
  sso_entity_id     TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT corporate_domains_company_domain_unique UNIQUE (company_id, domain_name)
);

CREATE TRIGGER update_corporate_domains_updated_at
  BEFORE UPDATE ON public.corporate_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.corporate_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corp_dom_select" ON public.corporate_domains
  FOR SELECT TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_dom_insert" ON public.corporate_domains
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_dom_update" ON public.corporate_domains
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_dom_delete" ON public.corporate_domains
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- 2. EMAIL ACCOUNTS
-- ─────────────────────────────────────────
-- Stores corporate mailbox records.
-- Credentials are never stored in plaintext; password_hash holds
-- a bcrypt digest (or stays NULL for SSO-only accounts) and the
-- app layer is responsible for hashing before upsert.
CREATE TABLE IF NOT EXISTS public.corporate_email_accounts (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id     UUID REFERENCES public.corporate_domains(id) ON DELETE SET NULL,
  -- The full address is derived as local_part@domain_name but also denormalised
  -- here so queries don't need a join for display.
  email_address TEXT NOT NULL,
  local_part    TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  profile_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id     UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  provider      TEXT NOT NULL DEFAULT 'custom',  -- 'google','microsoft','smtp','custom'
  -- SMTP / IMAP connection settings (override provider defaults)
  smtp_host     TEXT,
  smtp_port     INTEGER,
  imap_host     TEXT,
  imap_port     INTEGER,
  use_tls       BOOLEAN NOT NULL DEFAULT true,
  -- Credentials: password_hash ONLY. Never plain-text.
  password_hash TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending','active','suspended','error'
  last_sync_at  TIMESTAMP WITH TIME ZONE,
  error_log     TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT corporate_email_accounts_unique_email UNIQUE (company_id, email_address)
);

CREATE TRIGGER update_corporate_email_accounts_updated_at
  BEFORE UPDATE ON public.corporate_email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.corporate_email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corp_email_select" ON public.corporate_email_accounts
  FOR SELECT TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_email_insert" ON public.corporate_email_accounts
  FOR INSERT TO authenticated WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'))
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_email_update" ON public.corporate_email_accounts
  FOR UPDATE TO authenticated USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technician'))
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "corp_email_delete" ON public.corporate_email_accounts
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- 3. PROVISIONING PROFILES
-- ─────────────────────────────────────────
-- Each record describes what gets configured when a device is
-- registered: domain join, email setup, software install list.
CREATE TABLE IF NOT EXISTS public.provisioning_profiles (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  os_target    TEXT NOT NULL DEFAULT 'windows', -- 'windows','linux','macos','all'
  domain_id    UUID REFERENCES public.corporate_domains(id) ON DELETE SET NULL,
  -- Software packages to install (free-form JSON array of {name, install_command})
  software_packages JSONB NOT NULL DEFAULT '[]',
  -- Extra PowerShell / Bash snippets appended to the generated script
  custom_ps_snippet   TEXT,
  custom_bash_snippet TEXT,
  auto_assign_email   BOOLEAN NOT NULL DEFAULT true,
  auto_join_domain    BOOLEAN NOT NULL DEFAULT false,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT provisioning_profiles_company_name_unique UNIQUE (company_id, name)
);

CREATE TRIGGER update_provisioning_profiles_updated_at
  BEFORE UPDATE ON public.provisioning_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.provisioning_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prov_prof_select" ON public.provisioning_profiles
  FOR SELECT TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "prov_prof_insert" ON public.provisioning_profiles
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "prov_prof_update" ON public.provisioning_profiles
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "prov_prof_delete" ON public.provisioning_profiles
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Realtime for the new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.corporate_domains;
ALTER PUBLICATION supabase_realtime ADD TABLE public.corporate_email_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.provisioning_profiles;
