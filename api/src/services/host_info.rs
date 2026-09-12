/*
 * Facts about the machine serving this site (issue #145).
 *
 * The client is a static bundle behind nginx and can learn nothing about its
 * own host, so the footer had no way to say where it is running. This supplies
 * it.
 *
 * DELIBERATELY NO EXTRA CRATE. The issue suggested `sysinfo`; everything needed
 * here is three files in /proc plus std, and the image is always Linux. That
 * avoids a dependency rebuild, and avoids sysinfo's habit of reshaping its API
 * between minor versions (total_memory switched units in 0.30). Non-Linux
 * builds degrade to None rather than failing to compile, so `cargo run` on a
 * developer's Mac still works -- it just reports less.
 */

use serde::Serialize;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

/// Resolved once per process. Flux apps relocate between nodes, so this is
/// looked up on boot rather than baked into the image -- but it cannot change
/// while the process lives, so one lookup is enough.
static LOCATION: OnceLock<Option<HostLocation>> = OnceLock::new();

/// Process start, for "this instance has been serving for N".
static STARTED_AT: OnceLock<Instant> = OnceLock::new();

const CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
pub struct HostLocation {
    pub city: Option<String>,
    pub country: Option<String>,
    #[serde(rename = "countryCode")]
    pub country_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HostInfo {
    pub platform: &'static str,
    pub arch: &'static str,
    #[serde(rename = "cpuCores")]
    pub cpu_cores: Option<usize>,
    #[serde(rename = "totalMemMB")]
    pub total_mem_mb: Option<u64>,
    #[serde(rename = "usedMemMB")]
    pub used_mem_mb: Option<u64>,
    #[serde(rename = "memPercent")]
    pub mem_percent: Option<u64>,
    /// Kernel uptime of the machine -- for a Flux node, how long the node itself
    /// has been up. In a container this reads the host's /proc/uptime.
    #[serde(rename = "uptimeSeconds")]
    pub uptime_seconds: Option<u64>,
    /// How long THIS API process has been serving. Distinct from the above and
    /// the more honest number for a footer: a redeployed app resets this while
    /// the node's uptime keeps climbing.
    #[serde(rename = "appUptimeSeconds")]
    pub app_uptime_seconds: u64,
    pub location: Option<HostLocation>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HostInfoBody {
    pub success: bool,
    pub host: HostInfo,
    pub app: AppInfo,
    #[serde(rename = "generatedAt")]
    pub generated_at: u128,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub version: &'static str,
}

/// Call once at startup so the process-uptime clock starts at boot rather than
/// at the first request.
pub fn mark_started() {
    let _ = STARTED_AT.set(Instant::now());
}

fn app_uptime_seconds() -> u64 {
    STARTED_AT.get().map(|t| t.elapsed().as_secs()).unwrap_or(0)
}

#[cfg(target_os = "linux")]
fn read_uptime_seconds() -> Option<u64> {
    // /proc/uptime is "<uptime> <idle>", both in seconds with decimals.
    let raw = std::fs::read_to_string("/proc/uptime").ok()?;
    raw.split_whitespace().next()?.parse::<f64>().ok().map(|v| v as u64)
}

#[cfg(not(target_os = "linux"))]
fn read_uptime_seconds() -> Option<u64> {
    None
}

#[cfg(target_os = "linux")]
fn read_memory_mb() -> (Option<u64>, Option<u64>) {
    // MemAvailable is the honest "free" figure -- MemFree excludes cache and
    // buffers the kernel would happily evict, and reports a machine as far
    // fuller than it behaves.
    let raw = match std::fs::read_to_string("/proc/meminfo") {
        Ok(v) => v,
        Err(_) => return (None, None),
    };

    let field = |name: &str| -> Option<u64> {
        raw.lines()
            .find(|line| line.starts_with(name))?
            .split_whitespace()
            .nth(1)?
            .parse::<u64>()
            .ok()
            .map(|kb| kb / 1024)
    };

    let total = field("MemTotal:");
    let available = field("MemAvailable:");
    let used = match (total, available) {
        (Some(t), Some(a)) => Some(t.saturating_sub(a)),
        _ => None,
    };
    (total, used)
}

#[cfg(not(target_os = "linux"))]
fn read_memory_mb() -> (Option<u64>, Option<u64>) {
    (None, None)
}

fn cpu_cores() -> Option<usize> {
    std::thread::available_parallelism().ok().map(|n| n.get())
}

/*
 * Geolocate the container's own public IP.
 *
 * SEVERAL providers, tried in order, first usable answer wins. This is not
 * over-engineering: the first single-provider attempt returned 429 on the very
 * first run, because these free tiers are shared per-IP and routinely
 * exhausted. One provider is one outage away from a permanently blank segment.
 * Same reasoning as the explorer host pool in #218.
 *
 * Resolved once and kept for the life of the process. A total failure resolves
 * to None and the footer omits the segment -- the location is provenance, not
 * function, and must never be why this endpoint fails.
 */
struct GeoProvider {
    url: &'static str,
    /// Field names differ per provider; `country` is a full name on some and an
    /// ISO code on others, so both are read and the client prefers the name.
    city: &'static str,
    country: &'static str,
    country_code: &'static str,
}

const GEO_PROVIDERS: [GeoProvider; 3] = [
    // HTTPS, reliable, but `country` is an ISO code rather than a name.
    GeoProvider { url: "https://ipinfo.io/json", city: "city", country: "__none__", country_code: "country" },
    // Richest answer (full country name). HTTP only on the free tier, which is
    // acceptable for a one-off server-side lookup of our own public IP -- there
    // is nothing secret in the request or the response.
    GeoProvider { url: "http://ip-api.com/json/", city: "city", country: "country", country_code: "countryCode" },
    GeoProvider { url: "https://ipapi.co/json/", city: "city", country: "country_name", country_code: "country_code" },
];

async fn try_provider(client: &reqwest::Client, provider: &GeoProvider) -> Option<HostLocation> {
    let resp = client.get(provider.url).send().await.ok()?;
    if !resp.status().is_success() {
        println!("[host_info] {} returned {}", provider.url, resp.status());
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;

    // Providers signal a soft failure in the BODY with a 200 -- ipapi.co sends
    // {"error":true}, ipwho.is sends {"success":false}. Trusting the status
    // code alone would store a rate-limit notice as a location.
    if json.get("error").and_then(|v| v.as_bool()).unwrap_or(false)
        || json.get("success").and_then(|v| v.as_bool()) == Some(false)
        || json.get("status").and_then(|v| v.as_str()) == Some("fail")
    {
        println!("[host_info] {} reported a soft failure", provider.url);
        return None;
    }

    let pick = |key: &str| {
        json.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
    };

    let location = HostLocation {
        city: pick(provider.city),
        country: pick(provider.country),
        country_code: pick(provider.country_code),
    };

    if location.city.is_none() && location.country.is_none() && location.country_code.is_none() {
        return None;
    }
    Some(location)
}

async fn resolve_location() -> Option<HostLocation> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .ok()?;

    for provider in GEO_PROVIDERS.iter() {
        if let Some(location) = try_provider(&client, provider).await {
            println!("[host_info] location resolved via {}", provider.url);
            return Some(location);
        }
    }

    println!("[host_info] every geolocation provider failed -- omitting location");
    None
}

async fn location() -> Option<HostLocation> {
    if let Some(cached) = LOCATION.get() {
        return cached.clone();
    }
    let resolved = resolve_location().await;
    // A race here is harmless: two boots-worth of lookups at worst, and set()
    // keeps whichever landed first.
    let _ = LOCATION.set(resolved.clone());
    resolved
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Whole payload, memoised briefly. The footer polls, and re-reading /proc per
/// request is pointless when the numbers move this slowly.
static CACHE: OnceLock<Mutex<Option<(Instant, HostInfoBody)>>> = OnceLock::new();

pub async fn collect() -> HostInfoBody {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().await;

    if let Some((at, body)) = guard.as_ref() {
        if at.elapsed() < CACHE_TTL {
            return body.clone();
        }
    }

    let (total_mem_mb, used_mem_mb) = read_memory_mb();
    let mem_percent = match (total_mem_mb, used_mem_mb) {
        (Some(t), Some(u)) if t > 0 => Some(u * 100 / t),
        _ => None,
    };

    let body = HostInfoBody {
        success: true,
        host: HostInfo {
            platform: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            cpu_cores: cpu_cores(),
            total_mem_mb,
            used_mem_mb,
            mem_percent,
            uptime_seconds: read_uptime_seconds(),
            app_uptime_seconds: app_uptime_seconds(),
            location: location().await,
        },
        app: AppInfo {
            version: env!("CARGO_PKG_VERSION"),
        },
        generated_at: now_millis(),
    };

    *guard = Some((Instant::now(), body.clone()));
    body
}
