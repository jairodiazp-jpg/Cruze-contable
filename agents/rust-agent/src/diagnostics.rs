use std::process::Stdio;

use sysinfo::{Disks, System};
use tokio::process::Command;

use crate::models::DiagnosticsPayload;

async fn run_cmd(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn detect_ip() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Some(out) = run_cmd("powershell", &["-NoProfile", "-Command", "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress)"]).await {
            if !out.is_empty() {
                return out;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(out) = run_cmd("sh", &["-c", "hostname -I 2>/dev/null | awk '{print $1}'"]).await {
            if !out.is_empty() {
                return out;
            }
        }
    }

    "unknown".to_string()
}

async fn ping_stats() -> (String, u32, u32) {
    #[cfg(target_os = "windows")]
    let ping = run_cmd("ping", &["-n", "4", "8.8.8.8"]).await;
    #[cfg(not(target_os = "windows"))]
    let ping = run_cmd("ping", &["-c", "4", "8.8.8.8"]).await;

    if let Some(out) = ping {
        let lower = out.to_lowercase();
        let connected = if lower.contains("ttl=") || lower.contains("bytes from") {
            "connected"
        } else {
            "disconnected"
        };

        let latency_ms = extract_latency(&out).unwrap_or(0);
        let packet_loss = extract_packet_loss(&out).unwrap_or(if connected == "connected" { 0 } else { 100 });
        return (connected.to_string(), latency_ms, packet_loss);
    }

    ("disconnected".to_string(), 0, 100)
}

fn extract_latency(output: &str) -> Option<u32> {
    for token in output.split_whitespace() {
        let cleaned = token.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '=' && c != '.');
        if let Some(v) = cleaned.strip_prefix("time=") {
            let ms = v.trim_end_matches("ms").split('.').next()?.parse::<u32>().ok()?;
            return Some(ms);
        }
        if cleaned.contains("Average") {
            continue;
        }
    }

    if let Some(idx) = output.find("Average =") {
        let tail = &output[idx..];
        for part in tail.split_whitespace() {
            if part.ends_with("ms") {
                return part.trim_end_matches("ms").parse::<u32>().ok();
            }
        }
    }

    None
}

fn extract_packet_loss(output: &str) -> Option<u32> {
    if let Some(idx) = output.find('%') {
        let bytes = output.as_bytes();
        let mut start = idx;
        while start > 0 && bytes[start - 1].is_ascii_digit() {
            start -= 1;
        }
        return output[start..idx].trim().parse::<u32>().ok();
    }
    None
}

async fn dns_status() -> String {
    #[cfg(target_os = "windows")]
    let cmd = run_cmd("nslookup", &["google.com"]);
    #[cfg(not(target_os = "windows"))]
    let cmd = run_cmd("nslookup", &["google.com"]);

    if cmd.await.is_some() {
        "ok".to_string()
    } else {
        "fail".to_string()
    }
}

pub async fn collect() -> DiagnosticsPayload {
    let mut system = System::new_all();
    system.refresh_all();

    let cpu_usage = system.global_cpu_info().cpu_usage();

    let total_memory = system.total_memory() as f32;
    let used_memory = system.used_memory() as f32;
    let ram_usage = if total_memory > 0.0 {
        (used_memory / total_memory) * 100.0
    } else {
        0.0
    };

    let disks = Disks::new_with_refreshed_list();
    let mut total_space = 0.0f32;
    let mut used_space = 0.0f32;
    for disk in &disks {
        total_space += disk.total_space() as f32;
        used_space += (disk.total_space() - disk.available_space()) as f32;
    }
    let disk_usage = if total_space > 0.0 {
        (used_space / total_space) * 100.0
    } else {
        0.0
    };

    let (internet_status, latency_ms, packet_loss) = ping_stats().await;

    let wifi_status = "unknown".to_string();
    let ethernet_status = "unknown".to_string();

    DiagnosticsPayload {
        cpu_usage,
        ram_usage,
        disk_usage,
        internet_status,
        wifi_status,
        ethernet_status,
        dns_status: dns_status().await,
        latency_ms,
        packet_loss,
    }
}

pub async fn ip_address() -> String {
    detect_ip().await
}

pub fn connection_type() -> String {
    "unknown".to_string()
}

pub fn vpn_status() -> String {
    "disconnected".to_string()
}
