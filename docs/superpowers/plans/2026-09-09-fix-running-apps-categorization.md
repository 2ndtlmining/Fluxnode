# Fix Running-App Categorization (Issue #187) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Home page's running-app stats/categories, the Workhorse
showcase's per-node category chips, and the Analytics Donor tab's "apps by
category" panel, all of which silently broke when `stats.runonflux.io/fluxinfo`
stopped returning a docker `Image` field on `apps.runningapps[]` entries
(GitHub issue #187) — by re-deriving category/repotag from the app **name**
joined against `globalappsspecifications` (which still has the real repotag),
instead of matching a docker image string that the API no longer sends.

**Architecture:** `fluxinfo.js`'s aggregation step can only recover the app
**name** from each running container now (via the existing
`appNameFromContainer`), not its image. A new pure module joins those names
against a name-keyed index of `globalappsspecifications` (built with the
existing `buildSpecIndex` helper) to recover repotag/category exactly the way
`AppsSection` and `WorkhorsePanel`'s per-app table already do. Getting that
index into the running-apps aggregation step safely (without racing the
already-cached, block-height-dependent `fetch_global_app_specs` call) requires
splitting that function's cache into a safe raw-specs cache plus a
recompute-every-call layer on top.

**Tech Stack:** React 18 (CRA), plain JS data modules under `client/src/`,
Jest + `@testing-library` via `react-scripts test`.

**Spec:** GitHub issue #187 (`gh issue view 187 --repo 2ndtlmining/Fluxnode`).
No separate spec doc — this plan doubles as the spec write-up because the
investigation (which files are actually affected) *is* most of the work; see
"Investigation findings" below, which every task assumes as read.

## Investigation findings (read first)

Confirmed live against the real APIs on 2026-09-09:

- `curl 'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps,ip'`
  — every `runningapps[]` entry now has only `Names`, `State`, `Status`. No
  `Image` field anywhere in a fresh ~7,200-container sample. This matches the
  issue's screenshot exactly.
- `curl 'http://<a live node>:<port>/apps/installedapps'` — **unchanged**,
  still returns full specs with `compose[].repotag`. This is the endpoint the
  Rust API's `/api/v1/node-single/` uses (`api/src/core.rs:54`,
  `apps/installedapps`) and what `client/src/main/AppsSection/index.jsx` (the
  Node page's Apps tab) is built on, joined against
  `globalappsspecifications` for category. **Neither is touched by this
  issue.** The issue's suspicion that the Node page's Apps tab and its
  GitHub-vs-Docker icon would break does not hold up — no code change needed
  there. Confirmed no other file under `client/src/` reads
  `apps.runningapps.Image`; `grep -rn "\.Image\b" client/src` matches only
  `fluxinfo.js` and its own test file.
- The Live page (`client/src/live/`) is **also unaffected**. Its deploy/
  confirm/reward event `repos` field comes from diffing successive
  `globalappsspecifications` snapshots (`live/apidata.js`'s `composeRepos()`),
  never from `fluxinfo`'s `runningapps`. `grep -rn "fluxinfo\|runningapps"
  client/src/live` returns nothing.
- Every actually-broken consumer traces back to one root: `client/src/
  fluxinfo.js`'s `_fluxinfo_aggregate()` reads `app.Image`, which is now
  always `undefined`. That empties `imageCounts` and every per-node `images`
  array, which breaks, in order of visibility:
  1. **Home page** (`/home`) — App Ecosystem panel (permanently "unavailable"),
     Top Hosted Apps panel (**stuck on an infinite spinner** — worst of the
     regressions, no error shown at all), header stat cells "Total Running
     Apps instances" (silently **inflated** — watchtower no longer
     subtracted), "Presearch/Streamr Running Apps" and "Wordpress Instances"
     (all silently **0**), and the Workhorse showcase's per-node "Categories"
     row (empty; the per-app name/repo/cpu/ram/ssd table next to it is fine —
     it already joins by app name against specs).
  2. **Analytics Apps tab** (`/analytics`) — reuses the exact same
     `AppEcosystemBreakdown`/`TopHostedApps` components as Home (PR #173), so
     it breaks identically.
  3. **Analytics Donor tab** — `analytics/donorApps.js`'s
     `aggregateDonorAppsByCategory` reads `nodesByIp[ip].images`, always
     empty now, so a donor's own "apps by category" panel shows nothing.
  4. Analytics Network/Chain Activity tabs are unaffected (owner/geolocation
     fields and the Rust-side block scanner, no relation to `runningapps`).
- Live-verified an important detail for the fix design: `appNameFromContainer`
  already returns `null` for `/watchtower` (it requires a `flux`-prefixed
  container name; watchtower's isn't), and a live scan of ~7,200 running
  containers found **zero** matching `watchtower` by name either — so
  watchtower containers are not present in this projection at all (whether
  historically or now). `totalRunningApps` can safely become "containers
  whose app name we could resolve" instead of "total minus an image match we
  can no longer make" — see Task 4.
- Grouping running containers by **app name** instead of image would badly
  under-count popular apps: Flux app names are per-deployment-unique (e.g.
  `FoldingAtRunOnFlux13`, `palworld1786553912828`), so ~2,400 Folding@Home
  instances that used to collapse into one `yurinnick/folding-at-home:latest`
  bucket would otherwise show as ~2,400 separate rows of count 1. The fix
  must join name → spec → **repotag** before bucketing, not bucket by name
  directly.

## Global Constraints

- No Rust/API changes — this is 100% client-side (`client/src/`); the Rust
  API never touched `apps.runningapps` (confirmed: `grep -rn "runningapps"
  api/src` is empty).
- Test with `cd client && CI=true npx react-scripts test --watchAll=false`,
  build with `npx react-scripts build`. Baseline before this plan: 317 tests,
  build exit 0, exactly 4 pre-existing baseline warning files (Navbar/
  index.jsx, NodeGridTable/index.jsx, LayoutContext.jsx, WalletNodes/
  index.jsx) — anything beyond those four post-build is new work to fix.
  Every task below ends by running the suite; only the final task builds.
- Preserve every existing field name on `gstore` that downstream components
  already read unless a task explicitly says to rename it (renames are
  called out with every call site that must change).
- Do not re-introduce the #144 regression: never silently fall back to
  `globalappsspecifications`-derived counts as a *replacement* dataset when
  `fluxinfo` is down — `runningAppsStatus`/`runningAppsFetchedAt` stay the
  single source of truth for "is this live/stale/unavailable", untouched by
  this plan.
- `client/public/runtime/app-content.js`'s `PREMIUM_TESTING_MODE` toggle:
  flip to `true` for local manual testing of the Donor tab, **always revert
  to `false` before committing**.

---

## File Structure

- Modify: `client/src/fluxinfo.js` — drop `Image` projection/parsing, emit
  per-container app names instead of per-container images.
- Modify: `client/src/fluxinfoResilience.test.js` — update fixtures/
  assertions for the new field names.
- Modify: `client/src/apidata.js` — split `fetch_global_app_specs`'s cache
  so a safe, block-height-independent raw-specs layer can be reused from
  `fetchTotalDeployedApps`; wire the new categorization module in; rename
  `topRunningImages` → `topRunningApps`.
- Create: `client/src/runningAppsCategorized.js` — the new pure join/
  categorization module.
- Create: `client/src/runningAppsCategorized.test.js` — its unit tests.
- Modify: `client/src/home/WorkhorsePanel/index.jsx` — per-node "Categories"
  row, joined by name instead of by (gone) image.
- Modify: `client/src/components/TopHostedApps/index.jsx` — one-line field
  rename to match `topRunningApps`.
- Modify: `client/src/analytics/donorApps.js` — join by name against a spec
  index instead of reading `.images`.
- Modify: `client/src/analytics/donorApps.test.js` — update fixtures.
- Modify: `client/src/analytics/DonorTab/index.jsx` — fetch the (now cheap,
  shared-cache) raw specs alongside its existing fetches, pass the index in.

---

### Task 1: `fluxinfo.js` — stop depending on the removed `Image` field

**Files:**
- Modify: `client/src/fluxinfo.js`
- Test: `client/src/fluxinfoResilience.test.js`

**Interfaces:**
- Produces: `fetch_fluxinfo_aggregate()`'s resolved `aggregate` now has
  `nameCounts` (object, app name → running-container count) instead of
  `imageCounts`; drops `watchtowerContainers`, `wordpressContainers`,
  `streamrNodes`, `presearchNodes` (moved to Task 3, which needs spec data
  this module doesn't have); each `nodesByIp`/`topNodesByApps` entry's
  `images: string[]` field is renamed to `containerAppNames: string[]` (same
  one-entry-per-running-container shape, now holding names instead of
  images). `appNames` (deduped) and `appCount` on those entries are
  unchanged.

- [ ] **Step 1: Update the projection URL and write the failing aggregation test**

Edit the `FLUXINFO_URL` constant (line 26) to drop the now-nonexistent
`Image` field:

```js
const FLUXINFO_URL =
  'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Names,ip,tier';
```

Bump the cache key version since the aggregate shape changes (matches the
existing convention — `v3` bumped to `v4` for the same reason):

```js
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v5'; // v5: Image field removed from the API (#187) — imageCounts replaced by nameCounts, per-node `images` renamed `containerAppNames`
const FLUXINFO_STALE_KEYS = ['fluxinfoAggregate_v1', 'fluxinfoAggregate_v2', 'fluxinfoAggregate_v3', 'fluxinfoAggregate_v4'];
```

In `client/src/fluxinfoResilience.test.js`, replace the `NODES` and
`NODES_WITH_IP` fixtures (they currently carry `Image`, which the real API no
longer sends) and the assertions that key off it:

```js
const NODES = [
  { apps: { runningapps: [{ Names: ['/fluxFoldingAtHome_FoldingAtRunOnFlux1'] }, { Names: ['/fluxwp_wordpress123'] }] } },
  { apps: { runningapps: [{ Names: ['/fluxPresearch'] }] } },
  { apps: { runningapps: [{ Names: ['/fluxFoldingAtHome_FoldingAtRunOnFlux2'] }] } },
];

const NODES_WITH_IP = [
  {
    ip: '1.2.3.4:16127',
    tier: 'CUMULUS',
    apps: { runningapps: [{ Names: ['/fluxFoldingAtHome_FoldingAtRunOnFlux1'] }] },
  },
  {
    ip: '5.6.7.8:16127',
    tier: 'STRATUS',
    apps: { runningapps: [] },
  },
];
```

Update the first test (`'aggregates a successful response and reports it as
live'`) to match — the watchtower/wordpress/streamr/presearch counters no
longer exist on this module's aggregate:

```js
  it('aggregates a successful response and reports it as live', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));

    const { aggregate, status } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('live');
    expect(aggregate.totalContainers).toBe(4);
    expect(aggregate.nodesReporting).toBe(3);
    expect(aggregate.nameCounts.FoldingAtRunOnFlux1).toBe(1);
    expect(aggregate.nameCounts.FoldingAtRunOnFlux2).toBe(1);
    expect(aggregate.nameCounts.wordpress123).toBe(1);
  });
```

Delete the `wordpressContainers`/`presearchNodes` assertions from the
`'retries and succeeds...'` test (keep only `totalContainers`, already the
case). In `'does not throw when a node reports without apps.runningapps'`,
the fixture already reuses `NODES`, no change needed beyond the fixture edit
above. In the `'ignores a cache entry older than the stale window'` test,
change the seeded stale cache payload's shape from `imageCounts` to
`nameCounts` (either key works to prove staleness is ignored, but keep it
truthful):

```js
      JSON.stringify({
        aggregate: { nameCounts: { busybox: 1 }, totalContainers: 1 },
        timestamp: Date.now() - 7 * 60 * 60 * 1000, // window is 6h
      })
```

In the `nodesByIp` describe block, change the `images` assertion:

```js
    expect(aggregate.nodesByIp['1.2.3.4:16127'].containerAppNames).toEqual(['FoldingAtRunOnFlux1']);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern fluxinfoResilience`
Expected: FAIL — `aggregate.nameCounts` is undefined, `containerAppNames` is undefined (the implementation hasn't changed yet).

- [ ] **Step 3: Update `_fluxinfo_aggregate()`**

Replace the body of `_fluxinfo_aggregate` (currently lines 77-175) with:

```js
function _fluxinfo_aggregate(nodes) {
  // Per-app-name running-container tally. Category/repotag/watchtower/
  // wordpress/streamr/presearch detection all used to be image-substring
  // matches done right here — fluxinfo no longer reports an image at all
  // (issue #187), so none of that can happen in this module any more. It now
  // moves to runningAppsCategorized.js, which joins this name-keyed tally
  // against globalappsspecifications (still has the real repotag) once both
  // are available. This module stays a pure, spec-agnostic reader of
  // fluxinfo, same as before.
  const nameCounts = {};
  const perNode = [];
  let totalContainers = 0;

  for (const item of nodes) {
    const running = Array.isArray(item?.apps?.runningapps) ? item.apps.runningapps : [];
    totalContainers += running.length;

    // One name per container, NOT deduped — a 3-component compose app
    // contributes its app name 3 times, matching the pre-#187 per-container
    // imageCounts convention (each component counted once).
    const containerAppNames = running
      .map((a) => appNameFromContainer(Array.isArray(a?.Names) ? a.Names[0] : null))
      .filter(Boolean);

    for (const name of containerAppNames) {
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    }

    const ip = typeof item?.ip === 'string' ? item.ip : '';
    if (ip && running.length > 0) {
      perNode.push({
        ip,
        tier: typeof item?.tier === 'string' ? item.tier : null,
        containerCount: running.length,
        containerAppNames,
        appNames: [],
      });

      const names = [...new Set(containerAppNames)];
      const entry = perNode[perNode.length - 1];
      entry.appNames = names;
      entry.appCount = names.length || running.length;
    }
  }

  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  const nodesByIp = {};
  for (const entry of perNode) {
    nodesByIp[entry.ip.trim()] = entry;
  }

  return {
    nameCounts,
    totalContainers,
    topNodesByApps,
    nodesByIp,
    nodesReporting: nodes.length
  };
}
```

Remove the now-unused `streamrImage`/`presearchImage` env-var reads from the
top of the old function body (they move to Task 3, which is where the
join against specs happens) — they are no longer referenced anywhere in this
file.

Also update `_fluxinfo_read_cache()`'s guard (currently `if
(!cached?.aggregate?.imageCounts) return null;`) to check the new field:

```js
    if (!cached?.aggregate?.nameCounts) return null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern fluxinfoResilience`
Expected: PASS, all tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add client/src/fluxinfo.js client/src/fluxinfoResilience.test.js
git commit -m "fix(fluxinfo): stop reading the removed Image field, tally by app name (#187)"
```

---

### Task 2: `apidata.js` — split the app-specs cache so a raw layer is safe to call twice

**Files:**
- Modify: `client/src/apidata.js:1309-1406` (the `fetch_global_app_specs`
  region)
- Test: `client/src/apidata.test.js` (new `describe` block)

**Interfaces:**
- Produces: `fetch_global_app_specs_raw()` — new export, `async () =>
  Array<spec>`, in-flight-deduped and sessionStorage-cached (5 min TTL),
  returning the raw `globalappsspecifications` array with no block-height-
  dependent computation, so it is safe to call from more than one place at
  more than one point in a page load without ever serving a stale
  `expiringToday`/`deployedToday`. `fetch_global_app_specs(gstore)` keeps its
  existing signature and return shape (`{expiringToday, deployedToday,
  networkCategories, rawSpecs}`), now built by calling
  `fetch_global_app_specs_raw()` internally and computing the block-height-
  dependent fields fresh on every call instead of caching them.
- Consumes: nothing new (same `categorizeAppSpec`, `specResources` imports
  already present in this file).

Why this task exists: Task 4 needs a name→spec index inside
`fetchTotalDeployedApps()`, which runs concurrently with `fetchDaemonInfo()`
in the same `Promise.all` in `fetch_global_stats` — so `store.fluxBlockHeight`
is not reliably set yet at that point. The *existing*
`fetch_global_app_specs(gstore)` caches its whole computed result, including
`expiringToday`/`deployedToday`, which depend on that block height. Calling
it a second time per page load (as Task 4 will) risks caching a result
computed with `fluxBlockHeight: 0` and then Home.jsx's own later, correct
call reading that same wrong cached result back within the 5-minute TTL —
breaking the Expiring/Deployed Today panels. Splitting the cache so only the
height-independent raw array is cached removes that risk entirely, for every
caller (`AppsSection`, `AppsTab`, `Live.jsx`, `Home.jsx`, and the new call in
Task 4).

- [ ] **Step 1: Write the failing test**

Add to `client/src/apidata.test.js`:

```js
import { fetch_global_app_specs, fetch_global_app_specs_raw } from './apidata';

describe('fetch_global_app_specs_raw / fetch_global_app_specs', () => {
  const SPECS = [{ name: 'appA', height: 100, compose: [{ repotag: 'someimage/app:latest', cpu: 1, ram: 512, hdd: 5 }] }];

  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('fetch_global_app_specs_raw returns the raw spec array', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });
    const raw = await fetch_global_app_specs_raw();
    expect(raw).toEqual(SPECS);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });
    const [a, b] = await Promise.all([fetch_global_app_specs_raw(), fetch_global_app_specs_raw()]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('recomputes expiringToday/deployedToday fresh from the block height on every call, never from a stale cached value', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });

    // First call at block height 0 (the race this task exists to fix):
    // appA is not "deployed today" because there is no reliable height yet.
    const first = await fetch_global_app_specs({ fluxBlockHeight: 0 });
    expect(first.deployedToday).toEqual([]);

    // Second call moments later, same 5-minute cache window, but with the
    // real block height available — must NOT read back the first call's
    // (wrong) cached deployedToday.
    const second = await fetch_global_app_specs({ fluxBlockHeight: 100 });
    expect(second.deployedToday).toHaveLength(1);
    expect(second.deployedToday[0].name).toBe('appA');

    // Only one network fetch for both calls — the raw array is what's shared.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern apidata.test`
Expected: FAIL — `fetch_global_app_specs_raw` is not exported yet.

- [ ] **Step 3: Implement the split**

Replace lines 1309-1406 of `client/src/apidata.js` (the
`HOME_APP_SPECS_CACHE_KEY` constant through the end of `fetch_global_app_specs`)
with:

```js
const RAW_APP_SPECS_CACHE_KEY = 'homeAppSpecsRaw_v1';
const RAW_APP_SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RAW_APP_SPECS_STALE_KEYS = ['homeAppSpecs_v2']; // old key cached the full computed (height-dependent) result

let _rawAppSpecsInFlight = null;

function _prune_stale_app_spec_caches() {
  for (const key of RAW_APP_SPECS_STALE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

/*
 * Raw globalappsspecifications array only — no block-height-dependent
 * computation, so this is safe to cache and safe to call from more than one
 * place in a page load. fetch_global_app_specs() below layers the height-
 * dependent expiring/deployed-today lists on top, recomputed fresh every
 * call, specifically so a caller with a not-yet-populated fluxBlockHeight
 * (fetchTotalDeployedApps runs concurrently with fetchDaemonInfo) can never
 * poison this cache with a wrong result that a later, correct caller then
 * reads back within the TTL.
 */
export async function fetch_global_app_specs_raw() {
  _prune_stale_app_spec_caches();

  try {
    const raw = sessionStorage.getItem(RAW_APP_SPECS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < RAW_APP_SPECS_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  if (_rawAppSpecsInFlight) return _rawAppSpecsInFlight;

  _rawAppSpecsInFlight = (async () => {
    try {
      const res = await fetch('https://api.runonflux.io/apps/globalappsspecifications');
      const json = await res.json();
      if (json.status === 'error' || !json.data) return [];

      try {
        sessionStorage.setItem(RAW_APP_SPECS_CACHE_KEY, JSON.stringify({ data: json.data, timestamp: Date.now() }));
      } catch {}

      return json.data;
    } catch (e) {
      console.warn('[AppSpecs] Failed to fetch:', e);
      return [];
    }
  })();

  try {
    return await _rawAppSpecsInFlight;
  } finally {
    _rawAppSpecsInFlight = null;
  }
}

export async function fetch_global_app_specs(gstore) {
  const specs = await fetch_global_app_specs_raw();
  const empty = { expiringToday: [], deployedToday: [], networkCategories: [], rawSpecs: [] };
  if (specs.length === 0) return empty;

  const currentBlock = gstore.fluxBlockHeight || 0;
  const expiringToday = [];
  const deployedToday = [];
  const categoryMap = {};

  for (const spec of specs) {
    const instances = spec.instances || 1;
    const { cpuPerInst, ramGBPerInst, ssdGBPerInst } = specResources(spec);
    const cat = categorizeAppSpec(spec);
    categoryMap[cat] = (categoryMap[cat] || 0) + instances;

    const specHeight = spec.height || 0;
    const deployedAgeBlocks = currentBlock - specHeight;
    const enriched = { ...spec, instances, cpuPerInst, ramGBPerInst, ssdGBPerInst, category: cat };

    if (currentBlock > 0 && deployedAgeBlocks >= 0 && deployedAgeBlocks < BLOCKS_PER_DAY) {
      deployedToday.push({ ...enriched, deployedAgeBlocks });
    }

    if (spec.expire) {
      const expiryBlock = specHeight + spec.expire;
      const expiresInBlocks = expiryBlock - currentBlock;
      if (currentBlock > 0 && expiresInBlocks >= 0 && expiresInBlocks < BLOCKS_PER_DAY) {
        expiringToday.push({ ...enriched, expiresInBlocks });
      }
    }
  }

  expiringToday.sort((a, b) => a.expiresInBlocks - b.expiresInBlocks);
  deployedToday.sort((a, b) => a.deployedAgeBlocks - b.deployedAgeBlocks);

  const networkCategories = Object.entries(categoryMap)
    .map(([category, totalInstances]) => ({ category, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  return { expiringToday, deployedToday, networkCategories, rawSpecs: specs };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern apidata.test`
Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm no other caller broke**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline plus the new tests (`AppsSection`,
`Live.jsx`, `AppsTab` all still call `fetch_global_app_specs` with the same
signature and shape, unaffected by the internal split).

- [ ] **Step 6: Commit**

```bash
git add client/src/apidata.js client/src/apidata.test.js
git commit -m "refactor(apidata): split app-specs cache into a safe raw layer + fresh height-dependent recompute"
```

---

### Task 3: `runningAppsCategorized.js` — join running-app names to specs

**Files:**
- Create: `client/src/runningAppsCategorized.js`
- Test: `client/src/runningAppsCategorized.test.js`

**Interfaces:**
- Consumes: a fluxinfo `aggregate` shaped like Task 1's output
  (`{nameCounts, nodesByIp, totalContainers, ...}`) and a `specIndex` shaped
  like `appSpecs.js`'s existing `buildSpecIndex(rawSpecs)` output (`{[name]:
  {repotag, category, cpuPerInst, ramGBPerInst, ssdGBPerInst, isEnterprise,
  instances}}`).
- Produces: `categorizeRunningApps(aggregate, specIndex)` →
  `{runningCategoryMap, runningCategoryTop, topRunningApps, wordpressCount,
  streamrRunningApps, presearchRunningApps, totalRunningApps}`, exact shapes
  below.

- [ ] **Step 1: Write the failing tests**

Create `client/src/runningAppsCategorized.test.js`:

```js
import { categorizeRunningApps } from './runningAppsCategorized';

const specIndex = {
  FoldingAtRunOnFlux1: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  FoldingAtRunOnFlux2: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  wordpress123: { repotag: 'runonflux/wp-nginx:latest', category: 'web' },
  streamr1: { repotag: 'streamr/broker-node:latest', category: 'other' },
  Presearch: { repotag: 'presearch/node:latest', category: 'other' },
  minecraft1: { repotag: 'itzg/minecraft-server:latest', category: 'gaming' },
};

const aggregate = {
  nameCounts: {
    FoldingAtRunOnFlux1: 1,
    FoldingAtRunOnFlux2: 1,
    wordpress123: 1,
    streamr1: 1,
    Presearch: 1,
    minecraft1: 1,
    unknownApp: 2, // not in specIndex — must not throw, must not silently vanish
  },
  nodesByIp: {
    '1.2.3.4:16127': { containerAppNames: ['streamr1', 'FoldingAtRunOnFlux1'] },
    '5.6.7.8:16127': { containerAppNames: ['Presearch'] },
  },
};

describe('categorizeRunningApps', () => {
  it('groups by repotag (not app name) so many instances of one image collapse into one bucket', () => {
    const { runningCategoryMap } = categorizeRunningApps(aggregate, specIndex);
    expect(runningCategoryMap.computing).toBe(2); // two Folding@Home instances, one category total
  });

  it('falls back to an "other" bucket for a running app whose spec is missing, without throwing', () => {
    const { runningCategoryMap, totalRunningApps } = categorizeRunningApps(aggregate, specIndex);
    expect(runningCategoryMap.other).toBeGreaterThanOrEqual(2); // unknownApp's 2 containers land somewhere, not dropped
    expect(totalRunningApps).toBe(8); // sum of every nameCounts value, unknownApp included
  });

  it('ranks topRunningApps by repotag popularity, most-instances first', () => {
    const { topRunningApps } = categorizeRunningApps(aggregate, specIndex);
    const folding = topRunningApps.find((r) => r.image === 'yurinnick/folding-at-home:latest');
    expect(folding.nodeCount).toBe(2);
  });

  it('counts wordpress by resolved repotag, not by the (arbitrary) app name', () => {
    const { wordpressCount } = categorizeRunningApps(aggregate, specIndex);
    expect(wordpressCount).toBe(1);
  });

  it('counts streamr/presearch once per NODE that hosts one, not once per container', () => {
    const twoOnOneNode = {
      nameCounts: { streamr1: 2 },
      nodesByIp: { '1.1.1.1:1': { containerAppNames: ['streamr1', 'streamr1'] } },
    };
    const { streamrRunningApps } = categorizeRunningApps(twoOnOneNode, specIndex);
    expect(streamrRunningApps).toBe(1);
  });

  it('returns all-zero/empty output for an empty aggregate, without throwing', () => {
    const result = categorizeRunningApps({ nameCounts: {}, nodesByIp: {} }, {});
    expect(result.runningCategoryMap).toEqual({});
    expect(result.topRunningApps).toEqual([]);
    expect(result.totalRunningApps).toBe(0);
    expect(result.wordpressCount).toBe(0);
    expect(result.streamrRunningApps).toBe(0);
    expect(result.presearchRunningApps).toBe(0);
  });

  it('does not throw when nodesByIp or specIndex is missing entirely', () => {
    expect(() => categorizeRunningApps({ nameCounts: { a: 1 } }, undefined)).not.toThrow();
    expect(() => categorizeRunningApps({}, {})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern runningAppsCategorized`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement `runningAppsCategorized.js`**

Create `client/src/runningAppsCategorized.js`:

```js
import { buildCategoryTop } from 'fluxinfo';

// Recognised via specIndex only now (issue #187 removed the docker image
// fluxinfo used to report, so these can no longer be image-substring
// matches — they're resolved by joining the running app's NAME to its
// globalappsspecifications repotag, same source AppsSection/WorkhorsePanel
// already trust for this).
const WORDPRESS_REPO_BASE = 'runonflux/wp-nginx';
const STREAMR_REPO_BASE = (process.env.REACT_APP_STREAMR || 'streamr/broker-node:latest').split(':')[0];
const PRESEARCH_REPO_BASE = (process.env.REACT_APP_PRE_SEARCH || 'presearch/node:latest').split(':')[0];

/**
 * Join fluxinfo's running-app tally (name-keyed, since fluxinfo no longer
 * reports an image — issue #187) against a globalappsspecifications index
 * (name -> {repotag, category, ...}, from appSpecs.js's buildSpecIndex) to
 * recover everything the old image-based aggregation used to compute.
 *
 * Grouping happens by REPOTAG, not by app name: Flux app names are unique
 * per deployment (FoldingAtRunOnFlux13, palworld1786553912828, ...), so
 * grouping by name would scatter one popular image's ~thousands of
 * instances into as many single-count rows. A running app whose spec isn't
 * in the index (e.g. it expired between the two independent fetches) falls
 * back to being grouped under its own name rather than silently dropped, so
 * its containers still count toward totals — just not toward any specific
 * image's popularity ranking.
 */
export function categorizeRunningApps(aggregate, specIndex) {
  const nameCounts = aggregate?.nameCounts || {};
  const index = specIndex || {};

  const runningCategoryMap = {};
  const categoryImages = {}; // [category][repotagOrName] -> count, feeds buildCategoryTop
  const repoCounts = {}; // repotag -> count, for topRunningApps (unresolved names excluded — see below)
  let totalRunningApps = 0;

  for (const [name, count] of Object.entries(nameCounts)) {
    totalRunningApps += count;

    const spec = index[name];
    const category = spec?.category || 'other';
    runningCategoryMap[category] = (runningCategoryMap[category] || 0) + count;

    const repotag = spec?.repotag || '';
    const imageKey = repotag ? repotag.split(':')[0] : name;
    categoryImages[category] = categoryImages[category] || {};
    categoryImages[category][imageKey] = (categoryImages[category][imageKey] || 0) + count;

    if (repotag) {
      repoCounts[repotag] = (repoCounts[repotag] || 0) + count;
    }
  }

  const topRunningApps = Object.entries(repoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([image, nodeCount]) => ({ image, nodeCount }));

  let wordpressCount = 0;
  let streamrNodes = 0;
  let presearchNodes = 0;

  for (const node of Object.values(aggregate?.nodesByIp || {})) {
    let hasStreamr = false;
    let hasPresearch = false;

    for (const name of node.containerAppNames || []) {
      const repotag = index[name]?.repotag || '';
      const repoBase = repotag.split(':')[0];
      if (repoBase === WORDPRESS_REPO_BASE) wordpressCount++;
      if (repoBase === STREAMR_REPO_BASE) hasStreamr = true;
      if (repoBase === PRESEARCH_REPO_BASE) hasPresearch = true;
    }

    if (hasStreamr) streamrNodes++;
    if (hasPresearch) presearchNodes++;
  }

  return {
    runningCategoryMap,
    runningCategoryTop: buildCategoryTop(categoryImages),
    topRunningApps,
    wordpressCount,
    streamrRunningApps: streamrNodes,
    presearchRunningApps: presearchNodes,
    totalRunningApps
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern runningAppsCategorized`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/runningAppsCategorized.js client/src/runningAppsCategorized.test.js
git commit -m "feat(apps): join running-app names to spec repotags for category/wordpress/streamr/presearch (#187)"
```

---

### Task 4: Wire Tasks 2+3 into `apidata.js`'s `fetchTotalDeployedApps()`

**Files:**
- Modify: `client/src/apidata.js:5-7` (imports), `:61-123`
  (`create_global_store`), `:490-557` (`fetchTotalDeployedApps`)
- Modify: `client/src/components/TopHostedApps/index.jsx` (field rename)

**Interfaces:**
- Consumes: `fetch_global_app_specs_raw()` and `buildSpecIndex` (Task 2 +
  existing `appSpecs.js`), `categorizeRunningApps` (Task 3).
- Produces: `store.topRunningApps` (renamed from `topRunningImages` — every
  other field name on `store` is unchanged: `runningCategoryMap`,
  `runningCategoryTop`, `wordpressCount`, `streamrRunningApps`,
  `presearchRunningApps`, `totalRunningApps`).

- [ ] **Step 1: Update imports and `create_global_store`**

In `client/src/apidata.js`, replace the import block at lines 5-7 (the
`main/Gamification/appCategories`, `fluxinfo`, and `appSpecs` imports):

```js
import { categorizeAppSpec } from 'main/Gamification/appCategories';
import { fetch_fluxinfo_aggregate } from 'fluxinfo';
import { specResources, buildSpecIndex } from 'appSpecs';
import { categorizeRunningApps } from 'runningAppsCategorized';
```

(`categorizeApp`, `isOpaqueRuntimeImage`, and `buildCategoryTop` are no
longer used directly in this file — they moved into
`runningAppsCategorized.js` in Task 3 — so drop them from the import to keep
lint clean; `categorizeAppSpec` and `specResources` are still used elsewhere
in this file for `fetch_global_app_specs`.)

In `create_global_store()` (line 111), rename the field:

```js
    topRunningApps: [],
```

- [ ] **Step 2: Rewrite `fetchTotalDeployedApps`**

Replace the body of `fetchTotalDeployedApps` (currently lines 495-557) with:

```js
  const fetchTotalDeployedApps = async () => {
    const { aggregate, status, fetchedAt } = await fetch_fluxinfo_aggregate();

    store.runningAppsStatus = status;
    store.runningAppsFetchedAt = fetchedAt;

    if (!aggregate) return;

    // Carried on the store before the spec join below, same as before —
    // the Workhorse showcase and DonorTab both read these directly off
    // aggregate's shape.
    store.topNodesByApps = aggregate.topNodesByApps || [];
    store.nodesByIp = aggregate.nodesByIp || {};

    // fluxinfo no longer reports a docker image (#187) — category, repotag,
    // wordpress/streamr/presearch detection all now require joining each
    // running app's NAME against globalappsspecifications. That fetch is
    // its own safe, shared, sessionStorage-cached layer (Task 2), so this
    // costs a real network request only on a cold cache.
    const rawSpecs = await fetch_global_app_specs_raw();
    const specIndex = buildSpecIndex(rawSpecs);

    const categorized = categorizeRunningApps(aggregate, specIndex);

    store.totalRunningApps = categorized.totalRunningApps;
    store.streamrRunningApps = categorized.streamrRunningApps;
    store.presearchRunningApps = categorized.presearchRunningApps;
    store.wordpressCount = categorized.wordpressCount;
    store.topRunningApps = categorized.topRunningApps;
    store.runningCategoryMap = categorized.runningCategoryMap;
    store.runningCategoryTop = categorized.runningCategoryTop;
  };
```

- [ ] **Step 3: Update `TopHostedApps` for the field rename**

In `client/src/components/TopHostedApps/index.jsx`, line 30:

```js
  const images = gstore.topRunningApps || [];
```

(No other line in that file changes — items are still `{image, nodeCount}`,
and `shortImageName()` still applies since `image` is a real repotag in the
common case.)

- [ ] **Step 4: Search for any other reference to the old field name**

Run: `cd client && grep -rn "topRunningImages" src`
Expected: no matches. If any remain, update them the same way as Step 3.

- [ ] **Step 5: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS. `apidata.test.js`'s existing `create_global_store` tests
don't assert on `topRunningApps`/`topRunningImages` by name (checked in
investigation — they only check `totalRunningApps`, `runningCategoryMap`,
`runningCategoryTop`), so no update needed there.

- [ ] **Step 6: Commit**

```bash
git add client/src/apidata.js client/src/components/TopHostedApps/index.jsx
git commit -m "fix(home): recompute running-app stats via the name->spec join (#187)"
```

---

### Task 5: `WorkhorsePanel` — fix the per-node "Categories" row

**Files:**
- Modify: `client/src/home/WorkhorsePanel/index.jsx`

**Interfaces:**
- Consumes: `node.containerAppNames` (Task 1's rename of the old
  `node.images`) and the component's own existing `specsByName` (already
  built via `buildSpecIndex(appSpecs?.rawSpecs)` at line 230 — no new prop
  needed, this task only changes what `NodeCard`'s `categories` memo reads).

- [ ] **Step 1: Update the `categories` memo in `NodeCard`**

In `client/src/home/WorkhorsePanel/index.jsx`, `NodeCard` currently (lines
89-96) builds `categories` from `node.images` using the now-gone image-based
`categorizeApp`/`isOpaqueRuntimeImage`. `NodeCard` doesn't currently receive
`specsByName` as a prop — only `WorkhorsePanel` has it, passed to `NodeCard`
as `specsByName={specsByName}` already (line 312). Change the memo to use
that instead:

```js
  const categories = useMemo(() => {
    const counts = {};
    for (const name of node.containerAppNames || []) {
      const cat = specsByName?.[name]?.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [node.containerAppNames, specsByName]);
```

Remove the now-unused `categorizeApp, isOpaqueRuntimeImage` import (line 9) —
`buildSpecIndex` (line 10) is the only one still needed from that pair of
modules.

- [ ] **Step 2: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS (no dedicated test file for this component today — matches
the existing convention for `WorkhorsePanel`; verified visually in Task 7).

- [ ] **Step 3: Commit**

```bash
git add client/src/home/WorkhorsePanel/index.jsx
git commit -m "fix(workhorse): rebuild per-node Categories row from the name->spec join (#187)"
```

---

### Task 6: Analytics Donor tab — "apps by category" panel

**Files:**
- Modify: `client/src/analytics/donorApps.js`
- Modify: `client/src/analytics/donorApps.test.js`
- Modify: `client/src/analytics/DonorTab/index.jsx`

**Interfaces:**
- Produces: `aggregateDonorAppsByCategory(nodesByIp, donorAddresses,
  specIndex)` — signature gains a required third parameter. Every existing
  caller (just `DonorTab`) is updated in this same task.

- [ ] **Step 1: Update the failing tests first**

Rewrite `client/src/analytics/donorApps.test.js` to use
`containerAppNames` + a `specIndex` instead of `.images`:

```js
import { aggregateDonorAppsByCategory } from './donorApps';

const specIndex = {
  'folding1': { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  'wp1': { repotag: 'runonflux/wp-nginx:latest', category: 'web' },
  'mc1': { repotag: 'itzg/minecraft-server:latest', category: 'gaming' },
  'boinc1': { repotag: 'boinc/client:latest', category: 'computing' },
  'watchtower': { repotag: 'containrrr/watchtower:latest', category: 'other' },
};

const nodesByIp = {
  '1.2.3.4:16127': { containerAppNames: ['folding1', 'wp1'] },
  '5.6.7.8:16127': { containerAppNames: ['mc1'] },
  '9.9.9.9:16127': { containerAppNames: ['unrelated'] },
};

describe('aggregateDonorAppsByCategory', () => {
  it('tallies one entry per running container, by category, across the donor\'s own nodes only', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127', '5.6.7.8:16127'], specIndex);

    expect(totalApps).toBe(3);
    const byCat = Object.fromEntries(categories.map((c) => [c.category, c.count]));
    expect(byCat.computing).toBe(1);
    expect(byCat.web).toBe(1);
    expect(byCat.gaming).toBe(1);
  });

  it('sorts categories descending by count', () => {
    const twoOnOneNode = {
      '1.1.1.1:1': { containerAppNames: ['folding1', 'boinc1', 'mc1'] },
    };
    const { categories } = aggregateDonorAppsByCategory(twoOnOneNode, ['1.1.1.1:1'], specIndex);
    expect(categories[0]).toEqual({ category: 'computing', count: 2 });
    expect(categories[1]).toEqual({ category: 'gaming', count: 1 });
  });

  it('never counts an address that is not the donor\'s own', () => {
    const { totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127'], specIndex);
    expect(totalApps).toBe(2); // not 3 — 9.9.9.9's app is excluded
  });

  it('skips a donor address with no matching nodesByIp entry, rather than throwing', () => {
    expect(() => aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'], specIndex)).not.toThrow();
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'], specIndex);
    expect(categories).toEqual([]);
    expect(totalApps).toBe(0);
  });

  it('returns an empty result for no donor addresses or an empty/undefined lookup', () => {
    expect(aggregateDonorAppsByCategory(nodesByIp, [], specIndex)).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory({}, ['1.2.3.4:16127'], specIndex)).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory(undefined, undefined, specIndex)).toEqual({ categories: [], totalApps: 0 });
  });

  it('excludes containrrr/watchtower from the tally by resolved repotag', () => {
    const nodesByIpWithWatchtower = {
      '1.2.3.4:16127': { containerAppNames: ['folding1', 'watchtower'] },
    };
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIpWithWatchtower, ['1.2.3.4:16127'], specIndex);
    expect(totalApps).toBe(1);
    expect(categories).toEqual([{ category: 'computing', count: 1 }]);
  });

  it('normalizes the donor address before lookup (trims whitespace)', () => {
    const cleanNodesByIp = { '1.2.3.4:16127': { containerAppNames: ['mc1'] } };
    const { totalApps } = aggregateDonorAppsByCategory(cleanNodesByIp, [' 1.2.3.4:16127 '], specIndex);
    expect(totalApps).toBe(1);
  });

  it('falls back to "other" for a running app whose spec is missing, without throwing', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['9.9.9.9:16127'], specIndex);
    expect(totalApps).toBe(1);
    expect(categories).toEqual([{ category: 'other', count: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern donorApps`
Expected: FAIL — old implementation still reads `.images` and takes only two
params.

- [ ] **Step 3: Rewrite `aggregateDonorAppsByCategory`**

Replace `client/src/analytics/donorApps.js`'s function body:

```js
import { addressOf } from 'networkNodes';

/*
 * Pure: tally the donor's own running apps by category, from the IP-keyed
 * lookup fetch_fluxinfo_aggregate() carries as nodesByIp, joined against a
 * name-keyed spec index (appSpecs.js's buildSpecIndex) for category —
 * fluxinfo no longer reports a docker image (issue #187), so category can
 * only be recovered by joining the running app's name to its
 * globalappsspecifications repotag, same as runningAppsCategorized.js does
 * network-wide. A running app whose spec can't be found (e.g. it expired
 * between the two independent fetches) falls back to 'other' rather than
 * being dropped from the tally.
 *
 * containrrr/watchtower is excluded from the tally by its resolved repotag:
 * every Flux node runs it to auto-update its own containers, so it's
 * infrastructure the node runs for itself, not something the donor deployed.
 *
 * Addresses are normalized via addressOf() before lookup, matching
 * donorUtilization.js's own normalization.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses, specIndex) {
  const perCategory = {};
  let totalApps = 0;
  const index = specIndex || {};

  for (const rawAddr of donorAddresses || []) {
    const node = nodesByIp?.[addressOf(rawAddr)];
    if (!node) continue;

    for (const name of node.containerAppNames || []) {
      const spec = index[name];
      const repotag = spec?.repotag || '';
      if (repotag.toLowerCase().includes('containrrr/watchtower')) continue;

      const cat = spec?.category || 'other';
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

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern donorApps`
Expected: PASS.

- [ ] **Step 5: Wire `specIndex` into `DonorTab`**

In `client/src/analytics/DonorTab/index.jsx`, add the raw-specs import and
build the index alongside the existing fetch. Change the import line:

```js
import { fetch_global_stats, fetch_total_network_utils, fetch_global_app_specs_raw } from 'apidata';
import { buildSpecIndex } from 'appSpecs';
```

Find the existing block around the `fetch_total_network_utils` call (search
for `aggregateDonorAppsByCategory` — currently reads
`gstore.nodesByIp || {}` directly) and fetch specs alongside it:

```js
      const [gstore, rawSpecs] = await Promise.all([
        fetch_total_network_utils(stage1),
        fetch_global_app_specs_raw(),
      ]);
      if (cancelled) return;

      const specIndex = buildSpecIndex(rawSpecs);
      setAppCategories(aggregateDonorAppsByCategory(gstore.nodesByIp || {}, addresses, specIndex));
```

(Replacing the existing `const gstore = await fetch_total_network_utils(stage1);`
line and the `setAppCategories(...)` line right after it — everything else
in that `useEffect` is unchanged. `fetch_global_app_specs_raw` is
sessionStorage-cached from Task 2, so this is not a second full network
fetch once the Home page or Apps tab has already loaded once in the same
session — and even cold, it's one extra ~request, not the ~726 KB fluxinfo
payload the existing comment there was written to avoid duplicating.)

- [ ] **Step 6: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/analytics/donorApps.js client/src/analytics/donorApps.test.js client/src/analytics/DonorTab/index.jsx
git commit -m "fix(donor): restore apps-by-category via the name->spec join (#187)"
```

---

### Task 7: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, count is baseline (317) plus every test added in Tasks 1-6.

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, warnings limited to the same 4 pre-existing baseline files
(Navbar/index.jsx, NodeGridTable/index.jsx, LayoutContext.jsx, WalletNodes/
index.jsx) plus, if lint catches it, no new unused-import warnings from the
removed `categorizeApp`/`isOpaqueRuntimeImage` imports in `apidata.js` and
`WorkhorsePanel/index.jsx` (Tasks 4 and 5 already removed them — this step
confirms nothing else was left dangling).

- [ ] **Step 3: Manual spot-check via `run` (or `yarn start` + Chrome)**

Check, against the real live APIs (no demo/mock mode):
- `/home` — App Ecosystem panel shows real categories (not "unavailable"),
  Top Hosted Apps shows a ranked list (not stuck spinning), header's Total
  Running Apps / Wordpress / Streamr / Presearch counts are non-zero and
  plausible, Workhorse showcase's Categories row is populated for the
  current node.
- `/nodes` — Apps tab: category chips, Repo column, and the GitHub-vs-Docker
  icon all still populated (confirms the investigation's finding that this
  page needed no code change).
- `/analytics` → Apps tab: same as Home's App Ecosystem/Top Hosted panels.
  → Donor tab (toggle `PREMIUM_TESTING_MODE` to `true` in
  `client/public/runtime/app-content.js` for this check only, **revert to
  `false` before committing**): "apps by category" panel populated for a
  wallet with running apps.
  → Network / Chain Activity tabs: unaffected, spot-check they still render.
- `/live`: unaffected — confirm deploy/confirm/reward events still show a
  repo tag in the details panel, proving this plan didn't disturb that path.

- [ ] **Step 4: Update project memory**

Update `fluxnode-next-steps.md` (or add a new dated session entry) noting
issue #187 is fixed, which files now own the name→spec join, and that the
Node page Apps tab / Live page needed no changes (so a future session
doesn't re-investigate the same ground).
