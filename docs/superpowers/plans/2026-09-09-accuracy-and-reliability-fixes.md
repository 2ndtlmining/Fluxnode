# Accuracy & Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three issues surfaced by one investigation: Top Hosted Apps
silently hides ~23% of the network (Enterprise apps) with no indication;
GitHub #189 — one unguarded fetch zeros the entire Home page on a rate
limit; GitHub #153 — sessionStorage sits at ~85% of quota, dominated by a
2.9MB cache (`globalPerfRankings_v3`) that pre-sorts the *entire* network
for every metric/tier/country combination when every real consumer only
ever needs a searched wallet's own handful of nodes ranked against that
data, plus a few small aggregate counts.

**Architecture:** Parts A, B, C.1, C.2 are small, independent, low-risk
changes to existing functions. Part C.3 (Tasks 3-6 below) replaces
`fetch_global_performance_rankings`'s pre-exploded `tierRankings`/
`countryRankings` (12+ duplicated copies of the network) with one
un-duplicated per-node array (`nodeData`) plus small precomputed
aggregates, and a new on-demand ranking helper that computes a specific
node's rank by comparison only when actually needed (i.e. only for a
searched wallet's own nodes — never for the whole network). Every consumer
(`achievements.js`'s 6 dynamic achievement functions, `_extract_country_counts`,
`HomeOverview`'s `TopDogsPanel`) is migrated to the new shape. Task 1
establishes verified ground-truth behavior via characterization tests
*before* anything is touched, specifically because `achievements.js` has
zero existing test coverage today and this is the highest-risk part of
this plan.

**Tech Stack:** React 18, plain JS. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-09-accuracy-and-reliability-fixes-design.md`
— read it in full; it contains the live-measured numbers, the full
per-consumer requirements table for Part C.3, and the reasoning for why a
naive top-N trim was rejected. This plan's Task 3 refines two of the
spec's field names (`tierWinners` instead of overloading `tierRankings`'s
shape; a precomputed `countryTierCounts` instead of a separate
`totalInCountryTier`) — both are implementation-level clarifications of
the same architecture the spec approved, not a design change.

## Global Constraints

- `client/src/` only — no Rust API changes anywhere in this plan.
- No new npm dependency.
- Test with `cd client && CI=true npx react-scripts test --watchAll=false`,
  build with `npx react-scripts build`. Baseline going into this plan
  (verified fresh in this worktree, post-#187-and-Live-Session-D-merge):
  **367 tests, 23 suites, build exit 0, exactly 4 pre-existing baseline
  warning files** (`Navbar/index.jsx`, `NodeGridTable/index.jsx`,
  `LayoutContext.jsx`, `WalletNodes/index.jsx`). Anything beyond those four
  is new work. (An earlier draft of this plan cited 359 — that number
  predates both prior branches being merged together onto `main`; 367 is
  the real current baseline.)
- Part C.3 (Tasks 3-6) must not change any achievement's earned/not-earned
  outcome, progress percentage, or displayed description text for any
  input that was valid before this plan. Task 1's characterization tests
  are the enforcement mechanism for this — they must still pass, unmodified,
  after Tasks 3-6 land.
- Cache key `globalPerfRankings_v3` → `v4` (Task 3) — old key added to the
  existing stale-key prune list, matching this repo's established
  versioning convention (see `RAW_APP_SPECS_STALE_KEYS` in `apidata.js` for
  the pattern to follow).

---

## File Structure

- Create: `client/src/main/Gamification/rankInGroup.js` — the new pure
  on-demand ranking helper (Task 2).
- Create: `client/src/main/Gamification/rankInGroup.test.js`
- Create: `client/src/main/Gamification/achievements.test.js` — the
  characterization tests (Task 1), extended in Task 4.
- Modify: `client/src/apidata.js` — `fetch_global_performance_rankings`
  (Task 3), `fetch_global_stats`'s 5 unguarded fetchers (Task 7),
  `fetch_global_app_specs_raw`'s cache write (Task 8), `_extract_country_counts`
  (Task 3).
- Modify: `client/src/main/Gamification/achievements.js` — the 6 dynamic
  achievement functions (Task 4).
- Modify: `client/src/home/HomeOverview/index.jsx` — `TopDogsPanel`/
  `TierRow`/`MetricCard` (Task 5).
- Modify: `client/src/runningAppsCategorized.js`,
  `client/src/runningAppsCategorized.test.js`,
  `client/src/components/TopHostedApps/index.jsx` (Task 6).
- Modify: `client/src/apidata.test.js` (Tasks 3, 7, 8).

---

### Task 1: Characterization tests for `achievements.js`'s dynamic functions (against CURRENT code — do not touch the implementation)

**Files:**
- Create: `client/src/main/Gamification/achievements.test.js`

**Interfaces:**
- Consumes: `computeAchievements` and the module's exported/testable
  surface as it exists **right now, unmodified**. If a function you need to
  test isn't exported, add `export` to it in this task (a pure visibility
  change, not a behavior change) rather than testing it indirectly through
  `computeAchievements` alone — you want direct, precise assertions on
  `computeTierPerformanceAchievements`, `computeCountryPerformanceAchievements`,
  `computeTierWorstPerformanceAchievements`, `computeWoodenSpoonAchievements`,
  `computeTryHardAchievements`, and `computeDictatorAchievements` (already
  fine, doesn't touch rankings), plus `apidata.js`'s `_extract_country_counts`
  (add `export` there too if needed).
- Produces: a fixture set and expected-output assertions that Task 4 must
  keep passing unmodified.

This is the most important task in this plan — read it carefully and do
not rush it. `achievements.js` has never had a test before. These tests
are what makes "did we break anything" a verified fact instead of a hope.

- [ ] **Step 1: Build one shared fixture set covering every edge case that matters**

Add to the new test file:

```js
import {
  computeTierPerformanceAchievements,
  computeCountryPerformanceAchievements,
  computeTierWorstPerformanceAchievements,
  computeWoodenSpoonAchievements,
  computeTryHardAchievements,
} from './achievements';

// A small CUMULUS tier: 20 nodes total, values chosen so every case below
// (clear win, clear loss, exact tie, offline/unbenchmarked node, dead-last,
// top-5%-boundary) is deliberately reachable.
//
// eps values, index 0..19: node0 is the clear #1 (100), node1 ties node2 at
// 50 (tie case — node1 appears first in this array, so under the current
// stable-sort behavior node1 must rank ABOVE node2 on a tie), nodes 3..17
// descend from 45 to 3, node18 is the clear last (1), node19 has NO
// benchmark entry at all (simulates an offline/unbenchmarked node — must
// be absent from tierRankings.CUMULUS.eps entirely, not present with a 0).
function buildCumulusTierRankings() {
  const values = [100, 50, 50, 45, 42, 39, 36, 33, 30, 27, 24, 21, 18, 15, 12, 9, 7, 5, 1];
  // node19 deliberately omitted — it exists in walletNodes but never appears here.
  const sorted = values
    .map((v, i) => ({ ip: `10.0.0.${i}`, value: v }))
    .sort((a, b) => b.value - a.value); // stable: node1 (index1) stays before node2 (index2) on the tie
  return sorted.map((n, i) => ({ ip: n.ip, rank: i + 1, value: n.value }));
}

const CUMULUS_EPS_RANKINGS = buildCumulusTierRankings();
// dws/down_speed/up_speed: reuse the same shape so tests can pick whichever
// metric is convenient — only `eps` needs the carefully-tuned tie/edge values.
const FLAT_RANKINGS = (n) =>
  Array.from({ length: 20 }, (_, i) => ({ ip: `10.0.0.${i}`, rank: i + 1, value: n - i }));

const TIER_RANKINGS = {
  CUMULUS: {
    eps: CUMULUS_EPS_RANKINGS,
    dws: FLAT_RANKINGS(200),
    down_speed: FLAT_RANKINGS(300),
    up_speed: FLAT_RANKINGS(400),
  },
};

const OFFICIAL_NODE_COUNTS = { CUMULUS: 20 };

function walletNode(ip, tier = 'CUMULUS') {
  return { ip_full: { host: ip }, ip_display: ip, tier };
}
```

Confirm (by hand, against the current `_bestRankInTier`/`.sort()` logic in
`apidata.js`'s `fetch_global_performance_rankings`) that `CUMULUS_EPS_RANKINGS`
really does put the index-1 node (value 50) at rank 2 and the index-2 node
(also value 50) at rank 3 — i.e. verify the fixture models the CURRENT
stable-sort tie behavior correctly before writing assertions against it.
This is the single most important thing to get right in this task.

- [ ] **Step 2: Medal achievements — clear win, clear loss, exact tie**

```js
describe('computeTierPerformanceAchievements (characterization — current behavior)', () => {
  it('awards gold to the node ranked #1', () => {
    const wallet = [walletNode('10.0.0.0')]; // eps=100, rank 1
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const gold = results.find((r) => r.id === 'global_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    expect(gold.progressLabel).toBe('Global rank #1 of 20 CUMULUS nodes');
  });

  it('does not award any medal to a node far from the top', () => {
    const wallet = [walletNode('10.0.0.10')]; // eps=24, rank 11
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const medals = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(medals.every((m) => !m.earned)).toBe(true);
  });

  it('breaks a tie the same way the current stable-sort ranking does — first-appearing node wins the better rank', () => {
    // node at array index 1 (ip 10.0.0.1, eps=50) must rank ABOVE node at index 2 (10.0.0.2, eps=50)
    const walletA = [walletNode('10.0.0.1')];
    const walletB = [walletNode('10.0.0.2')];
    const resultsA = computeTierPerformanceAchievements(walletA, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const resultsB = computeTierPerformanceAchievements(walletB, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const silverA = resultsA.find((r) => r.id === 'global_CUMULUS_eps_silver');
    const silverB = resultsB.find((r) => r.id === 'global_CUMULUS_eps_silver');
    expect(silverA.earned).toBe(true);  // rank 2
    expect(silverB.earned).toBe(false); // rank 3, not silver
  });

  it('omits a node with no benchmark entry from the rankings entirely (not present, not rank 0)', () => {
    const wallet = [walletNode('10.0.0.19')]; // never appears in CUMULUS_EPS_RANKINGS
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const eps = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(eps.every((m) => !m.earned)).toBe(true);
    expect(eps[0].description).toBe('No CUMULUS nodes with benchmark data found');
  });
});
```

- [ ] **Step 3: Worst-performance ("Potato"/"Tortoise"/"Toaster") and Wooden Spoon — dead-last boundary**

```js
describe('computeTierWorstPerformanceAchievements / computeWoodenSpoonAchievements (characterization)', () => {
  it('awards Potato (dead last) only to the true last-ranked node, using the TRUE total, not a trimmed approximation', () => {
    // 10.0.0.18 is eps rank 20 of 20 — the actual last position.
    const wallet = [walletNode('10.0.0.18')];
    const worst = computeTierWorstPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const potato = worst.find((r) => r.id === 'slow_CUMULUS_potato');
    expect(potato.earned).toBe(true);
    const spoon = computeWoodenSpoonAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(true);
    expect(spoon.progressLabel).toBe('Rank #20 of 20 CUMULUS nodes · EPS');
  });

  it('does not award Potato/Wooden Spoon to a node one place off last', () => {
    const wallet = [walletNode('10.0.0.17')]; // rank 19 of 20 — not dead last
    const worst = computeTierWorstPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_potato').earned).toBe(false);
    const spoon = computeWoodenSpoonAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(false);
  });
});
```

- [ ] **Step 4: Try Hard (top 5%) — the case that needs the TRUE total, not top-N**

```js
describe('computeTryHardAchievements (characterization — top-5%-of-20 = rank 1)', () => {
  it('Math.ceil(20 * 0.05) = 1, so only rank 1 qualifies for a 20-node pool', () => {
    const walletRank1 = [walletNode('10.0.0.0')];
    const walletRank2 = [walletNode('10.0.0.1')];
    const r1 = computeTryHardAchievements(walletRank1, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r2 = computeTryHardAchievements(walletRank2, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r1.earned).toBe(true);
    expect(r2.earned).toBe(false);
  });

  it('with a larger pool (200 nodes), top 5% is rank 10 — reachable well beyond any small fixed top-N', () => {
    const bigRankings = {
      CUMULUS: { eps: Array.from({ length: 200 }, (_, i) => ({ ip: `10.0.1.${i}`, rank: i + 1, value: 200 - i })) },
    };
    const officialCounts = { CUMULUS: 200 };
    const walletRank10 = [walletNode('10.0.1.9')]; // rank 10
    const walletRank11 = [walletNode('10.0.1.10')]; // rank 11
    const r10 = computeTryHardAchievements(walletRank10, bigRankings, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r11 = computeTryHardAchievements(walletRank11, bigRankings, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r10.earned).toBe(true);
    expect(r11.earned).toBe(false);
  });
});
```

- [ ] **Step 5: Country performance achievements**

```js
describe('computeCountryPerformanceAchievements (characterization)', () => {
  const countryRankings = {
    US: {
      country: 'United States',
      tiers: {
        CUMULUS: { metrics: { eps: [
          { ip: '10.0.0.0', rank: 1, value: 100 },
          { ip: '10.0.0.1', rank: 2, value: 50 },
          { ip: '10.0.0.2', rank: 3, value: 10 },
        ] } },
      },
    },
  };
  const nodeGeoMap = { '10.0.0.0': { countryCode: 'US' }, '10.0.0.1': { countryCode: 'US' }, '10.0.0.2': { countryCode: 'US' } };

  it('awards a country medal using the country-scoped total (3), not the network total', () => {
    const wallet = [walletNode('10.0.0.0')];
    const results = computeCountryPerformanceAchievements(wallet, countryRankings, nodeGeoMap);
    const gold = results.find((r) => r.id === 'country_US_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    expect(gold.description).toContain('among all 3 CUMULUS nodes in United States');
  });
});
```

- [ ] **Step 6: `_extract_country_counts` (in `apidata.js`)**

```js
// In a new or existing client/src/apidata.test.js describe block:
import { _extract_country_counts } from './apidata'; // export it if not already

describe('_extract_country_counts (characterization — current behavior)', () => {
  it('counts nodes per country by summing each tier\'s eps array length', () => {
    const countryRankings = {
      US: { country: 'United States', countryCode: 'US', tiers: {
        CUMULUS: { metrics: { eps: [{ ip: 'a' }, { ip: 'b' }] } },
        STRATUS: { metrics: { eps: [{ ip: 'c' }] } },
      } },
    };
    const result = _extract_country_counts(countryRankings);
    expect(result).toEqual([{ country: 'United States', countryCode: 'US', nodeCount: 3 }]);
  });
});
```

- [ ] **Step 7: Run and confirm every test passes against the CURRENT, unmodified code**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern "achievements|apidata.test"`
Expected: all new tests PASS. If any fails, your fixture's hand-computed
expectation is wrong, not the code — re-derive it by tracing the actual
current algorithm, do not adjust the production code to make a test pass
in this task.

- [ ] **Step 8: Commit**

```bash
git add client/src/main/Gamification/achievements.test.js client/src/apidata.js client/src/apidata.test.js
git commit -m "test(achievements): characterization tests for dynamic ranking achievements

Establishes verified ground-truth behavior before the globalPerfRankings
redesign (issue #153) — achievements.js had zero test coverage before this."
```

---

### Task 2: `rankInGroup` / `topInGroup` — the new on-demand ranking helper

**Files:**
- Create: `client/src/main/Gamification/rankInGroup.js`
- Create: `client/src/main/Gamification/rankInGroup.test.js`

**Interfaces:**
- Produces: `rankInGroup(groupNodes, targetIp, metricKey)` →
  `{rank, value, total} | null`; `topInGroup(groupNodes, metricKey)` →
  `{ip, value} | null`. `groupNodes` is any array of objects with `.ip` and
  a numeric field named `metricKey` (e.g. `{ip, eps, dws, down_speed, up_speed}`
  — the shape Task 3's `nodeData` will use). Consumed by Task 4
  (`achievements.js`) and Task 5 (`HomeOverview.jsx`).

- [ ] **Step 1: Write the failing tests**

```js
import { rankInGroup, topInGroup } from './rankInGroup';

describe('rankInGroup', () => {
  const nodes = [
    { ip: 'a', eps: 50 }, // index 0
    { ip: 'b', eps: 50 }, // index 1 — tied with a, appears later
    { ip: 'c', eps: 100 }, // index 2 — highest
    { ip: 'd', eps: 10 },  // index 3 — lowest
  ];

  it('ranks the clear highest as #1', () => {
    expect(rankInGroup(nodes, 'c', 'eps')).toEqual({ rank: 1, value: 100, total: 4 });
  });

  it('ranks the clear lowest as last', () => {
    expect(rankInGroup(nodes, 'd', 'eps')).toEqual({ rank: 4, value: 10, total: 4 });
  });

  it('breaks a tie in favor of whichever node appears earlier in the array (matches JS stable-sort behavior)', () => {
    expect(rankInGroup(nodes, 'a', 'eps')).toEqual({ rank: 2, value: 50, total: 4 });
    expect(rankInGroup(nodes, 'b', 'eps')).toEqual({ rank: 3, value: 50, total: 4 });
  });

  it('returns null for an ip not present in the group', () => {
    expect(rankInGroup(nodes, 'not-here', 'eps')).toBeNull();
  });

  it('returns total:1, rank:1 for a single-node group', () => {
    expect(rankInGroup([{ ip: 'only', eps: 5 }], 'only', 'eps')).toEqual({ rank: 1, value: 5, total: 1 });
  });

  it('treats a missing metric value as 0', () => {
    const withMissing = [{ ip: 'x' }, { ip: 'y', eps: 5 }];
    expect(rankInGroup(withMissing, 'x', 'eps')).toEqual({ rank: 2, value: 0, total: 2 });
  });
});

describe('topInGroup', () => {
  const nodes = [{ ip: 'a', eps: 50 }, { ip: 'b', eps: 100 }, { ip: 'c', eps: 10 }];

  it('returns the highest-value node as {ip, value}', () => {
    expect(topInGroup(nodes, 'eps')).toEqual({ ip: 'b', value: 100 });
  });

  it('returns null for an empty group', () => {
    expect(topInGroup([], 'eps')).toBeNull();
  });

  it('breaks a tie in favor of whichever node appears earlier (matches the old rank-1 behavior)', () => {
    const tied = [{ ip: 'first', eps: 100 }, { ip: 'second', eps: 100 }];
    expect(topInGroup(tied, 'eps')).toEqual({ ip: 'first', value: 100 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern rankInGroup`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```js
/**
 * Rank of one specific node within a group, by one metric — the on-demand
 * replacement for looking a node up in a pre-sorted array (issue #153:
 * pre-sorting and caching the ENTIRE network for every metric/tier/country
 * combination was the single biggest sessionStorage cost, and no consumer
 * ever needed any node's rank except a searched wallet's own — see
 * docs/superpowers/specs/2026-09-09-accuracy-and-reliability-fixes-design.md).
 *
 * Cheap specifically because it only ever runs for the handful of nodes a
 * searched wallet owns, never for the whole network.
 *
 * Tie-break matches the OLD pre-sort exactly: Array.sort is stable in this
 * engine, so among equal values the one appearing earlier in `groupNodes`
 * always got the better (lower) rank. rank = 1 + (strictly greater) +
 * (equal AND earlier in the array). Getting this wrong flips medal
 * outcomes on tied values — the one behavior change this redesign must
 * never introduce.
 *
 * Returns null if targetIp isn't in groupNodes at all (offline/
 * unbenchmarked node) — every caller already treats "not found" as "skip",
 * matching the old .find()-returns-undefined behavior.
 */
export function rankInGroup(groupNodes, targetIp, metricKey) {
  const targetIndex = groupNodes.findIndex((n) => n.ip === targetIp);
  if (targetIndex === -1) return null;
  const targetValue = groupNodes[targetIndex][metricKey] || 0;

  let rank = 1;
  for (let i = 0; i < groupNodes.length; i++) {
    if (i === targetIndex) continue;
    const v = groupNodes[i][metricKey] || 0;
    if (v > targetValue || (v === targetValue && i < targetIndex)) rank++;
  }
  return { rank, value: targetValue, total: groupNodes.length };
}

/**
 * The single highest-value node in a group for one metric — replaces
 * indexing [0] on a pre-sorted array (HomeOverview's "Top Dogs" panel).
 * Tie-break: whichever node appears earlier in groupNodes wins, matching
 * the old rank-1 assignment under a stable sort.
 */
export function topInGroup(groupNodes, metricKey) {
  if (groupNodes.length === 0) return null;
  let best = null;
  for (const n of groupNodes) {
    const v = n[metricKey] || 0;
    if (best === null || v > best.value) best = { ip: n.ip, value: v };
  }
  return best;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern rankInGroup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/main/Gamification/rankInGroup.js client/src/main/Gamification/rankInGroup.test.js
git commit -m "feat(gamification): add on-demand rankInGroup/topInGroup helpers (#153)"
```

---

### Task 3: Redesign `fetch_global_performance_rankings` — `nodeData` instead of exploded rankings

**Files:**
- Modify: `client/src/apidata.js` (`fetch_global_performance_rankings`,
  `GLOBAL_RANKINGS_CACHE_KEY`, `GLOBAL_RANKINGS_STALE_KEYS` if none exists
  yet — add one, matching `RAW_APP_SPECS_STALE_KEYS`'s pattern, so old
  `globalPerfRankings_v3` entries get pruned), `_extract_country_counts`
- Modify: `client/src/apidata.test.js`

**Interfaces:**
- Produces: `fetch_global_performance_rankings()` now resolves to
  `{ nodeData, tierWinners, countryTierCounts, officialNodeCounts,
  countryDominance, nodeGeoMap, addressGeoMap }` — **`tierRankings` and
  `countryRankings` are REMOVED** from this object. `nodeData` is
  `Array<{ip, tier, eps, dws, down_speed, up_speed, geo}>` — one entry per
  benchmarked node, no duplication. `tierWinners` is
  `{[tier]: {[metric]: {ip, value} | null}}` (via `topInGroup`, computed
  once here rather than per-render). `countryTierCounts` is
  `{[countryCode]: {country, tiers: {[tier]: count}}}`.
- Consumed by: Task 4 (`achievements.js`), Task 5 (`HomeOverview.jsx`).

- [ ] **Step 1: Write the failing tests**

`fetch_node_benchmarks`/`fetch_node_geolocation` (from `networkNodes.js`)
are module-level singletons built by a `_shared()` factory with their own
60-second in-memory result cache — **that cache persists across tests in
the same file** unless you reset the module registry between tests. Use
`jest.resetModules()` + fresh `require()` per test (no existing precedent
in this codebase for this exact pattern, but it's the standard fix, and
it's the only way to avoid one test's mocked benchmark data leaking into
the next). Mock `global.fetch` itself (routed by URL substring), not the
imported functions — that way `fetch_node_benchmarks`/`fetch_node_geolocation`'s
real internal logic still runs.

Add to `apidata.test.js`:

```js
describe('fetch_global_performance_rankings (redesigned shape)', () => {
  const FLUX_NODES = { fluxNodes: [
    { ip: '10.0.0.1:16127', tier: 'cumulus', payment_address: 't1a' },
    { ip: '10.0.0.2:16127', tier: 'stratus', payment_address: 't1b' },
  ] };
  const BENCH_DATA = [
    { benchmark: { bench: { ipaddress: '10.0.0.1:16127', eps: 100, ddwrite: 10, download_speed: 50, upload_speed: 20 } } },
    { benchmark: { bench: { ipaddress: '10.0.0.2:16127', eps: 200, ddwrite: 20, download_speed: 60, upload_speed: 30 } } },
  ];
  const GEO_DATA = [
    { geolocation: { ip: '10.0.0.1', country: 'United States', countryCode: 'US', continent: 'NA' } },
    { geolocation: { ip: '10.0.0.2', country: 'Germany', countryCode: 'DE', continent: 'EU' } },
  ];
  const NODE_COUNT = { data: { 'cumulus-enabled': 1, 'nimbus-enabled': 0, 'stratus-enabled': 1, total: 2 } };

  function mockFetchByUrl() {
    global.fetch = jest.fn((url) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('getFluxNodes')) return Promise.resolve({ json: async () => FLUX_NODES });
      if (u.includes('projection=benchmark')) return Promise.resolve({ json: async () => ({ status: 'success', data: BENCH_DATA }) });
      if (u.includes('projection=geolocation')) return Promise.resolve({ json: async () => ({ status: 'success', data: GEO_DATA }) });
      if (u.includes('getzelnodecount')) return Promise.resolve({ json: async () => NODE_COUNT });
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });
  }

  let fetch_global_performance_rankings;

  beforeEach(() => {
    jest.resetModules();
    sessionStorage.clear();
    mockFetchByUrl();
    fetch_global_performance_rankings = require('./apidata').fetch_global_performance_rankings;
  });

  it('resolves nodeData as one entry per benchmarked node, no duplication', async () => {
    const result = await fetch_global_performance_rankings();
    expect(result.nodeData).toHaveLength(2);
    expect(result.nodeData.find((n) => n.ip === '10.0.0.1')).toMatchObject({ tier: 'CUMULUS', eps: 100 });
    expect(result.tierRankings).toBeUndefined();
    expect(result.countryRankings).toBeUndefined();
  });

  it('tierWinners gives the single highest-value node per tier+metric', async () => {
    const result = await fetch_global_performance_rankings();
    // Only one node per tier in this fixture, so it trivially wins its own tier.
    expect(result.tierWinners.CUMULUS.eps).toEqual({ ip: '10.0.0.1', value: 100 });
    expect(result.tierWinners.STRATUS.eps).toEqual({ ip: '10.0.0.2', value: 200 });
  });

  it('countryTierCounts matches nodeData grouped by country+tier', async () => {
    const result = await fetch_global_performance_rankings();
    expect(result.countryTierCounts.US.tiers.CUMULUS).toBe(1);
    expect(result.countryTierCounts.DE.tiers.STRATUS).toBe(1);
  });

  it('bumps the cache key to v4 and prunes the old v3 entry', async () => {
    sessionStorage.setItem('globalPerfRankings_v3', JSON.stringify({ data: { stale: true }, timestamp: Date.now() }));
    await fetch_global_performance_rankings();
    expect(sessionStorage.getItem('globalPerfRankings_v3')).toBeNull();
    expect(sessionStorage.getItem('globalPerfRankings_v4')).not.toBeNull();
  });
});
```

Note: `nodeData` entries use the bare host (`10.0.0.1`), not
`host:port` — confirm this against the CURRENT code's existing
`host = (bench.ipaddress || '').split(':')[0]` line (unchanged by this
task) before trusting the fixture above; adjust the assertions if the real
behavior differs from this description.

- [ ] **Step 2: Run to verify failure**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern apidata.test`

- [ ] **Step 3: Implement**

In `apidata.js`, replace the tail of `fetch_global_performance_rankings`
(currently: the `tierRankings`/`countryRankings` construction block, from
`const METRICS = [...]` through `const data = { tierRankings, countryRankings, ... }`)
with:

```js
    // Every consumer of this data (achievements.js's 6 dynamic functions,
    // HomeOverview's TopDogsPanel, _extract_country_counts below) only
    // ever needs ONE of: a specific wallet's own node's rank (computed
    // on demand via rankInGroup, cheap since it's only ever a handful of
    // nodes — see main/Gamification/rankInGroup.js), the single #1 node
    // per tier/metric (tierWinners, precomputed here), or a country's
    // node count (countryTierCounts, precomputed here). Nothing needs a
    // pre-sorted rank list for the whole network — that used to cost 12+
    // duplicated copies of every node (issue #153).
    const METRICS = ['eps', 'dws', 'down_speed', 'up_speed'];
    const TIERS = ['CUMULUS', 'NIMBUS', 'STRATUS'];

    const tierWinners = {};
    for (const tier of TIERS) {
      tierWinners[tier] = {};
      const tierNodes = nodeData.filter((n) => n.tier === tier);
      for (const metric of METRICS) {
        tierWinners[tier][metric] = topInGroup(tierNodes, metric);
      }
    }

    const countryTierCounts = {};
    for (const node of nodeData) {
      if (!node.geo?.countryCode) continue;
      const cc = node.geo.countryCode;
      if (!countryTierCounts[cc]) countryTierCounts[cc] = { country: node.geo.country, tiers: {} };
      countryTierCounts[cc].tiers[node.tier] = (countryTierCounts[cc].tiers[node.tier] || 0) + 1;
    }

    const data = { nodeData, tierWinners, countryTierCounts, officialNodeCounts, countryDominance, addressGeoMap, nodeGeoMap };
```

(`nodeData` is already built above this point in the existing function —
unchanged. Delete the old `tierRankings`/`countryRankings` construction
blocks entirely, including their now-unused `nodeData.push({..., geo: nodeGeoMap[host] || null})`
— wait, `nodeData` itself must be KEPT and still needs `.geo` on each
entry, since `tierWinners`/`countryTierCounts` above both read it, and
Task 4 needs it too. Only the `tierRankings`/`countryRankings` explosion
blocks are removed, not `nodeData` itself.)

Add the import: `import { topInGroup } from 'main/Gamification/rankInGroup';`
at the top of `apidata.js`.

Update the cache key section:

```js
const GLOBAL_RANKINGS_CACHE_KEY = 'globalPerfRankings_v4';
const GLOBAL_RANKINGS_STALE_KEYS = ['globalPerfRankings_v3'];
```

and add the prune step (matching `_prune_stale_app_spec_caches`'s pattern
in the same file) at the top of `fetch_global_performance_rankings`,
before its cache-read block.

Update `_extract_country_counts` to read the new shape directly:

```js
export function _extract_country_counts(countryTierCounts) {
  if (!countryTierCounts) return [];
  return Object.entries(countryTierCounts)
    .map(([countryCode, { country, tiers }]) => ({
      country,
      countryCode,
      nodeCount: Object.values(tiers).reduce((sum, c) => sum + c, 0),
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}
```

(Export it if it wasn't already — Task 1's Step 6 test needs this.) Update
its one call site (`fetch_country_node_counts`, same file) to pass
`cached.data.countryTierCounts` instead of `cached.data.countryRankings`.

- [ ] **Step 4: Run to verify pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern apidata.test`

- [ ] **Step 5: Commit**

```bash
git add client/src/apidata.js client/src/apidata.test.js
git commit -m "refactor(apidata): globalPerfRankings caches nodeData instead of pre-sorted network (#153)"
```

---

### Task 4: Migrate `achievements.js`'s dynamic functions to on-demand ranking

**Files:**
- Modify: `client/src/main/Gamification/achievements.js`

**Interfaces:**
- Consumes: `rankInGroup`/`topInGroup` (Task 2), `globalRankings.nodeData`
  (Task 3, replaces `globalRankings.tierRankings`/`.countryRankings`).
- Must not change: any field on the objects `computeAchievements` returns,
  for any input Task 1's characterization tests cover. Task 1's tests are
  the acceptance criterion for this task — they must pass unmodified
  against this task's code.

- [ ] **Step 1: Rewrite `_bestRankInTier`/`_worstRankInTier`/`_bestRankInCountry` to filter `nodeData` and call `rankInGroup`**

```js
import { rankInGroup, topInGroup } from './rankInGroup';

// Find wallet's best global rank for (tier, metric) across all wallet nodes in that tier
function _bestRankInTier(walletTierNodes, nodeData, tier, metricKey) {
  const groupNodes = nodeData.filter((n) => n.tier === tier);
  let best = null;
  for (const node of walletTierNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const result = rankInGroup(groupNodes, ip, metricKey);
    if (!result) continue;
    if (best === null || result.rank < best.bestRank) {
      best = { bestRank: result.rank, bestIp: ip, bestValue: result.value, bestNodeDisplay: node.ip_display };
    }
  }
  return best || { bestRank: null, bestIp: null, bestValue: 0, bestNodeDisplay: null };
}

// Find wallet's WORST global rank for (tier, metric) — inverse of _bestRankInTier
function _worstRankInTier(walletTierNodes, nodeData, tier, metricKey) {
  const groupNodes = nodeData.filter((n) => n.tier === tier);
  let worst = null;
  for (const node of walletTierNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const result = rankInGroup(groupNodes, ip, metricKey);
    if (!result) continue;
    if (worst === null || result.rank > worst.worstRank) {
      worst = { worstRank: result.rank, worstValue: result.value, worstNodeDisplay: node.ip_display };
    }
  }
  return worst || { worstRank: null, worstValue: 0, worstNodeDisplay: null };
}

// Find wallet's best rank in a country for a metric
function _bestRankInCountry(walletCountryNodes, nodeData, tier, countryCode, metricKey) {
  const groupNodes = nodeData.filter((n) => n.tier === tier && n.geo?.countryCode === countryCode);
  let best = null;
  for (const node of walletCountryNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const result = rankInGroup(groupNodes, ip, metricKey);
    if (!result) continue;
    if (best === null || result.rank < best.bestRank) {
      best = { bestRank: result.rank, bestValue: result.value, bestNodeDisplay: node.ip_display };
    }
  }
  return best || { bestRank: null, bestValue: 0, bestNodeDisplay: null };
}
```

Note the signature change: these three helpers now take `nodeData` (the
full array) plus `tier`/`countryCode` to filter by, instead of a
pre-filtered `metricRankings` array — because filtering now happens inside
the helper (once per call), not once at the top of the caller as
`tierRankings[tier][metric]`. Update every call site in Step 2 accordingly.

- [ ] **Step 2: Update the 5 functions that call these helpers**

In `computeTierPerformanceAchievements`, `computeTierWorstPerformanceAchievements`,
`computeWoodenSpoonAchievements`, `computeTryHardAchievements`: replace the
parameter `tierRankings` with `nodeData` throughout, remove the
`const rankings = tierRankings[tier]; if (!rankings) continue;` lines
(no longer needed — `nodeData.filter` on an unknown tier just yields `[]`,
which the total-size guards below already handle), and replace
`const metricRankings = rankings[metric.key] || [];` /
`metricRankings.length` with a single filter-once-per-tier:

```js
    const groupNodes = nodeData.filter((n) => n.tier === tier);
    if (groupNodes.length === 0) continue;
```

then each metric loop calls `_bestRankInTier(walletTierNodes, nodeData, tier, metric.key)`
(or `_worstRankInTier`) instead of the old `_bestRankInTier(walletTierNodes, metricRankings)`,
and replaces every remaining `metricRankings.length` with `groupNodes.length`
(same value — `groupNodes` is exactly what the old `metricRankings` array
would have had `.length` of, since it's the same tier's node set, just not
exploded per-metric).

In `computeCountryPerformanceAchievements`: replace the `countryRankings`
parameter with `nodeData`. Remove the `const countryData = countryRankings[cc];`/
`tierData` lookups. Inside the metric loop, replace
`const metricRankings = tierData.metrics[metric.key] || []; const totalInGroup = metricRankings.length;`
with:

```js
      const groupNodes = nodeData.filter((n) => n.tier === tier && n.geo?.countryCode === cc);
      const totalInGroup = groupNodes.length;
      if (totalInGroup === 0) continue;
```

and call `_bestRankInCountry(walletCountryTierNodes, nodeData, tier, cc, metric.key)`.
`country` (the display name) is no longer available from `countryRankings[cc].country`
— get it from `nodeGeoMap` instead (any node in `walletCountryTierNodes` has
`.ip_full.host` you can look up, or thread `countryTierCounts` in for the
name — check what's simplest given what's already in scope at this call
site; `computeCountryPerformanceAchievements` is called with `nodeGeoMap`
already, per its own signature, so `Object.values(nodeGeoMap).find(g => g.countryCode === cc)?.country`
is one option, or read it directly off `globalRankings.countryTierCounts[cc].country` — prefer
whichever keeps the function's existing parameter list smallest).

- [ ] **Step 3: Update `computeAchievements`'s call sites at the bottom of the file**

```js
  const tierPerf = computeTierPerformanceAchievements(
    walletNodes,
    globalRankings.nodeData,
    globalRankings.officialNodeCounts,
    enablePrivacyMode
  );
  const countryPerf = computeCountryPerformanceAchievements(
    walletNodes,
    globalRankings.nodeData,
    globalRankings.nodeGeoMap,
    enablePrivacyMode
  );
  const worstTierPerf = computeTierWorstPerformanceAchievements(
    walletNodes,
    globalRankings.nodeData,
    globalRankings.officialNodeCounts,
    enablePrivacyMode
  );
  const dictator = computeDictatorAchievements(walletNodes, globalRankings);
  const woodenSpoon = computeWoodenSpoonAchievements(walletNodes, globalRankings.nodeData, globalRankings.officialNodeCounts, enablePrivacyMode);
  const tryHard = computeTryHardAchievements(walletNodes, globalRankings.nodeData, globalRankings.officialNodeCounts, enablePrivacyMode);
```

(`computeDictatorAchievements` is unchanged — it never used
`tierRankings`/`countryRankings`, only `countryDominance`/`nodeGeoMap`,
both untouched by Task 3.)

- [ ] **Step 4: Run Task 1's characterization tests — they must still pass, unmodified**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern achievements`
Expected: every test from Task 1 passes. If one fails, the bug is in this
task's migration, not in Task 1's fixture — re-check the rank-computation
logic against `rankInGroup`'s tie-break rule before touching the test file.
Do not edit Task 1's tests to make them pass.

You will need to update Task 1's fixture SETUP (the `TIER_RANKINGS` /
`countryRankings` shaped objects it builds) to instead build `nodeData`-
shaped fixtures, since the function signatures changed in this task — but
the *expected values* in every `expect(...)` call must stay exactly what
Task 1 established. This is a mechanical fixture-shape update, not a
license to change what's being asserted.

- [ ] **Step 5: Run the full suite + build**

```
cd client && CI=true npx react-scripts test --watchAll=false
npx react-scripts build
```

- [ ] **Step 6: Commit**

```bash
git add client/src/main/Gamification/achievements.js client/src/main/Gamification/achievements.test.js
git commit -m "refactor(achievements): rank via nodeData + rankInGroup instead of pre-sorted arrays (#153)"
```

---

### Task 5: Migrate `HomeOverview`'s `TopDogsPanel` to `tierWinners`

**Files:**
- Modify: `client/src/home/HomeOverview/index.jsx`

**Interfaces:**
- Consumes: `globalRankings.tierWinners` (Task 3) instead of
  `globalRankings.tierRankings`.

- [ ] **Step 1: Update `TierRow`/`TopDogsPanel`**

```jsx
function TierRow({ tier, tierWinners, nodeGeoMap }) {
  const { label, color } = TIER_CONFIG[tier];
  const winners = tierWinners?.[tier];
  return (
    <div className="td-tier-row" style={{ borderLeftColor: color }}>
      <div className="td-tier-label-col">
        <span className="td-tier-dot" style={{ background: color }} />
        <span className="td-tier-name" style={{ color }}>{label}</span>
      </div>
      <div className="td-metric-cards">
        {METRIC_CONFIG.map((m) => (
          <MetricCard key={m.key} metric={m} winner={winners?.[m.key] ?? null} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}

function TopDogsPanel({ globalRankings }) {
  if (!globalRankings) return (
    <div className="hov-panel hov-panel-center hov-panel--top-dogs">
      <Spinner size={20} />
    </div>
  );
  const { tierWinners, nodeGeoMap } = globalRankings;
  return (
    <div className="hov-panel hov-panel--top-dogs">
      <PanelHeader title="TOP DOGS" right={<FaTrophy size={14} className="td-header-icon" />} />
      <div className="td-body">
        {TIERS_ORDER.map((tier) => (
          <TierRow key={tier} tier={tier} tierWinners={tierWinners} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}
```

(`MetricCard` itself is unchanged — it already destructures `{ip, value}`
off `winner`, which is exactly `topInGroup`'s return shape.)

- [ ] **Step 2: Manual QA**

Via `yarn start`, load `/home`, confirm the "Top Dogs" panel still shows a
plausible #1 node per tier/metric (compare against `main` before this
plan if in doubt).

- [ ] **Step 3: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add client/src/home/HomeOverview/index.jsx
git commit -m "fix(home): TopDogsPanel reads tierWinners instead of pre-sorted tierRankings (#153)"
```

---

### Task 6: Part A — Top Hosted Apps: Enterprise vs. Unknown

**Files:**
- Modify: `client/src/runningAppsCategorized.js`
- Modify: `client/src/runningAppsCategorized.test.js`
- Modify: `client/src/components/TopHostedApps/index.jsx`

**Interfaces:**
- Produces: `categorizeRunningApps`'s return value gains
  `enterpriseContainers: number` and `unresolvedContainers: number`.

- [ ] **Step 1: Write the failing tests**

Add to `runningAppsCategorized.test.js` (import `componentCountKey` from
`'fluxinfo'` -- the same helper `fluxinfo.js`'s own aggregate uses to build
these keys, so the fixture matches the real key format exactly instead of
hand-building the separator string):

```js
import { componentCountKey } from 'fluxinfo';

it('reports enterpriseContainers separately from the ranking, for apps whose spec is Enterprise (repotag deliberately hidden)', () => {
  const aggregate = {
    nameCounts: { entApp: 2 },
    componentCounts: { [componentCountKey('entApp', null)]: 2 },
    nodesByIp: {},
  };
  const specIndex = { entApp: { category: 'enterprise', repotag: '', compose: null } };
  const { enterpriseContainers, unresolvedContainers } = categorizeRunningApps(aggregate, specIndex);
  expect(enterpriseContainers).toBe(2);
  expect(unresolvedContainers).toBe(0);
});

it('reports unresolvedContainers separately, for apps with no spec found at all', () => {
  const aggregate = {
    nameCounts: { ghostApp: 1 },
    componentCounts: { [componentCountKey('ghostApp', null)]: 1 },
    nodesByIp: {},
  };
  const { enterpriseContainers, unresolvedContainers } = categorizeRunningApps(aggregate, {});
  expect(enterpriseContainers).toBe(0);
  expect(unresolvedContainers).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern runningAppsCategorized`

- [ ] **Step 3: Implement**

In `categorizeRunningApps`, in the `componentCounts` loop (where
`repoCounts`/`wordpressCount` are built), track the two new counters
alongside the existing `if (!repotag) continue;` skip:

```js
  let enterpriseContainers = 0;
  let unresolvedContainers = 0;

  for (const [key, count] of Object.entries(componentCounts)) {
    const { name, component } = splitComponentCountKey(key);
    const spec = index[name];
    const repotag = repotagForComponent(spec, component);
    if (!repotag) {
      if (spec?.category === 'enterprise') enterpriseContainers += count;
      else unresolvedContainers += count;
      continue;
    }

    repoCounts[repotag] = (repoCounts[repotag] || 0) + count;
    if (repotag.split(':')[0] === WORDPRESS_REPO_BASE) {
      wordpressCount += count;
    }
  }
```

Add both new fields to the function's return object.

- [ ] **Step 4: Run to verify pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern runningAppsCategorized`

- [ ] **Step 5: `TopHostedApps` — render the two counts**

In `client/src/components/TopHostedApps/index.jsx`, read
`gstore.enterpriseContainers`/`gstore.unresolvedContainers` (these need to
be threaded onto `store` in `apidata.js`'s `fetchTotalDeployedApps` too —
check the existing pattern for `wordpressCount` et al. right above the
`categorizeRunningApps` call and add the same assignment for these two new
fields). Render below the ranked list, only when non-zero:

```jsx
{images.length > 0 && (enterpriseContainers > 0 || unresolvedContainers > 0) && (
  <div className="hov-top-apps-footnote">
    {enterpriseContainers > 0 && (
      <span title="Enterprise apps ship an encrypted spec — there is no image to rank.">
        {fmtNum(enterpriseContainers)} Enterprise apps — image hidden by design
      </span>
    )}
    {unresolvedContainers > 0 && (
      <span title="Running, but no matching spec was found for this app.">
        {fmtNum(unresolvedContainers)} unresolved
      </span>
    )}
  </div>
)}
```

Match the existing file's class-naming/style convention rather than
inventing a new one — check `index.scss` in the same directory for the
established pattern (e.g. `hov-` prefix, muted text color) before adding
this rule.

- [ ] **Step 6: Run the full suite + build**

```
cd client && CI=true npx react-scripts test --watchAll=false
npx react-scripts build
```

- [ ] **Step 7: Commit**

```bash
git add client/src/runningAppsCategorized.js client/src/runningAppsCategorized.test.js client/src/components/TopHostedApps/index.jsx client/src/apidata.js
git commit -m "feat(home): distinguish Enterprise apps from genuinely unresolved ones in Top Hosted Apps"
```

---

### Task 7: Part B — issue #189, guard the 5 unguarded fetchers

**Files:**
- Modify: `client/src/apidata.js`

**Interfaces:** none new — purely additive error handling, no signature
changes.

- [ ] **Step 1: Wrap each of the 5 functions**

In `fetch_global_stats`, wrap `fetchCurrency`, `fetchWallet`, `fetchNode`,
`fetchBenchVer`, `fetchRichList` each in try/catch, matching
`fetchDaemonInfo`'s exact style (`console.log('error', error)` on catch,
otherwise unchanged):

```js
  const fetchCurrency = async () => {
    try {
      const res = await fetch('https://explorer.runonflux.io/api/currency');
      const json = await res.json();
      store.flux_price_usd = json.data.rate;
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchWallet = async () => {
    try {
      if (walletAddress) {
        const res = await fetch('https://explorer.runonflux.io/api/addr/' + walletAddress + '/?noTxList=1');
        const json = await res.json();
        const balance = json['balance'];
        store.wallet_amount_flux = Math.round((balance + Number.EPSILON) * 100) / 100;
      }
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchNode = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/getzelnodecount');
      const json = await res.json();
      const stats = json.data;

      store.node_count.cumulus = stats['cumulus-enabled'];
      store.node_count.nimbus = stats['nimbus-enabled'];
      store.node_count.stratus = stats['stratus-enabled'];

      store.node_count.total = stats['total'];
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchBenchVer = async () => {
    try {
      const res = await fetch('https://raw.githubusercontent.com/RunOnFlux/flux/master/package.json');
      if (res.status === 200) {
        const json = await res.json();
        store.fluxos_latest_version = fluxos_version_desc_parse(json['version']);
      }
    } catch (error) {
      console.log('error', error);
    }
  };
```

(`fetchRichList` already has the try/catch — added in the design/spec pass
and confirmed still present. Verify it's there; if a merge conflict or
earlier revert removed it, restore it in this same style.)

- [ ] **Step 2: Add regression tests proving one failure no longer blocks the rest**

Add to `apidata.test.js`:

```js
describe('fetch_global_stats resilience (#189)', () => {
  it('a single failing fetch (e.g. rate-limited currency endpoint) does not prevent other fields from populating', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/currency')) return Promise.reject(new Error('429 rate limited'));
      // ...mock every other endpoint fetch_global_stats calls with a minimal valid response,
      // matching whatever mocking pattern this test file already uses elsewhere for
      // fetch_global_stats (read the file for the existing convention before writing this)
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });
    const store = await fetch_global_stats();
    expect(store.flux_price_usd).toBe(0); // failed fetch leaves the zeroed default — does not throw
    // assert at least one OTHER field that a real mocked response would have populated
  });
});
```

- [ ] **Step 3: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add client/src/apidata.js client/src/apidata.test.js
git commit -m "fix(home): guard fetchCurrency/fetchWallet/fetchNode/fetchBenchVer/fetchRichList (#189)

One rate-limited or failed endpoint no longer zeros the entire Home page —
matches the try/catch pattern fetchDaemonInfo already used one function
above these in the same Promise.all."
```

---

### Task 8: Part C.1 + C.2 — spec field-stripping and loud quota-failure logging

**Files:**
- Modify: `client/src/apidata.js` (`fetch_global_app_specs_raw`, every
  `sessionStorage.setItem` call site in this file)
- Modify: `client/src/apidata.test.js`

**Interfaces:** `fetch_global_app_specs_raw()`'s return value (in-memory,
to callers) is UNCHANGED — every field every consumer reads today stays
present. Only what gets written to `sessionStorage` is trimmed.

- [ ] **Step 1: Write the failing test for field-stripping**

```js
describe('fetch_global_app_specs_raw caches a trimmed payload (#153)', () => {
  it('strips fields no consumer reads before writing to sessionStorage, but returns the full spec to the caller', async () => {
    const fullSpec = {
      name: 'app1', height: 100, expire: 1000, instances: 3, enterprise: '', owner: 'zid1',
      contacts: ['x'], description: 'long text', geolocation: ['a'], hash: 'abc', nodes: [], staticip: false, version: 8,
      compose: [{ name: 'c1', repotag: 'img:latest', cpu: 1, ram: 512, hdd: 5, commands: [], containerData: '/x', containerPorts: [], domains: [''], environmentParameters: [], ports: [], repoauth: '', description: 'x' }],
    };
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ status: 'success', data: [fullSpec] }) });

    const result = await fetch_global_app_specs_raw();
    expect(result[0].name).toBe('app1'); // in-memory return is untouched

    const cached = JSON.parse(sessionStorage.getItem('homeAppSpecsRaw_v1')).data[0];
    expect(cached).not.toHaveProperty('contacts');
    expect(cached).not.toHaveProperty('description');
    expect(cached).not.toHaveProperty('geolocation');
    expect(cached).not.toHaveProperty('hash');
    expect(cached).not.toHaveProperty('nodes');
    expect(cached).not.toHaveProperty('staticip');
    expect(cached).not.toHaveProperty('version');
    expect(cached.compose[0]).not.toHaveProperty('commands');
    expect(cached.compose[0]).not.toHaveProperty('containerData');
    expect(cached.compose[0]).not.toHaveProperty('domains');
    // fields every consumer needs stay present:
    expect(cached).toMatchObject({ name: 'app1', height: 100, expire: 1000, instances: 3, enterprise: '', owner: 'zid1' });
    expect(cached.compose[0]).toMatchObject({ name: 'c1', repotag: 'img:latest', cpu: 1, ram: 512, hdd: 5 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

In `fetch_global_app_specs_raw`, add a trim function and apply it only on
the write path (the `return json.data;` for in-memory callers stays the
full untrimmed data):

```js
const SPEC_CACHE_FIELDS = ['name', 'height', 'expire', 'instances', 'enterprise', 'owner', 'repotag'];
const COMPOSE_CACHE_FIELDS = ['name', 'repotag', 'cpu', 'ram', 'hdd'];

function _trimSpecForCache(spec) {
  const trimmed = {};
  for (const f of SPEC_CACHE_FIELDS) {
    if (spec[f] !== undefined) trimmed[f] = spec[f];
  }
  if (Array.isArray(spec.compose)) {
    trimmed.compose = spec.compose.map((c) => {
      const tc = {};
      for (const f of COMPOSE_CACHE_FIELDS) {
        if (c[f] !== undefined) tc[f] = c[f];
      }
      return tc;
    });
  }
  return trimmed;
}
```

Update the `sessionStorage.setItem(RAW_APP_SPECS_CACHE_KEY, ...)` call:

```js
      try {
        const trimmedForCache = json.data.map(_trimSpecForCache);
        sessionStorage.setItem(RAW_APP_SPECS_CACHE_KEY, JSON.stringify({ data: trimmedForCache, timestamp: Date.now() }));
      } catch (e) {
        console.warn('[AppSpecs] Cache write failed:', e?.message, `(${JSON.stringify(json.data).length} bytes)`);
      }

      return json.data; // full, untrimmed — every in-memory caller keeps working exactly as before
```

Note: this means a WARM cache read (`cached.data`) now returns
ALREADY-TRIMMED specs, not full ones — re-verify every consumer of
`fetch_global_app_specs_raw()`'s return value only reads the allowlisted
fields (this was already verified during the design/spec phase — see the
spec doc's Part C.1 table — but confirm once more against the actual
current code before shipping, since code may have drifted since the spec
was written).

- [ ] **Step 4: Loud failure on every remaining `sessionStorage.setItem` in this file**

Grep `apidata.js` for every `catch {}` immediately following a
`sessionStorage.setItem` call (there are several — `GLOBAL_RANKINGS_CACHE_KEY`,
`GPU_PRICES_CACHE_KEY`, `HOME_GEO_CACHE_KEY`, plus the one just touched
above). Replace each bare `catch {}` with:

```js
      } catch (e) {
        console.warn('[<ModuleName>] Cache write failed:', e?.message);
      }
```

using a label matching that section's existing console-log prefix
convention (e.g. `[GlobalRankings]`, `[GPU]`, `[Geo]` — check what's
already used nearby in each section for consistency).

- [ ] **Step 5: Run to verify pass, then the full suite**

```
cd client && CI=true npx react-scripts test --watchAll=false
```

- [ ] **Step 6: Commit**

```bash
git add client/src/apidata.js client/src/apidata.test.js
git commit -m "fix(apidata): trim cached spec fields, log cache-write failures instead of swallowing them (#153)"
```

---

### Task 9: Final verification sweep

**Files:** none expected (verification-only).

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: baseline (359) plus every test added across Tasks 1-8, all
passing, 0 failures.

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, warnings limited to the same 4 pre-existing baseline
files, no new ones.

- [ ] **Step 3: Manual sessionStorage measurement (issue #153's actual acceptance criterion)**

Via `yarn start` against real data: load `/home`, search a wallet with
several nodes (to populate the Gamification tab), then in the browser
console:

```js
Object.keys(sessionStorage).map(k => ({ key: k, kb: Math.round(sessionStorage.getItem(k).length / 1024) }))
```

Confirm total usage is well under ~50% of the ~5,120KB quota (issue
#153's stated target), and specifically confirm `globalPerfRankings_v4`
and `homeAppSpecsRaw_v1` are both meaningfully smaller than the pre-plan
measurements recorded in the spec doc (2,912KB and ~1,520KB respectively).

- [ ] **Step 4: Manual Gamification comparison (the "don't break calculations" check)**

Search the SAME wallet on this branch and on `main`, screenshot the
Gamification tab's achievement list on both, and confirm every earned/
not-earned status, progress bar, and description number matches exactly.
This is a live-data confirmation on top of Task 1/4's unit-test proof —
both matter, neither replaces the other.

- [ ] **Step 5: Manual Top Hosted Apps / regression check**

Confirm the Enterprise/Unknown footnote renders correctly on `/home` and
`/analytics`'s Apps tab (shared component). Spot-check `/nodes` and `/live`
are visually/functionally unaffected (this plan never touches either).

- [ ] **Step 6: `git diff --stat main`**

Confirm only `client/src/` files plus this plan doc and its spec changed —
no unrelated files.
