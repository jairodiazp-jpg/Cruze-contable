# IT Agent Rust Runtime

Runtime del agente en Rust para InteliSupp, compatible con el contrato actual de `agent-api`.

## Objetivos

- Mantener compatibilidad con endpoints existentes (`register`, `report`, `execute`, `policy-sync`, etc.).
- Ejecutar solo acciones tipadas permitidas.
- Bloquear ejecucion arbitraria de scripts remotos.
- Mejorar eficiencia y estabilidad del loop de agente.

## Arquitectura

- `src/main.rs`: ciclo principal, enrollment, heartbeat y scheduling.
- `src/api.rs`: cliente HTTP seguro con `apikey` y `x-agent-key` opcional.
- `src/diagnostics.rs`: telemetria base de CPU/RAM/disco/red.
- `src/actions.rs`: dispatcher de acciones tipadas + sincronizacion de politicas/firewall.
- `src/models.rs`: contrato de payloads serializados para el backend.

## Requisitos

- Rust 1.78+ (recomendado estable actual)
- Permisos elevados para acciones de hosts/firewall/procesos

## Compilar

```bash
cd agents/rust-agent
cargo build --release
```

## Enrollment (registro de dispositivo)

```bash
./target/release/itagent-rs \
  --server "https://<project-ref>.supabase.co/functions/v1/agent-api" \
  --api-key "<anon-key>" \
  --agent-shared-key "<opcional>" \
  enroll --token "<enrollment-token>"
```

El comando devuelve en stdout el `device_id`.

## Modo servicio (loop)

```bash
./target/release/itagent-rs \
  --server "https://<project-ref>.supabase.co/functions/v1/agent-api" \
  --api-key "<anon-key>" \
  --agent-shared-key "<opcional>" \
  --device-id "DEV-..." \
  --interval 60
```

## Ubicacion recomendada de instalacion

- Windows: `C:\ITAgentRust`
- Linux/macOS: `/opt/itagent-rust`

## Desactivar agentes anteriores

- Windows: `agents/windows/disable-legacy-agents.ps1`
- Linux/macOS: `agents/linux/disable-legacy-agents.sh`

Guia completa de enrolamiento y migracion:

- `docs/AGENT_ENROLLMENT.md`

## Seguridad aplicada

- Allowlist estricta de `script_type`.
- Bloqueo de `custom`, `powershell`, `bash` arbitrarios.
- Envio de envelope correlacionado (`action_id`, `nonce`, `exp`) en `execute`.
- Cabecera `x-agent-key` soportada para endurecer autenticacion de agente.

## Acciones soportadas

- `diagnostic`
- `network-repair`
- `backup`
- `firewall-block`
- `firewall-unblock`
- `firewall-rule`
- `firewall-sync`
- `policy-sync`
- `install-profile`
- `setup-email`
- `setup-vpn`
