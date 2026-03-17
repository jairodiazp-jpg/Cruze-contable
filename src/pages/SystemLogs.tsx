import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Filter, RefreshCw, AlertTriangle, Info, AlertCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogEntry {
  id: string;
  action: string;
  category: string;
  severity: string;
  message: string;
  details: any;
  device_id: string | null;
  created_at: string;
  devices?: { hostname: string; device_id: string } | null;
}

const severityIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-info" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
  critical: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const severityStyles: Record<string, string> = {
  info: "status-assigned",
  warning: "status-maintenance",
  error: "priority-high",
  critical: "priority-critical",
};

const SystemLogs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_logs")
      .select("*, devices(hostname, device_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    setLogs((data as LogEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    const channel = supabase
      .channel("logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const categories = [...new Set(logs.map(l => l.category))];

  const filtered = logs.filter(l => {
    const matchSearch = l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.devices?.hostname || "").toLowerCase().includes(search.toLowerCase());
    const matchSeverity = severityFilter === "all" || l.severity === severityFilter;
    const matchCategory = categoryFilter === "all" || l.category === categoryFilter;
    return matchSearch && matchSeverity && matchCategory;
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Logs del Sistema</h1>
          <p className="page-description">Registro de actividad, ejecuciones, errores y eventos</p>
        </div>
        <Button variant="outline" onClick={fetchLogs}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(["info", "warning", "error", "critical"] as const).map(sev => (
          <div key={sev} className="stat-card">
            <div className="flex items-center gap-2 mb-2">{severityIcons[sev]}<span className="text-xs font-medium capitalize">{sev}</span></div>
            <p className="text-2xl font-bold text-foreground">{logs.filter(l => l.severity === sev).length}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar en logs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Severidad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Acción</th>
              <th>Categoría</th>
              <th>Mensaje</th>
              <th>Dispositivo</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id}>
                <td>
                  <span className={`status-badge ${severityStyles[log.severity]} inline-flex items-center gap-1`}>
                    {severityIcons[log.severity]}
                    {log.severity}
                  </span>
                </td>
                <td className="font-medium text-xs">{log.action}</td>
                <td className="text-xs capitalize">{log.category}</td>
                <td className="max-w-[300px] truncate text-sm">{log.message}</td>
                <td className="font-mono text-xs">{log.devices?.hostname || "—"}</td>
                <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No hay logs registrados</div>
        )}
        {loading && (
          <div className="text-center py-12 text-muted-foreground">Cargando logs...</div>
        )}
      </div>
    </div>
  );
};

export default SystemLogs;
