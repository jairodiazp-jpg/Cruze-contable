# Arquitectura Plataforma SaaS (Evolución 2026-03-14)

## Estado actual
La plataforma opera como monolito modular:
- Frontend React/Vite en src.
- Backend en Supabase (Postgres + RLS + Edge Functions).
- Agentes endpoint-driven (agent-api).

## Objetivo de diseño
Mantener compatibilidad del frontend actual y preparar separación progresiva a microservicios (Go para APIs, Rust para agentes de alto rendimiento).

## Dominios funcionales
- auth
- users
- companies
- roles
- permissions
- tasks
- agents
- analytics
- notifications
- logs

## Separación lógica
- frontend: src
- backend: supabase/functions + SQL migrations
- workers: supabase/functions/agent-orchestrator (cola asíncrona)
- infraestructura: supabase/config.toml + migraciones de índices/RLS

## Diseño objetivo por módulos backend
- auth: identidad, sesión, claims de seguridad.
- users: perfiles y relación con companies.
- companies: tenancy, plan, límites.
- roles/permissions: autorización basada en rol + RLS.
- tasks: trabajo pendiente, SLA, estados.
- agents: enrolamiento, heartbeat, ejecución.
- analytics: eventos y métricas agregables.
- notifications: alertas in-app/email/webhook.
- logs: auditoría operativa y de seguridad.

## Flujos críticos
1. Enrollment agente
- UI genera token con company_id.
- Agente se registra con token válido.
- Dispositivo queda ligado a company_id.

2. Ejecución asíncrona
- Cliente encola tarea en agent_tasks_queue.
- agent-orchestrator reclama y ejecuta.
- Resultado en agent_runs + analytics + logs + notifications.

3. Aislamiento multiempresa
- company_id en entidades principales.
- RLS por get_user_company_id(auth.uid()).
- Defensa en profundidad en funciones y frontend.

## Preparación para migración Go/Rust
- Contratos desacoplados por dominio (tasks, agents, analytics).
- Cola central reusable por servicios externos.
- Orquestación basada en payload JSON compatible con API gRPC/HTTP futura.
- Persistencia de runs/eventos lista para observabilidad distribuida.
