import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, data } = await req.json();

    let systemPrompt = '';
    let userPrompt = '';

    if (action === 'classify') {
      systemPrompt = `Eres un clasificador de tickets de soporte TI. Analiza el ticket y devuelve un JSON con:
- category: uno de [hardware, software, red, acceso, otro]
- priority: uno de [baja, media, alta, critica]
- reasoning: breve explicación en español
Responde SOLO con JSON válido.`;
      userPrompt = `Asunto: ${data.subject}\nDescripción: ${data.description}`;
    } else if (action === 'suggest') {
      systemPrompt = `Eres un asistente de soporte TI. Basándote en la base de conocimiento proporcionada, sugiere soluciones al problema descrito. Responde en español con pasos claros y concisos. Si no hay solución en la base de conocimiento, sugiere pasos generales de diagnóstico.`;
      userPrompt = `Problema: ${data.subject}\nDescripción: ${data.description}\n\nBase de conocimiento disponible:\n${data.kbArticles?.map((a: any) => `- ${a.title}: ${a.solution}`).join('\n') || 'Sin artículos disponibles'}`;
    } else if (action === 'predict') {
      systemPrompt = `Eres un analista de TI que predice fallas en equipos. Analiza los datos del equipo y el historial de tickets para predecir posibles problemas. Responde en español con un JSON que contenga:
- risk_level: uno de [bajo, medio, alto]
- predictions: array de objetos con { issue, probability, recommendation }
Responde SOLO con JSON válido.`;
      userPrompt = `Equipo: ${data.brand} ${data.model} (${data.type})\nEstado actual: ${data.status}\nSistema: ${data.os}\nRAM: ${data.ram}\nAlmacenamiento: ${data.storage}\nFecha registro: ${data.registeredAt}\n\nHistorial de tickets relacionados:\n${data.relatedTickets?.map((t: any) => `- ${t.subject} (${t.status})`).join('\n') || 'Sin tickets previos'}`;
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
