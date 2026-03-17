mod actions;
mod api;
mod config;
mod diagnostics;
mod models;

use anyhow::{anyhow, Result};
use clap::Parser;
use serde_json::json;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

use actions::{activate_licenses, apply_email_configs, detect_bypass, execute_pending_script, stop_blocked_processes, sync_firewall_rules, sync_policies};
use api::ApiClient;
use config::{Cli, Commands};
use diagnostics::{collect as collect_diagnostics, connection_type, ip_address, vpn_status};
use models::{RegisterRequest, RegisterResponse, ReportRequest, ReportResponse};

fn username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn operating_system() -> String {
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

fn hostname_value() -> String {
    hostname::get()
        .map(|v| v.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown-host".to_string())
}

async fn register_device(api: &ApiClient, cli: &Cli, token: &str) -> Result<String> {
    let req = RegisterRequest {
        token: token.to_string(),
        hostname: hostname_value(),
        operating_system: operating_system(),
        ip_address: ip_address().await,
        mac_address: "unknown".to_string(),
        user_assigned: username(),
        serial_number: "unknown".to_string(),
        agent_version: cli.version.clone(),
    };

    let resp: RegisterResponse = api.post("register", &req).await?;
    if resp.status != "enrolled" {
        return Err(anyhow!("unexpected register status: {}", resp.status));
    }

    Ok(resp.device_id)
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .init();

    let cli = Cli::parse();

    let api = ApiClient::new(&cli.server, &cli.api_key, cli.agent_shared_key.as_deref())?;

    if let Some(Commands::Enroll { token }) = &cli.command {
        let device_id = register_device(&api, &cli, token).await?;
        println!("{}", device_id);
        return Ok(());
    }

    let mut device_id = cli
        .device_id
        .clone()
        .ok_or_else(|| anyhow!("--device-id is required in run mode"))?;

    let mut interval = cli.interval.max(10);
    let mut loop_count: u64 = 0;
    let mut cached_blocked_apps = Vec::new();

    info!("starting itagent-rs {}", cli.version);
    info!("device_id={} server={} interval={}s", device_id, cli.server, interval);

    loop {
        loop_count += 1;

        let diagnostics = collect_diagnostics().await;
        let report = ReportRequest {
            device_id: device_id.clone(),
            hostname: hostname_value(),
            agent_version: cli.version.clone(),
            operating_system: operating_system(),
            ip_address: ip_address().await,
            connection_type: connection_type(),
            vpn_status: vpn_status(),
            user_assigned: username(),
            diagnostics,
        };

        let response: ReportResponse = match api.post("report", &report).await {
            Ok(r) => r,
            Err(err) => {
                error!("report failed: {}", err);
                sleep(Duration::from_secs(interval)).await;
                continue;
            }
        };

        if let Some(pending) = response.pending_scripts.as_ref() {
            for script in pending {
                if script.action_id.is_none() || script.nonce.is_none() || script.exp.is_none() {
                    warn!("skipping script {} due to missing action envelope", script.id);
                    let _ = api
                        .post_no_content(
                            "execute",
                            &json!({
                                "execution_id": script.id,
                                "device_id": device_id,
                                "ticket_id": script.ticket_id,
                                "action_id": script.action_id,
                                "nonce": script.nonce,
                                "exp": script.exp,
                                "status": "failed",
                                "output": "",
                                "error_log": "Missing action envelope fields"
                            }),
                        )
                        .await;
                    continue;
                }

                if let Err(err) = execute_pending_script(&api, &device_id, script).await {
                    warn!("script {} failed: {}", script.id, err);
                }
            }
        }

        if loop_count % 3 == 1 {
            match sync_policies(&api, &device_id).await {
                Ok(policy) => {
                    cached_blocked_apps = policy.blocked_applications;
                }
                Err(err) => warn!("policy-sync failed: {}", err),
            }
        }

        if !cached_blocked_apps.is_empty() {
            stop_blocked_processes(&cached_blocked_apps).await;
        }

        if loop_count % 5 == 0 {
            let _ = sync_firewall_rules(&api, &device_id).await;
        }

        if loop_count % 10 == 0 {
            let _ = detect_bypass(&api, &device_id).await;
        }

        if loop_count % 15 == 0 {
            let _ = apply_email_configs(&api, &device_id).await;
        }

        if loop_count % 30 == 0 {
            let _ = activate_licenses(&api, &device_id).await;
        }

        if let Some(next_interval) = response.report_interval {
            interval = next_interval.max(10);
        }

        if response.status.as_deref() == Some("enrolled") && !device_id.is_empty() {
            info!("enrollment state confirmed for {}", device_id);
        }

        info!(
            "health={} loop={} next={}s",
            response.health.unwrap_or_else(|| "unknown".to_string()),
            loop_count,
            interval
        );

        sleep(Duration::from_secs(interval)).await;
    }
}
