import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Cpu, HardDrive, MemoryStick, Wifi, RefreshCw, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface DiagnosticEntry {
  id: string;
  device_id: string;
  cpu_usage: number | null;
  ram_usage: number | null;
  disk_usage: number | null;
  internet_status: string | null;
  wifi_status: string | null;
  ethernet_status: string | null;
  dns_status: string | null;
  latency_ms: number | null;
  packet_loss: number | null;
  overall_health: string | null;
  raw_data: any;
  created_at: string;
  devices?: { hostname: string; device_id: string } | null;
}

const healthColors: Record<string, string> = {
  healthy: "status-available",
  warning: "status-maintenance",
  critical: "priority-critical",
  offline: "status-retired",
};

const Diagnostics = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [detail, setDetail] = useState<DiagnosticEntry | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("device_diagnostics")
      .select("*, devices(hostname, device_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    setDiagnostics((data as DiagnosticEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = diagnostics.filter(d => {
    const matchSearch = (d.devices?.hostname || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.devices?.device_id || "").toLowerCase().includes(search.toLowerCase());
    const matchHealth = healthFilter === "all" || d.overall_health === healthFilter;
    return matchSearch && matchHealth;
  });

  const usageColor = (val: number | null) => {
    if (val === null) return "text-muted-foreground";
    if (val > 90) return "text-destructive";
    if (val > 70) return "text-warning";
    return "text-success";
  };

  const usageBarColor = (val: number | null) => {
    if (val === null) return "";
    if (val > 90) return "[&>div]:bg-destructive";
    if (val > 70) return "[&>div]:bg-warning";
    return "[&>div]:bg-success";
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Diagnósticos</h1>
          <p className="page-description">Estado de salud y rendimiento de dispositivos</p>
        </div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="inline-flex p-2 rounded-lg bg-emerald-50 mb-3"><Activity className="h-4 w-4 text-success" /></div>
          <p className="text-2xl font-bold text-foreground">{diagnostics.filter(d => d.overall_health === 'healthy').length}</p>
          <p className="text-xs text-muted-foreground mt-1">Saludables</p>
        </div>
        <div className="stat-card">
          <div className="inline-flex p-2 rounded-lg bg-amber-50 mb-3"><Activity className="h-4 w-4 text-warning" /></div>
          <p className="text-2xl font-bold text-foreground">{diagnostics.filter(d => d.overall_health === 'warning').length}</p>
          <p className="text-xs text-muted-foreground mt-1">Con Advertencias</p>
        </div>
        <div className="stat-card">
          <div className="inline-flex p-2 rounded-lg bg-red-50 mb-3"><Activity className="h-4 w-4 text-destructive" /></div>
          <p className="text-2xl font-bold text-foreground">{diagnostics.filter(d => d.overall_health === 'critical').length}</p>
          <p className="text-xs text-muted-foreground mt-1">Críticos</p>
        </div>
        <div className="stat-card">
          <div className="inline-flex p-2 rounded-lg bg-blue-50 mb-3"><Cpu className="h-4 w-4 text-primary" /></div>
          <p className="text-2xl font-bold text-foreground">{diagnostics.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Reportes</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por hostname o ID..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="healthy">Saludable</SelectItem>
            <SelectItem value="warning">Advertencia</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Disco</th>
              <th>Internet</th>
              <th>Latencia</th>
              <th>Pérdida Paq.</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td className="font-medium text-xs">{d.devices?.hostname || d.device_id}</td>
                <td className={`font-mono text-xs ${usageColor(d.cpu_usage)}`}>{d.cpu_usage !== null ? `${d.cpu_usage}%` : "—"}</td>
                <td className={`font-mono text-xs ${usageColor(d.ram_usage)}`}>{d.ram_usage !== null ? `${d.ram_usage}%` : "—"}</td>
                <td className={`font-mono text-xs ${usageColor(d.disk_usage)}`}>{d.disk_usage !== null ? `${d.disk_usage}%` : "—"}</td>
                <td><span className={`status-badge ${d.internet_status === 'connected' ? 'status-available' : 'priority-high'}`}>{d.internet_status || "—"}</span></td>
                <td className="font-mono text-xs">{d.latency_ms !== null ? `${d.latency_ms}ms` : "—"}</td>
                <td className={`font-mono text-xs ${(d.packet_loss || 0) > 5 ? 'text-destructive' : 'text-success'}`}>{d.packet_loss !== null ? `${d.packet_loss}%` : "—"}</td>
                <td><span className={`status-badge ${healthColors[d.overall_health || 'offline']}`}>{d.overall_health || "—"}</span></td>
                <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(d.created_at).toLocaleString("es")}</td>
                <td><Button variant="ghost" size="sm" onClick={() => setDetail(d)}>Ver</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No hay diagnósticos registrados</div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Diagnóstico — {detail?.devices?.hostname}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 pt-2">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1"><span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" /> CPU</span><span className="font-mono">{detail.cpu_usage ?? 0}%</span></div>
                  <Progress value={detail.cpu_usage ?? 0} className={usageBarColor(detail.cpu_usage)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span className="flex items-center gap-1"><MemoryStick className="h-3.5 w-3.5" /> RAM</span><span className="font-mono">{detail.ram_usage ?? 0}%</span></div>
                  <Progress value={detail.ram_usage ?? 0} className={usageBarColor(detail.ram_usage)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" /> Disco</span><span className="font-mono">{detail.disk_usage ?? 0}%</span></div>
                  <Progress value={detail.disk_usage ?? 0} className={usageBarColor(detail.disk_usage)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Internet:</span> <span className={detail.internet_status === 'connected' ? 'text-success' : 'text-destructive'}>{detail.internet_status}</span></div>
                <div><span className="text-muted-foreground">WiFi:</span> {detail.wifi_status || "—"}</div>
                <div><span className="text-muted-foreground">Ethernet:</span> {detail.ethernet_status || "—"}</div>
                <div><span className="text-muted-foreground">DNS:</span> {detail.dns_status || "—"}</div>
                <div><span className="text-muted-foreground">Latencia:</span> <span className="font-mono">{detail.latency_ms}ms</span></div>
                <div><span className="text-muted-foreground">Pérdida paq.:</span> <span className="font-mono">{detail.packet_loss}%</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Diagnostics;
