import { useState, useEffect } from "react";
import {
  Monitor, Ticket, CheckCircle, Clock, Wrench, AlertTriangle, Laptop, Activity,
  Play, Wifi, Shield, Flame, FolderArchive, Mail, WifiOff, ShieldCheck, ShieldX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useCompany } from "@/hooks/useCompany";
import { applyCompanyScope } from "@/lib/companyScope";

const PIE_COLORS = ['hsl(142, 71%, 40%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(0, 72%, 35%)'];
const DEVICE_COLORS = ['hsl(142, 71%, 40%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(215, 14%, 50%)'];
const dashboardCardClass = "shadow-md hover:shadow-lg transition-shadow";

const Dashboard = () => {
  const { companyId, loading: companyLoading } = useCompany();
  const [ticketStats, setTicketStats] = useState({ abierto: 0, en_proceso: 0, resuelto: 0, cerrado: 0, en_espera: 0, total: 0 });
  const [equipStats, setEquipStats] = useState({ disponible: 0, asignado: 0, mantenimiento: 0, total: 0 });
  const [deviceStats, setDeviceStats] = useState({ total: 0, healthy: 0, warning: 0, critical: 0, vpnConnected: 0 });
  const [scriptStats, setScriptStats] = useState({ pending: 0, running: 0, completed: 0, failed: 0 });
  const [backupStats, setBackupStats] = useState({ total: 0, completed: 0, failed: 0, totalSize: 0 });
  const [vpnStats, setVpnStats] = useState({ total: 0, connected: 0, applied: 0 });
  const [firewallStats, setFirewallStats] = useState({ total: 0, allow: 0, block: 0, applied: 0 });
  const [emailStats, setEmailStats] = useState({ total: 0, applied: 0, pending: 0 });
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [ticketsByPriority, setTicketsByPriority] = useState<any[]>([]);

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    const load = async () => {
      const [ticketsRes, equipRes, devicesRes, scriptsRes, backupsRes, vpnRes, fwRes, emailRes] = await Promise.all([
        applyCompanyScope(supabase.from("tickets").select("status, priority, subject, requester, assigned_tech, code, created_at"), companyId).order("created_at", { ascending: false }),
        applyCompanyScope(supabase.from("equipment").select("status"), companyId),
        applyCompanyScope(supabase.from("devices").select("health_status, vpn_status"), companyId),
        applyCompanyScope(supabase.from("script_executions").select("status"), companyId),
        applyCompanyScope(supabase.from("backups").select("status, total_size_bytes"), companyId),
        applyCompanyScope(supabase.from("vpn_configs").select("status, connection_status"), companyId),
        applyCompanyScope(supabase.from("firewall_rules").select("action, status, enabled"), companyId),
        applyCompanyScope(supabase.from("email_configs").select("status"), companyId),
      ]);

      if (ticketsRes.data) {
        const ts = ticketsRes.data;
        setTicketStats({
          abierto: ts.filter(t => t.status === 'abierto').length,
          en_proceso: ts.filter(t => t.status === 'en_proceso').length,
          resuelto: ts.filter(t => t.status === 'resuelto').length,
          cerrado: ts.filter(t => t.status === 'cerrado').length,
          en_espera: ts.filter(t => t.status === 'en_espera').length,
          total: ts.length,
        });
        setRecentTickets(ts.slice(0, 5));
        setTicketsByPriority([
          { name: 'Baja', value: ts.filter(t => t.priority === 'baja').length },
          { name: 'Media', value: ts.filter(t => t.priority === 'media').length },
          { name: 'Alta', value: ts.filter(t => t.priority === 'alta').length },
          { name: 'Crítica', value: ts.filter(t => t.priority === 'critica').length },
        ]);
      }
      if (equipRes.data) {
        const eq = equipRes.data;
        setEquipStats({ disponible: eq.filter(e => e.status === 'disponible').length, asignado: eq.filter(e => e.status === 'asignado').length, mantenimiento: eq.filter(e => e.status === 'mantenimiento').length, total: eq.length });
      }
      if (devicesRes.data) {
        const dv = devicesRes.data;
        setDeviceStats({ total: dv.length, healthy: dv.filter(d => d.health_status === 'healthy').length, warning: dv.filter(d => d.health_status === 'warning').length, critical: dv.filter(d => d.health_status === 'critical').length, vpnConnected: dv.filter(d => d.vpn_status === 'connected').length });
      }
      if (scriptsRes.data) {
        const sc = scriptsRes.data;
        setScriptStats({ pending: sc.filter(s => s.status === 'pending').length, running: sc.filter(s => s.status === 'running').length, completed: sc.filter(s => s.status === 'completed').length, failed: sc.filter(s => s.status === 'failed').length });
      }
      if (backupsRes.data) {
        const bk = backupsRes.data;
        setBackupStats({ total: bk.length, completed: bk.filter(b => b.status === 'completed').length, failed: bk.filter(b => b.status === 'failed').length, totalSize: bk.reduce((a, b) => a + (b.total_size_bytes || 0), 0) });
      }
      if (vpnRes.data) {
        const vp = vpnRes.data;
        setVpnStats({ total: vp.length, connected: vp.filter(v => v.connection_status === 'connected').length, applied: vp.filter(v => v.status === 'applied').length });
      }
      if (fwRes.data) {
        const fw = fwRes.data;
        setFirewallStats({ total: fw.length, allow: fw.filter(f => f.action === 'allow' && f.enabled).length, block: fw.filter(f => f.action === 'block' && f.enabled).length, applied: fw.filter(f => f.status === 'applied').length });
      }
      if (emailRes.data) {
        const em = emailRes.data;
        setEmailStats({ total: em.length, applied: em.filter(e => e.status === 'applied').length, pending: em.filter(e => e.status === 'pending').length });
      }
    };
    load();
  }, [companyId, companyLoading]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const deviceHealthData = [
    { name: 'Saludable', value: deviceStats.healthy },
    { name: 'Advertencia', value: deviceStats.warning },
    { name: 'Crítico', value: deviceStats.critical },
    { name: 'Offline', value: Math.max(0, deviceStats.total - deviceStats.healthy - deviceStats.warning - deviceStats.critical) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Centro de monitoreo IT — visión general de todos los módulos</p>
      </div>

      {/* Row 1: Core stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Ticket className="h-3 w-3" /> Tickets Abiertos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{ticketStats.abierto}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> En Proceso</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{ticketStats.en_proceso}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Resueltos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{ticketStats.resuelto + ticketStats.cerrado}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Laptop className="h-3 w-3" /> Dispositivos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{deviceStats.total}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Monitor className="h-3 w-3" /> Inventario</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{equipStats.total}</p></CardContent></Card>
      </div>

      {/* Row 2: Module-specific stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3 text-green-400" /> Saludables</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-400">{deviceStats.healthy}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" /> Críticos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-400">{deviceStats.critical + deviceStats.warning}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><FolderArchive className="h-3 w-3" /> Backups</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{backupStats.completed}</p><p className="text-[10px] text-muted-foreground">{formatBytes(backupStats.totalSize)}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> VPN Configs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{vpnStats.total}</p><p className="text-[10px] text-muted-foreground">{vpnStats.connected} conectados</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" /> Firewall</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{firewallStats.total}</p><p className="text-[10px] text-muted-foreground">{firewallStats.applied} aplicadas</p></CardContent></Card>
      </div>

      {/* Row 3: Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Wifi className="h-3 w-3" /> VPN Activos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{deviceStats.vpnConnected}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-green-400" /> FW Permitir</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-400">{firewallStats.allow}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShieldX className="h-3 w-3 text-red-400" /> FW Bloquear</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-400">{firewallStats.block}</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email Configs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{emailStats.total}</p><p className="text-[10px] text-muted-foreground">{emailStats.applied} aplicadas</p></CardContent></Card>
        <Card className={dashboardCardClass}><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Play className="h-3 w-3" /> Scripts</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-foreground">{scriptStats.completed}</p><p className="text-[10px] text-muted-foreground">{scriptStats.pending} pendientes</p></CardContent></Card>
      </div>

      {/* Charts + Automation */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className={dashboardCardClass}>
          <CardHeader><CardTitle className="text-sm">Tickets por Prioridad</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={ticketsByPriority} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                  {ticketsByPriority.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={dashboardCardClass}>
          <CardHeader><CardTitle className="text-sm">Salud de Dispositivos</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deviceHealthData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                  {deviceHealthData.map((_, i) => <Cell key={i} fill={DEVICE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={dashboardCardClass}>
          <CardHeader><CardTitle className="text-sm">Automatización</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {[
                { label: "Completados", value: scriptStats.completed, color: "bg-green-500" },
                { label: "En ejecución", value: scriptStats.running, color: "bg-blue-500" },
                { label: "Pendientes", value: scriptStats.pending, color: "bg-yellow-500" },
                { label: "Fallidos", value: scriptStats.failed, color: "bg-red-500" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent tickets */}
      <Card className={dashboardCardClass}>
        <CardHeader><CardTitle className="text-sm">Tickets Recientes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Código</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Asunto</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Solicitante</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Prioridad</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Técnico</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.map(ticket => (
                <tr key={ticket.code} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{ticket.code}</td>
                  <td className="px-4 py-2 text-sm font-medium text-foreground">{ticket.subject}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{ticket.requester}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ticket.priority === 'critica' ? 'bg-red-500/10 text-red-400' : ticket.priority === 'alta' ? 'bg-orange-500/10 text-orange-400' : ticket.priority === 'media' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted text-muted-foreground'}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ticket.status === 'abierto' ? 'bg-blue-500/10 text-blue-400' : ticket.status === 'en_proceso' ? 'bg-yellow-500/10 text-yellow-400' : ticket.status === 'resuelto' ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{ticket.assigned_tech || "—"}</td>
                </tr>
              ))}
              {recentTickets.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No hay tickets aún</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
