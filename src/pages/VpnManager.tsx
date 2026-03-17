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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Search, Wifi, WifiOff, Globe, Server, RefreshCw } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

interface VpnConfig {
  id: string;
  device_id: string | null;
  user_email: string;
  display_name: string;
  vpn_type: string;
  server_address: string;
  server_port: number | null;
  protocol: string | null;
  auth_type: string | null;
  config_data: string | null;
  connection_status: string | null;
  last_connected_at: string | null;
  assigned_ip: string | null;
  status: string;
  error_log: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  applied: "bg-green-500/10 text-green-400 border-green-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
};

const connectionColors: Record<string, string> = {
  connected: "bg-green-500/10 text-green-400 border-green-500/30",
  disconnected: "bg-muted text-muted-foreground border-border",
  connecting: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const vpnTypes = [
  { value: "openvpn", label: "OpenVPN" },
  { value: "wireguard", label: "WireGuard" },
  { value: "ipsec", label: "IPSec/IKEv2" },
  { value: "l2tp", label: "L2TP" },
  { value: "sstp", label: "SSTP" },
];

const defaultPorts: Record<string, number> = {
  openvpn: 1194,
  wireguard: 51820,
  ipsec: 500,
  l2tp: 1701,
  sstp: 443,
};

export default function VpnManager() {
  const { companyId, loading: companyLoading } = useCompany();
  const [configs, setConfigs] = useState<VpnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    user_email: "",
    display_name: "",
    vpn_type: "openvpn",
    server_address: "",
    server_port: 1194,
    protocol: "udp",
    auth_type: "certificate",
    config_data: "",
  });

  const fetchConfigs = async () => {
    let query = supabase.from("vpn_configs").select("*").order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setConfigs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    fetchConfigs();

    const channel = supabase
      .channel("vpn-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "vpn_configs" }, () => {
        fetchConfigs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, companyLoading]);

  const handleCreate = async () => {
    if (!form.user_email || !form.display_name || !form.server_address) {
      toast({ title: "Error", description: "Completa los campos requeridos", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("vpn_configs").insert({
      user_email: form.user_email,
      display_name: form.display_name,
      vpn_type: form.vpn_type,
      server_address: form.server_address,
      server_port: form.server_port,
      protocol: form.protocol,
      auth_type: form.auth_type,
      config_data: form.config_data || null,
      company_id: companyId || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración VPN creada" });
      setDialogOpen(false);
      setForm({ user_email: "", display_name: "", vpn_type: "openvpn", server_address: "", server_port: 1194, protocol: "udp", auth_type: "certificate", config_data: "" });
      fetchConfigs();
    }
  };

  const handleDeploy = async (id: string) => {
    let query = supabase.from("vpn_configs").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "VPN desplegada al dispositivo" });
      fetchConfigs();
    }
  };

  const handleDelete = async (id: string) => {
    let query = supabase.from("vpn_configs").delete().eq("id", id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { error } = await query;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración eliminada" });
      fetchConfigs();
    }
  };

  const filtered = configs.filter(
    (c) =>
      c.display_name.toLowerCase().includes(search.toLowerCase()) ||
      c.user_email.toLowerCase().includes(search.toLowerCase()) ||
      c.server_address.toLowerCase().includes(search.toLowerCase())
  );

  const connectedCount = configs.filter((c) => c.connection_status === "connected").length;
  const appliedCount = configs.filter((c) => c.status === "applied").length;
  const failedCount = configs.filter((c) => c.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">VPN Manager</h1>
          <p className="text-muted-foreground text-sm">Gestión centralizada de conexiones VPN corporativas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfigs}>
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Configuración</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva Configuración VPN</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre</Label>
                    <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Juan Pérez" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={form.user_email} onChange={(e) => setForm({ ...form, user_email: e.target.value })} placeholder="user@empresa.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo VPN</Label>
                    <Select value={form.vpn_type} onValueChange={(v) => setForm({ ...form, vpn_type: v, server_port: defaultPorts[v] || 1194 })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {vpnTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Protocolo</Label>
                    <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="udp">UDP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label>Servidor</Label>
                    <Input value={form.server_address} onChange={(e) => setForm({ ...form, server_address: e.target.value })} placeholder="vpn.empresa.com" />
                  </div>
                  <div>
                    <Label>Puerto</Label>
                    <Input type="number" value={form.server_port} onChange={(e) => setForm({ ...form, server_port: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <Label>Autenticación</Label>
                  <Select value={form.auth_type} onValueChange={(v) => setForm({ ...form, auth_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="certificate">Certificado</SelectItem>
                      <SelectItem value="username">Usuario/Contraseña</SelectItem>
                      <SelectItem value="psk">Pre-Shared Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Configuración adicional (opcional)</Label>
                  <Textarea value={form.config_data} onChange={(e) => setForm({ ...form, config_data: e.target.value })} placeholder="Contenido del archivo .ovpn, claves WireGuard, etc." rows={4} />
                </div>
                <Button onClick={handleCreate} className="w-full">Crear Configuración</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Configs</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{configs.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Wifi className="h-3 w-3 text-green-400" /> Conectados</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-400">{connectedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3 text-blue-400" /> Desplegados</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-400">{appliedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3 text-red-400" /> Fallidos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-400">{failedCount}</p></CardContent>
        </Card>
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Configuraciones VPN</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No hay configuraciones VPN</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Conexión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>IP Asignada</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{c.display_name}</p>
                        <p className="text-xs text-muted-foreground">{c.user_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {vpnTypes.find((t) => t.value === c.vpn_type)?.label || c.vpn_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{c.server_address}:{c.server_port}</p>
                      <p className="text-xs text-muted-foreground">{c.protocol?.toUpperCase()}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={connectionColors[c.connection_status || "disconnected"] || connectionColors.disconnected}>
                        {c.connection_status === "connected" ? "Conectado" : c.connection_status === "connecting" ? "Conectando" : "Desconectado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[c.status] || statusColors.pending}>
                        {c.status === "applied" ? "Aplicado" : c.status === "failed" ? "Fallido" : "Pendiente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.assigned_ip || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.status === "pending" && (
                          <Button variant="outline" size="sm" onClick={() => handleDeploy(c.id)}>Desplegar</Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(c.id)}>Eliminar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
