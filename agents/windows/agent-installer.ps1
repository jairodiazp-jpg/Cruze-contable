# ============================================================
# IT Service Desk - Agent Installer for Windows v3.1.0
# Usage: .\agent-installer.ps1 -Token "YOUR_ENROLLMENT_TOKEN"
# Requires: PowerShell 5.1+, Run as Administrator
# ============================================================

param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$ServerUrl = "https://dyhazspvhsymfwizyaol.supabase.co/functions/v1/agent-api",
    [string]$ApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aGF6c3B2aHN5bWZ3aXp5YW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzc3ODcsImV4cCI6MjA4OTExMzc4N30.l0Nq9ftTZznG8fN3En5PQt_thBskQCbmVxC7Ke8NSSY",
    [int]$Interval = 60,
    [string]$InstallPath = "C:\ITAgent"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  IT Service Desk - Agent Installer v3.1.0" -ForegroundColor Cyan
Write-Host "  Full Platform: Firewall, Hosts, Apps, VPN," -ForegroundColor Cyan
Write-Host "  Anti-Bypass, Licenses, Backup, Email, Scripts" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This installer must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# 2. Create install directory
Write-Host "[1/7] Creating install directory: $InstallPath" -ForegroundColor Yellow
if (!(Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# 3. Set execution policy
Write-Host "[2/7] Setting execution policy to RemoteSigned..." -ForegroundColor Yellow
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force -ErrorAction SilentlyContinue

# 4. Register device with enrollment token
Write-Host "[3/7] Registering device with enrollment token..." -ForegroundColor Yellow

$hostname = $env:COMPUTERNAME
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress
$mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress
$serial = (Get-CimInstance Win32_BIOS).SerialNumber

$registerBody = @{
    token = $Token
    hostname = $hostname
    operating_system = $os
    ip_address = $ip
    mac_address = $mac
    user_assigned = $env:USERNAME
    serial_number = $serial
    agent_version = "3.1.0"
} | ConvertTo-Json

$headers = @{ "Content-Type" = "application/json"; "apikey" = $ApiKey }

try {
    $response = Invoke-RestMethod -Uri "$ServerUrl/register" -Method POST -Body $registerBody -Headers $headers
} catch {
    $errMsg = $_.ErrorDetails.Message | ConvertFrom-Json | Select-Object -ExpandProperty error
    Write-Host "[ERROR] Registration failed: $errMsg" -ForegroundColor Red
    exit 1
}

if ($response.status -ne "enrolled") {
    Write-Host "[ERROR] Unexpected response: $($response | ConvertTo-Json)" -ForegroundColor Red
    exit 1
}

$DeviceId = $response.device_id
Write-Host "[OK] Device registered as: $DeviceId" -ForegroundColor Green

# 5. Copy agent script
Write-Host "[4/7] Installing agent v3.1.0 with full capabilities..." -ForegroundColor Yellow

$agentSourcePath = Join-Path $PSScriptRoot "agent.ps1"
if (Test-Path $agentSourcePath) {
    Copy-Item $agentSourcePath "$InstallPath\agent.ps1" -Force
    Write-Host "[OK] Copied agent.ps1 from installer directory" -ForegroundColor Green
} else {
    Write-Host "[ERROR] agent.ps1 not found alongside installer. Place both files in the same directory." -ForegroundColor Red
    exit 1
}

# Create launcher
$launcherScript = @"
# IT Service Desk Agent Launcher v3.1.0
# Auto-generated. Do not edit.
`$ErrorActionPreference = "Continue"
& "$InstallPath\agent.ps1" ``
    -ServerUrl "$ServerUrl" ``
    -DeviceId "$DeviceId" ``
    -Interval $Interval ``
    -ApiKey "$ApiKey"
"@
$launcherScript | Out-File -FilePath "$InstallPath\launcher.ps1" -Encoding UTF8 -Force

# Save config
@{
    DeviceId = $DeviceId
    ServerUrl = $ServerUrl
    ApiKey = $ApiKey
    Interval = $Interval
    InstalledAt = (Get-Date).ToString("o")
    AgentVersion = "3.1.0"
    Features = @("diagnostics","hosts-blocking","app-control","vpn-blocking","anti-bypass","licenses","backup","email-config","policy-sync","typed-actions-only")
} | ConvertTo-Json | Out-File -FilePath "$InstallPath\config.json" -Encoding UTF8 -Force

# 6. Configure Windows Firewall
Write-Host "[5/7] Configuring Windows Firewall permissions..." -ForegroundColor Yellow

try {
    Remove-NetFirewallRule -DisplayName "IT Agent - PowerShell Outbound" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "IT Agent - PowerShell Outbound" `
        -Direction Outbound -Action Allow -Program "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Protocol TCP -Enabled True -Profile Any | Out-Null
    Write-Host "  [OK] PowerShell outbound rule created" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Could not create firewall rule: $_" -ForegroundColor Yellow
}

try {
    $fwService = Get-Service -Name "MpsSvc" -ErrorAction SilentlyContinue
    if ($fwService.Status -ne "Running") { Start-Service -Name "MpsSvc" -ErrorAction SilentlyContinue }
} catch {}

# 7. Create backup directory
Write-Host "[6/7] Creating backup directory..." -ForegroundColor Yellow
$backupDir = "C:\Backups"
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

# 8. Install as Scheduled Task (SYSTEM, highest privileges)
Write-Host "[7/7] Installing as Windows service (Scheduled Task)..." -ForegroundColor Yellow

$taskName = "ITServiceDeskAgent"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallPath\launcher.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "IT Service Desk Remote Agent v3.1.0 - Full Platform Integration" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Device ID:       $DeviceId" -ForegroundColor White
Write-Host "  Install Path:    $InstallPath" -ForegroundColor White
Write-Host "  Report Interval: ${Interval}s" -ForegroundColor White
Write-Host "  Task Name:       $taskName" -ForegroundColor White
Write-Host "  Run As:          SYSTEM (Highest Privileges)" -ForegroundColor White
Write-Host ""
Write-Host "  Capabilities:" -ForegroundColor Cyan
Write-Host "    - System diagnostics (CPU, RAM, Disk, Network)" -ForegroundColor Gray
Write-Host "    - Domain blocking (hosts file, incremental)" -ForegroundColor Gray
Write-Host "    - Application control (process termination)" -ForegroundColor Gray
Write-Host "    - VPN port blocking (1194, 1701, 1723, 500, 4500)" -ForegroundColor Gray
Write-Host "    - Anti-bypass detection (DNS, VPN, proxy, hosts)" -ForegroundColor Gray
Write-Host "    - Windows/Office license activation" -ForegroundColor Gray
Write-Host "    - Backup (Documents, Desktop, Pictures)" -ForegroundColor Gray
Write-Host "    - Email auto-configuration" -ForegroundColor Gray
Write-Host "    - Policy sync from server" -ForegroundColor Gray
Write-Host "    - Typed safe actions only (no arbitrary scripts)" -ForegroundColor Gray
Write-Host "    - Network repair & diagnostics" -ForegroundColor Gray
Write-Host ""
Write-Host "  The agent is now running and will start" -ForegroundColor Gray
Write-Host "  automatically with Windows." -ForegroundColor Gray
Write-Host ""
