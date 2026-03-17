import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Play, Terminal, Clock, CheckCircle, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queueScriptExecutions } from "@/lib/scriptExecutions";
import { DevicePickerRow, fetchDeviceList } from "@/lib/deviceQueries";

interface ScriptExecution {
  id: string;
  device_id: string | null;
  script_name: string;
  script_type: string;
  script_content: string | null;
  status: string;
  output: string | null;
  error_log: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  devices?: { hostname: string; device_id: string } | null;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  completed: <CheckCircle className="h-3.5 w-3.5" />,
  failed: <XCircle className="h-3.5 w-3.5" />,
};

const statusStyles: Record<string, string> = {
  pending: "status-maintenance",
  running: "status-assigned",
  completed: "status-available",
  failed: "priority-critical",
  cancelled: "status-retired",
};

const predefinedScripts = [
  { name: "Diagnóstico Completo", type: "diagnostic", description: "Ejecuta diagnóstico de CPU, RAM, disco y red" },
  { name: "Reparar Red", type: "network-repair", description: "Reinicia adaptadores y renueva IP/DNS" },
  { name: "Instalar Perfil", type: "install-profile", description: "Instala software según perfil de rol" },
  { name: "Configurar Email", type: "setup-email", description: "Configura correo corporativo automáticamente" },
  { name: "Configurar VPN", type: "setup-vpn", description: "Instala y configura cliente VPN" },
  { name: "Backup", type: "backup", description: "Realiza backup de Documents, Desktop, Pictures" },
  { name: "Script Personalizado", type: "custom", description: "Ejecutar un script personalizado" },
];

const Automation = () => {
  const [executions, setExecutions] = useState<ScriptExecution[]>([]);
  const [devices, setDevices] = useState<DevicePickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailExec, setDetailExec] = useState<ScriptExecution | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "No se pueden ejecutar scripts sin empresa asociada.",
  });

  const [form, setForm] = useState({
    device_id: "",
    script_type: "diagnostic",
    script_name: "Diagnóstico Completo",
    script_content: "",
  });

  const fetchData = async () => {
    setLoading(true);

    const [execResult, devList] = await Promise.all([
      withCompanyScope(supabase.from("script_executions").select("*, devices(hostname, device_id)")).order("created_at", { ascending: false }).limit(100),
      fetchDeviceList(companyId),
    ]);
    if (execResult.data) setExecutions(execResult.data as ScriptExecution[]);
    setDevices(devList);
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    fetchData();
    const channel = supabase
      .channel("executions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "script_executions" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, companyLoading]);

  const handleExecute = async () => {
    if (!form.device_id) {
      toast({ title: "Selecciona un dispositivo", variant: "destructive" });
      return;
    }
    const { error, inserted } = await queueScriptExecutions({
      ensureCompanyId,
      executions: [{
        device_id: form.device_id,
        script_name: form.script_name,
        script_type: form.script_type,
        script_content: form.script_content || null,
        status: "pending",
        executed_by: user?.id,
      }],
    });
    if (error) {
      const extra = /row-level security|policy/i.test(error.message || "")
        ? " Verifica que tu usuario tenga rol admin o technician dentro de tu empresa."
        : "";
      toast({ title: "Error", description: `${error.message}.${extra}`, variant: "destructive" });
    } else if (inserted) {
      toast({ title: "Script enviado", description: "El agente ejecutará el script cuando esté disponible" });
      setDialogOpen(false);
      setForm({ device_id: "", script_type: "diagnostic", script_name: "Diagnóstico Completo", script_content: "" });
    }
  };

  const filtered = executions.filter(e => {
    const matchSearch = e.script_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.devices?.hostname || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Automatización</h1>
          <p className="page-description">Motor de ejecución de scripts y tareas remotas</p>
        </div>
        <div className="grid grid-cols-1 sm:flex gap-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Play className="h-4 w-4 mr-2" />Ejecutar Script</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
              <DialogHeader><DialogTitle>Ejecutar Script Remoto</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div>
                  <Label>Dispositivo *</Label>
                  <Select value={form.device_id} onValueChange={v => setForm({...form, device_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar dispositivo" /></SelectTrigger>
                    <SelectContent>
                      {devices.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.hostname} ({d.device_id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Script</Label>
                  <Select value={form.script_type} onValueChange={v => {
                    const script = predefinedScripts.find(s => s.type === v);
                    setForm({...form, script_type: v, script_name: script?.name || v});
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {predefinedScripts.map(s => (
                        <SelectItem key={s.type} value={s.type}>
                          {s.name} — {s.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.script_type === "custom" && (
                  <div>
                    <Label>Contenido del Script</Label>
                    <Textarea
                      placeholder="# PowerShell/Bash script content..."
                      rows={8}
                      className="font-mono text-sm"
                      value={form.script_content}
                      onChange={e => setForm({...form, script_content: e.target.value})}
                    />
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleExecute}><Play className="h-4 w-4 mr-2" />Ejecutar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6">
        {predefinedScripts.filter(s => s.type !== "custom").map(s => (
          <button
            key={s.type}
            onClick={() => { setForm({...form, script_type: s.type, script_name: s.name}); setDialogOpen(true); }}
            className="stat-card text-left cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Terminal className="h-4 w-4 text-primary mb-2" />
            <p className="text-xs font-medium text-foreground">{s.name}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{s.description}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por script o dispositivo..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="running">Ejecutando</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Script</th>
              <th>Tipo</th>
              <th>Dispositivo</th>
              <th>Estado</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(exec => (
              <tr key={exec.id}>
                <td className="font-medium">{exec.script_name}</td>
                <td className="text-xs capitalize">{exec.script_type.replace("-", " ")}</td>
                <td className="font-mono text-xs">{exec.devices?.hostname || "—"}</td>
                <td>
                  <span className={`status-badge ${statusStyles[exec.status]} inline-flex items-center gap-1`}>
                    {statusIcons[exec.status]}
                    {exec.status === "pending" ? "Pendiente" : exec.status === "running" ? "Ejecutando" : exec.status === "completed" ? "Completado" : exec.status === "failed" ? "Fallido" : "Cancelado"}
                  </span>
                </td>
                <td className="text-xs text-muted-foreground">{exec.started_at ? new Date(exec.started_at).toLocaleString("es") : "—"}</td>
                <td className="text-xs text-muted-foreground">{exec.completed_at ? new Date(exec.completed_at).toLocaleString("es") : "—"}</td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => setDetailExec(exec)}>Ver</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No hay ejecuciones registradas</div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailExec} onOpenChange={() => setDetailExec(null)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Detalle de Ejecución</DialogTitle></DialogHeader>
          {detailExec && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Script:</span> <strong>{detailExec.script_name}</strong></div>
                <div><span className="text-muted-foreground">Dispositivo:</span> <strong>{detailExec.devices?.hostname || "—"}</strong></div>
                <div><span className="text-muted-foreground">Estado:</span> <span className={`status-badge ${statusStyles[detailExec.status]}`}>{detailExec.status}</span></div>
                <div><span className="text-muted-foreground">Tipo:</span> {detailExec.script_type}</div>
              </div>
              {detailExec.output && (
                <div>
                  <Label className="text-xs text-muted-foreground">Salida</Label>
                  <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-48 mt-1">{detailExec.output}</pre>
                </div>
              )}
              {detailExec.error_log && (
                <div>
                  <Label className="text-xs text-destructive">Errores</Label>
                  <pre className="bg-red-50 border border-red-200 rounded-md p-3 text-xs font-mono overflow-auto max-h-48 mt-1 text-red-800">{detailExec.error_log}</pre>
                </div>
              )}
              {detailExec.script_content && (
                <div>
                  <Label className="text-xs text-muted-foreground">Script</Label>
                  <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-48 mt-1">{detailExec.script_content}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Automation;
