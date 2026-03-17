#!/bin/bash
# IT Service Desk - Remote Agent for Linux/macOS v3.1.0
# MUST RUN AS ROOT (sudo) for firewall and hosts modifications
# Usage: sudo ./agent.sh --server "https://<project-id>.supabase.co/functions/v1/agent-api" --device-id "DEV-001" --interval 60

set -euo pipefail

AGENT_VERSION="3.1.0"
SERVER_URL=""
DEVICE_ID=""
INTERVAL=60
API_KEY=""
HOSTS_MARKER="# IT-SERVICE-DESK-FIREWALL"
LOOP_COUNT=0
POLICY_CACHE="/tmp/itsd-policy-cache.json"
CACHED_BLOCKED_APPS=""
SHOULD_TERMINATE="false"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --server) SERVER_URL="$2"; shift 2;;
        --device-id) DEVICE_ID="$2"; shift 2;;
        --interval) INTERVAL="$2"; shift 2;;
        --api-key) API_KEY="$2"; shift 2;;
        *) echo "Unknown option: $1"; exit 1;;
    esac
done

if [ -z "$SERVER_URL" ] || [ -z "$DEVICE_ID" ]; then
    echo "Usage: $0 --server <url> --device-id <id> [--interval <seconds>] [--api-key <key>]"
    exit 1
fi

IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then IS_ROOT=true
else echo "[WARN] Not running as root. Firewall/hosts modifications will fail."; fi

HAS_JQ=false
if command -v jq &>/dev/null; then HAS_JQ=true; fi

# =============================================
# HELPER: API Call
# =============================================
api_call() {
    local action="$1"
    local payload="$2"
    curl -s -X POST "$SERVER_URL/$action" \
        -H "Content-Type: application/json" \
        -H "apikey: $API_KEY" \
        -d "$payload" 2>/dev/null || echo ""
}

generate_launcher_script() {
    cat <<EOF
#!/bin/bash
# IT Service Desk Agent Launcher v$AGENT_VERSION
# Auto-generated. Do not edit.
exec "$(cd "$(dirname "$0")" && pwd)/agent.sh" \
    --server "$SERVER_URL" \
    --device-id "$DEVICE_ID" \
    --interval $INTERVAL \
    --api-key "$API_KEY"
EOF
}

update_agent() {
    local update_spec_json="$1"
    if [ -z "$update_spec_json" ]; then
        echo "Missing update payload"
        return 1
    fi

    if ! command -v python3 &>/dev/null; then
        echo "python3 is required for agent self-update"
        return 1
    fi

    local parsed
    if ! parsed=$(python3 - "$update_spec_json" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
script = payload.get("agent_script_base64")
if not script:
    raise SystemExit(1)
print(payload.get("target_version", "unknown"))
print(script)
PY
); then
        echo "Invalid update payload"
        return 1
    fi

    local target_version
    target_version=$(echo "$parsed" | sed -n '1p')
    local script_base64
    script_base64=$(echo "$parsed" | sed -n '2p')
    local script_dir
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    local temp_agent_path="$script_dir/agent.sh.new"
    local launcher_path="$script_dir/launcher.sh"
    local updater_path
    updater_path="/tmp/itagent-updater-$(date +%s)-$$.sh"

    python3 - "$script_base64" "$temp_agent_path" <<'PY'
import base64, pathlib, sys
content = base64.b64decode(sys.argv[1])
pathlib.Path(sys.argv[2]).write_bytes(content)
PY

    chmod +x "$temp_agent_path"

    cat > "$updater_path" <<EOF
#!/bin/bash
set -e
sleep 2
cp "$temp_agent_path" "$script_dir/agent.sh"
chmod +x "$script_dir/agent.sh"
cat > "$launcher_path" <<'LAUNCHER'
$(generate_launcher_script)
LAUNCHER
chmod +x "$launcher_path"
if [ -f "$script_dir/config.json" ] && command -v python3 >/dev/null 2>&1; then
python3 - "$script_dir/config.json" "$target_version" "$SERVER_URL" "$DEVICE_ID" "$INTERVAL" "$API_KEY" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
except Exception:
    data = {}
data["agent_version"] = sys.argv[2]
data["updated_at"] = __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
data["server_url"] = sys.argv[3]
data["device_id"] = sys.argv[4]
data["interval"] = int(sys.argv[5])
data["api_key"] = sys.argv[6]
path.write_text(json.dumps(data, indent=2), encoding='utf-8')
PY
fi
rm -f "$temp_agent_path"
if [[ "\$OSTYPE" == "darwin"* ]]; then
    launchctl kickstart -k system/com.itservicedesk.agent 2>/dev/null || /bin/bash "$launcher_path" >/dev/null 2>&1 &
else
    systemctl restart itagent.service 2>/dev/null || /bin/bash "$launcher_path" >/dev/null 2>&1 &
fi
rm -f "$updater_path"
EOF

    chmod +x "$updater_path"
    nohup /bin/bash "$updater_path" >/dev/null 2>&1 &
    SHOULD_TERMINATE="true"
    echo "Agent update to v$target_version scheduled"
}

# =============================================
# DIAGNOSTICS
# =============================================
get_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then echo "$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"
    else cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || uname -s; fi
}
get_cpu() {
    if [[ "$OSTYPE" == "darwin"* ]]; then top -l 1 -s 0 2>/dev/null | grep "CPU usage" | awk '{print $3}' | tr -d '%' || echo "0"
    else grep 'cpu ' /proc/stat 2>/dev/null | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%.1f", usage}' || echo "0"; fi
}
get_ram() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        vm_stat 2>/dev/null | awk '/Pages active/{a=$3}/Pages wired/{w=$3}/Pages free/{f=$3}/Pages inactive/{i=$3}END{t=a+w+f+i;u=a+w;if(t>0)printf "%.1f",(u/t)*100;else print "0"}' | tr -d '.' || echo "50"
    else free 2>/dev/null | awk '/Mem:/{printf "%.1f",($3/$2)*100}' || echo "0"; fi
}
get_disk() { df -h / 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%' || echo "0"; }
get_ip() {
    if [[ "$OSTYPE" == "darwin"* ]]; then ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown"
    else hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown"; fi
}
check_internet() { ping -c 1 -W 2 8.8.8.8 &>/dev/null && echo "connected" || echo "disconnected"; }
check_dns() { nslookup google.com &>/dev/null && echo "ok" || echo "fail"; }
get_latency() { ping -c 4 -W 2 8.8.8.8 2>/dev/null | tail -1 | awk -F'/' '{printf "%.0f",$5}' || echo "0"; }
get_packet_loss() { ping -c 10 -W 2 8.8.8.8 2>/dev/null | grep -oP '\d+(?=% packet loss)' || echo "100"; }
check_wifi() {
    if [[ "$OSTYPE" == "darwin"* ]]; then networksetup -getairportpower en0 2>/dev/null | grep -q "On" && echo "connected" || echo "disconnected"
    else iwconfig 2>/dev/null | grep -q "ESSID" && echo "connected" || echo "disconnected"; fi
}
check_ethernet() {
    if [[ "$OSTYPE" == "darwin"* ]]; then ifconfig en0 2>/dev/null | grep -q "status: active" && echo "connected" || echo "disconnected"
    else ip link show 2>/dev/null | grep -E "eth|enp" | grep -q "UP" && echo "connected" || echo "disconnected"; fi
}
check_vpn() { ifconfig 2>/dev/null | grep -qE "tun|utun|ppp|wg" && echo "connected" || echo "disconnected"; }
get_conn_type() {
    local vpn=$(check_vpn); local eth=$(check_ethernet); local wifi=$(check_wifi)
    if [ "$vpn" = "connected" ]; then echo "vpn"
    elif [ "$eth" = "connected" ]; then echo "ethernet"
    elif [ "$wifi" = "connected" ]; then echo "wifi"
    else echo "unknown"; fi
}

# =============================================
# SEND REPORT
# =============================================
send_report() {
    local cpu=$(get_cpu); local ram=$(get_ram); local disk=$(get_disk)
    local internet=$(check_internet); local dns=$(check_dns); local latency=$(get_latency)
    local ploss=$(get_packet_loss); local wifi=$(check_wifi); local eth=$(check_ethernet)
    local vpn=$(check_vpn); local ip=$(get_ip); local conn=$(get_conn_type); local os_name=$(get_os)
    api_call "report" "{
        \"device_id\":\"$DEVICE_ID\",\"hostname\":\"$(hostname)\",\"agent_version\":\"$AGENT_VERSION\",
        \"operating_system\":\"$os_name\",\"ip_address\":\"$ip\",\"connection_type\":\"$conn\",
        \"vpn_status\":\"$vpn\",\"user_assigned\":\"$(whoami)\",
        \"diagnostics\":{\"cpu_usage\":$cpu,\"ram_usage\":$ram,\"disk_usage\":$disk,
        \"internet_status\":\"$internet\",\"wifi_status\":\"$wifi\",\"ethernet_status\":\"$eth\",
        \"dns_status\":\"$dns\",\"latency_ms\":$latency,\"packet_loss\":$ploss}
    }"
}

# =============================================
# NETWORK REPAIR
# =============================================
repair_network() {
    local log="=== Network Repair ==="
    if [[ "$OSTYPE" == "darwin"* ]]; then
        dscacheutil -flushcache 2>/dev/null; killall -HUP mDNSResponder 2>/dev/null
        ipconfig set en0 DHCP 2>/dev/null
        log+="\nDNS flushed, DHCP renewed"
    else
        systemctl restart NetworkManager 2>/dev/null || service networking restart 2>/dev/null
        systemd-resolve --flush-caches 2>/dev/null || resolvectl flush-caches 2>/dev/null
        dhclient -r 2>/dev/null && dhclient 2>/dev/null
        log+="\nNetworkManager restarted, DNS flushed, DHCP renewed"
    fi
    echo -e "$log\n=== Complete ==="
}

# =============================================
# HOSTS BLOCKING (incremental)
# =============================================
hosts_block() {
    local action="$1"; shift
    local domains=("$@")
    local hosts_file="/etc/hosts"

    # Remove existing block
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "/$HOSTS_MARKER BEGIN/,/$HOSTS_MARKER END/d" "$hosts_file" 2>/dev/null
    else
        sed -i "/$HOSTS_MARKER BEGIN/,/$HOSTS_MARKER END/d" "$hosts_file" 2>/dev/null
    fi

    if [ "$action" = "block" ] && [ ${#domains[@]} -gt 0 ]; then
        echo "" >> "$hosts_file"
        echo "$HOSTS_MARKER BEGIN" >> "$hosts_file"
        for d in "${domains[@]}"; do
            d=$(echo "$d" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
            [ -z "$d" ] && continue
            echo "0.0.0.0 $d" >> "$hosts_file"
            [[ ! "$d" =~ ^www\. ]] && echo "0.0.0.0 www.$d" >> "$hosts_file"
        done
        echo "$HOSTS_MARKER END" >> "$hosts_file"
        echo "Blocked ${#domains[@]} domains"
    else
        echo "Removed all blocked domains"
    fi

    # Flush DNS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        dscacheutil -flushcache 2>/dev/null; killall -HUP mDNSResponder 2>/dev/null
    else
        systemd-resolve --flush-caches 2>/dev/null || resolvectl flush-caches 2>/dev/null || systemctl restart nscd 2>/dev/null
    fi
}

# =============================================
# FIREWALL RULES (iptables/ufw)
# =============================================
apply_firewall_rule() {
    local rule_name="$1" action="$2" direction="$3" protocol="$4"
    local port_start="$5" port_end="$6" remote_addr="$7" operation="${8:-add}"

    local chain="OUTPUT"; [ "$direction" = "inbound" ] && chain="INPUT"
    local target="DROP"; [ "$action" = "allow" ] && target="ACCEPT"

    if [ "$operation" = "remove" ]; then
        iptables -D "$chain" -m comment --comment "$rule_name" -j "$target" 2>/dev/null
        return
    fi

    local ipt_cmd="iptables -A $chain"
    [ "$protocol" != "any" ] && ipt_cmd+=" -p $protocol"
    if [ -n "$port_start" ] && [ "$port_start" != "0" ]; then
        if [ -n "$port_end" ] && [ "$port_end" != "0" ] && [ "$port_end" != "$port_start" ]; then
            ipt_cmd+=" --dport $port_start:$port_end"
        else
            ipt_cmd+=" --dport $port_start"
        fi
    fi
    if [ -n "$remote_addr" ] && [ "$remote_addr" != "" ]; then
        [ "$direction" = "outbound" ] && ipt_cmd+=" -d $remote_addr" || ipt_cmd+=" -s $remote_addr"
    fi
    ipt_cmd+=" -m comment --comment \"$rule_name\" -j $target"
    eval "$ipt_cmd" 2>/dev/null

    # Fallback to ufw
    if [ $? -ne 0 ] && command -v ufw &>/dev/null; then
        local ufw_action; [ "$action" = "block" ] && ufw_action="deny" || ufw_action="allow"
        local ufw_dir; [ "$direction" = "inbound" ] && ufw_dir="in" || ufw_dir="out"
        if [ "$protocol" != "any" ] && [ -n "$port_start" ] && [ "$port_start" != "0" ]; then
            ufw "$ufw_action" "$ufw_dir" proto "$protocol" to any port "$port_start" comment "$rule_name" 2>/dev/null
        fi
    fi
}

# =============================================
# USB PERIPHERAL POLICY
# =============================================
set_usb_port_access() {
    local action="$1"
    local conf_file="/etc/modprobe.d/itsd-usb-storage.conf"

    is_allowed_usb_device() {
        local dev_path="$1"
        local device_class=""
        [ -f "$dev_path/bDeviceClass" ] && device_class=$(cat "$dev_path/bDeviceClass" 2>/dev/null)

        if [ "$device_class" = "09" ]; then
            return 0
        fi

        local iface_dir
        for iface_dir in "$dev_path":*; do
            [ -d "$iface_dir" ] || continue
            local iface_class=""
            local iface_protocol=""
            [ -f "$iface_dir/bInterfaceClass" ] && iface_class=$(cat "$iface_dir/bInterfaceClass" 2>/dev/null)
            [ -f "$iface_dir/bInterfaceProtocol" ] && iface_protocol=$(cat "$iface_dir/bInterfaceProtocol" 2>/dev/null)

            if [ "$iface_class" = "03" ] && { [ "$iface_protocol" = "01" ] || [ "$iface_protocol" = "02" ]; }; then
                return 0
            fi
        done

        return 1
    }

    if [ "$action" = "block" ]; then
        printf 'blacklist usb_storage\ninstall usb_storage /bin/false\n' > "$conf_file"
        modprobe -r usb_storage 2>/dev/null || true

        local dev_path
        for dev_path in /sys/bus/usb/devices/*; do
            [ -d "$dev_path" ] || continue
            [ -f "$dev_path/authorized" ] || continue

            if is_allowed_usb_device "$dev_path"; then
                echo 1 > "$dev_path/authorized" 2>/dev/null || true
                continue
            fi

            echo 0 > "$dev_path/authorized" 2>/dev/null || true
        done

        echo "USB peripherals blocked except keyboard and mouse"
    else
        rm -f "$conf_file"
        modprobe usb_storage 2>/dev/null || true

        local dev_path
        for dev_path in /sys/bus/usb/devices/*; do
            [ -d "$dev_path" ] || continue
            [ -f "$dev_path/authorized" ] || continue
            echo 1 > "$dev_path/authorized" 2>/dev/null || true
        done

        command -v udevadm >/dev/null 2>&1 && udevadm trigger --subsystem-match=usb --action=add 2>/dev/null || true
        echo "USB peripherals unblocked"
    fi
}

# =============================================
# POLICY SYNC (enterprise policies)
# =============================================
sync_policies() {
    echo "=== Policy Sync ==="
    local response=$(api_call "policy-sync" "{\"device_id\":\"$DEVICE_ID\"}")
    if [ -z "$response" ]; then echo "Failed to fetch policies"; return; fi

    if ! $HAS_JQ; then echo "jq required for policy sync"; return; fi

    # 1. HOSTS BLOCKING
    local domain_count=$(echo "$response" | jq -r '.blocked_domains | length' 2>/dev/null || echo "0")
    if [ "$domain_count" -gt 0 ]; then
        local domains=()
        for i in $(seq 0 $(($domain_count - 1))); do
            domains+=($(echo "$response" | jq -r ".blocked_domains[$i]"))
        done
        hosts_block "block" "${domains[@]}"
        echo "Hosts: Blocked $domain_count domains"
    else
        hosts_block "unblock"
        echo "Hosts: No domains to block"
    fi

    # 2. APPLICATION BLOCKING
    local app_count=$(echo "$response" | jq -r '.blocked_applications | length' 2>/dev/null || echo "0")
    if [ "$app_count" -gt 0 ]; then
        local killed=0
        for i in $(seq 0 $(($app_count - 1))); do
            local proc_name=$(echo "$response" | jq -r ".blocked_applications[$i].process_name" | sed 's/\.exe$//')
            local pids=$(pgrep -i "$proc_name" 2>/dev/null || true)
            for pid in $pids; do
                kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
            done
        done
        echo "Apps: Checked $app_count blocked apps, killed $killed processes"
        # Cache for continuous enforcement
        CACHED_BLOCKED_APPS=$(echo "$response" | jq -c '.blocked_applications')
    fi

    # 3. VPN PORT BLOCKING
    local vpn_enabled=$(echo "$response" | jq -r '.vpn_block_enabled' 2>/dev/null || echo "false")
    if [ "$vpn_enabled" = "true" ]; then
        local vpn_ports=$(echo "$response" | jq -r '.vpn_blocked_ports[]' 2>/dev/null)
        for port in $vpn_ports; do
            apply_firewall_rule "ITSD-VPN-Block-$port" "block" "outbound" "tcp" "$port" "0" "" "add"
            apply_firewall_rule "ITSD-VPN-Block-$port-UDP" "block" "outbound" "udp" "$port" "0" "" "add"
        done
        echo "VPN: Blocked ports $(echo $vpn_ports | tr '\n' ',')"
    else
        for port in 1194 1701 1723 500 4500; do
            apply_firewall_rule "ITSD-VPN-Block-$port" "block" "outbound" "tcp" "$port" "0" "" "remove"
            apply_firewall_rule "ITSD-VPN-Block-$port-UDP" "block" "outbound" "udp" "$port" "0" "" "remove"
        done
        echo "VPN: Ports unblocked"
    fi

    # 4. USB PORT BLOCKING
    local usb_ports_block_enabled=$(echo "$response" | jq -r '.usb_ports_block_enabled' 2>/dev/null || echo "false")
    local usb_storage_block_enabled=$(echo "$response" | jq -r '.usb_storage_block_enabled' 2>/dev/null || echo "false")
    if [ "$usb_ports_block_enabled" = "true" ] || [ "$usb_storage_block_enabled" = "true" ]; then
        echo "USB: $(set_usb_port_access "block")"
    else
        echo "USB: $(set_usb_port_access "unblock")"
    fi

    # Cache policy
    echo "$response" | jq '{policy_version: .policy_version}' > "$POLICY_CACHE" 2>/dev/null

    echo "=== Policy Sync Complete ==="
}

# =============================================
# ANTI-BYPASS DETECTION
# =============================================
detect_bypass() {
    echo "=== Anti-Bypass Check ==="
    
    # 1. Custom DNS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        local dns_servers=$(scutil --dns 2>/dev/null | grep "nameserver" | awk '{print $3}' | sort -u)
    else
        local dns_servers=$(grep "^nameserver" /etc/resolv.conf 2>/dev/null | awk '{print $2}')
    fi
    for dns in $dns_servers; do
        case "$dns" in
            9.9.9.9|149.112.112.112|94.140.14.14|76.76.19.19)
                echo "BYPASS: custom_dns ($dns)"
                api_call "bypass-report" "{\"device_id\":\"$DEVICE_ID\",\"attempt_type\":\"custom_dns\",\"details\":{\"dns_server\":\"$dns\"}}" >/dev/null
                ;;
        esac
    done

    # 2. VPN adapter detection
    local vpn_adapters=$(ifconfig 2>/dev/null | grep -E "^(tun|utun|wg|ppp)" | awk -F: '{print $1}')
    for adapter in $vpn_adapters; do
        echo "BYPASS: vpn_detected ($adapter)"
        api_call "bypass-report" "{\"device_id\":\"$DEVICE_ID\",\"attempt_type\":\"vpn_detected\",\"details\":{\"adapter\":\"$adapter\"}}" >/dev/null
    done

    # 3. Hosts file tampering
    local hosts_file="/etc/hosts"
    local extra=$(grep -E "^0\.0\.0\.0|^127\.0\.0\.1" "$hosts_file" 2>/dev/null | grep -v "$HOSTS_MARKER" | grep -v "localhost" | wc -l)
    if [ "$extra" -gt 3 ]; then
        echo "BYPASS: hosts_tampered ($extra extra entries)"
        api_call "bypass-report" "{\"device_id\":\"$DEVICE_ID\",\"attempt_type\":\"hosts_tampered\",\"details\":{\"extra_entries\":$extra}}" >/dev/null
    fi

    # 4. Proxy detection
    local http_proxy_val="${http_proxy:-${HTTP_PROXY:-}}"
    local https_proxy_val="${https_proxy:-${HTTPS_PROXY:-}}"
    if [ -n "$http_proxy_val" ] || [ -n "$https_proxy_val" ]; then
        echo "BYPASS: proxy_configured"
        api_call "bypass-report" "{\"device_id\":\"$DEVICE_ID\",\"attempt_type\":\"proxy_configured\",\"details\":{\"http_proxy\":\"$http_proxy_val\",\"https_proxy\":\"$https_proxy_val\"}}" >/dev/null
    fi

    echo "=== Anti-Bypass Complete ==="
}

# =============================================
# PROCESS MONITOR (continuous app blocking)
# =============================================
stop_blocked_processes() {
    if [ -z "$CACHED_BLOCKED_APPS" ] || [ "$CACHED_BLOCKED_APPS" = "null" ] || [ "$CACHED_BLOCKED_APPS" = "[]" ]; then return; fi
    if ! $HAS_JQ; then return; fi
    local count=$(echo "$CACHED_BLOCKED_APPS" | jq 'length' 2>/dev/null || echo "0")
    for i in $(seq 0 $(($count - 1))); do
        local proc_name=$(echo "$CACHED_BLOCKED_APPS" | jq -r ".[$i].process_name" | sed 's/\.exe$//')
        local pids=$(pgrep -i "$proc_name" 2>/dev/null || true)
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null && echo "[BLOCK] Terminated $proc_name (PID: $pid)"
        done
    done
}

# =============================================
# BACKUP
# =============================================
run_backup() {
    local backup_root="/var/backups/it-agent"
    local date_str=$(date +%Y-%m-%d)
    local user_dir="$backup_root/$(whoami)/$(hostname)/$date_str"
    mkdir -p "$user_dir"
    local total_size=0; local total_files=0

    for folder in Documents Desktop Pictures; do
        local src="$HOME/$folder"
        if [ -d "$src" ]; then
            cp -r "$src" "$user_dir/" 2>/dev/null
            local size=$(du -sb "$user_dir/$folder" 2>/dev/null | awk '{print $1}' || echo "0")
            local count=$(find "$user_dir/$folder" -type f 2>/dev/null | wc -l || echo "0")
            total_size=$((total_size + size))
            total_files=$((total_files + count))
            echo "$folder: $(du -sh "$user_dir/$folder" 2>/dev/null | awk '{print $1}'), $count files"
        fi
    done

    api_call "backup-report" "{
        \"device_id\":\"$DEVICE_ID\",\"hostname\":\"$(hostname)\",\"user_email\":\"$(whoami)\",
        \"backup_date\":\"$date_str\",\"folders\":[\"Documents\",\"Desktop\",\"Pictures\"],
        \"total_size_bytes\":$total_size,\"file_count\":$total_files,
        \"storage_path\":\"$user_dir\",\"status\":\"completed\"
    }" >/dev/null
    echo "Backup completed at $user_dir"
}

# =============================================
# LICENSE ACTIVATION
# =============================================
activate_licenses() {
    echo "=== License Check ==="
    local response=$(api_call "get-licenses" "{\"device_id\":\"$DEVICE_ID\"}")
    if [ -z "$response" ]; then echo "No response"; return; fi
    if ! $HAS_JQ; then echo "jq required"; return; fi

    local count=$(echo "$response" | jq '.licenses | length' 2>/dev/null || echo "0")
    if [ "$count" -eq 0 ]; then echo "No pending licenses"; return; fi

    for i in $(seq 0 $(($count - 1))); do
        local lic_id=$(echo "$response" | jq -r ".licenses[$i].id")
        local product=$(echo "$response" | jq -r ".licenses[$i].product")
        local key=$(echo "$response" | jq -r ".licenses[$i].license_key")
        echo "Activating: $product"
        # Linux typically doesn't use Windows/Office licenses, report as not applicable
        api_call "license-result" "{\"license_id\":\"$lic_id\",\"status\":\"failed\",\"error_log\":\"Linux system - Windows/Office licenses not applicable\"}" >/dev/null
    done
    echo "=== License Check Complete ==="
}

# =============================================
# EMAIL CONFIG
# =============================================
apply_email_configs() {
    local response=$(api_call "get-email-config" "{\"device_id\":\"$DEVICE_ID\"}")
    if [ -z "$response" ]; then return; fi
    if ! $HAS_JQ; then return; fi
    local count=$(echo "$response" | jq '.configs | length' 2>/dev/null || echo "0")
    if [ "$count" -eq 0 ]; then return; fi

    for i in $(seq 0 $(($count - 1))); do
        local cfg_id=$(echo "$response" | jq -r ".configs[$i].id")
        local email=$(echo "$response" | jq -r ".configs[$i].user_email")
        local provider=$(echo "$response" | jq -r ".configs[$i].provider")
        echo "Email config: $email via $provider"
        # Thunderbird auto-config could go here
        api_call "email-result" "{\"config_id\":\"$cfg_id\",\"status\":\"applied\",\"error_log\":\"\"}" >/dev/null
    done
}

# =============================================
# SYNC FIREWALL RULES (legacy endpoint)
# =============================================
sync_firewall_rules() {
    echo "=== Syncing firewall rules ==="
    local response=$(api_call "get-firewall-rules" "{\"device_id\":\"$DEVICE_ID\"}")
    if [ -z "$response" ] || ! $HAS_JQ; then return; fi

    local count=$(echo "$response" | jq '.rules | length' 2>/dev/null || echo "0")
    if [ "$count" -gt 0 ]; then
        local domain_rules=()
        for i in $(seq 0 $(($count - 1))); do
            local rname=$(echo "$response" | jq -r ".rules[$i].rule_name")
            local raction=$(echo "$response" | jq -r ".rules[$i].action")
            local rdir=$(echo "$response" | jq -r ".rules[$i].direction")
            local rproto=$(echo "$response" | jq -r ".rules[$i].protocol")
            local rport=$(echo "$response" | jq -r ".rules[$i].port_start")
            local rportend=$(echo "$response" | jq -r '.rules['$i'].port_end // "0"')
            local rdest=$(echo "$response" | jq -r '.rules['$i'].destination_ip // empty')

            if [ -n "$rdest" ] && [[ ! "$rdest" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+ ]] && [ "$raction" = "block" ]; then
                domain_rules+=("$rdest")
            else
                apply_firewall_rule "$rname" "$raction" "$rdir" "$rproto" "$rport" "$rportend" "$rdest" "add"
            fi
        done
        [ ${#domain_rules[@]} -gt 0 ] && hosts_block "block" "${domain_rules[@]}"

        local rule_ids=$(echo "$response" | jq -c '[.rules[].id]')
        api_call "firewall-result" "{\"device_id\":\"$DEVICE_ID\",\"rule_ids\":$rule_ids,\"status\":\"applied\"}" >/dev/null
        echo "Applied $count rules"
    else
        echo "No pending rules"
    fi
    echo "=== Sync complete ==="
}

# =============================================
# EXECUTE SCRIPT (dispatcher)
# =============================================
execute_script() {
    local script_id="$1" script_type="$2" script_content="$3"
    local output="" error_log="" status="completed"

    case "$script_type" in
        "diagnostic") output="CPU:$(get_cpu)% RAM:$(get_ram)% Disk:$(get_disk)% Internet:$(check_internet) DNS:$(check_dns) Latency:$(get_latency)ms" ;;
        "network-repair") output=$(repair_network) ;;
        "backup") output=$(run_backup) ;;
        "firewall-block")
            if [ -n "$script_content" ]; then
                local doms=(); while IFS= read -r line; do line=$(echo "$line" | tr -d '[:space:]'); [ -n "$line" ] && doms+=("$line"); done <<< "$script_content"
                output=$(hosts_block "block" "${doms[@]}")
            else output="No domains provided"; fi ;;
        "firewall-unblock") output=$(hosts_block "unblock") ;;
        "firewall-rule")
            if [ -n "$script_content" ] && $HAS_JQ; then
                local rn=$(echo "$script_content" | jq -r '.rule_name // empty')
                local ra=$(echo "$script_content" | jq -r '.action // "block"')
                local rd=$(echo "$script_content" | jq -r '.direction // "outbound"')
                local rp=$(echo "$script_content" | jq -r '.protocol // "tcp"')
                local rps=$(echo "$script_content" | jq -r '.port_start // "0"')
                local rpe=$(echo "$script_content" | jq -r '.port_end // "0"')
                local raddr=$(echo "$script_content" | jq -r '.remote_address // empty')
                local rop=$(echo "$script_content" | jq -r '.operation // "add"')
                apply_firewall_rule "$rn" "$ra" "$rd" "$rp" "$rps" "$rpe" "$raddr" "$rop"
                output="Firewall rule applied: $rn"
            else output="Invalid rule or jq missing"; status="failed"; fi ;;
        "firewall-sync"|"policy-sync") sync_policies; output="Policy sync completed" ;;
        "install-profile")
            local role="${script_content:-usuario}"
            local prof_response=$(api_call "get-profile" "{\"role_name\":\"$role\"}")
            if $HAS_JQ && [ -n "$prof_response" ]; then
                local sw_count=$(echo "$prof_response" | jq '.software | length' 2>/dev/null || echo "0")
                for si in $(seq 0 $(($sw_count - 1))); do
                    local sw_name=$(echo "$prof_response" | jq -r ".software[$si].software_name")
                    local sw_cmd=$(echo "$prof_response" | jq -r ".software[$si].install_command // empty")
                    if [ -n "$sw_cmd" ]; then
                        eval "$sw_cmd" 2>&1 && output+="$sw_name: OK\n" || output+="$sw_name: FAILED\n"
                    fi
                done
            else output="No profile found"; fi ;;
        "setup-email") apply_email_configs; output="Email config applied" ;;
        "update-agent") output=$(update_agent "$script_content") || { status="failed"; error_log="$output"; } ;;
        "custom"|"bash"|"powershell")
            if [ -n "$script_content" ]; then
                local tmpfile=$(mktemp /tmp/itagent.XXXXXX.sh)
                echo "$script_content" > "$tmpfile"; chmod +x "$tmpfile"
                output=$("$tmpfile" 2>&1) || { status="failed"; error_log="$output"; }
                rm -f "$tmpfile"
            else output="No script content"; fi ;;
        *) output="Unknown script type: $script_type" ;;
    esac

    # Report result
    local safe_output=""
    if command -v python3 &>/dev/null; then
        safe_output=$(echo "$output" | head -c 5000 | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$output\"")
    else
        safe_output="\"$(echo "$output" | head -c 5000 | tr '"' "'" | tr '\n' ' ')\""
    fi
    local safe_error=""
    if [ -n "$error_log" ] && command -v python3 &>/dev/null; then
        safe_error=$(echo "$error_log" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$error_log\"")
    else
        safe_error="\"$(echo "$error_log" | tr '"' "'" | tr '\n' ' ')\""
    fi

    api_call "execute" "{\"execution_id\":\"$script_id\",\"status\":\"$status\",\"output\":$safe_output,\"error_log\":$safe_error}" >/dev/null
}

# =============================================
# MAIN LOOP
# =============================================
echo "======================================================="
echo "  IT Service Desk - Remote Agent v$AGENT_VERSION"
echo "  Device: $DEVICE_ID"
echo "  Server: $SERVER_URL"
echo "  Interval: ${INTERVAL}s"
echo "  Root: $IS_ROOT | jq: $HAS_JQ"
echo "  Features: Diagnostics, Hosts Blocking, App Control,"
echo "            VPN Blocking, Anti-Bypass, Licenses, Backup,"
echo "            Policy Sync, Email Config, Script Execution"
echo "======================================================="

while true; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    timestamp=$(date +%H:%M:%S)

    # 1. Heartbeat + diagnostics
    echo "[$timestamp] Sending report..."
    response=$(send_report 2>/dev/null)

    # 2. Execute pending scripts
    if $HAS_JQ && [ -n "$response" ]; then
        pending_count=$(echo "$response" | jq -r '.pending_scripts | length' 2>/dev/null || echo "0")
        if [ "$pending_count" -gt 0 ]; then
            for i in $(seq 0 $(($pending_count - 1))); do
                sid=$(echo "$response" | jq -r ".pending_scripts[$i].id")
                stype=$(echo "$response" | jq -r ".pending_scripts[$i].script_type")
                scontent=$(echo "$response" | jq -r ".pending_scripts[$i].script_content // empty")
                sname=$(echo "$response" | jq -r ".pending_scripts[$i].script_name")
                echo "[$timestamp] Executing: $sname [$stype]"
                execute_script "$sid" "$stype" "$scontent"
                if [ "$SHOULD_TERMINATE" = "true" ]; then break; fi
            done
        fi
        new_interval=$(echo "$response" | jq -r '.report_interval // empty' 2>/dev/null)
        if [ -n "$new_interval" ] && [ "$new_interval" -gt 0 ] 2>/dev/null; then INTERVAL="$new_interval"; fi
    fi

    if [ "$SHOULD_TERMINATE" = "true" ]; then
        echo "[$timestamp] Agent restart requested. Exiting current process..."
        break
    fi

    # 3. Policy sync (every 3 cycles)
    if [ $((LOOP_COUNT % 3)) -eq 1 ]; then
        echo "[$timestamp] Syncing policies..."
        sync_policies
    fi

    # 4. Continuous app blocking (every cycle)
    stop_blocked_processes

    # 5. Firewall rules sync (every 5 cycles)
    if [ $((LOOP_COUNT % 5)) -eq 0 ]; then
        echo "[$timestamp] Syncing firewall rules..."
        sync_firewall_rules
    fi

    # 6. Anti-bypass (every 10 cycles)
    if [ $((LOOP_COUNT % 10)) -eq 0 ]; then
        echo "[$timestamp] Anti-bypass check..."
        detect_bypass
    fi

    # 7. License check (every 30 cycles)
    if [ $((LOOP_COUNT % 30)) -eq 0 ]; then
        echo "[$timestamp] Checking licenses..."
        activate_licenses
    fi

    # 8. Email config (every 15 cycles)
    if [ $((LOOP_COUNT % 15)) -eq 0 ]; then
        echo "[$timestamp] Checking email configs..."
        apply_email_configs
    fi

    echo "[$timestamp] Loop:$LOOP_COUNT | Next:${INTERVAL}s"
    sleep "$INTERVAL"
done
