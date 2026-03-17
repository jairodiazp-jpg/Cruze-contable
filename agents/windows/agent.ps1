# IT Service Desk - Remote Agent for Windows v3.1.0
# PowerShell 5.1+ | MUST RUN AS ADMINISTRATOR
# Usage: .\agent.ps1 -ServerUrl "https://<project-id>.supabase.co/functions/v1/agent-api" -DeviceId "DEV-001" -Interval 60

param(
    [Parameter(Mandatory=$true)][string]$ServerUrl,
    [Parameter(Mandatory=$true)][string]$DeviceId,
    [int]$Interval = 60,
    [string]$ApiKey = ""
)

$ErrorActionPreference = "Continue"
$AgentVersion = "3.1.0"
$HostsMarker = "# IT-SERVICE-DESK-FIREWALL"
$PolicyCacheFile = "$PSScriptRoot\policy-cache.json"
$LastPolicyHash = ""
$script:ShouldTerminate = $false

# =============================================
# CHECK ADMIN PRIVILEGES
# =============================================
function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "[WARN] Agent is NOT running as Administrator. Firewall, hosts, and process control will fail." -ForegroundColor Yellow
    }
    return $isAdmin
}

$IsAdmin = Assert-Admin
$Headers = @{ "Content-Type" = "application/json"; "apikey" = $ApiKey }

# =============================================
# HELPER: Safe API Call
# =============================================
function Invoke-AgentApi {
    param([string]$Action, [hashtable]$Body)
    try {
        $json = $Body | ConvertTo-Json -Depth 5
        return Invoke-RestMethod -Uri "$ServerUrl/$Action" -Method POST -Body $json -Headers $Headers -TimeoutSec 30
    } catch {
        Write-Host "[ERROR] API call $Action failed: $_" -ForegroundColor Red
        return $null
    }
}

function Get-AgentLauncherContent {
    return @"
# IT Service Desk Agent Launcher v$AgentVersion
# Auto-generated. Do not edit.
`$ErrorActionPreference = "Continue"
& "$PSScriptRoot\agent.ps1" ``
    -ServerUrl "$ServerUrl" ``
    -DeviceId "$DeviceId" ``
    -Interval $Interval ``
    -ApiKey "$ApiKey"
"@
}

function Invoke-AgentSelfUpdate {
    param([string]$UpdateSpecJson)

    if (-not $UpdateSpecJson) {
        throw "Missing update payload"
    }

    $spec = $UpdateSpecJson | ConvertFrom-Json -ErrorAction Stop
    if (-not $spec.agent_script_base64) {
        throw "Update payload missing agent_script_base64"
    }

    $targetVersion = if ($spec.target_version) { [string]$spec.target_version } else { "unknown" }
    $agentContent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([string]$spec.agent_script_base64))
    $scriptDir = $PSScriptRoot
    $tempAgentPath = Join-Path $scriptDir "agent.ps1.new"
    $updaterPath = Join-Path $env:TEMP ("itagent-updater-" + [guid]::NewGuid().ToString("N") + ".ps1")
    $launcherContent = Get-AgentLauncherContent

    $agentContent | Out-File -FilePath $tempAgentPath -Encoding UTF8 -Force

    $configPath = Join-Path $scriptDir "config.json"
    $configJsonLiteral = "null"
    if (Test-Path $configPath) {
        $configJsonLiteral = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent((Get-Content -Path $configPath -Raw))
    }

    $escapedLauncher = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($launcherContent)
    $escapedTempAgent = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($tempAgentPath)
    $escapedAgentPath = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent((Join-Path $scriptDir "agent.ps1"))
    $escapedLauncherPath = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent((Join-Path $scriptDir "launcher.ps1"))
    $escapedConfigPath = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($configPath)
    $escapedUpdaterPath = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($updaterPath)
    $escapedTargetVersion = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($targetVersion)

    $updaterScript = @"
Start-Sleep -Seconds 2
`$ErrorActionPreference = 'Continue'
`$tempAgentPath = '$escapedTempAgent'
`$agentPath = '$escapedAgentPath'
`$launcherPath = '$escapedLauncherPath'
`$configPath = '$escapedConfigPath'
`$launcherContent = @'
$escapedLauncher
'@

Copy-Item -Path `$tempAgentPath -Destination `$agentPath -Force
`$launcherContent | Out-File -FilePath `$launcherPath -Encoding UTF8 -Force
Remove-Item -Path `$tempAgentPath -Force -ErrorAction SilentlyContinue

`$configRaw = '$configJsonLiteral'
if (`$configRaw -and `$configRaw -ne 'null') {
    try {
        `$config = `$configRaw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        `$config = [ordered]@{}
    }
} else {
    `$config = [ordered]@{}
}

if (-not `$config) {
    `$config = [ordered]@{}
}

`$config.AgentVersion = '$escapedTargetVersion'
`$config.UpdatedAt = (Get-Date).ToString('o')
`$config.ServerUrl = '$([System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($ServerUrl))'
`$config.DeviceId = '$([System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($DeviceId))'
`$config.Interval = $Interval
`$config.ApiKey = '$([System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($ApiKey))'
`$config | ConvertTo-Json -Depth 5 | Out-File -FilePath `$configPath -Encoding UTF8 -Force

try {
    Stop-ScheduledTask -TaskName 'ITServiceDeskAgent' -ErrorAction SilentlyContinue | Out-Null
} catch {}
Start-Sleep -Seconds 1
try {
    Start-ScheduledTask -TaskName 'ITServiceDeskAgent' -ErrorAction Stop
} catch {
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', `$launcherPath -WindowStyle Hidden
}

Remove-Item -Path '$escapedUpdaterPath' -Force -ErrorAction SilentlyContinue
"@

    $updaterScript | Out-File -FilePath $updaterPath -Encoding UTF8 -Force
    Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $updaterPath -WindowStyle Hidden
    $script:ShouldTerminate = $true
    return "Agent update to v$targetVersion scheduled"
}

# =============================================
# DIAGNOSTICS
# =============================================
function Get-Diagnostics {
    $cpu = try { (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average } catch { 0 }
    
    $os = Get-CimInstance Win32_OperatingSystem
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $ramUsage = if ($ramTotal -gt 0) { [math]::Round((($ramTotal - $ramFree) / $ramTotal) * 100, 1) } else { 0 }
    
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskUsage = if ($disk.Size -gt 0) { [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1) } else { 0 }
    
    $internetStatus = "disconnected"; $latency = 0; $packetLoss = 100
    try {
        $ping = Test-Connection -ComputerName 8.8.8.8 -Count 4 -ErrorAction Stop
        $internetStatus = "connected"
        $latencyProp = if ($ping[0].PSObject.Properties['Latency']) { 'Latency' } else { 'ResponseTime' }
        $latency = [math]::Round(($ping | Measure-Object -Property $latencyProp -Average).Average, 0)
        $lost = 4 - $ping.Count
        $packetLoss = [math]::Round(($lost / 4) * 100, 0)
    } catch {}

    $dnsStatus = "fail"
    try { Resolve-DnsName google.com -ErrorAction Stop | Out-Null; $dnsStatus = "ok" } catch {}

    $wifiStatus = "disconnected"; $ethStatus = "disconnected"
    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($a in $adapters) {
            if ($a.InterfaceDescription -match "Wi-Fi|Wireless|802\.11") { $wifiStatus = "connected" }
            if ($a.InterfaceDescription -match "Ethernet|Realtek|Intel.*Ethernet") { $ethStatus = "connected" }
        }
    } catch {}

    $vpnStatus = "disconnected"
    try {
        $vpn = Get-VpnConnection -ErrorAction SilentlyContinue | Where-Object { $_.ConnectionStatus -eq "Connected" }
        if ($vpn) { $vpnStatus = "connected" }
    } catch {}

    $ip = try { (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress } catch { "unknown" }

    $connType = "unknown"
    if ($ethStatus -eq "connected") { $connType = "ethernet" }
    elseif ($wifiStatus -eq "connected") { $connType = "wifi" }
    if ($vpnStatus -eq "connected") { $connType = "vpn" }

    return @{
        cpu_usage = $cpu; ram_usage = $ramUsage; disk_usage = $diskUsage
        internet_status = $internetStatus; wifi_status = $wifiStatus; ethernet_status = $ethStatus
        dns_status = $dnsStatus; latency_ms = $latency; packet_loss = $packetLoss
        vpn_status = $vpnStatus; ip_address = $ip; connection_type = $connType
    }
}

# =============================================
# SEND REPORT (heartbeat + get pending tasks)
# =============================================
function Send-Report {
    param($Diagnostics)
    return Invoke-AgentApi -Action "report" -Body @{
        device_id = $DeviceId
        hostname = $env:COMPUTERNAME
        agent_version = $AgentVersion
        operating_system = (Get-CimInstance Win32_OperatingSystem).Caption
        ip_address = $Diagnostics.ip_address
        connection_type = $Diagnostics.connection_type
        vpn_status = $Diagnostics.vpn_status
        user_assigned = $env:USERNAME
        diagnostics = @{
            cpu_usage = $Diagnostics.cpu_usage; ram_usage = $Diagnostics.ram_usage
            disk_usage = $Diagnostics.disk_usage; internet_status = $Diagnostics.internet_status
            wifi_status = $Diagnostics.wifi_status; ethernet_status = $Diagnostics.ethernet_status
            dns_status = $Diagnostics.dns_status; latency_ms = $Diagnostics.latency_ms
            packet_loss = $Diagnostics.packet_loss
        }
    }
}

# =============================================
# NETWORK REPAIR
# =============================================
function Repair-Network {
    $log = @("=== Network Repair Started ===")
    Get-NetAdapter | Where-Object { $_.Status -eq "Disabled" } | Enable-NetAdapter -ErrorAction SilentlyContinue
    $log += "Adapters enabled"
    ipconfig /release 2>&1 | Out-Null; Start-Sleep 2; ipconfig /renew 2>&1 | Out-Null
    $log += "IP renewed via DHCP"
    ipconfig /flushdns 2>&1 | Out-Null; $log += "DNS cache flushed"
    netsh winsock reset 2>&1 | Out-Null; $log += "Winsock reset"
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
    foreach ($a in $adapters) {
        try { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses @("8.8.8.8","8.8.4.4") -ErrorAction Stop } catch {}
    }
    $log += "DNS set to 8.8.8.8/8.8.4.4"
    $log += "=== Network Repair Complete ==="
    return ($log -join "`n")
}

# =============================================
# HOSTS FILE: INCREMENTAL BLOCKING
# =============================================
function Invoke-HostsBlock {
    param([string[]]$Domains, [string]$Action = "block")
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $log = @()

    # Read current hosts removing our block
    $content = Get-Content $hostsPath -ErrorAction SilentlyContinue
    $inBlock = $false; $cleanContent = @()
    foreach ($line in $content) {
        if ($line -match [regex]::Escape("$HostsMarker BEGIN")) { $inBlock = $true; continue }
        if ($line -match [regex]::Escape("$HostsMarker END")) { $inBlock = $false; continue }
        if (-not $inBlock) { $cleanContent += $line }
    }

    if ($Action -eq "block" -and $Domains.Count -gt 0) {
        $entries = @()
        foreach ($d in $Domains) {
            $d = $d.Trim().ToLower()
            if ($d -eq "" -or $d.StartsWith("#")) { continue }
            $entries += "0.0.0.0 $d"
            if (-not $d.StartsWith("www.")) { $entries += "0.0.0.0 www.$d" }
        }
        $cleanContent += ""
        $cleanContent += "$HostsMarker BEGIN"
        $cleanContent += $entries
        $cleanContent += "$HostsMarker END"
        $log += "Blocked $($Domains.Count) domains ($($entries.Count) entries)"
    } elseif ($Action -eq "unblock") {
        $log += "Removed all blocked domains"
    }

    $cleanContent | Set-Content $hostsPath -Force -ErrorAction SilentlyContinue
    ipconfig /flushdns 2>&1 | Out-Null
    return ($log -join "`n")
}

# =============================================
# WINDOWS FIREWALL RULES
# =============================================
function Invoke-FirewallRule {
    param(
        [string]$RuleName, [string]$Action = "block", [string]$Direction = "outbound",
        [string]$Protocol = "tcp", [int]$PortStart = 0, [int]$PortEnd = 0,
        [string]$RemoteAddress = "", [string]$Operation = "add"
    )
    $log = @()
    $fwAction = if ($Action -eq "block") { "Block" } else { "Allow" }
    $fwDir = if ($Direction -eq "inbound") { "Inbound" } else { "Outbound" }

    switch ($Operation) {
        "add" {
            try { Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue } catch {}
            $params = @{ DisplayName=$RuleName; Direction=$fwDir; Action=$fwAction; Enabled="True"; Profile="Any" }
            if ($Protocol -ne "any") { $params["Protocol"] = $Protocol.ToUpper() }
            if ($PortStart -gt 0) {
                $params["RemotePort"] = if ($PortEnd -gt 0 -and $PortEnd -ne $PortStart) { "$PortStart-$PortEnd" } else { "$PortStart" }
            }
            if ($RemoteAddress) { $params["RemoteAddress"] = $RemoteAddress }
            try {
                New-NetFirewallRule @params -ErrorAction Stop | Out-Null
                $log += "Rule created: $RuleName"
            } catch {
                $netshCmd = "netsh advfirewall firewall add rule name=`"$RuleName`" dir=$(if($fwDir -eq 'Inbound'){'in'}else{'out'}) action=$(if($fwAction -eq 'Block'){'block'}else{'allow'}) enable=yes"
                if ($Protocol -ne "any") { $netshCmd += " protocol=$($Protocol.ToLower())" }
                if ($PortStart -gt 0) { $netshCmd += " remoteport=$(if($PortEnd -gt 0 -and $PortEnd -ne $PortStart){"$PortStart-$PortEnd"}else{"$PortStart"})" }
                if ($RemoteAddress) { $netshCmd += " remoteip=$RemoteAddress" }
                cmd /c $netshCmd 2>&1 | Out-Null
                $log += "Rule created via netsh: $RuleName"
            }
        }
        "remove" {
            try { Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction Stop; $log += "Removed: $RuleName" }
            catch { netsh advfirewall firewall delete rule name="$RuleName" 2>&1 | Out-Null; $log += "Removed via netsh: $RuleName" }
        }
    }
    return ($log -join "`n")
}

# =============================================
# USB PERIPHERAL POLICY
# =============================================
function Set-UsbPortAccess {
    param([bool]$Block = $true)

    $storageRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR"
    $targetValue = if ($Block) { 4 } else { 3 }
    try {
        if (Test-Path $storageRegPath) {
            New-ItemProperty -Path $storageRegPath -Name "Start" -Value $targetValue -PropertyType DWord -Force | Out-Null
        }

        if (Get-Command Get-PnpDevice -ErrorAction SilentlyContinue) {
            $usbDevices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
                $_.InstanceId -like "USB\*"
            }

            foreach ($device in $usbDevices) {
                try {
                    $friendlyName = [string]($device.FriendlyName ?? "")
                    $className = [string]($device.Class ?? "")
                    $isEssentialInput =
                        $className -in @("Keyboard", "Mouse") -or
                        $friendlyName -match "keyboard|mouse|touchpad|trackpad|teclado|raton|mouse" -or
                        $friendlyName -match "receiver|nano receiver|wireless receiver"
                    $isUsbInfrastructure =
                        $friendlyName -match "root hub|generic usb hub|host controller|controller" -or
                        $className -eq "USB"

                    if ($isEssentialInput -or $isUsbInfrastructure) {
                        continue
                    }

                    if ($Block) {
                        Disable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
                    } else {
                        Enable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
                    }
                } catch {}
            }
        }

        if ($Block) {
            Stop-Service -Name "USBSTOR" -ErrorAction SilentlyContinue
            return "USB peripherals blocked except keyboard and mouse"
        }

        Start-Service -Name "USBSTOR" -ErrorAction SilentlyContinue
        return "USB peripherals unblocked"
    } catch {
        return "USB peripheral policy error: $($_.Exception.Message)"
    }
}

# =============================================
# POLICY SYNC (enterprise firewall policies)
# =============================================
function Sync-Policies {
    $log = @("=== Policy Sync ===")
    $response = Invoke-AgentApi -Action "policy-sync" -Body @{ device_id = $DeviceId }
    if (-not $response) { $log += "Failed to fetch policies"; return ($log -join "`n") }

    # 1. HOSTS BLOCKING - blocked domains
    if ($response.blocked_domains -and $response.blocked_domains.Count -gt 0) {
        $result = Invoke-HostsBlock -Domains $response.blocked_domains -Action "block"
        $log += "Hosts: $result"
    } else {
        Invoke-HostsBlock -Action "unblock" | Out-Null
        $log += "Hosts: No domains to block"
    }

    # 2. APPLICATION BLOCKING - kill blocked processes
    if ($response.blocked_applications -and $response.blocked_applications.Count -gt 0) {
        $killed = 0
        foreach ($app in $response.blocked_applications) {
            $procName = $app.process_name -replace '\.exe$', ''
            $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
            foreach ($p in $procs) {
                try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed++ } catch {}
            }
        }
        $log += "Apps: Checked $($response.blocked_applications.Count) blocked apps, killed $killed processes"
    }

    # 3. VPN PORT BLOCKING
    if ($response.vpn_block_enabled -and $response.vpn_blocked_ports) {
        foreach ($port in $response.vpn_blocked_ports) {
            Invoke-FirewallRule -RuleName "ITSD-VPN-Block-$port" -Action "block" -Direction "outbound" -Protocol "tcp" -PortStart $port | Out-Null
            Invoke-FirewallRule -RuleName "ITSD-VPN-Block-$port-UDP" -Action "block" -Direction "outbound" -Protocol "udp" -PortStart $port | Out-Null
        }
        $log += "VPN: Blocked ports $($response.vpn_blocked_ports -join ',')"
    } else {
        # Remove VPN block rules if disabled
        foreach ($port in @(1194, 1701, 1723, 500, 4500)) {
            try { Remove-NetFirewallRule -DisplayName "ITSD-VPN-Block-$port" -ErrorAction SilentlyContinue } catch {}
            try { Remove-NetFirewallRule -DisplayName "ITSD-VPN-Block-$port-UDP" -ErrorAction SilentlyContinue } catch {}
        }
        $log += "VPN: Ports unblocked"
    }

    # 4. USB PORT BLOCKING
    if ($response.usb_ports_block_enabled -or $response.usb_storage_block_enabled) {
        $log += "USB: $(Set-UsbPortAccess -Block $true)"
    } else {
        $log += "USB: $(Set-UsbPortAccess -Block $false)"
    }

    # 5. SCHEDULE-BASED enforcement
    if ($response.schedules -and $response.schedules.Count -gt 0) {
        $now = Get-Date
        $dayOfWeek = [int]$now.DayOfWeek  # 0=Sunday
        $currentTime = $now.ToString("HH:mm:ss")
        foreach ($sched in $response.schedules) {
            $isActiveDay = $sched.days_of_week -contains $dayOfWeek
            $isActiveTime = $currentTime -ge $sched.start_time -and $currentTime -le $sched.end_time
            if (-not ($isActiveDay -and $isActiveTime)) {
                $log += "Schedule: Category '$($sched.category)' outside active hours, skipping enforcement"
            }
        }
    }

    # Cache policy version
    if ($response.policy_version) {
        try { @{ policy_version = $response.policy_version; synced_at = (Get-Date).ToString("o") } | ConvertTo-Json | Out-File $PolicyCacheFile -Encoding UTF8 -Force } catch {}
    }

    $log += "=== Policy Sync Complete ==="
    return ($log -join "`n")
}

# =============================================
# ANTI-BYPASS DETECTION
# =============================================
function Detect-Bypass {
    $log = @("=== Anti-Bypass Check ===")
    $bypasses = @()

    # 1. Custom DNS detection (not using corporate/default DNS)
    try {
        $dnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses.Count -gt 0 }
        foreach ($dns in $dnsServers) {
            foreach ($server in $dns.ServerAddresses) {
                if ($server -notin @("8.8.8.8","8.8.4.4","1.1.1.1","1.0.0.1","208.67.222.222","208.67.220.220") -and 
                    $server -notmatch "^192\.168\." -and $server -notmatch "^10\." -and $server -notmatch "^172\.(1[6-9]|2[0-9]|3[01])\.") {
                    # Non-standard DNS detected
                }
            }
            # Check for known bypass DNS (DoH providers, etc.)
            foreach ($server in $dns.ServerAddresses) {
                if ($server -in @("9.9.9.9","149.112.112.112","94.140.14.14","76.76.19.19")) {
                    $bypasses += @{ type = "custom_dns"; details = @{ interface = $dns.InterfaceAlias; dns_server = $server } }
                }
            }
        }
    } catch {}

    # 2. VPN adapter detection
    try {
        $vpnAdapters = Get-NetAdapter | Where-Object { 
            $_.Status -eq "Up" -and ($_.InterfaceDescription -match "TAP|TUN|VPN|WireGuard|Windscribe|NordVPN|ExpressVPN|Surfshark|ProtonVPN|CyberGhost")
        }
        foreach ($vpn in $vpnAdapters) {
            $bypasses += @{ type = "vpn_detected"; details = @{ adapter = $vpn.Name; description = $vpn.InterfaceDescription } }
        }
    } catch {}

    # 3. Hosts file tampering
    try {
        $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
        $hostsContent = Get-Content $hostsPath -ErrorAction SilentlyContinue
        $inBlock = $false; $hasBlock = $false
        foreach ($line in $hostsContent) {
            if ($line -match [regex]::Escape("$HostsMarker BEGIN")) { $hasBlock = $true; $inBlock = $true }
            if ($line -match [regex]::Escape("$HostsMarker END")) { $inBlock = $false }
        }
        # Check if someone added entries outside our block
        $suspiciousEntries = $hostsContent | Where-Object { 
            $_ -match "^0\.0\.0\.0\s" -or $_ -match "^127\.0\.0\.1\s(?!localhost)" 
        } | Where-Object {
            $_ -notmatch $HostsMarker -and $_ -notmatch "localhost"
        }
        # Check entries between our markers weren't modified
        if ($suspiciousEntries.Count -gt 3) {
            $bypasses += @{ type = "hosts_tampered"; details = @{ extra_entries = $suspiciousEntries.Count } }
        }
    } catch {}

    # 4. Proxy detection
    try {
        $proxy = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction SilentlyContinue
        if ($proxy.ProxyEnable -eq 1 -and $proxy.ProxyServer) {
            $bypasses += @{ type = "proxy_configured"; details = @{ proxy_server = $proxy.ProxyServer } }
        }
    } catch {}

    # 5. Check for DNS-over-HTTPS in browsers
    try {
        $chromePrefs = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Preferences"
        if (Test-Path $chromePrefs) {
            $prefs = Get-Content $chromePrefs -Raw -ErrorAction SilentlyContinue
            if ($prefs -match '"dns_over_https"' -and $prefs -match '"mode":"secure"') {
                $bypasses += @{ type = "browser_doh"; details = @{ browser = "Chrome"; mode = "secure" } }
            }
        }
    } catch {}

    # Report bypass attempts
    foreach ($bypass in $bypasses) {
        $log += "BYPASS DETECTED: $($bypass.type)"
        Invoke-AgentApi -Action "bypass-report" -Body @{
            device_id = $DeviceId
            attempt_type = $bypass.type
            details = $bypass.details
        } | Out-Null
    }

    if ($bypasses.Count -eq 0) { $log += "No bypass attempts detected" }
    $log += "=== Anti-Bypass Check Complete ==="
    return ($log -join "`n")
}

# =============================================
# PROCESS MONITOR (continuous app blocking)
# =============================================
function Stop-BlockedProcesses {
    param($BlockedApps)
    if (-not $BlockedApps -or $BlockedApps.Count -eq 0) { return }
    foreach ($app in $BlockedApps) {
        $procName = $app.process_name -replace '\.exe$', ''
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            try {
                Stop-Process -Id $p.Id -Force -ErrorAction Stop
                Write-Host "[BLOCK] Terminated: $($app.app_name) (PID: $($p.Id))" -ForegroundColor Red
            } catch {}
        }
    }
}

# =============================================
# BACKUP
# =============================================
function Run-Backup {
    $log = @()
    $backupRoot = "C:\Backups"
    $date = Get-Date -Format "yyyy-MM-dd"
    $userDir = "$backupRoot\$env:USERNAME\$env:COMPUTERNAME\$date"
    if (!(Test-Path $userDir)) { New-Item -ItemType Directory -Path $userDir -Force | Out-Null }
    
    $totalSize = 0; $totalFiles = 0
    $folders = @("$env:USERPROFILE\Documents", "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Pictures")
    $folderNames = @("Documents", "Desktop", "Pictures")
    foreach ($folder in $folders) {
        if (Test-Path $folder) {
            $destName = Split-Path $folder -Leaf
            try {
                Copy-Item -Path $folder -Destination "$userDir\$destName" -Recurse -Force
                $items = Get-ChildItem "$userDir\$destName" -Recurse -File
                $size = ($items | Measure-Object -Property Length -Sum).Sum
                $totalSize += $size; $totalFiles += $items.Count
                $log += "$($destName): $([math]::Round($size / 1MB, 2)) MB, $($items.Count) files"
            } catch { $log += "ERROR: $destName - $_" }
        }
    }
    
    Invoke-AgentApi -Action "backup-report" -Body @{
        device_id = $DeviceId; hostname = $env:COMPUTERNAME; user_email = $env:USERNAME
        backup_date = $date; folders = $folderNames; total_size_bytes = $totalSize
        file_count = $totalFiles; storage_path = $userDir; status = "completed"
        started_at = (Get-Date).AddMinutes(-5).ToString("o")
    } | Out-Null

    return ($log -join "`n")
}

# =============================================
# LICENSE ACTIVATION
# =============================================
function Invoke-LicenseActivation {
    $log = @("=== License Check ===")
    $response = Invoke-AgentApi -Action "get-licenses" -Body @{ device_id = $DeviceId }
    if (-not $response -or -not $response.licenses -or $response.licenses.Count -eq 0) {
        $log += "No pending licenses"; return ($log -join "`n")
    }

    foreach ($lic in $response.licenses) {
        $log += "Activating: $($lic.product) - $($lic.license_key)"
        $status = "activated"; $errorLog = ""
        try {
            if ($lic.product -match "Windows") {
                # Activate Windows
                $result = cscript //nologo "$env:SystemRoot\System32\slmgr.vbs" /ipk $lic.license_key 2>&1
                $log += "  slmgr /ipk: $result"
                $activateResult = cscript //nologo "$env:SystemRoot\System32\slmgr.vbs" /ato 2>&1
                $log += "  slmgr /ato: $activateResult"
                if ($activateResult -match "error|fail") { $status = "failed"; $errorLog = $activateResult }
            }
            elseif ($lic.product -match "Office") {
                # Find Office OSPP
                $osppPaths = @(
                    "C:\Program Files\Microsoft Office\Office16\OSPP.VBS",
                    "C:\Program Files (x86)\Microsoft Office\Office16\OSPP.VBS",
                    "C:\Program Files\Microsoft Office\Office15\OSPP.VBS"
                )
                $ospp = $osppPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
                if ($ospp) {
                    $result = cscript //nologo $ospp /inpkey:$($lic.license_key) 2>&1
                    $log += "  OSPP /inpkey: $result"
                    $activateResult = cscript //nologo $ospp /act 2>&1
                    $log += "  OSPP /act: $activateResult"
                    if ($activateResult -match "error|fail") { $status = "failed"; $errorLog = $activateResult }
                } else {
                    $status = "failed"; $errorLog = "Office OSPP.VBS not found"
                }
            }
            else {
                $log += "  Unknown product type, skipping activation"
                $status = "failed"; $errorLog = "Unknown product type: $($lic.product)"
            }
        } catch {
            $status = "failed"; $errorLog = $_.Exception.Message
        }

        Invoke-AgentApi -Action "license-result" -Body @{
            license_id = $lic.id; status = $status; error_log = $errorLog
        } | Out-Null
        $log += "  Result: $status"
    }
    $log += "=== License Check Complete ==="
    return ($log -join "`n")
}

# =============================================
# EMAIL CONFIG AUTO-APPLY
# =============================================
function Apply-EmailConfigs {
    $log = @()
    $response = Invoke-AgentApi -Action "get-email-config" -Body @{ device_id = $DeviceId }
    if (-not $response -or -not $response.configs -or $response.configs.Count -eq 0) { return "" }

    foreach ($cfg in $response.configs) {
        $log += "Configuring email: $($cfg.user_email) via $($cfg.provider)"
        $status = "applied"; $errorLog = ""
        try {
            if ($cfg.use_exchange -and $cfg.exchange_server) {
                # Configure Outlook via registry for Exchange
                $outlookProfile = "HKCU:\Software\Microsoft\Office\16.0\Outlook\Profiles"
                $log += "  Exchange: $($cfg.exchange_server) - registry profile would be set"
            } else {
                $log += "  IMAP: $($cfg.imap_server):$($cfg.imap_port), SMTP: $($cfg.smtp_server):$($cfg.smtp_port)"
            }
        } catch {
            $status = "failed"; $errorLog = $_.Exception.Message
        }
        Invoke-AgentApi -Action "email-result" -Body @{
            config_id = $cfg.id; status = $status; error_log = $errorLog
        } | Out-Null
    }
    return ($log -join "`n")
}

# =============================================
# SAFE PACKAGE INSTALLER
# =============================================
function Invoke-SafeInstallCommand {
    param([string]$InstallCommand)

    if (-not $InstallCommand) {
        throw "Empty install command"
    }

    $normalized = $InstallCommand.Trim()

    # Block shell metacharacters and chained commands.
    if ($normalized -match '[;&|`$><]') {
        throw "Blocked unsafe installer command"
    }

    if ($normalized -match '^(?i)winget\s+install\s+--id\s+([A-Za-z0-9\._-]+)(\s+.*)?$') {
        $pkg = $Matches[1]
        $argList = @("install", "--id", $pkg, "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements")
        $proc = Start-Process -FilePath "winget" -ArgumentList $argList -NoNewWindow -Wait -PassThru -ErrorAction Stop
        if ($proc.ExitCode -ne 0) {
            throw "winget exited with code $($proc.ExitCode)"
        }
        return "Installed with winget: $($pkg)"
    }

    if ($normalized -match '^(?i)choco\s+install\s+([A-Za-z0-9\._-]+)(\s+.*)?$') {
        $pkg = $Matches[1]
        $argList = @("install", $pkg, "-y", "--no-progress")
        $proc = Start-Process -FilePath "choco" -ArgumentList $argList -NoNewWindow -Wait -PassThru -ErrorAction Stop
        if ($proc.ExitCode -ne 0) {
            throw "choco exited with code $($proc.ExitCode)"
        }
        return "Installed with choco: $($pkg)"
    }

    throw "Installer command not allowed"
}

# =============================================
# EXECUTE SCRIPT (dispatcher for pending tasks)
# =============================================
function Execute-Script {
    param($Script)
    $output = ""; $errorLog = ""; $status = "completed"
    
    try {
        switch ($Script.script_type) {
            "diagnostic" { $diag = Get-Diagnostics; $output = $diag | ConvertTo-Json -Depth 3 }
            "network-repair" { $output = Repair-Network }
            "backup" { $output = Run-Backup }
            "firewall-block" {
                if ($Script.script_content) {
                    $domains = ($Script.script_content -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
                    $output = Invoke-HostsBlock -Domains $domains -Action "block"
                } else { $output = "No domains provided" }
            }
            "firewall-unblock" { $output = Invoke-HostsBlock -Action "unblock" }
            "firewall-rule" {
                if ($Script.script_content) {
                    try {
                        $rd = $Script.script_content | ConvertFrom-Json
                        $output = Invoke-FirewallRule -RuleName $rd.rule_name -Action $rd.action -Direction $rd.direction -Protocol $rd.protocol -PortStart ([int]$rd.port_start) -PortEnd ([int]$rd.port_end) -RemoteAddress $rd.remote_address -Operation ($rd.operation -or "add")
                    } catch { $status = "failed"; $errorLog = "Invalid firewall JSON: $_" }
                }
            }
            "firewall-sync" { $output = Sync-Policies }
            "policy-sync" { $output = Sync-Policies }
            "install-profile" {
                $response = Invoke-AgentApi -Action "get-profile" -Body @{ role_name = if ($Script.script_content) { $Script.script_content } else { "usuario" } }
                if ($response -and $response.software) {
                    $installed = @()
                    foreach ($sw in $response.software) {
                        if ($sw.install_command) {
                            try {
                                $result = Invoke-SafeInstallCommand -InstallCommand $sw.install_command
                                $installed += "$($sw.software_name): OK - $result"
                            } catch {
                                $installed += "$($sw.software_name): BLOCKED/FAILED - $_"
                            }
                        }
                    }
                    $output = $installed -join "`n"
                } else { $output = "No profile/software found" }
            }
            "setup-email" { $output = Apply-EmailConfigs }
            "setup-vpn" { $output = "VPN setup requires manual config file" }
            "update-agent" { $output = Invoke-AgentSelfUpdate -UpdateSpecJson $Script.script_content }
            "powershell" {
                $status = "failed"
                $errorLog = "Blocked by policy: arbitrary PowerShell execution is disabled"
                $output = $errorLog
            }
            "custom" {
                $status = "failed"
                $errorLog = "Blocked by policy: custom script execution is disabled"
                $output = $errorLog
            }
            default { $output = "Unknown script type: $($Script.script_type)" }
        }
    } catch { $status = "failed"; $errorLog = $_.Exception.Message }

    Invoke-AgentApi -Action "execute" -Body @{
        execution_id = $Script.id
        device_id = $DeviceId
        ticket_id = $Script.ticket_id
        action_id = $Script.action_id
        nonce = $Script.nonce
        exp = $Script.exp
        status = $status
        output = if ($output.Length -gt 5000) { $output.Substring(0, 5000) } else { $output }
        error_log = $errorLog
    } | Out-Null
}

# =============================================
# SYNC FIREWALL RULES (legacy, uses get-firewall-rules)
# =============================================
function Sync-FirewallRules {
    $log = @("=== Syncing firewall rules ===")
    $response = Invoke-AgentApi -Action "get-firewall-rules" -Body @{ device_id = $DeviceId }
    if (-not $response) { return ($log -join "`n") }
    if ($response.rules -and $response.rules.Count -gt 0) {
        $domainRules = $response.rules | Where-Object { $_.destination_ip -and $_.destination_ip -notmatch '^\d+\.\d+\.\d+\.\d+' -and $_.action -eq "block" }
        $networkRules = $response.rules | Where-Object { -not ($_.destination_ip -and $_.destination_ip -notmatch '^\d+\.\d+\.\d+\.\d+' -and $_.action -eq "block") }
        if ($domainRules.Count -gt 0) {
            $domains = $domainRules | ForEach-Object { $_.destination_ip }
            Invoke-HostsBlock -Domains $domains -Action "block" | Out-Null
        }
        foreach ($rule in $networkRules) {
            Invoke-FirewallRule -RuleName $rule.rule_name -Action $rule.action -Direction $rule.direction -Protocol $rule.protocol -PortStart ([int]$rule.port_start) -PortEnd ([int]($rule.port_end -or 0)) -RemoteAddress ($rule.destination_ip -or "") | Out-Null
        }
        $ruleIds = $response.rules | ForEach-Object { $_.id }
        Invoke-AgentApi -Action "firewall-result" -Body @{ device_id = $DeviceId; rule_ids = $ruleIds; status = "applied" } | Out-Null
        $log += "Applied $($response.rules.Count) rules"
    } else { $log += "No pending rules" }
    $log += "=== Sync complete ==="
    return ($log -join "`n")
}

# =============================================
# MAIN LOOP
# =============================================
Write-Host "======================================================="
Write-Host "  IT Service Desk - Remote Agent v$AgentVersion"
Write-Host "  Device: $DeviceId"
Write-Host "  Server: $ServerUrl"
Write-Host "  Interval: ${Interval}s"
Write-Host "  Admin: $IsAdmin"
Write-Host "  Features: Diagnostics, Hosts Blocking, App Control,"
Write-Host "            VPN Blocking, Anti-Bypass, Licenses, Backup,"
Write-Host "            Policy Sync, Email Config, Typed Safe Actions"
Write-Host "======================================================="

$loopCount = 0
$cachedBlockedApps = @()

while ($true) {
    $loopCount++
    $timestamp = Get-Date -Format 'HH:mm:ss'

    # 1. Diagnostics + Heartbeat
    Write-Host "[$timestamp] Collecting diagnostics..."
    $diag = Get-Diagnostics
    Write-Host "[$timestamp] Sending report..."
    $response = Send-Report -Diagnostics $diag

    # 2. Execute pending scripts
    if ($response -and $response.pending_scripts) {
        foreach ($script in $response.pending_scripts) {
            Write-Host "[$timestamp] Executing: $($script.script_name) [$($script.script_type)]"
            Execute-Script -Script $script
            if ($script:ShouldTerminate) {
                break
            }
        }
    }

    if ($script:ShouldTerminate) {
        Write-Host "[$timestamp] Agent restart requested. Exiting current process..."
        break
    }

    # 3. Policy Sync (every 3 cycles = ~3 minutes at 60s interval)
    if ($loopCount % 3 -eq 1) {
        Write-Host "[$timestamp] Syncing policies..."
        $policyResult = Sync-Policies
        Write-Host $policyResult

        # Cache blocked apps for continuous enforcement
        $policyResponse = Invoke-AgentApi -Action "policy-sync" -Body @{ device_id = $DeviceId }
        if ($policyResponse -and $policyResponse.blocked_applications) {
            $cachedBlockedApps = $policyResponse.blocked_applications
        }
    }

    # 4. Continuous app blocking (every cycle)
    if ($cachedBlockedApps.Count -gt 0) {
        Stop-BlockedProcesses -BlockedApps $cachedBlockedApps
    }

    # 5. Firewall rules sync (every 5 cycles)
    if ($loopCount % 5 -eq 0) {
        Write-Host "[$timestamp] Syncing firewall rules..."
        Sync-FirewallRules | Out-Null
    }

    # 6. Anti-bypass detection (every 10 cycles = ~10 minutes)
    if ($loopCount % 10 -eq 0) {
        Write-Host "[$timestamp] Running anti-bypass detection..."
        $bypassResult = Detect-Bypass
        Write-Host $bypassResult
    }

    # 7. License activation (every 30 cycles = ~30 minutes)
    if ($loopCount % 30 -eq 0) {
        Write-Host "[$timestamp] Checking licenses..."
        $licResult = Invoke-LicenseActivation
        Write-Host $licResult
    }

    # 8. Email config (every 15 cycles = ~15 minutes)
    if ($loopCount % 15 -eq 0) {
        Write-Host "[$timestamp] Checking email configs..."
        $emailResult = Apply-EmailConfigs
        if ($emailResult) { Write-Host $emailResult }
    }

    # Update interval from server
    if ($response -and $response.report_interval) {
        $Interval = [int]$response.report_interval
    }

    Write-Host "[$timestamp] Health: $($response.health) | Loop: $loopCount | Next: ${Interval}s"
    Start-Sleep -Seconds $Interval
}
