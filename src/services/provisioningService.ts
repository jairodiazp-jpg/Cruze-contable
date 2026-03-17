// ─────────────────────────────────────────────────────────────────────────────
// provisioningService.ts — Service layer for provisioning profiles and
// automatic script generation.
//
// Scripts are built as plain strings; no shell exec happens here.
// The generated PowerShell / Bash scripts are intended to be downloaded and
// executed locally by an IT admin.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type {
  ProvisioningProfile,
  CreateProvisioningProfileDto,
  UpdateProvisioningProfileDto,
  SoftwarePackage,
} from "@/types/corporate";

const TABLE = "provisioning_profiles" as const;

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listProvisioningProfiles(
  companyId: string,
): Promise<ProvisioningProfile[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as ProvisioningProfile[];
}

export async function createProvisioningProfile(
  dto: CreateProvisioningProfileDto,
): Promise<ProvisioningProfile> {
  const payload = {
    ...dto,
    software_packages: dto.software_packages ?? [],
  };

  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ProvisioningProfile;
}

export async function updateProvisioningProfile(
  id: string,
  dto: UpdateProvisioningProfileDto,
): Promise<ProvisioningProfile> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .update(dto)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ProvisioningProfile;
}

export async function deleteProvisioningProfile(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// ── Script generation ─────────────────────────────────────────────────────────

export interface ScriptContext {
  profile: ProvisioningProfile;
  /** FQDN of the corporate domain (e.g. "acme.com"). Optional for non-domain-join flows. */
  domainName?: string;
  /** Full corporate email address to configure. Optional. */
  emailAddress?: string;
  /** Supabase project URL used for agent registration. */
  supabaseUrl: string;
  /** Supabase anon key. */
  supabaseAnonKey: string;
  /** Enrollment token for device registration. */
  enrollmentToken?: string;
}

/**
 * Generates a Windows PowerShell provisioning script (.ps1).
 * The script is idempotent: re-running it safely skips already-completed steps.
 */
export function generateWindowsScript(ctx: ScriptContext): string {
  const { profile, domainName, emailAddress, supabaseUrl, supabaseAnonKey, enrollmentToken } = ctx;
  const serverUrl = `${supabaseUrl}/functions/v1/agent-api`;

  const softwareBlock = buildSoftwareInstallBlock_PS(profile.software_packages);
  const domainBlock   = profile.auto_join_domain && domainName
    ? buildDomainJoinBlock_PS(domainName)
    : "# Unión al dominio: no configurada en este perfil";
  const emailBlock    = profile.auto_assign_email && emailAddress
    ? buildEmailConfigBlock_PS(emailAddress)
    : "# Configuración de correo: no configurada en este perfil";
  const tokenLine     = enrollmentToken
    ? `$EnrollmentToken = "${enrollmentToken}"`
    : `$EnrollmentToken = ""  # Rellena con tu token de enrolamiento`;
  const customBlock   = profile.custom_ps_snippet
    ? `# ── Configuración personalizada ──\r\n${profile.custom_ps_snippet}`
    : "";

  return [
    `# ============================================================`,
    `# Perfil de aprovisionamiento: ${profile.name}`,
    `# Generado automáticamente — ${new Date().toISOString()}`,
    `# SO objetivo: Windows`,
    `# ============================================================`,
    `#Requires -RunAsAdministrator`,
    `$ErrorActionPreference = "Stop"`,
    ``,
    `# ── Parámetros ──────────────────────────────────────────────`,
    tokenLine,
    `$ServerUrl    = "${serverUrl}"`,
    `$ApiKey       = "${supabaseAnonKey}"`,
    `$ProfileName  = "${profile.name}"`,
    ``,
    `Write-Host ""`,
    `Write-Host "====================================================" -ForegroundColor Cyan`,
    `Write-Host "  IT Service Desk — Aprovisionamiento de equipo" -ForegroundColor Cyan`,
    `Write-Host "  Perfil: $ProfileName" -ForegroundColor Cyan`,
    `Write-Host "====================================================" -ForegroundColor Cyan`,
    `Write-Host ""`,
    ``,
    `# ── [1] Instalación de software ─────────────────────────────`,
    `Write-Host "[1/4] Instalando software base..." -ForegroundColor Yellow`,
    softwareBlock,
    ``,
    `# ── [2] Unión al dominio ────────────────────────────────────`,
    `Write-Host "[2/4] Configurando dominio..." -ForegroundColor Yellow`,
    domainBlock,
    ``,
    `# ── [3] Configuración de correo ─────────────────────────────`,
    `Write-Host "[3/4] Configurando correo corporativo..." -ForegroundColor Yellow`,
    emailBlock,
    ``,
    `# ── [4] Registro del agente ─────────────────────────────────`,
    `Write-Host "[4/4] Registrando dispositivo en la plataforma..." -ForegroundColor Yellow`,
    buildAgentRegistrationBlock_PS(serverUrl, supabaseAnonKey),
    ``,
    customBlock,
    ``,
    `Write-Host ""`,
    `Write-Host "====================================================" -ForegroundColor Green`,
    `Write-Host "  Aprovisionamiento completado exitosamente!" -ForegroundColor Green`,
    `Write-Host "====================================================" -ForegroundColor Green`,
    `Read-Host "Presiona Enter para cerrar"`,
  ].join("\r\n");
}

/**
 * Generates a Linux/macOS Bash provisioning script (.sh).
 */
export function generateLinuxScript(ctx: ScriptContext): string {
  const { profile, domainName, emailAddress, supabaseUrl, supabaseAnonKey, enrollmentToken } = ctx;
  const serverUrl = `${supabaseUrl}/functions/v1/agent-api`;

  const softwareBlock = buildSoftwareInstallBlock_Bash(profile.software_packages);
  const domainBlock   = profile.auto_join_domain && domainName
    ? buildDomainJoinBlock_Bash(domainName)
    : "# Unión al dominio: no configurada en este perfil";
  const emailBlock    = profile.auto_assign_email && emailAddress
    ? buildEmailConfigBlock_Bash(emailAddress)
    : "# Configuración de correo: no configurada en este perfil";
  const tokenLine     = enrollmentToken
    ? `ENROLLMENT_TOKEN="${enrollmentToken}"`
    : `ENROLLMENT_TOKEN=""  # Rellena con tu token de enrolamiento`;
  const customBlock   = profile.custom_bash_snippet
    ? `# ── Configuración personalizada ──\n${profile.custom_bash_snippet}`
    : "";

  return [
    `#!/usr/bin/env bash`,
    `# ============================================================`,
    `# Perfil de aprovisionamiento: ${profile.name}`,
    `# Generado automáticamente — ${new Date().toISOString()}`,
    `# SO objetivo: Linux/macOS`,
    `# ============================================================`,
    `set -euo pipefail`,
    ``,
    `# ── Parámetros ──────────────────────────────────────────────`,
    tokenLine,
    `SERVER_URL="${serverUrl}"`,
    `API_KEY="${supabaseAnonKey}"`,
    `PROFILE_NAME="${profile.name}"`,
    ``,
    `echo ""`,
    `echo "===================================================="`,
    `echo "  IT Service Desk — Aprovisionamiento de equipo"`,
    `echo "  Perfil: $PROFILE_NAME"`,
    `echo "===================================================="`,
    `echo ""`,
    ``,
    `# ── [1] Instalación de software ─────────────────────────────`,
    `echo "[1/4] Instalando software base..."`,
    softwareBlock,
    ``,
    `# ── [2] Unión al dominio ────────────────────────────────────`,
    `echo "[2/4] Configurando dominio..."`,
    domainBlock,
    ``,
    `# ── [3] Configuración de correo ─────────────────────────────`,
    `echo "[3/4] Configurando correo corporativo..."`,
    emailBlock,
    ``,
    `# ── [4] Registro del agente ─────────────────────────────────`,
    `echo "[4/4] Registrando dispositivo en la plataforma..."`,
    buildAgentRegistrationBlock_Bash(serverUrl, supabaseAnonKey),
    ``,
    customBlock,
    ``,
    `echo ""`,
    `echo "===================================================="`,
    `echo "  Aprovisionamiento completado exitosamente!"`,
    `echo "===================================================="`,
  ].join("\n");
}

// ── Private script block builders ─────────────────────────────────────────────

function buildSoftwareInstallBlock_PS(packages: SoftwarePackage[]): string {
  if (!packages.length) return "# Sin paquetes de software configurados";

  const lines = packages.map(pkg => {
    const escapedCmd = pkg.install_command.replace(/'/g, "''");
    return [
      `Write-Host "  → Instalando ${pkg.name}..."`,
      `try {`,
      `    ${escapedCmd}`,
      `    Write-Host "  [OK] ${pkg.name}" -ForegroundColor Green`,
      `} catch {`,
      `    Write-Host "  [ADVERTENCIA] ${pkg.name}: $($_.Exception.Message)" -ForegroundColor Yellow`,
      `}`,
    ].join("\r\n");
  });

  return lines.join("\r\n\r\n");
}

function buildSoftwareInstallBlock_Bash(packages: SoftwarePackage[]): string {
  if (!packages.length) return "# Sin paquetes de software configurados";

  return packages.map(pkg => [
    `echo "  → Instalando ${pkg.name}..."`,
    `if ${pkg.install_command}; then`,
    `    echo "  [OK] ${pkg.name}"`,
    `else`,
    `    echo "  [ADVERTENCIA] Falló la instalación de ${pkg.name}, continuando..."`,
    `fi`,
  ].join("\n")).join("\n\n");
}

function buildDomainJoinBlock_PS(domainFqdn: string): string {
  return [
    `$Domain = "${domainFqdn}"`,
    `$currentDomain = (Get-WmiObject Win32_ComputerSystem).Domain`,
    `if ($currentDomain -ieq $Domain) {`,
    `    Write-Host "  El equipo ya pertenece al dominio $Domain" -ForegroundColor Green`,
    `} else {`,
    `    $cred = Get-Credential -Message "Ingresa credenciales de administrador del dominio $Domain"`,
    `    Add-Computer -DomainName $Domain -Credential $cred -Restart:$false -Force`,
    `    Write-Host "  [OK] Unido a dominio: $Domain (se requiere reinicio)" -ForegroundColor Green`,
    `}`,
  ].join("\r\n");
}

function buildDomainJoinBlock_Bash(domainFqdn: string): string {
  return [
    `DOMAIN="${domainFqdn}"`,
    `if realm list | grep -q "$DOMAIN"; then`,
    `    echo "  El equipo ya pertenece al dominio $DOMAIN"`,
    `else`,
    `    apt-get install -y realmd sssd sssd-tools 2>/dev/null || yum install -y realmd sssd 2>/dev/null || true`,
    `    realm join -U Administrator "$DOMAIN" && echo "  [OK] Unido a dominio: $DOMAIN" || echo "  [ADVERTENCIA] No se pudo unir al dominio automáticamente"`,
    `fi`,
  ].join("\n");
}

function buildEmailConfigBlock_PS(email: string): string {
  return [
    `$Email = "${email}"`,
    `Write-Host "  Configurando perfil de correo: $Email"`,
    `# Thunderbird / Outlook — configuración via perfil o Group Policy`,
    `# Ajusta este bloque según tu cliente de correo corporativo.`,
    `$outlookProfiles = "HKCU:\\Software\\Microsoft\\Office"`,
    `if (Test-Path $outlookProfiles) {`,
    `    Write-Host "  [INFO] Microsoft Office detectado — configura la cuenta $Email manualmente o vía GPO" -ForegroundColor Cyan`,
    `} else {`,
    `    Write-Host "  [INFO] Asigna la cuenta $Email al cliente de correo instalado" -ForegroundColor Cyan`,
    `}`,
  ].join("\r\n");
}

function buildEmailConfigBlock_Bash(email: string): string {
  return [
    `EMAIL="${email}"`,
    `echo "  Configurando perfil de correo: $EMAIL"`,
    `# Thunderbird autoconfig`,
    `if command -v thunderbird &>/dev/null; then`,
    `    echo "  [INFO] Thunderbird detectado — la cuenta $EMAIL debe configurarse en el primer inicio"`,
    `else`,
    `    echo "  [INFO] Asigna la cuenta $EMAIL al cliente de correo instalado"`,
    `fi`,
  ].join("\n");
}

function buildAgentRegistrationBlock_PS(serverUrl: string, apiKey: string): string {
  return [
    `if ($EnrollmentToken -ne "") {`,
    `    $hostname = $env:COMPUTERNAME`,
    `    $os = (Get-CimInstance Win32_OperatingSystem).Caption`,
    `    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress`,
    `    $mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress`,
    `    $body = @{ token=$EnrollmentToken; hostname=$hostname; operating_system=$os; ip_address=$ip; mac_address=$mac; user_assigned=$env:USERNAME; agent_version="2.0.0" } | ConvertTo-Json`,
    `    $headers = @{ "Content-Type"="application/json"; "apikey"="${apiKey}" }`,
    `    try {`,
    `        $resp = Invoke-RestMethod -Uri "${serverUrl}/register" -Method POST -Body $body -Headers $headers`,
    `        Write-Host "  [OK] Dispositivo registrado: $($resp.device_id)" -ForegroundColor Green`,
    `    } catch {`,
    `        Write-Host "  [ADVERTENCIA] No se pudo registrar el dispositivo: $($_.ErrorDetails.Message)" -ForegroundColor Yellow`,
    `    }`,
    `} else {`,
    `    Write-Host "  [INFO] Sin token de enrolamiento — omitiendo registro" -ForegroundColor Cyan`,
    `}`,
  ].join("\r\n");
}

function buildAgentRegistrationBlock_Bash(serverUrl: string, apiKey: string): string {
  return [
    `if [ -n "$ENROLLMENT_TOKEN" ]; then`,
    `    HOSTNAME_VAL=$(hostname)`,
    `    OS_VAL=$(uname -sr)`,
    `    IP_VAL=$(hostname -I | awk '{print $1}')`,
    `    MAC_VAL=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "unknown")`,
    `    USER_VAL=$USER`,
    `    BODY="{\"token\":\"$ENROLLMENT_TOKEN\",\"hostname\":\"$HOSTNAME_VAL\",\"operating_system\":\"$OS_VAL\",\"ip_address\":\"$IP_VAL\",\"mac_address\":\"$MAC_VAL\",\"user_assigned\":\"$USER_VAL\",\"agent_version\":\"2.0.0\"}"`,
    `    RESPONSE=$(curl -s -X POST "${serverUrl}/register" \\`,
    `        -H "Content-Type: application/json" \\`,
    `        -H "apikey: ${apiKey}" \\`,
    `        -d "$BODY")`,
    `    echo "  [OK] Dispositivo registrado: $RESPONSE"`,
    `else`,
    `    echo "  [INFO] Sin token de enrolamiento — omitiendo registro"`,
    `fi`,
  ].join("\n");
}
