# MULTITENANCY MODEL

Fecha: 2026-03-14

## 1) Modelo Actual

La plataforma usa aislamiento lógico por tenant basado en:

1. Tabla `companies`.
2. `profiles.company_id` como pertenencia principal.
3. Función `get_user_company_id(auth.uid())` para RLS.
4. Columna `company_id` en entidades operativas.

## 2) Fortalezas

1. Estructura de tenant ya propagada en tablas críticas.
2. RLS habilitado en gran parte del esquema.
3. Edge Functions ya inyectan y consultan `company_id` en flujos clave.

## 3) Riesgos

1. Varias políticas aún permiten `company_id IS NULL OR ...` por registros legacy.
2. Eso puede exponer datos antiguos entre empresas autenticadas.
3. Algunos endpoints service-role dependen de validación manual adicional.

## 4) Objetivo de Endurecimiento

1. Todo registro con `company_id` obligatorio.
2. Toda política RLS de lectura/escritura sin bypass por NULL.
3. Validación de tenant en cada endpoint, además de RLS.
4. Auditoría por `company_id`, `user_id`, `device_id`, `ticket_id`.

## 5) Plan de Saneamiento Seguro

## Paso 1

1. Inventario de registros con `company_id IS NULL`.
2. Asignación por lotes con trazabilidad.

## Paso 2

1. Marcar `company_id` como NOT NULL por tabla cuando aplique.
2. Retirar condiciones `IS NULL` de políticas RLS.

## Paso 3

1. Test de aislamiento entre dos tenants reales.
2. Test de permisos por rol en cada tenant.

## 6) Tablas de Dominio Esperadas (estado)

Estado actual: existen parcialmente o totalmente `companies`, `profiles`, `devices`, `tickets`, `script_executions`, `system_logs`, `licenses`, `agent_tasks_queue`, `agent_runs`, `agent_workflows`.

Pendiente recomendado: separación formal de catálogos multiempresa para host policies, package catalog y firewall allowlist tipada.
