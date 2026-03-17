// ─────────────────────────────────────────────────────────────────────────────
// emailAccountService.ts — Repository-style service for corporate email accounts.
//
// Security note: this layer NEVER receives or stores plain-text passwords.
// The caller is expected to hash passwords via the browser's SubtleCrypto API
// (or skip the field for SSO accounts).  The `password_hash` column is
// write-only from the client: it is never returned in SELECT results when the
// Supabase security-definer view strips it (see migration).  For now, the
// field is treated as opaque from this service's perspective.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type {
  CorporateEmailAccount,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from "@/types/corporate";

const TABLE = "corporate_email_accounts" as const;

export async function listEmailAccounts(
  companyId: string,
): Promise<CorporateEmailAccount[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select(
      "id,company_id,domain_id,email_address,local_part,display_name," +
      "profile_user_id,device_id,provider,smtp_host,smtp_port," +
      "imap_host,imap_port,use_tls,status,last_sync_at,error_log," +
      "created_by,created_at,updated_at",
    )
    .eq("company_id", companyId)
    .order("email_address");

  if (error) throw new Error(error.message);
  return (data ?? []) as CorporateEmailAccount[];
}

export async function createEmailAccount(
  dto: CreateEmailAccountDto,
): Promise<CorporateEmailAccount> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert(dto)
    .select(
      "id,company_id,domain_id,email_address,local_part,display_name," +
      "profile_user_id,device_id,provider,smtp_host,smtp_port," +
      "imap_host,imap_port,use_tls,status,last_sync_at,error_log," +
      "created_by,created_at,updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return data as CorporateEmailAccount;
}

export async function updateEmailAccount(
  id: string,
  dto: UpdateEmailAccountDto,
): Promise<CorporateEmailAccount> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .update(dto)
    .eq("id", id)
    .select(
      "id,company_id,domain_id,email_address,local_part,display_name," +
      "profile_user_id,device_id,provider,smtp_host,smtp_port," +
      "imap_host,imap_port,use_tls,status,last_sync_at,error_log," +
      "created_by,created_at,updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return data as CorporateEmailAccount;
}

export async function deleteEmailAccount(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Derive the full email address from a local part and a domain name.
 * Validates that both parts are non-empty and that the local part
 * contains no characters that are invalid in RFC 5322 addresses.
 */
export function buildEmailAddress(localPart: string, domainName: string): string {
  const clean = localPart.trim().toLowerCase();
  if (!/^[a-z0-9._%+\-]+$/.test(clean)) {
    throw new Error(
      `"${localPart}" no es un nombre de usuario de correo válido. ` +
      "Solo se permiten letras, números, puntos, guiones y guiones bajos.",
    );
  }
  return `${clean}@${domainName.trim().toLowerCase()}`;
}
