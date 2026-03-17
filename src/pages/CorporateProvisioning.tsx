import { useState } from "react";
import { Globe, Mail, Settings2, Plus, Trash2, Edit2, RefreshCw, Check,
  CheckCircle, XCircle, Clock, Download, ChevronRight, Package, Loader2,
  Shield, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCorporate } from "@/hooks/useCorporate";
import { buildEmailAddress } from "@/services/emailAccountService";
import { generateWindowsScript, generateLinuxScript } from "@/services/provisioningService";
import { copyTextToClipboard } from "@/lib/utils";
import type {
  CorporateDomain, CorporateEmailAccount, ProvisioningProfile,
  DomainProvider, EmailProvider, OsTarget, SoftwarePackage,
} from "@/types/corporate";
import { EMAIL_PROVIDER_DEFAULTS } from "@/types/corporate";

// ── Status helpers ──────────────────────────────────────────────────────────

const domainStatusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendiente",  cls: "status-maintenance" },
    active:  { label: "Activo",     cls: "status-available" },
    error:   { label: "Error",      cls: "priority-critical" },
  };
  const cfg = map[status] ?? map.pending;
  return <Badge className={`text-xs ${cfg.cls}`}>{cfg.label}</Badge>;
};

const emailStatusBadge = (status: string) => {
  const icons: Record<string, React.ReactNode> = {
    pending:   <Clock className="h-3 w-3" />,
    active:    <CheckCircle className="h-3 w-3" />,
    suspended: <XCircle className="h-3 w-3" />,
    error:     <XCircle className="h-3 w-3" />,
  };
  const cls: Record<string, string> = {
    pending:   "status-maintenance",
    active:    "status-available",
    suspended: "status-retired",
    error:     "priority-critical",
  };
  return (
    <Badge className={`text-xs gap-1 inline-flex items-center ${cls[status] ?? cls.pending}`}>
      {icons[status] ?? icons.pending}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

// ── Domain Form ─────────────────────────────────────────────────────────────

interface DomainFormState {
  domain_name: string;
  display_name: string;
  provider: DomainProvider;
  notes: string;
}

const EMPTY_DOMAIN: DomainFormState = {
  domain_name: "",
  display_name: "",
  provider: "custom",
  notes: "",
};

function DomainDialog({
  trigger,
  initial,
  onSave,
}: {
  trigger: React.ReactNode;
  initial?: DomainFormState;
  onSave: (form: DomainFormState) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DomainFormState>(initial ?? EMPTY_DOMAIN);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.domain_name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setOpen(false);
    setForm(EMPTY_DOMAIN);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar dominio" : "Registrar dominio corporativo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Dominio *</Label>
            <Input
              placeholder="empresa.com"
              value={form.domain_name}
              onChange={e => setForm({ ...form, domain_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Nombre visible</Label>
            <Input
              placeholder="Mi Empresa S.A."
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Proveedor</Label>
            <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v as DomainProvider })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google Workspace</SelectItem>
                <SelectItem value="microsoft">Microsoft 365</SelectItem>
                <SelectItem value="custom">Personalizado / Propio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea
              rows={2}
              placeholder="Información adicional..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.domain_name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Email Account Form ───────────────────────────────────────────────────────

interface EmailFormState {
  local_part: string;
  display_name: string;
  domain_id: string;
  provider: EmailProvider;
  smtp_host: string;
  smtp_port: string;
  imap_host: string;
  imap_port: string;
  use_tls: boolean;
}

const EMPTY_EMAIL: EmailFormState = {
  local_part: "",
  display_name: "",
  domain_id: "",
  provider: "custom",
  smtp_host: "",
  smtp_port: "587",
  imap_host: "",
  imap_port: "993",
  use_tls: true,
};

function EmailAccountDialog({
  trigger,
  domains,
  onSave,
}: {
  trigger: React.ReactNode;
  domains: CorporateDomain[];
  onSave: (form: EmailFormState) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmailFormState>(EMPTY_EMAIL);
  const [saving, setSaving] = useState(false);

  const handleProviderChange = (provider: EmailProvider) => {
    const defaults = EMAIL_PROVIDER_DEFAULTS[provider];
    setForm({ ...form, provider,
      smtp_host: defaults.smtp_host,
      smtp_port: String(defaults.smtp_port),
      imap_host: defaults.imap_host,
      imap_port: String(defaults.imap_port),
    });
  };

  const selectedDomain = domains.find(d => d.id === form.domain_id);
  const previewEmail = form.local_part && selectedDomain
    ? `${form.local_part.trim().toLowerCase()}@${selectedDomain.domain_name}`
    : "";

  const handleSave = async () => {
    if (!form.local_part.trim() || !form.domain_id || !form.display_name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setOpen(false);
    setForm(EMPTY_EMAIL);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear cuenta de correo corporativo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre de usuario *</Label>
              <Input
                placeholder="juan.perez"
                value={form.local_part}
                onChange={e => setForm({ ...form, local_part: e.target.value })}
              />
            </div>
            <div>
              <Label>Dominio *</Label>
              <Select value={form.domain_id} onValueChange={v => setForm({ ...form, domain_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {domains.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.domain_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {previewEmail && (
            <p className="text-sm text-muted-foreground">
              Correo resultante:{" "}
              <span className="font-mono text-foreground">{previewEmail}</span>
            </p>
          )}

          <div>
            <Label>Nombre visible *</Label>
            <Input
              placeholder="Juan Pérez"
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
            />
          </div>

          <div>
            <Label>Proveedor de correo</Label>
            <Select value={form.provider} onValueChange={v => handleProviderChange(v as EmailProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google Workspace</SelectItem>
                <SelectItem value="microsoft">Microsoft 365</SelectItem>
                <SelectItem value="smtp">SMTP genérico</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Servidor SMTP</Label>
              <Input value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} />
            </div>
            <div>
              <Label>Puerto SMTP</Label>
              <Input type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: e.target.value })} />
            </div>
            <div>
              <Label>Servidor IMAP</Label>
              <Input value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} />
            </div>
            <div>
              <Label>Puerto IMAP</Label>
              <Input type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="use-tls"
              checked={form.use_tls}
              onCheckedChange={v => setForm({ ...form, use_tls: v })}
            />
            <Label htmlFor="use-tls">Usar TLS/SSL</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.local_part.trim() || !form.domain_id || !form.display_name.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Crear cuenta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Provisioning Profile Form ────────────────────────────────────────────────

interface ProfileFormState {
  name: string;
  description: string;
  os_target: OsTarget;
  domain_id: string;
  custom_ps_snippet: string;
  custom_bash_snippet: string;
  auto_assign_email: boolean;
  auto_join_domain: boolean;
  is_default: boolean;
  software_packages: SoftwarePackage[];
}

const EMPTY_PROFILE: ProfileFormState = {
  name: "",
  description: "",
  os_target: "windows",
  domain_id: "",
  custom_ps_snippet: "",
  custom_bash_snippet: "",
  auto_assign_email: true,
  auto_join_domain: false,
  is_default: false,
  software_packages: [],
};

function ProfileDialog({
  trigger,
  domains,
  onSave,
}: {
  trigger: React.ReactNode;
  domains: CorporateDomain[];
  onSave: (form: ProfileFormState) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [newPkg, setNewPkg] = useState({ name: "", install_command: "" });

  const addPackage = () => {
    if (!newPkg.name.trim() || !newPkg.install_command.trim()) return;
    setForm(f => ({ ...f, software_packages: [...f.software_packages, { ...newPkg }] }));
    setNewPkg({ name: "", install_command: "" });
  };

  const removePackage = (idx: number) => {
    setForm(f => ({ ...f, software_packages: f.software_packages.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setOpen(false);
    setForm(EMPTY_PROFILE);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear perfil de aprovisionamiento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre del perfil *</Label>
              <Input
                placeholder="Estación de trabajo estándar"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>SO objetivo</Label>
              <Select value={form.os_target} onValueChange={v => setForm({ ...form, os_target: v as OsTarget })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Descripción</Label>
            <Input
              placeholder="Perfil para desarrolladores con herramientas base"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <Label>Dominio corporativo</Label>
            <Select value={form.domain_id} onValueChange={v => setForm({ ...form, domain_id: v })}>
              <SelectTrigger><SelectValue placeholder="Ninguno seleccionado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin dominio</SelectItem>
                {domains.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.domain_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch id="auto-email" checked={form.auto_assign_email} onCheckedChange={v => setForm({ ...form, auto_assign_email: v })} />
              <Label htmlFor="auto-email">Asignar correo automáticamente</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="auto-domain" checked={form.auto_join_domain} onCheckedChange={v => setForm({ ...form, auto_join_domain: v })} />
              <Label htmlFor="auto-domain">Unir al dominio</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="is-default" checked={form.is_default} onCheckedChange={v => setForm({ ...form, is_default: v })} />
              <Label htmlFor="is-default">Perfil predeterminado</Label>
            </div>
          </div>

          {/* Software Packages */}
          <div>
            <Label className="mb-2 block">Paquetes de software</Label>
            <div className="space-y-2 mb-3">
              {form.software_packages.map((pkg, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2">
                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{pkg.name}</span>
                  <code className="text-xs text-muted-foreground flex-1 truncate">{pkg.install_command}</code>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removePackage(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <Input
                className="col-span-2"
                placeholder="Nombre (ej: Chrome)"
                value={newPkg.name}
                onChange={e => setNewPkg({ ...newPkg, name: e.target.value })}
              />
              <Input
                className="col-span-2"
                placeholder="Comando de instalación"
                value={newPkg.install_command}
                onChange={e => setNewPkg({ ...newPkg, install_command: e.target.value })}
              />
              <Button variant="secondary" onClick={addPackage} disabled={!newPkg.name.trim() || !newPkg.install_command.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Custom snippets */}
          <div>
            <Label>Script personalizado (PowerShell)</Label>
            <Textarea
              rows={3}
              placeholder="# Comandos adicionales para Windows..."
              value={form.custom_ps_snippet}
              onChange={e => setForm({ ...form, custom_ps_snippet: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>Script personalizado (Bash)</Label>
            <Textarea
              rows={3}
              placeholder="# Comandos adicionales para Linux/macOS..."
              value={form.custom_bash_snippet}
              onChange={e => setForm({ ...form, custom_bash_snippet: e.target.value })}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Crear perfil
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Script download helper ───────────────────────────────────────────────────

function downloadScript(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CorporateProvisioning() {
  const { toast } = useToast();
  const {
    domains, emails, profiles, loading,
    createDomain, updateDomain, deleteDomain, activateDomain,
    createEmailAccount, updateEmailAccount, deleteEmailAccount,
    createProfile, updateProfile, deleteProfile,
    moduleUnavailable,
    refresh,
  } = useCorporate();

  const [editingDomain, setEditingDomain] = useState<CorporateDomain | null>(null);
  const [scriptPreview, setScriptPreview] = useState<{ content: string; os: "windows" | "linux" } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL ?? "";
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  // ── Domain tab handlers ────────────────────────────────────────────────────

  const handleCreateDomain = async (form: Parameters<typeof createDomain>[0]) => {
    await createDomain(form);
  };

  // ── Email tab handlers ─────────────────────────────────────────────────────

  const handleCreateEmail = async (form: {
    local_part: string; display_name: string; domain_id: string;
    provider: EmailProvider; smtp_host: string; smtp_port: string;
    imap_host: string; imap_port: string; use_tls: boolean;
  }) => {
    const domain = domains.find(d => d.id === form.domain_id);
    if (!domain) { toast({ title: "Dominio no encontrado", variant: "destructive" }); return; }
    try {
      const emailAddress = buildEmailAddress(form.local_part, domain.domain_name);
      await createEmailAccount({
        email_address: emailAddress,
        local_part: form.local_part.trim().toLowerCase(),
        display_name: form.display_name.trim(),
        domain_id: form.domain_id,
        provider: form.provider,
        smtp_host: form.smtp_host || null,
        smtp_port: form.smtp_port ? parseInt(form.smtp_port, 10) : null,
        imap_host: form.imap_host || null,
        imap_port: form.imap_port ? parseInt(form.imap_port, 10) : null,
        use_tls: form.use_tls,
      });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  // ── Profile tab handlers ───────────────────────────────────────────────────

  const handleCreateProfile = async (form: ProfileFormState) => {
    await createProfile({
      ...form,
      domain_id: form.domain_id || null,
      custom_ps_snippet: form.custom_ps_snippet || null,
      custom_bash_snippet: form.custom_bash_snippet || null,
    });
  };

  const handleGenerateScript = (profile: ProvisioningProfile, os: "windows" | "linux") => {
    const domain    = domains.find(d => d.id === profile.domain_id);
    const ctx = {
      profile,
      domainName: domain?.domain_name,
      supabaseUrl,
      supabaseAnonKey,
    };
    const content = os === "windows"
      ? generateWindowsScript(ctx)
      : generateLinuxScript(ctx);
    setScriptPreview({ content, os });
  };

  const handleDownloadScript = () => {
    if (!scriptPreview) return;
    const isWin = scriptPreview.os === "windows";
    downloadScript(
      scriptPreview.content,
      isWin ? "provision.ps1" : "provision.sh",
      "application/octet-stream",
    );
    toast({ title: "Script descargado", description: isWin ? "provision.ps1" : "provision.sh" });
  };

  const handleCopyEmail = async (emailAddress: string, id: string) => {
    await copyTextToClipboard(emailAddress);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Aprovisionamiento Corporativo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dominio, correos corporativos y perfiles de configuración automática
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {moduleUnavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          El modulo corporativo no esta disponible en este entorno porque faltan tablas en la base de datos.
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Dominios",  value: domains.length,  icon: Globe },
          { label: "Correos",   value: emails.length,   icon: Mail },
          { label: "Perfiles",  value: profiles.length, icon: Settings2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card rounded-lg border p-4 flex items-center gap-3">
            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="domains">
        <TabsList className="mb-4">
          <TabsTrigger value="domains" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Dominios
          </TabsTrigger>
          <TabsTrigger value="emails" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Correos Corporativos
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Perfiles de Aprovisionamiento
          </TabsTrigger>
        </TabsList>

        {/* ── DOMAINS TAB ────────────────────────────────────────────── */}
        <TabsContent value="domains">
          <div className="bg-card rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-foreground">Dominios empresariales</h3>
                <p className="text-sm text-muted-foreground">Gestiona los dominios asociados a la empresa</p>
              </div>
              <DomainDialog
                trigger={<Button size="sm" disabled={moduleUnavailable} title={moduleUnavailable ? "Modulo corporativo no disponible" : undefined}><Plus className="h-4 w-4 mr-1" />Registrar dominio</Button>}
                onSave={handleCreateDomain}
              />
            </div>

            {loading && <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>}

            {!loading && domains.length === 0 && (
              <div className="p-12 text-center">
                <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-sm">No hay dominios registrados.</p>
                <p className="text-muted-foreground text-xs mt-1">Registra un dominio para comenzar a crear cuentas de correo corporativo.</p>
              </div>
            )}

            {!loading && domains.length > 0 && (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dominio</th>
                      <th>Proveedor</th>
                      <th>Estado</th>
                      <th>SSO</th>
                      <th>Registrado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map(d => (
                      <tr key={d.id}>
                        <td>
                          <div className="font-medium text-sm">{d.domain_name}</div>
                          {d.display_name && <div className="text-xs text-muted-foreground">{d.display_name}</div>}
                        </td>
                        <td className="capitalize text-sm">{d.provider}</td>
                        <td>{domainStatusBadge(d.status)}</td>
                        <td>
                          {d.sso_enabled
                            ? <Badge className="text-xs status-available gap-1"><Shield className="h-3 w-3" />Activo</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {new Date(d.created_at).toLocaleDateString("es-CO")}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {d.status !== "active" && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => activateDomain(d.id)} disabled={moduleUnavailable}>
                                <Check className="h-3 w-3 mr-1" />Activar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => deleteDomain(d.id)} disabled={moduleUnavailable}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── EMAILS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="emails">
          <div className="bg-card rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-foreground">Cuentas de correo corporativo</h3>
                <p className="text-sm text-muted-foreground">Correos asociados a usuarios y equipos de la empresa</p>
              </div>
              {domains.length > 0 ? (
                <EmailAccountDialog
                  trigger={<Button size="sm" disabled={moduleUnavailable} title={moduleUnavailable ? "Modulo corporativo no disponible" : undefined}><Plus className="h-4 w-4 mr-1" />Crear cuenta</Button>}
                  domains={domains}
                  onSave={handleCreateEmail}
                />
              ) : (
                <Button size="sm" disabled title="Registra un dominio primero">
                  <Plus className="h-4 w-4 mr-1" />Crear cuenta
                </Button>
              )}
            </div>

            {domains.length === 0 && !loading && (
              <div className="p-6 text-center text-sm text-muted-foreground border-b bg-muted/20">
                Necesitas registrar al menos un dominio antes de crear cuentas de correo.
              </div>
            )}

            {loading && <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>}

            {!loading && emails.length === 0 && (
              <div className="p-12 text-center">
                <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-sm">No hay cuentas de correo corporativo.</p>
              </div>
            )}

            {!loading && emails.length > 0 && (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th>Nombre</th>
                      <th>Proveedor</th>
                      <th>SMTP / IMAP</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map(e => (
                      <tr key={e.id}>
                        <td className="font-mono text-xs">
                          <span
                            className="cursor-pointer hover:text-primary transition-colors"
                            title="Clic para copiar"
                            onClick={() => handleCopyEmail(e.email_address, e.id)}
                          >
                            {e.email_address}
                            {copiedId === e.id && <Check className="inline h-3 w-3 ml-1 text-emerald-500" />}
                          </span>
                        </td>
                        <td className="text-sm">{e.display_name}</td>
                        <td className="capitalize text-sm">{e.provider}</td>
                        <td className="text-xs text-muted-foreground">
                          {e.smtp_host ? `${e.smtp_host}:${e.smtp_port}` : "—"}
                        </td>
                        <td>{emailStatusBadge(e.status)}</td>
                        <td>
                          <div className="flex gap-1">
                            {e.status === "pending" && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                onClick={() => updateEmailAccount(e.id, { status: "active" })}
                                disabled={moduleUnavailable}>
                                <Check className="h-3 w-3 mr-1" />Activar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => deleteEmailAccount(e.id)}
                              disabled={moduleUnavailable}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── PROFILES TAB ───────────────────────────────────────────── */}
        <TabsContent value="profiles">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Perfiles de aprovisionamiento</h3>
                <p className="text-sm text-muted-foreground">Define qué se instala y configura en cada equipo nuevo</p>
              </div>
              <ProfileDialog
                trigger={<Button size="sm" disabled={moduleUnavailable} title={moduleUnavailable ? "Modulo corporativo no disponible" : undefined}><Plus className="h-4 w-4 mr-1" />Nuevo perfil</Button>}
                domains={domains}
                onSave={handleCreateProfile}
              />
            </div>

            {loading && <div className="p-8 text-center text-muted-foreground text-sm bg-card rounded-lg border">Cargando...</div>}

            {!loading && profiles.length === 0 && (
              <div className="p-12 text-center bg-card rounded-lg border">
                <Settings2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-sm">No hay perfiles de aprovisionamiento.</p>
                <p className="text-muted-foreground text-xs mt-1">Crea un perfil para generar scripts automáticos de configuración de equipos.</p>
              </div>
            )}

            {!loading && profiles.map(profile => {
              const domain = domains.find(d => d.id === profile.domain_id);
              return (
                <div key={profile.id} className="bg-card rounded-lg border">
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{profile.name}</span>
                        {profile.is_default && <Badge className="text-xs">Predeterminado</Badge>}
                        <Badge variant="outline" className="text-xs capitalize">{profile.os_target}</Badge>
                        {domain && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Globe className="h-3 w-3" />{domain.domain_name}
                          </span>
                        )}
                      </div>
                      {profile.description && (
                        <p className="text-sm text-muted-foreground mt-1">{profile.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {profile.auto_assign_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />Correo automático</span>}
                        {profile.auto_join_domain  && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />Unión al dominio</span>}
                        {profile.software_packages.length > 0 && (
                          <span className="flex items-center gap-1"><Package className="h-3 w-3" />{profile.software_packages.length} paquete(s)</span>
                        )}
                      </div>
                      {profile.software_packages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {profile.software_packages.map((pkg, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-muted text-xs rounded px-2 py-0.5">
                              <Package className="h-3 w-3" />{pkg.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      {(profile.os_target === "windows" || profile.os_target === "all") && (
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs"
                          onClick={() => handleGenerateScript(profile, "windows")}
                          title="Generar script Windows (.ps1)">
                          <Download className="h-3.5 w-3.5 mr-1" />Win
                        </Button>
                      )}
                      {(profile.os_target === "linux" || profile.os_target === "macos" || profile.os_target === "all") && (
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs"
                          onClick={() => handleGenerateScript(profile, "linux")}
                          title="Generar script Linux/macOS (.sh)">
                          <Download className="h-3.5 w-3.5 mr-1" />Linux
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive"
                        onClick={() => deleteProfile(profile.id)}
                        disabled={moduleUnavailable}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Script preview modal */}
      {scriptPreview && (
        <Dialog open onOpenChange={() => setScriptPreview(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Script generado — {scriptPreview.os === "windows" ? "Windows (.ps1)" : "Linux/macOS (.sh)"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              <pre className="bg-muted text-xs font-mono p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {scriptPreview.content}
              </pre>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={async () => {
                await copyTextToClipboard(scriptPreview.content);
                toast({ title: "Script copiado al portapapeles" });
              }}>
                Copiar
              </Button>
              <Button onClick={handleDownloadScript}>
                <Download className="h-4 w-4 mr-1" />Descargar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
