# AGENT ENROLLMENT (RUST)

Guia operativa para instalar, ejecutar y migrar agentes sin dejar procesos legacy activos.

## 1) Requisitos

- Token de enrollment valido (`enrollment_tokens`).
- Rust toolchain (`cargo`) en el host donde se compila.
- Permisos de administrador/root para instalar servicio.

## 2) Ubicaciones recomendadas

- Windows (Rust): `C:\ITAgentRust`
- Linux/macOS (Rust): `/opt/itagent-rust`
- Legacy Windows: `C:\ITAgent`
- Legacy Linux/macOS: `/opt/itagent`

## 3) Desactivar agentes anteriores

### Windows

```powershell
Set-Location agents\windows
.\disable-legacy-agents.ps1
```

Si tambien quieres apagar temporalmente el Rust actual:

```powershell
.\disable-legacy-agents.ps1 -DisableRustAgent
```

### Linux/macOS

```bash
cd agents/linux
sudo bash disable-legacy-agents.sh
```

Si tambien quieres apagar temporalmente el Rust actual:

```bash
sudo bash disable-legacy-agents.sh --disable-rust-agent
```

## 4) Instalacion y enrollment (recomendado)

### Windows

```powershell
Set-Location agents\windows
.\agent-rust-installer.ps1 -Token "<ENROLLMENT_TOKEN>"
```

Comportamiento:
- Desactiva legacy automaticamente (salvo `-KeepLegacyAgentEnabled`).
- Compila Rust y registra tarea `ITServiceDeskAgentRust`.
- Guarda binario y launcher en `C:\ITAgentRust`.

### Linux/macOS

```bash
cd agents/linux
sudo bash agent-rust-installer.sh --token "<ENROLLMENT_TOKEN>"
```

Comportamiento:
- Desactiva legacy automaticamente (salvo `--keep-legacy-enabled`).
- Compila Rust y registra `itagent-rust.service` (Linux) o launchd (macOS).
- Guarda binario y launcher en `/opt/itagent-rust`.

## 5) Ejecucion manual del agente

### Enrollment manual (sin instalador)

```bash
cd agents/rust-agent
cargo build --release
./target/release/itagent-rs \
  --server "https://<project-ref>.supabase.co/functions/v1/agent-api" \
  --api-key "<anon-key>" \
  enroll --token "<ENROLLMENT_TOKEN>"
```

### Run loop manual

```bash
./target/release/itagent-rs \
  --server "https://<project-ref>.supabase.co/functions/v1/agent-api" \
  --api-key "<anon-key>" \
  --device-id "DEV-..." \
  --interval 60
```

## 6) Verificacion post-instalacion

### Windows

```powershell
Get-ScheduledTask -TaskName ITServiceDeskAgentRust
Get-ScheduledTask -TaskName ITServiceDeskAgent -ErrorAction SilentlyContinue
```

### Linux

```bash
systemctl status itagent-rust.service
systemctl status itagent.service
```

Objetivo de migracion correcta:
- Rust activo.
- Legacy desactivado.
- Reportes `report` llegando en intervalos esperados.
