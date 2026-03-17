import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Play, Laptop, AlertTriangle, WifiOff } from "lucide-react";

export function RealtimeTaskNotifier() {
  useEffect(() => {
    // Script executions channel
    const scriptChannel = supabase
      .channel("script-executions-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "script_executions",
        },
        (payload) => {
          const record = payload.new as any;
          const oldRecord = payload.old as any;

          if (oldRecord.status === record.status) return;

          if (record.status === "completed") {
            toast.success(`Script "${record.script_name}" completado`, {
              description: record.output?.substring(0, 100) || "Tarea ejecutada exitosamente por el agente.",
              icon: <CheckCircle className="h-5 w-5 text-green-500" />,
              duration: 6000,
            });
          } else if (record.status === "failed") {
            toast.error(`Script "${record.script_name}" falló`, {
              description: record.error_log?.substring(0, 100) || "Error durante la ejecución.",
              icon: <XCircle className="h-5 w-5 text-red-500" />,
              duration: 8000,
            });
          } else if (record.status === "running") {
            toast.info(`Script "${record.script_name}" en ejecución`, {
              description: "El agente está procesando la tarea...",
              icon: <Play className="h-5 w-5 text-blue-500" />,
              duration: 4000,
            });
          }
        }
      )
      .subscribe();

    // Device enrollment + status changes channel
    const deviceChannel = supabase
      .channel("devices-realtime-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          const device = payload.new as any;
          toast.success(`Nuevo dispositivo registrado`, {
            description: `${device.hostname} (${device.operating_system || "SO desconocido"}) — IP: ${device.ip_address || "N/A"}`,
            icon: <Laptop className="h-5 w-5 text-emerald-500" />,
            duration: 8000,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          const device = payload.new as any;
          const oldDevice = payload.old as any;

          if (oldDevice.health_status === device.health_status) return;

          if (device.health_status === "critical") {
            toast.error(`⚠️ ${device.hostname} en estado CRÍTICO`, {
              description: `IP: ${device.ip_address || "N/A"} — Usuario: ${device.user_assigned || "Sin asignar"}`,
              icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
              duration: 10000,
            });
          } else if (device.health_status === "offline") {
            toast.warning(`${device.hostname} se desconectó`, {
              description: `Último reporte: ${device.last_seen ? new Date(device.last_seen).toLocaleString("es-CO", { timeStyle: "short", dateStyle: "short" }) : "Desconocido"}`,
              icon: <WifiOff className="h-5 w-5 text-muted-foreground" />,
              duration: 8000,
            });
          } else if (device.health_status === "healthy" && (oldDevice.health_status === "critical" || oldDevice.health_status === "offline")) {
            toast.success(`${device.hostname} recuperado`, {
              description: "El dispositivo volvió a estado saludable.",
              icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(scriptChannel);
      supabase.removeChannel(deviceChannel);
    };
  }, []);

  return null;
}
