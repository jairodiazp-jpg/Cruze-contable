# IT Service Desk - Rust Agent Installer for Windows v3.1.0
# Usage: .\agent-rust-installer.ps1 -Token "YOUR_ENROLLMENT_TOKEN"

param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$ServerUrl = "https://dyhazspvhsymfwizyaol.supabase.co/functions/v1/agent-api",
    [string]$ApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aGF6c3B2aHN5bWZ3aXp5YW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzc3ODcsImV4cCI6MjA4OTExMzc4N30.l0Nq9ftTZznG8fN3En5PQt_thBskQCbmVxC7Ke8NSSY",
    [string]$AgentSharedKey = "",
    [int]$Interval = 60,
    [string]$InstallPath = "C:\ITAgentRust",
    [switch]$KeepLegacyAgentEnabled
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Run installer as Administrator" -ForegroundColor Red
    exit 1
}

if (!(Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] cargo not found. Install Rust first: https://rustup.rs" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

if (-not $KeepLegacyAgentEnabled) {
    $disableLegacyScript = Join-Path $PSScriptRoot "disable-legacy-agents.ps1"
    if (Test-Path $disableLegacyScript) {
        Write-Host "[INFO] Disabling legacy scheduled tasks before Rust install..." -ForegroundColor Yellow
        & $disableLegacyScript
    }
}

$agentRoot = Join-Path $PSScriptRoot "..\rust-agent"
$agentRoot = (Resolve-Path $agentRoot).Path

Push-Location $agentRoot
cargo build --release
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "[ERROR] Rust build failed" -ForegroundColor Red
    exit 1
}
Pop-Location

$binSource = Join-Path $agentRoot "target\release\itagent-rs.exe"
if (!(Test-Path $binSource)) {
    Write-Host "[ERROR] Compiled binary not found: $binSource" -ForegroundColor Red
    exit 1
}

Copy-Item $binSource (Join-Path $InstallPath "itagent-rs.exe") -Force

$enrollArgs = @(
    "--server", $ServerUrl,
    "--api-key", $ApiKey
)
if ($AgentSharedKey) { $enrollArgs += @("--agent-shared-key", $AgentSharedKey) }
$enrollArgs += @("enroll", "--token", $Token)

$deviceId = (& "$InstallPath\itagent-rs.exe" @enrollArgs | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $deviceId) {
    Write-Host "[ERROR] Enrollment failed" -ForegroundColor Red
    exit 1
}

$sharedArg = ""
if ($AgentSharedKey) {
        $sharedArg = "--agent-shared-key `"$AgentSharedKey`""
}

$launcher = @"
`$ErrorActionPreference = "Continue"
& "$InstallPath\itagent-rs.exe" --server "$ServerUrl" --api-key "$ApiKey" $sharedArg --device-id "$deviceId" --interval $Interval
"@
$launcher | Out-File -FilePath "$InstallPath\launcher-rust.ps1" -Encoding UTF8 -Force

$taskName = "ITServiceDeskAgentRust"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallPath\launcher-rust.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "IT Service Desk Rust Agent v3.1.0" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

@{
    DeviceId = $deviceId
    ServerUrl = $ServerUrl
    ApiKey = $ApiKey
    AgentSharedKey = $AgentSharedKey
    Interval = $Interval
    AgentVersion = "3.1.0-rust"
    InstalledAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Out-File -FilePath "$InstallPath\config-rust.json" -Encoding UTF8 -Force

Write-Host "[OK] Rust agent installed" -ForegroundColor Green
Write-Host "Device ID: $deviceId"
Write-Host "Task: $taskName"
