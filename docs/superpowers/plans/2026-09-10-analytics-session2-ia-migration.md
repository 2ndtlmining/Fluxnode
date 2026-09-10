# Analytics Rework — Session 2 (IA Migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move four panels from `/home` into `/analytics` (Top Dogs → Network
tab, Expiring Today / Deployed Today / Workhorse → Apps tab), wiring them to
the four `'public'` keys `panelAccess.js` already defines, and trim Home's
layout accordingly.

**Architecture:** Pure relocation — the four panel components' own code
(markup/logic) doesn't change at all, only which file renders them and what
data-fetching they now trigger locally in their new home. `TopDogsPanel`
needs `NetworkTab` to add a new `fetch_global_performance_rankings()` call
(currently only `AppsTab`/`Home`/`MainApp` fetch it); `ExpiringTodayPanel`/
`DeployedTodayPanel`/`WorkhorsePanel` need `AppsTab` to keep the *full*
`fetch_global_app_specs()` result in state (today it only extracts
`rawSpecs` from it) instead of fetching anything new.

**Tech Stack:** React 18 (function components only — this session doesn't
touch `Home.jsx`'s or `MainApp.jsx`'s class-component code at all), existing
`apidata.js` fetchers (unchanged).

**Spec:** `docs/superpowers/specs/2026-09-10-analytics-rework-design.md`
(Part C — Session 1's Parts A/B are already merged, `main` at `dd7c37c`).

## Global Constraints

- **Hard testing requirement (user-mandated, non-negotiable, same discipline
  Session 1 required):** this session moves `TopDogsPanel`'s data path
  (`fetch_global_performance_rankings`/`tierWinners`/`nodeGeoMap`) — the
  exact ranking code that produced 2 real duplicate-ip bugs
  (`rankInGroup`, `lookupNodeInfo`) on 2026-09-09, found only via live
  wallet comparison, never by unit tests. **Task 3 is a mandatory live
  before/after comparison on a real wallet** — do not skip it, do not
  consider this session done without it.
- **`panelAccess.js` is NOT modified this session.** All 4 `'public'` keys
  (`topDogs`, `expiringToday`, `deployedToday`, `workhorse`) already exist
  from Session 1 with the correct value — this session only wires real
  components to them. Every other key's value is untouched.
- **`AppEcosystemBreakdown` and `TopHostedApps` do NOT move** — confirmed by
  reading current `HomeOverview/index.jsx`: these two are long-standing
  *shared* components already rendered on both `/home` (ungated) and
  `/analytics`'s Apps tab (donor-gated via `PanelGate`) since PR #173. The
  user's "move" decision during brainstorming was specifically about Top
  Dogs and the three app-activity panels — don't touch these two.
- **Baseline before starting:** run
  `cd client && CI=true npx react-scripts test --watchAll=false` on
  `origin/main` first and record the actual pass count (438 as of this
  plan being written, `main` at `dd7c37c` — includes Session 1 (PR #197)
  and the donation-address fix (PR #196); re-confirm it's still current
  before Task 1, since PR #198 may have merged by then too).
- **`client/public/runtime/app-content.js`'s `TESTING` flag**: flip to
  `true` for local manual QA, **always revert to `false` before
  committing** — confirm `git status` clean before every commit.
- **Worktree convention:** `worktrees/analytics-session2` via plain `git
  worktree add` off `origin/main` — **not** the harness's native
  `EnterWorktree` tool (breaks CRA/Jest's `testMatch` glob resolution).

---

### Task 1: Move `TopDogsPanel` into `NetworkTab`

**Files:**
- Modify: `client/src/analytics/NetworkTab/index.jsx`
- Modify: `client/src/home/HomeOverview/index.jsx`
- Create: `client/src/analytics/NetworkTab/index.scss` additions (or confirm
  existing panel styling already covers it — see Step 4)

**Interfaces:**
- Consumes: `fetch_global_performance_rankings()` from `apidata` (no
  args, returns `{ nodeData, tierWinners, countryTierCounts,
  officialNodeCounts, countryDominance, addressGeoMap, nodeGeoMap }` —
  confirmed by reading `client/src/apidata.js:1129-1273`); `PanelGate`
  (Session 1, `analytics/PanelGate`).
- Produces: `TopDogsPanel` (moved, not renamed) now lives in
  `client/src/analytics/NetworkTab/index.jsx`, exported nowhere (stays a
  local, non-exported function in this file, matching how `AppsTab`'s
  `RankedAddressList` and `NetworkTab`'s own `ContinentBreakdown` are
  local-only today).

`TopDogsPanel` itself (`TIER_CONFIG`, `METRIC_CONFIG`, `TIERS_ORDER`,
`MetricCard`, `TierRow`, `TopDogsPanel` — currently
`client/src/home/HomeOverview/index.jsx:465-547`) moves **verbatim** — no
markup/logic changes, just relocated. It needs these imports, currently
already used elsewhere but not yet in `NetworkTab/index.jsx`:
`FiCpu, FiHardDrive, FiDownload, FiUpload` (from `react-icons/fi`),
`FaTrophy` (from `react-icons/fa`), `ReactCountryFlag` (from
`react-country-flag`), `Spinner` (from `@blueprintjs/core`, already
imported in `NetworkTab`).

- [ ] **Step 1: Copy `TopDogsPanel` and its sub-components into `NetworkTab`**

In `client/src/analytics/NetworkTab/index.jsx`, add these imports at the
top (merge with the existing `Spinner` import from `@blueprintjs/core`
rather than duplicating it):

```js
import { FiCpu, FiHardDrive, FiDownload, FiUpload } from 'react-icons/fi';
import { FaTrophy } from 'react-icons/fa';
import ReactCountryFlag from 'react-country-flag';
```

Then paste this block in (after the existing `fmtNum`/`pct` helpers, before
`ContinentBreakdown` — exact placement doesn't matter since these are all
independent local functions, but keep it as one contiguous block for
readability):

```jsx
// ── Top Dogs Panel ─────────────────────────────────────────────────────────────
// Moved verbatim from home/HomeOverview/index.jsx (Session 2 IA migration) —
// no markup/logic changes, just relocated next to the network's other
// performance-ranking content.

const TIER_CONFIG = {
  CUMULUS: { label: 'Cumulus', color: '#2686d0' },
  NIMBUS:  { label: 'Nimbus',  color: '#d07e26' },
  STRATUS: { label: 'Stratus', color: '#c92641' },
};

const METRIC_CONFIG = [
  { key: 'eps',        label: 'EPS',  Icon: FiCpu,       format: (v) => fmtNum(v, 0) },
  { key: 'dws',        label: 'DWS',  Icon: FiHardDrive, format: (v) => fmtNum(v, 0) },
  { key: 'down_speed', label: 'Down', Icon: FiDownload,  format: (v) => v != null ? v.toFixed(1) + ' Mb/s' : '—' },
  { key: 'up_speed',   label: 'Up',   Icon: FiUpload,    format: (v) => v != null ? v.toFixed(1) + ' Mb/s' : '—' },
];

const TIERS_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS'];

function MetricCard({ metric, winner, nodeGeoMap }) {
  const { label, Icon, format } = metric;
  if (!winner) return (
    <div className="td-metric-card td-metric-card--empty">
      <div className="td-metric-header"><Icon size={11} /><span className="td-metric-label">{label}</span></div>
      <span className="td-metric-ip">—</span>
      <div className="td-metric-footer"><span className="td-metric-score">—</span></div>
    </div>
  );
  const { ip, value } = winner;
  const geo = nodeGeoMap?.[ip];
  return (
    <div className="td-metric-card">
      <div className="td-metric-header"><Icon size={11} className="td-metric-icon" /><span className="td-metric-label">{label}</span></div>
      <span className="td-metric-ip" title={ip}>{ip}</span>
      <div className="td-metric-footer">
        <span className="td-metric-score">{format(value)}</span>
        {geo?.countryCode && (
          <ReactCountryFlag
            countryCode={geo.countryCode}
            svg
            title={geo.country}
            style={{ width: '1.1em', height: '1.1em', borderRadius: '2px', flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  );
}

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
      <div className="hov-header">
        <span className="hov-header-title">TOP DOGS</span>
        <FaTrophy size={14} className="td-header-icon" />
      </div>
      <div className="td-body">
        {TIERS_ORDER.map((tier) => (
          <TierRow key={tier} tier={tier} tierWinners={tierWinners} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}
```

Note: the original used a shared `PanelHeader` helper
(`home/HomeOverview/index.jsx`'s local `PanelHeader({ title, right })`) for
the `TOP DOGS` + trophy-icon header. `NetworkTab` has no equivalent helper
today (`ContinentBreakdown` writes its `.hov-header` markup inline) — the
inlined version above (`<div className="hov-header">...`) matches that
existing local convention instead of introducing a new shared helper. This
is a deliberate, minor deviation from a pure copy-paste, not an oversight.

- [ ] **Step 2: Wire the new fetch into `NetworkTab`'s `useEffect`**

Modify the top of `client/src/analytics/NetworkTab/index.jsx` to import the
new fetcher:

```js
import { fetch_node_geolocation } from 'networkNodes';
import { fetch_global_performance_rankings } from 'apidata';
```

Then update the component:

```jsx
export function NetworkTab() {
  const [countryCounts, setCountryCounts] = useState([]);
  const [continentData, setContinentData] = useState({ continents: [], networkTotal: 0 });
  const [globalRankings, setGlobalRankings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [geoEntries, rankings] = await Promise.all([
        fetch_node_geolocation(),
        fetch_global_performance_rankings(),
      ]);
      if (cancelled) return;

      setCountryCounts(countByCountry(geoEntries));
      setContinentData(rollupByContinent(geoEntries));
      setGlobalRankings(rankings);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);
```

Only the body of the `useEffect` and the new `globalRankings` state line
change — everything else in the function (the `loading` early-return, the
final `return`) stays as-is except for Step 3's addition below.

- [ ] **Step 3: Render `TopDogsPanel` behind `PanelGate`**

In the same file's final `return`, add it as a new top-level sibling
(after the existing `.network-tab-continent-row` div, still inside
`.network-tab`):

```jsx
  return (
    <div className="network-tab">
      <PanelGate panelKey="worldMap" feature="World Map">
        <WorldMap countryCounts={countryCounts} />
      </PanelGate>
      <div className="network-tab-continent-row">
        <PanelGate panelKey="continentBreakdown" feature="Continent Breakdown">
          <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
        </PanelGate>
      </div>
      <PanelGate panelKey="topDogs" feature="Top Dogs">
        <TopDogsPanel globalRankings={globalRankings} />
      </PanelGate>
    </div>
  );
```

`topDogs` is already `'public'` in `panelAccess.js` (Session 1) — don't
change that file.

- [ ] **Step 4: Remove `TopDogsPanel` and its sub-components from `HomeOverview`**

In `client/src/home/HomeOverview/index.jsx`:
- Delete the entire block from `// ── Top Dogs Panel ─...` through the end
  of the `TopDogsPanel` function (currently lines 465-547 — re-locate by
  the same comment header/function names since line numbers may have
  shifted slightly; delete `TIER_CONFIG`, `METRIC_CONFIG`, `TIERS_ORDER`,
  `MetricCard`, `TierRow`, `TopDogsPanel` as one contiguous removal).
- Remove the now-unused imports this leaves behind: `FiCpu`, `FiHardDrive`,
  `FiDownload`, `FiUpload` (from the `react-icons/fi` import line — check
  the other icons in that same import, `FiDatabase, FiLink, FiBox, FiZap,
  FiShield, FiActivity`, aren't used by anything else in this file before
  removing the whole line; if any of those ARE still used elsewhere in the
  file, only remove the four Top-Dogs-specific ones from the import list),
  `FaTrophy` (from the `FaGamepad, FaTrophy` import — check `FaGamepad` is
  still used by something else before deciding whether to keep that import
  line at all).
- Remove `<TopDogsPanel globalRankings={globalRankings} />` from the
  `HomeOverview` component's return (currently line ~668).
- Remove the now-unused `globalRankings` prop from `HomeOverview`'s
  function signature (`export function HomeOverview({ gstore, appSpecs,
  countryCounts, globalRankings, gpuPrices })` → drop `globalRankings`) —
  but do NOT touch `Home.jsx`'s own fetching of `globalRankings`
  (`fetch_global_performance_rankings()` inside `hydrateApp`) or its
  `<HomeOverview .../>` call site yet; leave `Home.jsx` passing
  `globalRankings={this.state.globalRankings}` even though `HomeOverview`
  no longer reads it — **Task 2's Step 4 below removes this dead
  fetch/state once all four panels are moved and it's confirmed nothing on
  `/home` needs it anymore** (confirmed by reading the whole file: `Home.jsx`
  itself never reads `globalRankings`/`appSpecs` for anything besides
  passing them to `HomeOverview` — no other render path or method uses
  either).

- [ ] **Step 5: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as the recorded baseline (no tests exist for
either of these files' component logic — this repo's convention is
pure-logic unit tests only, and this is a pure UI relocation with no new
pure logic).

- [ ] **Step 6: Manual QA**

With `TESTING=true` (temporarily, to see past the `PanelGate` on a fresh
browser with no donor wallet set), `yarn start`, confirm:
- `/home` no longer shows a "TOP DOGS" panel anywhere.
- `/analytics`'s Network tab now shows "TOP DOGS" below the continent
  breakdown, with real tier/metric cards populated (not stuck on the
  spinner — if `globalRankings` never resolves, check the `Promise.all`
  wiring from Step 2).
- No console errors on either page.

Revert `TESTING` to `false`, confirm `git status` clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(analytics): move Top Dogs panel from /home to /analytics' Network tab"
```

---

### Task 2: Move `ExpiringTodayPanel`, `DeployedTodayPanel`, `WorkhorsePanel` into `AppsTab`

**Files:**
- Modify: `client/src/analytics/AppsTab/index.jsx`
- Modify: `client/src/home/HomeOverview/index.jsx`

**Interfaces:**
- Consumes: `fetch_global_app_specs` (already imported in `AppsTab`,
  return shape `{ expiringToday, deployedToday, networkCategories,
  rawSpecs }` — confirmed `client/src/apidata.js:1412-1436`);
  `WorkhorsePanel` (from `home/WorkhorsePanel`, takes `{ gstore, appSpecs
  }` — confirmed `client/src/home/WorkhorsePanel/index.jsx:224`);
  `PanelGate` (Session 1).
- Produces: `ExpiringTodayPanel`, `DeployedTodayPanel`, plus their shared
  helpers (`fmtSpecVal`, `SpecHeader`, `SpecCategoryIcon`, `blocksToHuman`)
  now live in `client/src/analytics/AppsTab/index.jsx` as local functions.

`AppsTab` currently discards `fetch_global_app_specs`'s full return value,
keeping only `rawSpecs` (via a local `specsResult` variable never stored in
state). This task changes it to keep the whole object in state.

- [ ] **Step 1: Copy the three panels and their shared helpers into `AppsTab`**

Add these imports to `client/src/analytics/AppsTab/index.jsx` (merge with
the existing `@blueprintjs/core` import for `Spinner`; `Tooltip2` and
`APP_CATEGORY_META`/`CategoryTooltip` are new):

```js
import { Tooltip2 } from '@blueprintjs/popover2';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { WorkhorsePanel } from 'home/WorkhorsePanel';
```

Then paste this block in (after the existing `truncateAddr` helper, before
`RankedAddressList` — again, exact position doesn't matter, keep it
contiguous):

```jsx
// ── Spec Header + shared helpers (moved verbatim from home/HomeOverview) ────
// Session 2 IA migration — Expiring/Deployed Today panels relocated here
// alongside App Ecosystem/Top Hosted Apps, no markup/logic changes.

function blocksToHuman(blocks) {
  const totalMinutes = Math.round(blocks * 0.5);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/*
 * Enterprise apps ship an encrypted compose, so their CPU / RAM / SSD are
 * genuinely unknown — not zero. Render an em dash rather than a confident 0.00.
 */
function fmtSpecVal(value, suffix) {
  if (value == null) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

function SpecHeader() {
  return (
    <div className="hov-spec-header">
      <span className="hov-spec-header__name">Name</span>
      <span className="hov-spec-header__cat">Cat</span>
      <span className="hov-spec-header__inst">Inst</span>
      <span className="hov-spec-header__val">CPU</span>
      <span className="hov-spec-header__val">RAM</span>
      <span className="hov-spec-header__val">SSD</span>
      <span className="hov-spec-header__time">Time</span>
    </div>
  );
}

function SpecCategoryIcon({ category }) {
  const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
  const { Icon, color } = meta;
  const tooltip = <CategoryTooltip category={category} />;
  return (
    <Tooltip2 content={tooltip} placement="top" hoverOpenDelay={200} popoverClassName="hov-cat-tooltip">
      <span className="hov-spec-cat" style={{ color }}>
        <Icon size={11} />
      </span>
    </Tooltip2>
  );
}

function ExpiringTodayPanel({ appSpecs }) {
  if (!appSpecs) {
    return (
      <div className="hov-panel hov-panel-center">
        <Spinner size={24} />
      </div>
    );
  }

  const items = appSpecs.expiringToday || [];

  return (
    <div className="hov-panel hov-panel--expiring">
      <div className="hov-header">
        <span className="hov-header-title">EXPIRING TODAY</span>
        {items.length > 0 && <span className="hov-header-badge">{items.length}</span>}
      </div>
      {items.length > 0 && <SpecHeader />}
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None expiring today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <SpecCategoryIcon category={spec.category} />
              <span className="hov-badge hov-badge--warn">{spec.instances}×</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.cpuPerInst, 'c')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ramGBPerInst, 'GB')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ssdGBPerInst, 'GB')}</span>
              <span className="hov-time hov-time--warn">in {blocksToHuman(spec.expiresInBlocks)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DeployedTodayPanel({ appSpecs }) {
  if (!appSpecs) {
    return (
      <div className="hov-panel hov-panel-center">
        <Spinner size={24} />
      </div>
    );
  }

  const items = appSpecs.deployedToday || [];

  return (
    <div className="hov-panel hov-panel--deployed">
      <div className="hov-header">
        <span className="hov-header-title">DEPLOYED TODAY</span>
        {items.length > 0 && <span className="hov-header-badge">{items.length}</span>}
      </div>
      {items.length > 0 && <SpecHeader />}
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None deployed today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <SpecCategoryIcon category={spec.category} />
              <span className="hov-badge hov-badge--green">{spec.instances}×</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.cpuPerInst, 'c')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ramGBPerInst, 'GB')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ssdGBPerInst, 'GB')}</span>
              <span className="hov-time hov-time--green">{blocksToHuman(spec.deployedAgeBlocks)} ago</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Note: same deliberate deviation as Task 1 — the original used the shared
`PanelHeader({ title, badge })` helper; inlined here to match `AppsTab`'s
own existing local-markup convention (its `RankedAddressList` doesn't use
a shared header helper either).

- [ ] **Step 2: Keep the full `fetch_global_app_specs` result in state**

Modify `AppsTab`'s state and effect:

```jsx
export function AppsTab() {
  const [gstore, setGstore] = useState(null);
  const [appSpecs, setAppSpecs] = useState(null);
  const [nodeOperators, setNodeOperators] = useState([]);
  const [ownerTotals, setOwnerTotals] = useState({ owners: [], networkTotalInstances: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stage1 = await fetch_global_stats(null);
      if (cancelled) return;
      const builtGstore = await fetch_total_network_utils(stage1);
      if (cancelled) return;
      setGstore(builtGstore);

      const specsResult = await fetch_global_app_specs(builtGstore);
      if (cancelled) return;
      setAppSpecs(specsResult);

      setNodeOperators(rankNodeOperators(builtGstore.nodePaymentAddresses));
      setOwnerTotals(aggregateOwnerTotals(specsResult.rawSpecs));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);
```

Only the two new lines (`const [appSpecs, setAppSpecs] = useState(null);`
and `setAppSpecs(specsResult);`) are added — `specsResult.rawSpecs`'s
existing use in `aggregateOwnerTotals` is untouched.

- [ ] **Step 3: Render the three panels behind their `PanelGate`s**

In `AppsTab`'s final `return`, add them to the existing
`.apps-tab-panel-grid` (alongside App Ecosystem / Top Hosted Apps / Top
Node Operators / Top App Owners) and `WorkhorsePanel` as its own row below
the grid (matching how `WorkhorsePanel` rendered as its own full-width
block in `HomeOverview`, not inside a grid):

```jsx
  return (
    <div className="apps-tab">
      <div className="apps-tab-stat-row">
        <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored stat">
          <div className="hov-panel apps-tab-stat-card">
            <span className="hov-header-title">FLUX-TEAM-SPONSORED</span>
            <span className="apps-tab-stat-value">{sharePct.toFixed(1)}%</span>
            <span className="apps-tab-stat-caption">
              of {fmtNum(networkTotalInstances)} ordered app instances run under the Flux team's own owner ID
            </span>
          </div>
        </PanelGate>
      </div>

      <div className="apps-tab-panel-grid">
        <PanelGate panelKey="appEcosystem" feature="App Ecosystem">
          <AppEcosystemBreakdown gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topHostedApps" feature="Top Hosted Apps">
          <TopHostedApps gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topNodeOperators" feature="Top Node Operators">
          <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        </PanelGate>
        <PanelGate panelKey="topAppOwners" feature="Top App Owners">
          <RankedAddressList
            title="TOP APP OWNERS"
            rows={ownerRows}
            valueLabel="instances"
            teamZelids={FLUX_TEAM_OWNER_ZELIDS}
          />
        </PanelGate>
        <PanelGate panelKey="expiringToday" feature="Expiring Today">
          <ExpiringTodayPanel appSpecs={appSpecs} />
        </PanelGate>
        <PanelGate panelKey="deployedToday" feature="Deployed Today">
          <DeployedTodayPanel appSpecs={appSpecs} />
        </PanelGate>
      </div>

      <PanelGate panelKey="workhorse" feature="Workhorse">
        <WorkhorsePanel gstore={gstore} appSpecs={appSpecs} />
      </PanelGate>
    </div>
  );
}
```

All four keys (`expiringToday`, `deployedToday`, `workhorse` here, plus
`topDogs` from Task 1) are already `'public'` in `panelAccess.js` — don't
change that file.

- [ ] **Step 4: Remove the three panels from `HomeOverview`**

In `client/src/home/HomeOverview/index.jsx`:
- Delete `ExpiringTodayPanel` (the "Panel 5" block) and `DeployedTodayPanel`
  ("Panel 6" block) entirely, plus the shared `SpecHeader`,
  `SpecCategoryIcon`, and `fmtSpecVal` helpers (the "Spec Header" section) —
  **but check `blocksToHuman` first**: it's also used by
  `ExpiringTodayPanel`/`DeployedTodayPanel` only, per the current file, so
  it can be deleted too once those two panels are gone — confirm no other
  remaining panel in this file (`NetworkStatsPanel`, `NetworkResourcesPanel`,
  `GeoDistributionPanel`) calls it before removing.
- Remove the `WorkhorsePanel` import (`import { WorkhorsePanel } from
  'home/WorkhorsePanel';`) and its render call
  (`<WorkhorsePanel gstore={gstore} appSpecs={appSpecs} />`).
- Remove now-unused imports this leaves behind: `Tooltip2` — **check
  first**, `NetworkResourcesPanel`'s `DemandIndicator`
  also uses `Tooltip2` (confirmed: `right={<DemandIndicator .../>}` inside
  `NetworkResourcesPanel`, and `DemandIndicator` itself wraps its dot in a
  `<Tooltip2>`) — **do NOT remove the `Tooltip2` import**, it's still
  needed. `APP_CATEGORY_META` and `CategoryTooltip` ARE safe to remove
  (only used by `SpecCategoryIcon`, which is gone).
- In `HomeOverview`'s main return, remove the entire
  `.home-overview-row.home-overview-row--bottom` div's `ExpiringTodayPanel`/
  `DeployedTodayPanel` children — this leaves only `TopHostedApps` in that
  row. **Layout fix, required, not optional**: a 3-column CSS grid
  (`.home-overview-row`'s `grid-template-columns: repeat(3, 1fr)`) with a
  single child looks broken (one narrow panel, two-thirds empty space).
  Remove the wrapping `<div className="home-overview-row
  home-overview-row--bottom">...</div>` entirely and render
  `<TopHostedApps gstore={gstore} />` as a standalone top-level child of
  `.home-overview` instead — the same pattern `GeoDistributionPanel`
  already uses (bare child, no row wrapper). Verify live in Step 6 that
  this renders cleanly, not stretched or squished; adjust
  `TopHostedApps`' own CSS only if the live check shows a real problem (it
  already renders correctly at full width inside `AppsTab`'s grid cell
  today, so it likely needs no CSS change at all — confirm rather than
  assume).

- [ ] **Step 4b: Remove `appSpecs` and `globalRankings` from `HomeOverview`'s
  signature, and their now-dead fetch/state from `Home.jsx`**

**Confirmed by reading the whole of both files first** (do this
confirmation yourself too, don't just trust this plan — file contents may
have shifted slightly since this plan was written): after Task 1 (removed
`TopDogsPanel`, the only `globalRankings` consumer) and this task's Step 4
(removed `ExpiringTodayPanel`/`DeployedTodayPanel`/`WorkhorsePanel`, the
only `appSpecs` consumers), NOTHING remaining in `HomeOverview`
(`NetworkStatsPanel`, `NetworkResourcesPanel`, `AppEcosystemBreakdown`,
`TopHostedApps`, `GeoDistributionPanel`) reads either prop. And in
`Home.jsx` itself, `globalRankings`/`appSpecs`/`appSpecsError` are used
NOWHERE except being fetched, stored in state, and passed to
`<HomeOverview .../>` — no other method or render path touches them. Once
both are true, this is genuinely dead work (two real network fetches, one
of them — `fetch_global_app_specs` — a meaningfully large payload per this
repo's own sessionStorage-quota history) running on every `/home` load for
props nothing renders. Remove it:

In `client/src/home/HomeOverview/index.jsx`:
- Drop `appSpecs` and `globalRankings` from the exported `HomeOverview`
  function's destructured parameters (`export function HomeOverview({
  gstore, countryCounts, gpuPrices })`).

In `client/src/home/Home.jsx`:
- Remove `appSpecs: null,`, `appSpecsError: false,`, and
  `globalRankings: null,` from the constructor's initial state
  (`appSpecsError` is never read anywhere in this file even today — it's
  pre-existing dead state, safe to remove alongside `appSpecs`).
- In `hydrateApp()`'s no-wallet branch, remove the
  `fetch_global_app_specs(gstore).then(...).catch(...)` and
  `fetch_global_performance_rankings().then(...).catch(...)` calls
  entirely (both currently sit between `this.setState({ gstore })` and
  `fetch_country_node_counts()` — remove just those two `.then/.catch`
  blocks, leave `fetch_country_node_counts()` and `fetch_gpu_prices()`
  untouched).
- Remove the now-unused `fetch_global_app_specs`/
  `fetch_global_performance_rankings` imports from this file's import
  block, IF this file imports them directly (check the top-of-file
  imports — they may come from `apidata`/`main/apidata` or similar;
  remove only if nothing else in `Home.jsx` still calls them).
- In the `<HomeOverview .../>` call site (inside `render()`), remove the
  `appSpecs={this.state.appSpecs}` and
  `globalRankings={this.state.globalRankings}` props being passed —
  `HomeOverview` no longer accepts either.

- [ ] **Step 5: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline.

- [ ] **Step 6: Manual QA**

With `TESTING=true`, `yarn start`, confirm:
- `/home` no longer shows "EXPIRING TODAY", "DEPLOYED TODAY", or the
  Workhorse panel anywhere; the row that used to hold Top Hosted Apps +
  Expiring + Deployed now shows only Top Hosted Apps, rendered cleanly
  (not squeezed into a leftover 3-column grid cell).
- `/analytics`'s Apps tab now shows "EXPIRING TODAY" and "DEPLOYED TODAY"
  in its panel grid, and the Workhorse panel below the grid, all populated
  with real data.
- No console errors on either page.

Revert `TESTING` to `false`, confirm `git status` clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(analytics): move Expiring/Deployed Today and Workhorse panels from /home to /analytics' Apps tab"
```

---

### Task 3: Mandatory live regression QA — Top Dogs rankings, real wallet, before/after

**This task is the governing constraint from the spec and from direct user
instruction. Do not skip it. Do not consider this session done without
it.**

**Files:** none created/modified — verification only.

- [ ] **Step 1: Establish the "before" baseline** — check out `origin/main`
  in a separate temporary worktree (`git worktree add
  worktrees/main-baseline-task3 origin/main` from the repo root, `yarn
  install` if `node_modules` is missing, `yarn start` on a distinct port,
  e.g. `PORT=3001 BROWSER=none yarn start`), set `TESTING=true`, and
  search the SAME real wallet Session 1's Task 8 verified:
  `t1YFwF5czCU1bwd9rKzY4UB3gzheS8F9j7K` (8 CUMULUS nodes, all on host
  `213.32.246.1` — the exact multi-node-same-host-same-tier shape that
  caused the 2026-09-09 `rankInGroup`/`lookupNodeInfo` bugs) on `/home`.
  Record: Top Dogs' four metric cards (EPS/DWS/Down/Up) per tier — which
  node IP wins each metric, and the exact displayed value/country flag for
  each.

- [ ] **Step 2: Same wallet, this branch** — `yarn start` on the default
  port from `worktrees/analytics-session2/client`, same `TESTING=true`,
  search the identical wallet on `/analytics`'s Network tab this time (not
  `/home` — Top Dogs no longer lives there). Record the same four
  metric-card winners/values/flags.

- [ ] **Step 3: Diff before vs. after** — every metric-card winner (IP,
  value, country flag) must match exactly between `main`'s `/home` and
  this branch's `/analytics` Network tab. If a bare-IP-duplicate scenario
  causes a DIFFERENT winner to be picked (the exact 2026-09-09 bug shape),
  that is a real regression — stop and report it, do not proceed to Task
  4 with a mismatch unresolved.

- [ ] **Step 4: Confirm `/home` itself is otherwise unaffected** — on this
  branch's `/home`, confirm `NetworkStatsPanel`, `NetworkResourcesPanel`,
  `AppEcosystemBreakdown`, `TopHostedApps` (now standalone, per Task 2's
  layout fix), and `GeoDistributionPanel` all still render with real data,
  matching `main`'s `/home` for the same wallet (excluding the
  now-removed panels, which is expected).

- [ ] **Step 5: Clean up** — stop both dev servers, remove the temporary
  baseline worktree (`git worktree remove worktrees/main-baseline-task3`
  — if removal is refused with a file-lock error, that's a known
  pre-existing OneDrive/Windows issue on this machine; confirm via `git
  worktree list` that it's at least deregistered), confirm `TESTING` is
  `false` in both checkouts, confirm `git status` clean in this worktree.

- [ ] **Step 6: Document the result** — this will be needed for the PR
  description: which wallet was compared, and confirmation every metric
  matched (or, if something didn't, what was found and how it was
  resolved before proceeding).

---

### Task 4: Final whole-branch review + verification sweep

**Files:** none created — final verification only.

- [ ] **Step 1: Whole-branch diff review** — `git diff --stat
  <merge-base>..HEAD` (merge-base is wherever this worktree branched from
  `origin/main`); confirm every changed file is one Tasks 1-2 actually
  named. Read the full diff once end-to-end checking specifically: no
  duplicate function/component name collisions introduced (e.g. `AppsTab`
  now has two files' worth of local helpers — confirm no naming clash
  with anything already in that file), `panelAccess.js` genuinely
  untouched, no stray `TESTING=true` left set.

- [ ] **Step 2: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as this plan's recorded baseline (no new tests
expected — pure UI relocation).

- [ ] **Step 3: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0. Compare warning files against this plan's Global
Constraints baseline check — flag anything beyond the pre-existing
baseline warning files.

- [ ] **Step 4: Confirm Task 3's live regression QA is actually done and
  documented** — do not consider this session done otherwise.

PR creation follows this repo's standard
`superpowers:finishing-a-development-branch` flow. The PR description
must include: Task 3's wallet-comparison summary (which wallet, that every
Top Dogs metric matched), and a note that `AppEcosystemBreakdown`/
`TopHostedApps` were deliberately left duplicated on both `/home` and
`/analytics` (pre-existing since PR #173, not something this session
introduced or should have removed).
