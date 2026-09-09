# Accuracy & Reliability Fixes — Design Spec

**Date:** 2026-09-09
**Status:** Approved for implementation

## Overview

Three independent fixes, bundled as one piece of work because they were all
surfaced by the same investigation (a user report about Home page data
accuracy, followed by live-data verification):

- **Part A** — Top Hosted Apps silently excludes ~23% of the network
  (Enterprise apps) from its ranking with no indication anything is missing.
- **Part B** — GitHub issue #189: an unguarded fetch anywhere in
  `fetch_global_stats`'s `Promise.all` zeros out the entire Home page on a
  single rate-limited/failed endpoint.
- **Part C** — GitHub issue #153: sessionStorage sits at ~85% of quota on a
  normal load; cache writes fail silently past that point. The single
  biggest contributor (`globalPerfRankings_v3`, 2.9MB) is deeply coupled to
  the Gamification achievements system and needs an actual redesign, not a
  trim — covered in detail below since it's the architecturally significant
  part of this spec.

All three are changes to code that already exists in this repo (`client/src/`
only). No new subsystems, no new external dependencies, no changes to the
Rust API.

## Part A — Top Hosted Apps: distinguish Enterprise from genuinely Unknown

### Current behavior

`runningAppsCategorized.js`'s `categorizeRunningApps` builds `topRunningApps`
by resolving each running container's repotag via `repotagForComponent` and
skipping (`if (!repotag) continue`) any container whose spec can't produce
one. Live-measured: **1,708 of 7,257 containers (23.5%)** are skipped this
way — **1,695 (23.4%)** because the app's spec is Enterprise (compose
encrypted, no repotag by design) and **13 (0.2%)** because no spec could be
found for that app name at all (expired/renamed between the two independent
fetches). Both classes of container still count correctly everywhere else
(`totalRunningApps`, the "Enterprise" category bucket in `runningCategoryMap`)
— they only vanish from this one ranked list, with nothing telling the
viewer that ~23% of the network isn't represented.

### Fix

`categorizeRunningApps` gains two new fields on its return value, computed
in the same `componentCounts` loop that already builds `repoCounts`/
`topRunningApps` (no new data source, no new fetch):

- `enterpriseContainers` — count of containers whose resolved spec has
  `enterprise` set (and therefore no repotag).
- `unresolvedContainers` — count of containers whose app name has no
  matching spec at all.

`TopHostedApps` renders two small labeled lines below the ranked list, only
when non-zero: something like "1,695 Enterprise apps — image hidden by
design" and "13 unresolved". This is purely additive to the existing
component; the ranked list itself is unchanged.

## Part B — Issue #189: unguarded fetches crash the whole page

### Confirmed root cause

`client/src/apidata.js`'s `fetch_global_stats` runs `fetchCurrency`,
`fetchWallet`, `fetchNode`, `fetchBenchVer`, and `fetchRichList` inside one
`Promise.all` alongside already-guarded fetchers (`fetchDaemonInfo`,
`fetchTotalDeployedApps`, `fetchUniqueWalletAddresses`). None of the five
named functions has a try/catch. Any one of them throwing (a rate limit, a
CORS block, a transient network failure) rejects the whole `Promise.all`,
and every field on `store` — including all the running-apps data most of
this investigation started with — stays at its zero default. Issue #189's
own screenshot shows exactly this: a 429 on `fetchCurrency`'s endpoint,
followed by an uncaught `TypeError: Failed to fetch`, followed by "Top
Hosted Apps: No data available" alongside every other Home stat reading
zero.

### Audit of the rest of the codebase (already verified, not guesswork)

- `client/src/live/apidata.js`'s three fetchers (`fetch_recent_blocks`,
  `fetch_block_transactions`, `fetch_block_confirmations`) are all already
  wrapped in try/catch with safe fallback returns — no change needed.
- `client/src/networkNodes.js`'s shared fetchers (`fetch_node_benchmarks`,
  `fetch_node_resources`, `fetch_node_geolocation`, built from one `_shared`
  factory) already catch and return `[]` on failure — no change needed.
- `client/src/apidata.js`'s `fetch_country_node_counts` and
  `fetch_gpu_prices` are already fully try/catch-wrapped.
- `main/apidata.js` is a two-line re-export shim (see issue #147) — no
  fetch logic of its own.

So the fix is narrowly scoped to the five named functions in
`fetch_global_stats`.

### Fix

Wrap each of the five in try/catch, matching the exact pattern
`fetchDaemonInfo` already uses one function above them in the same file
(`console.log('error', error)` on catch, leave the store field at its
zeroed default). No behavior change on the success path.

## Part C — Issue #153: sessionStorage quota

### Part C.1 — `homeAppSpecsRaw_v1` (~1.5MB): strip unused fields before caching

`buildSpecIndex`/`specResources`/`categorizeAppSpec` and every other
consumer of `rawSpecs` (`AppsSection`, `WorkhorsePanel`, `runningAppsCategorized.js`,
`live/apidata.js`'s deploy-diffing, `analytics/topOwners.js`) collectively
read exactly: `name`, `height`, `expire`, `instances`, `enterprise`,
`owner`, `repotag`, and `compose[].{name,repotag,cpu,ram,hdd}`. Verified via
direct grep of every consumer, not assumed. Every other field on a raw spec
— `contacts`, `description`, `geolocation`, `hash`, `nodes`, `staticip`,
`version` at the top level, and `commands`, `containerData`,
`containerPorts`, `domains`, `environmentParameters`, `ports`, `repoauth`,
`description` on each compose entry — is never read anywhere in
`client/src`.

Fix: `fetch_global_app_specs_raw()` strips each spec down to the used-field
allowlist before writing to `sessionStorage` (the in-memory return value to
callers is unaffected — only what gets cached is trimmed). This preserves
full join-completeness (every app is still present, still keyed by name,
still has its real repotag/category-relevant data) while cutting the
cached payload's per-entry size substantially.

### Part C.2 — loud failure on quota exceeded

Every `sessionStorage.setItem` in `apidata.js` is currently wrapped in a
silent `catch {}`. Add a `console.warn` naming the key and byte size on
failure, matching the acceptance criteria in #153. This is a diagnostic
change only — behavior on success is unchanged, and a failed write still
doesn't crash anything (the app already tolerates cache misses by design).

### Part C.3 — `globalPerfRankings_v3` (2.9MB, the dominant cost): stop pre-sorting the whole network

This is the architecturally significant part of this spec.

#### Current design

`fetch_global_performance_rankings()` computes `nodeData` (one entry per
benchmarked node: `{ip, tier, eps, dws, down_speed, up_speed, geo}`) as an
intermediate step, then explodes it into:

- `tierRankings[tier][metric]` — the **entire tier's** nodes, sorted
  descending by that metric, as `{ip, rank, value}`. 3 tiers × 4 metrics =
  12 full copies of "all nodes in this tier," each carrying only one
  metric's value.
- `countryRankings[cc].tiers[tier].metrics[metric]` — the same thing again,
  bucketed per country instead of network-wide. Same shape, smaller
  per-bucket, but summed across every country it's a comparable amount of
  data, further duplicated.

Every consumer of this structure was read precisely before designing the
fix (all in `client/src/main/Gamification/achievements.js` unless noted):

| Consumer | What it actually needs |
|---|---|
| `_bestRankInTier`, `_worstRankInTier`, `_bestRankInCountry` | For each of the **searched wallet's own nodes**, that one node's `{rank, value}` within its tier (or country+tier) + metric group. Never any other node's rank. |
| `computeTierPerformanceAchievements` (medals), `computeCountryPerformanceAchievements` (medals) | The above, plus the group's total size (`officialNodeCounts` primary source, `metricRankings.length` fallback). |
| `computeTierWorstPerformanceAchievements` ("Potato"/"Tortoise"/"Toaster"), `computeWoodenSpoonAchievements` | The wallet's worst-ranked own node, **and the group's exact total size** — `earned: worstRank >= metricRankings.length` literally checks "is my node dead last," which requires knowing the true total. |
| `computeTryHardAchievements` ("top 5%") | The wallet's best-ranked own node, and `Math.ceil(metricRankings.length * 0.05)` — the true total, since 5% of a 3,000-node tier is ~150, far beyond any small fixed top-N. |
| `apidata.js`'s `_extract_country_counts` (Home's Geo Distribution panel) | `tier.metrics.eps?.length` as a **node count** per country — not ranking data at all. |
| `HomeOverview.jsx`'s `TopDogsPanel` | `rankings?.[m.key]?.[0]` — only the single #1-ranked node per tier+metric. |

No consumer anywhere needs rank/value for a node that isn't one of the
searched wallet's own — and every consumer that needs a "total," needs the
**true** total, not a trimmed approximation. This is why a naive top-N trim
(the originally-proposed fix) is unsafe: "Try Hard" alone can require depth
in the hundreds, and "dead last" / "top 5%" both depend on the exact true
count.

#### New design

Cache `nodeData` itself — the un-duplicated per-node array, already computed
today as an intermediate step — instead of the 12-way-exploded
`tierRankings`/`countryRankings`. Add small precomputed aggregate counts
(`totalInTier: {CUMULUS, NIMBUS, STRATUS}`, `totalInCountryTier: {[cc_tier]: n}`)
since those are needed by every threshold calculation and are cheap
(O(tiers) / O(countries×tiers), not O(nodes)).

New pure module `client/src/main/Gamification/rankInGroup.js`:

```js
/**
 * Rank of one specific node within a group, by one metric — replaces the
 * pre-sorted-array .find() lookup. Computed on demand: cheap because it
 * only ever runs for the handful of nodes a searched wallet owns, never
 * for the whole network.
 *
 * Tie-break MUST match the old pre-sort exactly (Array.sort is stable in
 * this engine, so ties kept their original nodeData order) — rank = 1 +
 * (nodes strictly greater) + (nodes equal AND appearing earlier in
 * nodeData than the target). Getting this wrong flips medal outcomes on
 * tied values, which is exactly the kind of silent behavior change this
 * whole redesign must not introduce.
 *
 * Returns null if the target ip isn't found in groupNodes at all (offline/
 * unbenchmarked node — matches the old code's "entry not found, skip"
 * behavior, which callers already handle).
 */
export function rankInGroup(groupNodes, targetIp, metricKey) {
  const targetIndex = groupNodes.findIndex((n) => n.ip === targetIp);
  if (targetIndex === -1) return null;
  const targetValue = groupNodes[targetIndex][metricKey] || 0;

  let rank = 1;
  for (let i = 0; i < groupNodes.length; i++) {
    if (i === targetIndex) continue;
    const v = groupNodes[i][metricKey] || 0;
    if (v > targetValue) rank++;
    else if (v === targetValue && i < targetIndex) rank++;
  }
  return { rank, value: targetValue, total: groupNodes.length };
}

/** The single highest-value node in a group for one metric (TopDogsPanel's "#1" need). Null for an empty group. */
export function topInGroup(groupNodes, metricKey) {
  if (groupNodes.length === 0) return null;
  return groupNodes.reduce((best, n) =>
    (n[metricKey] || 0) > (best[metricKey] || 0) ? n : best
  );
}
```

`achievements.js`'s `_bestRankInTier`/`_worstRankInTier`/`_bestRankInCountry`
are rewritten to call `rankInGroup` per wallet-owned node instead of
`.find()`-ing a pre-sorted array, filtering `nodeData` to the right group
(`tier`, or `tier`+`countryCode`) first. The 6 dynamic achievement functions'
own logic (medal assignment, percentile math, description strings) is
**unchanged** — only where `{rank, value, total}` comes from changes.
`_extract_country_counts` reads the new precomputed `totalInCountryTier`
aggregate directly instead of `.metrics.eps.length`. `HomeOverview.jsx`'s
`TopDogsPanel` calls `topInGroup` instead of indexing `[0]` on a pre-sorted
array.

Cache key bumps to `globalPerfRankings_v4` (old `_v3` added to the existing
stale-key prune list, matching this repo's established versioning
convention).

#### Testing strategy (this is the part the user explicitly asked to get right)

`achievements.js` has **zero existing test coverage** — this redesign is
the first tests it will ever have. Given that, and given the explicit
requirement not to change any achievement's earned/not-earned outcome or
displayed numbers:

1. **Before touching the implementation**, write characterization tests for
   every one of the 6 dynamic achievement functions plus `_extract_country_counts`,
   against the **current, unmodified** code — hand-constructed fixtures
   covering: a clear win (rank 1), a clear loss (rank far from 1), an exact
   tie between two wallet-relevant nodes (the case most likely to break
   under a tie-break mistake), a node not present in the rankings at all
   (offline/unbenchmarked), and the "dead last"/"top 5%" boundary
   conditions specifically (since those are the ones most sensitive to
   getting the true total right). Run these against the current code,
   confirm they pass — this is the verified ground truth, not an assumption.
2. Implement `rankInGroup`/`topInGroup` with their own dedicated unit tests
   (the tie-break rule above, an empty group, a single-node group, a
   target not present).
3. Migrate `fetch_global_performance_rankings` and `achievements.js` to the
   new design.
4. **The Step 1 characterization tests must still pass, unmodified**,
   against the new implementation. This is the actual proof nothing broke
   — not a new set of tests written to match whatever the new code happens
   to produce, but the same tests written against the old code first.
5. Manual QA: `yarn start` against real data, search a wallet with several
   nodes, open the Gamification tab, compare the actual rendered
   achievements (earned/progress/description text) against what the same
   wallet shows on `main` before this change.

## Global Constraints

- `client/src/` only — no Rust API changes.
- No new npm dependency.
- Test with `cd client && CI=true npx react-scripts test --watchAll=false`,
  build with `npx react-scripts build`. Baseline before this work: 359
  tests, build exit 0, 4 pre-existing baseline warning files (Navbar,
  NodeGridTable, LayoutContext, WalletNodes).
- Part C.3 is the highest-risk piece in this spec (untested code, real
  money-no-object user-facing calculations people's earned achievements
  depend on) — its task(s) must not be compressed or rushed relative to
  the testing strategy above.
