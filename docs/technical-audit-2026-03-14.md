# Reporte Técnico de Auditoría
Fecha: 2026-03-14

## Módulos funcionales
- Autenticación y rutas protegidas.
- Gestión de tickets, dispositivos, inventario, diagnósticos, automatización, backups, VPN, firewall, email, licencias, base de conocimiento.
- Realtime notifications para estado de scripts/dispositivos.

## Módulos incompletos o parciales
- Reports: dependía de datos mock, ahora conectado a Supabase.
- Arquitectura de agentes: faltaba orquestación explícita y cola dedicada, ahora añadidas.
- Telemetría de analytics y notificaciones persistentes: añadidas tablas base.

## Errores y riesgos detectados
- verify_jwt desactivado en funciones críticas.
- CORS demasiado abierto.
- agent-api permitía crear datos sin company_id en varios caminos.
- Report endpoint permitía upsert implícito por device_id (riesgo spoofing).
- Falta de cola asíncrona formal para agentes.

## Problemas de arquitectura
- Monolito sin separación explícita frontend/backend/workers/infra.
- Lógica de agentes y ejecución mezclada sin orquestador dedicado.
- Dependencia fuerte en RLS sin suficientes defensas complementarias.

## Problemas de seguridad
- Superficie de ataque por funciones sin JWT/validación fuerte.
- Riesgo de mezcla de datos entre compañías por inserciones sin company_id.
- Falta de secret compartido para endpoints consumidos por agentes.

## Problemas de rendimiento
- Ausencia de índices en company_id para tablas calientes.
- Carga analítica con datos mock (sin control de volumen real).

## Cambios aplicados
- Seguridad:
  - verify_jwt=true en ai-classify y auto-remediate.
  - CORS configurable por APP_ALLOWED_ORIGIN.
  - Validación opcional de AGENT_SHARED_KEY para acciones de agente.
- Multiempresa:
  - Propagación de company_id en flujos de enrollment/report/resultados/logs.
  - report exige dispositivo previamente enrolado.
- Arquitectura agentes:
  - Nueva migración con agents, agent_tasks_queue, agent_runs, notifications, analytics.
  - RPC enqueue_agent_task para encolado.
  - Nueva función agent-orchestrator para ejecución asíncrona y trazabilidad.
- Dashboard analítico:
  - Reports conectado a datos reales de Supabase con filtro por company_id.
  - Paneles superadmin/empresa/usuarios/agentes/analítica/logs.
- Documentación:
  - ARCHITECTURE.md
  - docs/modules/README.md

## Backlog recomendado inmediato
- Aplicar useCompany + filtro company_id en todas las páginas restantes.
- Encriptar/sanitizar campos sensibles de email provisioning.
- Añadir rate limiting por IP/token en agent-api.
- Completar pruebas automáticas para funciones edge y páginas críticas.
