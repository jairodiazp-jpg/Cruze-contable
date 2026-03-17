import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type Status = "idle" | "processing" | "success" | "error";

const STORAGE_KEY = "pendingInviteToken";

export default function AcceptInvitation() {
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenFromUrl = searchParams.get("token");
  const token = tokenFromUrl ?? sessionStorage.getItem(STORAGE_KEY);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (token) sessionStorage.setItem(STORAGE_KEY, token);
      navigate("/login", { replace: true });
      return;
    }

    if (!token) {
      setErrorMsg("Token de invitación no encontrado en la URL.");
      setStatus("error");
      return;
    }

    setStatus("processing");

    supabase.functions
      .invoke("company-users", { body: { action: "accept-invitation", token } })
      .then(({ data, error }) => {
        sessionStorage.removeItem(STORAGE_KEY);
        const fnError = (data as any)?.error;
        if (error || fnError) {
          setErrorMsg(fnError?.message ?? error?.message ?? "Error al aceptar la invitación.");
          setStatus("error");
        } else {
          refreshProfile();
          setStatus("success");
          setTimeout(() => navigate("/", { replace: true }), 2500);
        }
      });
  }, [authLoading, user]);

  if (authLoading || status === "idle" || status === "processing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Procesando invitación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            {status === "success" ? (
              <CheckCircle2 className="h-14 w-14 text-green-400" />
            ) : (
              <XCircle className="h-14 w-14 text-red-400" />
            )}
          </div>
          <CardTitle className="text-xl">
            {status === "success" ? "¡Invitación aceptada!" : "Error en la invitación"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            {status === "success"
              ? "Te has unido a la empresa correctamente. Redirigiendo al panel..."
              : errorMsg}
          </p>
          <Button className="w-full" onClick={() => navigate("/", { replace: true })}>
            {status === "success" ? "Ir al panel" : "Volver al inicio"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
