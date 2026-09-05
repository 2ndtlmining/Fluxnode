use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use reqwest::{Client, ClientBuilder};
use std::time::Duration;

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
// Matches live_winners.rs's MAX_CANDIDATES_TRIED — same concurrent-fan-out
// pattern, same starting concurrency, tune later only if the explorer API
// visibly tolerates more.
pub const SCAN_CONCURRENCY: usize = 8;

pub const DATA_DIR: &str = "data";
pub const DAILY_ROLLUP_FILE: &str = "chain_activity_daily.json";
pub const TEAM_TX_FILE: &str = "chain_activity_team_tx.json";
pub const CHECKPOINT_FILE: &str = "chain_activity_checkpoint.json";

const EXPLORER_BASE: &str = "https://explorer.runonflux.io/api";
const APP_SPECS_URL: &str = "https://api.runonflux.io/apps/globalappsspecifications";
const HTTP_TIMEOUT_SECS: u64 = 15;

fn create_client() -> Client {
    ClientBuilder::new()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .expect("chain_activity::create_client() => Failed to configure client")
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

#[derive(Debug, Deserialize)]
struct AppSpec {
    height: i64,
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

#[derive(Debug, Clone, PartialEq)]
pub struct TxTransfer {
    pub txid: String,
    pub from: Option<String>,
    pub to: String,
    pub amount: f64,
}

#[derive(Debug, Clone)]
pub struct BlockScanResult {
    pub height: i64,
    pub is_utility: bool,
    pub date: String,
    pub team_txs: Vec<TeamTx>,
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
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct DailyRollupFile {
    daily: Vec<DailyCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct TeamTxFile {
    team_txs: Vec<TeamTx>,
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

pub fn is_block_utility(height: i64, transfers: &[TxTransfer], deployment_heights: &HashSet<i64>) -> bool {
    !transfers.is_empty() || deployment_heights.contains(&height)
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
) -> i64 {
    results.sort_by_key(|(h, _)| *h);
    let mut checkpoint = start_height;
    for (height, result) in results {
        match result {
            Some(r) if height == checkpoint + 1 => {
                upsert_daily_count(daily, &r.date, r.is_utility);
                team_txs.extend(r.team_txs);
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

pub fn save_checkpoint(last_scanned_height: i64) -> std::io::Result<()> {
    write_json_atomic(Path::new(DATA_DIR), CHECKPOINT_FILE, &Checkpoint { last_scanned_height })
}

pub async fn fetch_tip_height(client: &Client) -> Option<i64> {
    let url = format!("{}/blocks?limit=1", EXPLORER_BASE);
    let res = client.get(&url).send().await.ok()?;
    let parsed: RecentBlocksResponse = res.json().await.ok()?;
    parsed.blocks.get(0).map(|b| b.height)
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
pub async fn fetch_deployment_heights(client: &Client) -> HashSet<i64> {
    let res = match client.get(APP_SPECS_URL).send().await {
        Ok(r) => r,
        Err(_) => return HashSet::new(),
    };
    let parsed: AppSpecsResponse = match res.json().await {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };
    if parsed.status == "error" {
        return HashSet::new();
    }
    parsed.data.unwrap_or_default().into_iter().map(|s| s.height).collect()
}

async fn resolve_block_hash(client: &Client, height: i64) -> Option<String> {
    let url = format!("{}/block-index/{}", EXPLORER_BASE, height);
    let res = client.get(&url).send().await.ok()?;
    let parsed: BlockIndexResponse = res.json().await.ok()?;
    Some(parsed.block_hash)
}

/*
 * Fetches every page of a block's txs — not just page 0. Verified against the
 * live API (see this plan's Global Constraints): node-confirmation txs can
 * fill page 0 entirely, and pagination order isn't guaranteed to put a
 * genuine P2P transfer ahead of them, so a "this block has zero P2P
 * transfers" classification requires seeing every page. A failure partway
 * through returns whatever was gathered so far rather than erroring the
 * whole block — scan_one_block below still produces a result from partial
 * data rather than losing the block entirely to one bad page fetch.
 */
async fn fetch_all_block_txs(client: &Client, block_hash: &str) -> Vec<RawTx> {
    let mut all_txs = Vec::new();
    let mut page_num = 0i64;
    let mut pages_total = 1i64;

    while page_num < pages_total {
        let url = format!("{}/txs/?block={}&pageNum={}", EXPLORER_BASE, block_hash, page_num);
        match client.get(&url).send().await {
            Ok(res) => match res.json::<TxsPageResponse>().await {
                Ok(page) => {
                    pages_total = page.pages_total.max(1);
                    all_txs.extend(page.txs);
                }
                Err(_) => break,
            },
            Err(_) => break,
        }
        page_num += 1;
    }

    all_txs
}

pub async fn scan_one_block(client: &Client, height: i64, deployment_heights: &HashSet<i64>) -> Option<BlockScanResult> {
    let hash = resolve_block_hash(client, height).await?;
    let txs = fetch_all_block_txs(client, &hash).await;
    let transfers = extract_p2p_transfers(&txs);
    let is_utility = is_block_utility(height, &transfers, deployment_heights);
    let team_txs = extract_team_txs(height, &transfers);
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
    Some(BlockScanResult { height, is_utility, date, team_txs })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(is_block_utility(100, &transfers, &HashSet::new()));
    }

    #[test]
    fn is_block_utility_true_with_a_deployment_at_this_height() {
        let mut heights = HashSet::new();
        heights.insert(100);
        assert!(is_block_utility(100, &[], &heights));
    }

    #[test]
    fn is_block_utility_false_when_neither() {
        assert!(!is_block_utility(100, &[], &HashSet::new()));
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

    #[test]
    fn fold_contiguous_results_applies_every_success_when_theres_no_gap() {
        let mut daily = vec![];
        let mut team_txs = vec![];
        let results = vec![
            (101, Some(BlockScanResult { height: 101, is_utility: true, date: "2026-09-06".into(), team_txs: vec![] })),
            (102, Some(BlockScanResult { height: 102, is_utility: false, date: "2026-09-06".into(), team_txs: vec![] })),
        ];
        let new_checkpoint = fold_contiguous_results(100, results, &mut daily, &mut team_txs);
        assert_eq!(new_checkpoint, 102);
        assert_eq!(daily, vec![DailyCount { date: "2026-09-06".into(), utility_blocks: 1, empty_blocks: 1 }]);
    }

    #[test]
    fn fold_contiguous_results_stops_at_the_first_gap_and_discards_anything_after_it() {
        // 101 fails, 102 succeeds — 102 must NOT be applied (it would be
        // double-counted once 101 is retried and the scan re-reaches 102).
        let mut daily = vec![];
        let mut team_txs = vec![];
        let results = vec![
            (101, None),
            (102, Some(BlockScanResult { height: 102, is_utility: true, date: "2026-09-06".into(), team_txs: vec![] })),
        ];
        let new_checkpoint = fold_contiguous_results(100, results, &mut daily, &mut team_txs);
        assert_eq!(new_checkpoint, 100); // unchanged — nothing new was safely applied
        assert_eq!(daily, vec![]);
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
}
