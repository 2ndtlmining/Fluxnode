# Premium Features Plan — Donor Gate + Analytics

> Status: **Part B is a testing-only skeleton (PR #165) — real donor verification not
> built. Part C/D below are SCOPED, NOT BUILT.** Written 2026-09-04, revised 2026-09-05
> with the Analytics tabbed IA and a session-by-session build order. Do not treat any
> file path below as already present unless a "Built" note says otherwise.
>
> This is a separate document from `CODE_IMPROVEMENT_PLAN.md` (retired, see PR #168) —
> don't resurrect that association.

## Goal

Gate `/live` and a future `/analytics` page behind a "donor" check: a user supplies a
FLUX wallet address, and the app checks — against public chain data only, no backend
accounts — whether that wallet has sent at least a threshold amount of FLUX to the
project's own donation address within the trailing 365 days. The **core Nodes screen
stays free for everyone**, donor or not; only `/live` and `/analytics` are gated.

Architecture decisions locked in so far:
- **Expiry model**: precise rolling window, computed fresh from chain data each check.
- **Verification location**: client-side, extending the existing `fetch_total_donations`
  pattern. No new backend for the donor check itself.
- **Threshold**: 10 FLUX sent within the trailing 365 days, as a tunable config constant.
- **Home-vs-VPS detection**: deferred, using ipinfo.io, not blocking the rest of Analytics.
- **"Last/next payment" on the Donor tab** means node reward payout timing (extending
  the existing `PayoutTimer` prediction), not donor-status renewal — confirmed 2026-09-05.
- **Flux team address for Chain Activity**: `t1gjUUxBpBeVC1sWwAFrtSsVCbSaFdZx8UY`
  ("Flux team primary"), sourced from `Fluxtracker_supabase`'s own
  `FLUX_TEAM_ADDRESSES` (`src/lib/config.js`) at the user's direction — that repo's
  donation address matches Fluxnode's current one, corroborating it's genuinely curated
  data, not a guess. It's a small, extensible array (currently one entry) — same
  pattern to follow here if more team addresses surface later.
- **FLUX-to-exchange tracking has no data source anywhere** (checked CoinCarp's
  exchange-wallet listing — empty; checked both Fluxtracker repos — nothing).
  Stays deferred/optional until real deposit addresses are supplied; not blocking
  anything else in Chain Activity.

---

## Build order (session-by-session)

Realistic dependency order, not just a priority list — each session should leave
something demoable. Update the checkboxes as sessions land.

- [ ] **Session 1 — finish Part B for real.** The Donor tab (Session 4) needs an actual
  wallet value, and today `DonorContext.donorWallet` is hardcoded `null` with a no-op
  setter (PR #165 only wired the `PREMIUM_TESTING_MODE` bypass, not real verification).
  Build `donorStatus.js`, `DonorUnlockDialog`, `DonorBadge` per Part B below. This also
  means `/live` and the future `/analytics` become genuinely donor-gated for real
  visitors, not just testing-flag-gated.
- [ ] **Session 2 — Analytics page shell + Apps tab.** Route, tab navigation component,
  locked-state reuse from `/live`. Apps tab first because it needs zero new data
  sourcing — pure aggregation over data already fetched elsewhere in the app. Establishes
  the page/tab/panel pattern the other three tabs follow.
- [ ] **Session 3 — Network tab.** Continent rollup (new aggregation) + world map (new
  component, reusing already-written-but-unwired projector code). No backend.
- [ ] **Session 4 — Donor tab.** Depends on Session 1 (real `donorWallet`). Reuses
  `PayoutTimer`'s prediction logic, the wallet's existing node-list fetch, and
  per-node running-apps data. No backend.
- [ ] **Session 5+ — Chain Activity tab.** Biggest lift: needs a new backend batch-scan
  service (can't scan days of blocks client-side per visitor). Build the utility/empty
  block ratio first (fully self-contained, no external address dependency), then
  team-transaction tracking (address now confirmed), leave exchange-flow deferred.

Sessions 2-4 don't depend on each other and could reorder if priorities shift; Session 1
blocking Session 4 and Session 5 being backend-heavy are the two real constraints.

---

## Part B — Donor-gated Premium unlock

**Status: skeleton only.** `DonorContext`, `PremiumGate`, and the `PREMIUM_TESTING_MODE`
Docker/local testing toggle are built (PR #165) — see that PR for what exists. Everything
below this line is still to build (Session 1).

### Mechanism

**`client/src/donor/config.js`** — extend the existing file with:
```js
export const DONOR_THRESHOLD_FLUX = 10;
export const DONOR_WINDOW_DAYS = 365;
export const DONOR_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches fluxinfo.js's cache TTL
```

**`client/src/donor/donorStatus.js`** (new) — `fetch_donor_status(walletAddress)`:

1. Page through `https://explorer.runonflux.io/api/txs?address=${ADDRESS_FLUX}` — the
   same endpoint `fetch_total_donations` already uses (`apidata.js:191-228`), but **stop
   paginating once transactions age past the 365-day window**, an improvement over that
   function's current unbounded pagination.
   **Before building: verify the Insight API actually returns pages newest-first** — the
   early-stop optimization depends on that ordering assumption and it hasn't been
   confirmed against a live response yet.
2. Unlike `fetch_total_donations` (which only counts matching tx *occurrences*), **sum
   the real `vout.value` paid to `ADDRESS_FLUX`** for every transaction where
   `tx.vin.some(v => v.addr === walletAddress)`.
3. Build a list of `{ date, amount }` donation records inside the window;
   `totalInWindow = sum(amount)`.
4. If `totalInWindow >= DONOR_THRESHOLD_FLUX`: compute the exact expiry by walking the
   records oldest-first, subtracting each one's amount from a running total as it
   crosses its own 365-day-old mark, until the running total would first drop below the
   threshold — that date is `expiresAt`.
5. Return `{ isDonor, totalInWindow, expiresAt, daysLeft }`, cached in `localStorage`
   under a versioned key, TTL from config.

### Wire the real wallet into DonorContext

`DonorContext.setDonorWallet` and `refreshDonorStatus` are currently no-ops (PR #165).
Wire them to actually call `fetch_donor_status` and update `isUnlocked` from the real
result (still OR'd with `isPremiumTestingUnlocked()`, so the testing flag keeps working
as an override, not a replacement).

### UI pieces

1. **Unlock dialog** — `client/src/donor/DonorUnlockDialog/index.jsx` (new). Needs a
   real Blueprint `Dialog` — a dependency already, but **never used anywhere in this
   codebase today** (the closest existing surface, `Popover2`, is used for menus/
   dropdowns, not a submit-and-wait form flow). Reuses `validateAddress`
   (`apidata.js:902`) for the input field, calls `fetch_donor_status`, and shows
   checking/success/failure states — failure links out to the donation address using
   the same copy-chip UI as `Footer`'s existing `DonateChip`.

   **Deferred, not in this build**: a second optional field for a Discord webhook URL,
   so premium features could later push pings (new-block/deploy alerts) to the user's
   own server. Flagged by the user as a future idea only.

2. **Locked nav buttons** — grey out `/live`/`/analytics` in `Navbar` when
   `!isUnlocked`, reusing the Gamification locked-card pattern (already how PR #165
   styled the `/live` nav entry — extend the same treatment to `/analytics`). Clicking a
   locked entry opens the unlock dialog instead of navigating.

3. **Route guard** — `PremiumGate` already does this (PR #165); wrap `/analytics` with
   it the same way `/live` is wrapped.

4. **Donor badge** — there's a real precedent: `Home.jsx:389-420` shows a gold `FaMedal`
   + `Tooltip2` badge reading "Total donations: N". Reuse/extend that shape as
   `client/src/donor/DonorBadge/index.jsx`, tooltip text "Donor active — N days left",
   surfaced on **both** Home and the Nodes screen (`main/MainApp.jsx`). The Nodes screen
   also needs to read the active wallet from `DonorContext` (not only its own URL param)
   so a wallet already unlocked elsewhere is recognized there too.

### Test scripts

- `donor/donorStatus.test.js` — pure-function tests of the windowing/expiry algorithm
  against hand-built `{date, amount}` fixtures: below threshold, exactly at threshold,
  one old donation about to age out, several staggered donations, empty history.
- A second fetch/parse-layer test (mocked `fetch`) for the pagination-stop-early and
  vout-sum logic, using a realistic constructed fixture (same convention as
  `realCoinbaseTx()` / `realTransparentTx()` in `live/apidata.test.js`).
- Manual positive-case checklist: pick any real address that has actually sent ≥10 FLUX
  to `ADDRESS_FLUX` in the last year (discoverable via the existing
  `fetch_total_donations` data on the Home page) as a live known-good test wallet.

### Known limitations

- Client-side-only unlock state can be bypassed via devtools — accepted tradeoff for a
  soft supporter perk with no accounts system.
- Early-stop pagination assumes newest-first tx ordering from the explorer API — verify
  before relying on it.
- Cap total pages fetched per check, for wallets with unusually long donation histories.

**Files to add**: `donor/donorStatus.js` (+`.test.js`),
`donor/DonorUnlockDialog/index.jsx` (+`.scss`), `donor/DonorBadge/index.jsx`.
**Files to modify**: `donor/config.js` (add threshold/window/TTL constants),
`contexts/DonorContext.jsx` (wire real verification), `components/Navbar/index.jsx`
(extend lock treatment to `/analytics`), `home/Home.jsx` (badge), `main/MainApp.jsx`
(badge + read shared wallet).

---

## Part C — Analytics page

Gated by `DonorContext.isUnlocked`, same as `/live`. Four tabs: **Network**, **Apps**,
**Chain Activity** (Part D below — big enough to warrant its own section), **Donor**.

### Page shell (Session 2)

- New route `client/src/analytics/Analytics.jsx` (+`.scss`), nav entry with the same
  locked-state treatment as `/live`.
- A tab strip component (no existing tab pattern in this codebase to reuse — Blueprint's
  `Tabs` component is available as a dependency, not currently used anywhere; use it
  rather than hand-rolling, for keyboard/accessibility behavior for free).
- Each tab is its own component/directory (`analytics/NetworkTab/`, `analytics/AppsTab/`,
  `analytics/ChainActivityTab/`, `analytics/DonorTab/`) mounted lazily — no reason to
  fetch Chain Activity's backend rollup while someone's looking at the Apps tab.

### Apps tab (Session 2)

Uses only data already fetched elsewhere in the app — no new sourcing.

- **Migrate from Home**: the App Ecosystem panel's expandable per-category drill-down,
  and Top Hosted Apps. Home keeps a slim category summary only.
- **Top owners** — ambiguous phrase from the original ask, worth building both readings
  since the data for both already exists: **supply-side** (node operators running the
  most nodes/collateral — extend `countryDominance`'s `payment_address` grouping,
  `apidata.js:1186`, to a network-wide, non-country-scoped version) and **demand-side**
  (app owners deploying the most resource-heavy apps — `spec.owner` and
  instance/resource counts are already fetched in global app specs, just never grouped
  by owner). New: `client/src/analytics/topOwners.js` (+test).
- **Flux-team-sponsored %** — the team's *app-owner* ZelID (`196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH`,
  ~51% of network instances, e.g. FoldingAtHome — **note this is a different identity
  than the transparent payment address used for Chain Activity's team-transaction
  tracking**; do not conflate the two, and do not confuse either with Girder Works/Beldex,
  the largest *third-party* operator). Compute `teamInstances / totalInstances` from the
  same owner-aggregation above. New: `client/src/analytics/teamSponsored.js` (+test).

### Network tab (Session 3)

- **Continent/country centralization risk** — country-level data already exists
  (`fetch_country_node_counts`, `apidata.js:1407`), but there's **no continent-level
  rollup today** even though `continent` is already fetched and simply never grouped.
  New: `client/src/analytics/continentDistribution.js` (+test).
- **World map** — `client/src/live/countryCentroids.js` (country→lat/lon centroids +
  an equirectangular `projectToPercent()` projector) **already exists and is completely
  unwired** — nothing imports it. Promote it to a shared location (e.g.
  `client/src/geo/countryCentroids.js`, since it'll now serve two features) and build
  `client/src/analytics/WorldMap/index.jsx` on top of it: country-sized dots/bubbles over
  a static world-outline SVG asset. Avoids pulling in a full mapping library
  (`react-simple-maps` + topojson) — none exists in this codebase today. Fallback to
  `react-simple-maps` if the hand-rolled version doesn't clear the polish bar in review.

### Donor tab (Session 4)

Personal analytics for `DonorContext.donorWallet` — requires Session 1 to be a real
wallet, not the current hardcoded `null`.

- **Last/next payment** — node reward payout, confirmed 2026-09-05. Extend
  `main/PayoutTimer/index.jsx`'s existing prediction logic (already built for a wallet's
  own nodes) rather than rebuilding it; the Donor tab's version needs both the most
  recent actual payout and the predicted next one, where `PayoutTimer` today likely only
  surfaces the next one — check its current output shape before assuming a pure reuse.
- **His nodes** — reuse the wallet's existing node-list fetch (same one `/nodes` uses).
- **Apps hosted on his nodes, by category** — deliberately scoped to apps *physically
  running on his hardware*, not apps he *owns*. A Flux payment address (`t1`/`t3`,
  what `donorWallet` is) and an app-owner ZelID (starts with `1`) are different identity
  spaces in this app with no existing link between them — "apps he owns" isn't
  derivable from the wallet address alone, and building that link is out of scope here.
  Source: per-node running-apps data (`fluxinfo.js`'s `apps.runningapps` projection,
  already keyed by node `ip`) matched against his nodes' IPs, categorized via the
  existing `main/Gamification/appCategories.js`.
- **Node utilization** — an aggregate rollup across his nodes (CPU/RAM/SSD), plus a
  comparison against the network average (already computed for `NetworkResourcesPanel`
  on Home) — the value-add over the existing per-node detail table on `/nodes` is the
  summary + comparison, not a duplicate of that table.

**Files to add (Sessions 2-4)**: `analytics/Analytics.jsx` (+`.scss`),
`analytics/NetworkTab/`, `analytics/AppsTab/`, `analytics/DonorTab/`,
`analytics/WorldMap/index.jsx` (+`.scss`), `analytics/continentDistribution.js` (+test),
`analytics/topOwners.js` (+test), `analytics/teamSponsored.js` (+test), promoted
`geo/countryCentroids.js`.

### Charting library — decide before Session 3

No charting library exists in this codebase today (Home's bars are hand-rolled
CSS/divs). Recommended: **Recharts** (composable, SVG-based, tree-shakeable, easy to
theme dark). Not yet confirmed with the user — flag this at the start of Session 3
rather than assuming it.

### Polish

Run this page through the `frontend-design` skill as a dedicated pass once the tabs have
real content — this is the premium differentiator, it shouldn't inherit default
component styling. Best done after Session 4, once all three client-only tabs exist to
design consistently across.

---

## Part D — Chain Activity tab

The newest and biggest-lift tab (Session 5+) — analyzes recent block history for
network-utility and fund-flow signals, rather than current-snapshot state like the
other three tabs.

### Utility vs. empty blocks (build first — no external dependency)

"Utility" here reuses the exact same event classification already built for `/live`:
a block is "empty" if its only activity is coinbase rewards and node confirmations, and
has "utility" if it contains at least one P2P transfer or app deployment event —
`extractP2pTransfers` and `diffDeployedForEvents`/deployment-diffing from
`live/apidata.js` already do this classification, just currently applied live over the
5-10 blocks the chain rail shows. This tab needs the same classification run over a much
longer window (e.g. trailing 24h/2880 blocks, or a selectable 24h/7d range).

**This cannot run client-side per visitor** — scanning thousands of blocks each needing
1-2 explorer API calls (per `fetch_block_transactions`/`fetch_block_confirmations`) is
too expensive to repeat for every page load. Needs a backend batch job:

- New Rust service `api/src/services/chain_activity.rs` (matching the existing
  `services/` module pattern), periodically (e.g. hourly) scanning newly-produced
  blocks since its last run, classifying each, and persisting a rolling daily
  utility/empty count — cheap for the frontend to read regardless of how far back the
  window goes, since the scan cost is paid once server-side, not per visitor.
- Needs a small persistence layer the Rust API doesn't have today (everything else is
  fetch-and-cache, not stored state) — likely the simplest viable option is a flat file
  or embedded SQLite the service reads/writes, not a new external database dependency,
  given this API otherwise has none. Confirm this approach before building — it's a
  first for this codebase.

### Flux team transactions (build second — address now confirmed)

Trace transactions where `t1gjUUxBpBeVC1sWwAFrtSsVCbSaFdZx8UY` (or any address later
added to the same array — mirror `FLUX_TEAM_ADDRESSES`'s extensible-list shape from
`Fluxtracker_supabase`) appears as sender or recipient, over the same scanned window.
Runs off the same backend scan as the utility/empty classification — no separate crawl
needed, just an additional per-block check against a known-address set while already
iterating transactions.

### FLUX sent to exchanges — deferred, no data source

No reliable public list of FLUX exchange deposit addresses exists (checked CoinCarp's
exchange-wallet page — empty; checked both Fluxtracker repos — nothing). Leave this
row/metric out of the initial Chain Activity build entirely. If real deposit addresses
are ever sourced (manually curated, confirmed against known exchange withdrawal tests,
etc.), it slots into the same scan as team-transaction tracking — same shape, different
address set. Don't build a "coming soon" placeholder for this; just don't ship the row
until there's real data behind it.

**Files to add**: `api/src/services/chain_activity.rs` + route in `main.rs`,
`analytics/ChainActivityTab/index.jsx` (+`.scss`), `analytics/chainActivity.js`
(client fetch of the backend rollup).

---

## Phase 2 — Home vs VPS/datacenter detection (deferred, unscheduled)

Not yet slotted into the session order above — revisit once Sessions 1-5 land.

Researched 2026-09-04: **ipinfo.io Lite** (free tier) gives unlimited requests with a
free access token, HTTPS, and returns ASN + org name + domain — but **not** a direct
"is this a datacenter" flag (that's a paid Core-plan field). So classification has to be
a **heuristic**: match the returned ASN org name against a maintained list of known
hosting/VPS/cloud providers (Hetzner, OVH, DigitalOcean, Vultr, netcup, Contabo, AWS,
GCP, Azure, Linode, Scaleway, etc.) — same spirit as the `DEDICATED_SITE_MARKERS`/
`CATEGORY_EXCLUDE` keyword-list pattern already used elsewhere in this codebase.
Anything unmatched buckets as "likely residential/other," with that limitation stated
directly in the UI copy.

Because node IPs number in the thousands and need periodic (not per-visitor) refresh,
and to avoid shipping the ipinfo.io token client-side, this needs the same kind of
backend batch job as Chain Activity: a new Rust service
`api/src/services/hosting_classification.rs` that periodically resolves all node IPs via
ipinfo.io, classifies them, and caches the result for the frontend to read cheaply.

`ip-api.com` (already integrated in this codebase for wallet-scoped node geolocation,
`main/Gamification/geolocate.js`) is a possible fallback data source, but its free
tier's 45/min (15/min batch) rate limit and HTTP-only restriction make it a worse fit
for a network-wide sweep — and either provider still requires a server-side job.

**Files to add**: `api/src/services/hosting_classification.rs` + route in `main.rs`,
`analytics/hostingClassification.js`, `analytics/knownHostingProviders.js`.

---

## Data inventory reference

What already exists vs. what's genuinely new, so a future session doesn't re-derive this.

| Need | Status |
|---|---|
| Country-level node counts | Exists — `fetch_country_node_counts`, `apidata.js:1407` |
| Continent-level rollup | **Missing** — `continent` is fetched but never grouped |
| Country→lat/lon centroids + projector | Exists but **unwired** — `live/countryCentroids.js` |
| Node-operator concentration per country | Exists — `countryDominance`, `apidata.js:1186` |
| Network-wide top owners (any kind) | **Missing** — raw fields (`spec.owner`, instances) already fetched, never aggregated |
| Flux-team app-owner ZelID | Known — `196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH` |
| Flux-team transparent payment address | Known — `t1gjUUxBpBeVC1sWwAFrtSsVCbSaFdZx8UY` (from `Fluxtracker_supabase`) — **different identity space from the ZelID above, don't conflate** |
| FLUX exchange deposit addresses | **Missing entirely, no public source found** |
| Per-node running-apps data | Exists — `fluxinfo.js`, keyed by node `ip` |
| Node payout prediction | Exists — `main/PayoutTimer/index.jsx`, needs checking for last-payout (not just next) support |
| ASN/ISP/hosting-provider data | **Missing** entirely, front and back end — needs ipinfo.io |
| Charting library | **None installed** — Recharts recommended, not confirmed |
| Mapping library | **None installed** — hand-rolled projector preferred over adding one |
| Tab UI pattern | **None used yet** — Blueprint `Tabs` is a dependency, unused |
| Backend persistence (beyond fetch-and-cache) | **None exists** — Chain Activity is the first thing that needs it |
| Modal/Dialog component in active use | **None** — Blueprint `Dialog` is a dependency but unused |
| Global/shared wallet state across pages | Partial — `DonorContext` exists (PR #165) but `donorWallet` is hardcoded `null`, no real setter wired yet |

Also checked the sibling `Fluxtracker` / `Fluxtracker_supabase` repos: they track a
single address's revenue/cloud usage, not network-wide analytics. Nothing there covers
geo distribution, owner ranking, or ASN/hosting detection — genuinely new work here. What
they *do* have and this plan now uses: `FLUX_TEAM_ADDRESSES` (Chain Activity) and the
`CATEGORY_EXCLUDE` defensive pattern, already replicated in Fluxnode's own
`appCategories.js` via `DEDICATED_SITE_MARKERS`.
