# Analytics Page — Session 3 (Network Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/analytics` page's second tab — **Network** — showing a continent-level node-distribution rollup and a hand-rolled world map of country-level node counts.

**Architecture:** Two new pure/fetch-split modules follow the pattern Session 2 established (`topOwners.js`): `continentDistribution.js` is a new aggregation over geolocation data the app already fetches elsewhere (no new network call). The world map resurrects `client/src/live/countryCentroids.js` — a country-centroid table + equirectangular percent-projector written for an earlier feature and never wired to anything (verified zero importers) — promoted to `client/src/geo/countryCentroids.js` and used by a new hand-rolled `WorldMap` component: CSS-positioned bubbles over a graticule, no map library, no sourced map asset. A new `NetworkTab` assembles both, following `AppsTab`'s exact fetch-in-`useEffect` shape, and is wired into `Analytics.jsx` as a second `<Tab>`.

**Tech Stack:** React 18 (hooks, function components), Blueprint.js (`Tooltip2` — already a dependency), Jest (existing test runner). No new npm dependency, no new external asset.

**Spec:** `PREMIUM_FEATURES_PLAN.md`, the "Network tab (Session 3)" section and the "Build order" section's Session 3 entry.

## Global Constraints

- **No new npm dependency.** The world map is hand-rolled CSS/divs (confirmed with the user over `react-simple-maps`+topojson and over sourcing a coastline SVG — this codebase's existing map data is explicitly "decorative, not for navigation" per `countryCentroids.js`'s own comment, and every other panel in this app is hand-rolled CSS/divs, not a chart library).
- New code follows this codebase's existing conventions: named exports, `camelCase` filenames for pure modules, `PascalCase` directories for components with an `index.jsx` + co-located `index.scss`, tests co-located as `*.test.js`.
- **Shared panel chrome (`.hov-panel`, `.hov-header`, `.hov-ranked-list`, etc.) is duplicated per component, not imported cross-file** — this is an established, deliberately-documented pattern (see the header comment in `client/src/components/TopHostedApps/index.scss`), not an oversight to fix. Each new component's `.scss` gets its own full copy of whatever subset of that chrome it renders.
- After every task: `cd client && CI=true npx react-scripts test --watchAll=false` (count only ever goes up from this worktree's confirmed baseline of **254**) and `npx react-scripts build` (exit 0, **exactly** the 4 pre-existing baseline warning files — `Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`, `WalletNodes/index.jsx` — nothing else).
- This plan is scoped to the Network tab only. Sessions 4 (Donor tab) and 5+ (Chain Activity tab) are explicitly **not** in scope.

---

## Task 1: `continentDistribution.js` — continent-level node rollup

**Files:**
- Create: `client/src/analytics/continentDistribution.js`
- Test: `client/src/analytics/continentDistribution.test.js`

**Interfaces:**
- Produces: `rollupByContinent(geoEntries)` — pure, `geoEntries: Array<{geolocation: {continent, countryCode, country, ...}}>` (the exact shape `fetch_node_geolocation()` resolves to — confirmed at `client/src/apidata.js:1160-1175`) → `{ continents: Array<{continent, nodeCount}> (sorted descending), networkTotal: number }`. `fetch_continent_distribution(): Promise<{continents, networkTotal}>` — fetch/parse layer. Consumed by Task 4's `NetworkTab`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/analytics/continentDistribution.test.js`:

```js
import { rollupByContinent } from './continentDistribution';

describe('rollupByContinent', () => {
  it('counts nodes per continent and sorts descending', () => {
    const geoEntries = [
      { geolocation: { continent: 'North America', countryCode: 'US' } },
      { geolocation: { continent: 'Europe', countryCode: 'DE' } },
      { geolocation: { continent: 'North America', countryCode: 'CA' } },
      { geolocation: { continent: 'North America', countryCode: 'US' } },
    ];
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([
      { continent: 'North America', nodeCount: 3 },
      { continent: 'Europe', nodeCount: 1 },
    ]);
    expect(networkTotal).toBe(4);
  });

  it('still counts a node with geolocation but no continent toward the network total, just not toward any continent row', () => {
    const geoEntries = [
      { geolocation: { continent: 'Asia', countryCode: 'JP' } },
      { geolocation: { countryCode: 'ZZ' } },
    ];
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([{ continent: 'Asia', nodeCount: 1 }]);
    expect(networkTotal).toBe(2);
  });

  it('skips entries with no geolocation at all, rather than throwing', () => {
    const geoEntries = [{ geolocation: { continent: 'Asia', countryCode: 'JP' } }, {}, { geolocation: null }];
    expect(() => rollupByContinent(geoEntries)).not.toThrow();
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([{ continent: 'Asia', nodeCount: 1 }]);
    expect(networkTotal).toBe(1);
  });

  it('returns an empty result for no entries', () => {
    expect(rollupByContinent([])).toEqual({ continents: [], networkTotal: 0 });
    expect(rollupByContinent(undefined)).toEqual({ continents: [], networkTotal: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/continentDistribution.test.js --watchAll=false`
Expected: FAIL — `continentDistribution.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `client/src/analytics/continentDistribution.js`:

```js
import { fetch_node_geolocation } from 'networkNodes';

/*
 * Pure: network-wide node counts grouped by continent. Country-level counts
 * already exist (fetch_country_node_counts, apidata.js:1407), but nothing
 * groups by continent even though the raw geolocation payload already
 * carries it per node (apidata.js's fetch_global_performance_rankings reads
 * `geo.continent` today, just never aggregates on it) — this is a new
 * aggregation over data already fetched elsewhere, not a new data source.
 *
 * `geoEntries` is the raw array fetch_node_geolocation() resolves to:
 * [{ geolocation: { continent, countryCode, country, ip, ... } }, ...].
 * A node with geolocation but no continent value still counts toward
 * networkTotal, just not toward any continent row — same convention
 * topOwners.js's aggregateOwnerTotals uses for a spec with no owner.
 */
export function rollupByContinent(geoEntries) {
  const perContinent = {};
  let networkTotal = 0;

  for (const entry of geoEntries || []) {
    const geo = entry?.geolocation;
    if (!geo) continue;
    networkTotal++;

    const continent = geo.continent;
    if (!continent) continue;
    perContinent[continent] = (perContinent[continent] || 0) + 1;
  }

  const continents = Object.entries(perContinent)
    .map(([continent, nodeCount]) => ({ continent, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount);

  return { continents, networkTotal };
}

// fetch_node_geolocation() is shared/deduped (in-flight sharing + a 60s TTL
// cache) via networkNodes.js, so calling this alongside fetch_country_node_counts
// (which also calls fetch_node_geolocation() internally) costs one real
// network request, not two — no manual plumbing needed between the two.
export async function fetch_continent_distribution() {
  const geoEntries = await fetch_node_geolocation();
  return rollupByContinent(geoEntries);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/continentDistribution.test.js --watchAll=false`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 254 (baseline) + 4 = 258.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/continentDistribution.js client/src/analytics/continentDistribution.test.js
git commit -m "feat(analytics): add rollupByContinent — network-wide continent node distribution"
```

---

## Task 2: Promote `countryCentroids.js` to a shared location

**Files:**
- Move: `client/src/live/countryCentroids.js` → `client/src/geo/countryCentroids.js`

**Interfaces:**
- Produces (unchanged, just relocated): `COUNTRY_CENTROIDS`, `DEFAULT_CENTROID`, `getCountryCentroid(countryCode)`, `projectToPercent([lat, lon]) → {xPct, yPct}`. Consumed by Task 3's `WorldMap`.

This file has **zero current importers** (confirmed via `grep -r "countryCentroids\|projectToPercent\|getCountryCentroid" client/src`, live/2026-09-05) — it was written for an earlier feature and never wired in. This is a pure mechanical move: no call sites to update.

- [ ] **Step 1: Move the file**

```bash
git mv client/src/live/countryCentroids.js client/src/geo/countryCentroids.js
```

- [ ] **Step 2: Confirm nothing references the old path**

Run: `grep -rn "live/countryCentroids" client/src`
Expected: no matches.

- [ ] **Step 3: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, still 258 (this task adds/removes no tests).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 4: Commit**

```bash
git add client/src/geo/countryCentroids.js client/src/live/countryCentroids.js
git commit -m "refactor: promote countryCentroids.js to geo/ — it now serves the Network tab too"
```

---

## Task 3: `WorldMap` — hand-rolled country-bubble map

**Files:**
- Create: `client/src/analytics/WorldMap/index.jsx`
- Create: `client/src/analytics/WorldMap/index.scss`

**Interfaces:**
- Consumes: `getCountryCentroid`, `projectToPercent` from Task 2's `geo/countryCentroids`.
- Produces: `WorldMap({ countryCounts })` — `countryCounts: Array<{country, countryCode, nodeCount}>` (the exact shape `fetch_country_node_counts()` already returns, sorted descending — `client/src/apidata.js:1407`). Consumed by Task 4's `NetworkTab`.

No automated tests for this task — it is a presentational/data-assembling component, verified manually in Task 4's final check, matching how Session 2 treated `AppEcosystemBreakdown`/`TopHostedApps` (extraction, no new tests) and `AppsTab` (assembly component, manual-only).

- [ ] **Step 1: Create `WorldMap`**

Create `client/src/analytics/WorldMap/index.jsx`:

```jsx
import React from 'react';
import './index.scss';

import { Tooltip2 } from '@blueprintjs/popover2';
import { getCountryCentroid, projectToPercent } from 'geo/countryCentroids';

const MIN_RADIUS_PX = 4;
const MAX_RADIUS_PX = 16;

// Graticule: decorative lat/lon reference lines, not survey-accurate — same
// spirit as countryCentroids.js's own centroids ("fine for a decorative
// ping, not for navigation").
const GRATICULE_LATS = [-60, -30, 0, 30, 60];
const GRATICULE_LONS = [-120, -60, 0, 60, 120];

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

export function WorldMap({ countryCounts }) {
  const counts = countryCounts || [];
  const maxCount = counts[0]?.nodeCount || 1;

  // Countries with no known centroid are left off the map rather than
  // plotted at DEFAULT_CENTROID — several unrelated countries stacked on
  // one fallback point would read as a real cluster. getCountryCentroid
  // already returns null for anything outside COUNTRY_CENTROIDS.
  const bubbles = counts
    .map((c) => {
      const centroid = getCountryCentroid(c.countryCode);
      if (!centroid) return null;
      const { xPct, yPct } = projectToPercent(centroid);
      const ratio = c.nodeCount / maxCount;
      // sqrt scale so bubble AREA (not radius) tracks node count — the
      // usual cartographic convention for proportional-symbol maps.
      const radiusPx = MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * Math.sqrt(ratio);
      return { ...c, xPct, yPct, radiusPx };
    })
    .filter(Boolean);

  return (
    <div className="hov-panel wm-panel">
      <div className="hov-header">
        <span className="hov-header-title">NODE DISTRIBUTION MAP</span>
      </div>

      {counts.length === 0 ? (
        <div className="hov-empty">No data available</div>
      ) : (
        <div className="wm-frame">
          {GRATICULE_LATS.map((lat) => (
            <div
              key={`lat-${lat}`}
              className="wm-graticule wm-graticule--h"
              style={{ top: `${projectToPercent([lat, 0]).yPct}%` }}
            />
          ))}
          {GRATICULE_LONS.map((lon) => (
            <div
              key={`lon-${lon}`}
              className="wm-graticule wm-graticule--v"
              style={{ left: `${projectToPercent([0, lon]).xPct}%` }}
            />
          ))}

          {bubbles.map((b) => (
            <Tooltip2
              key={b.countryCode}
              content={`${b.country}: ${fmtNum(b.nodeCount)} nodes`}
              placement="top"
              hoverOpenDelay={150}
              transitionDuration={80}
            >
              <div
                className="wm-bubble"
                style={{
                  left: `${b.xPct}%`,
                  top: `${b.yPct}%`,
                  width: `${b.radiusPx * 2}px`,
                  height: `${b.radiusPx * 2}px`,
                }}
              />
            </Tooltip2>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `WorldMap`'s stylesheet**

Create `client/src/analytics/WorldMap/index.scss`:

```scss
@import 'styles/functional';

// One more independent copy of the shared panel chrome — see the header
// comment in components/TopHostedApps/index.scss for why this is
// duplicated per component rather than imported cross-file.
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

.wm-panel {
  border-left: 2px solid #0ea5e9;
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
    animation: wm-shimmer 1.8s ease-in-out infinite;
    border-radius: var(--radius-sm);
    opacity: 0.6;
    pointer-events: none;
  }
}

@keyframes wm-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

// ── The map itself ──────────────────────────────────────────────────────────

.wm-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #dbeafe;

  @include rule-mode-dark() {
    background: #0b1f33;
  }
}

.wm-graticule {
  position: absolute;
  background: rgba(30, 64, 120, 0.12);

  @include rule-mode-dark() {
    background: rgba(255, 255, 255, 0.07);
  }

  &--h {
    left: 0;
    right: 0;
    height: 1px;
  }

  &--v {
    top: 0;
    bottom: 0;
    width: 1px;
  }
}

.wm-bubble {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: rgba(38, 134, 208, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: default;
  transition: background var(--transition-fast);

  &:hover {
    background: rgba(38, 134, 208, 0.95);
  }
}
```

- [ ] **Step 3: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, still 258 (no new tests this task).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 4: Commit**

```bash
git add client/src/analytics/WorldMap
git commit -m "feat(analytics): add WorldMap — hand-rolled country-bubble node distribution map"
```

---

## Task 4: `NetworkTab` — assemble the tab, wire it into `Analytics.jsx`

**Files:**
- Create: `client/src/analytics/NetworkTab/index.jsx`
- Create: `client/src/analytics/NetworkTab/index.scss`
- Modify: `client/src/analytics/Analytics.jsx`

**Interfaces:**
- Consumes: `WorldMap` (Task 3); `rollupByContinent`'s output shape via `fetch_continent_distribution` (Task 1); `fetch_country_node_counts` from `apidata` (existing, `client/src/apidata.js:1407`).
- Produces: `NetworkTab()` — no props, self-contained data fetching. Mounted as the `/analytics` page's second tab; no other task depends on this one's exports.

- [ ] **Step 1: Write `NetworkTab`**

Create `client/src/analytics/NetworkTab/index.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_country_node_counts } from 'apidata';
import { fetch_continent_distribution } from 'analytics/continentDistribution';
import { WorldMap } from 'analytics/WorldMap';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
}

function ContinentBreakdown({ continents, networkTotal }) {
  const rows = continents || [];
  const maxVal = rows[0]?.nodeCount || 1;

  return (
    <div className="hov-panel nt-continent-panel">
      <div className="hov-header">
        <span className="hov-header-title">CONTINENT DISTRIBUTION</span>
        <span className="hov-header-badge">{rows.length}</span>
      </div>
      <div className="hov-ranked-list">
        {rows.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          rows.map(({ continent, nodeCount }, i) => (
            <div key={continent} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name">{continent}</span>
              <div className="hov-ranked-bar-wrap">
                <div className="hov-ranked-bar-fill" style={{ width: `${(nodeCount / maxVal) * 100}%` }} />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)} ({pct(nodeCount, networkTotal)}%)</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function NetworkTab() {
  const [countryCounts, setCountryCounts] = useState([]);
  const [continentData, setContinentData] = useState({ continents: [], networkTotal: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Both ultimately read the same shared, deduped geolocation fetch
      // (networkNodes.js's fetch_node_geolocation, see continentDistribution.js) —
      // calling them together costs one real network request, not two.
      const [counts, continentResult] = await Promise.all([
        fetch_country_node_counts(),
        fetch_continent_distribution(),
      ]);
      if (cancelled) return;

      setCountryCounts(counts);
      setContinentData(continentResult);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="network-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="network-tab">
      <WorldMap countryCounts={countryCounts} />
      <div className="network-tab-continent-row">
        <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `NetworkTab`'s stylesheet**

Create `client/src/analytics/NetworkTab/index.scss` — a self-contained copy of the ranked-list chrome this tab's own `ContinentBreakdown` needs (kept independent of `WorldMap`'s copy, same "independent copies" reasoning as elsewhere in this codebase — not relying on `WorldMap`'s side-effect CSS import order):

```scss
@import 'styles/functional';

.network-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.network-tab-continent-row {
  display: flex;
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

.nt-continent-panel {
  flex: 1 1 420px;
  max-width: 480px;
  min-width: 0;
  border-left: 2px solid #8b5cf6;
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

.hov-ranked-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hov-ranked-row {
  display: grid;
  align-items: center;
  gap: 6px;
  grid-template-columns: 20px 1fr 60px 70px;
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

.hov-rank {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;

  &--gold {
    color: #d97706;
    background: rgba(217, 119, 6, 0.12);
  }
  &--silver {
    color: #94a3b8;
    background: rgba(148, 163, 184, 0.12);
  }
  &--bronze {
    color: #b45309;
    background: rgba(180, 83, 9, 0.12);
  }
}

.hov-ranked-name {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.hov-ranked-bar-wrap {
  height: 4px;
  border-radius: 2px;
  background: var(--surface-inset);
  overflow: hidden;
}

.hov-ranked-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #8b5cf6, #c4b5fd);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
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
```

- [ ] **Step 3: Wire `NetworkTab` into `Analytics.jsx`**

Read `client/src/analytics/Analytics.jsx` in full first (it's short, from Session 2) to confirm it still matches this exactly:

```jsx
import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import './Analytics.scss';

/*
 * One tab exists today (Apps). Network/Donor/Chain Activity tabs land in
 * later sessions — add each as one more <Tab> entry here, not a
 * restructure. Gated by PremiumGate at the route level (Application.jsx),
 * same as /live — this component only renders once already unlocked.
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
      </Tabs>
    </div>
  );
}
```

If it has diverged, stop and report rather than guessing. Otherwise replace it with:

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

- [ ] **Step 4: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, still 258 (this task adds no new automated tests — `NetworkTab` is a data-assembling component, verified manually in the final milestone below, matching how Session 2 treated `AppsTab`).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 5: Commit**

```bash
git add client/src/analytics/NetworkTab client/src/analytics/Analytics.jsx
git commit -m "feat(analytics): build the Network tab — continent distribution + world map"
```

---

## Final milestone: full regression pass

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 258 total (254 baseline + 4 new in Task 1).

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 3: Full manual walkthrough, fresh**

`yarn start`, with `PREMIUM_TESTING_MODE=true` set in `client/public/runtime/app-content.js`:

- `/home` (or `/demo`) — unaffected (this plan never touches Home's files).
- `/nodes` — unaffected (this plan never touches `MainApp.jsx`).
- `/live` — unaffected.
- `/analytics` → **Apps** tab — identical to how Session 2 left it (this plan doesn't touch `AppsTab`'s own files, only adds a sibling `<Tab>` in `Analytics.jsx`).
- `/analytics` → **Network** tab (new):
  - The world map renders a graticule and one bubble per country with node data, sized roughly by node count; hovering a bubble shows a tooltip with the country name and node count.
  - The continent breakdown panel lists continents ranked by node count with gold/silver/bronze on the top 3, a percent-of-network figure per row, and a badge showing the number of continents.
  - Numbers are plausible (a handful of continents, largest one clearly North America or Europe given the network's known concentration).
  - Switching between the Apps and Network tabs preserves each tab's own data (no re-fetch flicker on every switch — `renderActiveTabPanelOnly` unmounts the inactive tab, so switching back to Network re-fetches; confirm this is not jarring, just a brief spinner).
- Open the browser console on `/analytics` — no errors.
- Toggle light/dark theme — the map's ocean/graticule colors and panel chrome both read correctly in either mode.

- [ ] **Step 4: Update `PREMIUM_FEATURES_PLAN.md`**

Change the Session 3 line in the "Build order" section from:

```markdown
- [ ] **Session 3 — Network tab.** Continent rollup (new aggregation) + world map (new
  component, reusing already-written-but-unwired projector code). No backend.
```

to:

```markdown
- [x] **Session 3 — Network tab.** Done. Continent rollup
  (`analytics/continentDistribution.js`, a new aggregation over geolocation data already
  fetched elsewhere) + a hand-rolled world map (`analytics/WorldMap`) built on the
  promoted `geo/countryCentroids.js` projector — country bubbles over a graticule, no
  new npm dependency, no sourced map asset. No backend.
```

Change the "### Network tab (Session 3)" section heading and its two bullets from:

```markdown
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
```

to:

```markdown
### Network tab (Session 3) — Built

- **Continent/country centralization risk** — Built. `client/src/analytics/continentDistribution.js`
  (+test): `rollupByContinent()`, a pure aggregation over the raw geolocation payload
  `fetch_node_geolocation()` already returns network-wide (that payload already carries
  `continent` per node — `apidata.js:1172` — nothing grouped by it before this).
- **World map** — Built. `client/src/live/countryCentroids.js` (country→lat/lon centroids +
  an equirectangular `projectToPercent()` projector) was completely unwired — confirmed
  zero importers before this session. Promoted to `client/src/geo/countryCentroids.js`.
  `client/src/analytics/WorldMap/index.jsx` is fully hand-rolled: a graticule + country
  bubbles sized by node count, no sourced world-outline asset and no new npm dependency
  (decided over `react-simple-maps`/topojson and over sourcing a coastline SVG — this
  data is already explicitly "decorative, not for navigation" per `countryCentroids.js`'s
  own comment, so hand-rolled stayed consistent with the rest of this app's CSS/div
  panels rather than reaching for a mapping library).
```

Commit:

```bash
git add PREMIUM_FEATURES_PLAN.md
git commit -m "docs: mark Session 3 (Network tab) complete"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/analytics-session3
gh pr create --base main --title "Analytics page: Network tab (Session 3)" --body "..."
```

Note in the PR body which manual checks were run and their outcomes, following this repo's established convention (see PR #173's body for the format).
