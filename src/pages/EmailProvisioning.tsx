import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Plus, Mail, RefreshCw, Loader2, CheckCircle, XCircle, Clock,
  Trash2, Play, Edit2, Globe, Server, X, Check
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queueScriptExecutions } from "@/lib/scriptExecutions";
import { DevicePickerRow, fetchDeviceList } from "@/lib/deviceQueries";

interface EmailConfig {
  id: string;
  user_email: string;
  display_name: string;
  provider: string;
  domain: string;
  imap_server: string | null;
  imap_port: number | null;
  smtp_server: string | null;
  smtp_port: number | null;
  exchange_server: string | null;
  use_exchange: boolean;
  device_id: string | null;
  status: string;
  applied_at: string | null;
  error_log: string | null;
  created_at: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  applying: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  applied: <CheckCircle className="h-3.5 w-3.5" />,
  failed: <XCircle className="h-3.5 w-3.5" />,
};

const statusStyles: Record<string, string> = {
  pending: "status-maintenance",
  applying: "status-assigned",
  applied: "status-available",
  failed: "priority-critical",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  applying: "Aplicando",
  applied: "Aplicado",
  failed: "Fallido",
};

const providerDefaults: Record<string, { imap_server: string; imap_port: number; smtp_server: string; smtp_port: number }> = {
  outlook: { imap_server: "outlook.office365.com", imap_port: 993, smtp_server: "smtp.office365.com", smtp_port: 587 },
  gmail: { imap_server: "imap.gmail.com", imap_port: 993, smtp_server: "smtp.gmail.com", smtp_port: 587 },
  exchange: { imap_server: "", imap_port: 993, smtp_server: "", smtp_port: 587 },
  custom: { imap_server: "", imap_port: 993, smtp_server: "", smtp_port: 587 },
};

const EmailProvisioning = () => {
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [devices, setDevices] = useState<DevicePickerRow[]>([]);;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [detailConfig, setDetailConfig] = useState<EmailConfig | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "No se puede aplicar la configuración sin empresa asociada.",
  });

  const emptyForm = {
    user_email: "", display_name: "", provider: "outlook", domain: "",
    imap_server: "outlook.office365.com", imap_port: 993,
    smtp_server: "smtp.office365.com", smtp_port: 587,
    exchange_server: "", use_exchange: false, device_id: "",
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    setLoading(true);
    const [cfgResult, devList] = await Promise.all([
      withCompanyScope(supabase.from("email_configs").select("*")).order("created_at", { ascending: false }).limit(200),
      fetchDeviceList(companyId),
    ]);
    if (cfgResult.data) setConfigs(cfgResult.data as EmailConfig[]);
    setDevices(devList);
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    fetchData();
    const channel = supabase
      .channel("email-configs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_configs" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, companyLoading]);

  const handleProviderChange = (provider: string) => {
    const defaults = providerDefaults[provider] || providerDefaults.custom;
    setForm({
      ...form,
      provider,
      imap_server: defaults.imap_server,
      imap_port: defaults.imap_port,
      smtp_server: defaults.smtp_server,
      smtp_port: defaults.smtp_port,
      use_exchange: provider === "exchange",
    });
  };

  const handleSave = async () => {
    if (!form.user_email || !form.display_name || !form.domain) {
      toast({ title: "Campos requeridos faltantes", variant: "destructive" });
      return;
    }

    const data = {
      user_email: form.user_email,
      display_name: form.display_name,
      provider: form.provider,
      domain: form.domain,
      imap_server: form.imap_server || null,
      imap_port: form.imap_port,
      smtp_server: form.smtp_server || null,
      smtp_port: form.smtp_port,
      exchange_server: form.exchange_server || null,
      use_exchange: form.use_exchange,
      device_id: form.device_id || null,
      status: "pending",
      company_id: companyId || null,
    };

    if (editingConfig) {
      let query = supabase.from("email_configs").update(data).eq("id", editingConfig.id);
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      const { error } = await query;
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Configuración actualizada" });
    } else {
      const { error } = await supabase.from("email_configs").insert(data as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Configuración creada" });
    }

    setDialogOpen(false);
    setEditingConfig(null);
    setForm(emptyForm);
    fetchData();
  };

  const handleApply = async (config: EmailConfig) => {
    if (!config.device_id) {
      toast({ title: "No hay dispositivo asignado", variant: "destructive" });
      return;
    }

    // Update status to applying
    let applyingQuery = supabase.from("email_configs").update({ status: "applying" }).eq("id", config.id);
    if (companyId) {
      applyingQuery = applyingQuery.eq("company_id", companyId);
    }
    await applyingQuery;

    // Generate script content based on provider
    let scriptContent = "";
    if (config.provider === "outlook" || config.provider === "exchange") {
      scriptContent = `# Configuración automática de correo - ${config.provider.toUpperCase()}
# Usuario: ${config.user_email}
# Dominio: ${config.domain}

$email = "${config.user_email}"
$displayName = "${config.display_name}"
${config.use_exchange ? `$exchangeServer = "${config.exchange_server}"` : ""}

# Configurar perfil de Outlook
$outlookKey = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Profiles\\Outlook"
if (!(Test-Path $outlookKey)) { New-Item -Path $outlookKey -Force | Out-Null }

# Configurar cuenta IMAP/SMTP
$accountKey = "$outlookKey\\9375CFF0413111d3B88A00104B2A6676\\00000001"
if (!(Test-Path $accountKey)) { New-Item -Path $accountKey -Force | Out-Null }

Set-ItemProperty -Path $accountKey -Name "Account Name" -Value $email
Set-ItemProperty -Path $accountKey -Name "Display Name" -Value $displayName
Set-ItemProperty -Path $accountKey -Name "Email" -Value $email
Set-ItemProperty -Path $accountKey -Name "IMAP Server" -Value "${config.imap_server}"
Set-ItemProperty -Path $accountKey -Name "IMAP Port" -Value ${config.imap_port}
Set-ItemProperty -Path $accountKey -Name "SMTP Server" -Value "${config.smtp_server}"
Set-ItemProperty -Path $accountKey -Name "SMTP Port" -Value ${config.smtp_port}
Set-ItemProperty -Path $accountKey -Name "IMAP Use SSL" -Value 1
Set-ItemProperty -Path $accountKey -Name "SMTP Use SSL" -Value 1

Write-Output "Configuración de correo aplicada para $email"`;
    } else if (config.provider === "gmail") {
      scriptContent = `# Configuración automática de Gmail Corporativo
# Usuario: ${config.user_email}
# Dominio: ${config.domain}

$email = "${config.user_email}"
$displayName = "${config.display_name}"

# Configurar perfil de Outlook para Gmail
$outlookKey = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Profiles\\Outlook"
if (!(Test-Path $outlookKey)) { New-Item -Path $outlookKey -Force | Out-Null }

$accountKey = "$outlookKey\\9375CFF0413111d3B88A00104B2A6676\\00000002"
if (!(Test-Path $accountKey)) { New-Item -Path $accountKey -Force | Out-Null }

Set-ItemProperty -Path $accountKey -Name "Account Name" -Value $email
Set-ItemProperty -Path $accountKey -Name "Display Name" -Value $displayName
Set-ItemProperty -Path $accountKey -Name "Email" -Value $email
Set-ItemProperty -Path $accountKey -Name "IMAP Server" -Value "imap.gmail.com"
Set-ItemProperty -Path $accountKey -Name "IMAP Port" -Value 993
Set-ItemProperty -Path $accountKey -Name "SMTP Server" -Value "smtp.gmail.com"
Set-ItemProperty -Path $accountKey -Name "SMTP Port" -Value 587
Set-ItemProperty -Path $accountKey -Name "IMAP Use SSL" -Value 1
Set-ItemProperty -Path $accountKey -Name "SMTP Use SSL" -Value 1

Write-Output "Configuración de Gmail corporativo aplicada para $email"`;
    } else {
      scriptContent = `# Configuración de correo personalizado
# Usuario: ${config.user_email}
# IMAP: ${config.imap_server}:${config.imap_port}
# SMTP: ${config.smtp_server}:${config.smtp_port}

Write-Output "Configuración personalizada - requiere configuración manual del cliente de correo"
Write-Output "Email: ${config.user_email}"
Write-Output "IMAP: ${config.imap_server}:${config.imap_port}"
Write-Output "SMTP: ${config.smtp_server}:${config.smtp_port}"`;
    }

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      return;
    }

    const { error } = await queueScriptExecutions({
      ensureCompanyId,
      executions: [{
        device_id: config.device_id,
        script_name: `Configurar Email: ${config.user_email}`,
        script_type: "setup-email",
        script_content: scriptContent,
        status: "pending",
        executed_by: user?.id,
        company_id: scopedCompanyId,
      }],
    });

    await supabase.from("system_logs").insert({
      device_id: config.device_id,
      action: "email_provisioning",
      category: "automation",
      severity: "info" as any,
      message: `Configuración de ${config.provider} enviada para ${config.user_email}`,
      user_id: user?.id,
      company_id: scopedCompanyId,
      details: { provider: config.provider, domain: config.domain },
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración enviada", description: `Script de ${config.provider} enviado al dispositivo` });
    }
  };

  const handleDelete = async (id: string) => {
    let query = supabase.from("email_configs").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Configuración eliminada" });
    fetchData();
  };

  const openEdit = (c: EmailConfig) => {
    setEditingConfig(c);
    setForm({
      user_email: c.user_email,
      display_name: c.display_name,
      provider: c.provider,
      domain: c.domain,
      imap_server: c.imap_server || "",
      imap_port: c.imap_port || 993,
      smtp_server: c.smtp_server || "",
      smtp_port: c.smtp_port || 587,
      exchange_server: c.exchange_server || "",
      use_exchange: c.use_exchange,
      device_id: c.device_id || "",
    });
    setDialogOpen(true);
  };

  const filtered = configs.filter(c => {
    const matchSearch =
      c.user_email.toLowerCase().includes(search.toLowerCase()) ||
      c.display_name.toLowerCase().includes(search.toLowerCase()) ||
      c.domain.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalConfigs = configs.length;
  const appliedConfigs = configs.filter(c => c.status === "applied").length;
  const pendingConfigs = configs.filter(c => c.status === "pending").length;

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Email Provisioning</h1>
          <p className="page-description">Configuración automática de correo corporativo en equipos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingConfig(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nueva Configuración</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingConfig ? "Editar Configuración" : "Nueva Configuración de Correo"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Email del usuario *</Label>
                    <Input placeholder="usuario@empresa.com" value={form.user_email} onChange={e => setForm({...form, user_email: e.target.value})} />
                  </div>
                  <div>
                    <Label>Nombre para mostrar *</Label>
                    <Input placeholder="Juan Pérez" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Proveedor</Label>
                    <Select value={form.provider} onValueChange={handleProviderChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outlook">Outlook / Office 365</SelectItem>
                        <SelectItem value="gmail">Gmail Corporativo</SelectItem>
                        <SelectItem value="exchange">Exchange On-Premise</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Dominio *</Label>
                    <Input placeholder="empresa.com" value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Servidores de correo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Servidor IMAP</Label>
                      <Input className="text-xs" value={form.imap_server} onChange={e => setForm({...form, imap_server: e.target.value})} />
                    </div>
                    <div>
                      <Label className="text-xs">Puerto IMAP</Label>
                      <Input type="number" className="text-xs" value={form.imap_port} onChange={e => setForm({...form, imap_port: parseInt(e.target.value) || 993})} />
                    </div>
                    <div>
                      <Label className="text-xs">Servidor SMTP</Label>
                      <Input className="text-xs" value={form.smtp_server} onChange={e => setForm({...form, smtp_server: e.target.value})} />
                    </div>
                    <div>
                      <Label className="text-xs">Puerto SMTP</Label>
                      <Input type="number" className="text-xs" value={form.smtp_port} onChange={e => setForm({...form, smtp_port: parseInt(e.target.value) || 587})} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={form.use_exchange} onCheckedChange={v => setForm({...form, use_exchange: v})} />
                  <Label className="text-sm">Usar Exchange Server</Label>
                </div>
                {form.use_exchange && (
                  <div>
                    <Label className="text-xs">Servidor Exchange</Label>
                    <Input className="text-xs" placeholder="exchange.empresa.com" value={form.exchange_server} onChange={e => setForm({...form, exchange_server: e.target.value})} />
                  </div>
                )}

                <div>
                  <Label>Dispositivo destino</Label>
                  <Select value={form.device_id} onValueChange={v => setForm({...form, device_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar dispositivo (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {devices.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.hostname} ({d.device_id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingConfig(null); setForm(emptyForm); }}>Cancelar</Button>
                  <Button onClick={handleSave}><Check className="h-4 w-4 mr-2" />{editingConfig ? "Guardar" : "Crear"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Configuraciones</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalConfigs}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-accent-foreground" />
            <span className="text-xs text-muted-foreground">Aplicados</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{appliedConfigs}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Pendientes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingConfigs}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por email, nombre o dominio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="applying">Aplicando</SelectItem>
            <SelectItem value="applied">Aplicado</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Proveedor</th>
              <th>Dominio</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td className="font-medium text-xs">{c.user_email}</td>
                <td className="text-xs">{c.display_name}</td>
                <td>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground capitalize">
                    {c.provider}
                  </span>
                </td>
                <td className="text-xs font-mono">{c.domain}</td>
                <td>
                  <span className={`status-badge ${statusStyles[c.status] || "status-maintenance"} inline-flex items-center gap-1`}>
                    {statusIcons[c.status]}
                    {statusLabels[c.status] || c.status}
                  </span>
                </td>
                <td className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("es")}</td>
                <td>
                  <div className="flex gap-1">
                    {c.status === "pending" && c.device_id && (
                      <Button variant="ghost" size="sm" onClick={() => handleApply(c)} title="Aplicar">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Editar">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDetailConfig(c)} title="Ver detalle">
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} title="Eliminar">
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
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay configuraciones de correo</p>
            <p className="text-xs mt-1">Crea una nueva configuración para comenzar</p>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailConfig} onOpenChange={() => setDetailConfig(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Configuración</DialogTitle></DialogHeader>
          {detailConfig && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span> <strong>{detailConfig.user_email}</strong></div>
                <div><span className="text-muted-foreground">Nombre:</span> <strong>{detailConfig.display_name}</strong></div>
                <div><span className="text-muted-foreground">Proveedor:</span> <strong className="capitalize">{detailConfig.provider}</strong></div>
                <div><span className="text-muted-foreground">Dominio:</span> <strong>{detailConfig.domain}</strong></div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  <span className={`status-badge ${statusStyles[detailConfig.status]}`}>
                    {statusLabels[detailConfig.status] || detailConfig.status}
                  </span>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Servidores</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/50 rounded px-3 py-2">
                    <span className="text-muted-foreground">IMAP:</span>
                    <p className="font-mono">{detailConfig.imap_server}:{detailConfig.imap_port}</p>
                  </div>
                  <div className="bg-muted/50 rounded px-3 py-2">
                    <span className="text-muted-foreground">SMTP:</span>
                    <p className="font-mono">{detailConfig.smtp_server}:{detailConfig.smtp_port}</p>
                  </div>
                </div>
                {detailConfig.use_exchange && detailConfig.exchange_server && (
                  <div className="bg-muted/50 rounded px-3 py-2 mt-2 text-xs">
                    <span className="text-muted-foreground">Exchange:</span>
                    <p className="font-mono">{detailConfig.exchange_server}</p>
                  </div>
                )}
              </div>

              {detailConfig.applied_at && (
                <p className="text-xs text-muted-foreground">Aplicado: {new Date(detailConfig.applied_at).toLocaleString("es")}</p>
              )}

              {detailConfig.error_log && (
                <div>
                  <Label className="text-xs text-destructive">Errores</Label>
                  <pre className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-xs font-mono overflow-auto max-h-32 mt-1 text-destructive">
                    {detailConfig.error_log}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailProvisioning;
