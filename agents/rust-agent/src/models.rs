use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsPayload {
    pub cpu_usage: f32,
    pub ram_usage: f32,
    pub disk_usage: f32,
    pub internet_status: String,
    pub wifi_status: String,
    pub ethernet_status: String,
    pub dns_status: String,
    pub latency_ms: u32,
    pub packet_loss: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportRequest {
    pub device_id: String,
    pub hostname: String,
    pub agent_version: String,
    pub operating_system: String,
    pub ip_address: String,
    pub connection_type: String,
    pub vpn_status: String,
    pub user_assigned: String,
    pub diagnostics: DiagnosticsPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingScript {
    pub id: String,
    pub script_name: String,
    pub script_type: String,
    pub script_content: Option<String>,
    pub ticket_id: Option<String>,
    pub action_id: Option<String>,
    pub nonce: Option<String>,
    pub exp: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportResponse {
    pub status: Option<String>,
    pub health: Option<String>,
    pub report_interval: Option<u64>,
    pub pending_scripts: Option<Vec<PendingScript>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub token: String,
    pub hostname: String,
    pub operating_system: String,
    pub ip_address: String,
    pub mac_address: String,
    pub user_assigned: String,
    pub serial_number: String,
    pub agent_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterResponse {
    pub status: String,
    pub device_id: String,
    pub device_uuid: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySyncResponse {
    pub blocked_domains: Vec<String>,
    pub blocked_categories: Vec<String>,
    pub blocked_applications: Vec<BlockedApp>,
    pub vpn_block_enabled: bool,
    pub vpn_blocked_ports: Vec<u16>,
    #[serde(default)]
    pub usb_storage_block_enabled: bool,
    #[serde(default)]
    pub usb_ports_block_enabled: bool,
    pub schedules: Vec<Value>,
    pub policy_version: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedApp {
    pub app_name: Option<String>,
    pub process_name: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallRule {
    pub id: String,
    pub rule_name: String,
    pub action: String,
    pub direction: String,
    pub protocol: String,
    pub port_start: Option<u16>,
    pub port_end: Option<u16>,
    pub destination_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallRulesResponse {
    pub rules: Vec<FirewallRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensesResponse {
    pub licenses: Vec<LicenseItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseItem {
    pub id: String,
    pub product: String,
    pub license_key: String,
    pub license_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailConfigsResponse {
    pub configs: Vec<EmailConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailConfig {
    pub id: String,
    pub provider: Option<String>,
    pub user_email: Option<String>,
}
