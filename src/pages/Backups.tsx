import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, HardDrive, Download, RotateCcw, Play, RefreshCw, Loader2,
  CheckCircle, XCircle, Clock, Trash2, FolderArchive, AlertTriangle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queueScriptExecutions } from "@/lib/scriptExecutions";
import { DevicePickerRowWithUser, fetchDeviceList } from "@/lib/deviceQueries";

interface Backup {
  id: string;
  device_id: string | null;
  user_email: string;
  hostname: string;
  backup_date: string;
  folders: string[];
  total_size_bytes: number;
  file_count: number;
  storage_path: string | null;
  status: string;
  error_log: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
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
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  running: "En progreso",
  completed: "Completado",
  failed: "Fallido",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const Backups = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [devices, setDevices] = useState<DevicePickerRowWithUser[]>([]);;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailBackup, setDetailBackup] = useState<Backup | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "No se pueden solicitar backups sin empresa asociada.",
  });

  const [form, setForm] = useState({ device_id: "" });

  const fetchData = async () => {
    setLoading(true);

    const [bkResult, devList] = await Promise.all([
      withCompanyScope(supabase.from("backups").select("*")).order("created_at", { ascending: false }).limit(200),
      fetchDeviceList<DevicePickerRowWithUser>(companyId, "id, device_id, hostname, user_assigned"),
    ]);
    if (bkResult.data) setBackups(bkResult.data as Backup[]);
    setDevices(devList);
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    fetchData();
    const channel = supabase
      .channel("backups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "backups" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, companyLoading]);

  const handleRequestBackup = async () => {
    if (!form.device_id) {
      toast({ title: "Selecciona un dispositivo", variant: "destructive" });
      return;
    }

    const device = devices.find(d => d.id === form.device_id);
    if (!device) return;

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      return;
    }

    // Create backup record
    const { error: bkError } = await supabase.from("backups").insert({
      device_id: form.device_id,
      user_email: device.user_assigned || user?.email || "unknown",
      hostname: device.hostname,
      folders: ["Documents", "Desktop", "Pictures"],
      status: "pending",
      company_id: scopedCompanyId,
    } as any);

    // Create script execution for the agent
    const { error: scriptError } = await queueScriptExecutions({
      ensureCompanyId,
      executions: [{
        device_id: form.device_id,
        script_name: `Backup - ${device.hostname}`,
        script_type: "backup",
        script_content: "# Automatic backup of Documents, Desktop, Pictures",
        status: "pending",
        executed_by: user?.id,
        company_id: scopedCompanyId,
      }],
    });

    // Log the action
    await supabase.from("system_logs").insert({
      device_id: form.device_id,
      action: "backup_requested",
      category: "backup",
      severity: "info" as any,
      message: `Backup solicitado para ${device.hostname}`,
      user_id: user?.id,
      company_id: scopedCompanyId,
    });

    if (bkError || scriptError) {
      toast({ title: "Error", description: (bkError || scriptError)?.message, variant: "destructive" });
    } else {
      toast({ title: "Backup solicitado", description: `El agente en ${device.hostname} ejecutará el backup cuando esté disponible` });
      setDialogOpen(false);
      setForm({ device_id: "" });
    }
  };

  const handleRequestRestore = async (backup: Backup) => {
    if (!backup.device_id) {
      toast({ title: "Dispositivo no disponible", variant: "destructive" });
      return;
    }

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      return;
    }

    const { error } = await queueScriptExecutions({
      ensureCompanyId,
      executions: [{
        device_id: backup.device_id,
        script_name: `Restaurar Backup - ${backup.hostname} (${backup.backup_date})`,
        script_type: "custom",
        script_content: `# Restore backup from ${backup.backup_date}\n# Source: ${backup.storage_path || "local backup"}\n# Folders: ${backup.folders.join(", ")}\n# This script should be customized based on backup location`,
        status: "pending",
        executed_by: user?.id,
        company_id: scopedCompanyId,
      }],
    });

    await supabase.from("system_logs").insert({
      device_id: backup.device_id,
      action: "restore_requested",
      category: "backup",
      severity: "info" as any,
      message: `Restauración solicitada para ${backup.hostname} del ${backup.backup_date}`,
      user_id: user?.id,
      company_id: scopedCompanyId,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Restauración solicitada", description: "El script de restauración ha sido enviado al dispositivo" });
    }
  };

  const handleDeleteBackup = async (id: string) => {
    let query = supabase.from("backups").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro eliminado" });
      fetchData();
    }
  };

  const filtered = backups.filter(b => {
    const matchSearch =
      b.hostname.toLowerCase().includes(search.toLowerCase()) ||
      b.user_email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const totalBackups = backups.length;
  const completedBackups = backups.filter(b => b.status === "completed").length;
  const failedBackups = backups.filter(b => b.status === "failed").length;
  const totalSize = backups.reduce((s, b) => s + b.total_size_bytes, 0);

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Backup Manager</h1>
          <p className="page-description">Gestión de backups automáticos de Documents, Desktop y Pictures</p>
        </div>
        <div className="grid grid-cols-1 sm:flex gap-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Play className="h-4 w-4 mr-2" />Solicitar Backup</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
              <DialogHeader><DialogTitle>Solicitar Backup</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div>
                  <Label>Dispositivo *</Label>
                  <Select value={form.device_id} onValueChange={v => setForm({ device_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar dispositivo" /></SelectTrigger>
                    <SelectContent>
                      {devices.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.hostname} ({d.device_id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-muted/50 rounded-md p-3 border">
                  <p className="text-xs font-medium text-foreground mb-1">Carpetas incluidas:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    <li>📁 Documents</li>
                    <li>📁 Desktop</li>
                    <li>📁 Pictures</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleRequestBackup}><Play className="h-4 w-4 mr-2" />Iniciar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <FolderArchive className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Backups</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalBackups}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-accent-foreground" />
            <span className="text-xs text-muted-foreground">Completados</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{completedBackups}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Fallidos</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{failedBackups}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Tamaño Total</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatBytes(totalSize)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por hostname o email..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="running">En progreso</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Usuario</th>
              <th>Fecha</th>
              <th>Carpetas</th>
              <th>Tamaño</th>
              <th>Archivos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td className="font-medium font-mono text-xs">{b.hostname}</td>
                <td className="text-xs text-muted-foreground">{b.user_email}</td>
                <td className="text-xs">{new Date(b.backup_date).toLocaleDateString("es")}</td>
                <td className="text-xs">{b.folders.join(", ")}</td>
                <td className="text-xs font-mono">{formatBytes(b.total_size_bytes)}</td>
                <td className="text-xs text-center">{b.file_count}</td>
                <td>
                  <span className={`status-badge ${statusStyles[b.status] || "status-maintenance"} inline-flex items-center gap-1`}>
                    {statusIcons[b.status]}
                    {statusLabels[b.status] || b.status}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDetailBackup(b)} title="Ver detalle">
                      Ver
                    </Button>
                    {b.status === "completed" && (
                      <Button variant="ghost" size="sm" onClick={() => handleRequestRestore(b)} title="Restaurar">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteBackup(b.id)} title="Eliminar registro">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FolderArchive className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay backups registrados</p>
            <p className="text-xs mt-1">Solicita un backup para comenzar</p>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailBackup} onOpenChange={() => setDetailBackup(null)}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Detalle de Backup</DialogTitle></DialogHeader>
          {detailBackup && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Dispositivo:</span> <strong>{detailBackup.hostname}</strong></div>
                <div><span className="text-muted-foreground">Usuario:</span> <strong>{detailBackup.user_email}</strong></div>
                <div><span className="text-muted-foreground">Fecha:</span> <strong>{new Date(detailBackup.backup_date).toLocaleDateString("es")}</strong></div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  <span className={`status-badge ${statusStyles[detailBackup.status]}`}>
                    {statusLabels[detailBackup.status] || detailBackup.status}
                  </span>
                </div>
                <div><span className="text-muted-foreground">Tamaño:</span> <strong>{formatBytes(detailBackup.total_size_bytes)}</strong></div>
                <div><span className="text-muted-foreground">Archivos:</span> <strong>{detailBackup.file_count}</strong></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Carpetas respaldadas</Label>
                <div className="flex gap-2 mt-1">
                  {detailBackup.folders.map(f => (
                    <span key={f} className="text-xs px-2 py-1 bg-muted rounded">{f}</span>
                  ))}
                </div>
              </div>
              {detailBackup.storage_path && (
                <div>
                  <Label className="text-xs text-muted-foreground">Ruta de almacenamiento</Label>
                  <p className="font-mono text-xs bg-muted rounded px-3 py-2 mt-1">{detailBackup.storage_path}</p>
                </div>
              )}
              {detailBackup.started_at && (
                <div className="text-xs text-muted-foreground">
                  Inicio: {new Date(detailBackup.started_at).toLocaleString("es")}
                  {detailBackup.completed_at && ` — Fin: ${new Date(detailBackup.completed_at).toLocaleString("es")}`}
                </div>
              )}
              {detailBackup.error_log && (
                <div>
                  <Label className="text-xs text-destructive">Errores</Label>
                  <pre className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-xs font-mono overflow-auto max-h-32 mt-1 text-destructive">
                    {detailBackup.error_log}
                  </pre>
                </div>
              )}
              <div className="flex justify-end gap-2">
                {detailBackup.status === "completed" && (
                  <Button variant="outline" onClick={() => { handleRequestRestore(detailBackup); setDetailBackup(null); }}>
                    <RotateCcw className="h-4 w-4 mr-2" />Restaurar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Backups;
