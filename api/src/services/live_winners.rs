#![allow(unused_macros)]

use serde::{Deserialize, Serialize};

use std::collections::HashMap;
use std::time::Duration;

use reqwest::{header, Client, ClientBuilder, Url};

use futures::stream::StreamExt;
use tokio_stream;

/*
 * `fluxcurrentwinner` is a node-local daemon RPC, not something the official
 * public API republishes (api.runonflux.io 404s on it) — any full node's
 * answer is chain-derived and identical, so this module doesn't need to poll
 * one fixed node the way the older demo service did. The caller (the client)
 * supplies a batch of candidate node IPs it already knows about from data it
 * fetches anyway; we try a handful concurrently and return the first
 * successful answer. Trying several is purely for availability if a given
 * node is offline or slow — not for cross-checking consensus.
 */

const WINNER_PORT: u16 = 16127;
const MAX_CANDIDATES_TRIED: usize = 8;
const PER_NODE_TIMEOUT_SECS: u64 = 5;

#[derive(Deserialize)]
struct FluxCurrentWinnerRaw {
    status: String,
    data: HashMap<String, Option<RawWinner>>,
}

#[derive(Deserialize, Clone)]
struct RawWinner {
    collateral: String,
    ip: String,
    added_height: i64,
    confirmed_height: i64,
    last_confirmed_height: i64,
    last_paid_height: i64,
    tier: String,
    payment_address: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Winner {
    pub ip: String,
    pub tier: String,
    pub payment_address: String,
    pub added_height: i64,
    pub confirmed_height: i64,
    pub last_confirmed_height: i64,
    pub last_paid_height: i64,
    pub collateral: String,
}

impl From<RawWinner> for Winner {
    fn from(w: RawWinner) -> Self {
        Self {
            ip: w.ip,
            tier: w.tier,
            payment_address: w.payment_address,
            added_height: w.added_height,
            confirmed_height: w.confirmed_height,
            last_confirmed_height: w.last_confirmed_height,
            last_paid_height: w.last_paid_height,
            collateral: w.collateral,
        }
    }
}

// Normalized, tier-keyed view of a single node's fluxcurrentwinner answer.
// Any of the three can be null if that tier currently has no eligible winner.
#[derive(Debug, Serialize, Clone)]
pub struct CurrentWinners {
    pub cumulus: Option<Winner>,
    pub nimbus: Option<Winner>,
    pub stratus: Option<Winner>,
    // Which candidate actually answered — useful for debugging a flaky pool.
    pub source_ip: String,
}

lazy_static! {
    static ref G_CLIENT_HEADERS: header::HeaderMap = {
        let mut client_headers = header::HeaderMap::new();
        client_headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json, text/plain, */*"),
        );
        client_headers
    };
}

fn create_client() -> Client {
    let client_headers = (*G_CLIENT_HEADERS).clone();

    ClientBuilder::new()
        .timeout(Duration::from_secs(PER_NODE_TIMEOUT_SECS))
        .default_headers(client_headers)
        .build()
        .expect("live_winners::create_client() => Failed to configure client")
}

// Takes an owned IP rather than `&str`: each call in get_current_winners()
// below borrows a different, differently-lived slice element, and an async
// fn's opaque return type can't be unified across a varying per-call
// lifetime (rustc rejects this as "implementation of Iterator/FnOnce is not
// general enough"). Owning the string removes the varying lifetime entirely
// — `client` stays a plain, uniformly-lived reference across every call.
async fn try_candidate(client: &Client, ip: String) -> Option<CurrentWinners> {
    let url = Url::parse(&format!("http://{}:{}/daemon/fluxcurrentwinner", ip, WINNER_PORT)).ok()?;
    let response = client.get(url).send().await.ok()?;
    let text_contents = response.text().await.ok()?;
    let parsed: FluxCurrentWinnerRaw = serde_json::from_str(&text_contents).ok()?;

    if parsed.status != "success" {
        return None;
    }

    let winner_for = |key: &str| -> Option<Winner> {
        parsed.data.get(key).and_then(|w| w.clone()).map(Winner::from)
    };

    Some(CurrentWinners {
        cumulus: winner_for("CUMULUS Winner"),
        nimbus: winner_for("NIMBUS Winner"),
        stratus: winner_for("STRATUS Winner"),
        source_ip: ip,
    })
}

pub async fn get_current_winners(candidates: &[String]) -> Result<CurrentWinners, String> {
    if candidates.is_empty() {
        return Err("No candidate nodes supplied".to_string());
    }

    let client = create_client();
    let client = &client;

    let mut attempts = tokio_stream::iter(
        candidates
            .iter()
            .take(MAX_CANDIDATES_TRIED)
            .cloned()
            .map(|ip| try_candidate(client, ip)),
    )
    .buffer_unordered(MAX_CANDIDATES_TRIED);

    while let Some(result) = attempts.next().await {
        if let Some(winners) = result {
            return Ok(winners);
        }
    }

    Err("None of the candidate nodes returned current winner data".to_string())
}
