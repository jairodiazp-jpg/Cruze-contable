import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { statusColors, statusLabels } from "@/lib/display-maps";
import { Search, Plus, Filter, Monitor, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";

interface Equipment {
  id: string;
  code: string;
  serial: string;
  brand: string;
  model: string;
  type: string;
  ram: string | null;
  storage: string | null;
  os: string | null;
  status: string;
  location: string | null;
  assigned_to: string | null;
  registered_at: string;
}

const Inventory = () => {
  const { companyId, loading: companyLoading } = useCompany();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    code: "", serial: "", brand: "", model: "", type: "laptop",
    ram: "", storage: "", os: "", location: "",
  });

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from("equipment")
      .select("*")
      .order("registered_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (data) setEquipment(data as Equipment[]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();
  }, [companyId, companyLoading]);

  const handleCreate = async () => {
    if (!form.serial || !form.brand || !form.model || !form.code) {
      toast({ title: "Campos requeridos faltantes", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("equipment").insert({
      code: form.code,
      serial: form.serial,
      brand: form.brand,
      model: form.model,
      type: form.type as any,
      ram: form.ram || null,
      storage: form.storage || null,
      os: form.os || null,
      location: form.location || null,
      company_id: companyId || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Equipo registrado" });
      setDialogOpen(false);
      setForm({ code: "", serial: "", brand: "", model: "", type: "laptop", ram: "", storage: "", os: "", location: "" });
      fetchData();
    }
  };

  const filtered = equipment.filter(eq => {
    const matchSearch = eq.serial.toLowerCase().includes(search.toLowerCase()) ||
      eq.brand.toLowerCase().includes(search.toLowerCase()) ||
      eq.model.toLowerCase().includes(search.toLowerCase()) ||
      eq.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || eq.status === statusFilter;
    const matchType = typeFilter === "all" || eq.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Inventario de Equipos</h1>
          <p className="page-description">Gestión de activos tecnológicos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo Equipo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Equipo</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div><Label>Código *</Label><Input placeholder="Código interno del activo" value={form.code} onChange={e => setForm({...form, code: e.target.value})} /></div>
                <div><Label>Serial *</Label><Input placeholder="Número de serie del equipo" value={form.serial} onChange={e => setForm({...form, serial: e.target.value})} /></div>
                <div><Label>Marca *</Label><Input placeholder="Dell, HP, Lenovo..." value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} /></div>
                <div><Label>Modelo *</Label><Input placeholder="Modelo del equipo" value={form.model} onChange={e => setForm({...form, model: e.target.value})} /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laptop">Laptop</SelectItem>
                      <SelectItem value="desktop">Desktop</SelectItem>
                      <SelectItem value="monitor">Monitor</SelectItem>
                      <SelectItem value="impresora">Impresora</SelectItem>
                      <SelectItem value="telefono">Teléfono</SelectItem>
                      <SelectItem value="tablet">Tablet</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>RAM</Label><Input placeholder="16GB" value={form.ram} onChange={e => setForm({...form, ram: e.target.value})} /></div>
                <div><Label>Almacenamiento</Label><Input placeholder="512GB SSD" value={form.storage} onChange={e => setForm({...form, storage: e.target.value})} /></div>
                <div><Label>Sistema Operativo</Label><Input placeholder="Windows 11 Pro" value={form.os} onChange={e => setForm({...form, os: e.target.value})} /></div>
                <div className="col-span-2"><Label>Ubicación</Label><Input placeholder="Almacén Central" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
                <div className="col-span-2 flex justify-end"><Button onClick={handleCreate}>Guardar Equipo</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por serial, marca o modelo..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="asignado">Asignado</SelectItem>
            <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
            <SelectItem value="retirado">Retirado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><Monitor className="h-4 w-4 mr-2" /><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="laptop">Laptop</SelectItem>
            <SelectItem value="desktop">Desktop</SelectItem>
            <SelectItem value="monitor">Monitor</SelectItem>
            <SelectItem value="impresora">Impresora</SelectItem>
            <SelectItem value="tablet">Tablet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Serial</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Tipo</th>
              <th>RAM</th>
              <th>Estado</th>
              <th>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(eq => (
              <tr key={eq.id}>
                <td className="font-mono text-xs">{eq.code}</td>
                <td className="font-mono text-xs">{eq.serial}</td>
                <td>{eq.brand}</td>
                <td>{eq.model}</td>
                <td className="capitalize">{eq.type}</td>
                <td>{eq.ram || "—"}</td>
                <td><span className={`status-badge ${statusColors[eq.status]}`}>{statusLabels[eq.status] || eq.status}</span></td>
                <td>{eq.location || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No se encontraron equipos</div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
