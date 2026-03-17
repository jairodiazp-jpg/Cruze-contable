import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Auto-remediation actions by ticket category (typed-safe only).
const REMEDIATION_SCRIPTS: Record<string, { name: string; type: string; content: string }> = {
  red: {
    name: "Auto-Fix: Diagnóstico de Red",
    type: "network-repair",
    content: "",
  },
  software: {
    name: "Auto-Fix: Diagnóstico de Software",
    type: "diagnostic",
    content: "",
  },
  hardware: {
    name: "Auto-Fix: Diagnóstico de Hardware",
    type: "diagnostic",
    content: "",
  },
  acceso: {
    name: "Auto-Fix: Verificación de Acceso",
    type: "diagnostic",
    content: "",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { ticket_id } = await req.json();

    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the device for this user
    const { data: device } = await supabase
      .from("devices")
      .select("id, hostname, device_id, agent_installed")
      .eq("user_assigned", ticket.requester)
      .eq("company_id", ticket.company_id)
      .eq("agent_installed", true)
      .single();

    if (!device) {
      // No agent available, skip auto-remediation
      await supabase.from("system_logs").insert({
        action: "auto_remediation_skipped",
        category: "automation",
        severity: "info",
        message: `No agent found for user "${ticket.requester}" - ticket ${ticket.code} requires manual attention`,
        details: { ticket_id, category: ticket.category },
        company_id: ticket.company_id,
      });

      return new Response(JSON.stringify({
        status: "skipped",
        reason: "no_agent",
        message: "No agent available for this user",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get remediation script for category
    const script = REMEDIATION_SCRIPTS[ticket.category];
    if (!script) {
      return new Response(JSON.stringify({
        status: "skipped",
        reason: "no_script",
        message: `No auto-remediation script for category: ${ticket.category}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create script execution
    const { data: execution, error: execError } = await supabase
      .from("script_executions")
      .insert({
        device_id: device.id,
        ticket_id,
        script_name: script.name,
        script_type: script.type,
        script_content: script.content,
        status: "pending",
        executed_by: ticket.created_by,
        company_id: ticket.company_id,
      })
      .select("id")
      .single();

    if (execError) {
      return new Response(JSON.stringify({ error: execError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update ticket status to show auto-remediation is in progress
    await supabase
      .from("tickets")
      .update({ status: "en_proceso", assigned_tech: "Auto-Remediación" })
      .eq("id", ticket_id);

    // Log the action
    await supabase.from("system_logs").insert({
      device_id: device.id,
      action: "auto_remediation_triggered",
      category: "automation",
      severity: "info",
      message: `Auto-remediation "${script.name}" dispatched to ${device.hostname} for ticket ${ticket.code}`,
      details: { ticket_id, execution_id: execution.id, category: ticket.category },
      company_id: ticket.company_id,
    });

    return new Response(JSON.stringify({
      status: "dispatched",
      execution_id: execution.id,
      device: device.hostname,
      script: script.name,
      message: "Auto-remediation script dispatched to agent",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
