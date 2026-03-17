# SECURITY HARDENING REPORT

Fecha: 2026-03-14
Estado: diagnóstico inicial y plan de remediación priorizado.

## 1) Hallazgos Críticos

1. Ejecución remota arbitraria en agente Windows:
   - `custom` y `powershell` ejecutan código remoto.
   - `Invoke-Expression` en flujo de instalación por perfil.
   - Archivo: `agents/windows/agent.ps1`.

2. Modelo backend y UI permiten persistir y despachar `script_content`:
   - `src/pages/Automation.tsx`
   - `supabase/functions/agent-api/index.ts`

3. `agent-api` con `verify_jwt = false`:
   - Archivo: `supabase/config.toml`.

## 2) Hallazgos Altos

1. Claves de licencia en texto claro en almacenamiento y uso UI.
2. CORS con fallback `*` en funciones edge si no hay configuración.
3. RLS con excepciones `company_id IS NULL` por compatibilidad legacy.

## 3) Hallazgos Medios

1. Falta política de aprobación obligatoria para acciones sensibles.
2. Falta esquema uniforme de `correlation_id` en auditoría.
3. Catálogos de firewall/host/package no están completamente cerrados por allowlist firmada.

## 4) Remediación Prioritaria

## Fase P0

1. Bloquear creación y ejecución de scripts arbitrarios nuevos.
2. Implementar `Action Dispatcher` tipado con validación de parámetros.
3. Exigir firma/nonce/expiración en acciones de agente.
4. Enmascarar y restringir lectura de claves sensibles.

## Fase P1

1. Crear catálogos aprobados para:
   - reglas firewall
   - políticas host
   - paquetes corporativos
2. Introducir aprobación por ticket para acciones sensibles.
3. Fortalecer autenticación de runtime Go y endpoints internos.

## Fase P2

1. Backfill de `company_id` legacy y retiro de accesos `IS NULL`.
2. Trazabilidad end-to-end con `correlation_id`.
3. Política de rotación y protección de secretos (KMS/secret manager).

## 5) Controles Objetivo

1. Zero arbitrary remote execution.
2. Least privilege por rol, tenant y tipo de acción.
3. Evidencia completa de auditoría para forense.
4. Validación defensiva de payload en todo endpoint sensible.
