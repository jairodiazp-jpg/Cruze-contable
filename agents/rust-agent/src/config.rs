use clap::{Parser, Subcommand};

#[derive(Debug, Clone, Parser)]
#[command(name = "itagent-rs", about = "InteliSupp Rust device agent")]
pub struct Cli {
    #[arg(long)]
    pub server: String,

    #[arg(long)]
    pub api_key: String,

    #[arg(long)]
    pub device_id: Option<String>,

    #[arg(long, default_value_t = 60)]
    pub interval: u64,

    #[arg(long)]
    pub agent_shared_key: Option<String>,

    #[arg(long, default_value = "3.1.0-rust")]
    pub version: String,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Debug, Clone, Subcommand)]
pub enum Commands {
    Enroll {
        #[arg(long)]
        token: String,
    },
}
