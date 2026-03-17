# ARCHITECTURE

Fecha: 2026-03-14
Tipo: arquitectura actual + arquitectura objetivo incremental.

## 1) Arquitectura Actual

1. Frontend React/Vite con módulos de dominio por páginas.
2. Backend en Supabase con Edge Functions y PostgreSQL con RLS.
3. Agente Windows en PowerShell y runtime Go en evolución.
4. Orquestación de agentes por cola (`agent_tasks_queue`) y workflows (`agent_workflows`).

## 2) Capas

### Presentación

- `src/pages/*`
- `src/components/*`

### Aplicación

- Hooks/context para auth y company scope:
  - `src/contexts/AuthContext.tsx`
  - `src/hooks/useCompany.ts`

### Backend de dominio

- `supabase/functions/agent-api`
- `supabase/functions/agent-orchestrator`
- `supabase/functions/ai-classify`
- `supabase/functions/auto-remediate`

### Persistencia

- Migraciones SQL bajo `supabase/migrations`.
- RLS por `company_id` + `get_user_company_id`.

## 3) Flujos críticos

1. Enrolamiento: UI genera token -> agente registra dispositivo.
2. Heartbeat/diagnóstico: agente reporta -> backend actualiza estado.
3. Automatización: backend encola -> orquestador procesa -> auditoría en logs/runs.
4. Políticas firewall/host: backend sincroniza -> agente aplica y reporta.

## 4) Brechas de la arquitectura actual

1. Convivencia de dos modelos de automatización:
   - libre por `script_content`
   - tipado por workflows/cola
2. Seguridad de ejecución remota no cerrada aún.
3. Multiempresa aún con excepciones legacy por `company_id IS NULL`.

## 5) Arquitectura Objetivo

1. Action Dispatcher tipado, firmado y auditable.
2. Catálogos aprobados para firewall/host/package/licencias.
3. Aislamiento multiempresa estricto sin bypass por null.
4. Migración progresiva:
   - Go: runtime y componentes de alto throughput.
   - Rust: validación, enforcement y seguridad crítica.

## 6) Compatibilidad

Todos los cambios deben preservar contratos existentes hasta que la ruta segura esté estable y probada con rollout gradual.
