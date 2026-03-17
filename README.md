# InteliSupp AID

Plataforma SaaS multiempresa para IT Service Desk / Mesa de Ayuda con inventario, tickets, automatización, monitoreo, políticas de red/firewall y gestión de licencias.

## Estado

Proyecto existente y funcional, actualmente en evolución incremental hacia una arquitectura empresarial más segura con migración progresiva a Go y Rust para componentes críticos.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Supabase (Postgres + RLS + Edge Functions)
- Agente: Windows/Linux legacy (PowerShell/Bash) + runtime Rust (`agents/rust-agent`) + runtime Go (orquestación)

## Módulos actuales

- Auth y rutas protegidas
- Dashboard operativo
- Tickets y portal de empleado
- Dispositivos e inventario
- Automatización y diagnósticos
- Backups
- VPN y Firewall manager
- Licencias
- Reportes

## Desarrollo local

Requisitos:

- Node.js 18+
- npm

Comandos:

```bash
npm install
npm run dev
npm run test
npm run build
```

## Despliegue en Cloudflare Pages (GitHub en tiempo real)

Este repositorio ya queda preparado para despliegue continuo en Cloudflare Pages por cada cambio:

- Push a `main`: despliegue a produccion.
- Pull request: despliegue preview automatico.

Archivos ya configurados:

- `.github/workflows/cloudflare-pages.yml`
- `public/_redirects` (soporte SPA para rutas de React Router)
- `.env.example`

### 1) Crear proyecto en Cloudflare Pages

1. En Cloudflare, crea un proyecto de Pages (si no existe).
2. Copia el `Project name` exacto.
3. Copia tu `Account ID`.
4. Genera un API Token con permisos minimos para Pages deploy.

### 2) Configurar secretos en GitHub

En GitHub > Settings > Secrets and variables > Actions, crea:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### 3) Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "chore: cloudflare pages ci/cd setup"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

Una vez hecho esto, cada push a `main` se publica automaticamente en Cloudflare, y cada PR genera una vista previa.

## Documentación técnica

- Auditoría técnica: `docs/TECHNICAL_AUDIT.md`
- Arquitectura: `docs/ARCHITECTURE.md`
- Hardening de seguridad: `docs/SECURITY_HARDENING_REPORT.md`
- Modelo multitenancy: `docs/MULTITENANCY_MODEL.md`
- Catálogo de acciones de agente: `docs/AGENT_ACTIONS_CATALOG.md`
- Paquetes y licencias: `docs/PACKAGE_AND_LICENSE_MANAGEMENT.md`
- Mapa de migración Go/Rust: `docs/GO_RUST_MIGRATION_MAP.md`
- Enrolamiento y operación de agente: `docs/AGENT_ENROLLMENT.md`

## Agente Rust (nuevo)

- Runtime: `agents/rust-agent`
- Instalador Windows: `agents/windows/agent-rust-installer.ps1`
- Instalador Linux/macOS: `agents/linux/agent-rust-installer.sh`

Compilación manual:

```bash
cd agents/rust-agent
cargo build --release
```

## Ajuste automático de rate limit en Supabase Auth

Para aumentar temporalmente el límite de registro de correos en pruebas:

```bash
SUPABASE_ACCESS_TOKEN=<tu_personal_access_token>
SUPABASE_PROJECT_REF=dyhazspvhsymfwizyaol
SUPABASE_RATE_LIMIT_EMAIL_SENT=240
npm run supabase:set-signup-rate-limit
```

Variables opcionales:

- `SUPABASE_RATE_LIMIT_VERIFY` (default: 120)
- `SUPABASE_RATE_LIMIT_TOKEN_REFRESH` (default: 1800)

Nota:

- Si Supabase rechaza `rate_limit_email_sent` por no tener SMTP custom, el script aplica fallback automático con `mailer_autoconfirm=true` para QA y mantiene `rate_limit_verify` / `rate_limit_token_refresh`.

## Nota de ejecución

En este entorno actual, el runtime Go no se puede validar con `go test` hasta instalar Go 1.22+ en el sistema.
