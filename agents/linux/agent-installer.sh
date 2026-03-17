#!/bin/bash
# ============================================================
# IT Service Desk - Agent Installer for Linux/macOS v3.1.0
# Usage: sudo bash agent-installer.sh --token "YOUR_ENROLLMENT_TOKEN"
# ============================================================

set -e

TOKEN=""
SERVER_URL="https://dyhazspvhsymfwizyaol.supabase.co/functions/v1/agent-api"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aGF6c3B2aHN5bWZ3aXp5YW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzc3ODcsImV4cCI6MjA4OTExMzc4N30.l0Nq9ftTZznG8fN3En5PQt_thBskQCbmVxC7Ke8NSSY"
INTERVAL=60
INSTALL_PATH="/opt/itagent"

while [[ $# -gt 0 ]]; do
    case $1 in
        --token) TOKEN="$2"; shift 2;;
        --server) SERVER_URL="$2"; shift 2;;
        --api-key) API_KEY="$2"; shift 2;;
        --interval) INTERVAL="$2"; shift 2;;
        --path) INSTALL_PATH="$2"; shift 2;;
        *) echo "Unknown option: $1"; exit 1;;
    esac
done

if [ -z "$TOKEN" ]; then
    echo "Usage: sudo bash $0 --token \"YOUR_ENROLLMENT_TOKEN\""
    exit 1
fi

echo ""
echo "====================================================="
echo "  IT Service Desk - Agent Installer v3.1.0"
echo "  Full Platform Integration"
echo "====================================================="
echo ""

# 1. Check root
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] This installer must be run as root (use sudo)."
    exit 1
fi

# Check dependencies
for cmd in curl; do
    if ! command -v $cmd &>/dev/null; then
        echo "[ERROR] $cmd is required. Install it first."
        exit 1
    fi
done

# Install jq if missing
if ! command -v jq &>/dev/null; then
    echo "[INFO] Installing jq (required for policy sync)..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq 2>/dev/null || echo "[WARN] Could not install jq. Install manually: brew install jq"
    else
        apt-get install -y jq 2>/dev/null || yum install -y jq 2>/dev/null || echo "[WARN] Could not install jq. Install manually."
    fi
fi

# 2. Create install directory
echo "[1/6] Creating install directory: $INSTALL_PATH"
mkdir -p "$INSTALL_PATH"

# 3. Register device
echo "[2/6] Registering device with enrollment token..."

HOSTNAME_VAL=$(hostname)
USER_VAL=$(logname 2>/dev/null || whoami)

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_VAL="$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"
    IP_VAL=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
    MAC_VAL=$(ifconfig en0 2>/dev/null | awk '/ether/{print $2}' || echo "unknown")
    SERIAL_VAL=$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial/{print $4}' || echo "unknown")
else
    OS_VAL=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || uname -s)
    IP_VAL=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
    MAC_VAL=$(ip link show 2>/dev/null | awk '/ether/{print $2; exit}' || echo "unknown")
    SERIAL_VAL=$(dmidecode -s system-serial-number 2>/dev/null || cat /sys/class/dmi/id/product_serial 2>/dev/null || echo "unknown")
fi

REGISTER_BODY=$(cat <<EOF
{
    "token": "$TOKEN",
    "hostname": "$HOSTNAME_VAL",
    "operating_system": "$OS_VAL",
    "ip_address": "$IP_VAL",
    "mac_address": "$MAC_VAL",
    "user_assigned": "$USER_VAL",
    "serial_number": "$SERIAL_VAL",
    "agent_version": "3.1.0"
}
EOF
)

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/register" \
    -H "Content-Type: application/json" \
    -H "apikey: $API_KEY" \
    -d "$REGISTER_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    ERROR_MSG=$(echo "$BODY" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo "[ERROR] Registration failed: $ERROR_MSG"
    exit 1
fi

DEVICE_ID=$(echo "$BODY" | grep -o '"device_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
    echo "[ERROR] Could not parse device_id from response."
    echo "$BODY"
    exit 1
fi

echo "[OK] Device registered as: $DEVICE_ID"

# 4. Copy agent script
echo "[3/6] Installing agent v3.1.0..."

AGENT_SOURCE="$(dirname "$0")/agent.sh"
if [ -f "$AGENT_SOURCE" ]; then
    cp "$AGENT_SOURCE" "$INSTALL_PATH/agent.sh"
    echo "[OK] Copied agent.sh from installer directory"
else
    echo "[ERROR] agent.sh not found alongside installer. Place both files in the same directory."
    exit 1
fi

chmod +x "$INSTALL_PATH/agent.sh"

# Create launcher script with embedded config
cat > "$INSTALL_PATH/launcher.sh" << LAUNCHER_EOF
#!/bin/bash
# IT Service Desk Agent Launcher v3.1.0
# Auto-generated. Do not edit.
exec "$INSTALL_PATH/agent.sh" \\
    --server "$SERVER_URL" \\
    --device-id "$DEVICE_ID" \\
    --interval $INTERVAL \\
    --api-key "$API_KEY"
LAUNCHER_EOF
chmod +x "$INSTALL_PATH/launcher.sh"

# Save config
cat > "$INSTALL_PATH/config.json" << CONF
{
    "device_id": "$DEVICE_ID",
    "server_url": "$SERVER_URL",
    "interval": $INTERVAL,
    "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "agent_version": "3.1.0",
    "features": ["diagnostics","hosts-blocking","app-control","vpn-blocking","anti-bypass","licenses","backup","email-config","policy-sync","script-execution"]
}
CONF

# 5. Create backup directory
echo "[4/6] Creating backup directory..."
mkdir -p /var/backups/it-agent

# 6. Install as system service
echo "[5/6] Installing as system service..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    PLIST="/Library/LaunchDaemons/com.itservicedesk.agent.plist"
    cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.itservicedesk.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_PATH/launcher.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_PATH/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_PATH/agent-error.log</string>
</dict>
</plist>
PLIST_EOF
    launchctl load "$PLIST" 2>/dev/null
    echo "[OK] LaunchDaemon installed: com.itservicedesk.agent"
else
    SERVICE_FILE="/etc/systemd/system/itagent.service"
    cat > "$SERVICE_FILE" << SERVICE_EOF
[Unit]
Description=IT Service Desk Remote Agent v3.1.0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_PATH/launcher.sh
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_PATH/agent.log
StandardError=append:$INSTALL_PATH/agent-error.log

[Install]
WantedBy=multi-user.target
SERVICE_EOF
    systemctl daemon-reload
    systemctl enable itagent.service
    systemctl start itagent.service
    echo "[OK] Systemd service installed: itagent.service"
fi

echo "[6/6] Agent started!"

echo ""
echo "====================================================="
echo "  Installation Complete!"
echo "====================================================="
echo ""
echo "  Device ID:    $DEVICE_ID"
echo "  Install Path: $INSTALL_PATH"
echo "  Interval:     ${INTERVAL}s"
echo ""
echo "  Capabilities:"
echo "    - System diagnostics (CPU, RAM, Disk, Network)"
echo "    - Domain blocking (hosts file, incremental)"
echo "    - Application control (process termination)"
echo "    - VPN port blocking (1194, 1701, 1723, 500, 4500)"
echo "    - Anti-bypass detection (DNS, VPN, proxy, hosts)"
echo "    - License management"
echo "    - Backup (Documents, Desktop, Pictures)"
echo "    - Email auto-configuration"
echo "    - Policy sync from server"
echo "    - Remote script execution"
echo "    - Network repair & diagnostics"
echo ""
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  Service: com.itservicedesk.agent (launchd)"
    echo "  Logs:    $INSTALL_PATH/agent.log"
    echo "  Manage:  sudo launchctl stop com.itservicedesk.agent"
    echo "           sudo launchctl start com.itservicedesk.agent"
else
    echo "  Service: itagent.service (systemd)"
    echo "  Logs:    $INSTALL_PATH/agent.log"
    echo "  Manage:  sudo systemctl status itagent"
    echo "           sudo systemctl restart itagent"
fi
echo ""
