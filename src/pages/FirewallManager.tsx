import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { queueScriptExecutions } from "@/lib/scriptExecutions";
import {
  Flame, Plus, Search, ShieldCheck, ShieldX, RefreshCw, Trash2, Ban, Globe,
  Monitor, Clock, AlertTriangle, Activity, AppWindow, Lock, Eye
} from "lucide-react";

interface FirewallRule {
  id: string;
  device_id: string | null;
  rule_name: string;
  direction: string;
  action: string;
  protocol: string;
  port_start: number;
  port_end: number | null;
  source_ip: string | null;
  destination_ip: string | null;
  profile_id: string | null;
  priority: number;
  enabled: boolean;
  status: string;
  applied_at: string | null;
  error_log: string | null;
  created_at: string;
}

interface RoleProfile {
  id: string;
  display_name: string;
}

interface BlockedApp {
  id: string;
  app_name: string;
  process_name: string;
  category: string;
  enabled: boolean;
}

interface FirewallSchedule {
  id: string;
  category: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  enabled: boolean;
}

interface BypassAttempt {
  id: string;
  device_id: string | null;
  attempt_type: string;
  details: any;
  detected_at: string;
}

interface DomainCategory {
  category: string;
  count: number;
}

interface FirewallExecutionStatus {
  device_id: string | null;
  script_name: string;
  script_type: string;
  status: string;
  error_log: string | null;
  created_at: string;
  devices?: {
    hostname?: string | null;
    device_id?: string | null;
  } | null;
}

interface CategoryDeploymentSummary {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  lastAction: "block" | "unblock" | null;
  lastAt: string | null;
}

interface CategoryDeviceDeployment {
  deviceId: string;
  hostname: string;
  status: string;
  at: string;
  action: "block" | "unblock" | null;
}

const CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  youtube: { icon: "🎬", label: "YouTube", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  social: { icon: "📱", label: "Redes Sociales", color: "bg-pink-500/10 text-pink-400 border-pink-500/30" },
  streaming: { icon: "🎥", label: "Streaming", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  gaming: { icon: "🎮", label: "Gaming", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  adult: { icon: "🔞", label: "Contenido Adulto", color: "bg-red-600/10 text-red-500 border-red-600/30" },
  vpn: { icon: "🔒", label: "VPN", color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  proxy: { icon: "🌐", label: "Proxy", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  torrent: { icon: "⬇️", label: "Torrent", color: "bg-gray-500/10 text-gray-400 border-gray-500/30" },
  shopping: { icon: "🛒", label: "Shopping", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  "ai-tools": { icon: "🤖", label: "AI Tools", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
  dating: { icon: "💕", label: "Dating", color: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
};

const DEFAULT_DOMAIN_CATEGORIES: DomainCategory[] = Object.keys(CATEGORY_META).map((category) => ({
  category,
  count: 0,
}));

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  applied: "bg-green-500/10 text-green-400 border-green-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function FirewallManager() {
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "Tu usuario no tiene empresa asociada. No se pueden aplicar reglas de firewall.",
  });
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [categories, setCategories] = useState<DomainCategory[]>([]);
  const [categoryDomains, setCategoryDomains] = useState<Record<string, string[]>>({});
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([]);
  const [schedules, setSchedules] = useState<FirewallSchedule[]>([]);
  const [bypassAttempts, setBypassAttempts] = useState<BypassAttempt[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);
  const [categoryDeployments, setCategoryDeployments] = useState<Record<string, CategoryDeploymentSummary>>({});
  const [categoryDeploymentDetails, setCategoryDeploymentDetails] = useState<Record<string, CategoryDeviceDeployment[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [applyingCategory, setApplyingCategory] = useState<string | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    rule_name: "", direction: "inbound", action: "allow", protocol: "tcp",
    port_start: "", port_end: "", source_ip: "", destination_ip: "", profile_id: "", priority: "100",
  });

  const [appForm, setAppForm] = useState({ app_name: "", process_name: "", category: "general" });
  const [scheduleForm, setScheduleForm] = useState({
    category: "social", start_time: "08:00", end_time: "18:00", days_of_week: [1, 2, 3, 4, 5],
  });

  const buildCategoryFromScriptName = (scriptName: string) => {
    const match = scriptName.match(/^(Bloquear|Desbloquear)\s+(.+)\s+\(hosts\)$/i);
    if (!match) return { categoryKey: null, action: null as "block" | "unblock" | null };

    const action: "block" | "unblock" = match[1].toLowerCase() === "bloquear" ? "block" : "unblock";
    const categoryLabel = match[2].trim().toLowerCase();

    const found = Object.entries(CATEGORY_META).find(([, meta]) => meta.label.toLowerCase() === categoryLabel);
    return { categoryKey: found?.[0] ?? null, action };
  };

  const fetchData = useCallback(async () => {
    const [rulesRes, profilesRes, catRes, appsRes, schedRes, bypassRes, devRes, execRes] = await Promise.all([
      withCompanyScope(supabase.from("firewall_rules").select("*")).order("priority", { ascending: true }),
      withCompanyScope(supabase.from("role_profiles").select("id, display_name")),
      supabase.from("firewall_domain_database").select("category, domain"),
      withCompanyScope(supabase.from("blocked_applications").select("*")).order("category"),
      withCompanyScope(supabase.from("firewall_schedules").select("*")).order("category"),
      withCompanyScope(supabase.from("firewall_bypass_attempts").select("*")).order("detected_at", { ascending: false }).limit(50),
      withCompanyScope(supabase.from("devices").select("id", { count: "exact" })).eq("agent_installed", true),
      withCompanyScope(
        supabase
          .from("script_executions")
          .select("device_id, script_name, script_type, status, error_log, created_at, devices(hostname, device_id)")
          .in("script_type", ["firewall-block", "firewall-unblock"])
          .order("created_at", { ascending: false })
          .limit(200)
      ),
    ]);

    if (rulesRes.error) toast({ title: "Error", description: rulesRes.error.message, variant: "destructive" });
    else setRules(rulesRes.data || []);
    if (!profilesRes.error) setProfiles(profilesRes.data || []);

    // Aggregate categories
    if (!catRes.error && catRes.data) {
      const catMap: Record<string, number> = {};
      const domainsByCategory: Record<string, string[]> = {};
      catRes.data.forEach((d: any) => {
        catMap[d.category] = (catMap[d.category] || 0) + 1;
        if (!domainsByCategory[d.category]) {
          domainsByCategory[d.category] = [];
        }
        domainsByCategory[d.category].push(d.domain);
      });
      const aggregated = Object.entries(catMap).map(([category, count]) => ({ category, count }));
      const merged = new Map<string, number>();
      DEFAULT_DOMAIN_CATEGORIES.forEach((item) => merged.set(item.category, item.count));
      aggregated.forEach((item) => merged.set(item.category, item.count));
      setCategories(Array.from(merged.entries()).map(([category, count]) => ({ category, count })));
      setCategoryDomains(domainsByCategory);
    } else {
      if (catRes.error) {
        toast({ title: "Error catálogo de dominios", description: catRes.error.message, variant: "destructive" });
      }
      setCategories(DEFAULT_DOMAIN_CATEGORIES);
      setCategoryDomains({});
    }

    if (!appsRes.error) setBlockedApps(appsRes.data || []);
    if (!schedRes.error) setSchedules(schedRes.data || []);
    if (!bypassRes.error) setBypassAttempts(bypassRes.data || []);
    setDeviceCount(devRes.count || 0);

    if (!execRes.error && execRes.data) {
      const baseSummary: Record<string, CategoryDeploymentSummary> = {};
      const detailsByCategory: Record<string, CategoryDeviceDeployment[]> = {};
      const lastPerCategoryDevice = new Map<string, CategoryDeviceDeployment>();

      Object.keys(CATEGORY_META).forEach((key) => {
        baseSummary[key] = {
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
          lastAction: null,
          lastAt: null,
        };
        detailsByCategory[key] = [];
      });

      (execRes.data as FirewallExecutionStatus[]).forEach((exec) => {
        const { categoryKey, action } = buildCategoryFromScriptName(exec.script_name || "");
        if (!categoryKey || !baseSummary[categoryKey]) return;

        if (exec.status === "pending") baseSummary[categoryKey].pending += 1;
        if (exec.status === "running") baseSummary[categoryKey].running += 1;
        if (exec.status === "completed") baseSummary[categoryKey].completed += 1;
        if (exec.status === "failed") baseSummary[categoryKey].failed += 1;

        if (!baseSummary[categoryKey].lastAt) {
          baseSummary[categoryKey].lastAt = exec.created_at;
          baseSummary[categoryKey].lastAction = action;
        }

        const deviceId = exec.device_id || "unknown-device";
        const hostname = exec.devices?.hostname || exec.devices?.device_id || "Dispositivo";
        const detailKey = `${categoryKey}:${deviceId}`;
        if (!lastPerCategoryDevice.has(detailKey)) {
          lastPerCategoryDevice.set(detailKey, {
            deviceId,
            hostname,
            status: exec.status,
            at: exec.created_at,
            action,
          });
        }
      });

      lastPerCategoryDevice.forEach((item, key) => {
        const categoryKey = key.split(":")[0];
        if (!detailsByCategory[categoryKey]) return;
        detailsByCategory[categoryKey].push(item);
      });

      Object.keys(detailsByCategory).forEach((categoryKey) => {
        detailsByCategory[categoryKey] = detailsByCategory[categoryKey]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 4);
      });

      setCategoryDeployments(baseSummary);
      setCategoryDeploymentDetails(detailsByCategory);
    }

    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();

    const intervalId = setInterval(() => {
      fetchData();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [companyId, companyLoading, fetchData]);

  // ---- Existing handlers (preserved) ----
  const handleCreate = async () => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    if (!form.rule_name || !form.port_start) {
      toast({ title: "Error", description: "Nombre y puerto son requeridos", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("firewall_rules").insert({
      rule_name: form.rule_name, direction: form.direction, action: form.action, protocol: form.protocol,
      port_start: Number(form.port_start), port_end: form.port_end ? Number(form.port_end) : null,
      source_ip: form.source_ip || null, destination_ip: form.destination_ip || null,
      profile_id: form.profile_id || null, priority: Number(form.priority), company_id: scopedCompanyId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regla de firewall creada" });
      setDialogOpen(false);
      setForm({ rule_name: "", direction: "inbound", action: "allow", protocol: "tcp", port_start: "", port_end: "", source_ip: "", destination_ip: "", profile_id: "", priority: "100" });
      fetchData();
    }
  };

  const generateBlockScript = (domains: string[], action: "block" | "unblock") => {
    const marker = "# IT-SERVICE-DESK-FIREWALL";
    if (action === "block") {
      return {
        bash: `#!/bin/bash\nHOSTS="/etc/hosts"\nMARKER="${marker}"\necho "" >> "$HOSTS"\necho "$MARKER BEGIN" >> "$HOSTS"\ncat >> "$HOSTS" << 'BLOCKLIST'\n${domains.flatMap(d => d.startsWith("www.") ? [`0.0.0.0 ${d}`] : [`0.0.0.0 ${d}`, `0.0.0.0 www.${d}`]).join("\n")}\nBLOCKLIST\necho "$MARKER END" >> "$HOSTS"\nif [[ "$OSTYPE" == "darwin"* ]]; then dscacheutil -flushcache 2>/dev/null; killall -HUP mDNSResponder 2>/dev/null; else systemd-resolve --flush-caches 2>/dev/null || resolvectl flush-caches 2>/dev/null; fi\necho "Blocked ${domains.length} domains"`,
        powershell: `$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"\n$marker = "${marker}"\n$entries = @(\n${domains.flatMap(d => d.startsWith("www.") ? [`"0.0.0.0 ${d}"`] : [`"0.0.0.0 ${d}"`, `"0.0.0.0 www.${d}"`]).join(",\n")}\n)\nAdd-Content -Path $hostsPath -Value ""\nAdd-Content -Path $hostsPath -Value "$marker BEGIN"\n$entries | ForEach-Object { Add-Content -Path $hostsPath -Value $_ }\nAdd-Content -Path $hostsPath -Value "$marker END"\nipconfig /flushdns | Out-Null\nWrite-Output "Blocked ${domains.length} domains"`,
      };
    } else {
      return {
        bash: `#!/bin/bash\nHOSTS="/etc/hosts"\nMARKER="${marker}"\nsed -i.bak "/$MARKER BEGIN/,/$MARKER END/d" "$HOSTS" 2>/dev/null || sed -i '' "/$MARKER BEGIN/,/$MARKER END/d" "$HOSTS"\nif [[ "$OSTYPE" == "darwin"* ]]; then dscacheutil -flushcache 2>/dev/null; killall -HUP mDNSResponder 2>/dev/null; else systemd-resolve --flush-caches 2>/dev/null; fi\necho "Unblocked domains"`,
        powershell: `$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"\n$marker = "${marker}"\n$content = Get-Content $hostsPath\n$inBlock = $false\n$newContent = @()\nforeach ($line in $content) {\n  if ($line -match [regex]::Escape("$marker BEGIN")) { $inBlock = $true; continue }\n  if ($line -match [regex]::Escape("$marker END")) { $inBlock = $false; continue }\n  if (-not $inBlock) { $newContent += $line }\n}\n$newContent | Set-Content $hostsPath\nipconfig /flushdns | Out-Null\nWrite-Output "Unblocked domains"`,
      };
    }
  };

  const deployToAllDevices = async (domains: string[], categoryName: string, action: "block" | "unblock") => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    let devicesQuery = supabase
      .from("devices").select("id, hostname, operating_system").eq("agent_installed", true);
    devicesQuery = devicesQuery.eq("company_id", scopedCompanyId);
    const { data: devices } = await devicesQuery;
    if (!devices || devices.length === 0) {
      toast({ title: "Sin dispositivos", description: "No hay dispositivos con agente instalado", variant: "destructive" });
      return;
    }
    const actionLabel = action === "block" ? "Bloquear" : "Desbloquear";
    const scriptType = action === "block" ? "firewall-block" : "firewall-unblock";
    const payloadContent = action === "block"
      ? domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean).join("\n")
      : "";
    const executions = devices.map(device => ({
      device_id: device.id,
      script_name: `${actionLabel} ${categoryName} (hosts)`,
      script_type: scriptType,
      script_content: payloadContent,
      status: "pending" as const,
      company_id: scopedCompanyId,
    }));
    const { error } = await queueScriptExecutions({ ensureCompanyId, executions });
    if (error) console.error("Error deploying scripts:", error);
    else toast({ title: `Desplegado a ${devices.length} dispositivos`, description: `${actionLabel} ${categoryName} en todos los equipos` });
  };

  const handleApplyCategory = async (category: string) => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    setApplyingCategory(category);
    const { data: domains } = await supabase
      .from("firewall_domain_database").select("domain").eq("category", category);
    if (!domains || domains.length === 0) {
      toast({ title: "Sin dominios", description: "Esta categoría no tiene dominios cargados aún en el catálogo.", variant: "destructive" });
      setApplyingCategory(null);
      return;
    }
    const domainList = domains.map((d: any) => d.domain);
    const ruleNames = new Set(domainList.map((domain) => `Bloquear ${domain}`));
    const matchingRules = rules.filter((rule) => rule.action === "block" && ruleNames.has(rule.rule_name));
    const existingNames = new Set(matchingRules.map((rule) => rule.rule_name));
    const disabledRuleIds = matchingRules
      .filter((rule) => !rule.enabled || rule.status !== "applied")
      .map((rule) => rule.id);
    const newDomains = domainList.filter((domain) => !existingNames.has(`Bloquear ${domain}`));

    if (newDomains.length === 0 && disabledRuleIds.length === 0) {
      toast({ title: "Ya aplicado", description: `Todas las reglas de ${category} ya existen` });
      setApplyingCategory(null);
      return;
    }

    const newRules = newDomains.map((domain, i) => ({
      rule_name: `Bloquear ${domain}`, direction: "outbound", action: "block", protocol: "any",
      port_start: 443, port_end: null, source_ip: null, destination_ip: domain,
      profile_id: null, priority: 10 + i, enabled: true, status: "applied", applied_at: new Date().toISOString(), company_id: scopedCompanyId,
    }));

    let updateError = null;
    if (disabledRuleIds.length > 0) {
      let reenableQuery = supabase
        .from("firewall_rules")
        .update({ enabled: true, status: "applied", applied_at: new Date().toISOString() })
        .in("id", disabledRuleIds);
      reenableQuery = reenableQuery.eq("company_id", scopedCompanyId);
      const { error } = await reenableQuery;
      updateError = error;
    }

    let insertError = null;
    if (newRules.length > 0) {
      const { error } = await supabase.from("firewall_rules").insert(newRules);
      insertError = error;
    }

    if (updateError || insertError) {
      const errorMessage = updateError?.message || insertError?.message || "No se pudo aplicar la categoría";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } else {
      const meta = CATEGORY_META[category];
      await deployToAllDevices(domainList, meta?.label || category, "block");
      const appliedCount = newDomains.length + disabledRuleIds.length;
      toast({ title: `${meta?.label || category} bloqueado`, description: `${appliedCount} reglas aplicadas o reactivadas` });
      fetchData();
    }
    setApplyingCategory(null);
  };

  const handleRemoveCategory = async (category: string) => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    const { data: domains } = await supabase
      .from("firewall_domain_database").select("domain").eq("category", category);
    if (!domains) return;
    const domainList = domains.map((d: any) => d.domain);
    const ruleNames = domainList.map(d => `Bloquear ${d}`);
    const idsToDelete = rules.filter(r => ruleNames.includes(r.rule_name)).map(r => r.id);
    if (idsToDelete.length === 0) {
      toast({ title: "Sin reglas", description: `No hay reglas de ${category} para eliminar` });
      return;
    }
    let deleteQuery = supabase.from("firewall_rules").delete().in("id", idsToDelete);
    deleteQuery = deleteQuery.eq("company_id", scopedCompanyId);
    const { error } = await deleteQuery;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const meta = CATEGORY_META[category];
      await deployToAllDevices(domainList, meta?.label || category, "unblock");
      toast({ title: `${meta?.label || category} desbloqueado`, description: `${idsToDelete.length} reglas eliminadas` });
      fetchData();
    }
  };

  const getCategoryBlockedCount = (category: string) => {
    const domains = categoryDomains[category] || [];
    if (domains.length === 0) return 0;

    const categoryRuleNames = new Set(domains.map((domain) => `Bloquear ${domain}`));
    return rules.filter((rule) => rule.enabled && rule.action === "block" && categoryRuleNames.has(rule.rule_name)).length;
  };

  const isCategoryApplied = (category: string) => getCategoryBlockedCount(category) > 0;

  const usbStorageBlocked = rules.some(r => (r.rule_name === "USB-Storage-Block" || r.rule_name === "USB-All-Ports-Block") && r.enabled);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    let query = supabase.from("firewall_rules").update({ enabled: !enabled }).eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else fetchData();
  };

  const handleApply = async (id: string) => {
    let query = supabase.from("firewall_rules").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Regla aplicada" }); fetchData(); }
  };

  const handleDelete = async (id: string) => {
    let query = supabase.from("firewall_rules").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Regla eliminada" }); fetchData(); }
  };

  // ---- New: Blocked Apps ----
  const handleCreateApp = async () => {
    if (!appForm.app_name || !appForm.process_name) {
      toast({ title: "Error", description: "Nombre y proceso son requeridos", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("blocked_applications").insert({ ...appForm, company_id: companyId || null } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Aplicación bloqueada" }); setAppDialogOpen(false); setAppForm({ app_name: "", process_name: "", category: "general" }); fetchData(); }
  };

  const toggleApp = async (id: string, enabled: boolean) => {
    let query = supabase.from("blocked_applications").update({ enabled: !enabled }).eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    await query;
    fetchData();
  };

  const deleteApp = async (id: string) => {
    let query = supabase.from("blocked_applications").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    await query;
    fetchData();
  };

  // ---- New: Schedules ----
  const handleCreateSchedule = async () => {
    const { error } = await supabase.from("firewall_schedules").insert({ ...scheduleForm, company_id: companyId || null } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Horario creado" }); setScheduleDialogOpen(false); fetchData(); }
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    let query = supabase.from("firewall_schedules").update({ enabled: !enabled }).eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    await query;
    fetchData();
  };

  const deleteSchedule = async (id: string) => {
    let query = supabase.from("firewall_schedules").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    await query;
    fetchData();
  };

  // ---- VPN Blocking ----
  const handleToggleVpnBlock = async () => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    const vpnApplied = rules.some(r => r.rule_name.startsWith("VPN-Block-Port-") && r.enabled);
    if (vpnApplied) {
      const vpnIds = rules.filter(r => r.rule_name.startsWith("VPN-Block-Port-")).map(r => r.id);
      let query = supabase.from("firewall_rules").delete().in("id", vpnIds);
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      await query;
      toast({ title: "VPN desbloqueado", description: "Puertos VPN desbloqueados" });
    } else {
      const vpnPorts = [1194, 1701, 1723, 500, 4500];
      const vpnRules = vpnPorts.map((port, i) => ({
        rule_name: `VPN-Block-Port-${port}`, direction: "outbound", action: "block",
        protocol: port === 1194 ? "udp" : "any", port_start: port, port_end: null,
        source_ip: null, destination_ip: null, profile_id: null,
        priority: 5 + i, enabled: true, status: "applied", applied_at: new Date().toISOString(),
      }));
      await supabase.from("firewall_rules").insert(vpnRules.map(rule => ({ ...rule, company_id: scopedCompanyId })) as any);
      toast({ title: "VPN bloqueado", description: "Puertos VPN comunes bloqueados (1194, 1701, 1723, 500, 4500)" });
    }
    fetchData();
  };

  const handleToggleUsbStorageBlock = async () => {
    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) return;

    if (usbStorageBlocked) {
      let query = supabase.from("firewall_rules").delete().in("rule_name", ["USB-Storage-Block", "USB-All-Ports-Block"]);
      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { error } = await query;
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      toast({ title: "USB desbloqueado", description: "Se reactivaron los puertos USB en dispositivos con agente." });
    } else {
      const { error } = await supabase.from("firewall_rules").insert({
        rule_name: "USB-All-Ports-Block",
        direction: "outbound",
        action: "block",
        protocol: "any",
        port_start: 0,
        port_end: null,
        source_ip: null,
        destination_ip: null,
        profile_id: null,
        priority: 4,
        enabled: true,
        status: "applied",
        applied_at: new Date().toISOString(),
        company_id: scopedCompanyId,
      } as any);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      toast({ title: "USB bloqueado", description: "Se bloquearon todos los puertos USB en dispositivos con agente." });
    }

    fetchData();
  };

  const filtered = rules.filter(r =>
    r.rule_name.toLowerCase().includes(search.toLowerCase()) ||
    r.protocol.toLowerCase().includes(search.toLowerCase()) ||
    (r.destination_ip || "").toLowerCase().includes(search.toLowerCase())
  );

  const allowCount = rules.filter(r => r.action === "allow" && r.enabled).length;
  const blockCount = rules.filter(r => r.action === "block" && r.enabled).length;
  const appliedCount = rules.filter(r => r.status === "applied").length;
  const vpnBlocked = rules.some(r => r.rule_name.startsWith("VPN-Block-Port-") && r.enabled);
  const enabledApps = blockedApps.filter(a => a.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Firewall Manager</h1>
          <p className="text-muted-foreground text-sm">Gestión empresarial de políticas de firewall, dominios, aplicaciones y VPN</p>
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-1" /> Actualizar</Button>
        </div>
      </div>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Ban className="h-3 w-3" /> Dominios Bloqueados</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{blockCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AppWindow className="h-3 w-3" /> Apps Bloqueadas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-400">{enabledApps}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Intentos Bypass</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-400">{bypassAttempts.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Monitor className="h-3 w-3" /> Dispositivos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{deviceCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> VPN Block</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{vpnBlocked ? <span className="text-destructive">ON</span> : <span className="text-muted-foreground">OFF</span>}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Puertos USB</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{usbStorageBlocked ? <span className="text-destructive">ON</span> : <span className="text-muted-foreground">OFF</span>}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Reglas Aplicadas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-400">{appliedCount}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger className="shrink-0" value="categories"><Ban className="h-4 w-4 mr-1" /> Categorías</TabsTrigger>
          <TabsTrigger className="shrink-0" value="apps"><AppWindow className="h-4 w-4 mr-1" /> Aplicaciones</TabsTrigger>
          <TabsTrigger className="shrink-0" value="vpn"><Lock className="h-4 w-4 mr-1" /> VPN</TabsTrigger>
          <TabsTrigger className="shrink-0" value="usb"><Lock className="h-4 w-4 mr-1" /> USB</TabsTrigger>
          <TabsTrigger className="shrink-0" value="schedules"><Clock className="h-4 w-4 mr-1" /> Horarios</TabsTrigger>
          <TabsTrigger className="shrink-0" value="bypass"><AlertTriangle className="h-4 w-4 mr-1" /> Anti-Bypass</TabsTrigger>
          <TabsTrigger className="shrink-0" value="rules"><Flame className="h-4 w-4 mr-1" /> Reglas</TabsTrigger>
        </TabsList>

        {/* ============ CATEGORIES TAB ============ */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" />
                Bloqueo por Categorías
              </CardTitle>
              <p className="text-sm text-muted-foreground">Bloquea categorías completas con base de datos de {categories.reduce((a, c) => a + c.count, 0)}+ dominios</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {categories.map(cat => {
                  const meta = CATEGORY_META[cat.category] || { icon: "🌐", label: cat.category, color: "bg-gray-500/10 text-gray-400 border-gray-500/30" };
                  const applied = isCategoryApplied(cat.category);
                  const catRuleCount = getCategoryBlockedCount(cat.category);
                  const deployment = categoryDeployments[cat.category];
                  const deploymentDetails = categoryDeploymentDetails[cat.category] || [];

                  return (
                    <div key={cat.category} className={`relative rounded-lg border p-3 sm:p-4 space-y-3 transition-all border-border`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{meta.icon}</span>
                          <div>
                            <h3 className="font-semibold text-foreground text-sm">{meta.label}</h3>
                            <p className="text-xs text-muted-foreground">{cat.count} dominios</p>
                          </div>
                        </div>
                        <Badge variant={applied ? "secondary" : "outline"} className="text-[10px]">
                          {catRuleCount}/{cat.count} activas
                        </Badge>
                      </div>
                      {deployment && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-1">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">Pend: {deployment.pending}</Badge>
                            <Badge variant="outline" className="text-[10px]">Run: {deployment.running}</Badge>
                            <Badge variant="outline" className="text-[10px]">OK: {deployment.completed}</Badge>
                            <Badge variant="outline" className="text-[10px]">Fail: {deployment.failed}</Badge>
                          </div>
                          {deployment.lastAt && (
                            <p className="text-[10px] text-muted-foreground">
                              Ultimo despliegue: {deployment.lastAction === "block" ? "bloquear" : "desbloquear"} · {new Date(deployment.lastAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                            </p>
                          )}
                          {deploymentDetails.length > 0 && (
                            <div className="pt-1 space-y-1">
                              {deploymentDetails.map((detail) => (
                                <div key={`${cat.category}-${detail.deviceId}`} className="flex items-center justify-between text-[10px]">
                                  <span className="truncate max-w-[130px] text-muted-foreground">{detail.hostname}</span>
                                  <span className={detail.status === "completed" ? "text-green-400" : detail.status === "failed" ? "text-red-400" : detail.status === "running" ? "text-blue-400" : "text-yellow-400"}>
                                    {detail.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button size="sm" variant="destructive" className="w-full min-w-0 h-8 px-2 text-xs sm:text-sm" disabled={applyingCategory === cat.category}
                          onClick={() => handleApplyCategory(cat.category)}>
                          <Ban className="h-3 w-3 mr-1" />
                          {applyingCategory === cat.category ? "..." : "Bloquear"}
                        </Button>
                        <Button size="sm" variant="outline" className="w-full min-w-0 h-8 px-2 text-xs sm:text-sm"
                          onClick={() => handleRemoveCategory(cat.category)}>
                          <Globe className="h-3 w-3 mr-1" />
                          Desbloquear
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ APPLICATIONS TAB ============ */}
        <TabsContent value="apps">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AppWindow className="h-5 w-5 text-orange-400" />
                    Control de Aplicaciones
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Las aplicaciones bloqueadas serán terminadas automáticamente por el agente</p>
                </div>
                <Dialog open={appDialogOpen} onOpenChange={setAppDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Agregar App</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Bloquear Aplicación</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div><Label>Nombre visible</Label><Input value={appForm.app_name} onChange={e => setAppForm({ ...appForm, app_name: e.target.value })} placeholder="Nombre con el que identificarás la aplicación" /></div>
                      <div><Label>Nombre del proceso</Label><Input value={appForm.process_name} onChange={e => setAppForm({ ...appForm, process_name: e.target.value })} placeholder="Proceso ejecutable a bloquear" /></div>
                      <div><Label>Categoría</Label>
                        <Select value={appForm.category} onValueChange={v => setAppForm({ ...appForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_META).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                            ))}
                            <SelectItem value="general">General</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleCreateApp} className="w-full">Bloquear Aplicación</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {blockedApps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><AppWindow className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No hay aplicaciones bloqueadas</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Activa</TableHead><TableHead>Aplicación</TableHead><TableHead>Proceso</TableHead><TableHead>Categoría</TableHead><TableHead>Acciones</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {blockedApps.map(app => (
                      <TableRow key={app.id} className={!app.enabled ? "opacity-50" : ""}>
                        <TableCell><Switch checked={app.enabled} onCheckedChange={() => toggleApp(app.id, app.enabled)} /></TableCell>
                        <TableCell className="font-medium text-foreground">{app.app_name}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{app.process_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={CATEGORY_META[app.category]?.color || ""}>{CATEGORY_META[app.category]?.label || app.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => deleteApp(app.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ VPN TAB ============ */}
        <TabsContent value="vpn">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-400" />
                Bloqueo de VPN
              </CardTitle>
              <p className="text-sm text-muted-foreground">Bloquea puertos comunes de VPN y detecta conexiones VPN activas</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold text-foreground">Bloquear puertos VPN</h3>
                  <p className="text-sm text-muted-foreground">Puertos: 1194 (OpenVPN), 1701 (L2TP), 1723 (PPTP), 500/4500 (IPSec)</p>
                </div>
                <Switch checked={vpnBlocked} onCheckedChange={handleToggleVpnBlock} />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold text-foreground">Bloquear sitios VPN</h3>
                  <p className="text-sm text-muted-foreground">Bloquea las páginas de descarga de VPN populares</p>
                </div>
                <Button size="sm" variant={rules.some(r => r.rule_name === "Bloquear nordvpn.com") ? "outline" : "destructive"}
                  onClick={() => rules.some(r => r.rule_name === "Bloquear nordvpn.com") ? handleRemoveCategory("vpn") : handleApplyCategory("vpn")}>
                  {rules.some(r => r.rule_name === "Bloquear nordvpn.com") ? "Desbloquear" : "Bloquear"}
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold text-foreground">Bloquear aplicaciones VPN</h3>
                  <p className="text-sm text-muted-foreground">{blockedApps.filter(a => a.category === "vpn" && a.enabled).length} apps VPN bloqueadas</p>
                </div>
                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                  {blockedApps.filter(a => a.category === "vpn" && a.enabled).length} activas
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usb">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-400" />
                Bloqueo de Puertos USB
              </CardTitle>
              <p className="text-sm text-muted-foreground">Aplica una política de bloqueo de periféricos USB, manteniendo teclado y mouse USB operativos.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Bloquear periféricos USB excepto teclado y mouse</h3>
                  <p className="text-sm text-muted-foreground">Bloquea memorias, cámaras, audio, tethering y otros periféricos USB. Mantiene teclado y mouse USB disponibles para no dejar el equipo inutilizable.</p>
                </div>
                <Switch checked={usbStorageBlocked} onCheckedChange={handleToggleUsbStorageBlock} />
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Estado actual</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{usbStorageBlocked ? "Bloqueado" : "Permitido"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ SCHEDULES TAB ============ */}
        <TabsContent value="schedules">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-400" />
                    Horarios de Políticas
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Configura horarios en los que las categorías estarán activas</p>
                </div>
                <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo Horario</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Crear Horario</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div><Label>Categoría</Label>
                        <Select value={scheduleForm.category} onValueChange={v => setScheduleForm({ ...scheduleForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_META).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Hora inicio</Label><Input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} /></div>
                        <div><Label>Hora fin</Label><Input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} /></div>
                      </div>
                      <div>
                        <Label>Días de la semana</Label>
                        <div className="flex gap-2 mt-2">
                          {DAY_NAMES.map((day, i) => (
                            <Button key={i} size="sm" variant={scheduleForm.days_of_week.includes(i) ? "default" : "outline"}
                              onClick={() => {
                                const days = scheduleForm.days_of_week.includes(i)
                                  ? scheduleForm.days_of_week.filter(d => d !== i)
                                  : [...scheduleForm.days_of_week, i];
                                setScheduleForm({ ...scheduleForm, days_of_week: days });
                              }}
                              className="w-10 h-10 p-0">{day}</Button>
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleCreateSchedule} className="w-full">Crear Horario</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Clock className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No hay horarios configurados</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Activo</TableHead><TableHead>Categoría</TableHead><TableHead>Horario</TableHead><TableHead>Días</TableHead><TableHead>Acciones</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {schedules.map(s => {
                      const meta = CATEGORY_META[s.category] || { icon: "🌐", label: s.category, color: "" };
                      return (
                        <TableRow key={s.id} className={!s.enabled ? "opacity-50" : ""}>
                          <TableCell><Switch checked={s.enabled} onCheckedChange={() => toggleSchedule(s.id, s.enabled)} /></TableCell>
                          <TableCell><Badge variant="outline" className={meta.color}>{meta.icon} {meta.label}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{s.start_time} - {s.end_time}</TableCell>
                          <TableCell className="text-sm">{s.days_of_week.sort().map(d => DAY_NAMES[d]).join(", ")}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => deleteSchedule(s.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ ANTI-BYPASS TAB ============ */}
        <TabsContent value="bypass">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                Detección Anti-Bypass
              </CardTitle>
              <p className="text-sm text-muted-foreground">Monitoreo de intentos de evasión: DNS custom, VPN, hosts tampering, proxy</p>
            </CardHeader>
            <CardContent>
              {bypassAttempts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Eye className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No se han detectado intentos de bypass</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Detalles</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {bypassAttempts.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{new Date(a.detected_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">{a.attempt_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono max-w-xs truncate">{JSON.stringify(a.details)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ RULES TAB (existing) ============ */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Reglas de Firewall</CardTitle>
                <div className="flex gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Regla</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader><DialogTitle>Nueva Regla de Firewall</DialogTitle></DialogHeader>
                      <div className="space-y-4 mt-2">
                        <div><Label>Nombre</Label><Input value={form.rule_name} onChange={e => setForm({ ...form, rule_name: e.target.value })} placeholder="Nombre descriptivo de la regla" /></div>
                        <div className="grid grid-cols-3 gap-4">
                          <div><Label>Dirección</Label>
                            <Select value={form.direction} onValueChange={v => setForm({ ...form, direction: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="inbound">Entrada</SelectItem><SelectItem value="outbound">Salida</SelectItem></SelectContent>
                            </Select></div>
                          <div><Label>Acción</Label>
                            <Select value={form.action} onValueChange={v => setForm({ ...form, action: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="allow">Permitir</SelectItem><SelectItem value="block">Bloquear</SelectItem></SelectContent>
                            </Select></div>
                          <div><Label>Protocolo</Label>
                            <Select value={form.protocol} onValueChange={v => setForm({ ...form, protocol: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="tcp">TCP</SelectItem><SelectItem value="udp">UDP</SelectItem><SelectItem value="icmp">ICMP</SelectItem><SelectItem value="any">Cualquiera</SelectItem></SelectContent>
                            </Select></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div><Label>Puerto inicio</Label><Input type="number" value={form.port_start} onChange={e => setForm({ ...form, port_start: e.target.value })} placeholder="80" /></div>
                          <div><Label>Puerto fin</Label><Input type="number" value={form.port_end} onChange={e => setForm({ ...form, port_end: e.target.value })} placeholder="443" /></div>
                          <div><Label>Prioridad</Label><Input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><Label>IP origen</Label><Input value={form.source_ip} onChange={e => setForm({ ...form, source_ip: e.target.value })} placeholder="0.0.0.0/0" /></div>
                          <div><Label>IP destino</Label><Input value={form.destination_ip} onChange={e => setForm({ ...form, destination_ip: e.target.value })} placeholder="10.0.0.0/8" /></div>
                        </div>
                        <div><Label>Perfil de rol</Label>
                          <Select value={form.profile_id || "none"} onValueChange={v => setForm({ ...form, profile_id: v === "none" ? "" : v })}>
                            <SelectTrigger><SelectValue placeholder="Sin perfil" /></SelectTrigger>
                            <SelectContent><SelectItem value="none">Sin perfil</SelectItem>{profiles.map(p => (<SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>))}</SelectContent>
                          </Select></div>
                        <Button onClick={handleCreate} className="w-full">Crear Regla</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground text-center py-8">Cargando...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><Flame className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No hay reglas de firewall</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Activa</TableHead><TableHead>Prioridad</TableHead><TableHead>Regla</TableHead><TableHead>Destino</TableHead>
                    <TableHead>Dirección</TableHead><TableHead>Acción</TableHead><TableHead>Puerto(s)</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.slice(0, 100).map(r => (
                      <TableRow key={r.id} className={!r.enabled ? "opacity-50" : ""}>
                        <TableCell><Switch checked={r.enabled} onCheckedChange={() => toggleEnabled(r.id, r.enabled)} /></TableCell>
                        <TableCell className="font-mono text-sm">{r.priority}</TableCell>
                        <TableCell className="font-medium text-foreground max-w-[200px] truncate">{r.rule_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono max-w-[150px] truncate">{r.destination_ip || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.direction === "inbound" ? "↓ Entrada" : "↑ Salida"}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.action === "allow" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}>
                            {r.action === "allow" ? "Permitir" : "Bloquear"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{r.port_end ? `${r.port_start}-${r.port_end}` : r.port_start}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[r.status] || statusColors.pending}>
                            {r.status === "applied" ? "Aplicada" : r.status === "failed" ? "Fallida" : "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {r.status === "pending" && <Button variant="outline" size="sm" onClick={() => handleApply(r.id)}>Aplicar</Button>}
                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {filtered.length > 100 && <p className="text-sm text-muted-foreground text-center mt-4">Mostrando 100 de {filtered.length} reglas. Usa el buscador para filtrar.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
