import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, TablesUpdate } from "@/integrations/supabase/types";
import { statusColors, statusLabels } from "@/lib/display-maps";
import { Search, Plus, RefreshCw, Loader2, Check, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useAuth } from "@/contexts/AuthContext";

interface Delivery {
  id: string;
  code: string;
  employee_name: string;
  employee_email: string;
  department: string | null;
  position: string | null;
  device_id: string | null;
  equipment_id: string | null;
  equipment_desc: string | null;
  delivery_date: string;
  return_date: string | null;
  observations: string | null;
  status: string;
}

type DeliveryStatus = Enums<"delivery_status">;

interface DeviceOption {
  id: string;
  hostname: string;
  device_id: string;
  role_type: string | null;
}

const DEPARTMENTS = [
  "TI", "Finanzas", "Recursos Humanos", "Operaciones", "Ventas",
  "Marketing", "Legal", "Administración", "Soporte", "Gerencia",
];

const POSITIONS = [
  "Analista", "Developer", "Coordinador", "Gerente", "Director",
  "Asistente", "Supervisor", "Técnico", "Consultor", "Diseñador",
  "Contador", "Ingeniero", "Líder de Proyecto", "Soporte TI",
];

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
}

function MultiSelect({ options, selected, onChange, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-10 py-1.5">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.map(s => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s}
                  <button
                    className="ml-1 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); toggle(s); }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
        />
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              {opt}
            </label>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const Deliveries = () => {
  const { role } = useAuth();
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "No se puede gestionar entregas sin empresa asociada.",
  });
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [filterDepartments, setFilterDepartments] = useState<string[]>([]);
  const [filterPositions, setFilterPositions] = useState<string[]>([]);

  const [form, setForm] = useState({
    employee_name: "", employee_email: "",
    departments: [] as string[], positions: [] as string[],
    device_id: "",
    equipment_desc: "", observations: "",
  });

  const canManageDeliveries = role === "admin" || role === "technician";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const deliveriesQuery = withCompanyScope(supabase
      .from("deliveries")
      .select("*")
      .order("created_at", { ascending: false }));

    const devicesQuery = withCompanyScope(
      supabase.from("devices").select("id, hostname, device_id, role_type").order("hostname", { ascending: true })
    );

    const [{ data, error }, { data: deviceRows }] = await Promise.all([deliveriesQuery, devicesQuery]);

    if (data) setDeliveries(data as Delivery[]);
    if (deviceRows) setDevices(deviceRows as DeviceOption[]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setLoading(false);
  }, [toast, withCompanyScope]);

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();
  }, [companyId, companyLoading, fetchData]);

  const handleCreate = async () => {
    if (!canManageDeliveries) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden crear entregas.", variant: "destructive" });
      return;
    }

    const scopedCompanyId = await ensureCompanyId();
    if (!scopedCompanyId) {
      return;
    }

    if (!form.employee_name || !form.employee_email) {
      toast({ title: "Campos requeridos faltantes", variant: "destructive" });
      return;
    }

    if (!form.device_id) {
      toast({ title: "Dispositivo requerido", description: "Asigna un dispositivo para continuar.", variant: "destructive" });
      return;
    }

    const selectedDevice = devices.find((device) => device.id === form.device_id);
    if (!selectedDevice?.role_type) {
      toast({
        title: "Rol no asignado",
        description: "No se puede iniciar la entrega sin rol asignado al dispositivo.",
        variant: "destructive",
      });
      return;
    }

    const activeStatuses: DeliveryStatus[] = ["pendiente", "en_configuracion", "configurado", "entregado"];
    const { data: duplicate } = await withCompanyScope(
      supabase
        .from("deliveries")
        .select("id")
        .eq("device_id", form.device_id)
        .in("status", activeStatuses)
        .limit(1)
        .maybeSingle()
    );

    if (duplicate) {
      toast({
        title: "Asignacion duplicada",
        description: "Ese dispositivo ya tiene una entrega activa.",
        variant: "destructive",
      });
      return;
    }

    const code = `DL-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await supabase.from("deliveries").insert({
      code,
      employee_name: form.employee_name,
      employee_email: form.employee_email,
      department: form.departments.length > 0 ? form.departments.join(", ") : null,
      position: form.positions.length > 0 ? form.positions.join(", ") : null,
      device_id: form.device_id,
      equipment_desc: form.equipment_desc || `${selectedDevice.hostname} (${selectedDevice.device_id})`,
      observations: form.observations || null,
      status: "pendiente",
      company_id: scopedCompanyId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entrega registrada", description: `Código: ${code}` });
      setDialogOpen(false);
      setForm({ employee_name: "", employee_email: "", departments: [], positions: [], device_id: "", equipment_desc: "", observations: "" });
      fetchData();
    }
  };

  const updateDeliveryStatus = async (delivery: Delivery, nextStatus: DeliveryStatus) => {
    if (!canManageDeliveries) {
      toast({ title: "Sin permisos", description: "Solo admins y tecnicos pueden actualizar estados.", variant: "destructive" });
      return;
    }

    if (!delivery.device_id) {
      toast({ title: "Dispositivo faltante", description: "La entrega no tiene dispositivo asignado.", variant: "destructive" });
      return;
    }

    if (nextStatus === "en_configuracion") {
      const device = devices.find((item) => item.id === delivery.device_id);
      if (!device?.role_type) {
        toast({ title: "Rol faltante", description: "No se puede configurar sin rol asignado.", variant: "destructive" });
        return;
      }
    }

    if (nextStatus === "configurado") {
      const { data: configuredExecution } = await withCompanyScope(
        supabase
          .from("script_executions")
          .select("id")
          .eq("device_id", delivery.device_id)
          .eq("script_type", "install-profile")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      );

      if (!configuredExecution) {
        toast({
          title: "Configuracion incompleta",
          description: "No se encontro una ejecucion completada del perfil para este dispositivo.",
          variant: "destructive",
        });
        return;
      }
    }

    if (nextStatus === "entregado" && delivery.status !== "configurado") {
      toast({
        title: "Entrega bloqueada",
        description: "No se permite entregar sin estado configurado.",
        variant: "destructive",
      });
      return;
    }

    const payload: TablesUpdate<"deliveries"> = { status: nextStatus };
    if (nextStatus === "devuelto") {
      payload.return_date = new Date().toISOString().slice(0, 10);
    }

    const { error } = await supabase
      .from("deliveries")
      .update(payload)
      .eq("id", delivery.id)
      .eq("company_id", companyId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Estado actualizado", description: `Ahora: ${statusLabels[nextStatus] || nextStatus}` });
    fetchData();
  };

  const filtered = deliveries.filter(d => {
    const matchSearch = d.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.equipment_desc || "").toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDepartments.length === 0 || filterDepartments.some(fd => (d.department || "").toLowerCase().includes(fd.toLowerCase()));
    const matchPos = filterPositions.length === 0 || filterPositions.some(fp => (d.position || "").toLowerCase().includes(fp.toLowerCase()));
    return matchSearch && matchDept && matchPos;
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Entregas de Equipos</h1>
          <p className="page-description">Registro de asignación y devolución de equipos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nueva Entrega</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Entrega</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Nombre del Empleado *</Label><Input placeholder="Nombre completo" value={form.employee_name} onChange={e => setForm({...form, employee_name: e.target.value})} /></div>
                  <div><Label>Correo *</Label><Input type="email" placeholder="correo@empresa.com" value={form.employee_email} onChange={e => setForm({...form, employee_email: e.target.value})} /></div>
                </div>
                <div>
                  <Label>Dispositivo *</Label>
                  <Select value={form.device_id} onValueChange={v => setForm({ ...form, device_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar dispositivo" /></SelectTrigger>
                    <SelectContent>
                      {devices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.hostname} ({device.device_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Área / Departamento</Label><MultiSelect options={DEPARTMENTS} selected={form.departments} onChange={v => setForm({...form, departments: v})} placeholder="Seleccionar áreas..." /></div>
                  <div><Label>Cargo</Label><MultiSelect options={POSITIONS} selected={form.positions} onChange={v => setForm({...form, positions: v})} placeholder="Seleccionar cargos..." /></div>
                </div>
                <div><Label>Descripción del Equipo</Label><Input placeholder="HP EliteBook 840 G10" value={form.equipment_desc} onChange={e => setForm({...form, equipment_desc: e.target.value})} /></div>
                <div><Label>Observaciones</Label><Textarea placeholder="Notas sobre la entrega..." rows={3} value={form.observations} onChange={e => setForm({...form, observations: e.target.value})} /></div>
                <div className="flex justify-end">
                  <Button onClick={handleCreate} disabled={!canManageDeliveries}>Registrar Entrega</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar entregas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="w-52">
          <MultiSelect options={DEPARTMENTS} selected={filterDepartments} onChange={setFilterDepartments} placeholder="Departamento" />
        </div>
        <div className="w-52">
          <MultiSelect options={POSITIONS} selected={filterPositions} onChange={setFilterPositions} placeholder="Cargo" />
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Empleado</th>
              <th>Departamento</th>
              <th>Equipo</th>
              <th>Fecha Entrega</th>
              <th>Devolución</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td className="font-mono text-xs">{d.code}</td>
                <td>
                  <div>
                    <p className="font-medium">{d.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{d.employee_email}</p>
                  </div>
                </td>
                <td>{d.department || "—"}</td>
                <td>{d.equipment_desc || "—"}</td>
                <td className="text-xs">{new Date(d.delivery_date).toLocaleDateString("es")}</td>
                <td className="text-xs">{d.return_date ? new Date(d.return_date).toLocaleDateString("es") : "—"}</td>
                <td><span className={`status-badge ${statusColors[d.status]}`}>{statusLabels[d.status] || d.status}</span></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {d.status === "pendiente" && (
                      <Button size="sm" variant="outline" disabled={!canManageDeliveries} onClick={() => updateDeliveryStatus(d, "en_configuracion")}>Iniciar config</Button>
                    )}
                    {d.status === "en_configuracion" && (
                      <Button size="sm" variant="outline" disabled={!canManageDeliveries} onClick={() => updateDeliveryStatus(d, "configurado")}>Marcar configurado</Button>
                    )}
                    {d.status === "configurado" && (
                      <Button size="sm" disabled={!canManageDeliveries} onClick={() => updateDeliveryStatus(d, "entregado")}>Entregar</Button>
                    )}
                    {d.status === "entregado" && (
                      <Button size="sm" variant="secondary" disabled={!canManageDeliveries} onClick={() => updateDeliveryStatus(d, "devuelto")}>Devolver</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No se encontraron entregas</div>
        )}
      </div>
    </div>
  );
};

export default Deliveries;
