use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use serde::Serialize;

#[derive(Clone)]
pub struct ApiClient {
    base_url: String,
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: &str, api_key: &str, agent_shared_key: Option<&str>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("apikey", HeaderValue::from_str(api_key)?);
        if let Some(shared) = agent_shared_key {
            if !shared.trim().is_empty() {
                headers.insert("x-agent-key", HeaderValue::from_str(shared)?);
            }
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client,
        })
    }

    pub async fn post<B, R>(&self, action: &str, body: &B) -> Result<R>
    where
        B: Serialize + ?Sized,
        R: DeserializeOwned,
    {
        let url = format!("{}/{}", self.base_url, action);
        let resp = self.client.post(url).json(body).send().await?;
        let status = resp.status();

        if !status.is_success() {
            let payload = resp.text().await.unwrap_or_else(|_| "".to_string());
            return Err(anyhow!("agent-api {} failed with {}: {}", action, status, payload));
        }

        Ok(resp.json::<R>().await?)
    }

    pub async fn post_no_content<B>(&self, action: &str, body: &B) -> Result<serde_json::Value>
    where
        B: Serialize + ?Sized,
    {
        self.post::<B, serde_json::Value>(action, body).await
    }
}
