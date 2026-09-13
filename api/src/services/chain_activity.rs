use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use reqwest::{Client, ClientBuilder};
use std::time::Duration;
use futures::stream::{self, StreamExt};

/*
 * Flux team's transparent payment address — a different identity space from the
 * FLUX_TEAM_OWNER_ZELIDS used by the Apps tab (client/src/analytics/teamSponsored.js),
 * which identifies app ownership, not fund movement. Sourced from
 * Fluxtracker_supabase's own FLUX_TEAM_ADDRESSES (src/lib/config.js) — see
 * PREMIUM_FEATURES_PLAN.md. Small, extensible array (currently one entry) — add more
 * here if the team confirms additional addresses later, same shape.
 */
pub const FLUX_TEAM_ADDRESSES: &[&str] = &["t1gjUUxBpBeVC1sWwAFrtSsVCbSaFdZx8UY"];

// 30-second block time (confirmed against client/src/apidata.js's own
// `BLOCK_RATE = 480 // at 30s blocks = 240 minutes` comment).
pub const BLOCKS_PER_DAY: i64 = 2880;
// Matches what the UI actually needs (24h/7d selectable ranges) plus one buffer
// day — not a larger archive nothing reads. See the design spec for the full
// reasoning (multi-replica Flux hosting means no format survives a node move,
// so a bigger retention window buys nothing extra in durability, only cost).
pub const RETENTION_DAYS: i64 = 8;
pub const RETENTION_BLOCKS: i64 = BLOCKS_PER_DAY * RETENTION_DAYS; // 23,040
// Lowered from an initial 8 after live-testing the explorer API confirmed it
// rate-limits bursts aggressively (HTTP 429, with a ban lasting 60+ seconds
// once tripped) — 2 concurrent requests plus the retry-with-backoff wrapper
// (get_with_backoff, below) is the safer default.
pub const SCAN_CONCURRENCY: usize = 2;
// Bounds a single scan_range() call's blast radius on a gap, and gives each
// batch its own persisted checkpoint — a cold-start backfill no longer needs
// to complete in one uninterrupted pass to make (and keep) progress. Chosen
// to keep a single batch's wall time well under a minute at SCAN_CONCURRENCY=2.
const SCAN_BATCH_SIZE: i64 = 300;

pub const DATA_DIR: &str = "data";
pub const DAILY_ROLLUP_FILE: &str = "chain_activity_daily.json";
pub const TEAM_TX_FILE: &str = "chain_activity_team_tx.json";
pub const UTILITY_BLOCKS_FILE: &str = "chain_activity_utility_blocks.json";
pub const CHECKPOINT_FILE: &str = "chain_activity_checkpoint.json";
pub const SCAN_STATUS_FILE: &str = "chain_activity_scan_status.json";
pub const APP_FEE_FILE: &str = "chain_activity_app_fee.json";

/*
 * A POOL, not a single host. Confirmed 2026-09-11: explorer.runonflux.io was
 * returning 429 with `Retry-After: 31` while explorer.app.runonflux.io served
 * the same endpoints with HTTP 200. Trying the other host costs one request;
 * sleeping out a backoff on a banned host costs up to 62 seconds.
 *
 * That distinction is what made a cold start effectively never finish. A
 * full backfill is RETENTION_BLOCKS (23,040) blocks at 2+ requests each; at
 * up to 62s of sleep per rate-limited request on one host, the scan reports
 * "block 0 of <tip>" indefinitely and Chain Activity renders nothing.
 */
const EXPLORER_BASES: &[&str] = &[
    "https://explorer.runonflux.io/api",
    "https://explorer.app.runonflux.io/api",
];
const APP_SPECS_URL: &str = "https://api.runonflux.io/apps/globalappsspecifications";
const HTTP_TIMEOUT_SECS: u64 = 15;

fn create_client() -> Client {
    ClientBuilder::new()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .expect("chain_activity::create_client() => Failed to configure client")
}

const MAX_RETRIES: u32 = 5;
const RETRY_BASE_DELAY_MS: u64 = 2000;

/*
 * Wraps a single GET with exponential backoff specifically on HTTP 429 (Too
 * Many Requests) — confirmed via live testing that this explorer API bans
 * bursts of concurrent requests, with the ban outlasting a 60-second wait in
 * at least one observed case. A transient trip now degrades to "slower, but
 * still makes progress" rather than "every remaining request in this cycle
 * fails instantly." Any other non-2xx status or network error is NOT
 * retried — those are treated as this request's failure immediately, same
 * as before this fix, since retrying a 404/500 isn't going to help.
 * MAX_RETRIES=5 / RETRY_BASE_DELAY_MS=2000 gives 6 total attempts with delays
 * of 2s/4s/8s/16s/32s = 62s total budget — comfortably past the 60+ second
 * ban duration observed during live testing of this API (the earlier
 * 3-retry/1s-base budget of 7s was well short of that).
 */
async fn get_with_backoff(client: &Client, url: &str) -> Option<reqwest::Response> {
    for attempt in 0..=MAX_RETRIES {
        match client.get(url).send().await {
            Ok(res) if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                if attempt == MAX_RETRIES {
                    return None;
                }
                let delay_ms = RETRY_BASE_DELAY_MS * 2u64.pow(attempt);
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            }
            Ok(res) => return Some(res),
            Err(_) => return None,
        }
    }
    None
}

/*
 * GET `path` from the first explorer host that answers.
 *
 * Ordering matters: every host is tried BEFORE any sleeping. A 429 on one host
 * says nothing about the other, so switching is strictly cheaper than backing
 * off -- one request versus up to 62 seconds. Only when the whole pool is
 * rate-limited in the same pass does this fall back to exponential backoff and
 * try the pool again.
 *
 * A non-429 response is returned as-is, preserving the previous contract that
 * a 404/500 is this request's failure rather than something to retry.
 */
async fn explorer_get(client: &Client, path: &str) -> Option<reqwest::Response> {
    for attempt in 0..=MAX_RETRIES {
        let mut all_rate_limited = true;

        for base in EXPLORER_BASES {
            let url = format!("{}{}", base, path);
            match client.get(&url).send().await {
                Ok(res) if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => continue,
                Ok(res) => return Some(res),
                Err(_) => {
                    // Host unreachable rather than throttled: try the next one,
                    // but do not let it trigger a pool-wide backoff by itself.
                    all_rate_limited = false;
                    continue;
                }
            }
        }

        if attempt == MAX_RETRIES {
            return None;
        }
        if all_rate_limited {
            let delay_ms = RETRY_BASE_DELAY_MS * 2u64.pow(attempt);
            println!(
                "[chain_activity] every explorer host rate-limited, backing off {}ms",
                delay_ms
            );
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }
    }
    None
}

#[derive(Debug, Deserialize)]
struct BlockIndexResponse {
    #[serde(rename = "blockHash")]
    block_hash: String,
}

#[derive(Debug, Deserialize)]
struct TxsPageResponse {
    #[serde(rename = "pagesTotal")]
    pages_total: i64,
    txs: Vec<RawTx>,
}

#[derive(Debug, Deserialize)]
struct RecentBlock {
    height: i64,
}

#[derive(Debug, Deserialize)]
struct RecentBlocksResponse {
    blocks: Vec<RecentBlock>,
}

/*
 * An app specification, as much of it as Chain Activity reports (issue #346).
 *
 * This used to parse `height` ALONE out of a 703 KB payload that already
 * carried everything below -- name, owner, instances, expire, the compose
 * components with their repo tags and resources. Widening it costs NOTHING:
 * the request was always being made and the bytes always arrived. #346 asked
 * for detail the scanner was already downloading and discarding.
 *
 * Every field but `height` is optional or defaulted. The spec format has
 * versions (v8 is current, v9 lands ~19 Oct per #206) and enterprise apps omit
 * `compose` entirely, so a strict struct would fail the whole parse on one
 * unusual app and report zero deployments for the cycle.
 */
#[derive(Debug, Deserialize, Clone)]
struct AppSpec {
    height: i64,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    instances: Option<u32>,
    #[serde(default)]
    expire: Option<i64>,
    /*
     * Present and non-empty on enterprise apps, whose resources are encrypted.
     * 390 of 1,462 live specs (26.7%) measured. Their name, owner and instance
     * count are still readable, so they are reported with those and an
     * enterprise marker rather than dropped or shown as using no resources.
     */
    #[serde(default)]
    enterprise: Option<String>,
    #[serde(default)]
    compose: Option<Vec<AppComposeComponent>>,
}

#[derive(Debug, Deserialize, Clone, Default)]
struct AppComposeComponent {
    #[serde(default)]
    repotag: Option<String>,
    #[serde(default)]
    cpu: Option<f64>,
    #[serde(default)]
    ram: Option<f64>,
    #[serde(default)]
    hdd: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct AppSpecsResponse {
    status: String,
    data: Option<Vec<AppSpec>>,
}

// ── Explorer API response shapes ─────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RawVin {
    pub addr: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RawScriptPubKey {
    pub addresses: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RawVout {
    // The explorer API returns this as a JSON string (e.g. "18.75000000"), not
    // a number — parsed explicitly in extract_p2p_transfers below.
    pub value: String,
    #[serde(rename = "scriptPubKey", default)]
    pub script_pub_key: Option<RawScriptPubKey>,
}

/*
 * One entry from GET /api/txs/?block=<hash>&pageNum=N. Node-confirmation txs
 * (type: "Confirming a fluxnode") carry no vin/vout keys at all — #[serde(default)]
 * on both fields means a missing key deserializes to an empty Vec rather than an
 * error, so extract_p2p_transfers below naturally produces zero transfers for
 * them without any special-casing.
 */
#[derive(Debug, Deserialize, Clone, Default)]
pub struct RawTx {
    pub txid: String,
    #[serde(rename = "isCoinBase", default)]
    pub is_coin_base: bool,
    #[serde(default)]
    pub vin: Vec<RawVin>,
    #[serde(default)]
    pub vout: Vec<RawVout>,
    // Present on every observed tx type (coinbase and confirmation both carry
    // it) — used to date-bucket a block without a second API call.
    #[serde(default)]
    pub time: Option<i64>,
}

// ── Classification output shapes ─────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TxTransfer {
    pub txid: String,
    pub from: Option<String>,
    pub to: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Default)]
pub struct BlockScanResult {
    pub height: i64,
    pub is_utility: bool,
    // The two reasons a block counts as utility, kept separately rather than
    // collapsed into `is_utility`. Both were already computed inside
    // scan_one_block and thrown away -- issue #199 is a persistence and
    // exposure gap, not a new-algorithm problem.
    pub is_p2p: bool,
    pub is_dapp: bool,
    pub transfer_count: u32,
    // How many app specs were attributed to this block, not merely whether any
    // were (issue #286). is_dapp stays as `deployment_count > 0`.
    pub deployment_count: u32,
    pub date: String,
    pub team_txs: Vec<TeamTx>,
    // Capped at MAX_STORED_TRANSFERS; transfer_count above stays the true
    // total (issue #282).
    pub transfers: Vec<TxTransfer>,
    // Capped at MAX_STORED_DEPLOYMENTS; deployment_count above stays the true
    // total, for the same reason (issue #346).
    pub deployments: Vec<DeploymentRecord>,
    // Already resolved to fetch the block's transactions, and previously
    // discarded. The explorer's block page takes a hash, not a height (#347).
    pub hash: String,
}

/*
 * One utility block, persisted so the Utility count can be drilled into.
 *
 * ONLY utility blocks are recorded. Empty blocks stay aggregate-only in
 * DailyCount -- nobody drills into "nothing happened", and storing them would
 * roughly sextuple this file for no reader. A live probe (2026-09-11, 12 blocks
 * sampled across ~24h) measured ~17% of blocks as utility, so the retained set
 * is ~3,900 records over the 8-day window: a few hundred KB, in a data
 * directory that is rebuilt from the explorer on every restart anyway.
 */
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct UtilityBlockRecord {
    pub height: i64,
    pub date: String,
    pub is_p2p: bool,
    pub is_dapp: bool,
    pub transfer_count: u32,
    /*
     * Added by issue #286. `serde(default)` is load-bearing, not decoration:
     * this file is already on disk in every running deployment without the
     * field, and a missing-field error would fail the whole read, discard the
     * retained window and trigger a ~23,040-block rescan on upgrade. Records
     * written before this change report 0 deployments, which is the honest
     * answer -- the count was never captured for them.
     */
    #[serde(default)]
    pub deployment_count: u32,
    /*
     * The block's P2P transfers, capped at MAX_STORED_TRANSFERS (issue #282).
     *
     * `serde(default)` for the same reason as deployment_count above: this file
     * is already on disk everywhere without the field, and a missing-field
     * error fails the whole read -- discarding the retained window and forcing
     * a ~23,040-block rescan on upgrade. Records written before this change
     * report an empty list, which is honest: the transfers were never stored
     * for them. They refill as the scanner moves on.
     */
    #[serde(default)]
    pub transfers: Vec<TxTransfer>,
    /*
     * The deployments attributed to this block, not merely how many (#346).
     *
     * `serde(default)` for the third time in this struct, and for the third
     * time it is load-bearing rather than decoration: the file is already on
     * disk in every running deployment without this field, and a missing-field
     * error fails the WHOLE read -- discarding the retained window and forcing
     * a ~23,040-block rescan on upgrade. Records written before this change
     * report an empty list, which is honest, and refill as the scanner moves
     * on. deployment_count above stays as the authoritative count; this list
     * is capped, that number is not.
     */
    #[serde(default)]
    pub deployments: Vec<DeploymentRecord>,
    /*
     * The block hash, for linking to the explorer (issue #347).
     *
     * The explorer's block page takes a hash, not a height -- /block/2946401
     * returns 404 -- and resolve_block_hash already fetches this while
     * scanning, then threw it away. Optional and defaulted for the same reason
     * as the fields above; a record without one renders as plain text rather
     * than a link that cannot work.
     */
    #[serde(default)]
    pub hash: Option<String>,
}

/*
 * One app deployment attributed to a block (issue #346).
 *
 * Resources are the SUM across compose components, which is what the app
 * actually consumes per instance; the per-component breakdown is not carried
 * because nothing on the screen reads it and it would multiply the stored size
 * for no gain. `instances` is separate so a reader can see both.
 *
 * `resources_known` distinguishes "this app uses no resources" -- which is not
 * a thing -- from "this app is enterprise, so its resources are encrypted and
 * we genuinely cannot say". Rendering 0 for the latter would be a confident
 * wrong number, the failure mode this codebase keeps designing against.
 */
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct DeploymentRecord {
    pub name: String,
    pub owner: String,
    pub instances: u32,
    pub repotag: String,
    pub cpu: f64,
    pub ram: f64,
    pub hdd: f64,
    pub enterprise: bool,
    pub resources_known: bool,
    pub expire: i64,
}

// ── Persisted shapes ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct DailyCount {
    pub date: String, // "YYYY-MM-DD", UTC
    pub utility_blocks: u32,
    pub empty_blocks: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TeamTx {
    pub txid: String,
    pub block_height: i64,
    pub from: String,
    pub to: String,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct Checkpoint {
    pub last_scanned_height: i64,
    /*
     * Whether the one-time utility-block repair has run (issue #231).
     *
     * #[serde(default)] is load-bearing, not boilerplate: every checkpoint
     * file written before this field existed deserializes to `false`, which is
     * exactly the deployments that need the repair. Adding the field without a
     * default would instead fail to parse those files and silently reset the
     * scanner to a cold start.
     */
    #[serde(default)]
    pub utility_backfill_done: bool,
}

/*
 * Whether this cycle should rewind to repopulate utility blocks (issue #231).
 *
 * Utility blocks arrived with #199, but they are only ever recorded inside the
 * scan loop. A deployment whose scanner had already reached the tip under the
 * previous code has a checkpoint sitting at the tip, so every later cycle takes
 * the "already caught up" early return and never records a single one. The
 * daily rollup still reports real utility COUNTS from those earlier scans, so
 * the Chain Activity tab shows a non-zero figure whose drill-down is empty.
 *
 * Gated on the checkpoint flag rather than purely on emptiness so that a
 * retention window genuinely containing no utility blocks does not re-trigger a
 * full 23,040-block rescan on every cycle, forever.
 */
pub fn should_backfill_utility_blocks(checkpoint: &Checkpoint, utility_blocks_empty: bool) -> bool {
    !checkpoint.utility_backfill_done && utility_blocks_empty
}

/*
 * Whether the LAST run_scan_cycle() attempt actually made it to the tip, not
 * whether any data exists — the /chain-activity endpoint used to hardcode
 * success: true regardless of what was on disk, so a genuinely-stalled
 * scanner (most often this API's own documented rate-limit bans — see
 * get_with_backoff's comment) was indistinguishable from "still building
 * initial history", both from the frontend's perspective.
 *
 * `Stalled` and `Unreachable` are honest, not maximally specific: a batch
 * that made no progress could be a 429 ban, a timeout, or a transient
 * explorer 500 — get_with_backoff already collapses all of those to `None`
 * before run_scan_cycle ever sees them, and disentangling that further
 * would mean threading a real error type through several more layers than
 * this fix's scope covers. `Stalled` names the most likely cause (this
 * API's own well-documented rate-limiting) without claiming certainty.
 *
 * `InProgress`: a genuine cold-start backfill (checkpoint 0, full
 * RETENTION_BLOCKS window) can take MANY MINUTES even with no rate-
 * limiting at all — 2+ explorer requests per block, SCAN_CONCURRENCY=2 by
 * design (see its own comment) — and get_with_backoff's retry budget alone
 * can stretch a single request past a minute under real 429s (live-
 * confirmed 2026-09-09: this API's rate limit is real and can affect a
 * scanner's own requests, not just a human's browser testing). Without
 * this state, a scan that has been legitimately running and retrying for
 * several minutes is indistinguishable from one that never started at all
 * — exactly the ambiguity this whole ScanStatus mechanism exists to
 * remove. Persisted immediately when a cycle starts, before any of that
 * potentially-long work, and overwritten with the real terminal outcome
 * once the cycle actually finishes.
 */
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScanOutcome {
    NeverRun,
    InProgress,
    CaughtUp,
    Stalled,
    Unreachable,
}

impl Default for ScanOutcome {
    fn default() -> Self {
        ScanOutcome::NeverRun
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct ScanStatus {
    // Unix seconds. 0 (the Default) means "never attempted" — real timestamps
    // post-2026 are all comfortably >0, so 0 doubles as a safe sentinel
    // without needing an Option here or in the JSON the frontend reads.
    pub last_attempt_at: i64,
    pub last_success_at: i64,
    pub last_outcome: ScanOutcome,
    // The height range the CURRENT in-progress attempt is scanning, so a
    // viewer can see real "X of Y blocks" progress rather than just "it's
    // running" — combined with the checkpoint's own last_scanned_height
    // (already exposed alongside this), progress = (last_scanned_height -
    // scan_start_height) / (scan_target_height - scan_start_height). Both 0
    // whenever last_outcome isn't InProgress: the range only means something
    // while a scan is actually active, and a stale leftover range on a
    // finished/never-run status would be misleading, not just unused.
    pub scan_start_height: i64,
    pub scan_target_height: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct DailyRollupFile {
    daily: Vec<DailyCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct TeamTxFile {
    team_txs: Vec<TeamTx>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct UtilityBlocksFile {
    blocks: Vec<UtilityBlockRecord>,
}

/*
 * Unix seconds -> "YYYY-MM-DD" UTC date string, with no external date/time
 * crate — this project has none today and a single pure conversion function
 * doesn't justify adding one. Implements the standard days-since-epoch ->
 * proleptic-Gregorian civil date algorithm (Howard Hinnant's
 * "chrono-Compatible Low-Level Date Algorithms" — well-known, deterministic,
 * no leap-second handling needed since block timestamps are already Unix
 * time).
 */
pub fn unix_to_utc_date(unix_secs: i64) -> String {
    let days = unix_secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/*
 * Ports client/src/live/apidata.js's extractP2pTransfers semantics to Rust —
 * not a literal code port (that's JS, this is Rust over a full block's txs,
 * not a pre-filtered "others" list) but the same rule: any output address
 * that isn't the first input's own address counts as a transfer, skipping
 * change-back-to-self. Coinbase and confirmation txs naturally produce
 * nothing (coinbase is skipped explicitly; confirmations have empty vout).
 */
pub fn extract_p2p_transfers(txs: &[RawTx]) -> Vec<TxTransfer> {
    let mut transfers = Vec::new();
    for tx in txs {
        if tx.is_coin_base {
            continue;
        }
        let from = tx.vin.get(0).and_then(|v| v.addr.clone());
        for vout in &tx.vout {
            let address = match vout
                .script_pub_key
                .as_ref()
                .and_then(|s| s.addresses.as_ref())
                .and_then(|a| a.get(0))
            {
                Some(a) => a.clone(),
                None => continue,
            };
            let amount: f64 = match vout.value.parse() {
                Ok(v) if v > 0.0 => v,
                _ => continue,
            };
            if from.as_deref() == Some(address.as_str()) {
                continue; // change-back-to-self
            }
            transfers.push(TxTransfer { txid: tx.txid.clone(), from: from.clone(), to: address, amount });
        }
    }
    transfers
}

pub fn is_block_utility(height: i64, transfers: &[TxTransfer], deployment_heights: &HashMap<i64, u32>) -> bool {
    // `> 0` is exactly what the HashSet's `contains` meant -- see #286.
    !transfers.is_empty() || deployment_heights.get(&height).copied().unwrap_or(0) > 0
}

pub fn extract_team_txs(height: i64, transfers: &[TxTransfer]) -> Vec<TeamTx> {
    transfers
        .iter()
        .filter(|t| {
            let from_is_team = t.from.as_deref().map(|f| FLUX_TEAM_ADDRESSES.contains(&f)).unwrap_or(false);
            let to_is_team = FLUX_TEAM_ADDRESSES.contains(&t.to.as_str());
            from_is_team || to_is_team
        })
        .map(|t| TeamTx {
            txid: t.txid.clone(),
            block_height: height,
            from: t.from.clone().unwrap_or_default(),
            to: t.to.clone(),
            amount: t.amount,
        })
        .collect()
}

pub fn upsert_daily_count(daily: &mut Vec<DailyCount>, date: &str, is_utility: bool) {
    if let Some(entry) = daily.iter_mut().find(|d| d.date == date) {
        if is_utility { entry.utility_blocks += 1 } else { entry.empty_blocks += 1 }
    } else {
        daily.push(DailyCount {
            date: date.to_string(),
            utility_blocks: if is_utility { 1 } else { 0 },
            empty_blocks: if is_utility { 0 } else { 1 },
        });
    }
}

pub fn trim_daily_retention(daily: &mut Vec<DailyCount>, keep_days: usize) {
    daily.sort_by(|a, b| a.date.cmp(&b.date));
    if daily.len() > keep_days {
        let excess = daily.len() - keep_days;
        daily.drain(0..excess);
    }
}

pub fn trim_team_txs(team_txs: &mut Vec<TeamTx>, min_height: i64) {
    team_txs.retain(|t| t.block_height >= min_height);
}

/*
 * Folds already-fetched (height, result) pairs into the rollup, applying only
 * the contiguous run of successes starting at `start_height + 1`. A gap
 * (failed fetch) stops the fold there WITHOUT applying anything past it, even
 * if a later height happened to succeed — the checkpoint this returns never
 * advances past a block that wasn't actually counted, so the next scan cycle
 * retries the gap instead of silently losing that block's contribution
 * forever. This is a real limitation on within-replica correctness for
 * transient failures, not the cross-replica drift the design spec already
 * accepts — kept deliberately simple (no retry queue) since a single explorer
 * hiccup during a bounded, concurrent scan is expected to be rare.
 */
pub fn fold_contiguous_results(
    start_height: i64,
    mut results: Vec<(i64, Option<BlockScanResult>)>,
    daily: &mut Vec<DailyCount>,
    team_txs: &mut Vec<TeamTx>,
    utility_blocks: &mut Vec<UtilityBlockRecord>,
) -> i64 {
    results.sort_by_key(|(h, _)| *h);
    let mut checkpoint = start_height;
    for (height, result) in results {
        match result {
            Some(r) if height == checkpoint + 1 => {
                upsert_daily_count(daily, &r.date, r.is_utility);
                team_txs.extend(r.team_txs);
                // Utility blocks only. The contiguous-run discipline above
                // already guarantees each height is folded exactly once, so
                // this cannot double-record and needs no dedupe.
                if r.is_utility {
                    utility_blocks.push(UtilityBlockRecord {
                        height: r.height,
                        date: r.date.clone(),
                        is_p2p: r.is_p2p,
                        is_dapp: r.is_dapp,
                        transfer_count: r.transfer_count,
                        deployment_count: r.deployment_count,
                        transfers: r.transfers.clone(),
                        deployments: r.deployments.clone(),
                        hash: Some(r.hash.clone()),
                    });
                }
                checkpoint = height;
            }
            _ => break,
        }
    }
    checkpoint
}

pub fn write_json_atomic<T: Serialize>(base_dir: &Path, filename: &str, value: &T) -> std::io::Result<()> {
    fs::create_dir_all(base_dir)?;
    let final_path = base_dir.join(filename);
    let tmp_path = base_dir.join(format!("{}.tmp", filename));
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(&tmp_path, bytes)?;
    fs::rename(&tmp_path, &final_path)?;
    Ok(())
}

pub fn read_json_or_default<T: for<'de> Deserialize<'de> + Default>(base_dir: &Path, filename: &str) -> T {
    fs::read(base_dir.join(filename))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn load_daily_rollup() -> Vec<DailyCount> {
    read_json_or_default::<DailyRollupFile>(Path::new(DATA_DIR), DAILY_ROLLUP_FILE).daily
}

pub fn load_utility_blocks() -> Vec<UtilityBlockRecord> {
    read_json_or_default::<UtilityBlocksFile>(Path::new(DATA_DIR), UTILITY_BLOCKS_FILE).blocks
}

pub fn save_utility_blocks(blocks: &[UtilityBlockRecord]) -> std::io::Result<()> {
    write_json_atomic(
        Path::new(DATA_DIR),
        UTILITY_BLOCKS_FILE,
        &UtilityBlocksFile { blocks: blocks.to_vec() },
    )
}

/*
 * Same bounded-retention rule as trim_team_txs: drop anything below the window
 * edge. Without this the file grows without limit while daily/team data stays
 * bounded, and a long-lived replica would slowly fill its disk with blocks no
 * endpoint can return.
 */
pub fn trim_utility_blocks(blocks: &mut Vec<UtilityBlockRecord>, min_height: i64) {
    blocks.retain(|b| b.height >= min_height);
}

pub fn load_team_txs() -> Vec<TeamTx> {
    read_json_or_default::<TeamTxFile>(Path::new(DATA_DIR), TEAM_TX_FILE).team_txs
}

pub fn load_checkpoint() -> Checkpoint {
    read_json_or_default(Path::new(DATA_DIR), CHECKPOINT_FILE)
}

pub fn save_daily_rollup(daily: &[DailyCount]) -> std::io::Result<()> {
    write_json_atomic(Path::new(DATA_DIR), DAILY_ROLLUP_FILE, &DailyRollupFile { daily: daily.to_vec() })
}

pub fn save_team_txs(team_txs: &[TeamTx]) -> std::io::Result<()> {
    write_json_atomic(Path::new(DATA_DIR), TEAM_TX_FILE, &TeamTxFile { team_txs: team_txs.to_vec() })
}

pub fn save_checkpoint(last_scanned_height: i64, utility_backfill_done: bool) -> std::io::Result<()> {
    write_json_atomic(
        Path::new(DATA_DIR),
        CHECKPOINT_FILE,
        &Checkpoint { last_scanned_height, utility_backfill_done },
    )
}

pub fn load_scan_status() -> ScanStatus {
    read_json_or_default(Path::new(DATA_DIR), SCAN_STATUS_FILE)
}

pub fn save_scan_status(status: &ScanStatus) -> std::io::Result<()> {
    write_json_atomic(Path::new(DATA_DIR), SCAN_STATUS_FILE, status)
}

/*
 * The app fee rate persists between cycles so a cycle whose fee lookup failed
 * keeps reporting the last good rate rather than dropping the figure off the
 * screen. A flat fee that has held for 300 consecutive payments does not become
 * unknowable because one request 429'd.
 */
pub fn load_app_fee_rate() -> Option<AppFeeRate> {
    read_json_or_default::<Option<AppFeeRate>>(Path::new(DATA_DIR), APP_FEE_FILE)
}

pub fn save_app_fee_rate(rate: &AppFeeRate) -> std::io::Result<()> {
    write_json_atomic(Path::new(DATA_DIR), APP_FEE_FILE, rate)
}

/*
 * ONE request per cycle, page 0 only.
 *
 * The payment address has 4,777 pages of history. Walking it would cost more
 * explorer budget than the block scan itself, against an API that already
 * rate-limits this scanner hard enough to be the reason the screen looks empty.
 * A flat fee needs no history: the ten most recent payments establish the
 * current rate, and a change would show up within a cycle.
 */
pub async fn fetch_app_fee_rate(client: &Client) -> Option<AppFeeRate> {
    let res = explorer_get(client, &format!("/txs?address={}", APP_PAYMENT_ADDRESS)).await?;
    let parsed: TxsPageResponse = res.json().await.ok()?;
    derive_app_fee_rate(&parsed.txs)
}

pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub async fn fetch_tip_height(client: &Client) -> Option<i64> {
    let res = explorer_get(client, "/blocks?limit=1").await?;
    let parsed: RecentBlocksResponse = res.json().await.ok()?;
    parsed.blocks.get(0).map(|b| b.height)
}

/*
 * How many of a block's transfers are kept (issue #282).
 *
 * Chosen against measured data, not a guess. Over the 80 utility blocks
 * retained at the time: 121 transfers in total, mean 1.51, median 1, p90 2,
 * max 13, and 71 of the 80 held exactly one. So 25 is a bound on a pathological
 * block rather than a limit anything ordinary reaches.
 *
 * It matters because this file is retained for 23,040 blocks (8 days). At the
 * measured rate the transfers add roughly 1.6 MB; an uncapped run on a block
 * stuffed with transactions could add far more, and this directory is rebuilt
 * from the explorer on every restart, so a runaway file costs a slow start for
 * nobody's benefit.
 */
pub const MAX_STORED_TRANSFERS: usize = 25;
/*
 * Same job as MAX_STORED_TRANSFERS, same reason (issue #346): one pathological
 * block must not be able to grow the retained file without bound. Measured
 * deploy volume is 37-185 PER DAY across ~2,880 blocks, so a block with more
 * than this many is already far outside anything observed -- the cap is a
 * guard, not a routine path. deployment_count stays the true total.
 */
pub const MAX_STORED_DEPLOYMENTS: usize = 25;

/*
 * The transfers to persist for a block.
 *
 * The caller keeps `transfers.len()` as transfer_count BEFORE calling this:
 * the count must stay true even when the list is capped, because busiest_block
 * ranks on it (#286) and the UI needs it to say "showing 25 of 40" rather than
 * silently under-reporting the block.
 */
pub fn cap_transfers(mut transfers: Vec<TxTransfer>) -> Vec<TxTransfer> {
    transfers.truncate(MAX_STORED_TRANSFERS);
    transfers
}

/*
 * Deployments per block height (issue #286).
 *
 * This used to be `.map(|s| s.height).collect::<HashSet<_>>()`, and a HashSet
 * de-duplicates: several apps deployed in the same block collapsed to a single
 * entry and the count was discarded on that line. Nothing else had to change to
 * recover it -- the number was already in hand and thrown away.
 */
pub fn count_deployments_by_height(heights: Vec<i64>) -> HashMap<i64, u32> {
    let mut counts: HashMap<i64, u32> = HashMap::new();
    for h in heights {
        *counts.entry(h).or_insert(0) += 1;
    }
    counts
}

/*
 * The app deployment fee, read off the chain rather than assumed (issue #346).
 *
 * Every app registration or update pays a flat fee to APP_PAYMENT_ADDRESS.
 * Measured over 300 consecutive payments spanning three days: every one exactly
 * 9.0 FLUX, paid alike by a 2-instance Valheim and a 100-instance SoftEther
 * VPN. It is a message fee, not a resource-scaled hosting cost.
 *
 * WHY DERIVE IT INSTEAD OF WRITING 9.0. A literal would become quietly wrong on
 * every deployment row the day Flux changes the fee, and nothing would fail --
 * no test, no build, no alert. The screen would simply state a false number.
 * Reading the current rate back off the chain each cycle costs ONE request and
 * removes that whole failure mode.
 *
 * WHY THIS LICENSES A PER-ROW FIGURE. Attributing a specific payment to a
 * specific app is NOT possible: amounts are identical and deployments cluster
 * around payments -- three consecutive deployments sat 0, 5 and 23 blocks after
 * the same one. But a flat fee needs no attribution. "This deployment cost 9
 * FLUX" is true of every deployment without pointing at any transaction. That
 * is why `uniform` matters: the moment payments stop agreeing, the premise
 * fails and the UI must say so rather than average over it.
 *
 * This is the opposite direction from #270, which starts from a donor's
 * outgoing transaction and asks whether it was an app payment. That is still
 * unanswerable without the v9 memo, and nothing here weakens it.
 */
pub const APP_PAYMENT_ADDRESS: &str = "t3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct AppFeeRate {
    /// FLUX per deployment, the most common amount observed.
    pub flux: f64,
    /// How many payments the figure was derived from.
    pub samples: u32,
    /// Whether EVERY sample agreed. False means the flat-fee premise no longer holds.
    pub uniform: bool,
}

pub fn derive_app_fee_rate(txs: &[RawTx]) -> Option<AppFeeRate> {
    let mut amounts: Vec<f64> = Vec::new();

    for tx in txs {
        // A coinbase pays block rewards, never app fees.
        if tx.is_coin_base {
            continue;
        }
        // Sum only the outputs paying the app address; the payer's change leg
        // rides in the same transaction and is not a fee.
        let paid: f64 = tx
            .vout
            .iter()
            .filter(|o| {
                o.script_pub_key
                    .as_ref()
                    .and_then(|s| s.addresses.as_ref())
                    .is_some_and(|a| a.iter().any(|addr| addr == APP_PAYMENT_ADDRESS))
            })
            .filter_map(|o| o.value.parse::<f64>().ok())
            .sum();
        if paid > 0.0 {
            amounts.push(paid);
        }
    }

    if amounts.is_empty() {
        return None;
    }

    /*
     * The mode, not the mean. Averaging would produce a figure no app actually
     * paid -- and with a flat fee the mode IS the fee. Keyed on satoshis so
     * float equality never decides this.
     */
    let mut tally: HashMap<i64, u32> = HashMap::new();
    for a in &amounts {
        *tally.entry((a * 1e8).round() as i64).or_insert(0) += 1;
    }
    let (sats, count) = tally.iter().max_by_key(|(sats, n)| (**n, -**sats))?;

    Some(AppFeeRate {
        flux: *sats as f64 / 1e8,
        samples: amounts.len() as u32,
        uniform: *count as usize == amounts.len(),
    })
}

/*
 * The deployments themselves, per block height (issue #346).
 *
 * Sits alongside count_deployments_by_height rather than replacing it, because
 * the two answer different questions and must not be derived from each other:
 * this list is CAPPED and that count is not. A block with more deployments
 * than the cap reports the true number and a truncated list, exactly as #282
 * arranged for transfers.
 *
 * Resources are summed across compose components -- what the app consumes per
 * instance. Taking the first component alone would understate every
 * multi-container app, and those are common.
 */
fn to_deployment_record(spec: AppSpec) -> DeploymentRecord {
    let components = spec.compose.unwrap_or_default();
    let is_enterprise = spec.enterprise.as_deref().is_some_and(|e| !e.is_empty());

    /*
     * An enterprise app encrypts its resources, so `compose` arrives empty.
     * Summing that gives 0, which would render as "this app uses no CPU" --
     * a confident wrong number rather than an absent one. resources_known
     * carries the difference so the UI can show a marker instead of zeros.
     * Measured: 390 of 1,462 live specs (26.7%).
     */
    let resources_known = !is_enterprise && !components.is_empty();

    DeploymentRecord {
        name: spec.name.unwrap_or_default(),
        owner: spec.owner.unwrap_or_default(),
        instances: spec.instances.unwrap_or(0),
        repotag: components
            .iter()
            .filter_map(|c| c.repotag.clone())
            .collect::<Vec<_>>()
            .join(", "),
        cpu: components.iter().filter_map(|c| c.cpu).sum(),
        ram: components.iter().filter_map(|c| c.ram).sum(),
        hdd: components.iter().filter_map(|c| c.hdd).sum(),
        enterprise: is_enterprise,
        resources_known,
        expire: spec.expire.unwrap_or(0),
    }
}

/*
 * Both answers about deployments, from one parse of one payload.
 *
 * `counts` is uncapped and authoritative; `records` is capped for storage. They
 * travel together because every caller that wants one wants the other in the
 * same breath, and threading two maps through scan_range and scan_one_block
 * separately invites passing the wrong one.
 */
#[derive(Debug, Default, Clone)]
pub struct DeploymentIndex {
    pub counts: HashMap<i64, u32>,
    pub records: HashMap<i64, Vec<DeploymentRecord>>,
}

fn deployments_by_height(specs: Vec<AppSpec>) -> HashMap<i64, Vec<DeploymentRecord>> {
    let mut by_height: HashMap<i64, Vec<DeploymentRecord>> = HashMap::new();
    for spec in specs {
        let entry = by_height.entry(spec.height).or_default();
        if entry.len() >= MAX_STORED_DEPLOYMENTS {
            continue;
        }
        entry.push(to_deployment_record(spec));
    }
    by_height
}

/*
 * The block with the most going on, over whatever slice of records it is given.
 *
 * Ranked on transfers PLUS deployments, which is the whole point: ranking on
 * transfers alone would put a block with 3 transfers above one with 2 transfers
 * and 9 deployments.
 *
 * Ties go to the HIGHER block. An arbitrary winner would flip between refreshes
 * as records age out, and of two equally busy blocks the recent one is the more
 * useful to show.
 */
pub fn busiest_block(blocks: &[UtilityBlockRecord]) -> Option<&UtilityBlockRecord> {
    blocks
        .iter()
        .max_by_key(|b| (b.transfer_count + b.deployment_count, b.height))
}

/*
 * The busiest block within the last `window` blocks of `tip` (issue #286).
 *
 * Windowed by HEIGHT rather than by the `date` string on each record. The dates
 * are calendar days in UTC, so "today" is anywhere from a minute to 24 hours of
 * chain depending on when it is asked -- which would make the answer depend on
 * the time of day rather than on the chain. Heights are uniform: 2,880 blocks
 * is 24 hours at the 30-second target, the same basis BLOCKS_PER_DAY already
 * uses everywhere else in this file.
 */
pub fn busiest_block_in_window(
    blocks: &[UtilityBlockRecord],
    tip: i64,
    window: i64,
) -> Option<&UtilityBlockRecord> {
    if tip <= 0 || window <= 0 {
        return None;
    }
    let floor = tip - window;
    blocks
        .iter()
        .filter(|b| b.height > floor && b.height <= tip)
        .max_by_key(|b| (b.transfer_count + b.deployment_count, b.height))
}

/*
 * One-time sync of every app spec's real deploy height, re-fetched fresh each
 * scan cycle rather than incrementally diffed — deliberately NOT a port of
 * client/src/live/apidata.js's diffDeployedForEvents, which diffs successive
 * "deployed today" snapshots and attributes to whatever block a live poll
 * happened to notice it at (a live-display trick, not a stable historical
 * fact). A backend batch scan doesn't need that: each spec's own `height`
 * field is already the real, stable answer to "was a deploy attributed to
 * this block."
 */
pub async fn fetch_deployment_heights(client: &Client) -> DeploymentIndex {
    let res = match get_with_backoff(client, APP_SPECS_URL).await {
        Some(r) => r,
        None => return DeploymentIndex::default(),
    };
    let parsed: AppSpecsResponse = match res.json().await {
        Ok(p) => p,
        Err(_) => return DeploymentIndex::default(),
    };
    if parsed.status == "error" {
        return DeploymentIndex::default();
    }
    let specs = parsed.data.unwrap_or_default();
    DeploymentIndex {
        counts: count_deployments_by_height(specs.iter().map(|s| s.height).collect()),
        records: deployments_by_height(specs),
    }
}

async fn resolve_block_hash(client: &Client, height: i64) -> Option<String> {
    let res = explorer_get(client, &format!("/block-index/{}", height)).await?;
    let parsed: BlockIndexResponse = res.json().await.ok()?;
    Some(parsed.block_hash)
}

/*
 * Fetches every page of a block's txs — not just page 0. Verified against the
 * live API (see this plan's Global Constraints): node-confirmation txs can
 * fill page 0 entirely, and pagination order isn't guaranteed to put a
 * genuine P2P transfer ahead of them, so a "this block has zero P2P
 * transfers" classification requires seeing every page. A failure on ANY
 * page — including page 0 — returns None rather than the pages gathered so
 * far: a partial page set can never support a "this block has zero P2P
 * transfers" conclusion, so scan_one_block must treat it as a failed scan of
 * the whole block (propagated via `?`) rather than a confirmed-empty one.
 */
async fn fetch_all_block_txs(client: &Client, block_hash: &str) -> Option<Vec<RawTx>> {
    let mut all_txs = Vec::new();
    let mut page_num = 0i64;
    let mut pages_total = 1i64;

    while page_num < pages_total {
        let res = explorer_get(client, &format!("/txs/?block={}&pageNum={}", block_hash, page_num)).await?;
        let page = res.json::<TxsPageResponse>().await.ok()?;
        pages_total = page.pages_total.max(1);
        all_txs.extend(page.txs);
        page_num += 1;
    }

    Some(all_txs)
}

pub async fn scan_one_block(client: &Client, height: i64, deployments: &DeploymentIndex) -> Option<BlockScanResult> {
    let hash = resolve_block_hash(client, height).await?;
    let txs = fetch_all_block_txs(client, &hash).await?;
    let transfers = extract_p2p_transfers(&txs);
    // The two categories, kept rather than collapsed. is_utility stays exactly
    // `is_p2p || is_dapp`, so every existing is_block_utility test still holds.
    let is_p2p = !transfers.is_empty();
    let deployment_count = deployments.counts.get(&height).copied().unwrap_or(0);
    let is_dapp = deployment_count > 0;
    let transfer_count = transfers.len() as u32;
    let is_utility = is_block_utility(height, &transfers, &deployments.counts);
    let team_txs = extract_team_txs(height, &transfers);
    // After transfer_count is taken above, so the count stays true.
    let stored_transfers = cap_transfers(transfers);
    // Every tx in a block shares (approximately) the same blocktime — prefer
    // the coinbase's (always present, page 0, item 0 in practice) but fall
    // back to any tx if that lookup ever comes up empty.
    let block_time = txs
        .iter()
        .find(|t| t.is_coin_base)
        .and_then(|t| t.time)
        .or_else(|| txs.first().and_then(|t| t.time))
        .unwrap_or(0);
    let date = unix_to_utc_date(block_time);
    // Cloned rather than moved: the index is shared across every block in the
    // concurrent scan, so this block cannot take ownership of its own slice.
    let block_deployments = deployments.records.get(&height).cloned().unwrap_or_default();
    Some(BlockScanResult { height, is_utility, is_p2p, is_dapp, transfer_count, deployment_count, date, team_txs, transfers: stored_transfers, deployments: block_deployments, hash })
}

/*
 * Scans every height in (start_height, tip_height] concurrently
 * (SCAN_CONCURRENCY at a time — same buffer_unordered pattern
 * live_winners.rs uses for its candidate fan-out), then folds the results in
 * height order via fold_contiguous_results (Task 1) so a gap never gets
 * silently skipped. Returns the new checkpoint height (may equal
 * start_height if nothing new was safely applied).
 */
async fn scan_range(
    client: &Client,
    start_height: i64,
    tip_height: i64,
    deployments: &DeploymentIndex,
    daily: &mut Vec<DailyCount>,
    team_txs: &mut Vec<TeamTx>,
    utility_blocks: &mut Vec<UtilityBlockRecord>,
) -> i64 {
    if start_height >= tip_height {
        return start_height;
    }

    let heights: Vec<i64> = (start_height + 1..=tip_height).collect();
    let mut fetches = stream::iter(heights.into_iter().map(|h| async move {
        (h, scan_one_block(client, h, deployments).await)
    }))
    .buffer_unordered(SCAN_CONCURRENCY);

    let mut results = Vec::new();
    while let Some(pair) = fetches.next().await {
        results.push(pair);
    }

    fold_contiguous_results(start_height, results, daily, team_txs, utility_blocks)
}

/*
 * The single entry point called both by the hourly scheduler (Task 4) and by
 * a cold-start replica catching up — same code path either way, just a
 * different `start_height` depending on how far behind the checkpoint is.
 */
/*
 * Pure decision of the persisted ScanStatus after one attempt, given what
 * happened — kept separate from run_scan_cycle's network/IO orchestration so
 * the actual rule ("only CaughtUp advances last_success_at, every outcome
 * advances last_attempt_at, everything else about `previous` is preserved")
 * is unit-testable without a live client or filesystem.
 */
fn next_scan_status(previous: ScanStatus, attempt_at: i64, outcome: ScanOutcome) -> ScanStatus {
    ScanStatus {
        last_attempt_at: attempt_at,
        last_success_at: if outcome == ScanOutcome::CaughtUp { attempt_at } else { previous.last_success_at },
        last_outcome: outcome,
        // Always reset here — a caller that knows the current scan's real
        // range calls with_scan_range() right after, which is the only
        // place these ever get a nonzero value.
        scan_start_height: 0,
        scan_target_height: 0,
    }
}

// Attaches the height range an in-progress scan is actively covering, once
// known (the tip height isn't available until after fetch_tip_height
// succeeds, one step after the InProgress status above is already
// persisted) — a separate small pure function rather than folding into
// next_scan_status itself, since only the InProgress path ever has a range
// to attach.
fn with_scan_range(status: ScanStatus, start_height: i64, target_height: i64) -> ScanStatus {
    ScanStatus { scan_start_height: start_height, scan_target_height: target_height, ..status }
}

fn persist_scan_status(status: ScanStatus) {
    if let Err(e) = save_scan_status(&status) {
        eprintln!("[chain_activity] failed to save scan status: {}", e);
    }
}

pub async fn run_scan_cycle() {
    let attempt_at = unix_now();
    let previous_status = load_scan_status();

    // Persisted BEFORE any of the potentially-long work below — a cold-start
    // backfill (or a run fighting this API's real rate limits) can take
    // several minutes to reach any of the exit points further down, and
    // without this write, an in-progress attempt is indistinguishable from
    // one that never started. Every other exit path below overwrites this
    // with the real terminal outcome once the cycle actually finishes.
    persist_scan_status(next_scan_status(previous_status.clone(), attempt_at, ScanOutcome::InProgress));

    let client = create_client();

    let tip_height = match fetch_tip_height(&client).await {
        Some(h) => h,
        None => {
            // explorer unreachable this cycle — try again next interval
            persist_scan_status(next_scan_status(previous_status, attempt_at, ScanOutcome::Unreachable));
            return;
        }
    };

    let checkpoint = load_checkpoint();
    let earliest_allowed = tip_height - RETENTION_BLOCKS;
    // Bounded catch-up: never scan further back than the retention window,
    // whether this is a genuine cold start (checkpoint 0) or a replica that's
    // been down long enough to fall behind the window entirely.
    let mut start_height = checkpoint.last_scanned_height.max(earliest_allowed);

    // One-time repair for deployments that caught up before utility blocks
    // existed. Rewinding to the window edge is the same range a cold start
    // would scan, so this costs one backfill and then never fires again.
    let backfilling_utility = should_backfill_utility_blocks(&checkpoint, load_utility_blocks().is_empty());
    if backfilling_utility && start_height > earliest_allowed {
        println!(
            "[chain_activity] utility blocks missing at checkpoint {} -- rewinding to {} to backfill (issue #231)",
            start_height, earliest_allowed
        );
        start_height = earliest_allowed;
    }

    if start_height >= tip_height {
        // already caught up to the tip — nothing to scan is itself success
        persist_scan_status(next_scan_status(previous_status, attempt_at, ScanOutcome::CaughtUp));
        return;
    }

    // Now that the real range is known, attach it to the InProgress status
    // already on disk — this is what lets a viewer (or docker logs) see
    // real "X of Y blocks" progress instead of just "it's running".
    persist_scan_status(with_scan_range(
        next_scan_status(previous_status.clone(), attempt_at, ScanOutcome::InProgress),
        start_height,
        tip_height,
    ));
    // Report the REMAINING count, not two absolute heights. "block 0 of
    // 2,939,881" reads as a 2.9-million-block sync when the real work is the
    // difference between them -- bounded by RETENTION_BLOCKS (23,040).
    println!(
        "[chain_activity] scan starting: {} blocks remaining (heights {} -> {}, retention window {})",
        tip_height - start_height, start_height, tip_height, RETENTION_BLOCKS
    );

    let deployment_heights = fetch_deployment_heights(&client).await;
    // #346: the deployment fee, read off the chain rather than hardcoded. A
    // failed lookup keeps whatever the last cycle stored.
    if let Some(rate) = fetch_app_fee_rate(&client).await {
        let _ = save_app_fee_rate(&rate);
    }
    let mut daily = load_daily_rollup();
    let mut team_txs = load_team_txs();
    let mut utility_blocks = load_utility_blocks();

    let mut checkpoint_height = start_height;
    let mut stalled = false;

    while checkpoint_height < tip_height {
        let batch_end = (checkpoint_height + SCAN_BATCH_SIZE).min(tip_height);
        let new_checkpoint = scan_range(&client, checkpoint_height, batch_end, &deployment_heights, &mut daily, &mut team_txs, &mut utility_blocks).await;

        trim_daily_retention(&mut daily, RETENTION_DAYS as usize);
        trim_team_txs(&mut team_txs, tip_height - RETENTION_BLOCKS);
        trim_utility_blocks(&mut utility_blocks, tip_height - RETENTION_BLOCKS);

        if let Err(e) = save_daily_rollup(&daily) {
            eprintln!("[chain_activity] failed to save daily rollup: {}", e);
        }
        if let Err(e) = save_team_txs(&team_txs) {
            eprintln!("[chain_activity] failed to save team txs: {}", e);
        }
        if let Err(e) = save_utility_blocks(&utility_blocks) {
            eprintln!("[chain_activity] failed to save utility blocks: {}", e);
        }
        // Writes the flag UNCHANGED mid-scan: promoting it here would mark the
        // repair done on the first batch, so a cycle that stalls halfway would
        // never retry it.
        if let Err(e) = save_checkpoint(new_checkpoint, checkpoint.utility_backfill_done) {
            eprintln!("[chain_activity] failed to save checkpoint: {}", e);
        }

        let made_progress = new_checkpoint > checkpoint_height;
        checkpoint_height = new_checkpoint;

        // One line per batch (every SCAN_BATCH_SIZE=300 blocks at most) so
        // watching `docker logs` during a long cold-start backfill shows
        // real, live progress instead of total silence until the final
        // summary line — the same visibility gap the in_progress status
        // fixes for the HTTP endpoint, but for an operator tailing logs.
        let pct = if tip_height > start_height {
            ((checkpoint_height - start_height) as f64 / (tip_height - start_height) as f64 * 100.0).round()
        } else {
            100.0
        };
        println!(
            "[chain_activity] batch done: checkpoint {} / tip {} ({:.0}% of this cycle's range)",
            checkpoint_height, tip_height, pct
        );

        if !made_progress || new_checkpoint < batch_end {
            // A gap was hit within this batch — stop the cycle here rather than
            // continuing to fire requests at an API that may still be rate-limiting
            // us. The next scheduled cycle resumes from this checkpoint.
            stalled = true;
            break;
        }
    }

    // The backfill only counts as done once the cycle reached the tip without
    // stalling; a partial pass leaves the flag clear so the next cycle retries.
    if backfilling_utility && !stalled {
        if let Err(e) = save_checkpoint(checkpoint_height, true) {
            eprintln!("[chain_activity] failed to mark utility backfill done: {}", e);
        } else {
            println!(
                "[chain_activity] utility block backfill complete ({} blocks retained)",
                load_utility_blocks().len()
            );
        }
    }

    let outcome = if stalled { ScanOutcome::Stalled } else { ScanOutcome::CaughtUp };
    persist_scan_status(next_scan_status(previous_status, attempt_at, outcome));

    println!(
        "[chain_activity] scanned up to {} (checkpoint now {})",
        tip_height, checkpoint_height
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * Issue #286: "busiest block of the last 24h" is transfers + deployments,
     * and the deployment half did not exist. fetch_deployment_heights collected
     * spec heights into a HashSet, which de-duplicates -- several apps deployed
     * in the same block collapsed to one entry and the count was discarded on
     * that line. These cover the counting that replaces it.
     */
    #[test]
    fn counts_every_deployment_at_a_height_not_just_whether_one_happened() {
        let counts = count_deployments_by_height(vec![100, 100, 100, 250]);
        assert_eq!(counts.get(&100), Some(&3));
        assert_eq!(counts.get(&250), Some(&1));
    }

    #[test]
    fn a_height_with_no_deployment_is_absent_rather_than_zero() {
        let counts = count_deployments_by_height(vec![100]);
        assert_eq!(counts.get(&999), None);
    }

    #[test]
    fn empty_spec_list_yields_no_counts_rather_than_panicking() {
        assert!(count_deployments_by_height(vec![]).is_empty());
    }

    /*
     * is_dapp has to keep meaning exactly what it meant, because
     * is_block_utility is `is_p2p || is_dapp` and every existing utility
     * classification depends on it. count > 0 is the same predicate the
     * HashSet's `contains` was.
     */
    #[test]
    fn is_dapp_still_means_at_least_one_deployment() {
        let counts = count_deployments_by_height(vec![100, 100]);
        assert!(counts.get(&100).copied().unwrap_or(0) > 0);
        assert!(counts.get(&101).copied().unwrap_or(0) == 0);
    }

    /*
     * The busiest block is ranked on transfers PLUS deployments. Ranking on
     * transfers alone would put a block with 3 transfers above one with 2
     * transfers and 9 deployments, which is the wrong answer to the question
     * being asked.
     */
    #[test]
    fn busiest_block_ranks_on_transfers_plus_deployments() {
        let blocks = vec![
            utility_record(10, 3, 0),
            utility_record(11, 2, 9),
            utility_record(12, 1, 1),
        ];
        assert_eq!(busiest_block(&blocks).map(|b| b.height), Some(11));
    }

    #[test]
    fn busiest_block_prefers_the_higher_block_when_activity_ties() {
        // A tie should resolve to the more recent block: it is the more useful
        // one to show, and an arbitrary winner would flicker between refreshes.
        let blocks = vec![utility_record(10, 2, 0), utility_record(40, 1, 1)];
        assert_eq!(busiest_block(&blocks).map(|b| b.height), Some(40));
    }

    /*
     * The upgrade path. Every running deployment already has
     * chain_activity_utility_blocks.json on disk WITHOUT this field, and a
     * missing-field error fails the whole read -- which would discard the
     * retained window and trigger a ~23,040-block rescan the first time the
     * new binary starts. Remove the serde(default) and this test says so.
     */
    #[test]
    fn reads_records_written_before_deployment_count_existed() {
        let old = r#"[{"height":42,"date":"2026-09-01","is_p2p":true,"is_dapp":false,"transfer_count":3}]"#;
        let parsed: Vec<UtilityBlockRecord> =
            serde_json::from_str(old).expect("pre-#286 records must still deserialize");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].height, 42);
        assert_eq!(parsed[0].transfer_count, 3);
        // Never captured for these, so 0 is the honest answer rather than a guess.
        assert_eq!(parsed[0].deployment_count, 0);
    }

    /*
     * Issue #282: clicking a utility block should show its transactions, and
     * they were never stored -- scan_one_block computed the full list and kept
     * only `.len()`.
     *
     * Measured before choosing a cap, over the 80 utility blocks retained at
     * the time: 121 transfers total, mean 1.51, median 1, p90 2, max 13, with
     * 71 of 80 blocks holding exactly one. The cap is a bound on a pathological
     * block, not a limit anything normal reaches.
     */
    #[test]
    fn keeps_a_blocks_transfers_up_to_the_cap() {
        let transfers: Vec<TxTransfer> = (0..5).map(|i| transfer(i)).collect();
        let kept = cap_transfers(transfers);
        assert_eq!(kept.len(), 5);
        assert_eq!(kept[0].txid, "tx0");
        assert_eq!(kept[4].txid, "tx4");
    }

    #[test]
    fn caps_a_pathological_block_rather_than_storing_it_whole() {
        let transfers: Vec<TxTransfer> = (0..(MAX_STORED_TRANSFERS + 40)).map(|i| transfer(i as i32)).collect();
        assert_eq!(cap_transfers(transfers).len(), MAX_STORED_TRANSFERS);
    }

    /*
     * transfer_count must stay the TRUE count even when the stored list is
     * capped: it is what busiest_block ranks on (#286), and it is what lets the
     * UI say "showing N of M" instead of quietly under-reporting the block.
     */
    #[test]
    fn capping_does_not_change_the_reported_transfer_count() {
        let total = MAX_STORED_TRANSFERS + 7;
        let transfers: Vec<TxTransfer> = (0..total).map(|i| transfer(i as i32)).collect();
        let count = transfers.len() as u32;
        let stored = cap_transfers(transfers);
        assert_eq!(count, total as u32);
        assert!(stored.len() < count as usize);
    }

    #[test]
    fn a_block_with_no_transfers_stores_an_empty_list() {
        assert!(cap_transfers(vec![]).is_empty());
    }

    /*
     * The upgrade path, same shape as #286's deployment_count: the retained
     * file is already on disk everywhere WITHOUT this field, and a
     * missing-field error would fail the whole read and force a ~23,040-block
     * rescan.
     */
    #[test]
    fn reads_records_written_before_transfers_were_stored() {
        let old = r#"[{"height":7,"date":"2026-09-01","is_p2p":true,"is_dapp":false,"transfer_count":4}]"#;
        let parsed: Vec<UtilityBlockRecord> =
            serde_json::from_str(old).expect("pre-#282 records must still deserialize");
        assert_eq!(parsed[0].transfer_count, 4);
        // The count survives; the list is simply unavailable for old records.
        assert!(parsed[0].transfers.is_empty());
    }

    #[test]
    fn busiest_block_in_window_ignores_blocks_older_than_the_window() {
        let blocks = vec![
            utility_record(1_000, 50, 50), // busiest overall, but far outside 24h
            utility_record(9_500, 2, 1),
        ];
        // tip 10_000, window 2_880 -> floor 7_120
        let picked = busiest_block_in_window(&blocks, 10_000, 2_880);
        assert_eq!(picked.map(|b| b.height), Some(9_500));
    }

    #[test]
    fn busiest_block_in_window_ignores_blocks_beyond_the_tip() {
        // A record above the tip would mean the retained set is ahead of the
        // checkpoint; it must not be offered as "the last 24 hours".
        let blocks = vec![utility_record(10_500, 99, 99), utility_record(9_900, 1, 0)];
        assert_eq!(busiest_block_in_window(&blocks, 10_000, 2_880).map(|b| b.height), Some(9_900));
    }

    #[test]
    fn busiest_block_in_window_is_none_when_nothing_falls_inside_it() {
        let blocks = vec![utility_record(1_000, 5, 5)];
        assert!(busiest_block_in_window(&blocks, 10_000, 2_880).is_none());
    }

    #[test]
    fn busiest_block_in_window_is_none_without_a_usable_tip() {
        // Before the first scan completes there is no checkpoint height.
        let blocks = vec![utility_record(9_900, 5, 5)];
        assert!(busiest_block_in_window(&blocks, 0, 2_880).is_none());
    }

    #[test]
    fn busiest_block_is_none_when_there_are_no_blocks() {
        assert!(busiest_block(&[]).is_none());
    }

    /*
     * Issue #231: the drill-down was empty on a deployment whose checkpoint had
     * already reached the tip before utility blocks existed.
     */
    #[test]
    fn backfills_when_utility_blocks_are_missing_and_repair_has_not_run() {
        let cp = Checkpoint { last_scanned_height: 3_000_000, utility_backfill_done: false };
        assert!(should_backfill_utility_blocks(&cp, true));
    }

    #[test]
    fn does_not_backfill_once_the_repair_has_run() {
        // A window that genuinely holds no utility blocks must not re-trigger a
        // full rescan on every cycle.
        let cp = Checkpoint { last_scanned_height: 3_000_000, utility_backfill_done: true };
        assert!(!should_backfill_utility_blocks(&cp, true));
    }

    #[test]
    fn does_not_backfill_when_utility_blocks_are_already_present() {
        let cp = Checkpoint { last_scanned_height: 3_000_000, utility_backfill_done: false };
        assert!(!should_backfill_utility_blocks(&cp, false));
    }

    /*
     * The serde default is what makes the repair reach existing deployments:
     * their checkpoint files predate the field entirely.
     */
    #[test]
    fn checkpoint_without_the_flag_parses_as_needing_the_backfill() {
        let old_file = r#"{"last_scanned_height": 3000000}"#;
        let cp: Checkpoint = serde_json::from_str(old_file).expect("old checkpoint must still parse");
        assert_eq!(cp.last_scanned_height, 3_000_000);
        assert!(!cp.utility_backfill_done);
        assert!(should_backfill_utility_blocks(&cp, true));
    }

    #[test]
    fn checkpoint_round_trips_the_flag() {
        let cp = Checkpoint { last_scanned_height: 42, utility_backfill_done: true };
        let encoded = serde_json::to_string(&cp).unwrap();
        let decoded: Checkpoint = serde_json::from_str(&encoded).unwrap();
        assert_eq!(cp, decoded);
    }

    #[test]
    fn unix_to_utc_date_epoch() {
        assert_eq!(unix_to_utc_date(0), "1970-01-01");
    }

    #[test]
    fn unix_to_utc_date_known_recent() {
        // 2026-09-06T00:00:00Z
        assert_eq!(unix_to_utc_date(1788652800), "2026-09-06");
    }

    #[test]
    fn unix_to_utc_date_leap_day() {
        // 2024-02-29T12:00:00Z
        assert_eq!(unix_to_utc_date(1709208000), "2024-02-29");
    }

    #[test]
    fn unix_to_utc_date_year_boundary() {
        // 2025-12-31T23:59:59Z
        assert_eq!(unix_to_utc_date(1767225599), "2025-12-31");
        // 2026-01-01T00:00:00Z
        assert_eq!(unix_to_utc_date(1767225600), "2026-01-01");
    }

    fn coinbase_tx() -> RawTx {
        RawTx { txid: "cb".into(), is_coin_base: true, vin: vec![], vout: vec![
            RawVout { value: "18.75".into(), script_pub_key: Some(RawScriptPubKey { addresses: Some(vec!["t1Reward".into()]) }) },
        ], time: Some(1_700_000_000) }
    }

    fn confirmation_tx() -> RawTx {
        // No vin/vout at all — matches the real API shape for "Confirming a fluxnode".
        RawTx { txid: "confirm1".into(), is_coin_base: false, vin: vec![], vout: vec![], time: Some(1_700_000_000) }
    }

    fn p2p_tx(from: &str, to: &str, amount: &str) -> RawTx {
        RawTx {
            txid: format!("p2p-{}-{}", from, to),
            is_coin_base: false,
            vin: vec![RawVin { addr: Some(from.to_string()) }],
            vout: vec![RawVout { value: amount.to_string(), script_pub_key: Some(RawScriptPubKey { addresses: Some(vec![to.to_string()]) }) }],
            time: Some(1_700_000_000),
        }
    }

    #[test]
    fn extract_p2p_transfers_ignores_coinbase_and_confirmations() {
        let txs = vec![coinbase_tx(), confirmation_tx()];
        assert_eq!(extract_p2p_transfers(&txs), vec![]);
    }

    #[test]
    fn extract_p2p_transfers_finds_a_real_send() {
        let txs = vec![coinbase_tx(), p2p_tx("t1Sender", "t1Receiver", "5.5")];
        let transfers = extract_p2p_transfers(&txs);
        assert_eq!(transfers.len(), 1);
        assert_eq!(transfers[0].from.as_deref(), Some("t1Sender"));
        assert_eq!(transfers[0].to, "t1Receiver");
        assert_eq!(transfers[0].amount, 5.5);
    }

    #[test]
    fn extract_p2p_transfers_skips_change_back_to_self() {
        let txs = vec![p2p_tx("t1Sender", "t1Sender", "1.0")];
        assert_eq!(extract_p2p_transfers(&txs), vec![]);
    }

    #[test]
    fn extract_p2p_transfers_skips_zero_amount_outputs() {
        let txs = vec![p2p_tx("t1Sender", "t1Receiver", "0.00000000")];
        assert_eq!(extract_p2p_transfers(&txs), vec![]);
    }

    #[test]
    fn is_block_utility_true_with_a_transfer() {
        let transfers = vec![TxTransfer { txid: "t".into(), from: Some("a".into()), to: "b".into(), amount: 1.0 }];
        assert!(is_block_utility(100, &transfers, &HashMap::new()));
    }

    #[test]
    fn is_block_utility_true_with_a_deployment_at_this_height() {
        let heights = count_deployments_by_height(vec![100]);
        assert!(is_block_utility(100, &[], &heights));
    }

    #[test]
    fn is_block_utility_false_when_neither() {
        assert!(!is_block_utility(100, &[], &HashMap::new()));
    }

    #[test]
    fn extract_team_txs_matches_sender_or_recipient() {
        let transfers = vec![
            TxTransfer { txid: "a".into(), from: Some(FLUX_TEAM_ADDRESSES[0].into()), to: "someone".into(), amount: 2.0 },
            TxTransfer { txid: "b".into(), from: Some("someone".into()), to: FLUX_TEAM_ADDRESSES[0].into(), amount: 3.0 },
            TxTransfer { txid: "c".into(), from: Some("x".into()), to: "y".into(), amount: 4.0 },
        ];
        let team_txs = extract_team_txs(200, &transfers);
        assert_eq!(team_txs.len(), 2);
        assert_eq!(team_txs[0].txid, "a");
        assert_eq!(team_txs[0].block_height, 200);
        assert_eq!(team_txs[1].txid, "b");
    }

    #[test]
    fn upsert_daily_count_creates_a_new_entry() {
        let mut daily = vec![];
        upsert_daily_count(&mut daily, "2026-09-06", true);
        assert_eq!(daily, vec![DailyCount { date: "2026-09-06".into(), utility_blocks: 1, empty_blocks: 0 }]);
    }

    #[test]
    fn upsert_daily_count_increments_an_existing_entry() {
        let mut daily = vec![DailyCount { date: "2026-09-06".into(), utility_blocks: 1, empty_blocks: 2 }];
        upsert_daily_count(&mut daily, "2026-09-06", false);
        assert_eq!(daily[0], DailyCount { date: "2026-09-06".into(), utility_blocks: 1, empty_blocks: 3 });
    }

    #[test]
    fn trim_daily_retention_keeps_only_the_most_recent_days() {
        let mut daily: Vec<DailyCount> = (1..=10)
            .map(|d| DailyCount { date: format!("2026-09-{:02}", d), utility_blocks: 0, empty_blocks: 0 })
            .collect();
        trim_daily_retention(&mut daily, 8);
        assert_eq!(daily.len(), 8);
        assert_eq!(daily[0].date, "2026-09-03"); // oldest 2 trimmed
        assert_eq!(daily[7].date, "2026-09-10");
    }

    #[test]
    fn trim_team_txs_drops_anything_below_the_retention_height() {
        let mut txs = vec![
            TeamTx { txid: "old".into(), block_height: 50, from: "a".into(), to: "b".into(), amount: 1.0 },
            TeamTx { txid: "new".into(), block_height: 150, from: "a".into(), to: "b".into(), amount: 1.0 },
        ];
        trim_team_txs(&mut txs, 100);
        assert_eq!(txs.len(), 1);
        assert_eq!(txs[0].txid, "new");
    }

    /*
     * Scan result for a block that is utility because of a P2P transfer.
     * `is_utility` is always `is_p2p || is_dapp` here, exactly as
     * scan_one_block computes it -- a helper that let those drift apart would
     * make every test below meaningless.
     */
    /// A distinct transfer, for cap tests.
    fn transfer(i: i32) -> TxTransfer {
        TxTransfer {
            txid: format!("tx{}", i),
            from: Some(format!("t1from{}", i)),
            to: format!("t1to{}", i),
            amount: 1.0 + i as f64,
        }
    }

    /// A retained utility block with a given transfer and deployment count.
    fn utility_record(height: i64, transfers: u32, deployments: u32) -> UtilityBlockRecord {
        UtilityBlockRecord {
            height,
            date: "2026-09-12".into(),
            is_p2p: transfers > 0,
            is_dapp: deployments > 0,
            transfer_count: transfers,
            deployment_count: deployments,
            transfers: vec![],
            ..Default::default()
        }
    }

    fn scan_result(height: i64, is_p2p: bool, is_dapp: bool, date: &str) -> BlockScanResult {
        BlockScanResult {
            height,
            is_utility: is_p2p || is_dapp,
            is_p2p,
            is_dapp,
            transfer_count: if is_p2p { 2 } else { 0 },
            deployment_count: if is_dapp { 1 } else { 0 },
            transfers: vec![],
            date: date.into(),
            team_txs: vec![],
            ..Default::default()
        }
    }

    #[test]
    fn fold_contiguous_results_applies_every_success_when_theres_no_gap() {
        let mut daily = vec![];
        let mut team_txs = vec![];
        let mut utility_blocks = vec![];
        let results = vec![
            (101, Some(scan_result(101, true, false, "2026-09-06"))),
            (102, Some(scan_result(102, false, false, "2026-09-06"))),
        ];
        let new_checkpoint = fold_contiguous_results(100, results, &mut daily, &mut team_txs, &mut utility_blocks);
        assert_eq!(new_checkpoint, 102);
        assert_eq!(daily, vec![DailyCount { date: "2026-09-06".into(), utility_blocks: 1, empty_blocks: 1 }]);
    }

    #[test]
    fn fold_contiguous_results_stops_at_the_first_gap_and_discards_anything_after_it() {
        // 101 fails, 102 succeeds — 102 must NOT be applied (it would be
        // double-counted once 101 is retried and the scan re-reaches 102).
        let mut daily = vec![];
        let mut team_txs = vec![];
        let mut utility_blocks = vec![];
        let results = vec![
            (101, None),
            (102, Some(scan_result(102, true, false, "2026-09-06"))),
        ];
        let new_checkpoint = fold_contiguous_results(100, results, &mut daily, &mut team_txs, &mut utility_blocks);
        assert_eq!(new_checkpoint, 100); // unchanged — nothing new was safely applied
        assert_eq!(daily, vec![]);
        // And nothing was recorded for the drill-down either: a block past a
        // gap must not appear there any more than it appears in the rollup.
        assert!(utility_blocks.is_empty());
    }

    #[test]
    fn fold_records_only_utility_blocks_with_their_categories() {
        let mut daily = vec![];
        let mut team_txs = vec![];
        let mut utility_blocks = vec![];
        let results = vec![
            (101, Some(scan_result(101, true, false, "2026-09-06"))),   // P2P only
            (102, Some(scan_result(102, false, true, "2026-09-06"))),   // Dapp only
            (103, Some(scan_result(103, true, true, "2026-09-06"))),    // both
            (104, Some(scan_result(104, false, false, "2026-09-06"))),  // empty
        ];
        fold_contiguous_results(100, results, &mut daily, &mut team_txs, &mut utility_blocks);

        // The empty block is aggregate-only: nobody drills into "nothing
        // happened", and recording them would multiply this file for no reader.
        assert_eq!(utility_blocks.len(), 3);
        assert_eq!(utility_blocks.iter().map(|b| b.height).collect::<Vec<_>>(), vec![101, 102, 103]);

        assert!(utility_blocks[0].is_p2p && !utility_blocks[0].is_dapp);
        assert!(!utility_blocks[1].is_p2p && utility_blocks[1].is_dapp);
        assert!(utility_blocks[2].is_p2p && utility_blocks[2].is_dapp);
        assert_eq!(utility_blocks[0].transfer_count, 2);
        assert_eq!(utility_blocks[1].transfer_count, 0);

        // The rollup still agrees: 3 utility, 1 empty.
        assert_eq!(daily, vec![DailyCount { date: "2026-09-06".into(), utility_blocks: 3, empty_blocks: 1 }]);
    }

    #[test]
    fn trim_utility_blocks_drops_everything_below_the_window_edge() {
        let mut blocks = vec![
            UtilityBlockRecord { height: 100, date: "a".into(), is_p2p: true, is_dapp: false, transfer_count: 1, deployment_count: 0, transfers: vec![], ..Default::default() },
            UtilityBlockRecord { height: 200, date: "b".into(), is_p2p: true, is_dapp: false, transfer_count: 1, deployment_count: 0, transfers: vec![], ..Default::default() },
            UtilityBlockRecord { height: 300, date: "c".into(), is_p2p: false, is_dapp: true, transfer_count: 0, deployment_count: 1, transfers: vec![], ..Default::default() },
        ];
        trim_utility_blocks(&mut blocks, 200);
        // Boundary is inclusive, matching trim_team_txs: a block exactly at the
        // edge is still inside the retention window.
        assert_eq!(blocks.iter().map(|b| b.height).collect::<Vec<_>>(), vec![200, 300]);
    }

    #[test]
    fn utility_block_categories_partition_cleanly() {
        // The API reports p2p_only / dapp_only / both, and those must sum to the
        // total -- overlapping "any P2P" / "any Dapp" counts would not add up
        // and would read as a bug on screen.
        let blocks = vec![
            UtilityBlockRecord { height: 1, date: "d".into(), is_p2p: true, is_dapp: false, transfer_count: 3, deployment_count: 0, transfers: vec![], ..Default::default() },
            UtilityBlockRecord { height: 2, date: "d".into(), is_p2p: true, is_dapp: false, transfer_count: 1, deployment_count: 0, transfers: vec![], ..Default::default() },
            UtilityBlockRecord { height: 3, date: "d".into(), is_p2p: false, is_dapp: true, transfer_count: 0, deployment_count: 1, transfers: vec![], ..Default::default() },
            UtilityBlockRecord { height: 4, date: "d".into(), is_p2p: true, is_dapp: true, transfer_count: 2, deployment_count: 1, transfers: vec![], ..Default::default() },
        ];
        let p2p_only = blocks.iter().filter(|b| b.is_p2p && !b.is_dapp).count();
        let dapp_only = blocks.iter().filter(|b| !b.is_p2p && b.is_dapp).count();
        let both = blocks.iter().filter(|b| b.is_p2p && b.is_dapp).count();
        assert_eq!((p2p_only, dapp_only, both), (2, 1, 1));
        assert_eq!(p2p_only + dapp_only + both, blocks.len());
    }

    fn temp_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("chain_activity_test_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir); // clean slate if a previous run left one behind
        dir
    }

    #[test]
    fn write_then_read_json_round_trips() {
        let dir = temp_test_dir("roundtrip");
        let value = DailyCount { date: "2026-09-06".into(), utility_blocks: 3, empty_blocks: 1 };
        write_json_atomic(&dir, "test.json", &value).expect("write should succeed");
        let read_back: DailyCount = read_json_or_default(&dir, "test.json");
        assert_eq!(read_back, value);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_json_or_default_returns_default_when_file_is_missing() {
        let dir = temp_test_dir("missing");
        let read_back: Checkpoint = read_json_or_default(&dir, "does_not_exist.json");
        assert_eq!(read_back, Checkpoint::default());
    }

    #[test]
    fn read_json_or_default_returns_default_on_corrupt_json() {
        let dir = temp_test_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("bad.json"), b"not valid json").unwrap();
        let read_back: Checkpoint = read_json_or_default(&dir, "bad.json");
        assert_eq!(read_back, Checkpoint::default());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_status_default_is_never_run_with_zeroed_timestamps() {
        let status = ScanStatus::default();
        assert_eq!(status.last_outcome, ScanOutcome::NeverRun);
        assert_eq!(status.last_attempt_at, 0);
        assert_eq!(status.last_success_at, 0);
    }

    #[test]
    fn scan_status_round_trips_through_write_and_read() {
        let dir = temp_test_dir("scan_status_roundtrip");
        let status = ScanStatus {
            last_attempt_at: 1000, last_success_at: 900, last_outcome: ScanOutcome::Stalled,
            ..Default::default()
        };
        write_json_atomic(&dir, "status.json", &status).expect("write should succeed");
        let read_back: ScanStatus = read_json_or_default(&dir, "status.json");
        assert_eq!(read_back, status);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_outcome_serializes_as_snake_case_matching_the_frontend_contract() {
        assert_eq!(serde_json::to_string(&ScanOutcome::NeverRun).unwrap(), "\"never_run\"");
        assert_eq!(serde_json::to_string(&ScanOutcome::InProgress).unwrap(), "\"in_progress\"");
        assert_eq!(serde_json::to_string(&ScanOutcome::CaughtUp).unwrap(), "\"caught_up\"");
        assert_eq!(serde_json::to_string(&ScanOutcome::Stalled).unwrap(), "\"stalled\"");
        assert_eq!(serde_json::to_string(&ScanOutcome::Unreachable).unwrap(), "\"unreachable\"");
    }

    #[test]
    fn next_scan_status_caught_up_advances_both_timestamps() {
        let previous = ScanStatus {
            last_attempt_at: 100, last_success_at: 50, last_outcome: ScanOutcome::Stalled,
            ..Default::default()
        };
        let next = next_scan_status(previous, 200, ScanOutcome::CaughtUp);
        assert_eq!(next, ScanStatus {
            last_attempt_at: 200, last_success_at: 200, last_outcome: ScanOutcome::CaughtUp,
            ..Default::default()
        });
    }

    #[test]
    fn next_scan_status_stalled_advances_attempt_but_preserves_last_success() {
        let previous = ScanStatus {
            last_attempt_at: 100, last_success_at: 50, last_outcome: ScanOutcome::CaughtUp,
            ..Default::default()
        };
        let next = next_scan_status(previous, 200, ScanOutcome::Stalled);
        assert_eq!(next, ScanStatus {
            last_attempt_at: 200, last_success_at: 50, last_outcome: ScanOutcome::Stalled,
            ..Default::default()
        });
    }

    #[test]
    fn next_scan_status_unreachable_advances_attempt_but_preserves_last_success() {
        let previous = ScanStatus {
            last_attempt_at: 100, last_success_at: 50, last_outcome: ScanOutcome::CaughtUp,
            ..Default::default()
        };
        let next = next_scan_status(previous, 200, ScanOutcome::Unreachable);
        assert_eq!(next, ScanStatus {
            last_attempt_at: 200, last_success_at: 50, last_outcome: ScanOutcome::Unreachable,
            ..Default::default()
        });
    }

    #[test]
    fn next_scan_status_in_progress_advances_attempt_but_preserves_last_success() {
        // The write run_scan_cycle makes immediately on starting, before any
        // network work — must look exactly like Stalled/Unreachable's
        // preserve-last-success behavior, not like a fresh CaughtUp.
        let previous = ScanStatus {
            last_attempt_at: 100, last_success_at: 50, last_outcome: ScanOutcome::CaughtUp,
            ..Default::default()
        };
        let next = next_scan_status(previous, 200, ScanOutcome::InProgress);
        assert_eq!(next, ScanStatus {
            last_attempt_at: 200, last_success_at: 50, last_outcome: ScanOutcome::InProgress,
            ..Default::default()
        });
    }

    #[test]
    fn next_scan_status_from_never_run_stalled_leaves_last_success_at_zero() {
        // The realistic cold-start-then-immediately-rate-limited case: a
        // replica whose scanner has never once caught up should still show
        // last_success_at: 0 (never), not silently inherit attempt_at.
        let previous = ScanStatus::default();
        let next = next_scan_status(previous, 500, ScanOutcome::Stalled);
        assert_eq!(next, ScanStatus {
            last_attempt_at: 500, last_success_at: 0, last_outcome: ScanOutcome::Stalled,
            ..Default::default()
        });
    }

    #[test]
    fn next_scan_status_always_resets_the_scan_range_even_from_a_previous_in_progress() {
        // A terminal outcome (or a fresh InProgress at the start of a NEW
        // cycle) ends whatever range the LAST in-progress attempt was
        // covering — leaving it on disk would misreport progress against a
        // range that no longer applies.
        let previous = ScanStatus {
            last_attempt_at: 100, last_success_at: 0, last_outcome: ScanOutcome::InProgress,
            scan_start_height: 500, scan_target_height: 1000,
        };
        let next = next_scan_status(previous, 200, ScanOutcome::CaughtUp);
        assert_eq!(next.scan_start_height, 0);
        assert_eq!(next.scan_target_height, 0);
    }

    #[test]
    fn with_scan_range_sets_the_range_and_preserves_everything_else() {
        let status = ScanStatus {
            last_attempt_at: 200, last_success_at: 100, last_outcome: ScanOutcome::InProgress,
            ..Default::default()
        };
        let with_range = with_scan_range(status, 500, 1000);
        assert_eq!(with_range, ScanStatus {
            last_attempt_at: 200, last_success_at: 100, last_outcome: ScanOutcome::InProgress,
            scan_start_height: 500, scan_target_height: 1000,
        });
    }

    // ── #346: deployments carry their detail, not just a count ───────────────

    /*
     * The payload these are built from was ALWAYS being downloaded. AppSpec
     * parsed `height` alone out of 703 KB that already carried name, owner,
     * instances, expire, and the compose components with their repo tags and
     * resources. These cover keeping it.
     */
    fn spec(height: i64, name: &str) -> AppSpec {
        AppSpec {
            height,
            name: Some(name.to_string()),
            owner: Some("1CkN6E5wWTUgMFhB93uNpE9mDUqX5LWbJF".to_string()),
            instances: Some(3),
            expire: Some(22000),
            enterprise: None,
            compose: Some(vec![AppComposeComponent {
                repotag: Some("siomiz/softethervpn:9799-alpine".to_string()),
                cpu: Some(0.1),
                ram: Some(100.0),
                hdd: Some(1.0),
            }]),
        }
    }

    #[test]
    fn keeps_the_spec_detail_that_was_being_discarded() {
        let map = deployments_by_height(vec![spec(100, "softethervpn")]);
        let d = &map.get(&100).unwrap()[0];

        assert_eq!(d.name, "softethervpn");
        assert_eq!(d.owner, "1CkN6E5wWTUgMFhB93uNpE9mDUqX5LWbJF");
        assert_eq!(d.instances, 3);
        assert_eq!(d.repotag, "siomiz/softethervpn:9799-alpine");
        assert_eq!(d.expire, 22000);
        assert!(d.resources_known);
        assert!(!d.enterprise);
    }

    /*
     * Resources are summed across compose components, because that is what the
     * app consumes per instance. Reporting only the first component would
     * understate every multi-container app.
     */
    #[test]
    fn sums_resources_across_compose_components() {
        let mut s = spec(100, "multi");
        s.compose = Some(vec![
            AppComposeComponent { repotag: Some("a:1".into()), cpu: Some(0.5), ram: Some(512.0), hdd: Some(5.0) },
            AppComposeComponent { repotag: Some("b:2".into()), cpu: Some(1.5), ram: Some(1024.0), hdd: Some(10.0) },
        ]);

        let map = deployments_by_height(vec![s]);
        let d = &map.get(&100).unwrap()[0];

        assert_eq!(d.cpu, 2.0);
        assert_eq!(d.ram, 1536.0);
        assert_eq!(d.hdd, 15.0);
        // The repo tags of every component, so a reader can see what actually runs.
        assert_eq!(d.repotag, "a:1, b:2");
    }

    /*
     * 390 of 1,462 live specs (26.7%) are enterprise: resources encrypted,
     * compose empty. Reporting 0 cpu / 0 ram would be a confident wrong number
     * -- no app uses nothing -- so resources_known says we cannot tell, and the
     * UI shows a marker instead of zeros.
     */
    #[test]
    fn marks_an_enterprise_app_as_unknown_rather_than_zero() {
        let mut s = spec(100, "valheim1789258602926");
        s.enterprise = Some("E4WrpsmVzCIzEjOf/90m71ft90laLMxcKig9OYbCPkuSSXz2".into());
        s.compose = Some(vec![]);

        let map = deployments_by_height(vec![s]);
        let d = &map.get(&100).unwrap()[0];

        assert!(d.enterprise);
        assert!(!d.resources_known);
        assert_eq!(d.cpu, 0.0);
        // Everything readable is still reported.
        assert_eq!(d.name, "valheim1789258602926");
        assert_eq!(d.instances, 3);
    }

    #[test]
    fn groups_several_deployments_at_the_same_height() {
        let map = deployments_by_height(vec![spec(100, "a"), spec(100, "b"), spec(250, "c")]);

        assert_eq!(map.get(&100).unwrap().len(), 2);
        assert_eq!(map.get(&250).unwrap().len(), 1);
    }

    /*
     * Same reason MAX_STORED_TRANSFERS exists: one pathological block must not
     * be able to grow the retained file without bound. deployment_count stays
     * the true number.
     */
    #[test]
    fn caps_the_stored_deployments_per_block() {
        let specs: Vec<AppSpec> = (0..(MAX_STORED_DEPLOYMENTS + 30))
            .map(|i| spec(100, &format!("app{}", i)))
            .collect();

        let map = deployments_by_height(specs);

        assert_eq!(map.get(&100).unwrap().len(), MAX_STORED_DEPLOYMENTS);
    }

    #[test]
    fn survives_a_spec_missing_everything_optional() {
        let bare = AppSpec { height: 100, name: None, owner: None, instances: None, expire: None, enterprise: None, compose: None };

        let map = deployments_by_height(vec![bare]);
        let d = &map.get(&100).unwrap()[0];

        assert_eq!(d.instances, 0);
        assert!(!d.resources_known);
    }

    /*
     * The count and the list answer different questions, so they must not be
     * derived from each other. A block with more deployments than the cap
     * reports the true count and a truncated list.
     */
    #[test]
    fn the_count_is_not_capped_even_though_the_list_is() {
        let n = MAX_STORED_DEPLOYMENTS + 30;
        let heights: Vec<i64> = (0..n).map(|_| 100i64).collect();

        assert_eq!(count_deployments_by_height(heights).get(&100), Some(&(n as u32)));
    }

    // ── #346/#347: new record fields must not break records already on disk ──

    /*
     * THE FAILURE MODE THIS GUARDS IS SILENT AND EXPENSIVE. Every running
     * deployment has utility-block records on disk written before these fields
     * existed. Without serde(default), a missing field fails the WHOLE read,
     * which discards the retained window and triggers a ~23,040-block rescan
     * against an explorer that rate-limits aggressively. Nothing errors; the
     * screen just empties and stays empty for a long time.
     *
     * This is the third time the same hazard has been hit in this file
     * (deployment_count, transfers), which is why it gets a test rather than
     * only a comment.
     */
    #[test]
    fn reads_a_record_written_before_deployments_and_hash_existed() {
        let old = r#"{
            "height": 2923431, "date": "2026-09-05", "is_p2p": true, "is_dapp": false,
            "transfer_count": 1, "deployment_count": 0, "transfers": []
        }"#;

        let rec: UtilityBlockRecord = serde_json::from_str(old).expect("must still parse");

        assert_eq!(rec.height, 2923431);
        assert!(rec.deployments.is_empty());
        assert_eq!(rec.hash, None);
    }

    #[test]
    fn reads_a_record_written_before_any_of_the_optional_fields_existed() {
        // Older still: before deployment_count and transfers, too.
        let ancient = r#"{"height": 1, "date": "2026-09-01", "is_p2p": false, "is_dapp": false, "transfer_count": 0}"#;

        let rec: UtilityBlockRecord = serde_json::from_str(ancient).expect("must still parse");

        assert_eq!(rec.deployment_count, 0);
        assert!(rec.transfers.is_empty());
        assert!(rec.deployments.is_empty());
    }

    // ── #346: the app deployment fee, observed rather than assumed ───────────

    fn payment(amount: &str, to: &str) -> RawTx {
        RawTx {
            txid: "pay".into(),
            is_coin_base: false,
            vin: vec![RawVin { addr: Some("t1Payer".into()) }],
            vout: vec![RawVout {
                value: amount.to_string(),
                script_pub_key: Some(RawScriptPubKey { addresses: Some(vec![to.to_string()]) }),
            }],
            time: Some(1_700_000_000),
        }
    }

    /*
     * Measured on the live chain: 300 consecutive payments to
     * APP_PAYMENT_ADDRESS, every one exactly 9.0 FLUX, across apps from 2 to
     * 100 instances. It is a flat message fee, not a resource-scaled cost.
     *
     * THE RATE IS DERIVED, NEVER HARDCODED. A literal 9.0 in the source becomes
     * quietly wrong on every row the day Flux changes the fee, and nothing
     * would fail -- the screen would simply lie. Reading it back off the chain
     * each cycle means the number follows reality.
     */
    #[test]
    fn derives_the_fee_from_observed_payments() {
        let txs: Vec<RawTx> = (0..8).map(|_| payment("9.00000000", APP_PAYMENT_ADDRESS)).collect();

        let rate = derive_app_fee_rate(&txs).expect("a rate");

        assert_eq!(rate.flux, 9.0);
        assert_eq!(rate.samples, 8);
        assert!(rate.uniform);
    }

    #[test]
    fn follows_the_chain_when_the_fee_changes() {
        // The whole point of deriving it. A different rate must come through
        // without a code change.
        let txs: Vec<RawTx> = (0..5).map(|_| payment("12.50000000", APP_PAYMENT_ADDRESS)).collect();

        assert_eq!(derive_app_fee_rate(&txs).unwrap().flux, 12.5);
    }

    /*
     * If payments ever stop being uniform, the flat-rate premise is wrong and
     * "this deployment cost X" stops being true. The UI needs to know that
     * rather than average over it and present a confident wrong figure.
     */
    #[test]
    fn reports_that_payments_disagree_rather_than_averaging_them() {
        let txs = vec![
            payment("9.00000000", APP_PAYMENT_ADDRESS),
            payment("9.00000000", APP_PAYMENT_ADDRESS),
            payment("40.00000000", APP_PAYMENT_ADDRESS),
        ];

        let rate = derive_app_fee_rate(&txs).expect("a rate");

        assert!(!rate.uniform);
        // The most common value still wins, so the figure stays the best
        // available answer -- it is simply flagged as not universal.
        assert_eq!(rate.flux, 9.0);
    }

    #[test]
    fn ignores_outputs_paying_anybody_else() {
        // The payer's own change leg shares the transaction and is not a fee.
        let mut tx = payment("9.00000000", APP_PAYMENT_ADDRESS);
        tx.vout.push(RawVout {
            value: "250.00000000".into(),
            script_pub_key: Some(RawScriptPubKey { addresses: Some(vec!["t1Payer".into()]) }),
        });

        assert_eq!(derive_app_fee_rate(&[tx]).unwrap().flux, 9.0);
    }

    #[test]
    fn returns_none_when_there_are_no_payments_to_read() {
        assert!(derive_app_fee_rate(&[]).is_none());
        assert!(derive_app_fee_rate(&[payment("5.0", "t1SomebodyElse")]).is_none());
    }

    #[test]
    fn ignores_a_coinbase() {
        let mut cb = payment("9.00000000", APP_PAYMENT_ADDRESS);
        cb.is_coin_base = true;

        assert!(derive_app_fee_rate(&[cb]).is_none());
    }
}
