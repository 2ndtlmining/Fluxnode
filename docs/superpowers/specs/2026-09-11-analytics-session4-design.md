# Analytics Rework — Session 4 Design Spec

Donor + Chain Activity visual refresh, the Recharts trend chart, and the
bundled issue #199 utility drill-down.

This is the fourth of the five sessions laid out in
`2026-09-10-analytics-rework-design.md` ("Part D — Visual/premium refresh",
delivery item 4). That document remains the governing spec; this one adds the
detail Part D deferred, and records the decisions taken during Session 4's own
brainstorming.

Baseline: `main` at `4d1f59a` (PR #201, Session 3, merged).

## Overview

Session 3 established the visual vocabulary — a per-tab accent color applied as
a left-edge strip plus a faint gradient wash, a headline "hero" stat per tab,
and `PanelGate`'s opt-in `preview="blur"` locked state. Session 4 applies that
vocabulary to the two remaining tabs, replaces Chain Activity's single
aggregate progress bar with a real daily trend chart, and builds the drill-down
requested in issue #199.

Unlike Sessions 3 and 5, this session is **not purely frontend**. Issue #199
was bundled in by explicit user decision, against the recommendation to keep it
separate, and it requires a new persisted shape, a new API endpoint, and new
scanning logic in `api/src/services/chain_activity.rs`.

## Decisions taken before this spec

Six decisions were settled during brainstorming and are recorded here so they
are not relitigated during implementation.

1. **The Donor tab's locked state stays `preview="plain"`**, not blur-preview.
   `donorWallet` (`DonorContext.jsx`) is only ever set via
   `useDonorWalletCheck`'s `SUCCESS` path, so a genuinely locked visitor always
   has `donorWallet === null` and `DonorTab` renders its own `NoWalletState()`
   (`DonorTab/index.jsx:154`) — a second, independent lock message nested inside
   whatever `PanelGate` renders, since `Analytics.jsx:30` gates DonorTab at the
   whole-tab level. Blurring that would either be a double-gate over nothing, or
   would require fabricated sample data. Both were rejected.

2. **Chain Activity's headline hero is "today's utility blocks"**, a real count.
   Part D originally suggested "today's tx count", which does not exist anywhere
   in the data model — `chainActivity.js`'s `daily` array carries only
   `{date, utilityBlocks, emptyBlocks}`.

3. **The 24H/7D range toggle is removed.** The Recharts trend chart always shows
   the full retained window (up to `RETENTION_DAYS = 8`). A 1-day chart is a
   single bar, not a trend.

4. **Issue #199 is bundled into this session** rather than scoped separately.

5. **The drill-down shows category subtotals plus a capped block list** — not
   subtotals alone, not a fully virtualized list. See "The measurement that
   reframed #199" below.

6. **Verification uses the full Sessions 1-2 discipline**, including the live
   wallet replay, despite no ranking code being touched.

## The measurement that reframed #199

Issue #199 proposes "P2P (2) Dapp (2)" as the drill-down's shape. That example
came from live-testing a scanner that had only scanned a handful of blocks.

A live probe against `explorer.runonflux.io` on 2026-09-11 (12 blocks sampled
across the preceding ~24h, tip `2,939,040`) measured the real ratio:

| height | txs in block | real P2P transfers | utility? |
|---|---|---|---|
| 2939035 | 11 | 2 | yes |
| 2938115 | 10 | 1 | yes |
| the other 10 sampled | 5–21 | 0 | no |

**~17% of blocks are utility.** Two consequences drive the design:

- **Storage is cheap.** Persisting only utility blocks means ~3,900 records
  across the 8-day / 23,040-block retention window, roughly **330 KB** as
  pretty-printed JSON. A whole-window model (every block, utility or not) would
  cost ~2 MB. Empty blocks stay aggregate-only; nobody drills into "empty".
- **A day holds ~490 utility blocks, not ~4.** Any design that renders "the
  blocks" as a plain list must handle hundreds of rows.

Also confirmed by the probe: a block's `txlength` (5–21 in every sample) is
**not** a usable proxy for utility, because most transactions in a block are
node confirmations with empty `vout`. The existing `extract_p2p_transfers`
filter is genuinely the classifier.

## Part A — Accent tokens

Extends the existing system in `client/src/styles/_global.scss`. No new tokens.

Per-tab accent, completing Part D's mapping (Apps → `--accent-blue` and Network
→ `--accent-purple` shipped in Session 3):

- **Donor tab → `--accent-green`**
- **Chain Activity tab → `--accent-amber`**

Applied via Session 3's established pattern: a 2px `border-left` strip on
`.hov-panel`, plus a faint gradient wash on `.hov-header`
(`linear-gradient(90deg, rgba(...) 0%, transparent 60%)`).

Hardcoded one-offs replaced with tokens:

| file | line | current | becomes |
|---|---|---|---|
| `ChainActivityTab/index.scss` | 67–69 | `#2686d0` | `--accent-amber` |
| `ChainActivityTab/index.scss` | 183, 190 | `#2686d0`, `#5eb8ff` | `--accent-amber` |
| `ChainActivityTab/index.scss` | 205, 216 | `#22c55e`, `#4ade80` | `--accent-green` |
| `ChainActivityTab/index.scss` | 220 | `#ef4444` | `--accent-red` |
| `WorldMap/index.scss` | `.wm-panel` | `#0ea5e9` | `--accent-purple` |

The `WorldMap` entry is the item parked from Session 3, folded in here by
explicit user selection. Session 4 is the last session that touches the token
system, so it is now or never.

### The `hov-*` collision guard — mandatory, not optional

Session 3 shipped a Critical bug caught only during final review: unscoped
single-class `hov-*` selectors collide inside the shared `/analytics` lazy
webpack chunk, and whichever stylesheet imports last in `Analytics.jsx` wins
silently. It produces **zero visible difference from baseline**, so no amount of
screenshot or click-through QA can catch it.

Session 4 recolors exactly the two files that still carry the hazard:

- `ChainActivityTab/index.scss:177` — unscoped `.hov-badge`
- `DonorTab/index.scss:205` — unscoped `.hov-badge`

Both must be scoped to their tab root — `.chain-activity-tab .hov-badge` and
`.donor-tab .hov-badge` — giving specificity (0,2,0), which durably beats the
unscoped (0,1,0) rules in `AppsTab` and `TopHostedApps` regardless of future
import order. This is a durable fix, not a today's-order fix.

**Verification is against built CSS bytes, not source.** A source-level diff
cannot detect this class of bug. Build, then grep the emitted chunks —
`client/build/static/css/*.chunk.css` — for `.hov-badge` and confirm every
surviving rule is either scoped to a tab root or belongs to a file this session
did not touch. Checking only the file you edited is exactly what missed the bug
in Session 3.

## Part B — Headline hero stats

Reuses the `.apps-tab-hero` pattern established in Session 3
(`AppsTab/index.scss:239`): a 2.75rem tabular-nums value over a small uppercase
label, plain `--text-primary` in light mode and a gradient-clipped fill in dark
mode using the tab's own accent.

- **Chain Activity** → today's utility blocks, read from the most recent entry
  in the `daily` array. Falls back to the existing "still building history"
  empty treatment when the array is empty.
- **Donor** → the payout headline, from `PayoutCard`'s existing real LAST /
  NEXT PAYOUT values. This is real unlocked content, consistent with decision 1;
  the plain lock message is restyled with the new tokens, not replaced
  structurally.

New classes `.ca-tab-hero*` and `.dt-tab-hero*` mirror `.apps-tab-hero*`. They
are prefixed per-tab, so they carry no collision risk of their own.

## Part C — Recharts trend chart

Adds **Recharts** as a new npm dependency, scoped to `client/src/analytics/`
only. `/live` keeps its no-new-dependency discipline unchanged. The existing
hand-rolled ranked-bar panels in Apps and Network are explicitly not touched.

Replaces `UtilitySummary`'s single aggregate two-color progress bar with a
**stacked daily bar chart** — utility and empty blocks per day — across the full
retained window (up to `RETENTION_DAYS = 8` days).

Removed with the toggle (decision 3):

- `RANGE_OPTIONS` and the `.ca-range-toggle` / `.ca-range-btn` markup and styles
  in `ChainActivityTab/index.jsx`
- `filterDailyRange` in `chainActivity.js` and its tests
- The `rangeDays` state and its propagation into `UtilitySummary` and
  `TeamTxList`

`TeamTxList` currently derives its cutoff from `rangeDays`
(`ChainActivityTab/index.jsx:122` — `cutoffHeight = lastScannedHeight -
rangeDays * 2880`). With the toggle gone it uses the full retained window.

The frontend has no `RETENTION_DAYS` constant: the backend's lives in
`chain_activity.rs`, and `apidata.js:1295`'s `BLOCKS_PER_DAY = 2880` is local
and unexported. Export both from `chainActivity.js` as
`BLOCKS_PER_DAY = 2880` and `RETENTION_DAYS = 8`, each carrying the existing
"kept in sync with the backend constant" comment, and use them in place of the
inline `2880`. This keeps the duplication in exactly one place per side rather
than adding a third copy.

Chart requirements:

- Theme-aware, and this needs a wiring change. Recharts takes colors as props,
  not CSS, so the chart needs a React-level theme signal — and
  `Application.jsx:178` currently renders `<Analytics />` with **no `theme`
  prop**, unlike `Home` (line 130), `MainApp` (line 144) and `Demo` (line 156),
  which all receive `theme={darkMode ? 'dark' : 'light'}`. There is no theme
  context or hook in this codebase; the only signals are that prop, the
  `app-mode-dark` class on the `.App` element, and `localStorage`'s `appTheme`
  (which does not react to a toggle).

  **Decision: thread the existing prop.** `Application.jsx:178` becomes
  `<Analytics theme={darkMode ? 'dark' : 'light'} />`, matching the three
  existing call sites exactly; `Analytics` passes it to `ChainActivityTab`,
  which passes it to the chart. This follows the established convention rather
  than introducing a `MutationObserver` or a `getComputedStyle` read, both of
  which would be new patterns for this repo. SCSS keeps using
  `rule-mode-dark()` for everything that is not a Recharts prop.
- Responsive via `ResponsiveContainer`.
- Tooltip showing date, utility count, empty count.
- Accessible fallback: when `daily` is empty, keep the existing "still building
  history" / "no data available" copy rather than rendering an empty chart.

**Cost, recorded rather than hidden:** Recharts is roughly 100 KB gzipped for
one chart — the single largest addition this rework makes. It lands in the lazy
`/analytics` chunk and so does not affect first paint. Part D committed to this
dependency; this spec does not reopen it, but the cost is named.

## Part D — The utility drill-down (issue #199)

### Backend data model

The category split already exists transiently. `scan_one_block`
(`chain_activity.rs:548`) computes `transfers` and checks
`deployment_heights.contains(&height)`, then collapses both into a single
`is_utility` bool and discards the detail. This is a persistence-and-exposure
gap, not a new-algorithm problem.

`BlockScanResult` gains the split:

```rust
pub struct BlockScanResult {
    pub height: i64,
    pub is_utility: bool,       // retained: is_p2p || is_dapp
    pub is_p2p: bool,           // new: !transfers.is_empty()
    pub is_dapp: bool,          // new: deployment_heights.contains(&height)
    pub transfer_count: u32,    // new: transfers.len()
    pub date: String,
    pub team_txs: Vec<TeamTx>,
}
```

New persisted shape, following the established atomic-flat-JSON pattern already
used by `checkpoint.json`, `scan_status.json` and `team_txs.json`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct UtilityBlockRecord {
    pub height: i64,
    pub date: String,           // "YYYY-MM-DD", UTC
    pub is_p2p: bool,
    pub is_dapp: bool,
    pub transfer_count: u32,
}
```

- New constant `UTILITY_BLOCKS_FILE: &str = "chain_activity_utility_blocks.json"`
- New wrapper `UtilityBlockFile { blocks: Vec<UtilityBlockRecord> }`
- `load_utility_blocks` / `save_utility_blocks` via the existing
  `read_json_or_default` / `write_json_atomic`
- **Only utility blocks are recorded.** Empty blocks stay aggregate-only.

Integration points, each mirroring an existing one:

- `fold_contiguous_results` pushes a `UtilityBlockRecord` when `r.is_utility`,
  in the same contiguous-run loop that calls `upsert_daily_count`. The existing
  checkpoint discipline (apply only the contiguous run starting at
  `start_height + 1`) already guarantees each height is folded exactly once, so
  no dedupe is needed.
- `trim_utility_blocks(&mut Vec<UtilityBlockRecord>, min_height)` mirrors
  `trim_team_txs` exactly, called in the same place in `run_scan_cycle`'s batch
  loop.
- `save_utility_blocks` is called alongside `save_daily_rollup` and
  `save_team_txs` in the same batch loop, with the same error-logging shape.

### No migration story is needed

`Dockerfile` declares no `VOLUME` and no persisted data directory;
`DATA_DIR = "data"` is relative to `/app` inside an ephemeral container. Every
restart or Flux reschedule rebuilds the full retention window from the explorer
anyway. There is no durable old-format data to migrate: this is a clean-slate
addition, and no compatibility shim is required. This was verified against the
Dockerfile rather than assumed from the repo's stated durability philosophy.

### API surface

A **new endpoint**, not an extension of the existing payload:

```
GET /api/v1/chain-activity/blocks?limit=50
```

`/api/v1/chain-activity` is fetched on every Chain Activity tab load. Adding
~330 KB of block records to it would tax every visitor for a feature only some
will open. The new endpoint is fetched lazily, on first expand.

Response:

```json
{
  "success": true,
  "totals": {
    "p2p_only": 462,
    "dapp_only": 28,
    "both": 4,
    "utility_total": 494
  },
  "blocks": [
    { "height": 2939035, "date": "2026-09-11", "is_p2p": true, "is_dapp": false, "transfer_count": 2 }
  ]
}
```

- `totals` is computed server-side over the **whole retained set** — consistent
  with the summary panel, which (with the range toggle gone) also covers the
  whole retained window.
- The three subtotals are **disjoint** and sum to `utility_total`. `is_p2p` and
  `is_dapp` are independent booleans, so overlapping "any P2P" / "any Dapp"
  counts would not add up and would read as a bug.
- `blocks` is the most recent `limit` records by height descending.
- `limit` is clamped server-side (default 50, maximum 200) so a hand-crafted
  query cannot request the whole set.
- Handler is a synchronous read of persisted state, never triggering a scan on
  the request path — matching the existing `chain_activity::handler`.

### Frontend

`chainActivity.js` gains `fetch_chain_activity_blocks(limit)`, normalizing
snake_case to camelCase at the boundary exactly as `fetch_chain_activity` does,
and failing soft to an empty result on any error.

`UtilitySummary` changes:

- The utility stat becomes a `<button>` carrying `aria-expanded` and
  `aria-controls`, keyboard-operable, with a visible focus ring and a chevron
  affordance. It is not a click handler on a `<span>`.
- The fetch fires **on first expand only**, then caches for the tab's lifetime.
  The tab's initial network cost is unchanged.
- Expanded content: three category chips (P2P / Dapp / Both) over a scrollable
  list of up to 50 rows, each showing height, category badge(s) and transfer
  count, with a "showing 50 of N" footer whenever `blocks.length < utility_total`.
- Loading state while the lazy fetch is in flight; on failure, an inline message
  and collapse back to the summary — matching `fetch_chain_activity`'s existing
  fail-soft convention rather than surfacing an error boundary.
- "Both" is labeled with a title attribute explaining it means a block that
  carried a P2P transfer *and* an app deployment.

## Testing

Baseline to re-confirm at session start: `cd client && CI=true npx react-scripts
test --watchAll=false` green, build exit 0. The Session 3 baseline was 317 tests
with 4 pre-existing warning files; more has merged since, so re-measure rather
than assume.

**Rust unit tests** (new):

- `scan_one_block`'s split: a block with transfers only → `is_p2p`, not
  `is_dapp`; a deployment height with no transfers → `is_dapp`, not `is_p2p`; a
  block that is both → both true; `transfer_count` matches `transfers.len()`.
- `is_utility` remains exactly `is_p2p || is_dapp` — the existing
  `is_block_utility` tests must keep passing unchanged.
- `fold_contiguous_results` appends a record for each utility block in the
  contiguous run and none past a gap.
- `trim_utility_blocks` drops records below `min_height` and keeps the rest.
- Disjoint totals: `p2p_only + dapp_only + both == utility_total` over a mixed
  fixture.

**Frontend unit tests** (new):

- `fetch_chain_activity_blocks` normalization, and its empty-result fallback on
  a network error and on `success: false`.
- `UtilitySummary` expand behavior: does not fetch on mount, fetches once on
  first expand, renders the footer only when the list is capped.
- Removal coverage: the `filterDailyRange` tests are deleted with the function;
  confirm nothing else imports it.

**Live verification** (mandatory):

- Run the scanner against real chain data and confirm drill-down categories
  match what the explorer shows for the same heights. The classifier is the
  whole feature; unit tests over fixtures cannot establish it is correct against
  the real chain.
- Full light/dark matrix across both refreshed tabs, both gate states,
  responsive check.
- **Built-CSS grep** confirming the scoped `.hov-badge` rules ship in the
  emitted analytics chunk.
- **Live wallet replay**: diff a real wallet's Nodes-page numbers (rankings,
  achievements, tier stats) before and after, per Sessions 1-2. No
  `globalRankings` or ranking-calculation code is touched — DonorTab's data path
  (`donorNodes.js` / `donorUtilization.js` / `donorApps.js`) is visually
  reskinned, not restructured — so this is conservative rather than strictly
  implied. It was chosen deliberately over reasoning about which sessions are
  exempt.

## Delivery

Worktree name **`analytics-session4-donor-chain`**. It cannot be
`analytics-session4`: `worktrees/analytics-session4` already exists as a stale
directory from the earlier session numbering (one of 14 such directories that
`git worktree list` no longer tracks).

Implementation proceeds via `superpowers:writing-plans` then
`subagent-driven-development`, with a final whole-branch review before PR —
matching every prior session in this rework.

**Sizing risk, recorded.** Parts A–C are a visual refresh; Part D is a backend
persistence change, a new endpoint and new UI. This is close to two sessions of
work in one, which follows from the decision to bundle #199. If the
implementation plan comes out oversized, the natural seam is to split Part D
into its own PR off the same branch.

## Out of scope

- `teamSponsored.js`'s unsourced `FLUX_TEAM_OWNER_ZELIDS` comment — parked
  again, not selected for this session.
- The 14 stale `worktrees/` directories and the stray `api;C` file — housekeeping
  unrelated to this work.
- Everything in issues #202–#207 (whitepaper v9 reward-schedule changes, filed
  2026-09-11). Those are tracked separately and deliberately not implemented
  here.
- The dark-mode wash-out bug (todo.md item 8) and the final cross-tab QA, which
  Part D assigns to Session 5.
