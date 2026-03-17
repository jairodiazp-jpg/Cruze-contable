import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const PIE_COLORS = ["hsl(142, 71%, 40%)", "hsl(214, 84%, 40%)", "hsl(38, 92%, 50%)", "hsl(215, 14%, 60%)"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type TicketRow = {
  created_at: string;
  priority: string;
  status: string;
  assigned_tech: string | null;
  closed_at: string | null;
};

type EquipmentRow = { status: string };
type DeviceRow = { health_status: string; agent_installed: boolean | null };
type ScriptExecutionRow = { status: string; started_at: string | null; completed_at: string | null };
type LogRow = { severity: string };

const Reports = () => {
  const { user } = useAuth();
  const { companyId, companyName, loading: companyLoading } = useCompany();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("user");
  const [usersCount, setUsersCount] = useState(0);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [executions, setExecutions] = useState<ScriptExecutionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    if (!user) return;

    const loadRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      setUserRole(data?.role || "user");
    };

    loadRole();
  }, [user]);

  useEffect(() => {
    if (!companyId || companyLoading) return;

    const load = async () => {
      setLoading(true);

      const [ticketsRes, equipmentRes, devicesRes, executionsRes, logsRes, usersRes] = await Promise.all([
        supabase.from("tickets").select("created_at, priority, status, assigned_tech, closed_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
        supabase.from("equipment").select("status").eq("company_id", companyId).limit(500),
        supabase.from("devices").select("health_status, agent_installed").eq("company_id", companyId).limit(500),
        supabase.from("script_executions").select("status, started_at, completed_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
        supabase.from("system_logs").select("severity").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);

      setTickets((ticketsRes.data || []) as TicketRow[]);
      setEquipment((equipmentRes.data || []) as EquipmentRow[]);
      setDevices((devicesRes.data || []) as DeviceRow[]);
      setExecutions((executionsRes.data || []) as ScriptExecutionRow[]);
      setLogs((logsRes.data || []) as LogRow[]);
      setUsersCount(usersRes.count || 0);
      setLoading(false);
    };

    load();
  }, [companyId, companyLoading]);

  const ticketsByMonth = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const base = MONTHS.map((month) => ({ month, tickets: 0 }));

    tickets.forEach((t) => {
      const createdAt = new Date(t.created_at);
      if (createdAt.getFullYear() !== currentYear) return;
      const month = createdAt.getMonth();
      base[month].tickets += 1;
    });

    return base;
  }, [tickets]);

  const avgResolution = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const accum = MONTHS.map((month) => ({ month, totalHours: 0, count: 0 }));

    tickets.forEach((t) => {
      if (!t.closed_at) return;
      const createdAt = new Date(t.created_at);
      const closedAt = new Date(t.closed_at);
      if (createdAt.getFullYear() !== currentYear) return;
      const month = createdAt.getMonth();
      const diffMs = closedAt.getTime() - createdAt.getTime();
      if (diffMs <= 0) return;
      accum[month].totalHours += diffMs / 3600000;
      accum[month].count += 1;
    });

    return accum.map((x) => ({ month: x.month, horas: x.count ? Number((x.totalHours / x.count).toFixed(2)) : 0 }));
  }, [tickets]);

  const inventoryByStatus = useMemo(() => {
    return [
      { name: "Disponible", value: equipment.filter((e) => e.status === "disponible").length },
      { name: "Asignado", value: equipment.filter((e) => e.status === "asignado").length },
      { name: "Mantenimiento", value: equipment.filter((e) => e.status === "mantenimiento").length },
      { name: "Retirado", value: equipment.filter((e) => e.status === "retirado").length },
    ];
  }, [equipment]);

  const techPerformance = useMemo(() => {
    const byTech = new Map<string, { name: string; resueltos: number; promedio: number; totalHours: number; count: number }>();

    tickets.forEach((t) => {
      if (!t.assigned_tech) return;
      const existing = byTech.get(t.assigned_tech) || { name: t.assigned_tech, resueltos: 0, promedio: 0, totalHours: 0, count: 0 };
      if (t.status === "resuelto" || t.status === "cerrado") {
        existing.resueltos += 1;
      }
      if (t.closed_at) {
        const diffMs = new Date(t.closed_at).getTime() - new Date(t.created_at).getTime();
        if (diffMs > 0) {
          existing.totalHours += diffMs / 3600000;
          existing.count += 1;
        }
      }
      byTech.set(t.assigned_tech, existing);
    });

    return Array.from(byTech.values())
      .map((t) => ({ ...t, promedio: t.count ? Number((t.totalHours / t.count).toFixed(2)) : 0 }))
      .sort((a, b) => b.resueltos - a.resueltos)
      .slice(0, 6);
  }, [tickets]);

  const logStats = useMemo(() => {
    return {
      info: logs.filter((l) => l.severity === "info").length,
      warning: logs.filter((l) => l.severity === "warning").length,
      error: logs.filter((l) => l.severity === "error").length,
      critical: logs.filter((l) => l.severity === "critical").length,
    };
  }, [logs]);

  const agentsStats = useMemo(() => {
    return {
      total: devices.filter((d) => d.agent_installed).length,
      healthy: devices.filter((d) => d.health_status === "healthy").length,
      running: executions.filter((e) => e.status === "running").length,
      failed: executions.filter((e) => e.status === "failed").length,
    };
  }, [devices, executions]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reportes y Analítica</h1>
        <p className="page-description">Métricas operativas de {companyName || "tu empresa"} para soporte, agentes y seguridad</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Superadministrador</p>
          <p className="text-2xl font-bold text-foreground">{userRole === "admin" ? "Habilitado" : "Solo lectura"}</p>
          <p className="text-xs text-muted-foreground mt-1">Usuarios empresa: {usersCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Empresa</p>
          <p className="text-2xl font-bold text-foreground">{tickets.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Tickets registrados</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Usuarios</p>
          <p className="text-2xl font-bold text-foreground">{usersCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Usuarios activos de la compañía</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Agentes</p>
          <p className="text-2xl font-bold text-foreground">{agentsStats.total}</p>
          <p className="text-xs text-muted-foreground mt-1">Agentes instalados, {agentsStats.healthy} saludables</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Analítica</p>
          <p className="text-2xl font-bold text-foreground">{executions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Ejecuciones de automatización</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Panel Logs</p>
          <p className="text-2xl font-bold text-foreground">{logStats.error + logStats.critical}</p>
          <p className="text-xs text-muted-foreground mt-1">Errores críticos acumulados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-card rounded-lg border p-4 sm:p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-foreground mb-4">Tickets por Mes</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ticketsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="tickets" fill="hsl(214, 84%, 40%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border p-4 sm:p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-foreground mb-4">Tiempo Promedio de Resolución (hrs)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={avgResolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="horas" stroke="hsl(142, 71%, 40%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border p-4 sm:p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-foreground mb-4">Inventario por Estado</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={inventoryByStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {inventoryByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border p-4 sm:p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-foreground mb-4">Rendimiento por Técnico</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={techPerformance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="resueltos" fill="hsl(214, 84%, 40%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando analítica en tiempo real...</p>}
    </div>
  );
};

export default Reports;
