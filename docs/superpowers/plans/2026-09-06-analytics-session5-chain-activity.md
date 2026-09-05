# Analytics Page — Session 5 (Chain Activity Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/analytics` page's fourth tab — **Chain Activity** — showing a
trailing utility-vs-empty block ratio and a Flux-team transaction log, both backed by
a new backend batch scan (the first persisted, periodically-scanned state this Rust
API has ever had).

**Architecture:** A new `api/src/services/chain_activity.rs` scans blocks the explorer
API exposes, classifying each as "utility" (has a P2P transfer or an app deployment) or
"empty," and separately flags any transaction touching a known Flux-team address. This
runs on an hourly background interval (new for this codebase — every existing service
is request-driven) and persists a rolling ~8-day daily rollup plus a team-tx log to flat
JSON files under `api/data/` — chosen over SQLite because neither survives this API's
actual deployment reality (multiple Flux-hosted replicas, any of which can be
rescheduled to a fresh node, wiping local disk) so the simpler format costs nothing in
durability. Each replica scans and persists independently (no shared writer). The
frontend adds one more `<Tab>` to the existing `Analytics.jsx` shell, following the
Apps/Network/Donor tabs' established pattern.

**Tech Stack:** Rust (axum, tokio, reqwest, serde — all already dependencies, no new
crate). React 18 (hooks), same Jest test runner as the rest of the client. No new npm
dependency, no new Cargo dependency.

**Spec:** `docs/superpowers/specs/2026-09-06-chain-activity-design.md` (also summarized
in `PREMIUM_FEATURES_PLAN.md` Part D).

## Global Constraints

- **No new Cargo or npm dependency.** Date math needed for the daily rollup is
  hand-rolled (Task 1) rather than pulling in `chrono` — a single pure conversion
  function doesn't justify a new dependency this codebase has never needed before.
- **This machine has no local Rust toolchain.** Verify every Rust task via Docker
  instead of `cargo` directly — from `api/`:
  `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build`
  (swap `cargo build` for `cargo test` as needed). The `-v fluxnode-cargo-registry:...`
  named volume caches downloaded crates across runs — the first run in a fresh
  environment is slow (pulls the `rust:1.67.1` image + compiles every dependency from
  scratch), later runs are fast. `rust:1.67.1` matches the project's own `Dockerfile`
  exactly — this is not a stand-in version.
- Rust services in this codebase are one file each (`live_winners.rs`, `demo.rs`,
  `bench_version.rs`) with **no existing test coverage anywhere on the Rust side** —
  Chain Activity is the first Rust code in this repo to get `cargo test` coverage.
  Only genuinely pure logic gets unit tests (Task 1); network-calling functions
  (Task 2) and orchestration (Task 3) are verified by `cargo build` + manual smoke
  test, matching how every existing Rust service in this codebase is already verified
  (this is not a shortcut introduced by this plan — it's the established convention).
- New code follows this codebase's existing conventions: `camelCase` filenames for JS
  pure modules, `PascalCase` directories for components with an `index.jsx` +
  co-located `index.scss`, tests co-located as `*.test.js`; Rust uses `snake_case`
  throughout, one service = one file, matching `live_winners.rs`'s shape (constants,
  then data structs, then pure/helper functions, then the public entry points).
- **Backend JSON is snake_case on the wire** (Rust's serde default, no rename
  attributes) — the frontend fetch module normalizes to camelCase at the boundary
  (Task 5), not throughout the codebase.
- **Shared panel chrome (`.hov-panel`, `.hov-header`, `.hov-ranked-list`, etc.) is
  duplicated per component, not imported cross-file** — established convention (see
  `NetworkTab/index.scss`'s own header comment for the same reasoning).
  `ChainActivityTab/index.scss` gets its own copy of whatever subset it renders.
- Verified against the live explorer API 2026-09-06 (see spec): `GET
  /api/block-index/<height>` resolves a height to `{"blockHash": ...}`; `GET
  /api/txs/?block=<hash>&pageNum=<0-indexed>` is paginated (page size 10, `pagesTotal`
  in every response) and **does** include node-confirmation txs (`type: "Confirming a
  fluxnode"`, no `vin`/`vout`) despite the older JS comment claiming otherwise — a
  block's "no P2P transfer" classification requires fetching every page, not just
  page 0. `vout[].value` is a JSON **string**, not a number.
- **Rust baseline, confirmed 2026-09-06 in this worktree**: `cargo build` on the
  unmodified `api/` exits 0 with exactly **one** pre-existing warning — `unused
  import: axum::extract::Path` at `main.rs:90` (inside the `node_demo` module).
  This is not something this plan introduces or should fix (out of scope,
  pre-existing) — if a Rust build step ever shows anything beyond this single
  warning, that's a real regression to stop and investigate, the same way the
  client build's "exactly 4 warning files" baseline works.
- After every task: `cd client && CI=true npx react-scripts test --watchAll=false`
  (baseline confirmed **282 tests, 16 suites, all passing**, 2026-09-06, this
  worktree, after `npm install` — a fresh worktree has no `node_modules`, run
  `npm install` once before the first test run) and `cd client && npx react-scripts
  build` (exit 0, exactly the 4 pre-existing baseline warning files — `Navbar/index.jsx`,
  `NodeGridTable/index.jsx`, `LayoutContext.jsx`, `WalletNodes/index.jsx` — nothing
  else). Rust tasks additionally run the Docker `cargo build`/`cargo test` commands
  above.
- This plan is scoped to the Chain Activity tab only. FLUX-to-exchange tracking is
  explicitly out of scope (no data source exists — see spec).

---

## Task 1: `chain_activity.rs` — data model, pure classification, and persistence I/O

**Files:**
- Create: `api/src/services/chain_activity.rs`
- Modify: `api/src/services.rs` (add `pub mod chain_activity;`)

**Interfaces:**
- Produces (consumed by Task 2 and Task 3): `RawTx`, `RawVin`, `RawVout`,
  `RawScriptPubKey` (deserialization shapes for the explorer API), `TxTransfer`,
  `BlockScanResult { height: i64, is_utility: bool, date: String, team_txs:
  Vec<TeamTx> }`, `DailyCount { date: String, utility_blocks: u32, empty_blocks: u32
  }`, `TeamTx { txid: String, block_height: i64, from: String, to: String, amount:
  f64 }`, `Checkpoint { last_scanned_height: i64 }`, constants `FLUX_TEAM_ADDRESSES:
  &[&str]`, `BLOCKS_PER_DAY: i64 = 2880`, `RETENTION_DAYS: i64 = 8`,
  `RETENTION_BLOCKS: i64 = 23_040`, `SCAN_CONCURRENCY: usize = 8`, `DATA_DIR: &str =
  "data"`, `DAILY_ROLLUP_FILE`, `TEAM_TX_FILE`, `CHECKPOINT_FILE`. Functions:
  `extract_p2p_transfers(&[RawTx]) -> Vec<TxTransfer>`, `is_block_utility(i64,
  &[TxTransfer], &HashSet<i64>) -> bool`, `extract_team_txs(i64, &[TxTransfer]) ->
  Vec<TeamTx>`, `unix_to_utc_date(i64) -> String`, `upsert_daily_count(&mut
  Vec<DailyCount>, &str, bool)`, `trim_daily_retention(&mut Vec<DailyCount>, usize)`,
  `trim_team_txs(&mut Vec<TeamTx>, i64)`, `fold_contiguous_results(i64, Vec<(i64,
  Option<BlockScanResult>)>, &mut Vec<DailyCount>, &mut Vec<TeamTx>) -> i64`,
  `write_json_atomic<T: Serialize>(&Path, &str, &T) -> std::io::Result<()>`,
  `read_json_or_default<T: Deserialize + Default>(&Path, &str) -> T`,
  `load_daily_rollup() -> Vec<DailyCount>`, `load_team_txs() -> Vec<TeamTx>`,
  `load_checkpoint() -> Checkpoint`, `save_daily_rollup(&[DailyCount]) ->
  std::io::Result<()>`, `save_team_txs(&[TeamTx]) -> std::io::Result<()>`,
  `save_checkpoint(i64) -> std::io::Result<()>`.

This task is entirely self-contained and network-free — every function here is a pure
transformation or local file I/O, so it's the only task with real `cargo test`
coverage. Read `api/src/services/live_winners.rs` in full first (already read during
planning — ~200 lines) to match its file shape: constants at the top, then data
structs with `#[derive(Debug, Serialize, Deserialize, Clone)]` as appropriate, then
functions, doc comments explaining *why* not just *what* (that file's own style).

- [ ] **Step 1: Create the file with constants and data structs**

`api/src/services/chain_activity.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
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
```

- [ ] **Step 2: Run the (currently empty) test suite to confirm the module compiles**

From `api/`:
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build
```
Expected: fails with "chain_activity" not declared as a module (Step 3 fixes this) — or
succeeds silently if the file has zero syntax errors but isn't wired up yet. Either way,
no *compile* errors in the file itself.

- [ ] **Step 3: Wire the module into `services.rs`**

`api/src/services.rs` — add one line:
```rust
pub mod bench_version;
pub mod chain_activity;
pub mod demo;
pub mod live_winners;
```

- [ ] **Step 4: Write the failing tests for `unix_to_utc_date`**

Append to `chain_activity.rs`:
```rust
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
}
```

- [ ] **Step 5: Run to verify it fails**

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo test --lib chain_activity
```
Expected: FAIL — `unix_to_utc_date` not found.

- [ ] **Step 6: Implement `unix_to_utc_date`**

Add above the `#[cfg(test)]` block:
```rust
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
```

- [ ] **Step 7: Run to verify it passes**

Same command as Step 5. Expected: PASS, 4 tests.

- [ ] **Step 8: Write the failing tests for `extract_p2p_transfers`**

Add inside the `tests` module:
```rust
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
```

- [ ] **Step 9: Run to verify it fails**

Same command as Step 5. Expected: FAIL — `extract_p2p_transfers` not found.

- [ ] **Step 10: Implement `extract_p2p_transfers`**

```rust
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
```

- [ ] **Step 11: Run to verify it passes**

Same command as Step 5. Expected: PASS, 8 tests.

- [ ] **Step 12: Write the failing tests for `is_block_utility` and `extract_team_txs`**

```rust
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
```

- [ ] **Step 13: Run to verify it fails, then implement**

```rust
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
```

Run the test command again. Expected: PASS, 12 tests.

- [ ] **Step 14: Write the failing tests for the rollup update/trim/fold functions**

```rust
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
```

- [ ] **Step 15: Run to verify it fails, then implement**

```rust
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
```

Run the test command again. Expected: PASS, 18 tests.

- [ ] **Step 16: Write the failing tests for the persistence I/O functions**

```rust
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
```

`Checkpoint` needs `PartialEq` for these assertions — update its derive:
```rust
#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct Checkpoint {
    pub last_scanned_height: i64,
}
```

- [ ] **Step 17: Run to verify it fails, then implement**

```rust
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
```

- [ ] **Step 18: Run full test suite for the module**

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo test --lib chain_activity
```
Expected: PASS, 21 tests total.

- [ ] **Step 19: Add `data/` to `.gitignore`**

`api/.gitignore` already exists (ignores `/debug/`, `/target/`, `**/*.rs.bk`, `*.pdb`)
— add one more line:
```
/data/
```
This is where the persisted JSON files land at runtime; they must never be committed.

- [ ] **Step 20: Commit**

```bash
git add api/src/services/chain_activity.rs api/src/services.rs api/.gitignore
git commit -m "feat(chain-activity): data model, pure classification, and persistence I/O"
```

---

## Task 2: Explorer + app-specs network fetchers

**Files:**
- Modify: `api/src/services/chain_activity.rs`

**Interfaces:**
- Consumes: everything from Task 1 (`RawTx`, `TxTransfer`, `BlockScanResult`, `TeamTx`,
  `extract_p2p_transfers`, `is_block_utility`, `extract_team_txs`, `unix_to_utc_date`).
- Produces (consumed by Task 3): `create_client() -> reqwest::Client`,
  `async fn fetch_tip_height(&Client) -> Option<i64>`,
  `async fn fetch_deployment_heights(&Client) -> HashSet<i64>`,
  `async fn scan_one_block(&Client, i64, &HashSet<i64>) -> Option<BlockScanResult>`.

No automated tests in this task — these are network-calling functions, and this
codebase has no HTTP-mocking infrastructure on the Rust side (`live_winners.rs` has
none either). Verified by `cargo build` + a manual smoke test against the real API
(Step 6below) instead, matching how every existing Rust service here is verified.

- [ ] **Step 1: Add the explorer/app-specs response shapes and client constructor**

Append to `chain_activity.rs` (above the `#[cfg(test)]` block):
```rust
use reqwest::{Client, ClientBuilder};
use std::time::Duration;

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
```

- [ ] **Step 2: Add `fetch_tip_height`**

```rust
pub async fn fetch_tip_height(client: &Client) -> Option<i64> {
    let url = format!("{}/blocks?limit=1", EXPLORER_BASE);
    let res = client.get(&url).send().await.ok()?;
    let parsed: RecentBlocksResponse = res.json().await.ok()?;
    parsed.blocks.get(0).map(|b| b.height)
}
```

- [ ] **Step 3: Add `fetch_deployment_heights`**

```rust
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
```

- [ ] **Step 4: Add `resolve_block_hash` and `fetch_all_block_txs`**

```rust
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
```

- [ ] **Step 5: Add `scan_one_block`, combining Task 1's pure functions with the fetchers above**

```rust
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
```

- [ ] **Step 6: Manual smoke test**

From `api/`:
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build
```
Expected: exit 0, no warnings about unused functions yet (they're `pub`, used from
outside the module once Task 3 wires them in — if `cargo build` warns "function is
never used" at this point, that's expected and resolves itself once Task 3 calls them;
don't treat it as a bug to fix here).

- [ ] **Step 7: Commit**

```bash
git add api/src/services/chain_activity.rs
git commit -m "feat(chain-activity): explorer and app-specs network fetchers"
```

---

## Task 3: Scan orchestration — `scan_range` and `run_scan_cycle`

**Files:**
- Modify: `api/src/services/chain_activity.rs`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces (consumed by Task 4): `pub async fn run_scan_cycle()`.

- [ ] **Step 1: Add `scan_range`**

```rust
use futures::stream::{self, StreamExt};

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
    deployment_heights: &HashSet<i64>,
    daily: &mut Vec<DailyCount>,
    team_txs: &mut Vec<TeamTx>,
) -> i64 {
    if start_height >= tip_height {
        return start_height;
    }

    let heights: Vec<i64> = (start_height + 1..=tip_height).collect();
    let mut fetches = stream::iter(heights.into_iter().map(|h| async move {
        (h, scan_one_block(client, h, deployment_heights).await)
    }))
    .buffer_unordered(SCAN_CONCURRENCY);

    let mut results = Vec::new();
    while let Some(pair) = fetches.next().await {
        results.push(pair);
    }

    fold_contiguous_results(start_height, results, daily, team_txs)
}
```

- [ ] **Step 2: Add `run_scan_cycle`**

```rust
/*
 * The single entry point called both by the hourly scheduler (Task 4) and by
 * a cold-start replica catching up — same code path either way, just a
 * different `start_height` depending on how far behind the checkpoint is.
 */
pub async fn run_scan_cycle() {
    let client = create_client();

    let tip_height = match fetch_tip_height(&client).await {
        Some(h) => h,
        None => return, // explorer unreachable this cycle — try again next interval
    };

    let checkpoint = load_checkpoint();
    let earliest_allowed = tip_height - RETENTION_BLOCKS;
    // Bounded catch-up: never scan further back than the retention window,
    // whether this is a genuine cold start (checkpoint 0) or a replica that's
    // been down long enough to fall behind the window entirely.
    let start_height = checkpoint.last_scanned_height.max(earliest_allowed);

    if start_height >= tip_height {
        return; // already caught up to the tip
    }

    let deployment_heights = fetch_deployment_heights(&client).await;
    let mut daily = load_daily_rollup();
    let mut team_txs = load_team_txs();

    let new_checkpoint = scan_range(&client, start_height, tip_height, &deployment_heights, &mut daily, &mut team_txs).await;

    trim_daily_retention(&mut daily, RETENTION_DAYS as usize);
    trim_team_txs(&mut team_txs, tip_height - RETENTION_BLOCKS);

    let _ = save_daily_rollup(&daily);
    let _ = save_team_txs(&team_txs);
    let _ = save_checkpoint(new_checkpoint);

    println!(
        "[chain_activity] scanned {}..{} (checkpoint now {})",
        start_height + 1,
        tip_height,
        new_checkpoint
    );
}
```

- [ ] **Step 3: Manual smoke test**

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add api/src/services/chain_activity.rs
git commit -m "feat(chain-activity): scan_range and run_scan_cycle orchestration"
```

---

## Task 4: Scheduler + API route

**Files:**
- Modify: `api/src/main.rs`

**Interfaces:**
- Consumes: `services::chain_activity::run_scan_cycle()`, `load_daily_rollup()`,
  `load_team_txs()`, `load_checkpoint()`, `DailyCount`, `TeamTx` (all `Serialize`
  already, from Task 1).
- Produces: `GET /api/v1/chain-activity`.

- [ ] **Step 1: Spawn the hourly background scanner in `main()`**

In `api/src/main.rs`, inside `async fn main()`, after the `let app = ...` router
construction and before `Server::bind(...)`:

```rust
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
```

- [ ] **Step 2: Add the route**

In `api_v1::make_router()`:
```rust
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
    }
```

- [ ] **Step 3: Add the handler module**

Inside `pub mod api_v1 { ... }`, alongside the other `pub mod` handler blocks:
```rust
    pub mod chain_activity {
        use super::*;

        #[derive(Debug, Serialize)]
        pub struct ChainActivityResultBody {
            success: bool,
            daily: Vec<services::chain_activity::DailyCount>,
            team_txs: Vec<services::chain_activity::TeamTx>,
            last_scanned_height: i64,
        }

        // Synchronous read of whatever the background scanner has already
        // persisted — never triggers a scan on the request path.
        pub async fn handler() -> impl IntoResponse {
            let body = ChainActivityResultBody {
                success: true,
                daily: services::chain_activity::load_daily_rollup(),
                team_txs: services::chain_activity::load_team_txs(),
                last_scanned_height: services::chain_activity::load_checkpoint().last_scanned_height,
            };
            (StatusCode::OK, Json(body))
        }
    }
```

- [ ] **Step 4: Build**

```bash
cd api && MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build
```
Expected: exit 0. This also resolves any "never used" warnings from Task 2's Step 6 —
`fetch_tip_height`, `fetch_deployment_heights`, `scan_one_block`, `load_*`, `save_*` are
all reachable now.

- [ ] **Step 5: Manual run + curl smoke test**

```bash
cd api && MSYS_NO_PATHCONV=1 docker run --rm -p 5049:5049 -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo run
```
In a second terminal, once "Listening on http://0.0.0.0:5049" prints:
```bash
curl http://localhost:5049/api/v1/chain-activity
```
Expected: `{"success":true,"daily":[],"team_txs":[],"last_scanned_height":0}` —
empty immediately after boot is correct, the background scan cycle takes real time
(potentially tens of minutes for a full cold backfill per the spec's cost estimate).
Watch the container's stdout for the `[chain_activity] scanned ...` log line to confirm
the background loop is actually running; stop the container (Ctrl+C) once confirmed —
this step is a smoke test, not a full backfill wait.

- [ ] **Step 6: Commit**

```bash
git add api/src/main.rs
git commit -m "feat(chain-activity): hourly scheduler + GET /api/v1/chain-activity"
```

---

## Task 5: `analytics/chainActivity.js` — frontend fetch module

**Files:**
- Create: `client/src/analytics/chainActivity.js`
- Test: `client/src/analytics/chainActivity.test.js`

**Interfaces:**
- Consumes: `FLUXNODE_INFO_API_URL` from `app-buildinfo` (existing).
- Produces (consumed by Task 6): `fetch_chain_activity() -> Promise<{ daily:
  Array<{date, utilityBlocks, emptyBlocks}>, teamTxs: Array<{txid, blockHeight, from,
  to, amount}>, lastScannedHeight: number }>`, `filterDailyRange(daily, days) ->
  Array`, `summarizeDaily(daily) -> { utilityBlocks, emptyBlocks }`.

- [ ] **Step 1: Write the failing tests**

`client/src/analytics/chainActivity.test.js`:
```js
import { fetch_chain_activity, filterDailyRange, summarizeDaily } from './chainActivity';

function mockJsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('fetch_chain_activity', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes the backend snake_case payload to camelCase', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [{ date: '2026-09-06', utility_blocks: 5, empty_blocks: 2 }],
      team_txs: [{ txid: 'abc', block_height: 100, from: 't1a', to: 't1b', amount: 3.5 }],
      last_scanned_height: 12345,
    }));

    const result = await fetch_chain_activity();

    expect(result.daily).toEqual([{ date: '2026-09-06', utilityBlocks: 5, emptyBlocks: 2 }]);
    expect(result.teamTxs).toEqual([{ txid: 'abc', blockHeight: 100, from: 't1a', to: 't1b', amount: 3.5 }]);
    expect(result.lastScannedHeight).toBe(12345);
  });

  it('returns empty defaults when success is false', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({ success: false }));
    const result = await fetch_chain_activity();
    expect(result).toEqual({ daily: [], teamTxs: [], lastScannedHeight: 0 });
  });

  it('fails soft on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await fetch_chain_activity();
    expect(result).toEqual({ daily: [], teamTxs: [], lastScannedHeight: 0 });
  });
});

describe('filterDailyRange', () => {
  const daily = [
    { date: '2026-08-30', utilityBlocks: 1, emptyBlocks: 1 },
    { date: '2026-08-31', utilityBlocks: 2, emptyBlocks: 2 },
    { date: '2026-09-01', utilityBlocks: 3, emptyBlocks: 3 },
  ];

  it('returns the trailing N entries', () => {
    expect(filterDailyRange(daily, 2)).toEqual(daily.slice(1));
  });

  it('returns everything available when the range exceeds what exists', () => {
    expect(filterDailyRange(daily, 100)).toEqual(daily);
  });

  it('handles an empty/missing array', () => {
    expect(filterDailyRange(null, 7)).toEqual([]);
  });
});

describe('summarizeDaily', () => {
  it('sums utility and empty blocks across all entries', () => {
    const daily = [
      { date: 'a', utilityBlocks: 3, emptyBlocks: 1 },
      { date: 'b', utilityBlocks: 2, emptyBlocks: 4 },
    ];
    expect(summarizeDaily(daily)).toEqual({ utilityBlocks: 5, emptyBlocks: 5 });
  });

  it('handles an empty/missing array', () => {
    expect(summarizeDaily(null)).toEqual({ utilityBlocks: 0, emptyBlocks: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern="chainActivity.test.js"
```
Expected: FAIL — `chainActivity` module not found.

- [ ] **Step 3: Implement**

`client/src/analytics/chainActivity.js`:
```js
import { FLUXNODE_INFO_API_URL } from 'app-buildinfo';

/*
 * Fetches the Chain Activity backend rollup (api/src/services/chain_activity.rs) —
 * daily utility/empty block counts and the Flux-team transaction log, for however
 * much of the ~8-day retention window the scanning replica has caught up to.
 * Mirrors the existing `${FLUXNODE_INFO_API_URL}/api/v1/...` fetch pattern already
 * used by getDemoWallet() (apidata.js). The backend's JSON is snake_case (Rust's
 * serde default) — normalized to camelCase here, once, at the boundary.
 */
export async function fetch_chain_activity() {
  const empty = { daily: [], teamTxs: [], lastScannedHeight: 0 };
  try {
    const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/chain-activity`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!json?.success) return empty;

    const daily = Array.isArray(json.daily)
      ? json.daily.map((d) => ({ date: d.date, utilityBlocks: d.utility_blocks || 0, emptyBlocks: d.empty_blocks || 0 }))
      : [];
    const teamTxs = Array.isArray(json.team_txs)
      ? json.team_txs.map((t) => ({ txid: t.txid, blockHeight: t.block_height, from: t.from, to: t.to, amount: t.amount }))
      : [];

    return { daily, teamTxs, lastScannedHeight: json.last_scanned_height || 0 };
  } catch {
    return empty;
  }
}

// Client-side range filter — the backend always returns the full retained
// window in one payload, so toggling 24h/7d never needs a second network call.
export function filterDailyRange(daily, days) {
  return (daily || []).slice(-days);
}

// Rolls a set of daily counts up into a single summary for the range currently shown.
export function summarizeDaily(daily) {
  return (daily || []).reduce(
    (acc, d) => ({
      utilityBlocks: acc.utilityBlocks + (d.utilityBlocks || 0),
      emptyBlocks: acc.emptyBlocks + (d.emptyBlocks || 0),
    }),
    { utilityBlocks: 0, emptyBlocks: 0 }
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Same command as Step 2. Expected: PASS, 8 tests.

- [ ] **Step 5: Full client suite + build**

```bash
cd client && CI=true npx react-scripts test --watchAll=false
```
Expected: 290 total (282 baseline + 8 new), all passing.
```bash
cd client && npx react-scripts build
```
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/chainActivity.js client/src/analytics/chainActivity.test.js
git commit -m "feat(analytics): add chainActivity.js — Chain Activity backend fetch module"
```

---

## Task 6: `ChainActivityTab` — assemble the tab, wire it into `Analytics.jsx`

**Files:**
- Create: `client/src/analytics/ChainActivityTab/index.jsx`
- Create: `client/src/analytics/ChainActivityTab/index.scss`
- Modify: `client/src/analytics/Analytics.jsx`

**Interfaces:**
- Consumes: `fetch_chain_activity`, `filterDailyRange`, `summarizeDaily` (Task 5).
- No new test file — matches the established convention that tab components
  (`AppsTab`, `NetworkTab`, `DonorTab`) aren't unit tested, only their data modules
  are (already covered by Task 5's tests).

- [ ] **Step 1: Build the component**

`client/src/analytics/ChainActivityTab/index.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_chain_activity, filterDailyRange, summarizeDaily } from 'analytics/chainActivity';
import './index.scss';

const RANGE_OPTIONS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
];

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
}

function UtilitySummary({ daily, rangeDays, rangeLabel }) {
  const ranged = filterDailyRange(daily, rangeDays);
  const { utilityBlocks, emptyBlocks } = summarizeDaily(ranged);
  const total = utilityBlocks + emptyBlocks;

  return (
    <div className="hov-panel ca-utility-panel">
      <div className="hov-header">
        <span className="hov-header-title">UTILITY VS EMPTY BLOCKS</span>
        <span className="hov-header-badge">{rangeLabel}</span>
      </div>
      {total === 0 ? (
        <div className="hov-empty">
          {daily.length === 0 ? 'Still building history — check back shortly' : 'No blocks in this range yet'}
        </div>
      ) : (
        <>
          <div className="ca-utility-bar">
            <div className="ca-utility-bar-fill" style={{ width: `${pct(utilityBlocks, total)}%` }} />
          </div>
          <div className="ca-utility-stats">
            <span className="ca-utility-stat ca-utility-stat--utility">
              {fmtNum(utilityBlocks)} utility ({pct(utilityBlocks, total)}%)
            </span>
            <span className="ca-utility-stat ca-utility-stat--empty">
              {fmtNum(emptyBlocks)} empty ({pct(emptyBlocks, total)}%)
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TeamTxList({ teamTxs, rangeDays, lastScannedHeight }) {
  const cutoffHeight = lastScannedHeight - rangeDays * 2880; // BLOCKS_PER_DAY, kept in sync with the backend constant
  const ranged = (teamTxs || []).filter((t) => t.blockHeight >= cutoffHeight);

  return (
    <div className="hov-panel ca-team-tx-panel">
      <div className="hov-header">
        <span className="hov-header-title">FLUX TEAM TRANSACTIONS</span>
        <span className="hov-header-badge">{ranged.length}</span>
      </div>
      <div className="hov-ranked-list">
        {ranged.length === 0 ? (
          <div className="hov-empty">No team transactions in this range</div>
        ) : (
          ranged.map((tx) => (
            <div key={tx.txid} className="ca-team-tx-row">
              <span className="ca-team-tx-height">#{fmtNum(tx.blockHeight)}</span>
              <span className="ca-team-tx-addrs">
                {tx.from.slice(0, 8)}… → {tx.to.slice(0, 8)}…
              </span>
              <span className="hov-badge">{tx.amount.toFixed(2)} FLUX</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ChainActivityTab() {
  const [data, setData] = useState({ daily: [], teamTxs: [], lastScannedHeight: 0 });
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await fetch_chain_activity();
      if (cancelled) return;
      setData(result);
      setLoading(false);
    })().catch(() => {
      // fetch_chain_activity() already fails soft to empty defaults — this is
      // defensive only, matching NetworkTab's own equivalent comment.
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="chain-activity-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const activeRange = RANGE_OPTIONS.find((r) => r.days === rangeDays) || RANGE_OPTIONS[0];

  return (
    <div className="chain-activity-tab">
      <div className="ca-range-toggle">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`ca-range-btn${r.days === rangeDays ? ' ca-range-btn--active' : ''}`}
            onClick={() => setRangeDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <UtilitySummary daily={data.daily} rangeDays={rangeDays} rangeLabel={activeRange.label} />
      <TeamTxList teamTxs={data.teamTxs} rangeDays={rangeDays} lastScannedHeight={data.lastScannedHeight} />
    </div>
  );
}
```

- [ ] **Step 2: Style it — own copy of the shared panel chrome**

`client/src/analytics/ChainActivityTab/index.scss` (chrome classes copied from
`NetworkTab/index.scss` per the established convention, plus this tab's own classes):
```scss
@import 'styles/functional';

.chain-activity-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ca-range-toggle {
  display: flex;
  gap: 6px;
}

.ca-range-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-primary);
  background: var(--surface-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);

  &:hover {
    background: var(--surface-inset);
  }

  &--active {
    background: #2686d0;
    border-color: #2686d0;
    color: #fff;
  }
}

.hov-panel {
  border-radius: var(--radius-md);
  padding: 14px 16px 16px;
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
  transition: border-color var(--transition-base), box-shadow var(--transition-base);

  &:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-hover);
  }

  @include rule-mode-dark() {
    background: var(--surface-primary);
    border-color: var(--border-primary);
    box-shadow: var(--shadow-md);

    &:hover {
      border-color: var(--border-hover);
      box-shadow: var(--shadow-hover);
    }
  }
}

.hov-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -14px -16px 12px;
  padding: 10px 16px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  border-bottom: 1px solid var(--border-secondary);
}

.hov-header-title {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.hov-header-badge {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 8px;
  border-radius: 20px;
  background: rgba(100, 100, 100, 0.1);
  color: var(--text-secondary);

  @include rule-mode-dark() {
    background: rgba(255, 255, 255, 0.08);
  }
}

.hov-empty {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  padding: 12px 0;
  text-align: center;
}

.hov-panel-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--surface-inset) 40%,
      var(--surface-secondary) 50%,
      var(--surface-inset) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: ca-shimmer 1.8s ease-in-out infinite;
    border-radius: var(--radius-sm);
    opacity: 0.6;
    pointer-events: none;
  }
}

@keyframes ca-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.hov-ranked-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hov-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(38, 134, 208, 0.12);
  color: #2686d0;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--transition-fast);

  @include rule-mode-dark() {
    background: rgba(38, 134, 208, 0.22);
    color: #5eb8ff;
  }
}

.ca-utility-bar {
  height: 10px;
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.25); // empty share shows through as the track color
  overflow: hidden;
  margin-bottom: 8px;
}

.ca-utility-bar-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, #22c55e, #4ade80); // utility share
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.ca-utility-stats {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}

.ca-utility-stat--utility {
  color: #22c55e;
}

.ca-utility-stat--empty {
  color: #ef4444;
}

.ca-team-tx-row {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  border-bottom: 1px solid rgba(128, 128, 128, 0.07);

  &:hover {
    background: var(--surface-inset);
  }

  &:last-child {
    border-bottom: none;
  }
}

.ca-team-tx-height {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.ca-team-tx-addrs {
  font-size: 0.75rem;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
```

- [ ] **Step 3: Wire into `Analytics.jsx`**

`client/src/analytics/Analytics.jsx`:
```jsx
import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import { NetworkTab } from 'analytics/NetworkTab';
import { DonorTab } from 'analytics/DonorTab';
import { ChainActivityTab } from 'analytics/ChainActivityTab';
import './Analytics.scss';

// Four tabs now (Apps, Network, Donor, Chain Activity) — Session 5 lands the
// last one planned in PREMIUM_FEATURES_PLAN.md Part D.
export default function Analytics() {
  return (
    <div className="analytics-page">
      <Helmet>
        <title>Analytics</title>
      </Helmet>

      <div className="analytics-page-header">
        <span className="analytics-page-title">Analytics</span>
        <span className="analytics-page-subtitle">
          Network-wide stats for FluxNode donors.
        </span>
      </div>

      <Tabs id="analytics-tabs" className="analytics-tabs" renderActiveTabPanelOnly>
        <Tab id="apps" title="Apps" panel={<AppsTab />} />
        <Tab id="network" title="Network" panel={<NetworkTab />} />
        <Tab id="donor" title="Donor" panel={<DonorTab />} />
        <Tab id="chain-activity" title="Chain Activity" panel={<ChainActivityTab />} />
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Full client suite + build**

```bash
cd client && CI=true npx react-scripts test --watchAll=false
```
Expected: 290 total, all passing (unchanged from Task 5 — this task adds no new
tests, matching the established tab-component convention).
```bash
cd client && npx react-scripts build
```
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 5: Manual check**

`cd client && yarn start`, with `REACT_APP_FLUXNODE_INFO_API_MODE` unset (dev mode
talks to official APIs directly per this repo's own dev-setup docs, which means the new
Rust endpoint has nothing to answer with in plain `yarn start` — confirm the tab shows
its "still building history" empty state gracefully rather than hanging or erroring).
Separately, with the API server running locally (Task 4's manual run) and
`client/.env.development.local` pointed at it per `CLAUDE.md`'s dev-setup section,
confirm the tab renders real data once the backend has scanned at least a few blocks.
Toggle 24H/7D — the displayed counts should change without a network request (check
the browser Network tab). Toggle light/dark theme — panel chrome, utility bar, and team
tx list all read correctly in both.

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/ChainActivityTab client/src/analytics/Analytics.jsx
git commit -m "feat(analytics): build the Chain Activity tab, wire it into Analytics.jsx"
```

---

## Final milestone: full regression pass

- [ ] **Step 1: Full client test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 290 total (282 baseline + 8 new from Task 5).

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 3: Full Rust test + build**

From `api/`:
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo test
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)":/app -w /app -v fluxnode-cargo-registry:/usr/local/cargo/registry rust:1.67.1 cargo build --release
```
Expected: `cargo test` passes 21 tests (Task 1's suite — Tasks 2-4 add no automated
tests, per this plan's Global Constraints); `cargo build --release` exits 0 (the
release profile is what `Dockerfile` actually ships, so this is the real production
build check, not just the debug build the per-task steps used).

- [ ] **Step 4: Full manual walkthrough, fresh**

`yarn start` from `client/`, with `PREMIUM_TESTING_MODE=true`:

- `/home` — unaffected (this plan never touches Home's data path).
- `/nodes` — unaffected.
- `/live` — unaffected.
- `/analytics` → **Apps** tab — identical to how Session 2 left it.
- `/analytics` → **Network** tab — identical to how Session 3 left it.
- `/analytics` → **Donor** tab — identical to how Session 4 left it.
- `/analytics` → **Chain Activity** tab (new) — both range toggles checked, both
  theme modes checked (Task 6's own manual check covers this in detail — this step
  is a final confirmation, not a re-derivation).

- [ ] **Step 5: Update `PREMIUM_FEATURES_PLAN.md`**

Change the Session 5 line in the "Build order" section from `- [ ]` to `- [x]`, and
prepend "Done." to its description, matching how Sessions 2-4 were marked complete.

- [ ] **Step 6: Rebase onto `main` if PR #180 (the design-spec docs PR) has merged by now**

This branch (`feat/analytics-session5`) was branched from `docs/chain-activity-design`
before that PR merged, so it currently carries those docs commits too. If PR #180 has
merged to `main` by the time this plan finishes:
```bash
git fetch origin
git rebase origin/main
```
If it hasn't merged yet, skip this step — the eventual implementation PR will simply
show the docs commits until #180 merges, which resolves itself automatically and isn't
a blocker to opening the PR now.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/analytics-session5
gh pr create --base main --title "feat(analytics): Chain Activity tab (Session 5)" --body "$(cat <<'EOF'
## Summary
Builds the /analytics page's fourth tab — Chain Activity — showing a trailing
utility-vs-empty block ratio and a Flux-team transaction log. First persisted,
periodically-scanned backend state this API has had (new hourly background
scan in api/src/services/chain_activity.rs, flat JSON cache under api/data/).

Full design: docs/superpowers/specs/2026-09-06-chain-activity-design.md
Implementation plan: docs/superpowers/plans/2026-09-06-analytics-session5-chain-activity.md

## Testing
- cd client && CI=true npx react-scripts test --watchAll=false — 290 total, all passing
- cd client && npx react-scripts build — exit 0, 4 pre-existing baseline warnings only
- Rust: cargo test (21 tests, Task 1's pure classification/persistence suite) and
  cargo build --release both exit 0 (verified via the rust:1.67.1 Docker image,
  matching this project's own Dockerfile — no local Rust toolchain on the build
  machine)
- Manual walkthrough: all four Analytics tabs, both Chain Activity range toggles,
  both theme modes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
