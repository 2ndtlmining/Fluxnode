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

/*
 * The raw body of the fluxbench package index.
 *
 * Returns the WHOLE document, not a hand-picked line. This used to do
 * `body.split("\n").collect()` then `files.get(5).unwrap()`, which assumed a
 * plain-text listing whose sixth line was a .deb filename. The endpoint serves
 * an HTML directory listing, so that line is `</head>`: the version regex then
 * failed to match and the unwrap panicked, killing a tokio worker and turning
 * /api/v1/bench-version into a 502. Finding the version is the caller's job
 * now, and it does it by pattern rather than by position.
 */
async fn get_index_body(client: &Client) -> Result<String, String> {
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
        Ok(body)
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

    let body = Retry::start(retry_strategy.clone(), || async {
        get_index_body(&client).await
    })
    .await?;

    // Safe to unwrap: a literal pattern, either valid on every run or none,
    // and covered by a test.
    let regex = Regex::new(r"_([0-9]+)\.([0-9]+)\.([0-9]+)_").unwrap();

    // The index lists every published build, so take the HIGHEST version
    // rather than the first or last match: ordering in the listing is the
    // server's choice, and amd64/arm64 both appear for each release.
    let newest = highest_version(&regex, &body);

    match newest {
        Some((major, minor, patch)) => Ok(format!("{}.{}.{}", major, minor, patch)),
        // An error, not a panic. This is remote content that can change shape
        // without warning -- which is exactly how the previous version broke.
        None => Err(String::from(
            "No fluxbench version found in the package index",
        )),
    }
}

/// Highest `_x.y.z_` version appearing anywhere in `body`, compared
/// numerically rather than lexically (so 6.10.0 beats 6.9.0).
fn highest_version(regex: &Regex, body: &str) -> Option<(u32, u32, u32)> {
    regex
        .captures_iter(body)
        .filter_map(|c| {
            let part = |i: usize| c.get(i)?.as_str().parse::<u32>().ok();
            Some((part(1)?, part(2)?, part(3)?))
        })
        .max()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn re() -> Regex {
        Regex::new(r"_([0-9]+)\.([0-9]+)\.([0-9]+)_").unwrap()
    }

    /*
     * The real body served by apt.runonflux.io: an HTML directory listing, not
     * the plain-text file list the previous implementation assumed.
     */
    #[test]
    fn finds_the_version_in_an_html_directory_listing() {
        let body = r#"<!DOCTYPE HTML>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Directory listing for /pool/main/f/fluxbench/</title>
</head>
<body>
<h1>Directory listing for /pool/main/f/fluxbench/</h1>
<ul>
<li><a href="fluxbench_6.3.1_amd64.deb">fluxbench_6.3.1_amd64.deb</a></li>
<li><a href="fluxbench_6.3.1_arm64.deb">fluxbench_6.3.1_arm64.deb</a></li>
</ul>
</body>
</html>"#;
        assert_eq!(highest_version(&re(), body), Some((6, 3, 1)));
    }

    #[test]
    fn picks_the_highest_version_not_the_first_or_last() {
        let body = "fluxbench_6.3.1_amd64.deb fluxbench_5.1.0_amd64.deb fluxbench_6.2.9_arm64.deb";
        assert_eq!(highest_version(&re(), body), Some((6, 3, 1)));
    }

    #[test]
    fn compares_numerically_not_lexically() {
        // 6.10.0 > 6.9.0, which string ordering gets backwards.
        let body = "fluxbench_6.9.0_amd64.deb fluxbench_6.10.0_amd64.deb";
        assert_eq!(highest_version(&re(), body), Some((6, 10, 0)));
    }

    #[test]
    fn returns_none_rather_than_panicking_when_nothing_matches() {
        // The failure that produced the 502: a body with no version in it at
        // all must be an error the caller can report, not a panic.
        assert_eq!(highest_version(&re(), "<html><head></head></html>"), None);
        assert_eq!(highest_version(&re(), ""), None);
    }
}
