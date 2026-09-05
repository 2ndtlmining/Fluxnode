# Chain Activity Tab — Design Spec

**Status:** Approved by user 2026-09-06, ready for implementation planning.
**Supersedes:** `PREMIUM_FEATURES_PLAN.md` Part D (kept in sync, this doc is the source
of truth for anything the two disagree on).

## Goal

`/analytics`'s fourth tab (Session 5+), analyzing recent block history for
network-utility and Flux-team fund-flow signals — the first Analytics tab built over
a *time window* of chain history rather than current-snapshot state.

Two signals, both scanned in one pass over the same block window:

1. **Utility vs. empty blocks** — a block is "empty" if its only activity is coinbase
   rewards (+ node confirmations, which live outside the normal tx list and don't count
   either way); "utility" if it contains at least one P2P transfer or app deployment.
2. **Flux team transactions** — any tx where a known Flux-team address (starts with the
   one confirmed address, `t1gjUUxBpBeVC1sWwAFrtSsVCbSaFdZx8UY`, extensible array shape)
   appears as sender or recipient.

**Explicitly out of scope:** FLUX-sent-to-exchanges tracking — no reliable public list
of exchange deposit addresses exists (checked at the time `PREMIUM_FEATURES_PLAN.md`
Part D was written; re-check before assuming that's still true). No placeholder row
ships for it.

## Why this needs a backend service (the one genuinely new thing here)

Every other Analytics tab (Apps/Network/Donor) reads current-snapshot state that's
cheap to compute per page load. Chain Activity needs a rolling window of *history* —
thousands of blocks, each needing 1-2 explorer API calls to classify — which is too
expensive to repeat client-side on every visit. This requires the Rust API's **first
persisted, periodically-scanned backend state** (everything else today is
fetch-and-cache, nothing is stored between requests).

## Deployment context that shapes this design

This API runs as **multiple Flux-hosted replicas**, each on a physically separate node,
with no shared disk between them, and **any replica can be rescheduled to a different
node at any time**, wiping its local disk. Two consequences drive every persistence
decision below:

- Local storage must be treated as a **rebuildable cache**, never a source of truth.
  File format (flat JSON vs. embedded SQLite) doesn't change this — neither survives a
  node move — so the simpler option (flat JSON, no new Cargo dependency) wins on cost
  with no durability trade-off given up.
- There is **no cross-replica coordination** without adding real infrastructure
  (Redis/etcd/Postgres), which this codebase has nowhere else and which is explicitly
  out of scope. Each replica scans and persists **independently** — no shared writer,
  nothing to reconcile between replicas.

## Persistence design

**Format:** flat JSON files under a new `data/` directory, one file per logical
dataset — not one growing blob:
- `data/chain_activity_daily.json` — rolling daily utility/empty block counts.
- `data/chain_activity_team_tx.json` — team-address transaction log for the retained
  window.
- `data/chain_activity_checkpoint.json` — last successfully scanned block height (so a
  restart resumes instead of rescanning from the retention window's start every time).

Each write is temp-file-then-rename (atomic on the same filesystem) so a crash mid-write
never leaves a corrupt file behind.

**Retention window: ~8 days (7d + 1 buffer day), not longer.** The UI only ever needs
24h/7d selectable ranges (see Frontend section) — YAGNI against a larger archive that
nothing reads. At 2,880 blocks/day (confirmed: 30s block time, matches the existing
`BLOCK_RATE = 480 // at 30s blocks = 240 minutes` comment in `client/src/apidata.js`),
that's **~23,040 blocks** retained. Extend the window later only if a longer range is
ever actually requested.

**Cross-replica consistency — accepted limitation, stated explicitly:** two visitors
hitting two different replicas mid-catch-up can briefly see slightly different counts.
Both replicas are scanning the same deterministic public chain data, so they converge
once both are caught up — this is a self-healing, low-stakes drift for a stats display
(not financial data), not a correctness bug. This is the pragmatic trade against adding
real coordination infrastructure this codebase doesn't otherwise need.

**Cold-start catch-up:** on boot, each replica checks its local checkpoint file. If
missing, or its recorded height is more than one scan interval behind the current chain
tip, run an **immediate bounded backfill** — scan from `max(checkpoint_height,
tip - 23,040)` to tip, concurrently (same `buffer_unordered` pattern
`api/src/services/live_winners.rs` already uses for its candidate-node fan-out — that
service caps at `MAX_CANDIDATES_TRIED = 8` concurrent requests; start Chain Activity's
scan at the same concurrency, tune later only if the explorer API visibly tolerates
more), rather than waiting for hourly increments to slowly rebuild history. A worst-case
cold backfill (full 23,040-block window, no prior checkpoint) at that concurrency is a
one-time few-minute-to-tens-of-minutes pass, not a request-blocking operation — it runs
on a background task, and
`GET /api/v1/chain-activity` (see API section) serves whatever the local file currently
holds, including a partial/catching-up state.

## Classification — ported to Rust, not reused as JS

`client/src/live/apidata.js` already has this classification logic, but it's JS running
client-side over ~5-10 blocks for the live chain rail — the backend needs Rust
equivalents with matching *semantics*, not literal code reuse:

- **P2P transfers** (mirrors `extractP2pTransfers`): fetch each block's transactions
  (mirrors `fetch_block_transactions`, same explorer endpoint,
  `https://explorer.runonflux.io/api/txs/?block=<hash>`), and for every non-coinbase tx,
  any output address that isn't the first input's address counts as a transfer (skip
  change-back-to-self). Presence of ≥1 transfer in the block ⇒ utility.
- **App deployments — deliberately NOT a port of `diffDeployedForEvents`.** That
  function's "diff successive 'deployed today' snapshots, attribute to whatever block
  the poll happened to notice it at" is a *live-display* trick needed only because the
  chain rail shows a live 5-block window and a real deploy height almost never lands
  inside it. A backend historical scan doesn't have that problem — it can use each app
  spec's own real height directly. **One-time sync**: fetch all specs from
  `https://api.runonflux.io/apps/globalappsspecifications` (same endpoint
  `client/src/apidata.js:1347` already uses for `deployedToday`), key by `spec.height`.
  A block has a deployment ⇒ utility if any spec's height equals that block's height.
  Re-sync this list each scan cycle (it's the same one-time full fetch either way,
  cheap relative to the per-block tx fetches) rather than trying to incrementally diff
  it — there's no "deployedAtHeight" stream to diff against here, just a lookup table.
- **Team transactions**: while already fetching each block's tx list for P2P
  classification, check every tx's addresses (both directions) against
  `FLUX_TEAM_ADDRESSES`. No separate scan pass — one pass over each block's txs produces
  both signals.

## Scheduling

New pattern for this codebase — every existing service (`live_winners.rs`, `demo.rs`,
`bench_version.rs`) is request-driven; nothing runs on a background schedule today.

`main()` spawns a `tokio::spawn`ed loop running `tokio::time::interval` at an hourly
cadence, calling `chain_activity::run_scan_cycle()`. Each cycle: read the checkpoint,
scan from there to the current tip (bounded — see cold-start catch-up above for the
"no checkpoint or far behind" case, which folds into the same function, not a separate
code path), re-sync the app-specs-by-height lookup, classify, update the daily rollup
and team-tx log, write all three files, advance the checkpoint.

## API

`GET /api/v1/chain-activity` — synchronous read of the local rollup file(s), no
scanning on the request path (scanning only ever happens on the background interval).
Returns the daily utility/empty counts and team-tx list for however much of the
retention window is currently populated (a freshly-booted, still-catching-up replica
returns a shorter window, not an error — the frontend's job, not the backend's, to
communicate "still building history" if the returned range is shorter than requested).

## Frontend

- `analytics/chainActivity.js` — fetches `GET /api/v1/chain-activity`, following the
  existing `analytics/*.js` fetch-module pattern from Apps/Network/Donor tabs.
- `ChainActivityTab/index.jsx` (+ `.scss`) — renders utility/empty block counts and the
  team-tx list, with a 24h/7d range toggle (client-side filter over the same fetched
  payload — the backend already returns the full retained window, no separate API call
  per range). Follows the existing tab pattern (own copy of shared panel chrome per the
  established `.hov-panel`/`.hov-header` convention, not cross-file import — see
  `NetworkTab/index.scss`'s header comment for the precedent).
- If the returned window is shorter than the selected range (still catching up), show
  that plainly rather than implying complete data — same resilience posture already
  used elsewhere in this codebase for `fluxinfo` staleness.

## Files to add

- `api/src/services/chain_activity.rs` + route registration in `api/src/main.rs`
- `analytics/ChainActivityTab/index.jsx` + `.scss`
- `analytics/chainActivity.js`

## Testing posture

This is a new backend subsystem sitting alongside a stable, tested frontend app —
regressions in *unrelated* areas are the real risk, not just new-code correctness.
After every implementation milestone: `cd client && CI=true npx react-scripts test
--watchAll=false` (count must only ever go up from the confirmed baseline — 282 tests
as of PR #176, re-verify against current `main` before starting), `cd client && npx
react-scripts build` (exit 0, exactly the 4 pre-existing baseline warning files —
`Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`,
`WalletNodes/index.jsx`, nothing new), and `cd api && cargo build` (+ `cargo test` for
any new Rust unit tests — this is the first Rust-side test coverage this repo would
gain, since existing services have none; new classification logic should still get
unit tests even though nothing established requires it yet).

## Open risks, stated rather than hidden

- **Explorer API load**: each replica's cold-start backfill (~23,040 block-tx fetches,
  concurrent but rate-considerate) and hourly increments (~120 new blocks/hour) hit
  `explorer.runonflux.io` independently per replica. This is a public API already used
  elsewhere in this codebase; no rate-limit issue is known today, but this design does
  multiply load by replica count where a single-writer design wouldn't. Accepted given
  the alternative (adding coordination infra) is explicitly out of scope.
- **`api.runonflux.io/apps/globalappsspecifications` is the "ordered" endpoint**, not
  the "running" one (`fluxnode-app.md` memory: `fluxinfo` is canonical for running-apps
  counts, this endpoint over-counts vs. reality). That distinction doesn't apply here —
  Chain Activity cares about deploy *events* (was a spec created at height N), which is
  exactly what this endpoint's `height` field records, regardless of whether the app is
  still running today. Using it here is correct; it would be wrong for a "how many apps
  are running right now" feature.
