import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Reemplaza por tu clave de API de SendGrid, Resend, etc.
const EMAIL_API_KEY = Deno.env.get("EMAIL_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "soporte@tudominio.com";

function generateCaseNumber() {
  // Puedes usar un UUID o lógica personalizada
  return "CASE-" + crypto.randomUUID().slice(0, 8).toUpperCase();
}

async function sendEmail(to: string, subject: string, html: string) {
  // Ejemplo con Resend API (puedes adaptar a SendGrid, etc.)
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });
  if (!resp.ok) throw new Error("Error enviando correo: " + (await resp.text()));
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
    }
    const { name, email, message } = body;
    if (!email || !message) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios" }), { status: 400 });
    }

    if (!EMAIL_API_KEY || !EMAIL_FROM) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno EMAIL_API_KEY o EMAIL_FROM" }), { status: 500 });
    }

    const caseNumber = generateCaseNumber();

    // Guardar ticket en Supabase
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { error } = await supabase.from("support_tickets").insert({
      name,
      email,
      message,
      case_number: caseNumber,
      status: "open",
    });
    if (error) {
      return new Response(JSON.stringify({ error: "Error al insertar ticket: " + error.message }), { status: 500 });
    }

    // Enviar correo al usuario
    const subject = `Tu caso de soporte: ${caseNumber}`;
    const html = `<p>Hola${name ? ` ${name}` : ""},</p><p>Hemos recibido tu solicitud de soporte.</p><p><b>Número de caso:</b> ${caseNumber}</p><p>Pronto recibirás respuesta de nuestro equipo.</p>`;
    try {
      await sendEmail(email, subject, html);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Ticket creado pero error enviando correo: " + err.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ caseNumber }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error inesperado: " + (err.message || err) }), { status: 500 });
  }
});
