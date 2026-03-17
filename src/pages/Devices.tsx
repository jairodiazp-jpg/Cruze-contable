import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Filter, Laptop, Wifi, WifiOff, Activity, RefreshCw, Key, Download, Copy, Check, Clock, Shield, Terminal, Ban, Settings2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isScriptExecutionPolicyError, queueScriptExecutions } from "@/lib/scriptExecutions";
import { copyTextToClipboard } from "@/lib/utils";
import windowsAgentScript from "../../agents/windows/agent.ps1?raw";
import linuxAgentScript from "../../agents/linux/agent.sh?raw";

const healthColors: Record<string, string> = {
  healthy: "status-available",
  warning: "status-maintenance",
  critical: "priority-critical",
  offline: "status-retired",
};

const healthLabels: Record<string, string> = {
  healthy: "Saludable",
  warning: "Advertencia",
  critical: "Crítico",
  offline: "Desconectado",
};

interface Device {
  id: string;
  device_id: string;
  hostname: string;
  serial_number: string | null;
  user_assigned: string | null;
  department: string | null;
  role_type: string | null;
  operating_system: string | null;
  ip_address: string | null;
  connection_type: string | null;
  vpn_status: string | null;
  last_seen: string | null;
  health_status: string | null;
  agent_installed: boolean | null;
  agent_version: string | null;
  report_interval: number;
  created_at: string;
}

interface EnrollmentToken {
  id: string;
  token: string;
  expires_at: string;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

const parseAgentVersion = (script: string, pattern: RegExp) => pattern.exec(script)?.[1] ?? "3.1.0";
const WINDOWS_AGENT_VERSION = parseAgentVersion(windowsAgentScript, /\$AgentVersion\s*=\s*"([^"]+)"/);
const LINUX_AGENT_VERSION = parseAgentVersion(linuxAgentScript, /AGENT_VERSION="([^"]+)"/);

const encodeBase64Utf8 = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const WINDOWS_AGENT_UPDATE = {
  version: WINDOWS_AGENT_VERSION,
  payload: JSON.stringify({
    target_version: WINDOWS_AGENT_VERSION,
    agent_script_base64: encodeBase64Utf8(windowsAgentScript),
    outside_office_only: true,
  }),
};

const LINUX_AGENT_UPDATE = {
  version: LINUX_AGENT_VERSION,
  payload: JSON.stringify({
    target_version: LINUX_AGENT_VERSION,
    agent_script_base64: encodeBase64Utf8(linuxAgentScript),
    outside_office_only: true,
  }),
};

const Devices = () => {
  const { user, role } = useAuth();
  const { companyId, companyLoading, ensureCompanyId, withCompanyScope } = useCompanyAccess({
    missingDescription: "No se puede programar la actualización sin empresa asociada.",
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [intervalDevice, setIntervalDevice] = useState<Device | null>(null);
  const [intervalValue, setIntervalValue] = useState(60);
  const [savingInterval, setSavingInterval] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState(false);
  const [updatingDeviceId, setUpdatingDeviceId] = useState<string | null>(null);
  const [updatingAllAgents, setUpdatingAllAgents] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    device_id: "", hostname: "", serial_number: "", user_assigned: "",
    department: "", role_type: "usuario", operating_system: "", ip_address: "",
    connection_type: "unknown" as string,
  });

  const fetchDevices = async () => {
    setLoading(true);
    const query = withCompanyScope(supabase
      .from("devices")
      .select("id,device_id,hostname,serial_number,user_assigned,department,role_type,operating_system,ip_address,connection_type,vpn_status,last_seen,health_status,agent_installed,agent_version,report_interval,created_at")
      .order("created_at", { ascending: false })
      .limit(500));
    const { data, error } = await query;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setDevices(data || []);
    }
    setLoading(false);
  };

  const fetchTokens = async () => {
    const query = withCompanyScope(supabase
      .from("enrollment_tokens")
      .select("id,token,expires_at,used,used_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20));
    const { data } = await query;
    setTokens((data as EnrollmentToken[]) || []);
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    fetchDevices();
    fetchTokens();
    const channel = supabase
      .channel("devices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => fetchDevices())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, companyLoading]);

  const userRole = role ?? "user";

  const handleCreate = async () => {
    if (!form.device_id || !form.hostname) {
      toast({ title: "Campos requeridos", description: "ID de dispositivo y hostname son obligatorios", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("devices").insert({
      device_id: form.device_id,
      hostname: form.hostname,
      serial_number: form.serial_number || null,
      user_assigned: form.user_assigned || null,
      department: form.department || null,
      role_type: form.role_type,
      operating_system: form.operating_system || null,
      ip_address: form.ip_address || null,
      connection_type: form.connection_type as any,
      company_id: companyId || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dispositivo registrado" });
      setDialogOpen(false);
      setForm({ device_id: "", hostname: "", serial_number: "", user_assigned: "", department: "", role_type: "usuario", operating_system: "", ip_address: "", connection_type: "unknown" });
    }
  };

  const handleGenerateToken = async () => {
    if (userRole !== "admin") {
      toast({ title: "Sin permisos", description: "Solo administradores pueden generar tokens de enrolamiento", variant: "destructive" });
      return;
    }

    setGeneratingToken(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const invokePromise = supabase.functions.invoke("agent-api/generate-token", {
        body: { created_by: user?.id || null },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Tiempo de espera agotado al generar el token. Intenta de nuevo.")), 15000);
      });

      const response = await Promise.race([invokePromise, timeoutPromise]);
      if (response.error) throw response.error;
      toast({ title: "Token generado", description: "Token de enrolamiento creado exitosamente" });
      fetchTokens();
    } catch (err: unknown) {
      let description = "No se pudo generar el token de enrolamiento.";

      if (err && typeof err === "object" && "context" in err) {
        const context = (err as { context?: Response }).context;
        if (context instanceof Response) {
          try {
            const body = await context.clone().json();
            description = body?.error || body?.message || description;
          } catch {
            try {
              const text = await context.text();
              if (text.trim()) {
                description = text;
              }
            } catch {
              // Keep the default message if the response body cannot be parsed.
            }
          }
        }
      } else if (err instanceof Error && err.message) {
        description = err.message;
      }

      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setGeneratingToken(false);
    }
  };

  const copyToken = async (token: string) => {
    const copied = await copyTextToClipboard(token);
    if (!copied) {
      toast({ title: "Error", description: "No se pudo copiar el token. Intenta seleccionarlo manualmente.", variant: "destructive" });
      return;
    }

    setCopiedToken(token);
    toast({ title: "Token copiado al portapapeles" });
    setTimeout(() => setCopiedToken(null), 3000);
  };

  const downloadInstaller = () => {
    // Generate the installer content dynamically
    const link = document.createElement("a");
    link.href = "/agents/windows/agent-installer.ps1";
    link.download = "agent-installer.ps1";
    
    // Since the file is in the repo, we create a blob with instructions
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const script = `# IT Service Desk - Agent Installer for Windows
# ============================================================
# Usage: .\\agent-installer.ps1 -Token "YOUR_ENROLLMENT_TOKEN"
# Requires: PowerShell 5.1+, Run as Administrator
# ============================================================

param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$ServerUrl = "${supabaseUrl}/functions/v1/agent-api",
    [string]$ApiKey = "${anonKey}",
    [int]$Interval = 60,
    [string]$InstallPath = "C:\\ITAgent"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  IT Service Desk - Agent Installer v2.0" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This installer must be run as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Creating install directory: $InstallPath" -ForegroundColor Yellow
if (!(Test-Path $InstallPath)) { New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null }

Write-Host "[2/5] Registering device with enrollment token..." -ForegroundColor Yellow

$hostname = $env:COMPUTERNAME
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress
$mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress

$registerBody = @{
    token = $Token; hostname = $hostname; operating_system = $os
    ip_address = $ip; mac_address = $mac; user_assigned = $env:USERNAME; agent_version = "2.0.0"
} | ConvertTo-Json

$headers = @{ "Content-Type" = "application/json"; "apikey" = $ApiKey }

try {
    $response = Invoke-RestMethod -Uri "$ServerUrl/register" -Method POST -Body $registerBody -Headers $headers
} catch {
    $errMsg = $_.ErrorDetails.Message | ConvertFrom-Json | Select-Object -ExpandProperty error
    Write-Host "[ERROR] Registration failed: $errMsg" -ForegroundColor Red
    exit 1
}

$DeviceId = $response.device_id
Write-Host "[OK] Device registered as: $DeviceId" -ForegroundColor Green

Write-Host "[3/5] Installing agent script..." -ForegroundColor Yellow

$agentContent = @'
$ServerUrl = "SERVERURL_PLACEHOLDER"
$DeviceId = "DEVICEID_PLACEHOLDER"
$ApiKey = "APIKEY_PLACEHOLDER"
$Interval = INTERVAL_PLACEHOLDER
$AgentVersion = "2.0.0"
$ErrorActionPreference = "Continue"

function Get-Diagnostics {
    $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $os = Get-CimInstance Win32_OperatingSystem
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $ramUsage = [math]::Round((($ramTotal - $ramFree) / $ramTotal) * 100, 1)
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskUsage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
    $internetStatus = "disconnected"; $latency = 0; $packetLoss = 100
    try {
        $ping = Test-Connection -ComputerName 8.8.8.8 -Count 4 -ErrorAction Stop
        $internetStatus = "connected"
        $latency = [math]::Round(($ping | Measure-Object -Property Latency -Average).Average, 0)
        $packetLoss = [math]::Round(((4 - $ping.Count) / 4) * 100, 0)
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
    try { $vpn = Get-VpnConnection | Where-Object { $_.ConnectionStatus -eq "Connected" }; if ($vpn) { $vpnStatus = "connected" } } catch {}
    $ipAddr = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress
    $connType = "unknown"
    if ($ethStatus -eq "connected") { $connType = "ethernet" } elseif ($wifiStatus -eq "connected") { $connType = "wifi" }
    if ($vpnStatus -eq "connected") { $connType = "vpn" }
    return @{
        cpu_usage=$cpu; ram_usage=$ramUsage; disk_usage=$diskUsage
        internet_status=$internetStatus; wifi_status=$wifiStatus; ethernet_status=$ethStatus
        dns_status=$dnsStatus; latency_ms=$latency; packet_loss=$packetLoss
        vpn_status=$vpnStatus; ip_address=$ipAddr; connection_type=$connType
    }
}

function Send-Report { param($Diagnostics)
    $body = @{
        device_id=$DeviceId; hostname=$env:COMPUTERNAME; agent_version=$AgentVersion
        operating_system=(Get-CimInstance Win32_OperatingSystem).Caption
        ip_address=$Diagnostics.ip_address; connection_type=$Diagnostics.connection_type
        vpn_status=$Diagnostics.vpn_status; user_assigned=$env:USERNAME
        diagnostics=@{
            cpu_usage=$Diagnostics.cpu_usage; ram_usage=$Diagnostics.ram_usage; disk_usage=$Diagnostics.disk_usage
            internet_status=$Diagnostics.internet_status; wifi_status=$Diagnostics.wifi_status
            ethernet_status=$Diagnostics.ethernet_status; dns_status=$Diagnostics.dns_status
            latency_ms=$Diagnostics.latency_ms; packet_loss=$Diagnostics.packet_loss
        }
    } | ConvertTo-Json -Depth 5
    $h = @{"Content-Type"="application/json";"apikey"=$ApiKey}
    try { return Invoke-RestMethod -Uri "$ServerUrl/report" -Method POST -Body $body -Headers $h } catch { return $null }
}

function Execute-PendingScript { param($Script)
    $output=""; $errorLog=""; $status="completed"
    try {
        if ($Script.script_content) {
            $tf = [System.IO.Path]::GetTempFileName()+".ps1"
            $Script.script_content | Out-File -FilePath $tf -Encoding UTF8
            $output = & $tf 2>&1 | Out-String; Remove-Item $tf -Force
        } else { $output = "No script content." }
    } catch { $status="failed"; $errorLog=$_.Exception.Message }
    $rb = @{execution_id=$Script.id;status=$status;output=$output.Substring(0,[Math]::Min($output.Length,5000));error_log=$errorLog} | ConvertTo-Json -Depth 3
    $h = @{"Content-Type"="application/json";"apikey"=$ApiKey}
    try { Invoke-RestMethod -Uri "$ServerUrl/execute" -Method POST -Body $rb -Headers $h } catch {}
}

while ($true) {
    try { $diag=Get-Diagnostics; $resp=Send-Report -Diagnostics $diag
        if ($resp -and $resp.pending_scripts) { foreach ($s in $resp.pending_scripts) { Execute-PendingScript -Script $s } }
    } catch {}
    Start-Sleep -Seconds $Interval
}
'@

$agentContent = $agentContent -replace 'SERVERURL_PLACEHOLDER', $ServerUrl
$agentContent = $agentContent -replace 'DEVICEID_PLACEHOLDER', $DeviceId
$agentContent = $agentContent -replace 'APIKEY_PLACEHOLDER', $ApiKey
$agentContent = $agentContent -replace 'INTERVAL_PLACEHOLDER', $Interval

$agentContent | Out-File -FilePath "$InstallPath\\agent.ps1" -Encoding UTF8 -Force

Write-Host "[4/5] Installing as Windows service (Scheduled Task)..." -ForegroundColor Yellow

$taskName = "ITServiceDeskAgent"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$InstallPath\\agent.ps1\`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "IT Service Desk Remote Monitoring Agent" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "[5/5] Agent started!" -ForegroundColor Yellow
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  Device ID:    $DeviceId"
Write-Host "  Install Path: $InstallPath"
Write-Host "  Task Name:    $taskName"
Write-Host ""
`;

    const blob = new Blob([script], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-installer.ps1";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Instalador descargado", description: "Ejecuta el script como administrador en el equipo destino" });
  };

  const downloadLinuxInstaller = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const script = `#!/bin/bash
# IT Service Desk - Agent Installer for Linux/macOS
# Usage: sudo bash agent-installer.sh --token "YOUR_ENROLLMENT_TOKEN"

set -e

TOKEN=""
SERVER_URL="${supabaseUrl}/functions/v1/agent-api"
API_KEY="${anonKey}"
INTERVAL=60
INSTALL_PATH="/opt/itagent"

while [[ \\$# -gt 0 ]]; do
    case \\$1 in
        --token) TOKEN="\\$2"; shift 2;;
        --server) SERVER_URL="\\$2"; shift 2;;
        --api-key) API_KEY="\\$2"; shift 2;;
        --interval) INTERVAL="\\$2"; shift 2;;
        --path) INSTALL_PATH="\\$2"; shift 2;;
        *) echo "Unknown option: \\$1"; exit 1;;
    esac
done

if [ -z "\\$TOKEN" ]; then echo "Usage: sudo bash \\$0 --token \\"TOKEN\\""; exit 1; fi

echo "====================================================="
echo "  IT Service Desk - Agent Installer v2.0 (Linux/macOS)"
echo "====================================================="

if [ "\\$EUID" -ne 0 ]; then echo "[ERROR] Run as root (use sudo)."; exit 1; fi
if ! command -v curl &>/dev/null; then echo "[ERROR] curl required."; exit 1; fi

echo "[1/5] Creating \\$INSTALL_PATH"
mkdir -p "\\$INSTALL_PATH"

echo "[2/5] Registering device..."
HOSTNAME_VAL=\\$(hostname)
USER_VAL=\\$(logname 2>/dev/null || whoami)
if [[ "\\$OSTYPE" == "darwin"* ]]; then
    OS_VAL="\\$(sw_vers -productName) \\$(sw_vers -productVersion)"
    IP_VAL=\\$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
    MAC_VAL=\\$(ifconfig en0 2>/dev/null | awk '/ether/{print \\$2}' || echo "unknown")
else
    OS_VAL=\\$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || uname -s)
    IP_VAL=\\$(hostname -I 2>/dev/null | awk '{print \\$1}' || echo "unknown")
    MAC_VAL=\\$(ip link show 2>/dev/null | awk '/ether/{print \\$2; exit}' || echo "unknown")
fi

RESPONSE=\\$(curl -s -w "\\n%{http_code}" -X POST "\\$SERVER_URL/register" \\
    -H "Content-Type: application/json" -H "apikey: \\$API_KEY" \\
    -d "{\\"token\\":\\"\\$TOKEN\\",\\"hostname\\":\\"\\$HOSTNAME_VAL\\",\\"operating_system\\":\\"\\$OS_VAL\\",\\"ip_address\\":\\"\\$IP_VAL\\",\\"mac_address\\":\\"\\$MAC_VAL\\",\\"user_assigned\\":\\"\\$USER_VAL\\",\\"agent_version\\":\\"2.0.0\\"}")

HTTP_CODE=\\$(echo "\\$RESPONSE" | tail -1)
BODY=\\$(echo "\\$RESPONSE" | sed '\\$d')

if [ "\\$HTTP_CODE" != "200" ]; then
    echo "[ERROR] Registration failed: \\$BODY"; exit 1
fi

DEVICE_ID=\\$(echo "\\$BODY" | grep -o '"device_id":"[^"]*"' | cut -d'"' -f4)
echo "[OK] Device registered as: \\$DEVICE_ID"

echo "[3/5] Installing agent script..."
cat > "\\$INSTALL_PATH/agent.sh" << 'AGENTEOF'
#!/bin/bash
SERVER_URL="__SURL__"; DEVICE_ID="__DID__"; API_KEY="__AKEY__"; INTERVAL=__INT__; VER="2.0.0"
get_cpu() { if [[ "\\$OSTYPE" == "darwin"* ]]; then top -l 1 -s 0 2>/dev/null|grep "CPU usage"|awk '{print \\$3}'|tr -d '%'; else grep 'cpu ' /proc/stat|awk '{u=(\\$2+\\$4)*100/(\\$2+\\$4+\\$5)} END{printf "%.1f",u}'; fi; }
get_ram() { if [[ "\\$OSTYPE" == "darwin"* ]]; then echo 50; else free|awk '/Mem:/{printf "%.1f",(\\$3/\\$2)*100}'; fi; }
get_disk() { df -h / 2>/dev/null|awk 'NR==2{print \\$5}'|tr -d '%'; }
get_ip() { if [[ "\\$OSTYPE" == "darwin"* ]]; then ipconfig getifaddr en0 2>/dev/null||echo unknown; else hostname -I 2>/dev/null|awk '{print \\$1}'||echo unknown; fi; }
ci() { ping -c 1 -W 2 8.8.8.8 &>/dev/null&&echo connected||echo disconnected; }
cd2() { nslookup google.com &>/dev/null&&echo ok||echo fail; }
gl() { ping -c 4 -W 2 8.8.8.8 2>/dev/null|tail -1|awk -F/ '{printf "%.0f",\\$5}'||echo 0; }
gpl() { ping -c 10 -W 2 8.8.8.8 2>/dev/null|grep -oP '\\d+(?=% packet loss)'||echo 100; }
cv() { ifconfig 2>/dev/null|grep -qE "tun|utun|ppp"&&echo connected||echo disconnected; }
while true; do
    cpu=\\$(get_cpu);ram=\\$(get_ram);disk=\\$(get_disk);ip=\\$(get_ip);inet=\\$(ci);dns=\\$(cd2);lat=\\$(gl);pl=\\$(gpl);vpn=\\$(cv)
    os=""; if [[ "\\$OSTYPE" == "darwin"* ]]; then os="\\$(sw_vers -productName) \\$(sw_vers -productVersion)"; else os=\\$(cat /etc/os-release 2>/dev/null|grep PRETTY_NAME|cut -d'"' -f2||uname -s); fi
    conn="unknown"; if ip link show 2>/dev/null|grep -E "eth|enp"|grep -q UP; then conn=ethernet; elif iwconfig 2>/dev/null|grep -q ESSID; then conn=wifi; fi
    [ "\\$vpn" = "connected" ] && conn=vpn
    resp=\\$(curl -s -X POST "\\$SERVER_URL/report" -H "Content-Type: application/json" -H "apikey: \\$API_KEY" -d "{\\"device_id\\":\\"\\$DEVICE_ID\\",\\"hostname\\":\\"\\$(hostname)\\",\\"agent_version\\":\\"\\$VER\\",\\"operating_system\\":\\"\\$os\\",\\"ip_address\\":\\"\\$ip\\",\\"connection_type\\":\\"\\$conn\\",\\"vpn_status\\":\\"\\$vpn\\",\\"user_assigned\\":\\"\\$(whoami)\\",\\"diagnostics\\":{\\"cpu_usage\\":\\$cpu,\\"ram_usage\\":\\$ram,\\"disk_usage\\":\\$disk,\\"internet_status\\":\\"\\$inet\\",\\"wifi_status\\":\\"disconnected\\",\\"ethernet_status\\":\\"disconnected\\",\\"dns_status\\":\\"\\$dns\\",\\"latency_ms\\":\\$lat,\\"packet_loss\\":\\$pl}}")
    if command -v jq &>/dev/null; then
        cnt=\\$(echo "\\$resp"|jq -r '.pending_scripts|length' 2>/dev/null||echo 0)
        for i in \\$(seq 0 \\$((cnt-1))); do
            sid=\\$(echo "\\$resp"|jq -r ".pending_scripts[\\$i].id")
            sc=\\$(echo "\\$resp"|jq -r ".pending_scripts[\\$i].script_content//empty")
            st=completed; out=""; err=""
            if [ -n "\\$sc" ]; then tf=\\$(mktemp); echo "\\$sc">\\$tf; chmod +x \\$tf; out=\\$(\\$tf 2>&1)||{ st=failed; err=\\$out; }; rm -f \\$tf; fi
            curl -s -X POST "\\$SERVER_URL/execute" -H "Content-Type: application/json" -H "apikey: \\$API_KEY" -d "{\\"execution_id\\":\\"\\$sid\\",\\"status\\":\\"\\$st\\",\\"output\\":\\"done\\",\\"error_log\\":\\"\\$err\\"}" >/dev/null
        done
    fi
    sleep \\$INTERVAL
done
AGENTEOF

sed -i.bak "s|__SURL__|\\$SERVER_URL|g" "\\$INSTALL_PATH/agent.sh"
sed -i.bak "s|__DID__|\\$DEVICE_ID|g" "\\$INSTALL_PATH/agent.sh"
sed -i.bak "s|__AKEY__|\\$API_KEY|g" "\\$INSTALL_PATH/agent.sh"
sed -i.bak "s|__INT__|\\$INTERVAL|g" "\\$INSTALL_PATH/agent.sh"
rm -f "\\$INSTALL_PATH/agent.sh.bak"
chmod +x "\\$INSTALL_PATH/agent.sh"

echo "[4/5] Installing as system service..."
if [[ "\\$OSTYPE" == "darwin"* ]]; then
    cat > /Library/LaunchDaemons/com.itservicedesk.agent.plist << PEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.itservicedesk.agent</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>\\$INSTALL_PATH/agent.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>\\$INSTALL_PATH/agent.log</string>
<key>StandardErrorPath</key><string>\\$INSTALL_PATH/agent-error.log</string>
</dict></plist>
PEOF
    launchctl load /Library/LaunchDaemons/com.itservicedesk.agent.plist 2>/dev/null
    echo "[OK] LaunchDaemon installed"
else
    cat > /etc/systemd/system/itagent.service << SEOF
[Unit]
Description=IT Service Desk Agent
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStart=/bin/bash \\$INSTALL_PATH/agent.sh
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
SEOF
    systemctl daemon-reload; systemctl enable itagent; systemctl start itagent
    echo "[OK] Systemd service installed"
fi

echo "[5/5] Agent started!"
echo "====================================================="
echo "  Installation Complete! Device: \\$DEVICE_ID"
echo "====================================================="
`;

    const blob = new Blob([script], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-installer.sh";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Instalador Linux/macOS descargado", description: "Ejecuta con: sudo bash agent-installer.sh --token \"TOKEN\"" });
  };

  const copyInstallerCommand = (token: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const serverUrl = supabaseUrl + "/functions/v1/agent-api";

    // Build PS script using array join to avoid backtick conflicts
    const ps = [
      '$ErrorActionPreference = "Stop"',
      '$Token = "' + token + '"',
      '$ServerUrl = "' + serverUrl + '"',
      '$ApiKey = "' + anonKey + '"',
      '$Interval = 60',
      '$InstallPath = "C:\\ITAgent"',
      '',
      'Write-Host "====================================================" -ForegroundColor Cyan',
      'Write-Host "  IT Service Desk - Auto-Enrollment v2.0" -ForegroundColor Cyan',
      'Write-Host "====================================================" -ForegroundColor Cyan',
      '',
      'if (!(Test-Path $InstallPath)) { New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null }',
      '',
      'Write-Host "[1/4] Registrando dispositivo..." -ForegroundColor Yellow',
      '$hostname = $env:COMPUTERNAME',
      '$os = (Get-CimInstance Win32_OperatingSystem).Caption',
      '$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress',
      '$mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress',
      '',
      '$body = @{ token=$Token; hostname=$hostname; operating_system=$os; ip_address=$ip; mac_address=$mac; user_assigned=$env:USERNAME; agent_version="2.0.0" } | ConvertTo-Json',
      '$headers = @{ "Content-Type"="application/json"; "apikey"=$ApiKey }',
      '',
      'try { $resp = Invoke-RestMethod -Uri "$ServerUrl/register" -Method POST -Body $body -Headers $headers }',
      'catch { Write-Host "[ERROR] Registro fallido: $($_.ErrorDetails.Message)" -ForegroundColor Red; Read-Host "Presiona Enter para salir"; exit 1 }',
      '',
      '$DeviceId = $resp.device_id',
      'Write-Host "[OK] Registrado: $DeviceId" -ForegroundColor Green',
      '',
      'Write-Host "[2/4] Creando agente..." -ForegroundColor Yellow',
      // Agent script content using single-quoted here-string to avoid variable expansion issues
      "$agentContent = @'",
      '$SU = "' + serverUrl + '"; $DI = "YOURDEVICEID"; $AK = "' + anonKey + '"; $IV = 60; $AV = "2.0.0"',
      'while ($true) {',
      '    try {',
      '        $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
      '        $osI = Get-CimInstance Win32_OperatingSystem',
      '        $rt = [math]::Round($osI.TotalVisibleMemorySize / 1MB, 1)',
      '        $rf = [math]::Round($osI.FreePhysicalMemory / 1MB, 1)',
      '        $ru = [math]::Round((($rt - $rf) / $rt) * 100, 1)',
      '        $dk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'"',
      '        $du = [math]::Round((($dk.Size - $dk.FreeSpace) / $dk.Size) * 100, 1)',
      '        $is = "disconnected"; $la = 0; $pl = 100',
      '        try { $pg = Test-Connection -ComputerName 8.8.8.8 -Count 4 -ErrorAction Stop; $is = "connected"; $la = [math]::Round(($pg | Measure-Object -Property Latency -Average).Average, 0); $pl = [math]::Round(((4 - $pg.Count) / 4) * 100, 0) } catch {}',
      '        $dns = "fail"; try { Resolve-DnsName google.com -ErrorAction Stop | Out-Null; $dns = "ok" } catch {}',
      '        $ws = "disconnected"; $es = "disconnected"',
      '        try { $ad = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }; foreach ($a in $ad) { if ($a.InterfaceDescription -match "Wi-Fi|Wireless") { $ws = "connected" }; if ($a.InterfaceDescription -match "Ethernet|Realtek") { $es = "connected" } } } catch {}',
      '        $vs = "disconnected"; try { $v = Get-VpnConnection | Where-Object { $_.ConnectionStatus -eq "Connected" }; if ($v) { $vs = "connected" } } catch {}',
      '        $ip2 = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress',
      '        $ct = "unknown"; if ($es -eq "connected") { $ct = "ethernet" } elseif ($ws -eq "connected") { $ct = "wifi" }; if ($vs -eq "connected") { $ct = "vpn" }',
      '        $bd = @{ device_id=$DI; hostname=$env:COMPUTERNAME; agent_version=$AV; operating_system=(Get-CimInstance Win32_OperatingSystem).Caption; ip_address=$ip2; connection_type=$ct; vpn_status=$vs; user_assigned=$env:USERNAME; diagnostics=@{ cpu_usage=$cpu; ram_usage=$ru; disk_usage=$du; internet_status=$is; wifi_status=$ws; ethernet_status=$es; dns_status=$dns; latency_ms=$la; packet_loss=$pl } } | ConvertTo-Json -Depth 5',
      '        $h2 = @{ "Content-Type"="application/json"; "apikey"=$AK }',
      '        $r2 = Invoke-RestMethod -Uri "$SU/report" -Method POST -Body $bd -Headers $h2',
      '        if ($r2 -and $r2.pending_scripts) { foreach ($s in $r2.pending_scripts) { $out=""; $el=""; $st="completed"; try { if ($s.script_content) { $tf=[System.IO.Path]::GetTempFileName()+".ps1"; $s.script_content | Out-File -FilePath $tf -Encoding UTF8; $out = & $tf 2>&1 | Out-String; Remove-Item $tf -Force } } catch { $st="failed"; $el=$_.Exception.Message }; $rb=@{execution_id=$s.id;status=$st;output=$out.Substring(0,[Math]::Min($out.Length,5000));error_log=$el}|ConvertTo-Json -Depth 3; try { Invoke-RestMethod -Uri "$SU/execute" -Method POST -Body $rb -Headers $h2 } catch {} } }',
      '    } catch {}',
      '    Start-Sleep -Seconds $IV',
      '}',
      "'@",
      '$agentContent = $agentContent -replace "YOURDEVICEID", $DeviceId',
      '$agentContent | Out-File -FilePath "$InstallPath\\agent.ps1" -Encoding UTF8 -Force',
      '',
      'Write-Host "[3/4] Instalando servicio..." -ForegroundColor Yellow',
      '$tn = "ITServiceDeskAgent"',
      'Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction SilentlyContinue',
      '$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `\\"$InstallPath\\agent.ps1`\\""',
      '$trg = New-ScheduledTaskTrigger -AtStartup',
      '$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)',
      '$prn = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
      'Register-ScheduledTask -TaskName $tn -Action $act -Trigger $trg -Settings $set -Principal $prn -Description "IT Service Desk Agent" -Force | Out-Null',
      'Start-ScheduledTask -TaskName $tn',
      '',
      'Write-Host "[4/4] Agente iniciado!" -ForegroundColor Green',
      'Write-Host "====================================================" -ForegroundColor Green',
      'Write-Host "  Instalacion Completa! Device: $DeviceId" -ForegroundColor Green',
      'Write-Host "====================================================" -ForegroundColor Green',
      'Read-Host "Presiona Enter para cerrar"',
    ].join("\r\n");

    // Write PS1 to temp and execute it from the .cmd
    const psBase64 = btoa(unescape(encodeURIComponent(ps)));
    const bat = [
      '@echo off',
      'chcp 65001 >nul',
      'echo =============================================',
      'echo   IT Service Desk - Instalador de Agente',
      'echo =============================================',
      'echo.',
      '',
      'net session >nul 2>&1',
      'if %errorlevel% neq 0 (',
      '    powershell -Command "Start-Process cmd.exe -ArgumentList \'/c \"\"%~f0\"\"\' -Verb RunAs"',
      '    exit /b',
      ')',
      '',
      `set "B64=${psBase64}"`,
      'set "TMPPS=%TEMP%\\itagent_enroll_%RANDOM%.ps1"',
      'powershell -ExecutionPolicy Bypass -Command "[System.IO.File]::WriteAllText(\'%TMPPS%\', [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\'%B64%\'))); & \'%TMPPS%\'; Remove-Item \'%TMPPS%\' -Force -ErrorAction SilentlyContinue"',
    ].join("\r\n");

    const blob = new Blob([bat], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enroll-${token.substring(0, 8)}.cmd`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    toast({ title: "Instalador descargado", description: "Haz doble clic en el archivo .cmd — se ejecuta automáticamente como Administrador." });
  };

  const copyLinuxCommand = async (token: string) => {
    const cmd = `sudo bash agent-installer.sh --token "${token}"`;
    const copied = await copyTextToClipboard(cmd);
    if (!copied) {
      toast({ title: "Error", description: "No se pudo copiar el comando.", variant: "destructive" });
      return;
    }

    toast({ title: "Comando copiado", description: "Pega el comando en la terminal (como root)" });
  };

  const revokeToken = async (tokenId: string) => {
    const { error } = await supabase
      .from("enrollment_tokens")
      .update({ used: true, used_at: new Date().toISOString() } as any)
      .eq("id", tokenId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Token revocado", description: "El token ya no puede ser utilizado" });
      fetchTokens();
    }
  };

  const openIntervalConfig = (device: Device) => {
    setIntervalDevice(device);
    setIntervalValue(device.report_interval || 60);
  };

  const getDevicePlatform = (device: Device) => {
    const osName = (device.operating_system || "").toLowerCase();
    if (osName.includes("windows")) return "windows";
    if (osName.includes("linux") || osName.includes("ubuntu") || osName.includes("debian") || osName.includes("fedora") || osName.includes("centos") || osName.includes("red hat") || osName.includes("mac") || osName.includes("darwin")) {
      return "linux";
    }
    return null;
  };

  const buildAgentUpdatePayload = (device: Device) => {
    const platform = getDevicePlatform(device);
    if (platform === "windows") {
      return WINDOWS_AGENT_UPDATE;
    }

    if (platform === "linux") {
      return LINUX_AGENT_UPDATE;
    }

    return null;
  };

  const queueAgentUpdates = async (targetDevices: Device[]) => {
    const eligibleDevices = targetDevices.filter((device) => device.agent_installed && buildAgentUpdatePayload(device));
    if (eligibleDevices.length === 0) {
      toast({ title: "Sin agentes compatibles", description: "No hay dispositivos Windows o Linux/macOS con agente instalado para actualizar." });
      return false;
    }

    const executions = eligibleDevices.map((device) => {
      const updateSpec = buildAgentUpdatePayload(device)!;
      return {
        device_id: device.id,
        script_name: `Actualizar agente a v${updateSpec.version}`,
        script_type: "update-agent",
        script_content: updateSpec.payload,
      };
    });

    const { error, inserted } = await queueScriptExecutions({ ensureCompanyId, executions });

    if (error) {
      const extra = isScriptExecutionPolicyError(error)
        ? " Verifica que tu usuario tenga rol admin o technician dentro de tu empresa."
        : "";
      toast({ title: "Error", description: `${error.message}.${extra}`, variant: "destructive" });
      return false;
    }

    if (!inserted) {
      return false;
    }

    toast({
      title: "Actualización programada",
      description: `${eligibleDevices.length} agente(s) recibirán la actualización en su próximo ciclo de reporte.`,
    });
    return true;
  };

  const updateSingleAgent = async (device: Device) => {
    if (userRole !== "admin") {
      toast({ title: "Sin permisos", description: "Solo administradores pueden actualizar agentes.", variant: "destructive" });
      return;
    }

    setUpdatingDeviceId(device.id);
    try {
      await queueAgentUpdates([device]);
    } finally {
      setUpdatingDeviceId(null);
    }
  };

  const updateAllInstalledAgents = async () => {
    if (userRole !== "admin") {
      toast({ title: "Sin permisos", description: "Solo administradores pueden actualizar agentes.", variant: "destructive" });
      return;
    }

    setUpdatingAllAgents(true);
    try {
      await queueAgentUpdates(filtered);
    } finally {
      setUpdatingAllAgents(false);
    }
  };

  const saveInterval = async () => {
    if (!intervalDevice) return;
    setSavingInterval(true);
    const { error } = await supabase
      .from("devices")
      .update({ report_interval: intervalValue } as any)
      .eq("id", intervalDevice.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Intervalo actualizado", description: `El agente reportará cada ${intervalValue}s en su próximo ciclo` });
      setIntervalDevice(null);
      fetchDevices();
    }
    setSavingInterval(false);
  };

  const handleDeleteDevice = async (device: Device) => {
    if (userRole !== "admin") {
      toast({ title: "Sin permisos", description: "Solo administradores pueden eliminar dispositivos", variant: "destructive" });
      return;
    }
    setDeviceToDelete(device);
  };

  const confirmDeleteDevice = async () => {
    if (!deviceToDelete) return;
    setDeletingDevice(true);

    let query = supabase.from("devices").delete().eq("id", deviceToDelete.id);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { error } = await query;
    if (error) {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
      setDeletingDevice(false);
      return;
    }

    toast({ title: "Dispositivo eliminado", description: `${deviceToDelete.hostname} fue removido del inventario` });
    setDeviceToDelete(null);
    setDeletingDevice(false);
    fetchDevices();
  };

  const formatInterval = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60 ? (secs % 60) + 's' : ''}`.trim();
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m ? m + 'm' : ''}`.trim();
  };

  const filtered = devices.filter(d => {
    const matchSearch = d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.device_id.toLowerCase().includes(search.toLowerCase()) ||
      (d.user_assigned || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.ip_address || "").includes(search);
    const matchHealth = healthFilter === "all" || d.health_status === healthFilter;
    return matchSearch && matchHealth;
  });

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return "Nunca";
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const isTokenValid = (t: EnrollmentToken) => !t.used && new Date(t.expires_at) > new Date();

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Dispositivos</h1>
          <p className="page-description">Gestión, monitoreo y enrolamiento de dispositivos remotos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDevices}><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo Dispositivo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Dispositivo</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div><Label>ID Dispositivo *</Label><Input placeholder="Identificador único del dispositivo" value={form.device_id} onChange={e => setForm({...form, device_id: e.target.value})} /></div>
                <div><Label>Hostname *</Label><Input placeholder="Nombre del equipo en la red" value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} /></div>
                <div><Label>Serial</Label><Input placeholder="Número de serie del fabricante" value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} /></div>
                <div><Label>Usuario Asignado</Label><Input placeholder="Juan Pérez" value={form.user_assigned} onChange={e => setForm({...form, user_assigned: e.target.value})} /></div>
                <div><Label>Departamento</Label><Input placeholder="Finanzas" value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></div>
                <div>
                  <Label>Rol</Label>
                  <Select value={form.role_type} onValueChange={v => setForm({...form, role_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="practicante">Practicante</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="tecnologo">Tecnólogo</SelectItem>
                      <SelectItem value="profesional">Profesional</SelectItem>
                      <SelectItem value="usuario">Usuario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Sistema Operativo</Label><Input placeholder="Windows 11 Pro" value={form.operating_system} onChange={e => setForm({...form, operating_system: e.target.value})} /></div>
                <div><Label>Dirección IP</Label><Input placeholder="192.168.1.100" value={form.ip_address} onChange={e => setForm({...form, ip_address: e.target.value})} /></div>
                <div>
                  <Label>Tipo Conexión</Label>
                  <Select value={form.connection_type} onValueChange={v => setForm({...form, connection_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ethernet">Ethernet</SelectItem>
                      <SelectItem value="wifi">WiFi</SelectItem>
                      <SelectItem value="vpn">VPN</SelectItem>
                      <SelectItem value="unknown">Desconocido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex justify-end"><Button onClick={handleCreate}>Registrar Dispositivo</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="devices" className="mb-6">
        <TabsList>
          <TabsTrigger value="devices">
            <Laptop className="h-4 w-4 mr-2" />Dispositivos
          </TabsTrigger>
          <TabsTrigger value="enrollment">
            <Shield className="h-4 w-4 mr-2" />Enrolamiento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enrollment" className="space-y-6 mt-4">
          {/* Enrollment Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Generate Token Card */}
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex p-2 rounded-lg bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Generar Token</h3>
                  <p className="text-sm text-muted-foreground">Crea un token de enrolamiento de un solo uso (expira en 24h)</p>
                </div>
              </div>
              <Button onClick={handleGenerateToken} disabled={generatingToken || userRole !== "admin"} className="w-full">
                <Key className="h-4 w-4 mr-2" />
                {generatingToken ? "Generando..." : "Generar Token de Enrolamiento"}
              </Button>
              {userRole !== "admin" && (
                <p className="text-xs text-muted-foreground">Solo los administradores pueden generar tokens.</p>
              )}
            </div>

            {/* Download Agent Card */}
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex p-2 rounded-lg bg-primary/10">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Descargar Agente</h3>
                  <p className="text-sm text-muted-foreground">Instaladores para Windows, Linux y macOS</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button onClick={downloadInstaller} variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />Windows (.ps1)
                </Button>
                <Button onClick={downloadLinuxInstaller} variant="outline" className="w-full">
                  <Terminal className="h-4 w-4 mr-2" />Linux / macOS (.sh)
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  <strong>Windows:</strong> <code className="bg-muted px-1 py-0.5 rounded text-xs">powershell -ExecutionPolicy Bypass -File .\agent-installer.ps1 -Token "TOKEN"</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Linux/macOS:</strong> <code className="bg-muted px-1 py-0.5 rounded text-xs">sudo bash agent-installer.sh --token "TOKEN"</code>
                </p>
              </div>
            </div>
          </div>

          {/* API Key */}
          <div className="bg-card rounded-lg border p-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">API Key</h3>
                <p className="text-sm text-muted-foreground">Clave necesaria para la comunicación del agente con el servidor</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all select-all">
                {import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const copied = await copyTextToClipboard(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
                  if (!copied) {
                    toast({ title: "Error", description: "No se pudo copiar la API Key.", variant: "destructive" });
                    return;
                  }

                  toast({ title: "API Key copiada", description: "La clave ha sido copiada al portapapeles" });
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Tokens List */}
          <div className="bg-card rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-foreground">Tokens de Enrolamiento</h3>
              <p className="text-sm text-muted-foreground">Historial de tokens generados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>Expira</th>
                    {userRole === "admin" && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {tokens.map(t => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">
                        {t.token.substring(0, 12)}...{t.token.substring(t.token.length - 6)}
                      </td>
                      <td>
                        {t.used ? (
                          <Badge variant="secondary" className="text-xs">Usado</Badge>
                        ) : new Date(t.expires_at) < new Date() ? (
                          <Badge variant="destructive" className="text-xs">Expirado</Badge>
                        ) : (
                          <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200">Disponible</Badge>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(t.expires_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {isTokenValid(t) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToken(t.token)}
                                className="h-7 px-2"
                              >
                                {copiedToken === t.token ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyInstallerCommand(t.token)}
                                className="h-7 px-2 text-xs"
                                title="Descarga .ps1 con token listo para ejecutar"
                              >
                                <Download className="h-3 w-3 mr-1" />Win
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyLinuxCommand(t.token)}
                                className="h-7 px-2 text-xs"
                              >
                                Linux
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revokeToken(t.id)}
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              >
                                <Ban className="h-3 w-3 mr-1" />Revocar
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tokens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay tokens generados. Genera uno para comenzar el enrolamiento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-card rounded-lg border p-6">
            <h3 className="font-semibold text-foreground mb-3">Instrucciones de Enrolamiento</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Genera un <strong className="text-foreground">token de enrolamiento</strong> haciendo clic en el botón anterior</li>
              <li>Haz clic en el botón <strong className="text-foreground">"Win"</strong> del token para descargar un instalador <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.ps1</code> con el token ya incluido</li>
              <li>Copia el archivo al equipo destino y ejecútalo como <strong className="text-foreground">Administrador</strong>:
                <div className="ml-4 mt-1">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">powershell -ExecutionPolicy Bypass -File .\enroll-XXXXXXXX.ps1</code>
                </div>
              </li>
              <li>Para <strong className="text-foreground">Linux/macOS</strong>: descarga el instalador .sh y usa <code className="bg-muted px-1.5 py-0.5 rounded text-xs">sudo bash agent-installer.sh --token "TOKEN"</code></li>
              <li>El equipo se registrará automáticamente y comenzará a reportar cada 60 segundos</li>
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="devices" className="mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="stat-card">
              <div className="inline-flex p-2 rounded-lg bg-blue-50 mb-3"><Laptop className="h-4 w-4 text-primary" /></div>
              <p className="text-2xl font-bold text-foreground">{devices.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Dispositivos</p>
            </div>
            <div className="stat-card">
              <div className="inline-flex p-2 rounded-lg bg-emerald-50 mb-3"><Activity className="h-4 w-4 text-success" /></div>
              <p className="text-2xl font-bold text-foreground">{devices.filter(d => d.health_status === 'healthy').length}</p>
              <p className="text-xs text-muted-foreground mt-1">Saludables</p>
            </div>
            <div className="stat-card">
              <div className="inline-flex p-2 rounded-lg bg-amber-50 mb-3"><Wifi className="h-4 w-4 text-warning" /></div>
              <p className="text-2xl font-bold text-foreground">{devices.filter(d => d.vpn_status === 'connected').length}</p>
              <p className="text-xs text-muted-foreground mt-1">VPN Conectados</p>
            </div>
            <div className="stat-card">
              <div className="inline-flex p-2 rounded-lg bg-red-50 mb-3"><WifiOff className="h-4 w-4 text-destructive" /></div>
              <p className="text-2xl font-bold text-foreground">{devices.filter(d => d.health_status === 'critical' || d.health_status === 'offline').length}</p>
              <p className="text-xs text-muted-foreground mt-1">Con Problemas</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por hostname, ID, usuario o IP..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger className="w-full sm:w-44"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="healthy">Saludable</SelectItem>
                <SelectItem value="warning">Advertencia</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="offline">Desconectado</SelectItem>
              </SelectContent>
            </Select>
            {userRole === "admin" && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={updateAllInstalledAgents}
                disabled={updatingAllAgents}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {updatingAllAgents ? "Programando..." : "Actualizar agentes"}
              </Button>
            )}
          </div>

          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Hostname</th>
                  <th>Usuario</th>
                  <th>Departamento</th>
                  <th>SO</th>
                  <th>IP</th>
                  <th>Conexión</th>
                  <th>VPN</th>
                  <th>Estado</th>
                  <th>Agente</th>
                    <th>Intervalo</th>
                    <th>Último Reporte</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id}>
                      <td className="font-mono text-xs">{d.device_id}</td>
                      <td className="font-medium">{d.hostname}</td>
                    <td>{d.user_assigned || "—"}</td>
                    <td>{d.department || "—"}</td>
                    <td className="text-xs">{d.operating_system || "—"}</td>
                    <td className="font-mono text-xs">{d.ip_address || "—"}</td>
                    <td className="capitalize">{d.connection_type || "—"}</td>
                    <td>
                      <span className={`status-badge ${d.vpn_status === 'connected' ? 'status-available' : 'status-retired'}`}>
                        {d.vpn_status === 'connected' ? 'Conectado' : 'Desconectado'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${healthColors[d.health_status || 'offline']}`}>
                        {healthLabels[d.health_status || 'offline']}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${d.agent_installed ? 'status-available' : 'status-retired'}`}>
                        {d.agent_installed ? `v${d.agent_version || '?'}` : 'No'}
                      </span>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs font-mono"
                        onClick={() => openIntervalConfig(d)}
                      >
                        <Settings2 className="h-3 w-3 mr-1" />
                        {formatInterval(d.report_interval || 60)}
                      </Button>
                    </td>
                    <td className="text-xs text-muted-foreground">{formatLastSeen(d.last_seen)}</td>
                    {userRole === "admin" && (
                      <td>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => updateSingleAgent(d)}
                            disabled={!d.agent_installed || updatingDeviceId === d.id || !buildAgentUpdatePayload(d)}
                            title="Actualizar agente"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDevice(d)}
                            title="Eliminar dispositivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No se encontraron dispositivos</div>
            )}
            {loading && (
              <div className="text-center py-12 text-muted-foreground">Cargando dispositivos...</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Interval Config Dialog */}
      <Dialog open={!!intervalDevice} onOpenChange={(open) => !open && setIntervalDevice(null)}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Configurar Intervalo de Reporte</DialogTitle>
          </DialogHeader>
          {intervalDevice && (
            <div className="space-y-6 pt-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{intervalDevice.hostname}</span>
                <span className="ml-2 font-mono text-xs">({intervalDevice.device_id})</span>
              </div>
              <div className="space-y-3">
                <Label>Intervalo: <span className="font-bold text-primary">{formatInterval(intervalValue)}</span></Label>
                <input
                  type="range"
                  min={10}
                  max={3600}
                  step={10}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10s</span>
                  <span>1m</span>
                  <span>5m</span>
                  <span>15m</span>
                  <span>1h</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                {[10, 30, 60, 300, 600, 900, 1800, 3600].map(v => (
                  <Button
                    key={v}
                    size="sm"
                    variant={intervalValue === v ? "default" : "outline"}
                    className="text-xs px-2 h-7 w-full sm:w-auto"
                    onClick={() => setIntervalValue(v)}
                  >
                    {formatInterval(v)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                El agente ajustará su intervalo en el próximo ciclo de reporte.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIntervalDevice(null)}>Cancelar</Button>
                <Button onClick={saveInterval} disabled={savingInterval}>
                  {savingInterval ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deviceToDelete} onOpenChange={(open) => !open && setDeviceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar dispositivo</AlertDialogTitle>
            <AlertDialogDescription>
              {deviceToDelete
                ? `¿Seguro que deseas eliminar ${deviceToDelete.hostname} (${deviceToDelete.device_id})? Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDevice}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDevice}
              disabled={deletingDevice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDevice ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Devices;
