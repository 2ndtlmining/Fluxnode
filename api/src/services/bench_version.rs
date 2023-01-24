#![allow(unused_macros)]

use regex::Regex;
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

const FLUX_VERSION_ENDPOINT: &'static str = "https://apt.runonflux.io/pool/main/f/fluxbench/";

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

async fn get_file_name(client: &Client) -> Result<String, String> {
    let url = Url::parse(&FLUX_VERSION_ENDPOINT).unwrap();
    let response = match client.get(url).send().await {
        Ok(response) => response,
        Err(e) => {
            return Err(e.to_string());
        }
    };

    // Check if the response is successful
    if response.status().is_success() {
        let body = response
            .text()
            .await
            .map_err(|e| format!("Error while reading the response: {}", e))?;
        let files: Vec<&str> = body.split("\n").collect();
        let first_file = files.get(5).unwrap();

        let file_name_string: String = first_file.to_string();
        Ok(file_name_string)
    } else {
        let err_string = format!("Request failed with status code: {}", response.status());
        return Err(err_string);
    }
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

pub async fn get_bench_version() -> Result<String, String> {
    let client = create_client();

    let retry_strategy = ExponentialBackoff::from_millis(10)
        .map(jitter) // add jitter to delays
        .take(3); // limit to 3 retries

    let file_name = Retry::spawn(retry_strategy.clone(), || async {
        get_file_name(&client).await
    })
    .await?;

    let regex = Regex::new(r"_([0-9]+\.[0-9]+\.[0-9]+)_").unwrap();

    // Extract the version number from the file name
    let version = regex.captures(&file_name).unwrap().get(1).unwrap().as_str();
    return Ok(String::from(version));
}
