# IT Service Desk - Disable Legacy Agents (Windows)
# Usage: .\disable-legacy-agents.ps1 [-DisableRustAgent]

param(
    [switch]$DisableRustAgent
)

$ErrorActionPreference = "Continue"

$tasksToDisable = @("ITServiceDeskAgent")
if ($DisableRustAgent) {
    $tasksToDisable += "ITServiceDeskAgentRust"
}

foreach ($taskName in $tasksToDisable) {
    try {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    try {
        Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
        Write-Host "[OK] Disabled task: $taskName" -ForegroundColor Green
    } catch {
        Write-Host "[INFO] Task not found or already disabled: $taskName" -ForegroundColor Yellow
    }
}

Write-Host "[DONE] Legacy agent disable step completed." -ForegroundColor Cyan
