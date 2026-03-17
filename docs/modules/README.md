# Documentación de Módulos

## auth
- Propósito: autenticación, sesión y protección de rutas/funciones.
- Dependencias: Supabase Auth, AuthContext.
- Integración: ProtectedRoute, Edge Functions con JWT.
- Configuración: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.

## users
- Propósito: perfiles de usuario y datos base.
- Dependencias: profiles, user_roles.
- Integración: panel UserRoles, EmployeePortal.
- Configuración: políticas RLS por company_id.

## companies
- Propósito: tenancy, límites y plan de servicio.
- Dependencias: companies, profiles.company_id.
- Integración: hook useCompany, filtros multitenant.
- Configuración: función get_user_company_id.

## roles
- Propósito: asignación de roles operativos.
- Dependencias: user_roles, role_profiles.
- Integración: páginas UserRoles y RoleProfiles.
- Configuración: enum app_role y policies has_role.

## permissions
- Propósito: control de acceso a datos y acciones.
- Dependencias: RLS + has_role + get_user_company_id.
- Integración: queries frontend y Edge Functions.
- Configuración: políticas SQL por tabla.

## tasks
- Propósito: representar trabajo operativo y automatizaciones.
- Dependencias: tickets, script_executions, agent_tasks_queue.
- Integración: Tickets, Automation, orchestrator.
- Configuración: estados, prioridad, scheduled_for.

## agents
- Propósito: enrolamiento, reporte, ejecución y orquestación.
- Dependencias: devices, enrollment_tokens, agent_runs.
- Integración: function agent-api y agent-orchestrator.
- Configuración: AGENT_SHARED_KEY, APP_ALLOWED_ORIGIN.

## analytics
- Propósito: telemetría de uso y rendimiento de plataforma/agentes.
- Dependencias: analytics, system_logs.
- Integración: Reports dashboard.
- Configuración: métricas por company_id.

## notifications
- Propósito: alertas operativas y de seguridad.
- Dependencias: notifications.
- Integración: dashboard y flujos de agente.
- Configuración: channel (in_app/email/webhook).

## logs
- Propósito: auditoría de acciones y diagnóstico.
- Dependencias: system_logs.
- Integración: SystemLogs y métricas en Reports.
- Configuración: severity, category, retención futura.
