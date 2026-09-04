# Analytics Page — Session 4 (Donor Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/analytics` page's third tab — **Donor** — showing the connected donor wallet's own node payout timing (last actual + next predicted), his node list, what's running on his nodes broken down by category, and his nodes' resource utilization compared against the network average.

**Architecture:** Almost everything reuses data this app already fetches elsewhere, joined a different way. Payout timing and the node list both come from the wallet node-list fetch `main/WalletNodes` already uses (`getWalletNodes` + `transformRawNode`), not from `main/PayoutTimer` (a stateful component with no reusable pure logic). Utilization reuses `networkNodes.js`'s already-shared benchmark/resource fetchers, joined the same way `buildWorkhorseNodes` already joins them, just filtered to the donor's own addresses. The one new data-sourcing piece: `fluxinfo.js`'s shared aggregate currently discards per-node app data for every node except the network's top 5 busiest — extended in Task 1 to also keep a full `{ip → node}` lookup, so a donor's own (typically not top-5) nodes are visible in it at all.

**Tech Stack:** React 18 (hooks, function components), dayjs (already a dependency, used for date parsing), Jest (existing test runner). No new npm dependency, no new backend.

**Spec:** `PREMIUM_FEATURES_PLAN.md`, the "Donor tab (Session 4)" section and the "Build order" section's Session 4 entry.

## Global Constraints

- **No new npm dependency.**
- New code follows this codebase's existing conventions: named exports, `camelCase` filenames for pure modules, `PascalCase` directories for components with an `index.jsx` + co-located `index.scss`, tests co-located as `*.test.js`.
- **Shared panel chrome (`.hov-panel`, `.hov-header`, `.hov-ranked-list`, etc.) is duplicated per component, not imported cross-file** — established, deliberate convention (see the header comment in `client/src/components/TopHostedApps/index.scss`, and Session 3's `NetworkTab/index.scss` for the same reasoning applied to a tab file). `DonorTab/index.scss` gets its own full copy of whatever subset of that chrome it renders.
- **Categorize by Docker image (repotag), not app name**, when both are available — matches `main/Gamification/appCategories.js`'s own stated preference (its header comment, and `categorizeAppSpec`'s identical choice): the repotag is right far more often than the user-chosen name.
- After every task: `cd client && CI=true npx react-scripts test --watchAll=false` (count only ever goes up from this worktree's confirmed baseline of **258**) and `cd client && npx react-scripts build` (exit 0, **exactly** the 4 pre-existing baseline warning files — `Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`, `WalletNodes/index.jsx` — nothing else).
- This plan is scoped to the Donor tab only. Session 5+ (Chain Activity tab, needs a new backend service) is explicitly **not** in scope.
- **`DonorContext.donorWallet` can be `null` even when the tab is unlocked** — `contexts/DonorContext.jsx:62`'s `isUnlocked = isPremiumTestingUnlocked() || donorStatus?.isDonor === true` means the `PREMIUM_TESTING_MODE` override unlocks the whole page without ever collecting a real wallet. `DonorTab` must render a distinct "no wallet connected" empty state in that case, not a perpetual spinner.

---

## Task 1: Extend `fluxinfo.js`'s shared aggregate with a full per-node lookup

**Files:**
- Modify: `client/src/fluxinfo.js`
- Modify: `client/src/fluxinfoResilience.test.js`
- Modify: `client/src/apidata.js` (one line — carry the new field onto `gstore`)

**Interfaces:**
- Produces: `fetch_fluxinfo_aggregate()`'s resolved `aggregate` object gains a new field, `nodesByIp: { [ip: string]: { ip, tier, containerCount, images, appNames, appCount } }` — every reporting node that had at least one running app (not just the top `TOP_NODES_KEPT = 5` kept in the existing `topNodesByApps`). Every existing field (`imageCounts`, `totalContainers`, `watchtowerContainers`, `wordpressContainers`, `streamrNodes`, `presearchNodes`, `topNodesByApps`, `nodesReporting`) is unchanged. `fetch_total_network_utils(gstore)`'s resolved `gstore` gains the same field, `gstore.nodesByIp`, carried through the same way `gstore.topNodesByApps` already is. Consumed by Task 5's `DonorTab` (via Task 4's `analytics/donorApps.js`) — **reading `gstore.nodesByIp`, not calling `fetch_fluxinfo_aggregate()` a second time.**

This is shared infrastructure other pages already depend on — `client/src/apidata.js:496-552` (`fetchTotalDeployedApps`, called from inside `fetch_total_network_utils`) reads `totalContainers`, `watchtowerContainers`, `streamrNodes`, `presearchNodes`, `wordpressContainers`, `imageCounts`, and `topNodesByApps` from this exact function's output today, and that data flows into `home/HomeOverview`'s App Ecosystem panel among others. **Important:** `fetch_total_network_utils` already calls `fetch_fluxinfo_aggregate()` internally and carries `topNodesByApps` onto `gstore` specifically so nothing needs to "ask for the aggregate a second time" (that phrase is this function's own comment, `apidata.js:550-552`) — `nodesByIp` must be carried the same way, not fetched again by `DonorTab`. This task is additive only in `fluxinfo.js` — read `client/src/fluxinfo.js` in full before touching it, and confirm the change really does leave every existing field byte-identical.

- [ ] **Step 1: Read the current file in full**

Read `client/src/fluxinfo.js` in full (about 250 lines). Confirm `_fluxinfo_aggregate(nodes)` (lines 77-163) still matches this exactly before proceeding — if it has diverged, stop and report rather than guessing:

```js
const FLUXINFO_URL =
  'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Image,apps.runningapps.Names,ip,tier';
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v3'; // v3: adds app names per node
const FLUXINFO_STALE_KEYS = ['fluxinfoAggregate_v1', 'fluxinfoAggregate_v2'];
```

and, inside `_fluxinfo_aggregate`:

```js
  // Descending by app count, ties broken on ip so the order is stable between
  // refreshes rather than reshuffling on equal counts.
  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  return {
    imageCounts,
    totalContainers,
    watchtowerContainers,
    wordpressContainers,
    streamrNodes,
    presearchNodes,
    topNodesByApps,
    nodesReporting: nodes.length
  };
}
```

- [ ] **Step 2: Write the failing tests**

Append to `client/src/fluxinfoResilience.test.js` (after the existing `describe('fetch_fluxinfo_aggregate', ...)` block, same file — this is a regression/behavior suite for exactly this function, not a new file). First add a second fixture near the top of the file, alongside the existing `const NODES = [...]`:

```js
// A second fixture, WITH `ip` set (the existing NODES fixture above omits it
// deliberately, to exercise the "no ip, so perNode stays empty" path — these
// nodes exercise the opposite path, the one nodesByIp needs).
const NODES_WITH_IP = [
  {
    ip: '1.2.3.4:16127',
    tier: 'CUMULUS',
    apps: { runningapps: [{ Image: 'yurinnick/folding-at-home:latest', Names: ['/fluxFoldingAtRunOnFlux1'] }] },
  },
  {
    ip: '5.6.7.8:16127',
    tier: 'STRATUS',
    apps: { runningapps: [] },
  },
];
```

Then add a new `describe` block at the end of the file:

```js
describe('fetch_fluxinfo_aggregate nodesByIp', () => {
  it('keeps a full per-node lookup, not just the top N kept in topNodesByApps', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES_WITH_IP));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    expect(Object.keys(aggregate.nodesByIp)).toEqual(['1.2.3.4:16127']);
    expect(aggregate.nodesByIp['1.2.3.4:16127'].appCount).toBe(1);
    expect(aggregate.nodesByIp['1.2.3.4:16127'].tier).toBe('CUMULUS');
    expect(aggregate.nodesByIp['1.2.3.4:16127'].images).toEqual(['yurinnick/folding-at-home:latest']);
  });

  it('omits a node with no running apps from nodesByIp, same as topNodesByApps', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES_WITH_IP));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    expect(aggregate.nodesByIp['5.6.7.8:16127']).toBeUndefined();
  });

  it('does not change any existing field for the existing NODES fixture', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    // NODES has no `ip` field on any entry, so perNode was always empty for
    // it, before and after this change — topNodesByApps and nodesByIp both
    // stay empty, everything else stays exactly as the existing test above
    // already pins.
    expect(aggregate.topNodesByApps).toEqual([]);
    expect(aggregate.nodesByIp).toEqual({});
    expect(aggregate.totalContainers).toBe(4);
    expect(aggregate.nodesReporting).toBe(3);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/fluxinfoResilience.test.js --watchAll=false`
Expected: FAIL — `aggregate.nodesByIp` is `undefined`.

- [ ] **Step 4: Write the implementation**

In `client/src/fluxinfo.js`, change the cache-key constants:

```js
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v4'; // v4: adds nodesByIp (full per-node app lookup, not just top N)
const FLUXINFO_STALE_KEYS = ['fluxinfoAggregate_v1', 'fluxinfoAggregate_v2', 'fluxinfoAggregate_v3'];
```

Then, inside `_fluxinfo_aggregate`, replace:

```js
  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  return {
    imageCounts,
    totalContainers,
    watchtowerContainers,
    wordpressContainers,
    streamrNodes,
    presearchNodes,
    topNodesByApps,
    nodesReporting: nodes.length
  };
}
```

with:

```js
  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  // Keyed lookup covering EVERY reporting node with running apps, not just
  // the top N kept above. topNodesByApps exists for the Workhorse showcase's
  // "busiest nodes network-wide" need; nodesByIp exists for the opposite
  // need — "what's running on THIS SPECIFIC node" (e.g. a donor's own
  // wallet's nodes, which are essentially never in the top N). Same
  // underlying computation (perNode), just not thrown away.
  const nodesByIp = {};
  for (const entry of perNode) {
    nodesByIp[entry.ip.trim()] = entry;
  }

  return {
    imageCounts,
    totalContainers,
    watchtowerContainers,
    wordpressContainers,
    streamrNodes,
    presearchNodes,
    topNodesByApps,
    nodesByIp,
    nodesReporting: nodes.length
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/fluxinfoResilience.test.js --watchAll=false`
Expected: PASS, all tests in the file (the 3 new ones plus every pre-existing one in this file, unchanged).

- [ ] **Step 6: Carry `nodesByIp` onto `gstore` in `apidata.js` — do not add a second fetch**

Read `client/src/apidata.js:490-553` (`fetchTotalDeployedApps`, called from inside `fetch_total_network_utils`) to confirm it still ends with:

```js
    // Carried on the store so fetch_total_network_utils can build the Workhorse
    // showcase without asking for the aggregate a second time.
    store.topNodesByApps = aggregate.topNodesByApps || [];
  };
```

Add one line directly after it, following the exact same reasoning:

```js
    // Carried on the store so fetch_total_network_utils can build the Workhorse
    // showcase without asking for the aggregate a second time.
    store.topNodesByApps = aggregate.topNodesByApps || [];

    // Same reasoning, for the Donor tab: carried here rather than having
    // DonorTab call fetch_fluxinfo_aggregate() a second time itself.
    store.nodesByIp = aggregate.nodesByIp || {};
  };
```

This function has no existing dedicated unit test (it makes several real network calls internally and isn't mocked in isolation anywhere in this codebase today — `topNodesByApps`'s own identical carry-through line has none either) — Task 1's `fluxinfoResilience.test.js` additions already prove `aggregate.nodesByIp` is computed correctly; this one-line change is verified by the manual spot-check below plus Task 5's own manual walkthrough, matching how `topNodesByApps` was verified when it was added.

- [ ] **Step 7: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 258 (baseline) + 3 = 261.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 8: Manual spot-check — this is shared infrastructure**

`yarn start`, `PREMIUM_TESTING_MODE=true`, navigate to `/home`: confirm the App Ecosystem panel and Top Hosted Apps panel render identically to before this task (same categories, same counts, same top-apps ranking). Then `/analytics` → Apps tab: confirm it too is unaffected. Nothing in this task should change what either panel shows — `nodesByIp`/`gstore.nodesByIp` are new, additive, and unread by anything except Task 5's `DonorTab` (which doesn't exist yet).

- [ ] **Step 9: Commit**

```bash
git add client/src/fluxinfo.js client/src/fluxinfoResilience.test.js client/src/apidata.js
git commit -m "feat(analytics): add nodesByIp to fluxinfo's shared aggregate — full per-node app lookup, not just the top 5"
```

---

## Task 2: `analytics/donorNodes.js` — donor node list, ranked payout selection

**Files:**
- Modify: `client/src/apidata.js` (one-line export addition)
- Create: `client/src/analytics/donorNodes.js`
- Test: `client/src/analytics/donorNodes.test.js`

**Interfaces:**
- Consumes: `getWalletNodes(walletAddress)`, `transformRawNode(node)` (existing, `apidata.js:694`, `apidata.js:723-759` — already used by `main/WalletNodes`), and the newly-exported `DISPLAY_DATE_FORMAT` constant from the same file.
- Produces: `sortByRank(nodes)` — pure, ascending by `rank` (soonest payout first). `mostRecentPayout(nodes)` — pure, the node with the most recently formatted `last_reward`, or `null`. `fetch_donor_nodes(walletAddress)` — fetch/parse layer, `Promise<Array<transformedNode>>` sorted by rank. Consumed by Task 5's `DonorTab`.

- [ ] **Step 1: Export `DISPLAY_DATE_FORMAT` from `apidata.js`**

Read `client/src/apidata.js` around line 685 to confirm it still reads exactly:

```js
const DISPLAY_DATE_FORMAT = 'DD-MMM-YYYY HH:mm:ss';
```

Change it to:

```js
export const DISPLAY_DATE_FORMAT = 'DD-MMM-YYYY HH:mm:ss';
```

This is the exact format `transformRawNode` already uses to write `last_reward` (`apidata.js:754`) — exporting it (rather than duplicating the string in the new module, which would silently drift if this one ever changed) is the only change to this file in this task. Confirm nothing else in `apidata.js` needs touching: `getWalletNodes` (line 694) and `transformRawNode` (line 723) are already exported.

- [ ] **Step 2: Run the full suite to confirm this export-only change breaks nothing**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, still 261 (adding `export` to an already-used-internally constant changes no behavior).

- [ ] **Step 3: Write the failing tests**

Create `client/src/analytics/donorNodes.test.js`:

```js
import { sortByRank, mostRecentPayout } from './donorNodes';

function node(overrides) {
  return { rank: 0, last_reward: '-', next_reward: '-', tier: 'CUMULUS', id: 'x', ip_display: 'x', ...overrides };
}

describe('sortByRank', () => {
  it('sorts ascending by rank — lowest rank (soonest payout) first', () => {
    const nodes = [node({ id: 'c', rank: 300 }), node({ id: 'a', rank: 10 }), node({ id: 'b', rank: 150 })];
    expect(sortByRank(nodes).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const nodes = [node({ id: 'b', rank: 2 }), node({ id: 'a', rank: 1 })];
    const original = [...nodes];
    sortByRank(nodes);
    expect(nodes).toEqual(original);
  });

  it('handles empty and undefined input', () => {
    expect(sortByRank([])).toEqual([]);
    expect(sortByRank(undefined)).toEqual([]);
  });
});

describe('mostRecentPayout', () => {
  it('picks the node with the most recent last_reward', () => {
    const nodes = [
      node({ id: 'old', last_reward: '01-Jan-2026 10:00:00' }),
      node({ id: 'newest', last_reward: '20-Feb-2026 08:30:00' }),
      node({ id: 'middle', last_reward: '05-Feb-2026 12:00:00' }),
    ];
    expect(mostRecentPayout(nodes).id).toBe('newest');
  });

  it('excludes nodes that have never been paid (last_reward === "-")', () => {
    const nodes = [node({ id: 'never', last_reward: '-' }), node({ id: 'paid', last_reward: '01-Jan-2026 00:00:00' })];
    expect(mostRecentPayout(nodes).id).toBe('paid');
  });

  it('returns null when no node has ever been paid', () => {
    expect(mostRecentPayout([node({ last_reward: '-' }), node({ last_reward: '-' })])).toBeNull();
  });

  it('returns null for empty or undefined input', () => {
    expect(mostRecentPayout([])).toBeNull();
    expect(mostRecentPayout(undefined)).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/donorNodes.test.js --watchAll=false`
Expected: FAIL — `donorNodes.js` doesn't exist yet.

- [ ] **Step 5: Write the implementation**

Create `client/src/analytics/donorNodes.js`:

```js
import dayjs from 'dayjs';
import { getWalletNodes, transformRawNode, DISPLAY_DATE_FORMAT } from 'apidata';

/*
 * Pure: soonest-payout-first ordering over a wallet's own transformed node
 * list. main/WalletNodes/index.jsx:129-155 does the same "lowest rank wins"
 * selection today, just picking one node (highestRankedNode) instead of
 * sorting the whole list — this is the same comparison, generalised.
 */
export function sortByRank(nodes) {
  return [...(nodes || [])].sort((a, b) => a.rank - b.rank);
}

/*
 * Pure: the node among the wallet's own that was paid most recently.
 * transformRawNode() only keeps last_reward as a formatted display string
 * (apidata.js:754, DISPLAY_DATE_FORMAT), not the raw lastpaid unix
 * timestamp — parsed back with that same format for comparison rather than
 * re-fetching the raw value separately. '-' (empty_flux_node's default,
 * apidata.js:647) means "never paid" and is excluded rather than sorted as
 * an ancient date.
 */
export function mostRecentPayout(nodes) {
  const paid = (nodes || []).filter((n) => n?.last_reward && n.last_reward !== '-');
  if (paid.length === 0) return null;

  return paid.reduce((latest, n) =>
    dayjs(n.last_reward, DISPLAY_DATE_FORMAT).isAfter(dayjs(latest.last_reward, DISPLAY_DATE_FORMAT)) ? n : latest
  );
}

export async function fetch_donor_nodes(walletAddress) {
  if (!walletAddress) return [];
  const raw = await getWalletNodes(walletAddress);
  return sortByRank((raw || []).map(transformRawNode));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/donorNodes.test.js --watchAll=false`
Expected: PASS, all 8 tests.

- [ ] **Step 7: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 261 (baseline) + 8 = 269.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 8: Commit**

```bash
git add client/src/apidata.js client/src/analytics/donorNodes.js client/src/analytics/donorNodes.test.js
git commit -m "feat(analytics): add donorNodes.js — wallet node list, rank ordering, most-recent-payout selection"
```

---

## Task 3: `analytics/donorUtilization.js` — donor's own resource utilization

**Files:**
- Create: `client/src/analytics/donorUtilization.js`
- Test: `client/src/analytics/donorUtilization.test.js`

**Interfaces:**
- Consumes: `hostOf(address)`, `addressOf(address)`, `fetch_node_benchmarks()`, `fetch_node_resources()` (existing, all from `networkNodes.js`, already shared/deduped — the exact functions `buildWorkhorseNodes` in the same file already joins, `networkNodes.js:108-189`).
- Produces: `aggregateDonorUtilization(donorAddresses, benchmarks, resources)` — pure, `donorAddresses: string[]` (full `"ip:port"` addresses) → `{ nodesWithCapacity, cores: {utilized, total, percentage}, ram: {...}, ssd: {...} }`. `fetch_donor_utilization(donorAddresses): Promise<sameShape>` — fetch/parse layer. Consumed by Task 5's `DonorTab`.

- [ ] **Step 1: Read `buildWorkhorseNodes` first**

Read `client/src/networkNodes.js` in full (about 190 lines) to confirm `buildWorkhorseNodes` (lines 108-189) still matches this join pattern — the part this task mirrors:

```js
  const benchByAddr = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const addr = addressOf(bench?.ipaddress);
    if (addr) benchByAddr[addr] = { bench, tier: entry?.benchmark?.status?.benchmarking || null };
  }

  const geoByHost = {};
  for (const entry of geolocations || []) {
    const geo = entry?.geolocation;
    const host = hostOf(geo?.ip);
    if (host) geoByHost[host] = geo;
  }

  const resByAddr = {};
  for (const entry of resources || []) {
    const addr = addressOf(entry?.ip);
    if (addr) resByAddr[addr] = entry?.apps?.resources || null;
  }
```

and, further down, how capacity/utilised are read off a joined node:

```js
      capacity: b
        ? { cores: b.cores ?? null, ramGB: b.ram ?? null, ssdGB: b.totalstorage ?? b.ssd ?? null }
        : { cores: null, ramGB: null, ssdGB: null },
      utilised: {
        cores: res.appsCpusLocked ?? null,
        ramGB: res.appsRamLocked != null ? res.appsRamLocked / 1024 : null,
        ssdGB: res.appsHddLocked ?? null
      },
```

**Note the discrepancy this task deliberately does NOT copy**: `buildWorkhorseNodes` keys its `benchByAddr` lookup by `addressOf(bench?.ipaddress)` (full address) but a benchmark reading is really per-*machine*, not per-*node* — a host running 3 nodes on different ports shares one physical benchmark. If it works there because the Workhorse showcase happens not to hit that edge case, this task's own join still needs to decide independently: this task keys benchmarks by **host** (`hostOf`), not full address, because a donor's wallet-node list can genuinely include two nodes on the same host (see `networkNodes.js`'s own header comment on why `addressOf` exists at all — "One machine commonly runs several nodes on different ports"), and giving both nodes the same node's full benchmark reading would double-count that host's capacity. Resources stay keyed by full address (`addressOf`) — reservations are genuinely per-node, matching `buildWorkhorseNodes` exactly.

- [ ] **Step 2: Write the failing tests**

Create `client/src/analytics/donorUtilization.test.js`:

```js
import { aggregateDonorUtilization } from './donorUtilization';

const benchmarks = [
  { benchmark: { bench: { ipaddress: '1.2.3.4:16127', cores: 8, ram: 32, totalstorage: 440 } } },
  { benchmark: { bench: { ipaddress: '5.6.7.8:16127', cores: 4, ram: 8, totalstorage: 220 } } },
];

const resources = [
  { ip: '1.2.3.4:16127', apps: { resources: { appsCpusLocked: 2, appsRamLocked: 4096, appsHddLocked: 50 } } },
  { ip: '5.6.7.8:16127', apps: { resources: { appsCpusLocked: 1, appsRamLocked: 1024, appsHddLocked: 10 } } },
];

describe('aggregateDonorUtilization', () => {
  it('sums capacity and utilised resources across the donor\'s own nodes', () => {
    const result = aggregateDonorUtilization(['1.2.3.4:16127', '5.6.7.8:16127'], benchmarks, resources);

    expect(result.nodesWithCapacity).toBe(2);
    expect(result.cores).toEqual({ utilized: 3, total: 12, percentage: 25 });
    expect(result.ram).toEqual({ utilized: 5, total: 40, percentage: 12.5 }); // (4096+1024)/1024 = 5 GB
    expect(result.ssd).toEqual({ utilized: 60, total: 660, percentage: 60 / 660 * 100 });
  });

  it('only counts the donor\'s own addresses, not every node in the lookup', () => {
    const result = aggregateDonorUtilization(['1.2.3.4:16127'], benchmarks, resources);
    expect(result.nodesWithCapacity).toBe(1);
    expect(result.cores).toEqual({ utilized: 2, total: 8, percentage: 25 });
  });

  it('skips a donor address with no matching benchmark/resource entry, rather than throwing', () => {
    const result = aggregateDonorUtilization(['9.9.9.9:16127'], benchmarks, resources);
    expect(result.nodesWithCapacity).toBe(0);
    expect(result.cores).toEqual({ utilized: 0, total: 0, percentage: 0 });
  });

  it('returns all zeros for no donor addresses', () => {
    const result = aggregateDonorUtilization([], benchmarks, resources);
    expect(result).toEqual({
      nodesWithCapacity: 0,
      cores: { utilized: 0, total: 0, percentage: 0 },
      ram: { utilized: 0, total: 0, percentage: 0 },
      ssd: { utilized: 0, total: 0, percentage: 0 },
    });
  });

  it('handles missing/undefined benchmarks and resources gracefully', () => {
    expect(() => aggregateDonorUtilization(['1.2.3.4:16127'], undefined, undefined)).not.toThrow();
    const result = aggregateDonorUtilization(['1.2.3.4:16127'], undefined, undefined);
    expect(result.nodesWithCapacity).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/donorUtilization.test.js --watchAll=false`
Expected: FAIL — `donorUtilization.js` doesn't exist yet.

- [ ] **Step 4: Write the implementation**

Create `client/src/analytics/donorUtilization.js`:

```js
import { hostOf, addressOf, fetch_node_benchmarks, fetch_node_resources } from 'networkNodes';

/*
 * Pure: sum the donor's own nodes' capacity and app-reserved utilisation,
 * joining the same shared benchmark/resource data buildWorkhorseNodes joins
 * for the Workhorse showcase (networkNodes.js:108-189) — filtered to the
 * donor's own addresses instead of ranked by app count.
 *
 * Benchmarks are keyed by HOST (hostOf), not full address: a benchmark
 * reading is per-machine, and a donor's node list can include two nodes on
 * one host (the exact scenario networkNodes.js's own header comment
 * documents addressOf existing for) — keying by full address here would
 * double-count that host's capacity if the donor runs multiple nodes on it.
 * Resources ARE keyed by full address (addressOf) — app reservations are
 * genuinely per-node, matching buildWorkhorseNodes exactly.
 */
export function aggregateDonorUtilization(donorAddresses, benchmarks, resources) {
  const benchByHost = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const host = hostOf(bench?.ipaddress);
    if (host) benchByHost[host] = bench;
  }

  const resByAddr = {};
  for (const entry of resources || []) {
    const addr = addressOf(entry?.ip);
    if (addr) resByAddr[addr] = entry?.apps?.resources || null;
  }

  let totalCores = 0, utilizedCores = 0;
  let totalRamGB = 0, utilizedRamGB = 0;
  let totalSsdGB = 0, utilizedSsdGB = 0;
  let nodesWithCapacity = 0;

  for (const rawAddr of donorAddresses || []) {
    const addr = addressOf(rawAddr);
    const bench = benchByHost[hostOf(addr)];
    const res = resByAddr[addr];

    if (bench) {
      nodesWithCapacity++;
      totalCores += bench.cores || 0;
      totalRamGB += bench.ram || 0;
      totalSsdGB += bench.totalstorage ?? bench.ssd ?? 0;
    }
    if (res) {
      utilizedCores += res.appsCpusLocked || 0;
      utilizedRamGB += res.appsRamLocked != null ? res.appsRamLocked / 1024 : 0;
      utilizedSsdGB += res.appsHddLocked || 0;
    }
  }

  const pct = (used, total) => (total > 0 ? (used / total) * 100 : 0);

  return {
    nodesWithCapacity,
    cores: { utilized: utilizedCores, total: totalCores, percentage: pct(utilizedCores, totalCores) },
    ram: { utilized: utilizedRamGB, total: totalRamGB, percentage: pct(utilizedRamGB, totalRamGB) },
    ssd: { utilized: utilizedSsdGB, total: totalSsdGB, percentage: pct(utilizedSsdGB, totalSsdGB) },
  };
}

export async function fetch_donor_utilization(donorAddresses) {
  const [benchmarks, resources] = await Promise.all([fetch_node_benchmarks(), fetch_node_resources()]);
  return aggregateDonorUtilization(donorAddresses, benchmarks, resources);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/donorUtilization.test.js --watchAll=false`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 269 (baseline) + 5 = 274.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 7: Commit**

```bash
git add client/src/analytics/donorUtilization.js client/src/analytics/donorUtilization.test.js
git commit -m "feat(analytics): add donorUtilization.js — donor node capacity/utilisation rollup"
```

---

## Task 4: `analytics/donorApps.js` — donor's apps by category

**Files:**
- Create: `client/src/analytics/donorApps.js`
- Test: `client/src/analytics/donorApps.test.js`

**Interfaces:**
- Consumes: `categorizeApp(image)` (existing, `main/Gamification/appCategories.js:177-184`).
- Produces: `aggregateDonorAppsByCategory(nodesByIp, donorAddresses)` — pure, `nodesByIp: {[ip]: {images: string[], ...}}` (Task 1's new field), `donorAddresses: string[]` → `{ categories: Array<{category, count}> (sorted descending), totalApps: number }`. Consumed by Task 5's `DonorTab`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/analytics/donorApps.test.js`:

```js
import { aggregateDonorAppsByCategory } from './donorApps';

const nodesByIp = {
  '1.2.3.4:16127': { images: ['yurinnick/folding-at-home:latest', 'runonflux/wp-nginx:latest'] },
  '5.6.7.8:16127': { images: ['itzg/minecraft-server:latest'] },
  '9.9.9.9:16127': { images: ['someone/unrelated-node-not-the-donors:latest'] },
};

describe('aggregateDonorAppsByCategory', () => {
  it('tallies one entry per running container (image), by category, across the donor\'s own nodes only', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127', '5.6.7.8:16127']);

    expect(totalApps).toBe(3);
    // computing: folding-at-home, web: wp-nginx, gaming: minecraft
    const byCat = Object.fromEntries(categories.map((c) => [c.category, c.count]));
    expect(byCat.computing).toBe(1);
    expect(byCat.web).toBe(1);
    expect(byCat.gaming).toBe(1);
  });

  it('sorts categories descending by count', () => {
    const twoOnOneNode = {
      '1.1.1.1:1': { images: ['yurinnick/folding-at-home:latest', 'boinc/client:latest', 'itzg/minecraft-server:latest'] },
    };
    const { categories } = aggregateDonorAppsByCategory(twoOnOneNode, ['1.1.1.1:1']);
    expect(categories[0]).toEqual({ category: 'computing', count: 2 });
    expect(categories[1]).toEqual({ category: 'gaming', count: 1 });
  });

  it('never counts an address that is not the donor\'s own', () => {
    const { totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127']);
    expect(totalApps).toBe(2); // not 3 — 9.9.9.9's app is excluded
  });

  it('skips a donor address with no matching nodesByIp entry, rather than throwing', () => {
    expect(() => aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'])).not.toThrow();
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0']);
    expect(categories).toEqual([]);
    expect(totalApps).toBe(0);
  });

  it('returns an empty result for no donor addresses or an empty/undefined lookup', () => {
    expect(aggregateDonorAppsByCategory(nodesByIp, [])).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory({}, ['1.2.3.4:16127'])).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory(undefined, undefined)).toEqual({ categories: [], totalApps: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/donorApps.test.js --watchAll=false`
Expected: FAIL — `donorApps.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `client/src/analytics/donorApps.js`:

```js
import { categorizeApp } from 'main/Gamification/appCategories';

/*
 * Pure: tally the donor's own running apps by category, from the IP-keyed
 * lookup Task 1 added to fluxinfo.js's fetch_fluxinfo_aggregate() output
 * (nodesByIp — added specifically so a wallet's own, typically-not-top-5
 * nodes are visible here at all; the pre-existing topNodesByApps only ever
 * covers the network's 5 busiest nodes).
 *
 * Categorizes by DOCKER IMAGE (repotag), not app name — this codebase's
 * established preference (main/Gamification/appCategories.js's own header
 * comment, and categorizeAppSpec's identical choice): the repotag is right
 * far more often than the user-chosen name.
 *
 * Tallies one entry per running CONTAINER, matching the network-wide App
 * Ecosystem panel's own convention — a multi-component compose app
 * contributes one count per component, not one per app.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses) {
  const perCategory = {};
  let totalApps = 0;

  for (const addr of donorAddresses || []) {
    const node = nodesByIp?.[addr];
    if (!node) continue;

    for (const image of node.images || []) {
      const cat = categorizeApp(image);
      perCategory[cat] = (perCategory[cat] || 0) + 1;
      totalApps++;
    }
  }

  const categories = Object.entries(perCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return { categories, totalApps };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/donorApps.test.js --watchAll=false`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 274 (baseline) + 5 = 279.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/donorApps.js client/src/analytics/donorApps.test.js
git commit -m "feat(analytics): add donorApps.js — donor's own running apps tallied by category"
```

---

## Task 5: `DonorTab` — assemble the tab, wire it into `Analytics.jsx`

**Files:**
- Create: `client/src/analytics/DonorTab/index.jsx`
- Create: `client/src/analytics/DonorTab/index.scss`
- Modify: `client/src/analytics/Analytics.jsx`

**Interfaces:**
- Consumes: `useDonorStatus()` (existing, `contexts/DonorContext`) for `donorWallet`; `DonorUnlockDialog` (existing, `donor/DonorUnlockDialog`) for the no-wallet empty state; `fetch_donor_nodes`, `sortByRank`, `mostRecentPayout` (Task 2); `fetch_donor_utilization` (Task 3); `aggregateDonorAppsByCategory` (Task 4); `fetch_global_stats`, `fetch_total_network_utils` (existing, `apidata` — the same two-call sequence `AppsTab`/`NetworkTab` already use for their own `gstore`; Task 1 made this call's resolved `gstore` also carry `nodesByIp` — **do not call `fetch_fluxinfo_aggregate` directly from this file, `fetch_total_network_utils` already calls it internally and carries the result through, exactly like it already does for `topNodesByApps`**); `APP_CATEGORY_META` (existing, `content/appCategoryMeta`).
- Produces: `DonorTab()` — no props, self-contained data fetching. Mounted as the `/analytics` page's third tab; no other task depends on this one's exports.

- [ ] **Step 1: Confirm `DonorUnlockDialog`'s props and `PremiumGate`'s locked-state copy**

Read `client/src/donor/DonorUnlockDialog/index.jsx` in full to confirm its props are `isOpen` and `onClose` (a controlled dialog, opened/closed by the parent's own state — the same pattern `donor/PremiumGate/index.jsx` already uses). Read `client/src/donor/PremiumGate/index.jsx` in full too — its locked-state markup (`Lock` icon from `lucide-react`, a title, a body line, an "Unlock" `Button` that opens the dialog) is the visual/copy precedent this task's own no-wallet empty state should read as a sibling of, not a copy-paste of (different situation: the *page* isn't locked here, the tab just has no wallet to show data for).

- [ ] **Step 2: Confirm `Analytics.jsx`'s current content**

Read `client/src/analytics/Analytics.jsx` in full (it's short) to confirm it still matches this exactly:

```jsx
import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import { NetworkTab } from 'analytics/NetworkTab';
import './Analytics.scss';

/*
 * Two tabs exist today (Apps, Network). Donor/Chain Activity land in later
 * sessions — add each as one more <Tab> entry here, not a restructure.
 * Gated by PremiumGate at the route level (Application.jsx), same as
 * /live — this component only renders once already unlocked.
 */
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
      </Tabs>
    </div>
  );
}
```

If it has diverged, stop and report rather than guessing.

- [ ] **Step 3: Write `DonorTab`**

Create `client/src/analytics/DonorTab/index.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Spinner, Button } from '@blueprintjs/core';
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonorUnlockDialog } from 'donor/DonorUnlockDialog';
import { fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { fetch_donor_nodes, sortByRank, mostRecentPayout } from 'analytics/donorNodes';
import { fetch_donor_utilization } from 'analytics/donorUtilization';
import { aggregateDonorAppsByCategory } from 'analytics/donorApps';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function fmtPct(n) {
  return `${(n || 0).toFixed(1)}%`;
}

// ── Payout card ──────────────────────────────────────────────────────────

function PayoutCard({ nextNode, lastPaidNode }) {
  return (
    <div className="hov-panel dt-payout-card">
      <div className="dt-payout-stat">
        <span className="hov-header-title">LAST PAYOUT</span>
        <span className="dt-payout-value">{lastPaidNode ? lastPaidNode.last_reward : 'Never'}</span>
        {lastPaidNode && <span className="dt-payout-caption">{lastPaidNode.ip_display}</span>}
      </div>
      <div className="dt-payout-divider" />
      <div className="dt-payout-stat">
        <span className="hov-header-title">NEXT PAYOUT</span>
        <span className="dt-payout-value">{nextNode ? nextNode.next_reward : '—'}</span>
        {nextNode && <span className="dt-payout-caption">{nextNode.ip_display}</span>}
      </div>
    </div>
  );
}

// ── His nodes ────────────────────────────────────────────────────────────

function DonorNodesList({ nodes }) {
  return (
    <div className="hov-panel dt-nodes-panel">
      <div className="hov-header">
        <span className="hov-header-title">HIS NODES</span>
        <span className="hov-header-badge">{nodes.length}</span>
      </div>
      <div className="hov-ranked-list">
        {nodes.length === 0 ? (
          <div className="hov-empty">No nodes found for this wallet</div>
        ) : (
          nodes.map((n) => (
            <div key={n.id} className="hov-ranked-row">
              <span className="dt-node-tier">{n.tier}</span>
              <span className="hov-ranked-name" title={n.ip_display}>{n.ip_display}</span>
              <span className="hov-badge">Rank {fmtNum(n.rank)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Apps by category ─────────────────────────────────────────────────────

function AppsByCategoryPanel({ categories, totalApps }) {
  const maxVal = categories[0]?.count || 1;

  return (
    <div className="hov-panel dt-apps-panel">
      <div className="hov-header">
        <span className="hov-header-title">APPS ON HIS NODES</span>
        {totalApps > 0 && <span className="hov-header-badge">{totalApps}</span>}
      </div>
      <div className="dt-apps-list">
        {categories.length === 0 ? (
          <div className="hov-empty">No running apps found</div>
        ) : (
          categories.map(({ category, count }) => {
            const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
            const { label, Icon, color } = meta;
            const barPct = (count / maxVal) * 100;
            return (
              <div key={category} className="dt-apps-row">
                <span className="dt-apps-icon" style={{ color }}>
                  <Icon size={11} />
                </span>
                <span className="dt-apps-label">{label}</span>
                <div className="dt-apps-bar-wrap">
                  <div className="dt-apps-bar-fill" style={{ width: `${barPct}%`, background: color }} />
                </div>
                <span className="hov-badge">{fmtNum(count)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Utilization comparison ───────────────────────────────────────────────

const RESOURCE_ROWS = [
  { key: 'cores', label: 'CPU Cores' },
  { key: 'ram', label: 'RAM' },
  { key: 'ssd', label: 'SSD' },
];

function UtilizationPanel({ donorUtil, networkPct }) {
  return (
    <div className="hov-panel dt-util-panel">
      <div className="hov-header">
        <span className="hov-header-title">UTILIZATION VS NETWORK AVERAGE</span>
      </div>
      {donorUtil.nodesWithCapacity === 0 ? (
        <div className="hov-empty">No capacity data available for his nodes</div>
      ) : (
        <div className="dt-util-list">
          {RESOURCE_ROWS.map(({ key, label }) => {
            const his = donorUtil[key].percentage;
            const net = networkPct[key] || 0;
            return (
              <div key={key} className="dt-util-row">
                <span className="dt-util-label">{label}</span>
                <div className="dt-util-bars">
                  <div className="dt-util-bar-wrap">
                    <div className="dt-util-bar-fill dt-util-bar-fill--his" style={{ width: `${Math.min(his, 100)}%` }} />
                  </div>
                  <span className="dt-util-figure">{fmtPct(his)} his</span>
                </div>
                <div className="dt-util-bars">
                  <div className="dt-util-bar-wrap">
                    <div className="dt-util-bar-fill dt-util-bar-fill--network" style={{ width: `${Math.min(net, 100)}%` }} />
                  </div>
                  <span className="dt-util-figure">{fmtPct(net)} network avg</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── No-wallet empty state ────────────────────────────────────────────────

function NoWalletState() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="dt-empty">
      <Lock size={28} className="dt-empty-icon" />
      <span className="dt-empty-title">No donor wallet connected</span>
      <span className="dt-empty-body">
        Unlock with a real donor wallet to see your own nodes' payout timing, apps, and utilization.
      </span>
      <Button text="Unlock" intent="primary" onClick={() => setDialogOpen(true)} />
      <DonorUnlockDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export function DonorTab() {
  const { donorWallet } = useDonorStatus();

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [utilization, setUtilization] = useState({
    nodesWithCapacity: 0,
    cores: { utilized: 0, total: 0, percentage: 0 },
    ram: { utilized: 0, total: 0, percentage: 0 },
    ssd: { utilized: 0, total: 0, percentage: 0 },
  });
  const [appCategories, setAppCategories] = useState({ categories: [], totalApps: 0 });
  const [networkPct, setNetworkPct] = useState({ cores: 0, ram: 0, ssd: 0 });

  useEffect(() => {
    if (!donorWallet) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const donorNodes = await fetch_donor_nodes(donorWallet);
      if (cancelled) return;
      setNodes(donorNodes);

      const addresses = donorNodes.map((n) => n.ip_display).filter(Boolean);

      // fetch_total_network_utils() already calls fetch_fluxinfo_aggregate()
      // internally and carries nodesByIp through onto its resolved gstore
      // (apidata.js's fetchTotalDeployedApps, Task 1) — read it from there
      // rather than fetching the ~726KB fluxinfo payload a second time.
      const [util, stage1] = await Promise.all([
        fetch_donor_utilization(addresses),
        fetch_global_stats(null),
      ]);
      if (cancelled) return;

      setUtilization(util);

      const gstore = await fetch_total_network_utils(stage1);
      if (cancelled) return;

      setAppCategories(aggregateDonorAppsByCategory(gstore.nodesByIp || {}, addresses));
      setNetworkPct({
        cores: gstore.utilized.cores_percentage,
        ram: gstore.utilized.ram_percentage,
        ssd: gstore.utilized.ssd_percentage,
      });

      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [donorWallet]);

  if (!donorWallet) {
    return (
      <div className="donor-tab">
        <NoWalletState />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="donor-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const nextNode = sortByRank(nodes)[0] || null;
  const lastPaidNode = mostRecentPayout(nodes);

  return (
    <div className="donor-tab">
      <PayoutCard nextNode={nextNode} lastPaidNode={lastPaidNode} />
      <div className="donor-tab-panel-grid">
        <DonorNodesList nodes={nodes} />
        <AppsByCategoryPanel categories={appCategories.categories} totalApps={appCategories.totalApps} />
        <UtilizationPanel donorUtil={utilization} networkPct={networkPct} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `DonorTab`'s stylesheet**

Create `client/src/analytics/DonorTab/index.scss` — a self-contained copy of the panel chrome this tab needs, following the same "independent copies" convention as `NetworkTab/index.scss` (read that file first as the template for which base classes to duplicate: `.hov-panel`, `.hov-header`, `.hov-header-title`, `.hov-header-badge`, `.hov-empty`, `.hov-panel-center` + its shimmer keyframes, `.hov-ranked-list`, `.hov-ranked-row`, `.hov-badge`):

```scss
@import 'styles/functional';

.donor-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.donor-tab-panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
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

.dt-payout-card {
  display: flex;
  align-items: center;
  border-left: 2px solid #f59e0b;
}

.dt-payout-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dt-payout-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.dt-payout-caption {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.dt-payout-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border-secondary);
  margin: 0 20px;
}

.dt-nodes-panel {
  border-left: 2px solid #10b981;
}

.dt-apps-panel {
  border-left: 2px solid #6366f1;
}

.dt-util-panel {
  border-left: 2px solid #ec4899;
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
    animation: shimmer 1.8s ease-in-out infinite;
    border-radius: var(--radius-sm);
    opacity: 0.6;
    pointer-events: none;
  }
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.hov-ranked-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hov-ranked-row {
  display: grid;
  align-items: center;
  gap: 6px;
  grid-template-columns: 60px 1fr 70px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  border-bottom: 1px solid rgba(128, 128, 128, 0.07);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--surface-inset);
  }

  &:last-child {
    border-bottom: none;
  }
}

.dt-node-tier {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.hov-ranked-name {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
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

// ── Apps by category ─────────────────────────────────────────────────────

.dt-apps-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dt-apps-row {
  display: grid;
  align-items: center;
  gap: 8px;
  grid-template-columns: 16px 90px 1fr 40px;
  padding: 3px 0;
}

.dt-apps-icon {
  display: flex;
  align-items: center;
}

.dt-apps-label {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.dt-apps-bar-wrap {
  height: 6px;
  border-radius: 3px;
  background: var(--surface-inset);
  overflow: hidden;
}

.dt-apps-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

// ── Utilization ──────────────────────────────────────────────────────────

.dt-util-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dt-util-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dt-util-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dt-util-bars {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dt-util-bar-wrap {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-inset);
  overflow: hidden;
}

.dt-util-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);

  &--his {
    background: #ec4899;
  }

  &--network {
    background: rgba(128, 128, 128, 0.5);
  }
}

.dt-util-figure {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  width: 110px;
  text-align: right;
}

// ── No-wallet empty state ────────────────────────────────────────────────

.dt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;
}

.dt-empty-icon {
  color: var(--text-tertiary);
}

.dt-empty-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.dt-empty-body {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  max-width: 360px;
}
```

- [ ] **Step 5: Wire `DonorTab` into `Analytics.jsx`**

Replace `client/src/analytics/Analytics.jsx` with:

```jsx
import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import { NetworkTab } from 'analytics/NetworkTab';
import { DonorTab } from 'analytics/DonorTab';
import './Analytics.scss';

/*
 * Three tabs exist today (Apps, Network, Donor). Chain Activity lands in a
 * later session — add it as one more <Tab> entry here, not a restructure.
 * Gated by PremiumGate at the route level (Application.jsx), same as
 * /live — this component only renders once already unlocked.
 */
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
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 6: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, still 279 (this task adds no new automated tests — `DonorTab` is a data-assembling component, verified manually below, matching how Session 2 treated `AppsTab` and Session 3 treated `NetworkTab`).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 7: Manual check**

`yarn start`, with `PREMIUM_TESTING_MODE=true` set in `client/public/runtime/app-content.js`:

- Navigate to `/analytics` → **Donor** tab with no wallet ever connected: the "No donor wallet connected" empty state renders, clicking "Unlock" opens `DonorUnlockDialog`.
- Enter a real, well-known wallet address with nodes (e.g. one visible on `/nodes` with several nodes) via the unlock dialog or by first visiting `/nodes?wallet=<address>` so `donorWallet` gets set — confirm the Donor tab then shows: a plausible last/next payout pair, a "His Nodes" list matching the node count from `/nodes` for that wallet, an apps-by-category breakdown (may be empty/small if the test wallet's nodes host little), and a utilization panel with his % vs. network-average % bars.
- Try a wallet address with **zero** nodes — confirm every panel shows its own empty state gracefully (no crash, no `NaN%`, no blank white panel).
- Open the browser console — no errors on either state.

- [ ] **Step 8: Commit**

```bash
git add client/src/analytics/DonorTab client/src/analytics/Analytics.jsx
git commit -m "feat(analytics): build the Donor tab — payout timing, his nodes, apps by category, utilization vs network"
```

---

## Final milestone: full regression pass

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 279 total (258 baseline + 21 new across Tasks 1-4).

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 3: Full manual walkthrough, fresh**

`yarn start`, with `PREMIUM_TESTING_MODE=true`:

- `/home` — App Ecosystem and Top Hosted Apps panels identical to before this plan started (Task 1 touched shared infrastructure they depend on — this is the one real regression risk in this plan).
- `/nodes` — unaffected.
- `/live` — unaffected.
- `/analytics` → **Apps** tab — identical to how Session 2/3 left it.
- `/analytics` → **Network** tab — identical to how Session 3 left it.
- `/analytics` → **Donor** tab (new) — all three states checked in Task 5's manual check (no wallet, a wallet with nodes, a wallet with zero nodes).
- Toggle light/dark theme on the Donor tab — panel chrome, payout card, and utilization bars all read correctly in both.

- [ ] **Step 4: Update `PREMIUM_FEATURES_PLAN.md`**

Change the Session 4 line in the "Build order" section from:

```markdown
- [ ] **Session 4 — Donor tab.** Depends on Session 1 (real `donorWallet`). Reuses
  `PayoutTimer`'s prediction logic, the wallet's existing node-list fetch, and
  per-node running-apps data. No backend.
```

to:

```markdown
- [x] **Session 4 — Donor tab.** Done. Payout timing, his nodes, apps-by-category, and
  utilization-vs-network-average, all for `DonorContext.donorWallet`. Reused the
  wallet's existing node-list fetch (`getWalletNodes`/`transformRawNode`) rather than
  `PayoutTimer` itself (a stateful component with no reusable pure logic — its data was
  already sitting per-node in `transformRawNode`'s output). Extended `fluxinfo.js`'s
  shared aggregate with a full per-node app lookup (`nodesByIp`) since the donor's own
  nodes are essentially never in the existing top-5-busiest list it kept before. No
  backend.
```

Change the "### Donor tab (Session 4)" section heading and its four bullets from:

```markdown
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
```

to:

```markdown
### Donor tab (Session 4) — Built

Personal analytics for `DonorContext.donorWallet`.

- **Last/next payment** — Built. Turned out `main/PayoutTimer/index.jsx` had no reusable
  prediction logic to extend (its countdown lives entirely in component state) — but the
  data it needs was already sitting per-node in `apidata.js`'s `transformRawNode()`
  output (`last_reward`, `next_reward`, both already computed on every wallet node-list
  fetch). `analytics/donorNodes.js`'s `mostRecentPayout()`/`sortByRank()` pick the right
  node from the donor's own list for each figure.
- **His nodes** — Built, via the same `getWalletNodes`/`transformRawNode` fetch above.
- **Apps hosted on his nodes, by category** — Built. `fluxinfo.js`'s shared aggregate
  discarded per-node app data for every node except the network's top 5 busiest, and a
  donor's own nodes are essentially never in that top 5 — extended the aggregate with a
  full `nodesByIp` lookup (`fluxinfo.js`, additive, existing consumers unaffected) rather
  than adding a second, duplicate network fetch just for this tab.
  `analytics/donorApps.js` categorizes by Docker image (repotag), matching this
  codebase's established preference over app-name matching.
- **Node utilization** — Built, via `networkNodes.js`'s already-shared benchmark/resource
  fetchers (the same join `buildWorkhorseNodes` already does for the Workhorse showcase,
  filtered to the donor's own addresses) compared against
  `fetch_total_network_utils(gstore)`'s existing network-wide percentages — no new fetch
  needed for the network-average side at all.
```

Commit:

```bash
git add PREMIUM_FEATURES_PLAN.md
git commit -m "docs: mark Session 4 (Donor tab) complete"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/analytics-session4
gh pr create --base main --title "Analytics page: Donor tab (Session 4)" --body "..."
```

Note in the PR body which manual checks were run and their outcomes, following this repo's established convention (see PR #174's body for the format).
