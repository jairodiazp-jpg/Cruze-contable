#!/bin/bash
# IT Service Desk - Rust Agent Installer for Linux/macOS v3.1.0
# Usage: sudo bash agent-rust-installer.sh --token "YOUR_ENROLLMENT_TOKEN"

set -euo pipefail

TOKEN=""
SERVER_URL="https://dyhazspvhsymfwizyaol.supabase.co/functions/v1/agent-api"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aGF6c3B2aHN5bWZ3aXp5YW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzc3ODcsImV4cCI6MjA4OTExMzc4N30.l0Nq9ftTZznG8fN3En5PQt_thBskQCbmVxC7Ke8NSSY"
AGENT_SHARED_KEY=""
INTERVAL=60
INSTALL_PATH="/opt/itagent-rust"
KEEP_LEGACY_ENABLED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --server) SERVER_URL="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --agent-shared-key) AGENT_SHARED_KEY="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --path) INSTALL_PATH="$2"; shift 2 ;;
    --keep-legacy-enabled) KEEP_LEGACY_ENABLED=true; shift 1 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Usage: sudo bash $0 --token <ENROLLMENT_TOKEN>"
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "[ERROR] Run as root"
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[ERROR] cargo not found. Install Rust first: https://rustup.rs"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_ROOT="$(cd "$SCRIPT_DIR/../rust-agent" && pwd)"

if [[ "$KEEP_LEGACY_ENABLED" != "true" ]]; then
  LEGACY_DISABLE_SCRIPT="$SCRIPT_DIR/disable-legacy-agents.sh"
  if [[ -f "$LEGACY_DISABLE_SCRIPT" ]]; then
    echo "[INFO] Disabling legacy services before Rust install..."
    bash "$LEGACY_DISABLE_SCRIPT"
  fi
fi

mkdir -p "$INSTALL_PATH"

pushd "$AGENT_ROOT" >/dev/null
cargo build --release
popd >/dev/null

BIN_SOURCE="$AGENT_ROOT/target/release/itagent-rs"
if [[ ! -f "$BIN_SOURCE" ]]; then
  echo "[ERROR] Compiled binary not found: $BIN_SOURCE"
  exit 1
fi

cp "$BIN_SOURCE" "$INSTALL_PATH/itagent-rs"
chmod +x "$INSTALL_PATH/itagent-rs"

ENROLL_CMD=("$INSTALL_PATH/itagent-rs" "--server" "$SERVER_URL" "--api-key" "$API_KEY")
if [[ -n "$AGENT_SHARED_KEY" ]]; then
  ENROLL_CMD+=("--agent-shared-key" "$AGENT_SHARED_KEY")
fi
ENROLL_CMD+=("enroll" "--token" "$TOKEN")

DEVICE_ID="$("${ENROLL_CMD[@]}")"
if [[ -z "$DEVICE_ID" ]]; then
  echo "[ERROR] Enrollment failed"
  exit 1
fi

SHARED_ARG=""
if [[ -n "$AGENT_SHARED_KEY" ]]; then
  SHARED_ARG="--agent-shared-key \"$AGENT_SHARED_KEY\""
fi

cat > "$INSTALL_PATH/launcher-rust.sh" <<EOF
#!/bin/bash
exec "$INSTALL_PATH/itagent-rs" \
  --server "$SERVER_URL" \
  --api-key "$API_KEY" \
  $SHARED_ARG \
  --device-id "$DEVICE_ID" \
  --interval "$INTERVAL"
EOF
chmod +x "$INSTALL_PATH/launcher-rust.sh"

if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="/Library/LaunchDaemons/com.itservicedesk.agent.rust.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.itservicedesk.agent.rust</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$INSTALL_PATH/launcher-rust.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_PATH/agent-rust.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_PATH/agent-rust-error.log</string>
</dict>
</plist>
EOF
  launchctl load "$PLIST" 2>/dev/null || true
else
  SERVICE_FILE="/etc/systemd/system/itagent-rust.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=IT Service Desk Rust Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_PATH/launcher-rust.sh
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_PATH/agent-rust.log
StandardError=append:$INSTALL_PATH/agent-rust-error.log

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable itagent-rust.service
  systemctl start itagent-rust.service
fi

cat > "$INSTALL_PATH/config-rust.json" <<EOF
{
  "device_id": "$DEVICE_ID",
  "server_url": "$SERVER_URL",
  "interval": $INTERVAL,
  "agent_version": "3.1.0-rust"
}
EOF

echo "[OK] Rust agent installed. Device ID: $DEVICE_ID"
