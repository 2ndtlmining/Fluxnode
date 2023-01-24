pub mod core;
pub mod services;

#[macro_use]
extern crate lazy_static;

use axum::{
    handler::Handler, http::StatusCode, response::IntoResponse, routing::get, Router, Server,
};
use std::env;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};

const DEFAULT_PORT: u16 = 5049;

fn read_port() -> u16 {
    match env::var("APP_API_PORT") {
        Ok(port_str) => port_str.parse::<u16>().unwrap_or(DEFAULT_PORT),
        Err(_) => DEFAULT_PORT,
    }
}

#[tokio::main]
async fn main() {
    // Main top-level routes
    let app = Router::new()
        .route("/", get(g_root))
        .nest("/api/v1", api_v1::make_router());

    // 404 handler
    let app = app.fallback(g_handler_404.into_service());

    // Cors handling
    let cors_layer = CorsLayer::new()
        .allow_headers(AllowHeaders::any())
        .allow_methods(AllowMethods::any())
        .allow_origin(AllowOrigin::mirror_request());

    let app = app.layer(cors_layer);

    let socket = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), read_port());

    println!("Listening on http://{}", socket);
    Server::bind(&socket)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn g_root() -> String {
    "Welcome to FluxNode".to_owned()
}

async fn g_handler_404() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "404: Not found")
}

pub mod api_v1 {
    use super::*;
    use axum::{
        routing::{get, post},
        Json,
    };
    use serde::{Deserialize, Serialize};
    use std::net::SocketAddrV4;
    use std::str::FromStr;

    pub fn make_router() -> Router {
        Router::new()
            .route("/", get(self::root))
            .route("/nodes", post(self::node_aggregate::handler))
            .route(
                "/node-single/:node_address",
                get(self::node_single::handler),
            )
            .route("/demo", get(self::node_demo::handler))
            .route("/bench-version", get(self::bench_version::handler))
    }

    async fn root() -> String {
        "API v1".to_owned()
    }

    pub mod node_demo {
        use super::*;
        use axum::extract::Path;

        // Endpoint's response returned back
        #[derive(Debug, Serialize)]
        pub struct DemoResultBody {
            success: bool,
            address: Option<String>,
            error: Option<String>,
        }

        impl DemoResultBody {
            // Body when the request failed
            fn make_err(error: String) -> Self {
                Self {
                    success: false,
                    address: None,
                    error: Some(error),
                }
            }
            // Body when the request succeeded
            fn make_demo(address: String) -> Self {
                Self {
                    success: true,
                    address: Some(address),
                    error: None,
                }
            }
        }

        pub async fn handler() -> impl IntoResponse {
            let result = match services::demo::get_winner_address().await {
                Ok(response) => DemoResultBody::make_demo(response),
                Err(err) => DemoResultBody::make_err(err.to_string()),
            };
            (StatusCode::OK, Json(result))
        }
    }

    pub mod bench_version {
        use super::*;

        // Endpoint's response returned back
        #[derive(Debug, Serialize)]
        pub struct BenchVersionResultBody {
            success: bool,
            version: Option<String>,
            error: Option<String>,
        }

        impl BenchVersionResultBody {
            // Body when the request failed
            fn make_err(error: String) -> Self {
                Self {
                    success: false,
                    version: None,
                    error: Some(error),
                }
            }
            // Body when the request succeeded
            fn make_bench_version(version: String) -> Self {
                Self {
                    success: true,
                    version: Some(version),
                    error: None,
                }
            }
        }

        pub async fn handler() -> impl IntoResponse {
            let result = match services::bench_version::get_bench_version().await {
                Ok(response) => BenchVersionResultBody::make_bench_version(response),
                Err(err) => BenchVersionResultBody::make_err(err.to_string()),
            };
            (StatusCode::OK, Json(result))
        }
    }

    pub mod node_single {
        use super::*;
        use axum::extract::Path;

        // Endpoint's response returned back
        #[derive(Debug, Serialize)]
        pub struct SingleNodeResultBody {
            success: bool,
            node: Option<core::OutputNode>,
            error: Option<String>,
        }

        impl SingleNodeResultBody {
            // Body when the request failed
            fn make_err(error: String) -> Self {
                Self {
                    success: false,
                    node: None,
                    error: Some(error),
                }
            }
            // Body when the request succeeded
            fn make_node(node: core::OutputNode) -> Self {
                Self {
                    success: true,
                    node: Some(node),
                    error: None,
                }
            }
        }

        pub async fn handler(Path(node_address): Path<String>) -> impl IntoResponse {
            match SocketAddrV4::from_str(node_address.as_str()) {
                Ok(ref addr) => {
                    let node_output = core::run_single(addr).await;
                    (
                        StatusCode::OK,
                        Json(SingleNodeResultBody::make_node(node_output)),
                    )
                }
                Err(_) => (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(SingleNodeResultBody::make_err(format!(
                        "Failed to parse given node address: \"{}\"",
                        node_address
                    ))),
                ),
            }
        }
    }

    pub mod node_aggregate {
        use super::*;

        /* Found just the right number after a lot of benchmarking */
        const NODES_CHUNK_SIZE: usize = 26;

        pub async fn handler(Json(payload): Json<NodesPayload>) -> impl IntoResponse {
            match payload.sock_addrs_list() {
                Ok(addr_list) => {
                    let nodes = core::run(&addr_list[..], NODES_CHUNK_SIZE).await;
                    (StatusCode::OK, Json(NodesResultBody::make_list(nodes)))
                }
                Err(BadNode { index, node }) => (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(NodesResultBody::make_err(format!(
                        "Failed to parse node: \"{}\" at index {}",
                        node, index
                    ))),
                ),
            }
        }

        #[derive(Debug, Deserialize)]
        pub struct NodesPayload {
            nodes: Vec<String>,
        }

        struct BadNode {
            // Index of the node in the input arruy
            index: usize,
            // Actual text input from the array at that index
            node: String,
        }

        impl NodesPayload {
            // Parse the user input into the target structures
            fn sock_addrs_list(self) -> Result<Vec<SocketAddrV4>, BadNode> {
                self.nodes
                    .into_iter()
                    .enumerate()
                    .map(|(index, addr)| {
                        if let Ok(parsed) = SocketAddrV4::from_str(addr.as_str()) {
                            Ok(parsed)
                        } else {
                            Err(BadNode { index, node: addr })
                        }
                    })
                    .collect::<Result<_, _>>()
            }
        }

        // Endpoint's response returned back
        #[derive(Debug, Serialize)]
        pub struct NodesResultBody {
            success: bool,
            nodes: Vec<core::OutputNode>,
            error: Option<String>,
        }

        impl NodesResultBody {
            fn make_err(error: String) -> Self {
                Self {
                    success: false,
                    nodes: vec![],
                    error: Some(error),
                }
            }
            fn make_list(nodes: Vec<core::OutputNode>) -> Self {
                Self {
                    success: true,
                    nodes: nodes,
                    error: None,
                }
            }
        }
    }
}
