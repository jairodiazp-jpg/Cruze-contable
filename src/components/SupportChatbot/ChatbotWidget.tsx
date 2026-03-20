import React, { useState } from "react";
import { cn } from "../../lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { FAQ_OPTIONS } from "./chatbotMenuOptions";
import { FAQ_LIST } from "./faqList";
import { TicketForm } from "./TicketForm";
import { DeviceLookupForm } from "./DeviceLookupForm";

/**
 * ChatbotWidget
 * Widget flotante minimalista para soporte técnico.
 * Moderno, accesible y no intrusivo.
 */


export const ChatbotWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const [step, setStep] = useState<'menu' | 'ticket' | 'sent' | 'device' | 'deviceResult' | 'faq'>('menu');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [deviceResult, setDeviceResult] = useState<string | null>(null);

  const handleMenuClick = (key: string) => {
    if (key === 'ticket') setStep('ticket');
    else if (key === 'device') setStep('device');
    else if (key === 'faq') setStep('faq');
  };

  const handleTicketSubmit = async (data: { name: string; email: string; message: string }) => {
    setSubmitting(true);
    try {
      const resp = await fetch("/functions/v1/support-ticket-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      let result: any = {};
      const contentType = resp.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await resp.json();
      }
      if (!resp.ok) throw new Error(result.error || "Error desconocido");
      setSuccessMsg(`¡Ticket enviado! Tu número de caso es: ${result.caseNumber}. Revisa tu correo para más detalles.`);
      setStep('sent');
    } catch (err: any) {
      setSuccessMsg("Error al enviar el ticket: " + (err.message || err));
      setStep('sent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeviceLookup = async (data: { email: string; deviceId: string }) => {
    setSubmitting(true);
    // TODO: consultar dispositivo en backend/supabase
    await new Promise((res) => setTimeout(res, 1200)); // Simulación
    setSubmitting(false);
    setDeviceResult(`Estado del dispositivo "${data.deviceId}": Operativo (demo)`);
    setStep('deviceResult');
  };

  const reset = () => {
    setStep('menu');
    setSuccessMsg("");
    setDeviceResult(null);
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        aria-label="Abrir chat de soporte"
        className="fixed bottom-6 right-6 z-50 rounded-full bg-white shadow-lg border border-neutral-200 hover:shadow-xl transition-all w-14 h-14 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
        onClick={() => { setOpen((v) => !v); reset(); }}
      >
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-neutral-700">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.8L3 21l1.8-4A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* Ventana de chat */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
            <span className="font-semibold text-neutral-800 text-base">Soporte Técnico</span>
            <button
              aria-label="Cerrar chat"
              className="text-neutral-400 hover:text-neutral-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center text-neutral-500 text-sm">
            {loading ? (
              <span>Cargando usuario...</span>
            ) : step === 'menu' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                {user ? (
                  <>
                    <span className="text-neutral-700 font-medium">{user.user_metadata?.full_name || user.email}</span>
                    <span className="text-xs text-neutral-400">{user.email}</span>
                  </>
                ) : null}
                <span className="mt-4 mb-2">¿En qué podemos ayudarte?</span>
                <div className="flex flex-col gap-2 w-full mt-2">
                  {FAQ_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      className="w-full px-4 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-left transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      onClick={() => handleMenuClick(opt.key)}
                    >
                      <span className="font-medium">{opt.label}</span>
                      {opt.description && (
                        <span className="block text-xs text-neutral-400">{opt.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : step === 'ticket' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-neutral-700 font-medium mb-2">Crear ticket de soporte</span>
                <TicketForm
                  name={user?.user_metadata?.full_name || ""}
                  email={user?.email || ""}
                  onSubmit={handleTicketSubmit}
                  submitting={submitting}
                />
                <button className="mt-2 text-xs text-neutral-400 hover:text-neutral-700 underline" onClick={reset} type="button">Volver al menú</button>
              </div>
            ) : step === 'sent' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-green-600 font-medium">{successMsg}</span>
                <button className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors" onClick={reset} type="button">Nuevo ticket</button>
              </div>
            ) : step === 'device' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-neutral-700 font-medium mb-2">Consultar estado de dispositivo</span>
                <DeviceLookupForm
                  email={user?.email || ""}
                  onSubmit={handleDeviceLookup}
                  submitting={submitting}
                />
                <button className="mt-2 text-xs text-neutral-400 hover:text-neutral-700 underline" onClick={reset} type="button">Volver al menú</button>
              </div>
            ) : step === 'deviceResult' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-neutral-700 font-medium mb-2">Resultado de la consulta</span>
                <span className="text-neutral-600 text-sm text-center">{deviceResult}</span>
                <button className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors" onClick={reset} type="button">Nueva consulta</button>
              </div>
            ) : step === 'faq' ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-neutral-700 font-medium mb-2">Preguntas frecuentes</span>
                <div className="flex flex-col gap-2 w-full max-h-64 overflow-y-auto">
                  {FAQ_LIST.map((faq, i) => (
                    <details key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2">
                      <summary className="cursor-pointer font-medium text-neutral-700 text-sm select-none">{faq.question}</summary>
                      <div className="mt-1 text-xs text-neutral-500">{faq.answer}</div>
                    </details>
                  ))}
                </div>
                <button className="mt-2 text-xs text-neutral-400 hover:text-neutral-700 underline" onClick={reset} type="button">Volver al menú</button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
