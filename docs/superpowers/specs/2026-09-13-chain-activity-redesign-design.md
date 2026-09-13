# Chain Activity: make the detail the page

Issues #346 (detail and wasted space) and #347 (block numbers should link to the explorer).

## The problem

The screen is inverted. The trivial part — two counts — gets a 400px chart. The
interesting part — what actually happened on the chain — is buried two clicks
deep inside a ~200px scroll window, while roughly a third of the viewport below
sits empty.

Measured from the report in #346:

| Symptom | Measurement |
|---|---|
| Hero number is a partial scan stated as fact | 199 empty + 8 utility = **207 blocks**; a Flux day is **2,880** |
| Chart renders one bar | `RETENTION_DAYS = 8`, but the scanner was behind, so one day of data |
| Detail is buried | Utility summary → expand → block row → expand, inside a nested scrollbar |
| Rows waste width | `txid  from → to  amount` spread across ~1,900px |
| Empty states cost a panel | "No team transactions in the retained window" gets its own bordered box |

The design only works once the scanner has caught up, and looks worst exactly
when the screen is least useful — which is the state a cold start or a redeploy
puts it in.

## What the data can actually support

Three findings, each measured rather than assumed. They decide the design.

### 1. The backend already downloads the app details and throws them away

`api/src/services/chain_activity.rs`:

```rust
struct AppSpec {
    height: i64,
}
```

`fetch_deployment_heights` pulls the full `globalappsspecifications` payload
(703 KB on the wire, 4.8–14.6s measured over three runs) every scan cycle and
parses **one field** out of it. Name, owner, instances, expire, `compose[]`
(repotag, cpu, ram, hdd) and the enterprise flag are all already in the
response.

Widening the struct therefore costs **zero extra requests**.

Measured on the live payload: **1,462 specs**, of which **1,072 (73.3%)** carry
readable resources and **390 (26.7%)** are enterprise, where resources are
encrypted but name, owner, instances and expire remain readable. Deploy volume
runs **37–185 per day**.

### 2. App fees are on chain, at a flat rate

`t3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH` is the app payment address — 4,777 pages
of history. Sampling 30 pages:

```
300 payments across 3.0 days (heights 2,937,838 .. 2,946,350)
distinct amounts: 1
        9.0 FLUX  x300
total: 2,700 FLUX
```

Every payment is **exactly 9.0 FLUX**, across a 2-instance Valheim and a
100-instance SoftEther VPN alike. It is a flat message fee, not a
resource-scaled hosting cost. Roughly 100/day against 37–185 deploys/day.

**What this does and does not license.** Because the fee is flat, "this
deployment cost 9 FLUX" is simply true and needs no attribution. What is *not*
possible is saying "*this* txid paid for *that* app": amounts are identical and
deployments cluster around payments — three consecutive deployments sat 0, 5
and 23 blocks after the same payment. So the screen reports the **rate** and
the **aggregate**, and never points a specific transaction at a specific app.

This is the opposite direction from #270, which starts from a donor's outgoing
transaction and asks whether it was an app payment. That remains unanswerable
without the v9 memo. Starting from a known deployment is a different and easier
question, and nothing here weakens #270's reasoning.

**The rate is derived, never hardcoded.** If Flux changes the fee, a hardcoded
9 becomes quietly wrong on every row. The scanner records observed payment
amounts and the UI reports what was actually paid.

### 3. The explorer link needs the block hash, which the scanner already has

`https://explorer.runonflux.io/block/2946401` returns **404** — the path takes a
hash, not a height. Verified:

```
404  https://explorer.runonflux.io/block/2946401
200  https://explorer.runonflux.io/api/block-index/2946401
200  https://explorer.app.runonflux.io/api/block-index/2946401
```

`resolve_block_hash` already resolves the hash while scanning each block and
discards it. Persisting it costs zero extra requests — the same shape as
finding 1.

Both hosts #347 names are already `EXPLORER_HOSTS` in `client/src/explorer.js`,
with health tracking and benching, so a link can target the currently-healthy
host. That directly answers "sometimes the explorer looses block synch".

**Trap:** `explorerUrl()` exists but each host entry ends in `/api`, so it
yields `…/api/block/<hash>` — the API path, not the UI page. The link helper
must strip it, or every block link ships broken.

## Design

```
┌────────────────────────────────────────────────────────────────────────────┐
│ COVERAGE  8 days · 23,040 blocks     (catching up: "207 of 2,880 today")   │
│ Utility 8 │ Empty 199 │ Transfers 12 │ Deploys 80 │ Moved 1,204 ⚡ │ Fees 720 ⚡ │
├────────────────────────────────────────────────────────────────────────────┤
│ ▁▃▂▅▇▃▂▄   eight sparkline bars; click a day to filter everything below     │
├───────────────────────────────────────────┬────────────────────────────────┤
│ APP DEPLOYMENTS                  80    ⌕  │ P2P TRANSFERS          12   ⌕  │
│ name  cat  owner  inst  repo  res  fee  # │ #  txid  from → to  amount  $  │
│ … fills the height, no nested scrollbar   │ …                              │
└───────────────────────────────────────────┴────────────────────────────────┘
```

Four changes carry the work:

1. **Detail becomes the page.** Two always-open panels filling the height
   currently wasted, each with search and sort, following the `DonationList`
   pattern in `home/HomeOverview/index.jsx` that already proved out.
2. **The chart shrinks to a sparkline strip.** Eight small bars carry a trend
   better than one 400px rectangle, and the strip doubles as the day filter.
3. **Coverage is stated honestly.** The band reports blocks actually scanned,
   so the headline stops implying a full day it has not read.
4. **Empty states stop costing a panel.** Flux team transactions collapses to a
   line in the band unless there is something to show.

Split 60/40: deployments needs ~1,020px of columns, transfers ~560px.

### Layout under constraint

- **Narrow (< 1100px):** the two panels stack, deployments first.
- **Enterprise apps (27%):** name, owner and instances render normally; the
  resources cell shows an "enterprise" badge rather than blank or `0`, which
  would read as "this app uses nothing".
- **Records predating the new fields:** render as plain text, not a broken
  link, and refill as the scanner moves on.

### Known limitation, to be stated in the UI

`globalappsspecifications` lists only **current** specs. An app updated since
its original deploy reports its *update* height, so historical attribution
decays toward the present. The panel says so rather than implying the older end
of the window is complete.

## Backend changes

`api/src/services/chain_activity.rs`:

- Widen `AppSpec` to `{ name, owner, instances, expire, height, enterprise, compose[] }`.
- Add `deployments: Vec<DeploymentRecord>` to `UtilityBlockRecord`.
- Add `hash: Option<String>` to `UtilityBlockRecord`, from the existing `resolve_block_hash`.
- Scan the app payment address; expose observed fee amounts.

**`#[serde(default)] on every new field is load-bearing, not decoration.**
The file is already on disk in every running deployment without these fields. A
missing-field error fails the whole read, discards the retained window and
triggers a ~23,040-block rescan on upgrade. This exact hazard is already
documented twice in that file (`deployment_count`, `transfers`) and once for
`Checkpoint::utility_backfill_done`.

`MAX_STORED_TRANSFERS = 25` already caps per-block transfers; deployments need
the same cap for the same reason.

## Testing

- Rust: `docker build --target build` (no local cargo on this machine).
- Pure modules first, TDD, per the existing `chainActivity.test.js` /
  `drilldownState.test.js` split.
- The serde-default guarantee gets an explicit test: a record serialized
  *without* the new fields must still deserialize, because the failure mode is
  a silent 23,040-block rescan rather than an error anyone would see.
- The `/api`-stripping block-link helper gets a test, because a wrong URL here
  is invisible until clicked.

## Out of scope

- **Scanner coverage / rate limiting** — the reason the screen looks emptiest.
  Its own issue, as agreed. The design must be honest while catching up, which
  is what change 3 above is for.
- **#270** — unchanged and still blocked on the v9 memo.
- **Donor tab trio (#342, #343, #344)** — a separate wave. Folding Donor tab
  fixes into a Chain Activity redesign would make both unreviewable.
