import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { applyCompanyScope } from "@/lib/companyScope";

interface EnsureCompanyIdOptions {
  syncingTitle?: string;
  syncingDescription?: string;
  missingTitle?: string;
  missingDescription?: string;
}

const DEFAULT_MESSAGES: Required<EnsureCompanyIdOptions> = {
  syncingTitle: "Perfil en sincronizacion",
  syncingDescription: "Espera unos segundos e intenta nuevamente.",
  missingTitle: "Empresa no asignada",
  missingDescription: "Tu usuario no tiene empresa asociada.",
};

export function useCompanyAccess(defaultMessages: EnsureCompanyIdOptions = {}) {
  const { companyId, loading: companyLoading } = useCompany();
  const { refreshProfile } = useAuth();
  const { toast } = useToast();
  const [resolvingCompany, setResolvingCompany] = useState(false);

  const ensureCompanyId = useCallback(async (messages: EnsureCompanyIdOptions = {}) => {
    const resolvedMessages = { ...DEFAULT_MESSAGES, ...defaultMessages, ...messages };

    if (companyId) {
      return companyId;
    }

    if (companyLoading || resolvingCompany) {
      toast({
        title: resolvedMessages.syncingTitle,
        description: resolvedMessages.syncingDescription,
      });
      return null;
    }

    setResolvingCompany(true);
    try {
      await refreshProfile();

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        return null;
      }

      const { data: profileBeforeRepair } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", uid)
        .maybeSingle();

      if (profileBeforeRepair?.company_id) {
        return profileBeforeRepair.company_id;
      }

      const { data: repairData, error: repairError } = await supabase.functions.invoke("company-users", {
        body: { action: "repair-context" },
      });

      if (!repairError && !(repairData as { error?: unknown } | null)?.error) {
        await refreshProfile();

        const { data: repairedProfile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", uid)
          .maybeSingle();

        if (repairedProfile?.company_id) {
          return repairedProfile.company_id;
        }
      }
    } catch (error) {
      console.error("Error resolving company context", error);
    } finally {
      setResolvingCompany(false);
    }

    toast({
      title: resolvedMessages.missingTitle,
      description: resolvedMessages.missingDescription,
      variant: "destructive",
    });
    return null;
  }, [companyId, companyLoading, defaultMessages, refreshProfile, resolvingCompany, toast]);

  const withCompanyScope = useCallback(<T extends { eq: (column: string, value: string) => T }>(query: T) => {
    return applyCompanyScope(query, companyId);
  }, [companyId]);

  return {
    companyId,
    companyLoading,
    resolvingCompany,
    ensureCompanyId,
    withCompanyScope,
  };
}