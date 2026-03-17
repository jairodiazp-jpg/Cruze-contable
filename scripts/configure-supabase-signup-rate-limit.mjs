#!/usr/bin/env node

const projectRefFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const maybeRef = host.split(".")[0];
    return maybeRef || "";
  } catch {
    return "";
  }
};

const accessToken = process.env.SUPABASE_ACCESS_TOKEN || "";
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  projectRefFromUrl(process.env.VITE_SUPABASE_URL || "");

const emailSentPerHour = Number(process.env.SUPABASE_RATE_LIMIT_EMAIL_SENT ?? 120);
const verifyPerHour = Number(process.env.SUPABASE_RATE_LIMIT_VERIFY ?? 120);
const tokenRefreshPerMinute = Number(process.env.SUPABASE_RATE_LIMIT_TOKEN_REFRESH ?? 1800);

if (!accessToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN environment variable.");
  process.exit(1);
}

if (!projectRef) {
  console.error("Missing project ref. Set SUPABASE_PROJECT_REF or VITE_SUPABASE_PROJECT_ID.");
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

const payload = {
  rate_limit_email_sent: emailSentPerHour,
  rate_limit_verify: verifyPerHour,
  rate_limit_token_refresh: tokenRefreshPerMinute,
};

const fallbackPayload = {
  // Fallback for projects without custom SMTP: bypass signup email send limits.
  mailer_autoconfirm: true,
  rate_limit_verify: verifyPerHour,
  rate_limit_token_refresh: tokenRefreshPerMinute,
};

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const printResponse = async (resp) => {
  const text = await resp.text();
  let parsed = text;
  try {
    parsed = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // keep raw text
  }

  console.log(`HTTP ${resp.status}`);
  console.log(parsed);
};

const main = async () => {
  console.log(`Updating auth rate limits for project: ${projectRef}`);
  console.log(`Target endpoint: ${endpoint}`);
  console.log(`Payload: ${JSON.stringify(payload)}`);

  const testResp = await fetch(endpoint, {
    method: "GET",
    headers,
  });

  if (!testResp.ok) {
    console.error("Could not read current auth config from Supabase Management API.");
    await printResponse(testResp);
    process.exit(1);
  }

  const patchResp = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });

  if (patchResp.ok) {
    console.log("Auth rate limit updated successfully.");
    await printResponse(patchResp);
    return;
  }

  const errorText = await patchResp.text();
  const smtpRequired =
    patchResp.status === 401 &&
    errorText.toLowerCase().includes("custom smtp required") &&
    errorText.toLowerCase().includes("rate_limit_email_sent");

  if (!smtpRequired) {
    console.error("Supabase rejected auth config update.");
    console.log(`HTTP ${patchResp.status}`);
    console.log(errorText);
    process.exit(1);
  }

  console.warn("Supabase requires custom SMTP for rate_limit_email_sent. Applying fallback config...");
  console.warn("Fallback enables mailer_autoconfirm=true to prevent signup email throttling during QA.");

  const fallbackResp = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify(fallbackPayload),
  });

  if (!fallbackResp.ok) {
    console.error("Fallback auth config update failed.");
    await printResponse(fallbackResp);
    process.exit(1);
  }

  console.log("Fallback auth config applied successfully.");
  await printResponse(fallbackResp);
};

main().catch((err) => {
  console.error("Unexpected error while updating Supabase auth rate limit:");
  console.error(err?.message || err);
  process.exit(1);
});
