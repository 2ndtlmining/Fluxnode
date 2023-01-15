#![allow(unused_macros)]

use serde::{Deserialize, Serialize};

use std::collections::HashMap;
use std::time::Duration;

use reqwest::{header, Client, ClientBuilder, Url};

use tokio_retry::strategy::{jitter, ExponentialBackoff};
use tokio_retry::Retry;

/* A simple debug macro */
// For debug mode
#[cfg(debug_assertions)]
macro_rules! debug {
    ($x:expr) => {
        eprintln!("{}", $x)
    };
}
// For release mode
#[cfg(not(debug_assertions))]
macro_rules! debug {
    ($x:expr) => {
        std::convert::identity($x)
    };
}

macro_rules! array_constant {
    (
        $( #[$attr:meta] )*
        $v:vis $id:ident $name:ident: [$ty:ty; _] = $value:expr
    ) => {
        $( #[$attr] )*
        $v $id $name: [$ty; $value.len()] = $value;
    }
}

const DEMO_API_ENDPOINT: &'static str = "http://195.3.220.248:16127/daemon/fluxcurrentwinner";

#[derive(Deserialize, Serialize)]
struct FluxCurrentWinner {
    status: String,
    data: HashMap<String, Option<Winner>>,
}

impl FluxCurrentWinner {
    fn from_json(json: String) -> Result<Self, String> {
        match serde_json::from_str(&json) {
            Ok(flux_current_winner) => Ok(flux_current_winner),
            Err(e) => Err(format!("Error: {}", e)),
        }
    }
}

#[derive(Deserialize, Serialize)]
struct Winner {
    collateral: String,
    ip: String,
    added_height: i32,
    confirmed_height: i32,
    last_confirmed_height: i32,
    last_paid_height: i32,
    tier: String,
    payment_address: String,
}

lazy_static! {
    // The default set of headers used for node api requests
    static ref G_CLIENT_HEADERS: header::HeaderMap = {
        let mut client_headers = header::HeaderMap::new();
        client_headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json, text/plain, */*"),
        );
        client_headers.insert(
            header::ACCEPT_LANGUAGE,
            header::HeaderValue::from_static("Accept-Language': 'en-US,en;q=0.5"),
        );
        client_headers
    };
}

async fn get_demo_address_request(client: &Client) -> Result<String, reqwest::Error> {
    let url = Url::parse(&DEMO_API_ENDPOINT).unwrap();
    let response = client.get(url).send().await?;
    let text_contents = response.text().await?;
    Ok(text_contents)
}

fn create_client() -> Client {
    let client_headers = (*G_CLIENT_HEADERS).clone();

    ClientBuilder::new()
        .timeout(Duration::from_secs(7))
        .default_headers(client_headers)
        .build()
        .expect("::create_client() => Failed to configure client")
}

/* =========================================== */
/* =========================================== */
/* =========================================== */

async fn run_demo_address_request() -> Result<String, reqwest::Error> {
    let client = create_client();

    let retry_strategy = ExponentialBackoff::from_millis(10)
        .map(jitter) // add jitter to delays
        .take(3); // limit to 3 retries

    let result = Retry::spawn(retry_strategy.clone(), || async {
        get_demo_address_request(&client).await
    })
    .await?;

    return Ok(result);
}

pub async fn get_winner_address() -> Result<String, String> {
    let result = match run_demo_address_request().await {
        Ok(result) => result,
        Err(e) => {
            return Err(e.to_string());
        }
    };
    let data = match FluxCurrentWinner::from_json(result) {
        Ok(data) => data,
        Err(e) => return Err(e),
    };
    let cumulus_winner = data.data.get("CUMULUS Winner").and_then(|v| v.as_ref());
    match cumulus_winner {
        Some(winner) => return Ok(winner.payment_address.clone()),
        None => return Err("Cannot find winner".to_string()),
    }
}
