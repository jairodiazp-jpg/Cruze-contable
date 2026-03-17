import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { DevicePickerRow, fetchDeviceList } from "@/lib/deviceQueries";
import { copyTextToClipboard } from "@/lib/utils";
import {
  Key, Plus, Search, RefreshCw, Trash2, Monitor, CheckCircle, XCircle,
  Clock, AlertTriangle, Loader2, Copy
} from "lucide-react";

interface License {
  id: string;
  product: string;
  license_key: string;
  license_type: string;
  assigned_device_id: string | null;
  assigned_user: string | null;
  status: string;
  activation_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  devices?: { hostname: string; device_id: string } | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  available: { label: "Disponible", variant: "secondary" },
  assigned: { label: "Asignada", variant: "default" },
  activated: { label: "Activada", variant: "default" },
  expired: { label: "Expirada", variant: "destructive" },
  revoked: { label: "Revocada", variant: "destructive" },
};

const Licenses = () => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [devices, setDevices] = useState<DevicePickerRow[]>([]);;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, companyLoading, withCompanyScope } = useCompanyAccess();

  const [form, setForm] = useState({
    product: "Windows 11 Pro",
    license_key: "",
    license_type: "retail",
    assigned_device_id: "",
    assigned_user: "",
    expiration_date: "",
    notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    const [licRes, devList] = await Promise.all([
      withCompanyScope(supabase.from("licenses").select("*, devices(hostname, device_id)")).order("created_at", { ascending: false }),
      fetchDeviceList(companyId),
    ]);
    if (licRes.data) setLicenses(licRes.data as any);
    setDevices(devList);
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();
  }, [companyId, companyLoading]);

  const handleCreate = async () => {
    if (!form.license_key || !form.product) {
      toast({ title: "Producto y clave son requeridos", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("licenses").insert({
      product: form.product,
      license_key: form.license_key,
      license_type: form.license_type,
      assigned_device_id: form.assigned_device_id || null,
      assigned_user: form.assigned_user || null,
      status: form.assigned_device_id ? "assigned" : "available",
      expiration_date: form.expiration_date || null,
      notes: form.notes || null,
      company_id: companyId || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Licencia registrada" });
      setDialogOpen(false);
      setForm({ product: "Windows 11 Pro", license_key: "", license_type: "retail", assigned_device_id: "", assigned_user: "", expiration_date: "", notes: "" });
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    let query = supabase.from("licenses").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Licencia eliminada" }); fetchData(); }
  };

  const copyKey = async (key: string) => {
    const copied = await copyTextToClipboard(key);
    if (!copied) {
      toast({ title: "Error", description: "No se pudo copiar la clave.", variant: "destructive" });
      return;
    }

    toast({ title: "Clave copiada al portapapeles" });
  };

  const filtered = licenses.filter(l => {
    const matchSearch = l.product.toLowerCase().includes(search.toLowerCase()) ||
      l.license_key.toLowerCase().includes(search.toLowerCase()) ||
      (l.assigned_user || "").toLowerCase().includes(search.toLowerCase());
    const matchProduct = productFilter === "all" || l.product === productFilter;
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchProduct && matchStatus;
  });

  const products = [...new Set(licenses.map(l => l.product))];

  const stats = {
    total: licenses.length,
    available: licenses.filter(l => l.status === "available").length,
    assigned: licenses.filter(l => l.status === "assigned" || l.status === "activated").length,
    expired: licenses.filter(l => l.status === "expired").length,
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Gestión de Licencias</h1>
          <p className="page-description">Administra licencias de Windows y Office</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nueva Licencia</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Licencia</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div>
                  <Label>Producto *</Label>
                  <Select value={form.product} onValueChange={v => setForm({ ...form, product: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Windows 11 Pro">Windows 11 Pro</SelectItem>
                      <SelectItem value="Windows 11 Home">Windows 11 Home</SelectItem>
                      <SelectItem value="Windows 10 Pro">Windows 10 Pro</SelectItem>
                      <SelectItem value="Windows Server 2022">Windows Server 2022</SelectItem>
                      <SelectItem value="Microsoft 365 Business">Microsoft 365 Business</SelectItem>
                      <SelectItem value="Microsoft 365 Enterprise">Microsoft 365 Enterprise</SelectItem>
                      <SelectItem value="Office 2021 Pro Plus">Office 2021 Pro Plus</SelectItem>
                      <SelectItem value="Office 2019 Pro Plus">Office 2019 Pro Plus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Clave de Licencia *</Label>
                  <Input placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" value={form.license_key}
                    onChange={e => setForm({ ...form, license_key: e.target.value.toUpperCase() })} className="font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={form.license_type} onValueChange={v => setForm({ ...form, license_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="oem">OEM</SelectItem>
                        <SelectItem value="volume">Volumen</SelectItem>
                        <SelectItem value="subscription">Suscripción</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fecha Expiración</Label>
                    <Input type="date" value={form.expiration_date}
                      onChange={e => setForm({ ...form, expiration_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Asignar a Dispositivo</Label>
                    <Select value={form.assigned_device_id} onValueChange={v => setForm({ ...form, assigned_device_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Sin asignar</SelectItem>
                        {devices.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.hostname}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Usuario Asignado</Label>
                    <Input placeholder="Nombre del usuario" value={form.assigned_user}
                      onChange={e => setForm({ ...form, assigned_user: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Notas</Label>
                  <Input placeholder="Notas adicionales..." value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex justify-end"><Button onClick={handleCreate}>Registrar Licencia</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Key className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Licencias</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-8 w-8 text-[hsl(var(--success))]" />
            <div>
              <p className="text-2xl font-bold">{stats.available}</p>
              <p className="text-xs text-muted-foreground">Disponibles</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Monitor className="h-8 w-8 text-[hsl(var(--info))]" />
            <div>
              <p className="text-2xl font-bold">{stats.assigned}</p>
              <p className="text-xs text-muted-foreground">Asignadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-8 w-8 text-[hsl(var(--warning))]" />
            <div>
              <p className="text-2xl font-bold">{stats.expired}</p>
              <p className="text-xs text-muted-foreground">Expiradas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por producto, clave o usuario..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Producto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {products.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponible</SelectItem>
            <SelectItem value="assigned">Asignada</SelectItem>
            <SelectItem value="activated">Activada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
            <SelectItem value="revoked">Revocada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Clave</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Expiración</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(lic => {
              const sc = statusConfig[lic.status] || { label: lic.status, variant: "outline" as const };
              return (
                <TableRow key={lic.id}>
                  <TableCell className="font-medium">{lic.product}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">
                        {lic.license_key.substring(0, 5)}...{lic.license_key.slice(-5)}
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyKey(lic.license_key)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{lic.license_type}</TableCell>
                  <TableCell>{lic.devices?.hostname || "—"}</TableCell>
                  <TableCell>{lic.assigned_user || "—"}</TableCell>
                  <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lic.expiration_date ? new Date(lic.expiration_date).toLocaleDateString("es") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(lic.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {loading && <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No se encontraron licencias</div>
        )}
      </div>
    </div>
  );
};

export default Licenses;
