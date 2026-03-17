import { supabase } from "@/integrations/supabase/client";

type ScriptExecutionStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ScriptExecutionDraft {
  company_id?: string | null;
  device_id: string;
  script_name: string;
  script_type: string;
  script_content?: string | null;
  status?: ScriptExecutionStatus;
  executed_by?: string | null;
}

interface QueueScriptExecutionsParams {
  executions: ScriptExecutionDraft[];
  ensureCompanyId: () => Promise<string | null>;
}

export function isScriptExecutionPolicyError(error: { message?: string | null } | null | undefined) {
  return /row-level security|policy/i.test(error?.message || "");
}

export async function queueScriptExecutions({ executions, ensureCompanyId }: QueueScriptExecutionsParams) {
  const scopedCompanyId = await ensureCompanyId();
  if (!scopedCompanyId) {
    return { error: null, inserted: false, companyId: null };
  }

  const buildExecutions = (companyId: string) =>
    executions.map((execution) => ({
      ...execution,
      company_id: execution.company_id ?? companyId,
    }));

  let result = await supabase.from("script_executions").insert(buildExecutions(scopedCompanyId));
  if (!isScriptExecutionPolicyError(result.error)) {
    return { error: result.error, inserted: !result.error, companyId: scopedCompanyId };
  }

  await supabase.functions.invoke("company-users", {
    body: { action: "repair-context" },
  });

  const retryCompanyId = await ensureCompanyId();
  if (!retryCompanyId) {
    return { error: result.error, inserted: false, companyId: null };
  }

  result = await supabase.from("script_executions").insert(buildExecutions(retryCompanyId));
  return { error: result.error, inserted: !result.error, companyId: retryCompanyId };
}