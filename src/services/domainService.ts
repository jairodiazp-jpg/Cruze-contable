// ─────────────────────────────────────────────────────────────────────────────
// domainService.ts — Repository-style service for corporate_domains table.
// All methods are pure async functions with no React dependencies, making them
// easy to unit-test and reuse outside components.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type {
  CorporateDomain,
  CreateDomainDto,
  UpdateDomainDto,
} from "@/types/corporate";

const TABLE = "corporate_domains" as const;

function normalizeDomainName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^@+/, "")
    .replace(/\/.*/, "");
}

function assertValidDomainName(domainName: string): void {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if (!domainRegex.test(domainName)) {
    throw new Error("El dominio no es válido. Usa formato como empresa.com");
  }
}

export async function listDomains(companyId: string): Promise<CorporateDomain[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CorporateDomain[];
}

export async function createDomain(dto: CreateDomainDto): Promise<CorporateDomain> {
  const domainName = normalizeDomainName(dto.domain_name);
  assertValidDomainName(domainName);

  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert({
      ...dto,
      domain_name: domainName,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as CorporateDomain;
}

export async function updateDomain(
  id: string,
  dto: UpdateDomainDto,
): Promise<CorporateDomain> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .update(dto)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as CorporateDomain;
}

export async function deleteDomain(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function activateDomain(id: string): Promise<CorporateDomain> {
  return updateDomain(id, { status: "active" });
}
