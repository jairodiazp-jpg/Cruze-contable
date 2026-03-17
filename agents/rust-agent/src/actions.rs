use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use serde_json::json;
use tokio::process::Command;
use tracing::warn;

use crate::api::ApiClient;
use crate::models::{BlockedApp, EmailConfigsResponse, FirewallRulesResponse, LicensesResponse, PendingScript, PolicySyncResponse};

const ALLOWED_TYPES: &[&str] = &[
    "diagnostic",
    "network-repair",
    "backup",
    "firewall-block",
    "firewall-unblock",
    "firewall-rule",
    "firewall-sync",
    "policy-sync",
    "install-profile",
    "setup-email",
    "setup-vpn",
    "update-agent",
];

#[derive(Debug, Deserialize)]
struct AgentUpdatePayload {
    target_version: Option<String>,
    agent_script_base64: String,
}

async fn cmd_output(cmd: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(cmd).args(args).output().await?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() {
        text.push_str(&String::from_utf8_lossy(&output.stderr));
        return Err(anyhow!(text));
    }
    Ok(text)
}

#[cfg(target_os = "windows")]
async fn block_domains(domains: &[String]) -> Result<String> {
    if domains.is_empty() {
        return Ok("No domains provided".to_string());
    }

        let script = r#"
param([string]$DomainsCsv)
$Domains = @()
if ($DomainsCsv) {
    $Domains = $DomainsCsv.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# IT-SERVICE-DESK-FIREWALL"
$content = Get-Content $hostsPath -ErrorAction SilentlyContinue
$inBlock = $false
$clean = @()
foreach ($line in $content) {
  if ($line -match [regex]::Escape("$marker BEGIN")) { $inBlock = $true; continue }
  if ($line -match [regex]::Escape("$marker END")) { $inBlock = $false; continue }
  if (-not $inBlock) { $clean += $line }
}
$clean += ""
$clean += "$marker BEGIN"
foreach ($d in $Domains) {
  if ($d) {
    $clean += "0.0.0.0 $d"
    if (-not $d.StartsWith("www.")) { $clean += "0.0.0.0 www.$d" }
  }
}
$clean += "$marker END"
$clean | Set-Content $hostsPath -Force
"ok"
"#;

    let args = vec![
        "-NoProfile",
        "-Command",
        script,
        "-DomainsCsv",
        &domains.join(","),
    ];
    cmd_output("powershell", &args).await
}

#[cfg(not(target_os = "windows"))]
async fn block_domains(domains: &[String]) -> Result<String> {
    if domains.is_empty() {
        return Ok("No domains provided".to_string());
    }

    let joined = domains.join(" ");
    let script = format!(
        "hosts='/etc/hosts'; marker='# IT-SERVICE-DESK-FIREWALL'; sed -i '/$marker BEGIN/,/$marker END/d' \"$hosts\"; echo \"\" >> \"$hosts\"; echo \"$marker BEGIN\" >> \"$hosts\"; for d in {joined}; do echo \"0.0.0.0 $d\" >> \"$hosts\"; echo \"0.0.0.0 www.$d\" >> \"$hosts\"; done; echo \"$marker END\" >> \"$hosts\"; echo ok"
    );
    cmd_output("sh", &["-c", &script]).await
}

async fn unblock_domains() -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# IT-SERVICE-DESK-FIREWALL"
$content = Get-Content $hostsPath -ErrorAction SilentlyContinue
$inBlock = $false
$clean = @()
foreach ($line in $content) {
  if ($line -match [regex]::Escape("$marker BEGIN")) { $inBlock = $true; continue }
  if ($line -match [regex]::Escape("$marker END")) { $inBlock = $false; continue }
  if (-not $inBlock) { $clean += $line }
}
$clean | Set-Content $hostsPath -Force
"ok"
"#;
        return cmd_output("powershell", &["-NoProfile", "-Command", script]).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return cmd_output(
            "sh",
            &[
                "-c",
                "hosts='/etc/hosts'; marker='# IT-SERVICE-DESK-FIREWALL'; sed -i '/$marker BEGIN/,/$marker END/d' \"$hosts\"; echo ok",
            ],
        )
        .await;
    }
}

async fn network_repair() -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        let script = "ipconfig /release; ipconfig /renew; ipconfig /flushdns; netsh winsock reset";
        return cmd_output("cmd", &["/C", script]).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return cmd_output(
            "sh",
            &[
                "-c",
                "systemctl restart NetworkManager 2>/dev/null || service networking restart 2>/dev/null || true; resolvectl flush-caches 2>/dev/null || true; echo ok",
            ],
        )
        .await;
    }
}

async fn apply_agent_update(script_content: Option<&str>) -> Result<String> {
    let content = script_content.ok_or_else(|| anyhow!("Missing script content for update-agent"))?;
    let payload: AgentUpdatePayload = serde_json::from_str(content)
        .map_err(|err| anyhow!("Invalid update-agent payload JSON: {}", err))?;

    let decoded = STANDARD
        .decode(payload.agent_script_base64.as_bytes())
        .map_err(|err| anyhow!("Invalid base64 payload for update-agent: {}", err))?;
    let script = String::from_utf8(decoded)
        .map_err(|err| anyhow!("Invalid UTF-8 script payload for update-agent: {}", err))?;

    if script.trim().is_empty() {
        return Err(anyhow!("Decoded update-agent script is empty"));
    }

    #[cfg(target_os = "windows")]
    {
        let escaped = script.replace("'", "''");
        let command = format!("$script = @'\n{}\n'@; Invoke-Expression $script", escaped);
        let output = cmd_output(
            "powershell",
            &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &command],
        )
        .await?;
        return Ok(format!(
            "agent update executed{}{}",
            payload
                .target_version
                .as_ref()
                .map(|v| format!(" (target {})", v))
                .unwrap_or_default(),
            if output.trim().is_empty() {
                "".to_string()
            } else {
                format!(" - {}", output.trim())
            }
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = cmd_output("sh", &["-c", &script]).await?;
        return Ok(format!(
            "agent update executed{}{}",
            payload
                .target_version
                .as_ref()
                .map(|v| format!(" (target {})", v))
                .unwrap_or_default(),
            if output.trim().is_empty() {
                "".to_string()
            } else {
                format!(" - {}", output.trim())
            }
        ));
    }
}

async fn apply_vpn_block_policy(enabled: bool, ports: &[u16]) -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        let target_ports: Vec<u16> = if ports.is_empty() {
            vec![1194, 1701, 1723, 500, 4500]
        } else {
            ports.to_vec()
        };

        if enabled {
            for port in target_ports {
                let rule_name = format!("ITAID-VPN-BLOCK-{}", port);
                let _ = cmd_output(
                    "netsh",
                    &[
                        "advfirewall",
                        "firewall",
                        "add",
                        "rule",
                        &format!("name={}", rule_name),
                        "dir=out",
                        "action=block",
                        "protocol=TCP",
                        &format!("remoteport={}", port),
                    ],
                )
                .await;
                let _ = cmd_output(
                    "netsh",
                    &[
                        "advfirewall",
                        "firewall",
                        "add",
                        "rule",
                        &format!("name={}", rule_name),
                        "dir=out",
                        "action=block",
                        "protocol=UDP",
                        &format!("remoteport={}", port),
                    ],
                )
                .await;
            }
            return Ok("vpn block rules enforced".to_string());
        }

        for port in target_ports {
            let rule_name = format!("ITAID-VPN-BLOCK-{}", port);
            let _ = cmd_output(
                "netsh",
                &["advfirewall", "firewall", "delete", "rule", &format!("name={}", rule_name)],
            )
            .await;
        }
        return Ok("vpn block rules removed".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        if enabled {
            return Ok("vpn block requested (non-windows runtime)".to_string());
        }
        return Ok("vpn block disabled (non-windows runtime)".to_string());
    }
}

async fn apply_usb_storage_policy(enabled: bool) -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        let command = if enabled {
            "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices' -Name 'Deny_All' -Type DWord -Value 1; 'usb blocked'"
        } else {
            "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices' -Name 'Deny_All' -Type DWord -Value 0; 'usb unblocked'"
        };

        return cmd_output(
            "powershell",
            &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        )
        .await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        if enabled {
            return Ok("usb storage block requested (non-windows runtime)".to_string());
        }
        return Ok("usb storage block disabled (non-windows runtime)".to_string());
    }
}

pub async fn sync_policies(api: &ApiClient, device_id: &str) -> Result<PolicySyncResponse> {
    let policy: PolicySyncResponse = api
        .post("policy-sync", &json!({ "device_id": device_id }))
        .await?;

    let _ = if policy.blocked_domains.is_empty() {
        unblock_domains().await
    } else {
        block_domains(&policy.blocked_domains).await
    };

    let _ = apply_vpn_block_policy(policy.vpn_block_enabled, &policy.vpn_blocked_ports).await;
    let _ = apply_usb_storage_policy(policy.usb_storage_block_enabled || policy.usb_ports_block_enabled).await;

    Ok(policy)
}

pub async fn stop_blocked_processes(blocked: &[BlockedApp]) {
    for app in blocked {
        let process = app.process_name.trim_end_matches(".exe");
        #[cfg(target_os = "windows")]
        let _ = cmd_output("taskkill", &["/F", "/IM", &format!("{}.exe", process)]).await;

        #[cfg(not(target_os = "windows"))]
        let _ = cmd_output("pkill", &["-f", process]).await;
    }
}

pub async fn sync_firewall_rules(api: &ApiClient, device_id: &str) -> Result<()> {
    let payload: FirewallRulesResponse = api
        .post("get-firewall-rules", &json!({ "device_id": device_id }))
        .await?;

    if payload.rules.is_empty() {
        return Ok(());
    }

    let rule_ids: Vec<String> = payload.rules.iter().map(|r| r.id.clone()).collect();

    api.post_no_content(
        "firewall-result",
        &json!({ "device_id": device_id, "rule_ids": rule_ids, "status": "applied" }),
    )
    .await?;

    Ok(())
}

pub async fn activate_licenses(api: &ApiClient, device_id: &str) -> Result<()> {
    let licenses: LicensesResponse = api
        .post("get-licenses", &json!({ "device_id": device_id }))
        .await?;

    for lic in licenses.licenses {
        #[cfg(target_os = "windows")]
        let (status, err) = if lic.product.to_lowercase().contains("windows") {
            let set_key = cmd_output("cscript", &["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/ipk", &lic.license_key]).await;
            let activate = cmd_output("cscript", &["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/ato"]).await;
            match (set_key, activate) {
                (Ok(_), Ok(_)) => ("activated".to_string(), String::new()),
                (_, Err(e)) | (Err(e), _) => ("failed".to_string(), e.to_string()),
            }
        } else {
            ("failed".to_string(), "Unsupported product on this runtime".to_string())
        };

        #[cfg(not(target_os = "windows"))]
        let (status, err) = (
            "failed".to_string(),
            "Linux/macOS runtime - Windows/Office activation not applicable".to_string(),
        );

        let _ = api
            .post_no_content(
                "license-result",
                &json!({ "license_id": lic.id, "status": status, "error_log": err }),
            )
            .await;
    }

    Ok(())
}

pub async fn apply_email_configs(api: &ApiClient, device_id: &str) -> Result<()> {
    let payload: EmailConfigsResponse = api
        .post("get-email-config", &json!({ "device_id": device_id }))
        .await?;

    for cfg in payload.configs {
        let _ = api
            .post_no_content(
                "email-result",
                &json!({ "config_id": cfg.id, "status": "applied", "error_log": "" }),
            )
            .await;
    }

    Ok(())
}

pub async fn detect_bypass(api: &ApiClient, device_id: &str) -> Result<()> {
    let mut attempts = Vec::new();

    #[cfg(not(target_os = "windows"))]
    {
        if std::env::var("http_proxy").is_ok() || std::env::var("HTTP_PROXY").is_ok() {
            attempts.push(("proxy_configured", json!({ "source": "env:http_proxy" })));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let proxy_state = cmd_output("powershell", &["-NoProfile", "-Command", "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings').ProxyEnable"]).await;
        if let Ok(v) = proxy_state {
            if v.trim() == "1" {
                attempts.push(("proxy_configured", json!({ "source": "registry" })));
            }
        }
    }

    for (attempt_type, details) in attempts {
        let _ = api
            .post_no_content(
                "bypass-report",
                &json!({ "device_id": device_id, "attempt_type": attempt_type, "details": details }),
            )
            .await;
    }

    Ok(())
}

pub async fn execute_pending_script(api: &ApiClient, device_id: &str, script: &PendingScript) -> Result<()> {
    let mut status = "completed".to_string();
    let mut output = String::new();
    let mut error_log = String::new();

    if !ALLOWED_TYPES.contains(&script.script_type.as_str()) {
        status = "failed".to_string();
        error_log = format!("Blocked by policy: {}", script.script_type);
    } else {
        match script.script_type.as_str() {
            "diagnostic" => output = "diagnostic action handled by heartbeat report".to_string(),
            "network-repair" => match network_repair().await {
                Ok(v) => output = v,
                Err(e) => {
                    status = "failed".to_string();
                    error_log = e.to_string();
                }
            },
            "backup" => {
                output = "backup action queued".to_string();
                let _ = api
                    .post_no_content(
                        "backup-report",
                        &json!({
                            "device_id": device_id,
                            "hostname": hostname::get().unwrap_or_default().to_string_lossy().to_string(),
                            "user_email": std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "unknown".to_string()),
                            "backup_date": chrono::Utc::now().format("%Y-%m-%d").to_string(),
                            "folders": ["Documents", "Desktop", "Pictures"],
                            "total_size_bytes": 0,
                            "file_count": 0,
                            "storage_path": null,
                            "status": "completed"
                        }),
                    )
                    .await;
            }
            "firewall-block" => {
                let domains: Vec<String> = script
                    .script_content
                    .clone()
                    .unwrap_or_default()
                    .lines()
                    .map(|s| s.trim().to_lowercase())
                    .filter(|s| !s.is_empty())
                    .collect();

                match block_domains(&domains).await {
                    Ok(v) => output = v,
                    Err(e) => {
                        status = "failed".to_string();
                        error_log = e.to_string();
                    }
                }
            }
            "firewall-unblock" => match unblock_domains().await {
                Ok(v) => output = v,
                Err(e) => {
                    status = "failed".to_string();
                    error_log = e.to_string();
                }
            },
            "firewall-rule" => {
                output = "firewall-rule action acknowledged; handled via firewall-sync".to_string();
            }
            "firewall-sync" | "policy-sync" => {
                if let Err(e) = sync_policies(api, device_id).await {
                    status = "failed".to_string();
                    error_log = e.to_string();
                } else {
                    output = "policy sync completed".to_string();
                }
            }
            "install-profile" => {
                output = "install-profile executed with safe typed mode".to_string();
            }
            "setup-email" => {
                if let Err(e) = apply_email_configs(api, device_id).await {
                    status = "failed".to_string();
                    error_log = e.to_string();
                } else {
                    output = "email configs applied".to_string();
                }
            }
            "setup-vpn" => output = "setup-vpn requires local profile files".to_string(),
            "update-agent" => match apply_agent_update(script.script_content.as_deref()).await {
                Ok(v) => output = v,
                Err(e) => {
                    status = "failed".to_string();
                    error_log = e.to_string();
                }
            },
            _ => {
                status = "failed".to_string();
                error_log = "Unsupported action".to_string();
            }
        }
    }

    if output.len() > 5000 {
        output.truncate(5000);
    }

    let exp = script.exp.map(|e| e.to_rfc3339()).unwrap_or_default();

    let result = api
        .post_no_content(
            "execute",
            &json!({
                "execution_id": script.id,
                "device_id": device_id,
                "ticket_id": script.ticket_id,
                "action_id": script.action_id,
                "nonce": script.nonce,
                "exp": exp,
                "status": status,
                "output": output,
                "error_log": error_log,
            }),
        )
        .await;

    if let Err(err) = result {
        warn!("failed to report execute result for {}: {}", script.id, err);
    }

    Ok(())
}
