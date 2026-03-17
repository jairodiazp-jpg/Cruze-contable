import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { statusColors, statusLabels, priorityColors } from "@/lib/display-maps";
import {
  Ticket, Laptop, Plus, RefreshCw, Loader2, Monitor, Cpu, HardDrive,
  Wifi, WifiOff, CheckCircle
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

const EmployeePortal = () => {
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "otro", priority: "media" });

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const email = user.email || "";
    const name = user.user_metadata?.full_name || "";

    let ticketsQuery = supabase.from("tickets")
      .select("*")
      .or(`requester_email.eq.${email},created_by.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    let devicesQuery = supabase.from("devices")
      .select("*")
      .or(`user_assigned.ilike.%${name}%,user_assigned.ilike.%${email}%`)
      .limit(10);

    if (companyId) {
      ticketsQuery = ticketsQuery.eq("company_id", companyId);
      devicesQuery = devicesQuery.eq("company_id", companyId);
    }

    const [ticketsRes, devicesRes] = await Promise.all([ticketsQuery, devicesQuery]);

    if (ticketsRes.data) setTickets(ticketsRes.data);
    if (devicesRes.data) setDevices(devicesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }
    fetchData();
  }, [user, companyId, companyLoading]);

  const handleCreate = async () => {
    if (!form.subject) {
      toast({ title: "El asunto es requerido", variant: "destructive" });
      return;
    }
    const code = `TK-${Date.now().toString(36).toUpperCase()}`;
    const { data: newTicket, error } = await supabase.from("tickets").insert({
      code,
      requester: user?.user_metadata?.full_name || "Empleado",
      requester_email: user?.email || "",
      subject: form.subject,
      description: form.description || null,
      category: form.category as any,
      priority: form.priority as any,
      created_by: user?.id,
      company_id: companyId || null,
    }).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket creado", description: `Código: ${code}. Se intentará solución automática.` });
      setDialogOpen(false);
      setForm({ subject: "", description: "", category: "otro", priority: "media" });
      fetchData();

      // Trigger auto-remediation
      if (newTicket?.id) {
        supabase.functions.invoke("auto-remediate", {
          body: { ticket_id: newTicket.id },
        }).catch(() => {});
      }
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const activeTickets = tickets.filter(t => !["cerrado", "resuelto"].includes(t.status));
  const resolvedTickets = tickets.filter(t => ["cerrado", "resuelto"].includes(t.status));

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Mi Portal de Soporte</h1>
          <p className="page-description">Crea tickets y revisa el estado de tus equipos</p>
        </div>
        <div className="grid grid-cols-1 sm:flex gap-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Nuevo Ticket</Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
              <DialogHeader><DialogTitle>Reportar Problema</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div>
                  <Label>Asunto *</Label>
                  <Input placeholder="¿Qué problema tienes?" value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Categoría</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hardware">Mi equipo no funciona</SelectItem>
                        <SelectItem value="software">Problema con programa</SelectItem>
                        <SelectItem value="red">Sin internet</SelectItem>
                        <SelectItem value="acceso">No puedo acceder</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Urgencia</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baja">Puede esperar</SelectItem>
                        <SelectItem value="media">Normal</SelectItem>
                        <SelectItem value="alta">Urgente</SelectItem>
                        <SelectItem value="critica">No puedo trabajar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Textarea placeholder="Describe el problema en detalle..." rows={4} value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 El sistema intentará solucionar tu problema automáticamente antes de asignarlo a un técnico.
                </p>
                <div className="flex justify-end"><Button className="w-full sm:w-auto" onClick={handleCreate}>Enviar Ticket</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* My Devices */}
      {devices.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Mis Equipos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map(dev => (
              <Card key={dev.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-5 w-5 text-primary" />
                      <span className="font-medium">{dev.hostname}</span>
                    </div>
                    <Badge variant={dev.health_status === "healthy" ? "default" : dev.health_status === "warning" ? "secondary" : "destructive"}>
                      {dev.health_status === "healthy" ? "En línea" : dev.health_status === "warning" ? "Advertencia" : "Problema"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-3 w-3" />
                      <span>{dev.operating_system || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dev.health_status !== "offline" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      <span>{dev.ip_address || "Sin IP"}</span>
                    </div>
                    {dev.last_seen && (
                      <div className="text-xs">
                        Último reporte: {new Date(dev.last_seen).toLocaleString("es")}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active Tickets */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Tickets Activos ({activeTickets.length})</h2>
        {activeTickets.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No tienes tickets activos</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {activeTickets.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                        <span className={`status-badge ${statusColors[t.status]}`}>{statusLabels[t.status] || t.status}</span>
                        <span className={`status-badge ${priorityColors[t.priority]}`}>{t.priority}</span>
                      </div>
                      <p className="font-medium">{t.subject}</p>
                      {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{new Date(t.created_at).toLocaleDateString("es")}</p>
                      {t.assigned_tech && <p className="mt-1">Técnico: {t.assigned_tech}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Tickets */}
      {resolvedTickets.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Tickets Resueltos ({resolvedTickets.length})</h2>
          <div className="space-y-2">
            {resolvedTickets.slice(0, 10).map(t => (
              <Card key={t.id} className="opacity-75">
                <CardContent className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                    <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                    <span className="text-sm truncate">{t.subject}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("es")}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePortal;
