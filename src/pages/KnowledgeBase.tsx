import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";

interface KBArticle {
  id: string;
  title: string;
  description: string | null;
  solution: string | null;
  category: string | null;
  author: string | null;
  created_at: string;
}

const KnowledgeBase = () => {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();

  const [form, setForm] = useState({
    title: "", category: "", description: "", solution: "",
  });

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from("kb_articles")
      .select("*")
      .order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (data) setArticles(data as KBArticle[]);
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
    if (!form.title) {
      toast({ title: "Título requerido", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("kb_articles").insert({
      title: form.title,
      category: form.category || null,
      description: form.description || null,
      solution: form.solution || null,
      author: user?.user_metadata?.full_name || user?.email || "Anónimo",
      company_id: companyId || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Artículo publicado" });
      setDialogOpen(false);
      setForm({ title: "", category: "", description: "", solution: "" });
      fetchData();
    }
  };

  const filtered = articles.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Base de Conocimiento</h1>
          <p className="page-description">Soluciones documentadas para problemas frecuentes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo Artículo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nuevo Artículo</DialogTitle></DialogHeader>
              <div className="grid gap-4 pt-4">
                <div><Label>Título *</Label><Input placeholder="Título del problema" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
                <div><Label>Categoría</Label><Input placeholder="Hardware, Software, Red..." value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
                <div><Label>Descripción</Label><Textarea placeholder="Describe el problema..." rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
                <div><Label>Pasos de Solución</Label><Textarea placeholder="1. Paso uno&#10;2. Paso dos&#10;3. Paso tres" rows={5} value={form.solution} onChange={e => setForm({...form, solution: e.target.value})} /></div>
                <div className="flex justify-end"><Button onClick={handleCreate}>Publicar Artículo</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar soluciones..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading && <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>}

      {!loading && selectedArticle ? (
        <div className="bg-card rounded-lg border p-6">
          <button onClick={() => setSelectedArticle(null)} className="text-sm text-primary hover:underline mb-4 inline-flex items-center gap-1">
            ← Volver a la lista
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="status-badge status-assigned">{selectedArticle.category || "General"}</span>
            <span className="text-xs text-muted-foreground">por {selectedArticle.author || "Anónimo"} · {new Date(selectedArticle.created_at).toLocaleDateString("es")}</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">{selectedArticle.title}</h2>
          <p className="text-muted-foreground mb-6">{selectedArticle.description || "Sin descripción"}</p>
          {selectedArticle.solution && (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">Pasos de Solución</h3>
              <div className="bg-muted/50 rounded-lg p-4">
                {selectedArticle.solution.split('\n').map((step, i) => (
                  <p key={i} className="text-sm py-1">{step}</p>
                ))}
              </div>
            </>
          )}
        </div>
      ) : !loading && (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(article => (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="bg-card rounded-lg border p-5 text-left hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className="status-badge status-assigned text-[10px] mb-2">{article.category || "General"}</span>
                  <h3 className="text-sm font-semibold text-foreground mt-2 group-hover:text-primary transition-colors">{article.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.description || "Sin descripción"}</p>
                  <p className="text-[10px] text-muted-foreground mt-3">{article.author || "Anónimo"} · {new Date(article.created_at).toLocaleDateString("es")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1 shrink-0" />
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">No se encontraron artículos</div>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
