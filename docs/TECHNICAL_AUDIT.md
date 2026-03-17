# TECHNICAL AUDIT

Fecha: 2026-03-14
Alcance: auditoría técnica de plataforma existente (sin refactors destructivos)

## 1) Resumen Ejecutivo

La plataforma ya tiene una base funcional sólida para un SaaS de soporte IT:

- Frontend React + Vite + TypeScript con múltiples módulos operativos.
- Backend en Supabase (Postgres + RLS + Edge Functions).
- Esquema multiempresa basado en `company_id` y función `get_user_company_id(...)`.
- Agentes en Windows (PowerShell) y runtime nuevo en Go para orquestación autónoma.

El principal riesgo actual no es la ausencia de funcionalidades, sino la exposición de seguridad en automatización remota y algunas reglas de aislamiento demasiado permisivas por compatibilidad histórica.

Conclusión de estado:

- Funcionalidad: media-alta.
- Seguridad: media (con brechas críticas puntuales).
- Preparación para escala: media-alta.
- Preparación para migración Go/Rust: media (base creada, no cerrada).

## 2) Stack y Arquitectura Actual

### 2.1 Frontend

- React 18 + Vite + TypeScript.
- shadcn/ui + Tailwind + Radix.
- React Query configurado con `staleTime/gcTime`.
- Ruteo lazy-loading por módulo.

Archivos de referencia:

- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/hooks/useCompany.ts`

### 2.2 Backend

- Supabase Edge Functions:
  - `agent-api`
  - `agent-orchestrator`
  - `ai-classify`
  - `auto-remediate`
- Postgres con migraciones versionadas.
- RLS habilitado en la mayoría de tablas operativas.

Archivos de referencia:

- `supabase/functions/agent-api/index.ts`
- `supabase/functions/agent-orchestrator/index.ts`
- `supabase/functions/ai-classify/index.ts`
- `supabase/functions/auto-remediate/index.ts`

### 2.3 Agentes

- Windows Agent en PowerShell con diagnóstico, sincronización de políticas y ejecución de tareas.
- Runtime Go modular para orquestación autónoma (planner/executor/evaluator).

Archivos de referencia:

- `agents/windows/agent.ps1`
- `agents/windows/agent-installer.ps1`
- `agents/go-runtime/internal/orchestrator/orchestrator.go`
- `agents/go-runtime/internal/agent/execution.go`
- `agents/go-runtime/internal/server/http.go`

## 3) Qué Existe y Funciona

### 3.1 Módulos funcionales existentes

- Autenticación de usuarios y rutas protegidas.
- Gestión de dispositivos, tickets, inventario, diagnósticos, backups, VPN, firewall, email, licencias, reportes.
- Enrolamiento de dispositivos por token y heartbeat de agente.
- Cola de tareas de agentes y orquestación autónoma base.
- Notificaciones y analítica de ejecuciones.

### 3.2 Multiempresa (estado actual)

- Existe tabla `companies` y propagación de `company_id` en tablas críticas.
- Existe `get_user_company_id(auth.uid())`.
- Múltiples políticas RLS ya filtran por compañía.

Referencias clave:

- `supabase/migrations/20260310004819_217874e2-f562-463a-8780-706471e7ded7.sql`
- `supabase/migrations/20260314101500_b9f0f2c3_agent_orchestration_queue.sql`
- `supabase/migrations/20260314150000_autonomous_agents_architecture.sql`

## 4) Qué Está Incompleto o Débil

1. Catálogos de acciones seguras no están cerrados de extremo a extremo.
2. Host Policy Engine formal (con rollback y aprobación fuerte) no está modelado aún como dominio dedicado.
3. Gestión de paquetes corporativos aprobados (hash/firma/origen) no está implementada como catálogo robusto.
4. Licencias se gestionan, pero `license_key` permanece en texto claro en DB y en UI/flujo agente.
5. Runtime Go no tiene autenticación fuerte de API ni validación de firma de acciones.
6. Falta suite de pruebas de seguridad y contratos para Edge Functions críticas.

## 5) Duplicación y Deuda Técnica

1. Coexisten rutas de ejecución antiguas y nuevas:
   - `script_executions` (modelo script libre)
   - `agent_tasks_queue`/`agent_workflows` (modelo workflow)
2. En frontend existen formularios para scripts personalizados y tipos libres de script.
3. Políticas RLS heredadas con `company_id IS NULL OR ...` mantienen compatibilidad, pero abren riesgos de visibilidad cruzada de registros legacy.
4. README principal está desalineado con el estado real empresarial del proyecto.

## 6) Riesgos de Seguridad Encontrados

## 6.1 Críticos

1. Ejecución remota arbitraria en agente Windows:
   - `script_type` `custom` y `powershell` ejecutan contenido remoto.
   - uso de `Invoke-Expression` en instalación por perfil.
   - Referencia: `agents/windows/agent.ps1`.

2. Modelo de automatización permite persistir `script_content` desde UI y ejecutarlo en endpoint agente:
   - Referencias: `src/pages/Automation.tsx`, `supabase/functions/agent-api/index.ts`.

3. `agent-api` con `verify_jwt = false` (requiere hardening adicional más allá de `x-agent-key`):
   - Referencia: `supabase/config.toml`.

## 6.2 Altos

1. CORS con fallback `*` en funciones Edge.
2. Secretos/licencias potencialmente expuestos por diseño funcional (clave en tabla/UI).
3. Políticas RLS de lectura con `company_id IS NULL` pueden mostrar registros antiguos sin tenant.

## 6.3 Medios

1. Falta de aprobaciones explícitas para acciones sensibles por ticket/política.
2. Falta de expiración y deduplicación fuerte en modelo legacy de scripts (sí existe en parte en cola nueva).

## 7) Rendimiento y Escalabilidad

Fortalezas:

- Lazy routes y chunking en frontend.
- Índices compuestos recientes para tablas calientes.
- Orquestador concurrente para cola de agentes.

Riesgos pendientes:

1. Múltiples pantallas aún usan `select("*")` en queries de alto volumen.
2. Algunas vistas cargan hasta 500 filas sin paginación server-side real.
3. Falta estrategia de archivado para logs/diagnósticos de largo plazo.

## 8) Evaluación por Dominio Solicitado

### A) SaaS multiempresa

- Parcialmente logrado.
- Debe endurecerse eliminando progresivamente `company_id IS NULL` y migrando datos legacy a tenant explícito.

### B) Usuarios y roles

- Existe base de roles (`app_role`) y políticas por rol.
- Falta un modelo completo de permisos granulares por acción.

### C) Dispositivos

- Cobertura buena de inventario y telemetría base.
- Falta normalización de etiquetas/sede/área como catálogos formales.

### D) Tickets

- Funciona creación y seguimiento.
- Falta SLA formal, estados objetivos requeridos por negocio empresarial y correlación estricta ticket-acción.

### E) Agente Windows

- Funcionalmente completo para operación diaria.
- Inseguro por capacidad de ejecución remota arbitraria.

### F) Automatización segura

- No cumplido completamente por coexistencia del modelo de scripts libres.

### G) Red/firewall/políticas host

- Existe sincronización de políticas y reglas.
- Falta catálogo cerrado con aprobación y rollback auditable por policy_id.

### H) Licencias corporativas

- Existe inventario y activación.
- Falta protección criptográfica de secretos y pipeline de paquetes firmados.

### I) Observabilidad/auditoría

- Existe `system_logs`, `analytics`, `agent_runs`.
- Falta trazabilidad uniforme por correlación global (`correlation_id`) y dashboards de auditoría más estrictos.

### J) Seguridad

- Parcial: se añadieron mejoras (rate limit y auth), pero aún hay brechas críticas en ejecución remota.

## 9) Módulos Listos para Migrar a Go

Alta prioridad:

1. Agente core loop (heartbeat/retries/backoff).
2. Dispatcher de acciones tipadas.
3. Recolector de diagnósticos y uploader.
4. Orquestación local de paquetes/licencias.

Media prioridad:

1. Cliente de sincronización de políticas.
2. Cola local offline-first.

## 10) Módulos Candidatos a Rust

Alta prioridad:

1. Validador criptográfico de acciones (firma + expiración + nonce).
2. Policy enforcement engine (firewall/host/package allowlist).
3. Verificación de hash/firma de paquetes.

Media prioridad:

1. Parser/normalizador de reglas sensibles.
2. Módulo de secretos local (wrapping DPAPI/KMS).

## 11) Quick Wins (sin romper producción)

1. Deshabilitar en UI la creación de scripts `custom`/`powershell` y redirigir a acciones tipadas.
2. En agente Windows, bloquear ejecución de `script_content` arbitrario y permitir solo catálogo cerrado.
3. En backend, introducir `automation_actions` + `action_executions` con validación estricta.
4. En RLS, auditar tablas con `company_id IS NULL` y plan de saneamiento por lotes.
5. Mover `license_key` a cifrado en repositorio seguro y enmascarar por defecto en frontend.

## 12) Plan de Ejecución por Etapas (Fase 2)

Orden prioritario:

1. Seguridad crítica:
   - eliminar ejecución arbitraria, validar acciones, firmas, expiración, deduplicación.
2. Aislamiento multiempresa:
   - endurecer RLS, backfill de `company_id`, remover excepciones legacy.
3. Agente seguro:
   - Action Dispatcher tipado + catálogos aprobados.
4. Tickets-dispositivos-auditoría:
   - correlación fuerte ticket/action/device/user.
5. Licencias y paquetes:
   - catálogo aprobado, hash/firma, secretos protegidos.
6. Observabilidad:
   - métricas técnicas + auditoría de seguridad accionable.
7. Rendimiento:
   - paginación, proyecciones selectivas, archivado.
8. Migración Go/Rust:
   - adopción incremental sin ruptura de contratos.

## 13) Qué Debe Mantenerse Intacto

1. Contratos de rutas frontend ya consumidas por usuarios.
2. Esquema de tablas principales que ya alimentan vistas existentes.
3. Flujos de enrolamiento/reporting operativos hasta introducir versión segura compatible.
4. Compatibilidad con Supabase RLS como primera línea de aislamiento.

## 14) Archivos Revisados (muestra principal)

- `package.json`
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/hooks/useCompany.ts`
- `src/pages/Automation.tsx`
- `src/pages/Licenses.tsx`
- `src/pages/Reports.tsx`
- `src/data/mockData.ts`
- `supabase/config.toml`
- `supabase/functions/agent-api/index.ts`
- `supabase/functions/agent-orchestrator/index.ts`
- `supabase/functions/ai-classify/index.ts`
- `supabase/functions/auto-remediate/index.ts`
- `supabase/migrations/20260307180056_06c32f5d-b08a-4afa-a337-4b05c1bc7154.sql`
- `supabase/migrations/20260308001834_d80798ca-96b7-494e-9142-63501e2f9f5d.sql`
- `supabase/migrations/20260310004819_217874e2-f562-463a-8780-706471e7ded7.sql`
- `supabase/migrations/20260314101500_b9f0f2c3_agent_orchestration_queue.sql`
- `supabase/migrations/20260314112000_3f4a2d11_agent_api_rate_limit.sql`
- `supabase/migrations/20260314150000_autonomous_agents_architecture.sql`
- `agents/windows/agent.ps1`
- `agents/windows/agent-installer.ps1`
- `agents/go-runtime/internal/orchestrator/orchestrator.go`
- `agents/go-runtime/internal/agent/execution.go`
- `agents/go-runtime/internal/repository/repository.go`
- `agents/go-runtime/internal/server/http.go`
