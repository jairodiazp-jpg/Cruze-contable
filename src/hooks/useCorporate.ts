// ─────────────────────────────────────────────────────────────────────────────
// useCorporate.ts — React hook that orchestrates the three corporate services.
//
// Keeps all async state (loading, error) isolated from the UI so components
// stay thin and focused on rendering.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as domainSvc from "@/services/domainService";
import * as emailSvc from "@/services/emailAccountService";
import * as provSvc from "@/services/provisioningService";
import type {
  CorporateDomain,
  CorporateEmailAccount,
  ProvisioningProfile,
  CreateDomainDto,
  UpdateDomainDto,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
  CreateProvisioningProfileDto,
  UpdateProvisioningProfileDto,
} from "@/types/corporate";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "Error inesperado";
}

function isMissingSchemaResourceError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function toUiErrorMessage(error: unknown): string {
  if (isMissingSchemaResourceError(error)) {
    return "El modulo corporativo no esta habilitado en la base de datos actual. Aplica las migraciones corporativas en Supabase.";
  }
  return getErrorMessage(error);
}

export function useCorporate() {
  const { companyId, companyLoading } = useCompanyAccess();
  const { user } = useAuth();
  const { toast } = useToast();

  const [domains, setDomains]   = useState<CorporateDomain[]>([]);
  const [emails, setEmails]     = useState<CorporateEmailAccount[]>([]);
  const [profiles, setProfiles] = useState<ProvisioningProfile[]>([]);
  const [loading, setLoading]   = useState(false);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);

  const handleActionError = useCallback((title: string, error: unknown) => {
    if (isMissingSchemaResourceError(error)) {
      setModuleUnavailable(true);
      toast({
        title: "Modulo corporativo no disponible",
        description: "La base de datos actual no tiene tablas corporativas.",
      });
      return;
    }

    toast({
      title,
      description: toUiErrorMessage(error),
      variant: "destructive",
    });
  }, [toast]);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!companyId || companyLoading) return;
    setLoading(true);
    setModuleUnavailable(false);
    try {
      const [d, e, p] = await Promise.allSettled([
        domainSvc.listDomains(companyId),
        emailSvc.listEmailAccounts(companyId),
        provSvc.listProvisioningProfiles(companyId),
      ]);

      const nextDomains = d.status === "fulfilled" ? d.value : [];
      const nextEmails = e.status === "fulfilled" ? e.value : [];
      const nextProfiles = p.status === "fulfilled" ? p.value : [];

      setDomains(nextDomains);
      setEmails(nextEmails);
      setProfiles(nextProfiles);

      const failures = [d, e, p].filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) {
        const schemaMissing = failures.some((f) => isMissingSchemaResourceError(f.reason));
        if (schemaMissing) {
          setModuleUnavailable(true);
        } else {
          toast({
            title: "Error al cargar datos corporativos",
            description: toUiErrorMessage(failures[0].reason),
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({ title: "Error al cargar datos corporativos", description: toUiErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, companyLoading, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Domain actions ─────────────────────────────────────────────────────────

  const createDomain = useCallback(async (dto: Omit<CreateDomainDto, "company_id" | "created_by">) => {
    if (!companyId || moduleUnavailable) return;
    try {
      const created = await domainSvc.createDomain({
        ...dto,
        company_id: companyId,
        created_by: user?.id,
      });
      setDomains(prev => [created, ...prev]);
      toast({ title: "Dominio registrado", description: created.domain_name });
    } catch (err) {
      handleActionError("Error al registrar dominio", err);
    }
  }, [companyId, moduleUnavailable, user?.id, toast, handleActionError]);

  const updateDomain = useCallback(async (id: string, dto: UpdateDomainDto) => {
    if (moduleUnavailable) return;
    try {
      const updated = await domainSvc.updateDomain(id, dto);
      setDomains(prev => prev.map(d => d.id === id ? updated : d));
      toast({ title: "Dominio actualizado" });
    } catch (err) {
      handleActionError("Error al actualizar dominio", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  const deleteDomain = useCallback(async (id: string) => {
    if (moduleUnavailable) return;
    try {
      await domainSvc.deleteDomain(id);
      setDomains(prev => prev.filter(d => d.id !== id));
      toast({ title: "Dominio eliminado" });
    } catch (err) {
      handleActionError("Error al eliminar dominio", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  const activateDomain = useCallback(async (id: string) => {
    if (moduleUnavailable) return;
    try {
      const updated = await domainSvc.activateDomain(id);
      setDomains(prev => prev.map(d => d.id === id ? updated : d));
      toast({ title: "Dominio activado" });
    } catch (err) {
      handleActionError("Error al activar dominio", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  // ── Email account actions ──────────────────────────────────────────────────

  const createEmailAccount = useCallback(async (dto: Omit<CreateEmailAccountDto, "company_id" | "created_by">) => {
    if (!companyId || moduleUnavailable) return;
    try {
      const created = await emailSvc.createEmailAccount({
        ...dto,
        company_id: companyId,
        created_by: user?.id,
      });
      setEmails(prev => [...prev, created]);
      toast({ title: "Cuenta de correo creada", description: created.email_address });
    } catch (err) {
      handleActionError("Error al crear cuenta de correo", err);
    }
  }, [companyId, moduleUnavailable, user?.id, toast, handleActionError]);

  const updateEmailAccount = useCallback(async (id: string, dto: UpdateEmailAccountDto) => {
    if (moduleUnavailable) return;
    try {
      const updated = await emailSvc.updateEmailAccount(id, dto);
      setEmails(prev => prev.map(e => e.id === id ? updated : e));
      toast({ title: "Cuenta de correo actualizada" });
    } catch (err) {
      handleActionError("Error al actualizar cuenta", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  const deleteEmailAccount = useCallback(async (id: string) => {
    if (moduleUnavailable) return;
    try {
      await emailSvc.deleteEmailAccount(id);
      setEmails(prev => prev.filter(e => e.id !== id));
      toast({ title: "Cuenta de correo eliminada" });
    } catch (err) {
      handleActionError("Error al eliminar cuenta", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  // ── Provisioning profile actions ───────────────────────────────────────────

  const createProfile = useCallback(async (dto: Omit<CreateProvisioningProfileDto, "company_id" | "created_by">) => {
    if (!companyId || moduleUnavailable) return;
    try {
      const created = await provSvc.createProvisioningProfile({
        ...dto,
        company_id: companyId,
        created_by: user?.id,
      });
      setProfiles(prev => [...prev, created]);
      toast({ title: "Perfil de aprovisionamiento creado", description: created.name });
    } catch (err) {
      handleActionError("Error al crear perfil", err);
    }
  }, [companyId, moduleUnavailable, user?.id, toast, handleActionError]);

  const updateProfile = useCallback(async (id: string, dto: UpdateProvisioningProfileDto) => {
    if (moduleUnavailable) return;
    try {
      const updated = await provSvc.updateProvisioningProfile(id, dto);
      setProfiles(prev => prev.map(p => p.id === id ? updated : p));
      toast({ title: "Perfil actualizado" });
    } catch (err) {
      handleActionError("Error al actualizar perfil", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  const deleteProfile = useCallback(async (id: string) => {
    if (moduleUnavailable) return;
    try {
      await provSvc.deleteProvisioningProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      toast({ title: "Perfil eliminado" });
    } catch (err) {
      handleActionError("Error al eliminar perfil", err);
    }
  }, [moduleUnavailable, toast, handleActionError]);

  return {
    // State
    domains,
    emails,
    profiles,
    loading: loading || companyLoading,
    companyId,
    moduleUnavailable,
    // Domain
    createDomain,
    updateDomain,
    deleteDomain,
    activateDomain,
    // Email
    createEmailAccount,
    updateEmailAccount,
    deleteEmailAccount,
    // Profile
    createProfile,
    updateProfile,
    deleteProfile,
    // Refresh
    refresh: loadAll,
  };
}
