#!/bin/bash
# IT Service Desk - Disable Legacy Agents (Linux/macOS)
# Usage: sudo bash disable-legacy-agents.sh [--disable-rust-agent]

set -euo pipefail

DISABLE_RUST=false
if [[ "${1:-}" == "--disable-rust-agent" ]]; then
  DISABLE_RUST=true
fi

stop_systemd_service() {
  local service_name="$1"
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files | grep -q "^${service_name}"; then
      systemctl stop "$service_name" 2>/dev/null || true
      systemctl disable "$service_name" 2>/dev/null || true
      echo "[OK] Disabled service: $service_name"
    else
      echo "[INFO] Service not found: $service_name"
    fi
  fi
}

stop_launchd_service() {
  local label="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    launchctl bootout system "/Library/LaunchDaemons/${label}.plist" 2>/dev/null || true
    echo "[OK] Stopped launchd label (if existed): $label"
  fi
}

stop_systemd_service "itagent.service"
stop_launchd_service "com.itservicedesk.agent"

if $DISABLE_RUST; then
  stop_systemd_service "itagent-rust.service"
  stop_launchd_service "com.itservicedesk.agent.rust"
fi

echo "[DONE] Legacy agent disable step completed."
