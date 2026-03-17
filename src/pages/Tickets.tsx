import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { statusColors, statusLabels, priorityColors } from "@/lib/display-maps";
import { Search, Plus, Filter, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";

interface Ticket {
  id: string;
  code: string;
  requester: string;
  requester_email: string;
  category: string;
  priority: string;
  subject: string;
  description: string | null;
  assigned_tech: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

const Tickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();

  const [form, setForm] = useState({
    requester: "", requester_email: "", subject: "", description: "",
    category: "otro", priority: "media", assigned_tech: "",
  });

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from("tickets")
      .select("id,code,requester,requester_email,category,priority,subject,description,assigned_tech,status,created_at,closed_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;
    if (data) setTickets(data as Ticket[]);
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
    if (!form.requester || !form.requester_email || !form.subject) {
      toast({ title: "Campos requeridos faltantes", variant: "destructive" });
      return;
    }
    const code = `TK-${Date.now().toString(36).toUpperCase()}`;
    const { data: newTicket, error } = await supabase.from("tickets").insert({
      code,
      requester: form.requester,
      requester_email: form.requester_email,
      subject: form.subject,
      description: form.description || null,
      category: form.category as any,
      priority: form.priority as any,
      assigned_tech: form.assigned_tech || null,
      created_by: user?.id,
      company_id: companyId || null,
    }).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket creado", description: `Código: ${code}` });
      setDialogOpen(false);
      setForm({ requester: "", requester_email: "", subject: "", description: "", category: "otro", priority: "media", assigned_tech: "" });
      fetchData();

      // Trigger auto-remediation in background
      if (newTicket?.id) {
        supabase.functions.invoke("auto-remediate", {
          body: { ticket_id: newTicket.id },
        }).then(({ data }) => {
          if (data?.status === "dispatched") {
            toast({
              title: "Auto-remediación iniciada",
              description: `Script "${data.script}" enviado a ${data.device}`,
            });
          }
        }).catch(() => { /* silent - auto-remediation is best-effort */ });
      }
    }
  };

  const filtered = tickets.filter(t => {
    const matchSearch = t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.requester.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Tickets de Soporte</h1>
          <p className="page-description">Gestión de solicitudes de soporte técnico</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo Ticket</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Crear Ticket</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Solicitante *</Label><Input placeholder="Nombre completo" value={form.requester} onChange={e => setForm({...form, requester: e.target.value})} /></div>
                  <div><Label>Correo *</Label><Input type="email" placeholder="correo@empresa.com" value={form.requester_email} onChange={e => setForm({...form, requester_email: e.target.value})} /></div>
                </div>
                <div><Label>Asunto *</Label><Input placeholder="Breve descripción del problema" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoría</Label>
                    <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hardware">Hardware</SelectItem>
                        <SelectItem value="software">Software</SelectItem>
                        <SelectItem value="red">Red</SelectItem>
                        <SelectItem value="acceso">Acceso</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridad</Label>
                    <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baja">Baja</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Técnico Asignado</Label><Input placeholder="Nombre del técnico" value={form.assigned_tech} onChange={e => setForm({...form, assigned_tech: e.target.value})} /></div>
                <div><Label>Descripción</Label><Textarea placeholder="Describe el problema en detalle..." rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
                <div className="flex justify-end"><Button onClick={handleCreate}>Crear Ticket</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tickets..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="abierto">Abierto</SelectItem>
            <SelectItem value="en_proceso">En Proceso</SelectItem>
            <SelectItem value="en_espera">En Espera</SelectItem>
            <SelectItem value="resuelto">Resuelto</SelectItem>
            <SelectItem value="cerrado">Cerrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Asunto</th>
              <th>Solicitante</th>
              <th>Categoría</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Técnico</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ticket => (
              <tr key={ticket.id}>
                <td className="font-mono text-xs">{ticket.code}</td>
                <td className="font-medium max-w-[200px] truncate">{ticket.subject}</td>
                <td>{ticket.requester}</td>
                <td className="capitalize">{ticket.category}</td>
                <td><span className={`status-badge ${priorityColors[ticket.priority]}`}>{ticket.priority}</span></td>
                <td><span className={`status-badge ${statusColors[ticket.status]}`}>{statusLabels[ticket.status] || ticket.status}</span></td>
                <td>{ticket.assigned_tech || "—"}</td>
                <td className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No se encontraron tickets</div>
        )}
      </div>
    </div>
  );
};

export default Tickets;
