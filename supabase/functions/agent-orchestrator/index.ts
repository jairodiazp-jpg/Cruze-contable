import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CanonicalAgentType = "planning-agent" | "execution-agent" | "evaluation-agent";
type LegacyExecutionType = "automation-agent" | "scraping-agent" | "analysis-agent" | "notification-agent";
type AgentType = CanonicalAgentType | LegacyExecutionType;

type QueueTask = {
  id: string;
  company_id: string;
  workflow_id: string | null;
  parent_task_id: string | null;
  depends_on_task_id: string | null;
  agent_type: AgentType;
  task_type: string;
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  max_attempts: number;
};

type ProcessedResult = { task_id: string; status: string; run_id?: string; error?: string };
type TaskExecutionResult = {
  output: Record<string, unknown>;
  deferred?: boolean;
  nextScheduleAt?: string;
};

const nowIso = () => new Date().toISOString();

function getConcurrencyLimit(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "4");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 4;
  }
  return Math.min(Math.trunc(parsed), 20);
}

function normalizeExecutionTaskType(agentType: AgentType): CanonicalAgentType {
  if (agentType === "automation-agent" || agentType === "scraping-agent" || agentType === "analysis-agent" || agentType === "notification-agent") {
    return "execution-agent";
  }
  return agentType;
}

async function getAuthenticatedUserId(req: Request, supabaseUrl: string, anonKey: string): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data } = await authClient.auth.getUser();
  return data.user?.id ?? null;
}

async function appendTaskMessage(params: {
  supabase: ReturnType<typeof createClient>;
  task: QueueTask;
  toTaskId?: string | null;
  messageType: string;
  payload: Record<string, unknown>;
}) {
  if (!params.task.workflow_id) {
    return;
  }

  await params.supabase.from("agent_task_messages").insert({
    company_id: params.task.company_id,
    workflow_id: params.task.workflow_id,
    from_task_id: params.task.id,
    to_task_id: params.toTaskId ?? null,
    message_type: params.messageType,
    payload: params.payload,
  });
}

async function updateWorkflowState(params: {
  supabase: ReturnType<typeof createClient>;
  workflowId: string | null;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage?: string;
}) {
  if (!params.workflowId) {
    return;
  }

  await params.supabase
    .from("agent_workflows")
    .update({
      status: params.status,
      started_at: params.status === "running" ? nowIso() : undefined,
      completed_at: params.status === "completed" || params.status === "failed" ? nowIso() : undefined,
      last_error: params.errorMessage ?? null,
      updated_at: nowIso(),
    })
    .eq("id", params.workflowId);
}

async function runPlanningAgent(
  supabase: ReturnType<typeof createClient>,
  task: QueueTask,
): Promise<TaskExecutionResult> {
  const payloadGoal = typeof task.payload.goal === "string" ? task.payload.goal : task.task_type;
  const objectiveItems = Array.isArray(task.payload.objectives)
    ? task.payload.objectives.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [payloadGoal];

  const plannedSteps = objectiveItems.slice(0, 8).map((objective, index) => ({
    step_index: index + 1,
    task_type: `execute_step_${index + 1}`,
    objective,
  }));

  if (!plannedSteps.length) {
    plannedSteps.push({ step_index: 1, task_type: "execute_default_step", objective: payloadGoal });
  }

  const { data: executionTasks, error: executionError } = await supabase
    .from("agent_tasks_queue")
    .insert(
      plannedSteps.map((step, index) => ({
        company_id: task.company_id,
        workflow_id: task.workflow_id,
        parent_task_id: task.id,
        agent_type: "execution-agent",
        task_type: step.task_type,
        payload: {
          objective: step.objective,
          step_index: step.step_index,
          planning_task_id: task.id,
          shared_context: task.payload.context ?? {},
        },
        priority: Math.max(task.priority + index, 1),
        status: "pending",
        max_attempts: task.max_attempts,
        scheduled_for: nowIso(),
        updated_at: nowIso(),
      })),
    )
    .select("id");

  if (executionError) {
    throw new Error(`Planning could not enqueue execution tasks: ${executionError.message}`);
  }

  const executionTaskIds = (executionTasks ?? []).map((item: { id: string }) => item.id as string);

  const { data: evaluationTask, error: evaluationError } = await supabase
    .from("agent_tasks_queue")
    .insert({
      company_id: task.company_id,
      workflow_id: task.workflow_id,
      parent_task_id: task.id,
      agent_type: "evaluation-agent",
      task_type: "evaluate_workflow",
      payload: {
        planning_task_id: task.id,
        expected_execution_task_ids: executionTaskIds,
      },
      priority: task.priority + 100,
      status: "pending",
      max_attempts: task.max_attempts,
      scheduled_for: nowIso(),
      updated_at: nowIso(),
    })
    .select("id")
    .single();

  if (evaluationError) {
    throw new Error(`Planning could not enqueue evaluation task: ${evaluationError.message}`);
  }

  await updateWorkflowState({
    supabase,
    workflowId: task.workflow_id,
    status: "running",
  });

  await appendTaskMessage({
    supabase,
    task,
    toTaskId: evaluationTask.id as string,
    messageType: "plan_created",
    payload: {
      planning_task_id: task.id,
      planned_step_count: executionTaskIds.length,
      execution_task_ids: executionTaskIds,
    },
  });

  return {
    output: {
      summary: `Planning completed with ${executionTaskIds.length} execution tasks`,
      execution_task_ids: executionTaskIds,
      evaluation_task_id: evaluationTask.id,
    },
  };
}

async function runExecutionAgent(
  supabase: ReturnType<typeof createClient>,
  task: QueueTask,
): Promise<TaskExecutionResult> {
  const objective = typeof task.payload.objective === "string" ? task.payload.objective : task.task_type;
  const executionResult = {
    outcome: "success",
    objective,
    finished_at: nowIso(),
    generated_artifacts: [`artifact_${task.id.slice(0, 8)}`],
  };

  await appendTaskMessage({
    supabase,
    task,
    toTaskId: null,
    messageType: "execution_finished",
    payload: {
      execution_task_id: task.id,
      parent_task_id: task.parent_task_id,
      result: executionResult,
    },
  });

  return {
    output: {
      summary: `Execution completed for ${objective}`,
      result: executionResult,
    },
  };
}

async function runEvaluationAgent(
  supabase: ReturnType<typeof createClient>,
  task: QueueTask,
): Promise<TaskExecutionResult> {
  const planningTaskId = typeof task.payload.planning_task_id === "string" ? task.payload.planning_task_id : task.parent_task_id;

  const { data: executionTasks, error: executionTasksError } = await supabase
    .from("agent_tasks_queue")
    .select("id,status,last_error")
    .eq("company_id", task.company_id)
    .eq("workflow_id", task.workflow_id)
    .eq("parent_task_id", planningTaskId)
    .in("agent_type", ["execution-agent", "automation-agent", "scraping-agent", "analysis-agent", "notification-agent"]);

  if (executionTasksError) {
    throw new Error(`Evaluation could not load execution tasks: ${executionTasksError.message}`);
  }

  const executionRows = executionTasks ?? [];
  const pendingCount = executionRows.filter((row: { status: string }) => row.status === "pending" || row.status === "running").length;

  if (pendingCount > 0) {
    return {
      deferred: true,
      nextScheduleAt: new Date(Date.now() + 15_000).toISOString(),
      output: {
        summary: "Evaluation deferred until all execution tasks finish",
        pending_count: pendingCount,
      },
    };
  }

  const failedRows = executionRows.filter((row: { status: string; last_error?: string | null }) => row.status === "failed");
  const completedCount = executionRows.filter((row: { status: string }) => row.status === "completed").length;
  const workflowStatus: "completed" | "failed" = failedRows.length > 0 ? "failed" : "completed";

  await updateWorkflowState({
    supabase,
    workflowId: task.workflow_id,
    status: workflowStatus,
    errorMessage: failedRows[0]?.last_error ?? undefined,
  });

  await appendTaskMessage({
    supabase,
    task,
    toTaskId: planningTaskId,
    messageType: "evaluation_finished",
    payload: {
      workflow_status: workflowStatus,
      execution_total: executionRows.length,
      execution_completed: completedCount,
      execution_failed: failedRows.length,
    },
  });

  return {
    output: {
      summary: `Evaluation ${workflowStatus}`,
      workflow_status: workflowStatus,
      execution_total: executionRows.length,
      execution_completed: completedCount,
      execution_failed: failedRows.length,
    },
  };
}

async function handleTaskByAgentType(
  supabase: ReturnType<typeof createClient>,
  task: QueueTask,
): Promise<TaskExecutionResult> {
  const normalizedAgentType = normalizeExecutionTaskType(task.agent_type);

  if (normalizedAgentType === "planning-agent") {
    return runPlanningAgent(supabase, task);
  }

  if (normalizedAgentType === "execution-agent") {
    return runExecutionAgent(supabase, task);
  }

  if (normalizedAgentType === "evaluation-agent") {
    return runEvaluationAgent(supabase, task);
  }

  return {
    output: {
      summary: `Task processed: ${task.task_type}`,
    },
  };
}

async function processTask(
  supabase: ReturnType<typeof createClient>,
  task: QueueTask,
  callerUserId: string,
): Promise<ProcessedResult | null> {
  const { data: lockedTask } = await supabase
    .from("agent_tasks_queue")
    .update({
      status: "running",
      started_at: nowIso(),
      attempts: task.attempts + 1,
      updated_at: nowIso(),
    })
    .eq("id", task.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (!lockedTask) {
    return null;
  }

  const runStart = Date.now();

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      company_id: task.company_id,
      task_id: task.id,
      agent_type: normalizeExecutionTaskType(task.agent_type),
      run_status: "running",
      triggered_by: callerUserId,
      input_payload: task.payload,
    })
    .select("id")
    .single();

  if (runError || !run) {
    await supabase
      .from("agent_tasks_queue")
      .update({
        status: "failed",
        completed_at: nowIso(),
        last_error: runError?.message || "Unable to create run",
        updated_at: nowIso(),
      })
      .eq("id", task.id);

    return { task_id: task.id, status: "failed", error: runError?.message || "Unable to create run" };
  }

  try {
    const taskExecution = await handleTaskByAgentType(supabase, task);
    const durationMs = Date.now() - runStart;

    if (taskExecution.deferred) {
      await Promise.allSettled([
        supabase
          .from("agent_runs")
          .update({
            run_status: "completed",
            output_payload: taskExecution.output,
            completed_at: nowIso(),
            duration_ms: durationMs,
          })
          .eq("id", run.id),
        supabase
          .from("agent_tasks_queue")
          .update({
            status: "pending",
            started_at: null,
            completed_at: null,
            result_payload: taskExecution.output,
            scheduled_for: taskExecution.nextScheduleAt ?? new Date(Date.now() + 15_000).toISOString(),
            updated_at: nowIso(),
          })
          .eq("id", task.id),
      ]);

      return { task_id: task.id, status: "retrying", run_id: run.id };
    }

    const successWrites: Array<Promise<unknown>> = [
      supabase
        .from("agent_runs")
        .update({
          run_status: "completed",
          output_payload: taskExecution.output,
          completed_at: nowIso(),
          duration_ms: durationMs,
        })
        .eq("id", run.id),
      supabase
        .from("agent_tasks_queue")
        .update({
          status: "completed",
          completed_at: nowIso(),
          result_payload: taskExecution.output,
          updated_at: nowIso(),
        })
        .eq("id", task.id),
      supabase.from("system_logs").insert({
        company_id: task.company_id,
        action: "agent_task_completed",
        category: "agents",
        severity: "info",
        message: `${task.agent_type} completed task ${task.task_type}`,
        details: { task_id: task.id, run_id: run.id, duration_ms: durationMs },
      }),
      supabase.from("analytics").insert({
        company_id: task.company_id,
        metric_name: "agent_task_completed",
        metric_value: 1,
        dimensions: {
          agent_type: task.agent_type,
          task_type: task.task_type,
          workflow_id: task.workflow_id,
        },
      }),
    ];

    await Promise.allSettled(successWrites);

    return { task_id: task.id, status: "completed", run_id: run.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown orchestrator error";
    const shouldRetry = task.attempts + 1 < task.max_attempts;

    await Promise.allSettled([
      supabase
        .from("agent_runs")
        .update({
          run_status: "failed",
          error_message: errorMessage,
          completed_at: nowIso(),
          duration_ms: Date.now() - runStart,
        })
        .eq("id", run.id),
      supabase
        .from("agent_tasks_queue")
        .update({
          status: shouldRetry ? "pending" : "failed",
          started_at: null,
          completed_at: shouldRetry ? null : nowIso(),
          result_payload: {},
          last_error: errorMessage,
          updated_at: nowIso(),
        })
        .eq("id", task.id),
      supabase.from("system_logs").insert({
        company_id: task.company_id,
        action: "agent_task_failed",
        category: "agents",
        severity: "error",
        message: `${task.agent_type} failed task ${task.task_type}`,
        details: { task_id: task.id, run_id: run.id, error: errorMessage },
      }),
    ]);

    if (!shouldRetry) {
      await updateWorkflowState({
        supabase,
        workflowId: task.workflow_id,
        status: "failed",
        errorMessage,
      });
    }

    return { task_id: task.id, status: shouldRetry ? "retrying" : "failed", run_id: run.id, error: errorMessage };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerUserId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const maxTasks = Math.min(Number(body.limit ?? 10), 50);

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", callerUserId)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "User has no company assigned" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = profile.company_id;

    const { data: tasks, error: tasksError } = await supabase
      .from("agent_tasks_queue")
      .select("id, company_id, workflow_id, parent_task_id, depends_on_task_id, agent_type, task_type, payload, priority, attempts, max_attempts")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .lte("scheduled_for", nowIso())
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(maxTasks);

    if (tasksError) {
      return new Response(JSON.stringify({ error: tasksError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tasks?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending tasks" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const processed: ProcessedResult[] = [];
    const queue = tasks as QueueTask[];
    const concurrency = Math.min(getConcurrencyLimit(Deno.env.get("ORCHESTRATOR_CONCURRENCY")), queue.length);
    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const nextIndex = currentIndex;
        currentIndex += 1;

        if (nextIndex >= queue.length) {
          return;
        }

        const task = queue[nextIndex];

        if (task.depends_on_task_id) {
          const { data: dependencyTask } = await supabase
            .from("agent_tasks_queue")
            .select("status")
            .eq("id", task.depends_on_task_id)
            .single();

          if (dependencyTask?.status !== "completed") {
            continue;
          }
        }

        const result = await processTask(supabase, task, callerUserId);
        if (result) {
          processed.push(result);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return new Response(JSON.stringify({
      processed: processed.length,
      results: processed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
