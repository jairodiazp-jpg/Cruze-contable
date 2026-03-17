import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USER_ONLY_ACTIONS = new Set(["generate-token"]);
const AGENT_ACTIONS = new Set([
  "register",
  "report",
  "agent-api",
  "execute",
  "result",
  "backup-report",
  "get-profile",
  "get-email-config",
  "email-result",
  "get-firewall-rules",
  "firewall-result",
  "policy-sync",
  "bypass-report",
  "get-licenses",
  "license-result",
]);

const ALLOWED_AGENT_SCRIPT_TYPES = new Set([
  "diagnostic",
  "network-repair",
  "backup",
  "firewall-block",
  "firewall-unblock",
  "firewall-rule",
  "firewall-sync",
  "policy-sync",
  "install-profile",
  "setup-email",
  "setup-vpn",
  "update-agent",
]);

async function requireAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return {
      error: new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { user: data.user };
}

function requireAgentKey(req: Request) {
  const expectedAgentKey = Deno.env.get("AGENT_SHARED_KEY");
  if (!expectedAgentKey) {
    return null;
  }

  const provided = req.headers.get("x-agent-key");
  if (!provided || provided !== expectedAgentKey) {
    return new Response(JSON.stringify({ error: "Invalid agent key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return "unknown-ip";
  }

  const [ip] = forwardedFor.split(",");
  return ip?.trim() || "unknown-ip";
}

async function enforceRateLimit(params: {
  supabase: ReturnType<typeof createClient>;
  scope: "user" | "agent" | "ip";
  key: string;
  limit: number;
  windowSeconds: number;
}) {
  const { data, error } = await params.supabase.rpc("consume_agent_api_rate_limit", {
    p_scope: params.scope,
    p_key: params.key,
    p_limit: params.limit,
    p_window_seconds: params.windowSeconds,
  });

  if (error) {
    const errorMessage = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
    const canBypassRateLimit =
      errorMessage.includes("consume_agent_api_rate_limit") ||
      errorMessage.includes("function") ||
      errorMessage.includes("does not exist") ||
      errorMessage.includes("agent_api_rate_limits") ||
      errorMessage.includes("relation") ||
      errorMessage.includes("schema cache");

    if (canBypassRateLimit) {
      console.error("Rate limit backend unavailable, bypassing limiter", {
        scope: params.scope,
        error,
      });

      return {
        allowed: true,
        response: null,
      };
    }

    console.error("Rate limit backend error", {
      scope: params.scope,
      error,
    });

    return {
      allowed: false,
      response: new Response(JSON.stringify({ error: "Rate limit backend error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  if (!data?.allowed) {
    return {
      allowed: false,
      response: new Response(JSON.stringify({
        error: "Rate limit exceeded",
        retry_after_seconds: data?.retry_after_seconds ?? 60,
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(data?.retry_after_seconds ?? 60),
        },
      }),
    };
  }

  return { allowed: true, response: null };
}

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  for (const byte of arr) {
    result += chars[byte % chars.length];
  }
  return result;
}

function generateActionNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isOutsideOfficeHours(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) {
    return true;
  }
  return hour < 8 || hour >= 19;
}

function shouldDeferUpdateAgentScript(scriptContent: unknown, now: Date): boolean {
  if (!isOutsideOfficeHours(now) && typeof scriptContent === "string" && scriptContent.trim().length > 0) {
    try {
      const parsed = JSON.parse(scriptContent) as { outside_office_only?: unknown };
      return parsed.outside_office_only === true;
    } catch {
      return false;
    }
  }

  return false;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);
    const action = path[path.length - 1]; // last segment

    if (USER_ONLY_ACTIONS.has(action)) {
      const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
      if (authResult.error) {
        return authResult.error;
      }
    }

    if (AGENT_ACTIONS.has(action)) {
      const agentKeyError = requireAgentKey(req);
      if (agentKeyError) {
        return agentKeyError;
      }
    }

    const body = await req.json();
    const clientIp = getClientIp(req);

    if (USER_ONLY_ACTIONS.has(action)) {
      const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
      if (authResult.error) {
        return authResult.error;
      }

      const userLimit = await enforceRateLimit({
        supabase,
        scope: "user",
        key: authResult.user.id,
        limit: 30,
        windowSeconds: 60,
      });

      if (!userLimit.allowed && userLimit.response) {
        return userLimit.response;
      }
    } else if (AGENT_ACTIONS.has(action)) {
      const agentIdentifier = typeof body?.device_id === "string" && body.device_id.trim().length > 0
        ? `device:${body.device_id}`
        : `ip:${clientIp}`;

      const agentLimit = await enforceRateLimit({
        supabase,
        scope: "agent",
        key: agentIdentifier,
        limit: 120,
        windowSeconds: 60,
      });

      if (!agentLimit.allowed && agentLimit.response) {
        return agentLimit.response;
      }
    } else {
      const ipLimit = await enforceRateLimit({
        supabase,
        scope: "ip",
        key: clientIp,
        limit: 60,
        windowSeconds: 60,
      });

      if (!ipLimit.allowed && ipLimit.response) {
        return ipLimit.response;
      }
    }

    // =============================================
    // ENROLLMENT: Generate Token
    // =============================================
    if (action === "generate-token") {
      const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
      if (authResult.error) {
        return authResult.error;
      }

      const { data: userRole, error: userRoleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authResult.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (userRoleError) {
        return new Response(JSON.stringify({ error: "Could not verify user permissions" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!userRole) {
        return new Response(JSON.stringify({ error: "Only administrators can generate enrollment tokens" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", authResult.user.id)
        .single();

      if (!profile?.company_id) {
        return new Response(JSON.stringify({ error: "User has no company assigned" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      const { data, error } = await supabase.from("enrollment_tokens").insert({
        token,
        expires_at: expiresAt,
        created_by: authResult.user.id,
        company_id: profile.company_id,
      }).select("token, expires_at").single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        token: data.token,
        expires_at: data.expires_at,
        expires_in: "24h",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // ENROLLMENT: Register Device with Token
    // =============================================
    if (action === "register") {
      const { token, hostname, operating_system, ip_address, mac_address, user_assigned, department } = body;

      if (!token || !hostname) {
        return new Response(JSON.stringify({ error: "token and hostname required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate token
      const { data: tokenRow, error: tokenError } = await supabase
        .from("enrollment_tokens")
        .select("*")
        .eq("token", token)
        .single();

      if (tokenError || !tokenRow) {
        return new Response(JSON.stringify({ error: "Invalid enrollment token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.used) {
        return new Response(JSON.stringify({ error: "Token already used" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Token expired" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a unique device_id
      const deviceId = `DEV-${hostname.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      // Insert device
      const { data: device, error: deviceError } = await supabase.from("devices").insert({
        device_id: deviceId,
        hostname,
        operating_system: operating_system || null,
        ip_address: ip_address || null,
        user_assigned: user_assigned || null,
        department: department || null,
        agent_installed: true,
        agent_version: body.agent_version || "2.0.0",
        health_status: "healthy",
        last_seen: new Date().toISOString(),
        connection_type: body.connection_type || "unknown",
        vpn_status: body.vpn_status || "disconnected",
        company_id: tokenRow.company_id || null,
      }).select("id, device_id").single();

      if (deviceError) {
        return new Response(JSON.stringify({ error: deviceError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark token as used
      await supabase.from("enrollment_tokens").update({
        used: true,
        used_at: new Date().toISOString(),
        used_by_device_id: device.id,
      }).eq("id", tokenRow.id);

      // Log enrollment
      await supabase.from("system_logs").insert({
        device_id: device.id,
        action: "device_enrolled",
        category: "enrollment",
        severity: "info",
        message: `Device "${hostname}" enrolled automatically via token`,
        details: { device_id: deviceId, ip_address, operating_system, mac_address },
        company_id: tokenRow.company_id || null,
      });

      return new Response(JSON.stringify({
        status: "enrolled",
        device_id: deviceId,
        device_uuid: device.id,
        message: "Device registered successfully",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // AGENT REPORT (existing)
    // =============================================
    if (action === "report" || action === "agent-api") {
      const { device_id, hostname, diagnostics, agent_version } = body;

      if (!device_id) {
        return new Response(JSON.stringify({ error: "device_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let health = "healthy";
      if (diagnostics) {
        const { cpu_usage, ram_usage, disk_usage, packet_loss } = diagnostics;
        if (cpu_usage > 95 || ram_usage > 95 || disk_usage > 95 || packet_loss > 20) health = "critical";
        else if (cpu_usage > 80 || ram_usage > 80 || disk_usage > 85 || packet_loss > 5) health = "warning";
      }

      const { data: existingDevice, error: existingDeviceError } = await supabase
        .from("devices")
        .select("id, company_id, report_interval")
        .eq("device_id", device_id)
        .single();

      if (existingDeviceError || !existingDevice) {
        return new Response(JSON.stringify({ error: "Unknown device_id. Device must be enrolled first" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deviceError } = await supabase
        .from("devices")
        .update({
          hostname: hostname || device_id,
          last_seen: new Date().toISOString(),
          health_status: health,
          agent_installed: true,
          agent_version: agent_version || "1.0.0",
          ip_address: body.ip_address || null,
          operating_system: body.operating_system || null,
          connection_type: body.connection_type || "unknown",
          vpn_status: body.vpn_status || "disconnected",
          user_assigned: body.user_assigned || null,
          department: body.department || null,
        })
        .eq("id", existingDevice.id);

      if (deviceError) {
        return new Response(JSON.stringify({ error: deviceError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const deviceRow = existingDevice;

      if (diagnostics && deviceRow) {
        await supabase.from("device_diagnostics").insert({
          device_id: deviceRow.id,
          cpu_usage: diagnostics.cpu_usage,
          ram_usage: diagnostics.ram_usage,
          disk_usage: diagnostics.disk_usage,
          internet_status: diagnostics.internet_status,
          wifi_status: diagnostics.wifi_status,
          ethernet_status: diagnostics.ethernet_status,
          dns_status: diagnostics.dns_status,
          latency_ms: diagnostics.latency_ms,
          packet_loss: diagnostics.packet_loss,
          overall_health: health,
          raw_data: diagnostics.raw_data || null,
          company_id: deviceRow.company_id || null,
        });

        await supabase.from("system_logs").insert({
          device_id: deviceRow.id,
          action: "agent_report",
          category: "diagnostics",
          severity: health === "critical" ? "critical" : health === "warning" ? "warning" : "info",
          message: `Agent report from ${hostname || device_id}: ${health}`,
          details: { diagnostics, agent_version },
          company_id: deviceRow.company_id || null,
        });
      }

      let pendingScripts: unknown[] = [];
      if (deviceRow) {
        const { data: scripts } = await supabase
          .from("script_executions")
          .select("id, script_name, script_type, script_content, ticket_id, action_id, action_nonce, action_expires_at")
          .eq("device_id", deviceRow.id)
          .eq("company_id", deviceRow.company_id)
          .eq("status", "pending")
          .order("created_at")
          .limit(5);
        pendingScripts = [];

        const now = new Date();
        for (const script of scripts || []) {
          const safeType = typeof script.script_type === "string" && ALLOWED_AGENT_SCRIPT_TYPES.has(script.script_type);
          if (!safeType) {
            await supabase
              .from("script_executions")
              .update({
                status: "failed",
                error_log: `Blocked by server policy: script_type '${script.script_type ?? "unknown"}' is not allowed`,
                completed_at: new Date().toISOString(),
                result_reported_at: new Date().toISOString(),
              })
              .eq("id", script.id);

            await supabase.from("system_logs").insert({
              device_id: deviceRow.id,
              action: "script_blocked",
              category: "security",
              severity: "warning",
              message: `Blocked legacy script type '${script.script_type ?? "unknown"}' for execution ${script.id}`,
              details: {
                execution_id: script.id,
                script_name: script.script_name,
                script_type: script.script_type,
                reason: "legacy_script_type_not_allowed",
              },
              company_id: deviceRow.company_id || null,
            });
            continue;
          }

          if (script.script_type === "update-agent" && shouldDeferUpdateAgentScript(script.script_content, now)) {
            continue;
          }

          const actionId = script.action_id || crypto.randomUUID();
          const actionNonce = script.action_nonce || generateActionNonce();
          const actionExp = script.action_expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString();

          await supabase
            .from("script_executions")
            .update({
              status: "running",
              started_at: new Date().toISOString(),
              dispatched_at: new Date().toISOString(),
              action_id: actionId,
              action_nonce: actionNonce,
              action_expires_at: actionExp,
            })
            .eq("id", script.id);

          pendingScripts.push({
            id: script.id,
            script_name: script.script_name,
            script_type: script.script_type,
            script_content: script.script_content,
            ticket_id: script.ticket_id,
            action_id: actionId,
            nonce: actionNonce,
            exp: actionExp,
          });
        }
      }

      const hasPendingScripts = pendingScripts.length > 0;

      return new Response(JSON.stringify({
        status: "ok",
        health,
        report_interval: hasPendingScripts ? 15 : deviceRow?.report_interval ?? 60,
        pending_scripts: pendingScripts,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // SCRIPT EXECUTION RESULT (existing)
    // =============================================
    if (action === "execute" || action === "result") {
      const { execution_id, status, output, error_log, ticket_id, action_id, nonce, exp, device_id: reportDeviceId } = body;

      if (!execution_id || !action_id || !nonce || !exp) {
        return new Response(JSON.stringify({ error: "execution_id, action_id, nonce, exp required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expDate = new Date(exp);
      if (Number.isNaN(expDate.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid exp format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: execEnvelope, error: execEnvelopeError } = await supabase
        .from("script_executions")
        .select("id, device_id, company_id, script_name, script_type, ticket_id, action_id, action_nonce, action_expires_at, nonce_consumed_at, status, devices(device_id, hostname)")
        .eq("id", execution_id)
        .single();

      if (execEnvelopeError || !execEnvelope) {
        return new Response(JSON.stringify({ error: "Execution not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reportDeviceId && execEnvelope.devices?.device_id !== reportDeviceId) {
        return new Response(JSON.stringify({ error: "Execution does not belong to reporting device" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!execEnvelope.action_expires_at || new Date(execEnvelope.action_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Action envelope expired" }), {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!ALLOWED_AGENT_SCRIPT_TYPES.has(execEnvelope.script_type)) {
        await supabase
          .from("script_executions")
          .update({
            status: "failed",
            error_log: `Blocked by server policy: script_type '${execEnvelope.script_type ?? "unknown"}' is not allowed`,
            completed_at: new Date().toISOString(),
            result_reported_at: new Date().toISOString(),
          })
          .eq("id", execution_id)
          .is("nonce_consumed_at", null);

        return new Response(JSON.stringify({ error: "script_type not allowed by server policy" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (execEnvelope.nonce_consumed_at) {
        return new Response(JSON.stringify({ error: "Replay detected: nonce already consumed" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const envelopeMatches =
        (execEnvelope.ticket_id ?? null) === (ticket_id ?? null) &&
        execEnvelope.action_id === action_id &&
        execEnvelope.action_nonce === nonce &&
        new Date(execEnvelope.action_expires_at).getTime() === expDate.getTime();

      if (!envelopeMatches) {
        return new Response(JSON.stringify({ error: "Correlation envelope mismatch" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: consumedExecution, error } = await supabase
        .from("script_executions")
        .update({
          status: status || "completed",
          output: output || null,
          error_log: error_log || null,
          completed_at: new Date().toISOString(),
          result_reported_at: new Date().toISOString(),
          nonce_consumed_at: new Date().toISOString(),
        })
        .eq("id", execution_id)
        .is("nonce_consumed_at", null)
        .select("id");

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!consumedExecution || consumedExecution.length === 0) {
        return new Response(JSON.stringify({ error: "Replay detected during update" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: exec } = await supabase
        .from("script_executions")
        .select("id, device_id, company_id, script_name, ticket_id, action_id, action_nonce, action_expires_at, devices(hostname)")
        .eq("id", execution_id)
        .single();

      if (exec) {
        await supabase.from("system_logs").insert({
          device_id: exec.device_id,
          action: "script_executed",
          category: "automation",
          severity: status === "failed" ? "error" : "info",
          message: `Script "${exec.script_name}" ${status} on ${exec.devices?.hostname || "unknown"}`,
          details: {
            ticket_id: exec.ticket_id,
            action_id: exec.action_id,
            nonce: exec.action_nonce,
            exp: exec.action_expires_at,
            output: output?.substring(0, 500),
            error_log: error_log?.substring(0, 500),
          },
          company_id: exec.company_id || null,
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // BACKUP REPORT (existing)
    // =============================================
    if (action === "backup-report") {
      const { device_id: agentDeviceId, hostname, user_email, backup_date, folders, total_size_bytes, file_count, storage_path, status: bkStatus, error_log: bkError } = body;

      if (!agentDeviceId) {
        return new Response(JSON.stringify({ error: "device_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: dev } = await supabase.from("devices").select("id, company_id").eq("device_id", agentDeviceId).single();

      const backupData = {
        device_id: dev?.id || null,
        hostname: hostname || agentDeviceId,
        user_email: user_email || "unknown",
        backup_date: backup_date || new Date().toISOString().split("T")[0],
        folders: folders || ["Documents", "Desktop", "Pictures"],
        total_size_bytes: total_size_bytes || 0,
        file_count: file_count || 0,
        storage_path: storage_path || null,
        status: bkStatus || "completed",
        error_log: bkError || null,
        completed_at: new Date().toISOString(),
        started_at: body.started_at || new Date().toISOString(),
        company_id: dev?.company_id || null,
      };

      await supabase.from("backups").insert(backupData);

      if (dev) {
        await supabase.from("system_logs").insert({
          device_id: dev.id,
          action: "backup_completed",
          category: "backup",
          severity: bkStatus === "failed" ? "error" : "info",
          message: `Backup ${bkStatus} on ${hostname || agentDeviceId}: ${total_size_bytes ? Math.round(total_size_bytes / 1024 / 1024) + " MB" : "unknown size"}`,
          company_id: dev.company_id || null,
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // GET PROFILE (existing)
    // =============================================
    if (action === "get-profile") {
      const { role_name } = body;

      if (!role_name) {
        return new Response(JSON.stringify({ error: "role_name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabase
        .from("role_profiles")
        .select("id, name, display_name, permissions_level")
        .eq("name", role_name)
        .single();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Profile not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: sw } = await supabase
        .from("role_profile_software")
        .select("software_name, category, install_command, is_required")
        .eq("profile_id", profile.id)
        .order("category");

      return new Response(JSON.stringify({
        profile: { name: profile.name, display_name: profile.display_name, permissions_level: profile.permissions_level },
        software: sw || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // GET EMAIL CONFIG (existing)
    // =============================================
    if (action === "get-email-config") {
      const { user_email: emailUser, device_id: agentDev } = body;

      if (!emailUser && !agentDev) {
        return new Response(JSON.stringify({ error: "user_email or device_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let query = supabase.from("email_configs").select("*").eq("status", "pending");
      if (agentDev) {
        const { data: dev } = await supabase.from("devices").select("id").eq("device_id", agentDev).single();
        if (dev) query = query.eq("device_id", dev.id);
      } else {
        query = query.eq("user_email", emailUser);
      }

      const { data: emailConfigs } = await query.limit(5);

      return new Response(JSON.stringify({
        configs: emailConfigs || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // EMAIL RESULT (existing)
    // =============================================
    if (action === "email-result") {
      const { config_id, status: emailStatus, error_log: emailError } = body;

      if (!config_id) {
        return new Response(JSON.stringify({ error: "config_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("email_configs").update({
        status: emailStatus || "applied",
        applied_at: new Date().toISOString(),
        error_log: emailError || null,
      }).eq("id", config_id);

      const { data: cfg } = await supabase
        .from("email_configs")
        .select("id, device_id, provider, user_email, company_id")
        .eq("id", config_id)
        .single();
      if (cfg) {
        await supabase.from("system_logs").insert({
          device_id: cfg.device_id,
          action: "email_configured",
          category: "automation",
          severity: emailStatus === "failed" ? "error" : "info",
          message: `Email ${cfg.provider} ${emailStatus} for ${cfg.user_email}`,
          company_id: cfg.company_id || null,
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // GET FIREWALL RULES FOR DEVICE
    // =============================================
    if (action === "get-firewall-rules") {
      const { device_id: agentDevId } = body;

      let query = supabase
        .from("firewall_rules")
        .select("*")
        .eq("enabled", true)
        .order("priority", { ascending: true });

      // If device_id provided, get device-specific + global rules
      if (agentDevId) {
        const { data: dev } = await supabase
          .from("devices")
          .select("id")
          .eq("device_id", agentDevId)
          .single();

        if (dev) {
          query = supabase
            .from("firewall_rules")
            .select("*")
            .eq("enabled", true)
            .or(`device_id.eq.${dev.id},device_id.is.null`)
            .order("priority", { ascending: true });
        }
      }

      const { data: rules, error: rulesError } = await query;

      if (rulesError) {
        return new Response(JSON.stringify({ error: rulesError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ rules: rules || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // FIREWALL RESULT (agent reports applied rules)
    // =============================================
    if (action === "firewall-result") {
      const { device_id: agentDevId, rule_ids, status: fwStatus } = body;

      if (rule_ids && Array.isArray(rule_ids) && rule_ids.length > 0) {
        await supabase
          .from("firewall_rules")
          .update({
            status: fwStatus || "applied",
            applied_at: new Date().toISOString(),
          })
          .in("id", rule_ids);

        // Log
        let devUuid = null;
        let devCompanyId = null;
        if (agentDevId) {
          const { data: dev } = await supabase
            .from("devices")
            .select("id, company_id")
            .eq("device_id", agentDevId)
            .single();
          devUuid = dev?.id || null;
          devCompanyId = dev?.company_id || null;
        }

        await supabase.from("system_logs").insert({
          device_id: devUuid,
          action: "firewall_rules_applied",
          category: "firewall",
          severity: "info",
          message: `${rule_ids.length} firewall rules applied on device ${agentDevId || "unknown"}`,
          details: { rule_ids, status: fwStatus },
          company_id: devCompanyId,
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // POLICY SYNC (enterprise firewall)
    // =============================================
    if (action === "policy-sync") {
      const { device_id: agentDevId } = body;

      let deviceCompanyId: string | null = null;
      if (agentDevId) {
        const { data: device } = await supabase
          .from("devices")
          .select("company_id")
          .eq("device_id", agentDevId)
          .maybeSingle();
        deviceCompanyId = device?.company_id ?? null;
      }

      if (!deviceCompanyId) {
        return new Response(JSON.stringify({
          blocked_domains: [],
          blocked_categories: [],
          blocked_applications: [],
          vpn_block_enabled: false,
          vpn_blocked_ports: [],
          usb_storage_block_enabled: false,
          usb_ports_block_enabled: false,
          schedules: [],
          policy_version: Date.now(),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get blocked domains from active categories in firewall_rules
      const { data: blockedRules } = await supabase
        .from("firewall_rules")
        .select("rule_name, destination_ip")
        .eq("action", "block")
        .eq("enabled", true)
        .eq("company_id", deviceCompanyId);

      type FirewallRuleProjection = { rule_name: string | null; destination_ip: string | null };
      type DomainProjection = { domain: string; category: string };

      const typedBlockedRules = (blockedRules ?? []) as FirewallRuleProjection[];
      const ruleBlockedDomains = typedBlockedRules
        .map((rule) => rule.destination_ip)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

      // Get domains from firewall_domain_database for categories that have active rules
      const { data: dbDomains } = await supabase
        .from("firewall_domain_database")
        .select("domain, category")
        .or(`company_id.is.null,company_id.eq.${deviceCompanyId}`);

      // Get active schedules
      const { data: schedules } = await supabase
        .from("firewall_schedules")
        .select("*")
        .eq("enabled", true)
        .eq("company_id", deviceCompanyId);

      // Get blocked applications
      const { data: blockedApps } = await supabase
        .from("blocked_applications")
        .select("app_name, process_name, category")
        .eq("enabled", true)
        .eq("company_id", deviceCompanyId);

      // Check which categories are blocked (have firewall_rules with action=block)
      const blockedCategories = new Set<string>();
      const typedDbDomains = (dbDomains ?? []) as DomainProjection[];
      for (const rule of typedBlockedRules) {
        // Check if this domain belongs to a category
        const match = typedDbDomains.find((domainItem) => domainItem.domain === rule.destination_ip);
        if (match) blockedCategories.add(match.category);
      }

      // Build full blocked domains list from categories
      const allBlockedDomains = new Set(ruleBlockedDomains);
      for (const cat of blockedCategories) {
        for (const d of typedDbDomains.filter((domainItem) => domainItem.category === cat)) {
          allBlockedDomains.add(d.domain);
        }
      }

      // VPN blocking - check if vpn category is blocked
      const vpnBlockEnabled = blockedCategories.has("vpn") || typedBlockedRules.some((rule) =>
        typeof rule.rule_name === "string" && rule.rule_name.startsWith("VPN-Block-Port-")
      );
      const usbStorageBlockEnabled = typedBlockedRules.some((rule) =>
        rule.rule_name === "USB-Storage-Block" || rule.rule_name === "USB-All-Ports-Block"
      );

      // Update last_seen for device
      if (agentDevId) {
        await supabase
          .from("devices")
          .update({ last_seen: new Date().toISOString() })
          .eq("device_id", agentDevId);
      }

      return new Response(JSON.stringify({
        blocked_domains: Array.from(allBlockedDomains),
        blocked_categories: Array.from(blockedCategories),
        blocked_applications: blockedApps || [],
        vpn_block_enabled: vpnBlockEnabled,
        vpn_blocked_ports: vpnBlockEnabled ? [1194, 1701, 1723, 500, 4500] : [],
        usb_storage_block_enabled: usbStorageBlockEnabled,
        usb_ports_block_enabled: usbStorageBlockEnabled,
        schedules: schedules || [],
        policy_version: Date.now(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // BYPASS ATTEMPT REPORT
    // =============================================
    if (action === "bypass-report") {
      const { device_id: agentDevId, attempt_type, details } = body;

      let devUuid = null;
      let devCompanyId = null;
      if (agentDevId) {
        const { data: dev } = await supabase
          .from("devices")
          .select("id, company_id")
          .eq("device_id", agentDevId)
          .single();
        devUuid = dev?.id || null;
        devCompanyId = dev?.company_id || null;
      }

      await supabase.from("firewall_bypass_attempts").insert({
        device_id: devUuid,
        attempt_type: attempt_type || "unknown",
        details: details || {},
        company_id: devCompanyId,
      });

      if (devUuid) {
        await supabase.from("system_logs").insert({
          device_id: devUuid,
          action: "bypass_attempt_detected",
          category: "firewall",
          severity: "warning",
          message: `Bypass attempt (${attempt_type}) detected on device ${agentDevId}`,
          details: details || {},
          company_id: devCompanyId,
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // GET LICENSES FOR DEVICE
    // =============================================
    if (action === "get-licenses") {
      const { device_id: agentDevId } = body;

      if (!agentDevId) {
        return new Response(JSON.stringify({ error: "device_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: dev } = await supabase
        .from("devices")
        .select("id")
        .eq("device_id", agentDevId)
        .single();

      if (!dev) {
        return new Response(JSON.stringify({ licenses: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: licenses } = await supabase
        .from("licenses")
        .select("id, product, license_key, license_type")
        .eq("assigned_device_id", dev.id)
        .eq("status", "assigned");

      return new Response(JSON.stringify({ licenses: licenses || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // LICENSE ACTIVATION RESULT
    // =============================================
    if (action === "license-result") {
      const { license_id, status: licStatus, error_log: licError } = body;

      if (!license_id) {
        return new Response(JSON.stringify({ error: "license_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("licenses").update({
        status: licStatus || "activated",
        activation_date: new Date().toISOString().split("T")[0],
        notes: licError ? `Error: ${licError}` : null,
      }).eq("id", license_id);

      const { data: licenseData } = await supabase
        .from("licenses")
        .select("company_id")
        .eq("id", license_id)
        .single();

      await supabase.from("system_logs").insert({
        action: "license_activated",
        category: "automation",
        severity: licStatus === "failed" ? "error" : "info",
        message: `License ${license_id} ${licStatus || "activated"}`,
        details: { license_id, error_log: licError },
        company_id: licenseData?.company_id || null,
      });

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
