# PACKAGE AND LICENSE MANAGEMENT

Fecha: 2026-03-14

## 1) Alcance

Definir el modelo empresarial para instalación segura de software y ciclo de vida de licencias, reutilizando módulos existentes y cerrando brechas de seguridad.

## 2) Estado Actual

Existe gestión de licencias funcional (`licenses` + UI), pero:

1. No hay catálogo de paquetes firmados centralizado.
2. No hay verificación hash/firma obligatoria por instalación.
3. `license_key` está en texto claro y visible en flujos operativos.

## 3) Modelo Objetivo

## 3.1 Package Catalog

Campos sugeridos:

1. `package_id`
2. `tenant_id` (o global con asignación por tenant)
3. `name`
4. `vendor`
5. `version`
6. `source_type` (internal_repo, approved_repo)
7. `source_uri`
8. `sha256`
9. `signature`
10. `install_type` (msi/exe/scripted-safe)
11. `silent_args` (lista permitida)
12. `rollback_supported`
13. `status`

## 3.2 Package Installations

Campos sugeridos:

1. `installation_id`
2. `package_id`
3. `tenant_id`
4. `device_id`
5. `ticket_id`
6. `status`
7. `attempt_count`
8. `started_at/completed_at`
9. `result_code`
10. `result_log`

## 3.3 License Inventory

Campos mínimos adicionales al estado actual:

1. `secret_ref` (reemplazo progresivo de `license_key` plano)
2. `provider`
3. `activation_channel` (KMS/MAK/OEM/subscription)
4. `last_validation_at`
5. `validation_status`

## 4) Reglas de Seguridad

1. Solo paquetes del catálogo aprobado.
2. Verificación de SHA-256 obligatoria.
3. Verificación de firma cuando aplique.
4. Bloqueo si hash/firma no coincide.
5. Nunca ejecutar instaladores desde URL arbitraria.
6. Secretos de licencia fuera de scripts y fuera de UI por defecto.

## 5) Compatibilidad Incremental

1. Mantener `licenses` actual para continuidad.
2. Introducir `secret_ref` sin romper queries existentes.
3. Migrar UI de licencia a vistas enmascaradas.
4. Agregar auditoría por acción de instalación/activación/reparación.
