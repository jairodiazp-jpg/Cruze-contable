# AGENT ACTIONS CATALOG

Fecha: 2026-03-14
Objetivo: reemplazar ejecución libre por acciones tipadas, validadas y auditables.

## 1) Contrato General de Acción

Campos mínimos:

1. `action_id` (uuid)
2. `tenant_id`
3. `device_id`
4. `ticket_id` (opcional pero recomendado)
5. `action_type` (catálogo cerrado)
6. `params` (JSON validado por esquema)
7. `requested_by`
8. `approved_by` (si aplica)
9. `expires_at`
10. `nonce`
11. `signature`

## 2) Acciones Permitidas (cerradas)

1. `flush_dns`
2. `renew_ip`
3. `reset_winsock`
4. `reset_tcpip`
5. `restart_adapter`
6. `collect_network_info`
7. `restart_spooler`
8. `collect_event_logs`
9. `enable_known_firewall_rule`
10. `disable_known_firewall_rule`
11. `apply_host_block_policy`
12. `remove_host_block_policy`
13. `install_package`
14. `repair_package`
15. `uninstall_package`
16. `collect_license_status`
17. `activate_license`
18. `run_safe_diagnostics`

## 3) Acciones Prohibidas

1. Ejecutar PowerShell arbitrario remoto.
2. Descargar y ejecutar binarios fuera de repositorios aprobados.
3. Abrir puertos arbitrarios.
4. Crear reglas de firewall fuera del catálogo.

## 4) Validación Mínima por Acción

1. `action_type` debe existir en catálogo.
2. `tenant_id/device_id` deben pertenecer al mismo contexto.
3. `expires_at` no vencido.
4. `nonce` no reutilizado.
5. `signature` válida.
6. `params` válidos contra esquema del `action_type`.

## 5) Auditoría Obligatoria

Registrar:

1. solicitud
2. aprobación/rechazo
3. inicio de ejecución
4. resultado
5. rollback (si aplica)

Campos de evidencia:

1. `correlation_id`
2. `ticket_id`
3. `tenant_id`
4. `device_id`
5. `actor_user_id`
6. `status`
7. `error_code/error_detail`
