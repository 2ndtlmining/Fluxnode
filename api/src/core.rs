#![allow(unused_macros)]

use serde::Serialize;
use serde_json::value::RawValue;

use std::collections::HashMap;
use std::net::SocketAddrV4;
use std::time::Duration;

use reqwest::{header, Client, ClientBuilder, Response, Url};

use futures::stream::StreamExt;
use tokio_stream;

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

/**
 * NamedEndpointDesc.0 => The object key under which the response would be stored
 * NamedEndpointDesc.1 => The path of the target API
 * */
struct NamedEndpointDesc(&'static str, &'static str);

array_constant!(
    /**
     * Add another entry in this array to have it included in the result. e.g
     * NamedEndpointDesc("another_key", "/path/to/fluxapi/enndpoint")
     * */
    const TARGET_API_ENDPOINTS: [NamedEndpointDesc; _] = [
        NamedEndpointDesc("bench_info", "/benchmark/getinfo"),
        NamedEndpointDesc("benchmarks", "/benchmark/getbenchmarks"),
        NamedEndpointDesc("apps", "/apps/installedapps"),
        NamedEndpointDesc("version", "/flux/version"),
    ]
);

// A thin wrapper to keep track of endpoint requests
struct SpawnedEndpoint {
    name: &'static str,
    response: Result<Response, reqwest::Error>,
}

async fn spawn_endpoint<'a>(
    client: &'a Client,
    base_url: &'a Url,
    endpoint_desc: &'static NamedEndpointDesc,
) -> SpawnedEndpoint {
    let req = client
        .get(base_url.join(endpoint_desc.1).unwrap())
        .build()
        .expect("::spawn_endpoint() => Falied to build url");

    let response = client.execute(req).await;

    SpawnedEndpoint {
        name: endpoint_desc.0,
        response,
    }
}

type SectionData = String;

/* Stores all the information and server responses for a single node */
struct FluxNode<'a> {
    // The id of the node (currently the string representation of its socket_address, but it might change in the future)
    id: String,
    // Address of node (IP + Port)
    socket_address: &'a SocketAddrV4,
    // Processed data fetched from the node's server. Maps from NamedEndpointDesc.0 to Some(data), or None if
    // there's an error
    sections: HashMap<&'static str, Option<SectionData>>,
}

impl<'a> FluxNode<'a> {
    pub fn from_addr(addr: &'a SocketAddrV4) -> Self {
        Self {
            id: addr.to_string(),
            socket_address: addr,
            sections: HashMap::new(),
        }
    }
}

// Concurrently requests all the endpoints (TARGET_API_ENDPOINTS) and returns the processed FluxNode
async fn create_node_request<'a>(client: &Client, mut node: FluxNode<'a>) -> FluxNode<'a> {
    let base_url = Url::parse(format!("http://{}", node.socket_address).as_str()).unwrap();
    let base_url = &base_url;

    // Directly iterating over TARGET_API_ENDPOINTS keeps giving some error. So, here we are, iterating over the index range.
    let mut spawns = tokio_stream::iter(
        (0..TARGET_API_ENDPOINTS.len())
            .map(|index| spawn_endpoint(client, base_url, &TARGET_API_ENDPOINTS[index])),
    )
    .buffer_unordered(TARGET_API_ENDPOINTS.len());

    while let Some(spawned) = spawns.next().await {
        let spawned: SpawnedEndpoint = spawned;
        let map_slot: &mut Option<SectionData> = node.sections.entry(spawned.name).or_insert(None);

        if let Ok(server_result) = spawned.response {
            if let Ok(text_contents) = server_result.text().await {
                *map_slot = Some(text_contents);
            }
        }
    }

    return node;
}

// Processs all the node_addrs at once.
// Adds the processed FluxNode-s in *container.
async fn batch_nodes<'a>(
    client: &'a Client,
    container: &mut Vec<FluxNode<'a>>,
    node_addrs: &'a [SocketAddrV4],
) {
    let mut batch =
        tokio_stream::iter((0..node_addrs.len()).map(|index| {
            create_node_request(client, FluxNode::<'a>::from_addr(&node_addrs[index]))
        }))
        .buffered(node_addrs.len());

    while let Some(flux_node) = batch.next().await {
        let flux_node: FluxNode = flux_node;
        container.push(flux_node);
    }
}

/* The final serializable node info representation returned to the user */
#[derive(Debug, Serialize)]
pub struct OutputNode {
    pub id: String,
    pub results: HashMap<&'static str, Option<Box<RawValue>>>,
}

impl OutputNode {
    fn from_flux_node(node: FluxNode) -> Self {
        let mut output = Self {
            id: node.id,
            results: HashMap::new(),
        };

        for (name, response) in node.sections {
            let value = if let Some(content) = response {
                // RawValue is used to prevent copying and, more importantly, extra parsing.
                Some(RawValue::from_string(content).unwrap())
            } else {
                None
            };
            output.results.insert(name, value);
        }

        return output;
    }
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

pub async fn run_single(addr: &SocketAddrV4) -> OutputNode {
    let client = create_client();
    let node = create_node_request(&client, FluxNode::from_addr(addr));
    OutputNode::from_flux_node(node.await)
}

pub async fn run(addr_list: &[SocketAddrV4], chunk_size: usize) -> Vec<OutputNode> {
    let client = create_client();
    let mut container: Vec<FluxNode> = vec![];

    for chunk in addr_list.chunks(chunk_size) {
        batch_nodes(&client, &mut container, chunk).await;
    }

    container
        .into_iter()
        .map(OutputNode::from_flux_node)
        .collect::<Vec<_>>()
}
