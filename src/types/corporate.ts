// ─────────────────────────────────────────────────────────────────────────────
// Shared domain types for the Corporate Provisioning module.
// These live in src/types/ to avoid coupling any service to any UI component.
// ─────────────────────────────────────────────────────────────────────────────

export type DomainProvider = "google" | "microsoft" | "custom";
export type DomainStatus   = "pending" | "active" | "error";
export type EmailProvider  = "google" | "microsoft" | "smtp" | "custom";
export type EmailStatus    = "pending" | "active" | "suspended" | "error";
export type OsTarget       = "windows" | "linux" | "macos" | "all";

export interface CorporateDomain {
  id: string;
  company_id: string;
  domain_name: string;
  display_name: string | null;
  provider: DomainProvider;
  status: DomainStatus;
  sso_enabled: boolean;
  sso_metadata_url: string | null;
  sso_entity_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorporateEmailAccount {
  id: string;
  company_id: string;
  domain_id: string | null;
  email_address: string;
  local_part: string;
  display_name: string;
  profile_user_id: string | null;
  device_id: string | null;
  provider: EmailProvider;
  smtp_host: string | null;
  smtp_port: number | null;
  imap_host: string | null;
  imap_port: number | null;
  use_tls: boolean;
  status: EmailStatus;
  last_sync_at: string | null;
  error_log: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoftwarePackage {
  name: string;
  install_command: string;
}

export interface ProvisioningProfile {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  os_target: OsTarget;
  domain_id: string | null;
  software_packages: SoftwarePackage[];
  custom_ps_snippet: string | null;
  custom_bash_snippet: string | null;
  auto_assign_email: boolean;
  auto_join_domain: boolean;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs used by service layer ────────────────────────────────────────────────

export interface CreateDomainDto {
  company_id: string;
  domain_name: string;
  display_name?: string;
  provider?: DomainProvider;
  notes?: string;
  created_by?: string;
}

export interface UpdateDomainDto {
  display_name?: string;
  provider?: DomainProvider;
  status?: DomainStatus;
  sso_enabled?: boolean;
  sso_metadata_url?: string | null;
  sso_entity_id?: string | null;
  notes?: string;
}

export interface CreateEmailAccountDto {
  company_id: string;
  domain_id?: string | null;
  email_address: string;
  local_part: string;
  display_name: string;
  profile_user_id?: string | null;
  device_id?: string | null;
  provider?: EmailProvider;
  smtp_host?: string | null;
  smtp_port?: number | null;
  imap_host?: string | null;
  imap_port?: number | null;
  use_tls?: boolean;
  password_hash?: string | null;
  created_by?: string;
}

export interface UpdateEmailAccountDto {
  display_name?: string;
  device_id?: string | null;
  profile_user_id?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  imap_host?: string | null;
  imap_port?: number | null;
  use_tls?: boolean;
  status?: EmailStatus;
  password_hash?: string | null;
}

export interface CreateProvisioningProfileDto {
  company_id: string;
  name: string;
  description?: string;
  os_target?: OsTarget;
  domain_id?: string | null;
  software_packages?: SoftwarePackage[];
  custom_ps_snippet?: string | null;
  custom_bash_snippet?: string | null;
  auto_assign_email?: boolean;
  auto_join_domain?: boolean;
  is_default?: boolean;
  created_by?: string;
}

export interface UpdateProvisioningProfileDto {
  name?: string;
  description?: string | null;
  os_target?: OsTarget;
  domain_id?: string | null;
  software_packages?: SoftwarePackage[];
  custom_ps_snippet?: string | null;
  custom_bash_snippet?: string | null;
  auto_assign_email?: boolean;
  auto_join_domain?: boolean;
  is_default?: boolean;
}

// ── Provider SMTP/IMAP defaults ───────────────────────────────────────────────

export const EMAIL_PROVIDER_DEFAULTS: Record<
  EmailProvider,
  { smtp_host: string; smtp_port: number; imap_host: string; imap_port: number }
> = {
  google: {
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    imap_host: "imap.gmail.com",
    imap_port: 993,
  },
  microsoft: {
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    imap_host: "outlook.office365.com",
    imap_port: 993,
  },
  smtp: {
    smtp_host: "",
    smtp_port: 587,
    imap_host: "",
    imap_port: 993,
  },
  custom: {
    smtp_host: "",
    smtp_port: 587,
    imap_host: "",
    imap_port: 993,
  },
};
