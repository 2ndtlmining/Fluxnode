pub mod core;
pub mod services;

#[macro_use]
extern crate lazy_static;

use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
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

    // First-ever background job in this API — every existing service is
    // request-driven. Runs an immediate cycle on boot (covers both a genuine
    // cold start and a replica that's been rescheduled to a fresh node with
    // no local data) and then hourly. run_scan_cycle() itself no-ops quickly
    // if already caught up to the tip.
    tokio::spawn(async {
        loop {
            services::chain_activity::run_scan_cycle().await;
            tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
        }
    });

    // 404 handler
    let app = app.fallback(g_handler_404);

    // Cors handling
    let cors_layer = CorsLayer::new()
        .allow_headers(AllowHeaders::any())
        .allow_methods(AllowMethods::any())
        .allow_origin(AllowOrigin::mirror_request());

    let app = app.layer(cors_layer);

    let socket = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), read_port());

    println!("Listening on http://{}", socket);
    let listener = tokio::net::TcpListener::bind(socket)
        .await
        .expect("failed to bind the API port");
    axum::serve(listener, app)
        .await
        .expect("API server stopped unexpectedly");
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
            .route(
                "/live/current-winners",
                post(self::live_winners::handler),
            )
            .route("/chain-activity", get(self::chain_activity::handler))
            .route("/chain-activity/blocks", get(self::chain_activity_blocks::handler))
    }

    async fn root() -> String {
        "API v1".to_owned()
    }

    pub mod node_demo {
        use super::*;

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

    pub mod live_winners {
        use super::*;

        #[derive(Debug, Deserialize)]
        pub struct LiveWinnersPayload {
            candidates: Vec<String>,
        }

        // Endpoint's response returned back
        #[derive(Debug, Serialize)]
        pub struct LiveWinnersResultBody {
            success: bool,
            winners: Option<services::live_winners::CurrentWinners>,
            error: Option<String>,
        }

        impl LiveWinnersResultBody {
            // Body when the request failed
            fn make_err(error: String) -> Self {
                Self {
                    success: false,
                    winners: None,
                    error: Some(error),
                }
            }
            // Body when the request succeeded
            fn make_winners(winners: services::live_winners::CurrentWinners) -> Self {
                Self {
                    success: true,
                    winners: Some(winners),
                    error: None,
                }
            }
        }

        pub async fn handler(Json(payload): Json<LiveWinnersPayload>) -> impl IntoResponse {
            let result = match services::live_winners::get_current_winners(&payload.candidates).await
            {
                Ok(winners) => LiveWinnersResultBody::make_winners(winners),
                Err(err) => LiveWinnersResultBody::make_err(err),
            };
            (StatusCode::OK, Json(result))
        }
    }

    pub mod chain_activity {
        use super::*;

        #[derive(Debug, Serialize)]
        pub struct ChainActivityResultBody {
            success: bool,
            daily: Vec<services::chain_activity::DailyCount>,
            team_txs: Vec<services::chain_activity::TeamTx>,
            last_scanned_height: i64,
            // Real health of the background scanner, not just whatever's on
            // disk — `success` above only ever means "this HTTP request
            // itself succeeded", it says nothing about whether the scanner
            // is keeping up. See ScanStatus's own doc comment.
            last_attempt_at: i64,
            last_success_at: i64,
            last_outcome: services::chain_activity::ScanOutcome,
            // Both 0 unless last_outcome is currently in_progress — see
            // ScanStatus's own field doc comment. Combined with
            // last_scanned_height above, a viewer computes real "X of Y
            // blocks" progress instead of just knowing a scan is running.
            scan_start_height: i64,
            scan_target_height: i64,
        }

        // Synchronous read of whatever the background scanner has already
        // persisted — never triggers a scan on the request path.
        pub async fn handler() -> impl IntoResponse {
            let scan_status = services::chain_activity::load_scan_status();
            let body = ChainActivityResultBody {
                success: true,
                daily: services::chain_activity::load_daily_rollup(),
                team_txs: services::chain_activity::load_team_txs(),
                last_scanned_height: services::chain_activity::load_checkpoint().last_scanned_height,
                last_attempt_at: scan_status.last_attempt_at,
                last_success_at: scan_status.last_success_at,
                scan_start_height: scan_status.scan_start_height,
                scan_target_height: scan_status.scan_target_height,
                last_outcome: scan_status.last_outcome,
            };
            (StatusCode::OK, Json(body))
        }
    }

    /*
     * The blocks behind the Utility count (issue #199).
     *
     * A SEPARATE endpoint rather than more fields on /chain-activity, which
     * every Chain Activity tab load already fetches. The retained utility-block
     * set is a few hundred KB; adding it to the common payload would tax every
     * visitor for a drill-down only some open. This one is fetched lazily, on
     * first expand.
     */
    pub mod chain_activity_blocks {
        use super::*;
        use axum::extract::Query;

        const DEFAULT_LIMIT: usize = 50;
        const MAX_LIMIT: usize = 200;

        #[derive(Debug, Deserialize)]
        pub struct BlocksQuery {
            limit: Option<usize>,
        }

        #[derive(Debug, Serialize)]
        struct CategoryTotals {
            /*
             * DISJOINT counts: p2p_only + dapp_only + both == utility_total.
             *
             * is_p2p and is_dapp are independent booleans, so overlapping
             * "any P2P" / "any Dapp" tallies would not sum to the total and
             * would read as a bug on screen. Partitioning here means the UI
             * can render three numbers that visibly add up.
             */
            p2p_only: usize,
            dapp_only: usize,
            both: usize,
            utility_total: usize,
        }

        #[derive(Debug, Serialize)]
        pub struct ChainActivityBlocksBody {
            success: bool,
            totals: CategoryTotals,
            blocks: Vec<services::chain_activity::UtilityBlockRecord>,
            returned: usize,
        }

        // Synchronous read of what the background scanner has already
        // persisted; never triggers a scan on the request path, matching the
        // sibling chain-activity handler.
        pub async fn handler(Query(params): Query<BlocksQuery>) -> impl IntoResponse {
            let mut blocks = services::chain_activity::load_utility_blocks();

            // Totals are over the WHOLE retained set, not the returned page --
            // the UI shows "showing N of M", and M has to be the real total or
            // the footer lies.
            let totals = CategoryTotals {
                p2p_only: blocks.iter().filter(|b| b.is_p2p && !b.is_dapp).count(),
                dapp_only: blocks.iter().filter(|b| !b.is_p2p && b.is_dapp).count(),
                both: blocks.iter().filter(|b| b.is_p2p && b.is_dapp).count(),
                utility_total: blocks.len(),
            };

            // Most recent first, then truncate. Clamped so a hand-crafted
            // ?limit=99999 cannot ask for the entire retained set.
            blocks.sort_by(|a, b| b.height.cmp(&a.height));
            let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
            blocks.truncate(limit);

            let body = ChainActivityBlocksBody {
                success: true,
                totals,
                returned: blocks.len(),
                blocks,
            };
            (StatusCode::OK, Json(body))
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
