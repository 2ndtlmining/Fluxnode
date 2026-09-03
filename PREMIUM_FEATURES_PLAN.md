# Premium Features Plan — Donor Gate + Analytics

> Status: **SCOPED, NOT BUILT**. Written 2026-09-04. This is a build spec for a future
> session — nothing described here exists in the codebase yet. Do not treat any file
> path below as already present; "new" means new.
>
> This is a separate document from `CODE_IMPROVEMENT_PLAN.md`, which predates this work
> and belongs to a different, unrelated effort — don't merge the two.

## Goal

Gate `/live` and a future `/analytics` page behind a "donor" check: a user supplies a
FLUX wallet address, and the app checks — against public chain data only, no backend
accounts — whether that wallet has sent at least a threshold amount of FLUX to the
project's own donation address within the trailing 365 days. The **core Nodes screen
stays free for everyone**, donor or not; only `/live` and `/analytics` are gated.

Four architecture decisions are already locked in (confirmed with the user 2026-09-04):
- **Expiry model**: precise rolling window, computed fresh from chain data each check —
  not a flat stored expiry date.
- **Verification location**: client-side, extending the existing
  `fetch_total_donations` pattern. No new backend for the donor check itself.
- **Threshold**: 10 FLUX sent within the trailing 365 days, as a tunable config
  constant — not hardcoded inline anywhere.
- **Home-vs-VPS detection** (one specific Analytics idea): deferred to an explicit
  Phase 2, using ipinfo.io, not blocking the rest of Analytics.

---

## Part B — Donor-gated Premium unlock

### Mechanism

**`client/src/donor/config.js`** (new):
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
   threshold — that date is `expiresAt`. This is what makes the "time left" badge always
   chain-accurate with nothing separately stored to desync.
5. Return `{ isDonor, totalInWindow, expiresAt, daysLeft }`, cached in `localStorage`
   (not sessionStorage — this needs to survive tab closes, unlike the shared
   network-wide caches) under a versioned key, TTL from config.

### Shared state across pages

Today there is **no global wallet store** in this app — Home and Nodes each own
independent address state, sharing only one-way via a `?wallet=` URL param
(`Home.jsx` → `/nodes?wallet=...`), and `/live` has no wallet awareness at all. Add:

- **`client/src/contexts/DonorContext.jsx`** (new) — mounted in `Application.jsx`
  alongside the existing `LayoutContext`. Holds
  `{ donorWallet, donorStatus, setDonorWallet, refreshDonorStatus, isUnlocked }`.
  Persists `donorWallet` so unlock survives navigation/reload; on mount, if a stored
  wallet exists, auto-restores/re-verifies (respecting the cache TTL) without asking
  the user again.

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
   own server. Flagged by the user as a future idea only — needs its own scoping pass
   (validation, storage, what actually triggers a ping, abuse/rate-limiting) before any
   of it is designed, let alone built.

2. **Locked nav buttons** — grey out `/live`/`/analytics` in `Navbar` when
   `!isUnlocked`, reusing the exact locked-card pattern already built for Gamification
   achievements: `main/Gamification/index.jsx`'s `AchievementCard` component and
   `main/Gamification/index.scss:131-135`
   (`opacity: 0.42; filter: grayscale(1)` + a `Tooltip2` explaining why). Clicking a
   locked entry opens the unlock dialog instead of navigating.

3. **Route guard** — `/live` (and later `/analytics`) check `isUnlocked` and render a
   locked explainer in place of real content. Needed independently of the nav-click
   gating, since a direct URL/bookmark visit skips the nav entirely.

4. **Donor badge** — there's already a real precedent for this exact thing:
   `Home.jsx:389-420` shows a gold `FaMedal` + `Tooltip2` badge reading
   "Total donations: N". Reuse/extend that shape as `client/src/donor/DonorBadge/index.jsx`,
   tooltip text "Donor active — N days left", surfaced on **both** Home and the Nodes
   screen (`main/MainApp.jsx`). The Nodes screen also needs to read the active wallet
   from `DonorContext` (not only its own URL param) so a wallet already unlocked
   elsewhere is recognized there too.

### Test scripts

- `donor/donorStatus.test.js` — pure-function tests of the windowing/expiry algorithm
  against hand-built `{date, amount}` fixtures: below threshold, exactly at threshold,
  one old donation about to age out, several staggered donations, empty history. No
  network mocking needed — same style as `live/apidata.test.js`'s pure-function tests.
- A second fetch/parse-layer test (mocked `fetch`) for the pagination-stop-early and
  vout-sum logic, using a realistic captured/constructed fixture (same convention as
  `realCoinbaseTx()` in `live/apidata.test.js` and `realTransparentTx()` added
  2026-09-04 for the P2P extraction test).
- Manual positive-case checklist: pick any real address that has actually sent ≥10 FLUX
  to `ADDRESS_FLUX` in the last year (discoverable via the existing
  `fetch_total_donations` data on the Home page) as a live known-good test wallet.

### Known limitations — carry these into the UI/docs, don't hide them

- Client-side-only unlock state can be bypassed via devtools (editing localStorage
  directly). Accepted tradeoff for a soft supporter perk with no accounts system — not
  a security boundary, and shouldn't be presented as one.
- Early-stop pagination assumes newest-first tx ordering from the explorer API — verify
  before relying on it.
- Cap total pages fetched per check, for wallets with unusually long donation histories.

**Files to add**: `donor/config.js`, `donor/donorStatus.js` (+`.test.js`),
`donor/DonorUnlockDialog/index.jsx` (+`.scss`), `donor/DonorBadge/index.jsx`,
`contexts/DonorContext.jsx`.
**Files to modify**: `Application.jsx` (mount provider), `components/Navbar/index.jsx`
(+scss, locked state), `live/Live.jsx` (route guard), `home/Home.jsx` (badge),
`main/MainApp.jsx` (badge + read shared wallet).

---

## Part C — Analytics page

Gated by the same `DonorContext.isUnlocked`. Split into two phases.

### Phase 1 — foundation, using only data that already exists

- New route `client/src/analytics/Analytics.jsx` (+`.scss`), nav entry with the same
  locked-state treatment as `/live`.
- **Migrate from Home**: the App Ecosystem panel's expandable per-category drill-down,
  Top Hosted Apps, the Top Dogs leaderboard, and Node Distribution (superseded by the
  world map below). **Flux Network and Network Resources stay on Home for everyone,
  unchanged** — core "at a glance" health stats remain free.
- **Continent/country centralization risk (2.1)** — country-level data already exists
  (`fetch_country_node_counts`, `countryDominance` in `apidata.js`), but there's **no
  continent-level rollup today**, even though `continent` is already fetched and simply
  never grouped. New: `client/src/analytics/continentDistribution.js` (+test), a pure
  aggregation over data already in hand.
- **World map (2.6)** — `client/src/live/countryCentroids.js` (country→lat/lon
  centroids + an equirectangular `projectToPercent()` projector) **already exists in
  the codebase today and is completely unwired** — nothing imports it. Promote it to a
  shared location (e.g. `client/src/geo/countryCentroids.js`, since it'll now serve two
  features) and build `client/src/analytics/WorldMap/index.jsx` on top of it:
  country-sized dots/bubbles over a static world-outline SVG asset. This avoids pulling
  in a full mapping library (`react-simple-maps` + topojson) — no mapping library
  exists in this codebase today — while directly reusing code someone already wrote for
  exactly this purpose. If the hand-rolled version doesn't clear the "really good
  polish" bar in review, `react-simple-maps` is the fallback.
- **Top compute renters (2.2)** — ambiguous phrase, worth building both readings since
  the data for both already exists: **supply-side** (node operators running the most
  nodes/collateral — extend `countryDominance`'s `payment_address` grouping to a
  network-wide, non-country-scoped version) and **demand-side** (app owners deploying
  the most resource-heavy apps — `spec.owner` and instance/resource counts are already
  fetched in global app specs, just never grouped by owner). New:
  `client/src/analytics/topOwners.js` (+test).
- **Flux-team-sponsored % (2.3)** — the team's own ZelID is already identified in
  project memory: `196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH`, ~51% of network instances (e.g.
  FoldingAtHome). **Do not confuse with Girder Works/Beldex** — that's the largest
  *third-party* operator, not the team. Compute `teamInstances / totalInstances` from
  the same owner-aggregation as above, flagging that row distinctly in the top-owners
  table. New: `client/src/analytics/teamSponsored.js` (+test). This is a single
  hardcoded address to keep maintained, not a discovered list — note that plainly.
- **Charting library** — none exists in this codebase today (Home's bars are hand-rolled
  CSS/divs, confirmed via `package.json`). Recommended: **Recharts** (composable,
  SVG-based, tree-shakeable, easy to theme dark) — confirm with the user before Phase 1
  build starts, this spec doesn't lock it in.
- **Polish (2.5)** — when this is actually built, run it through the `frontend-design`
  skill as a dedicated pass. This is the premium differentiator page; it shouldn't
  inherit default component styling.

### Phase 2 — Home vs VPS/datacenter detection (2.4), via ipinfo.io

Researched 2026-09-04: **ipinfo.io Lite** (free tier) gives unlimited requests with a
free access token, HTTPS, and returns ASN + org name + domain — but **not** a direct
"is this a datacenter" flag (that's a paid Core-plan field). So classification has to be
a **heuristic**: match the returned ASN org name against a maintained list of known
hosting/VPS/cloud providers (Hetzner, OVH, DigitalOcean, Vultr, netcup, Contabo, AWS,
GCP, Azure, Linode, Scaleway, etc.) — same spirit as the `DEDICATED_SITE_MARKERS`/
`CATEGORY_EXCLUDE` keyword-list pattern already used elsewhere in this codebase.
Anything unmatched buckets as "likely residential/other," with that limitation stated
directly in the UI copy — this will never be perfectly accurate, and shouldn't claim to be.

Because node IPs number in the thousands and need periodic (not per-visitor) refresh,
and to avoid shipping the ipinfo.io token client-side, this is **the one piece of
Analytics that needs backend work**: a new Rust service
`api/src/services/hosting_classification.rs` (matching the existing `services/` module
pattern) that periodically resolves all node IPs via ipinfo.io, classifies them, and
caches the result for the frontend to read cheaply.

`ip-api.com` (already integrated in this codebase for wallet-scoped node geolocation,
`main/Gamification/geolocate.js`) is a possible fallback data source, but its free
tier's 45/min (15/min batch) rate limit and HTTP-only restriction make it a worse fit
for a network-wide sweep — and either provider still requires a server-side job, since
neither can be called directly from a browser for a sweep this size without CORS/
mixed-content problems.

**Files to add (Phase 1)**: `analytics/Analytics.jsx` (+`.scss`),
`analytics/WorldMap/index.jsx` (+`.scss`), `analytics/continentDistribution.js`
(+test), `analytics/topOwners.js` (+test), `analytics/teamSponsored.js` (+test),
promoted `geo/countryCentroids.js`.
**Files to add (Phase 2)**: `api/src/services/hosting_classification.rs` + route in
`main.rs`, `analytics/hostingClassification.js`, `analytics/knownHostingProviders.js`.

---

## Data inventory reference (from the 2026-09-04 research pass)

What already exists vs. what's genuinely new, so a future session doesn't re-derive this:

| Need | Status |
|---|---|
| Country-level node counts | Exists — `fetch_country_node_counts`, `apidata.js:1407` |
| Continent-level rollup | **Missing** — `continent` is fetched but never grouped |
| Country→lat/lon centroids + projector | Exists but **unwired** — `live/countryCentroids.js` |
| Node-operator concentration per country | Exists — `countryDominance`, `apidata.js:1186` |
| Network-wide top owners (any kind) | **Missing** — raw fields (`spec.owner`, instances) already fetched, never aggregated |
| Flux-team ZelID recognition | **Missing** anywhere in the codebase |
| ASN/ISP/hosting-provider data | **Missing** entirely, front and back end — needs a new external API |
| Charting library | **None installed** |
| Mapping library | **None installed** |
| Modal/Dialog component in active use | **None** — Blueprint `Dialog` is a dependency but unused |
| Global/shared wallet state across pages | **None** — currently per-page + one-way URL param |

Also checked the sibling `Fluxtracker` / `Fluxtracker_supabase` repos (2026-09-04): they
track a single address's revenue/cloud usage, not network-wide analytics. Nothing there
covers geo distribution, owner ranking, team-sponsored %, or ASN/hosting detection
either — this would all be genuinely new work, not portable from Fluxtracker. The one
reusable thing found there is a defensive pattern (`CATEGORY_EXCLUDE` for
`-server-website`/`flux-dns-fdm` false positives), which Fluxnode's own
`appCategories.js` already replicates via `DEDICATED_SITE_MARKERS`.
