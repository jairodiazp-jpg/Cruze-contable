import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import {
  Search, Plus, Edit2, Trash2, Package, Shield, ShieldCheck, ShieldAlert,
  Monitor, Play, RefreshCw, X, Check, Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queueScriptExecutions } from "@/lib/scriptExecutions";
import { DevicePickerRowWithRole, fetchDeviceList } from "@/lib/deviceQueries";

interface RoleProfile {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  permissions_level: string;
  created_at: string;
  updated_at: string;
}

interface ProfileSoftware {
  id: string;
  profile_id: string;
  software_name: string;
  category: string;
  install_command: string | null;
  is_required: boolean;
  created_at: string;
}

const permissionLabels: Record<string, string> = {
  standard: "Usuario Estándar",
  local_admin: "Administrador Local",
  restricted: "Restringido",
};

const permissionIcons: Record<string, React.ReactNode> = {
  standard: <Shield className="h-4 w-4" />,
  local_admin: <ShieldCheck className="h-4 w-4" />,
  restricted: <ShieldAlert className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  navegador: "Navegador",
  suite_office: "Suite Office",
  utilidades: "Utilidades",
  soporte_remoto: "Soporte Remoto",
  red: "Red",
  comunicacion: "Comunicación",
  almacenamiento: "Almacenamiento",
  vpn: "VPN",
  correo: "Correo",
  general: "General",
};

const RoleProfiles = () => {
  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [software, setSoftware] = useState<Record<string, ProfileSoftware[]>>({});
  const [devices, setDevices] = useState<DevicePickerRowWithRole[]>([]);;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<RoleProfile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [softwareDialogOpen, setSoftwareDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RoleProfile | null>(null);
  const { toast } = useToast();
  const { user, role } = useAuth();
  const { companyId, companyLoading, ensureCompanyId } = useCompanyAccess({
    missingDescription: "No se puede aplicar el perfil sin empresa asociada.",
  });

  const [profileForm, setProfileForm] = useState({
    name: "", display_name: "", description: "", permissions_level: "standard",
  });

  const [softwareForm, setSoftwareForm] = useState({
    software_name: "", category: "general", install_command: "", is_required: true,
  });

  const [applyForm, setApplyForm] = useState({ device_id: "" });
  const [applying, setApplying] = useState(false);
  const canManageProfiles = role === "admin" || role === "technician";

  const fetchData = useCallback(async () => {
    setLoading(true);

    let profilesQuery = supabase.from("role_profiles").select("*").order("created_at");
    if (companyId) {
      profilesQuery = profilesQuery.eq("company_id", companyId);
    }

    const [profResult, devResult] = await Promise.all([
      profilesQuery,
      fetchDeviceList<DevicePickerRowWithRole>(companyId, "id, device_id, hostname, role_type"),
    ]);

    const profileRows = (profResult.data ?? []) as RoleProfile[];
    setProfiles(profileRows);
    setSelectedProfile((current) => {
      if (current && profileRows.some((profile) => profile.id === current.id)) {
        return current;
      }
      return profileRows[0] ?? null;
    });

    let swResult;
    if (companyId) {
      const profileIds = profileRows.map((profile) => profile.id);
      swResult = profileIds.length > 0
        ? await supabase.from("role_profile_software").select("*").in("profile_id", profileIds).order("category, software_name")
        : { data: [] as ProfileSoftware[] };
    } else {
      swResult = await supabase.from("role_profile_software").select("*").order("category, software_name");
    }

    if (swResult.data) {
      const grouped: Record<string, ProfileSoftware[]> = {};
      (swResult.data as ProfileSoftware[]).forEach(s => {
        if (!grouped[s.profile_id]) grouped[s.profile_id] = [];
        grouped[s.profile_id].push(s);
      });
      setSoftware(grouped);
    }
    setDevices(devResult);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();
  }, [companyId, companyLoading, fetchData]);

  const handleSaveProfile = async () => {
    if (!canManageProfiles) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden gestionar perfiles.", variant: "destructive" });
      return;
    }

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      return;
    }

    if (!profileForm.name || !profileForm.display_name) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    if (editingProfile) {
      let query = supabase.from("role_profiles")
        .update({ display_name: profileForm.display_name, description: profileForm.description, permissions_level: profileForm.permissions_level })
        .eq("id", editingProfile.id);
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      const { error } = await query;
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Perfil actualizado" });
    } else {
      const { error } = await supabase.from("role_profiles").insert({
        name: profileForm.name.toLowerCase().replace(/\s+/g, "_"),
        display_name: profileForm.display_name,
        description: profileForm.description || null,
        permissions_level: profileForm.permissions_level,
        company_id: scopedCompanyId,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Perfil creado" });
    }
    setProfileDialogOpen(false);
    setEditingProfile(null);
    setProfileForm({ name: "", display_name: "", description: "", permissions_level: "standard" });
    fetchData();
  };

  const handleDeleteProfile = async (id: string) => {
    if (!canManageProfiles) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden eliminar perfiles.", variant: "destructive" });
      return;
    }

    let query = supabase.from("role_profiles").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Perfil eliminado" });
    if (selectedProfile?.id === id) setSelectedProfile(null);
    fetchData();
  };

  const handleAddSoftware = async () => {
    if (!canManageProfiles) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden gestionar software por perfil.", variant: "destructive" });
      return;
    }

    if (!selectedProfile || !softwareForm.software_name) {
      toast({ title: "Nombre de software requerido", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("role_profile_software").insert({
      profile_id: selectedProfile.id,
      software_name: softwareForm.software_name,
      category: softwareForm.category,
      install_command: softwareForm.install_command || null,
      is_required: softwareForm.is_required,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Software agregado" });
    setSoftwareDialogOpen(false);
    setSoftwareForm({ software_name: "", category: "general", install_command: "", is_required: true });
    fetchData();
  };

  const handleDeleteSoftware = async (id: string) => {
    if (!canManageProfiles) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden eliminar software de perfiles.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("role_profile_software").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Software eliminado" });
    fetchData();
  };

  const handleApplyProfile = async () => {
    if (!canManageProfiles) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden aplicar perfiles.", variant: "destructive" });
      return;
    }

    if (!selectedProfile || !applyForm.device_id) {
      toast({ title: "Selecciona un dispositivo", variant: "destructive" });
      return;
    }
    setApplying(true);

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      setApplying(false);
      return;
    }

    // Update device role_type
    let deviceQuery = supabase.from("devices")
      .update({ role_type: selectedProfile.name })
      .eq("id", applyForm.device_id);
    deviceQuery = deviceQuery.eq("company_id", scopedCompanyId);
    await deviceQuery;

    // Get software list for profile
    const profileSw = software[selectedProfile.id] || [];
    const installCommands = profileSw
      .filter(s => s.install_command)
      .map(s => s.install_command)
      .join("\n");

    // Create script execution for the device
    const scriptContent = `# Perfil: ${selectedProfile.display_name}\n# Nivel de permisos: ${permissionLabels[selectedProfile.permissions_level]}\n# Software a instalar:\n${installCommands}`;

    const { error } = await queueScriptExecutions({
      ensureCompanyId,
      executions: [{
        device_id: applyForm.device_id,
        script_name: `Instalar Perfil: ${selectedProfile.display_name}`,
        script_type: "install-profile",
        script_content: scriptContent,
        status: "pending",
        executed_by: user?.id,
        company_id: scopedCompanyId,
      }],
    });

    // Move active deliveries for this device into configuration stage.
    let deliveryUpdateQuery = supabase
      .from("deliveries")
      .update({ status: "en_configuracion" })
      .eq("company_id", scopedCompanyId)
      .eq("device_id", applyForm.device_id);
    deliveryUpdateQuery = deliveryUpdateQuery.in("status", ["pendiente", "en_configuracion"]);
    await deliveryUpdateQuery;

    // Log the action
    await supabase.from("system_logs").insert({
      device_id: applyForm.device_id,
      action: "apply_profile",
      category: "automation",
      severity: "info" as Enums<"log_severity">,
      message: `Perfil "${selectedProfile.display_name}" aplicado al dispositivo`,
      user_id: user?.id,
      company_id: scopedCompanyId,
      details: { profile_name: selectedProfile.name, software_count: profileSw.length },
    });

    setApplying(false);
    setApplyDialogOpen(false);
    setApplyForm({ device_id: "" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil aplicado", description: "El script de instalación ha sido enviado al dispositivo" });
    }
  };

  const openEditProfile = (p: RoleProfile) => {
    setEditingProfile(p);
    setProfileForm({ name: p.name, display_name: p.display_name, description: p.description || "", permissions_level: p.permissions_level });
    setProfileDialogOpen(true);
  };

  const filteredProfiles = profiles.filter(p =>
    p.display_name.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentSoftware = selectedProfile ? (software[selectedProfile.id] || []) : [];
  const groupedSoftware: Record<string, ProfileSoftware[]> = {};
  currentSoftware.forEach(s => {
    if (!groupedSoftware[s.category]) groupedSoftware[s.category] = [];
    groupedSoftware[s.category].push(s);
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Perfiles de Configuración</h1>
          <p className="page-description">Gestión de perfiles por rol con software y permisos predefinidos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={profileDialogOpen} onOpenChange={(v) => { setProfileDialogOpen(v); if (!v) setEditingProfile(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingProfile(null); setProfileForm({ name: "", display_name: "", description: "", permissions_level: "standard" }); }}>
                <Plus className="h-4 w-4 mr-2" />Nuevo Perfil
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingProfile ? "Editar Perfil" : "Crear Perfil"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                {!editingProfile && (
                  <div>
                    <Label>Identificador *</Label>
                    <Input placeholder="Identificador interno del perfil" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                  </div>
                )}
                <div>
                  <Label>Nombre para mostrar *</Label>
                  <Input placeholder="Nombre visible del perfil" value={profileForm.display_name} onChange={e => setProfileForm({...profileForm, display_name: e.target.value})} />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Textarea placeholder="Descripción del perfil..." value={profileForm.description} onChange={e => setProfileForm({...profileForm, description: e.target.value})} />
                </div>
                <div>
                  <Label>Nivel de Permisos</Label>
                  <Select value={profileForm.permissions_level} onValueChange={v => setProfileForm({...profileForm, permissions_level: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Usuario Estándar</SelectItem>
                      <SelectItem value="local_admin">Administrador Local</SelectItem>
                      <SelectItem value="restricted">Restringido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSaveProfile}><Check className="h-4 w-4 mr-2" />{editingProfile ? "Guardar" : "Crear"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Profile cards */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar perfiles..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {filteredProfiles.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedProfile(p)}
            className={`stat-card text-left cursor-pointer transition-all ${
              selectedProfile?.id === p.id ? "ring-2 ring-primary border-primary" : "hover:border-primary/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 mb-2">
                {permissionIcons[p.permissions_level] || <Shield className="h-4 w-4" />}
                <h3 className="font-semibold text-sm text-foreground">{p.display_name}</h3>
              </div>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); openEditProfile(p); }} className="p-1 rounded hover:bg-muted transition-colors">
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button disabled={!canManageProfiles} onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }} className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{p.description || "Sin descripción"}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                {permissionLabels[p.permissions_level] || p.permissions_level}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {(software[p.id] || []).length} apps
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected profile detail */}
      {selectedProfile && (
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                {permissionIcons[selectedProfile.permissions_level]}
                {selectedProfile.display_name}
              </h2>
              <p className="text-sm text-muted-foreground">{selectedProfile.description}</p>
            </div>
            <div className="flex gap-2">
              <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!canManageProfiles}><Play className="h-4 w-4 mr-2" />Aplicar a Dispositivo</Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Aplicar Perfil: {selectedProfile.display_name}</DialogTitle></DialogHeader>
                  <div className="grid gap-4 pt-4">
                    <div>
                      <Label>Dispositivo *</Label>
                      <Select value={applyForm.device_id} onValueChange={v => setApplyForm({device_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar dispositivo" /></SelectTrigger>
                        <SelectContent>
                          {devices.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.hostname} ({d.device_id})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se instalarán {currentSoftware.length} aplicaciones y se configurarán los permisos de nivel "{permissionLabels[selectedProfile.permissions_level]}".
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleApplyProfile} disabled={applying}>
                        {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        Aplicar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={softwareDialogOpen} onOpenChange={setSoftwareDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Agregar Software</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Agregar Software</DialogTitle></DialogHeader>
                  <div className="grid gap-4 pt-4">
                    <div>
                      <Label>Nombre del Software *</Label>
                      <Input placeholder="Nombre del software" value={softwareForm.software_name} onChange={e => setSoftwareForm({...softwareForm, software_name: e.target.value})} />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select value={softwareForm.category} onValueChange={v => setSoftwareForm({...softwareForm, category: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Comando de Instalación</Label>
                      <Input placeholder="Comando de instalación automatizada" className="font-mono text-xs" value={softwareForm.install_command} onChange={e => setSoftwareForm({...softwareForm, install_command: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={softwareForm.is_required} onCheckedChange={v => setSoftwareForm({...softwareForm, is_required: v})} />
                      <Label className="text-sm">Obligatorio</Label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setSoftwareDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleAddSoftware}><Plus className="h-4 w-4 mr-2" />Agregar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Software grouped by category */}
          {Object.keys(groupedSoftware).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay software configurado para este perfil</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {Object.entries(groupedSoftware).map(([cat, items]) => (
                <div key={cat}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {categoryLabels[cat] || cat}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map(sw => (
                      <div key={sw.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 border">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{sw.software_name}</p>
                          {sw.install_command && (
                            <p className="text-[10px] font-mono text-muted-foreground truncate">{sw.install_command}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {sw.is_required ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">Req</span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Opt</span>
                          )}
                          <button onClick={() => handleDeleteSoftware(sw.id)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
          <p className="text-sm">Cargando perfiles...</p>
        </div>
      )}
    </div>
  );
};

export default RoleProfiles;
