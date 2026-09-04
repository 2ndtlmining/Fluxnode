# Analytics Page — Session 2 (Shell + Apps Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/analytics` page shell (tab navigation, donor-gated like `/live`) and its first tab — **Apps** — showing the app-category breakdown and top-hosted-apps panels (moved from Home to a shared location, Home's rendering unchanged), plus two genuinely new stats: top node operators and top app owners, with the Flux team's own share of network instances called out.

**Architecture:** Two existing Home panels get extracted to `client/src/components/` as standalone, reusable components — a mechanical move, Home's render output does not change. Two new pure aggregation modules (`topOwners.js`, `teamSponsored.js`) follow the same pure/fetch split Part B established (`computeDonorStatus`/`fetch_donor_status`) so the ranking math is unit-testable without mocking `fetch`. `Analytics.jsx` is a new page using Blueprint's `Tabs` (first use in this codebase) gated by the existing `PremiumGate`/`DonorContext` from Session 1.

**Tech Stack:** React 18 (hooks, function components), Blueprint.js (`Tabs`, `Tab`, `Spinner`, `Tooltip2` — all already dependencies), Jest (existing test runner). No new npm dependency.

**Spec:** `PREMIUM_FEATURES_PLAN.md`, Part C ("Apps tab" content) and the "Build order" section's Session 2 entry.

## Global Constraints

- **Home's existing rendering must not change** — Task 1 (the extraction) is the one task in this plan with real regression risk to an existing, working page. Treat it with the same care Session 1 gave the Nodes-page task: read the current files first, verify the move is behavior-preserving, and do a real manual visual check afterward, not just a green test suite.
- New code follows this codebase's existing conventions: named exports, `camelCase` filenames for pure modules, `PascalCase` directories for components with an `index.jsx` + co-located `index.scss`, tests co-located as `*.test.js`.
- No new npm dependency — reuse Blueprint (`Tabs`/`Tab`, already installed, never used) for tab navigation; no charting library (that decision is explicitly deferred to a later session's Network tab).
- After every task: `cd client && CI=true npx react-scripts test --watchAll=false` (count only ever goes up from the current 239) and `npx react-scripts build` (exit 0, **exactly** the 4 pre-existing baseline warning files — `Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`, `WalletNodes/index.jsx` — nothing else).
- Sessions 3 (Network tab), 4 (Donor tab), 5 (Chain Activity tab) are explicitly **not** in scope for this plan.

---

## Task 1: Extract App Ecosystem breakdown and Top Hosted Apps to shared components

**Files:**
- Create: `client/src/components/AppEcosystemBreakdown/index.jsx`
- Create: `client/src/components/AppEcosystemBreakdown/index.scss`
- Create: `client/src/components/TopHostedApps/index.jsx`
- Create: `client/src/components/TopHostedApps/index.scss`
- Modify: `client/src/home/HomeOverview/index.jsx`
- Modify: `client/src/home/HomeOverview/index.scss`

**Interfaces:**
- Produces: `AppEcosystemBreakdown({ gstore })` and `TopHostedApps({ gstore })` — same props, same rendered output as today's `AppEcosystemPanel`/`TopHostedAppsPanel`. Consumed by `HomeOverview/index.jsx` (unchanged call sites) and, later in this plan, Task 6's `AppsTab`.

- [ ] **Step 1: Read the current files in full before touching anything**

Read `client/src/home/HomeOverview/index.jsx` in full (it's ~870 lines) and `client/src/home/HomeOverview/index.scss` in full (~1065 lines). Confirm `AppEcosystemPanel` (with its helper `ecoWeightClass`) and `TopHostedAppsPanel` look exactly as described below before extracting them — if anything differs, stop and report rather than guessing.

`ecoWeightClass` + `AppEcosystemPanel` (currently lines 308-459 of `HomeOverview/index.jsx`):

```jsx
function ecoWeightClass(totalInstances, maxVal) {
  const ratio = maxVal > 0 ? totalInstances / maxVal : 0;
  if (ratio >= 0.5) return 'hov-eco-row--lg';
  if (ratio >= 0.15) return 'hov-eco-row--md';
  return 'hov-eco-row--sm';
}

function AppEcosystemPanel({ gstore }) {
  const { runningCategoryMap, runningCategoryTop, node_count, runningAppsStatus, runningAppsFetchedAt } = gstore;
  const hasRunning = Object.keys(runningCategoryMap).length > 0;
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Still loading if no node data at all
  if (!hasRunning && node_count.total === 0) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--ecosystem">
        <Spinner size={24} />
      </div>
    );
  }

  /*
   * Single source of truth: running containers reported by the nodes.
   *
   * This panel used to fall back to globalappsspecifications whenever the
   * running-app fetch came back empty. That endpoint counts ORDERED instances,
   * not running containers, so the whole panel would silently re-render with
   * different numbers and a different row order — reported as the "Other"
   * category jumping and then settling (issue #144). Retry and last-known-good
   * caching now happen in fetch_fluxinfo_aggregate; if there is genuinely
   * nothing to show we say so rather than swapping in another dataset.
   */
  if (!hasRunning) {
    return (
      <div className="hov-panel hov-panel--ecosystem">
        <PanelHeader title="APP ECOSYSTEM" />
        <div className="hov-empty">
          Running app data is unavailable right now.
          <br />
          Retrying on the next refresh.
        </div>
      </div>
    );
  }

  const allCats = Object.entries(runningCategoryMap)
    .map(([category, totalInstances]) => ({ category, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  const isStale = runningAppsStatus === 'stale';
  const staleSince = runningAppsFetchedAt ? new Date(runningAppsFetchedAt).toLocaleTimeString() : null;

  const cats = allCats.slice(0, 12);
  const grandTotal = allCats.reduce((s, c) => s + c.totalInstances, 0) || 1;
  const maxVal = cats[0]?.totalInstances || 1;

  return (
    <div className="hov-panel hov-panel--ecosystem">
      <PanelHeader
        title="APP ECOSYSTEM"
        right={
          isStale ? (
            <Tooltip2
              content={`Live data is unreachable. Showing the last successful reading${staleSince ? ' from ' + staleSince : ''}.`}
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-eco-stale">stale</span>
            </Tooltip2>
          ) : null
        }
        badgeContent={
          grandTotal > 1 ? (
            <Tooltip2
              content="Running containers across the network. Multi-component apps contribute one per component."
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-header-badge hov-header-badge--hero">
                <CountUp end={grandTotal} />
              </span>
            </Tooltip2>
          ) : null
        }
      />

      <div className="hov-eco-list">
        {cats.map(({ category, totalInstances }) => {
          const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
          const { label, Icon, color } = meta;
          const barPct = (totalInstances / maxVal) * 100;
          const sharePct = ((totalInstances / grandTotal) * 100).toFixed(0);
          const breakdown = runningCategoryTop?.[category];
          const tooltip = <CategoryTooltip category={category} breakdown={breakdown} />;
          const isExpanded = expandedCategory === category;
          const weightClass = ecoWeightClass(totalInstances, maxVal);

          const toggleExpanded = () => setExpandedCategory(isExpanded ? null : category);

          return (
            <div key={category} className="hov-eco-item">
              <div
                className={`hov-eco-row ${weightClass}${isExpanded ? ' hov-eco-row--expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={toggleExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded();
                  }
                }}
              >
                <span className="hov-eco-icon" style={{ color }}>
                  <Icon size={11} />
                </span>
                <Tooltip2
                  content={tooltip}
                  placement="top"
                  hoverOpenDelay={250}
                  transitionDuration={80}
                  popoverClassName="hov-cat-tooltip"
                >
                  <span className="hov-eco-label">{label}</span>
                </Tooltip2>
                <div className="hov-eco-bar-wrap">
                  <div className="hov-eco-bar-fill" style={{ width: `${barPct}%`, background: color }} />
                </div>
                <span className="hov-eco-count">{fmtNum(totalInstances)}</span>
                <span className="hov-eco-pct">{sharePct}%</span>
                <ChevronDown
                  size={12}
                  className={`hov-eco-chevron${isExpanded ? ' hov-eco-chevron--open' : ''}`}
                />
              </div>
              {isExpanded && (
                <div className="hov-eco-expand">
                  <CategoryTooltip category={category} breakdown={breakdown} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

`TopHostedAppsPanel` (currently lines 463-494):

```jsx
function TopHostedAppsPanel({ gstore }) {
  const images = gstore.topRunningImages || [];
  const isLoading = images.length === 0 && gstore.node_count.total > 0;
  const maxCount = images[0]?.nodeCount || 1;

  return (
    <div className="hov-panel hov-panel--top-apps">
      <PanelHeader title="TOP HOSTED APPS" />
      <div className="hov-ranked-list">
        {isLoading ? (
          <div className="hov-panel-center"><Spinner size={20} /></div>
        ) : images.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          images.map(({ image, nodeCount }, i) => (
            <div key={image} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name">{shortImageName(image)}</span>
              <div className="hov-ranked-bar-wrap">
                <div
                  className="hov-ranked-bar-fill"
                  style={{ width: `${(nodeCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Both use a local `PanelHeader` component (stays in `HomeOverview/index.jsx` — it's used by many other panels there too, not moving) and a local `fmtNum` helper (`HomeOverview/index.jsx:25-28`):

```jsx
function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
```

- [ ] **Step 2: Create `AppEcosystemBreakdown`**

Create `client/src/components/AppEcosystemBreakdown/index.jsx`. This is `AppEcosystemPanel` renamed and moved, with its own local `fmtNum` copy (small enough that duplicating it is safer than threading a shared-utils import through — `HomeOverview/index.jsx` keeps its own copy too, used by other panels that aren't moving) and a `PanelHeader` copy (also tiny, `HomeOverview/index.jsx:47-69` — read it and copy it verbatim; it is NOT exported today so it can't be imported):

```jsx
import React, { useState } from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { ChevronDown } from 'lucide-react';
import CountUp from 'components/CountUp';

import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// Copied verbatim from home/HomeOverview/index.jsx (not exported there, and
// used by several other Home-only panels that aren't moving — duplicating
// this small presentational wrapper is simpler and safer than threading a
// shared import through Home's file for one component's sake).
function PanelHeader({ title, badge, badgeClassName, badgeContent, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {badge != null && (
        <span className={`hov-header-badge${badgeClassName ? ' ' + badgeClassName : ''}`}>{badge}</span>
      )}
      {badgeContent}
      {right}
    </div>
  );
}

function ecoWeightClass(totalInstances, maxVal) {
  const ratio = maxVal > 0 ? totalInstances / maxVal : 0;
  if (ratio >= 0.5) return 'hov-eco-row--lg';
  if (ratio >= 0.15) return 'hov-eco-row--md';
  return 'hov-eco-row--sm';
}

export function AppEcosystemBreakdown({ gstore }) {
  const { runningCategoryMap, runningCategoryTop, node_count, runningAppsStatus, runningAppsFetchedAt } = gstore;
  const hasRunning = Object.keys(runningCategoryMap).length > 0;
  const [expandedCategory, setExpandedCategory] = useState(null);

  if (!hasRunning && node_count.total === 0) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--ecosystem">
        <Spinner size={24} />
      </div>
    );
  }

  if (!hasRunning) {
    return (
      <div className="hov-panel hov-panel--ecosystem">
        <PanelHeader title="APP ECOSYSTEM" />
        <div className="hov-empty">
          Running app data is unavailable right now.
          <br />
          Retrying on the next refresh.
        </div>
      </div>
    );
  }

  const allCats = Object.entries(runningCategoryMap)
    .map(([category, totalInstances]) => ({ category, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  const isStale = runningAppsStatus === 'stale';
  const staleSince = runningAppsFetchedAt ? new Date(runningAppsFetchedAt).toLocaleTimeString() : null;

  const cats = allCats.slice(0, 12);
  const grandTotal = allCats.reduce((s, c) => s + c.totalInstances, 0) || 1;
  const maxVal = cats[0]?.totalInstances || 1;

  return (
    <div className="hov-panel hov-panel--ecosystem">
      <PanelHeader
        title="APP ECOSYSTEM"
        right={
          isStale ? (
            <Tooltip2
              content={`Live data is unreachable. Showing the last successful reading${staleSince ? ' from ' + staleSince : ''}.`}
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-eco-stale">stale</span>
            </Tooltip2>
          ) : null
        }
        badgeContent={
          grandTotal > 1 ? (
            <Tooltip2
              content="Running containers across the network. Multi-component apps contribute one per component."
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-header-badge hov-header-badge--hero">
                <CountUp end={grandTotal} />
              </span>
            </Tooltip2>
          ) : null
        }
      />

      <div className="hov-eco-list">
        {cats.map(({ category, totalInstances }) => {
          const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
          const { label, Icon, color } = meta;
          const barPct = (totalInstances / maxVal) * 100;
          const sharePct = ((totalInstances / grandTotal) * 100).toFixed(0);
          const breakdown = runningCategoryTop?.[category];
          const tooltip = <CategoryTooltip category={category} breakdown={breakdown} />;
          const isExpanded = expandedCategory === category;
          const weightClass = ecoWeightClass(totalInstances, maxVal);

          const toggleExpanded = () => setExpandedCategory(isExpanded ? null : category);

          return (
            <div key={category} className="hov-eco-item">
              <div
                className={`hov-eco-row ${weightClass}${isExpanded ? ' hov-eco-row--expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={toggleExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded();
                  }
                }}
              >
                <span className="hov-eco-icon" style={{ color }}>
                  <Icon size={11} />
                </span>
                <Tooltip2
                  content={tooltip}
                  placement="top"
                  hoverOpenDelay={250}
                  transitionDuration={80}
                  popoverClassName="hov-cat-tooltip"
                >
                  <span className="hov-eco-label">{label}</span>
                </Tooltip2>
                <div className="hov-eco-bar-wrap">
                  <div className="hov-eco-bar-fill" style={{ width: `${barPct}%`, background: color }} />
                </div>
                <span className="hov-eco-count">{fmtNum(totalInstances)}</span>
                <span className="hov-eco-pct">{sharePct}%</span>
                <ChevronDown
                  size={12}
                  className={`hov-eco-chevron${isExpanded ? ' hov-eco-chevron--open' : ''}`}
                />
              </div>
              {isExpanded && (
                <div className="hov-eco-expand">
                  <CategoryTooltip category={category} breakdown={breakdown} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Move this component's CSS**

Read `client/src/home/HomeOverview/index.scss` in full. Find the `.hov-panel` base block (currently ~lines 55-90 — confirm exact lines when reading) and every class this component's JSX references: `.hov-panel--ecosystem` (part of the shared modifier list), `.hov-eco-*` (all of them: `-list`, `-item`, `-row`, `-row--lg/md/sm/expanded`, `-icon`, `-label`, `-bar-wrap`, `-bar-fill`, `-count`, `-pct`, `-chevron`, `-chevron--open`, `-expand`, `-stale`), `.hov-header*`, `.hov-empty`, `.hov-panel-center`, `.hov-cat-tooltip` (a popover className, styled globally or per-panel — check where it's defined). Copy the base `.hov-panel` rule plus every `.hov-eco-*`/`.hov-header*`/`.hov-empty`/`.hov-panel-center` rule this component needs into `client/src/components/AppEcosystemBreakdown/index.scss`. **Do not delete anything from `HomeOverview/index.scss` yet** — Step 5 handles that, after Home's own render is verified against the new component.

- [ ] **Step 4: Create `TopHostedApps`**

Create `client/src/components/TopHostedApps/index.jsx`:

```jsx
import React from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { shortImageName } from 'utils';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// Copied verbatim from home/HomeOverview/index.jsx — see the note in
// AppEcosystemBreakdown/index.jsx for why this is duplicated rather than
// imported.
function PanelHeader({ title, badge, badgeClassName, badgeContent, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {badge != null && (
        <span className={`hov-header-badge${badgeClassName ? ' ' + badgeClassName : ''}`}>{badge}</span>
      )}
      {badgeContent}
      {right}
    </div>
  );
}

export function TopHostedApps({ gstore }) {
  const images = gstore.topRunningImages || [];
  const isLoading = images.length === 0 && gstore.node_count.total > 0;
  const maxCount = images[0]?.nodeCount || 1;

  return (
    <div className="hov-panel hov-panel--top-apps">
      <PanelHeader title="TOP HOSTED APPS" />
      <div className="hov-ranked-list">
        {isLoading ? (
          <div className="hov-panel-center"><Spinner size={20} /></div>
        ) : images.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          images.map(({ image, nodeCount }, i) => (
            <div key={image} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name">{shortImageName(image)}</span>
              <div className="hov-ranked-bar-wrap">
                <div
                  className="hov-ranked-bar-fill"
                  style={{ width: `${(nodeCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Move `.hov-panel--top-apps` and every `.hov-ranked-*`/`.hov-rank`/`.hov-rank--gold/silver/bronze`/`.hov-badge` rule from `HomeOverview/index.scss` into `client/src/components/TopHostedApps/index.scss` (same "copy first, delete later" approach as Step 3 — plus the shared `.hov-panel` base rule again, duplicated here too since this file needs it independently of `AppEcosystemBreakdown`'s copy).

- [ ] **Step 5: Wire `HomeOverview/index.jsx` to the new components, remove the old code**

In `client/src/home/HomeOverview/index.jsx`:
1. Add imports: `import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';` and `import { TopHostedApps } from 'components/TopHostedApps';`
2. Delete the `ecoWeightClass` function, the `AppEcosystemPanel` function, and the `TopHostedAppsPanel` function entirely from this file.
3. Find the two render call sites (around where `<AppEcosystemPanel gstore={gstore} />` and `<TopHostedAppsPanel gstore={gstore} />` currently appear — reported at lines ~852 and ~855, confirm exact location when reading) and change them to `<AppEcosystemBreakdown gstore={gstore} />` and `<TopHostedApps gstore={gstore} />` respectively. Nothing else in this file changes — same `gstore` prop, same position in the JSX tree.
4. Check whether `Spinner`, `Tooltip2`, `ChevronDown`, `CountUp`, `APP_CATEGORY_META`, `CategoryTooltip` are still used elsewhere in `HomeOverview/index.jsx` by other panels that are NOT moving (very likely yes, given how many panels this file has) — if any of those imports become genuinely unused after deleting the two panels, remove the now-unused import; if still used elsewhere, leave it.

In `client/src/home/HomeOverview/index.scss`: now delete the `.hov-eco-*`, `.hov-panel--ecosystem`, `.hov-ranked-*`, `.hov-rank`/`.hov-rank--*`, `.hov-badge`, `.hov-panel--top-apps` rules you copied out in Steps 3 and 4 — **but only if no other panel in this file still uses them**. Grep the rest of `HomeOverview/index.jsx` for these class names first (e.g. does `TopDogsPanel` or anything else also render a `.hov-badge`?) — if a class name is shared with a panel that's staying, leave that rule in place and note it in your report rather than guessing. The base `.hov-panel` rule and `.hov-header*`/`.hov-empty`/`.hov-panel-center` rules **must stay** in `HomeOverview/index.scss` regardless — every other panel in this file depends on them; you only duplicated copies into the new components, you did not move the originals.

- [ ] **Step 6: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, same 239 total (this task adds no new tests — pure extraction).

- [ ] **Step 7: Build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the 4 baseline warning files, nothing new (in particular, no new unused-import or unused-variable warnings from Step 5's cleanup).

- [ ] **Step 8: Manual visual regression check — the critical one for this task**

Run `cd client && yarn start`, navigate to `/home` with a real wallet (or `/demo`), and confirm:
- The App Ecosystem panel renders identically to before: same categories, same counts, same bar widths, same "stale" indicator behavior if applicable, clicking a category still expands/collapses it with the same tooltip content.
- The Top Hosted Apps panel renders identically: same ranked list, same gold/silver/bronze styling on the top 3, same bar widths.
- No visual difference anywhere else on the page (confirms the SCSS split in Steps 3-5 didn't accidentally drop or duplicate-conflict any shared class).
- Open the browser console — no new errors or warnings.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/AppEcosystemBreakdown client/src/components/TopHostedApps client/src/home/HomeOverview
git commit -m "refactor: extract App Ecosystem and Top Hosted Apps to shared components"
```

---

## Task 2: Analytics page shell — route, nav entry, tab scaffold

**Files:**
- Create: `client/src/analytics/Analytics.jsx`
- Create: `client/src/analytics/Analytics.scss`
- Modify: `client/src/Application.jsx`
- Modify: `client/src/components/Navbar/index.jsx`

**Interfaces:**
- Consumes: `PremiumGate` (`donor/PremiumGate`), `useDonorStatus` (`contexts/DonorContext`) — both from Session 1, unchanged. `AppsTab` from Task 6 (this task can stub it — see Step 1 note — Task 6 fills in the real component; do not block this task on Task 6 existing yet).
- Produces: route `/analytics`, a `Navbar` "Analytics" button matching the existing "Live" button's exact behavior.

- [ ] **Step 1: Create a placeholder `AppsTab` so this task isn't blocked on Task 6**

Create `client/src/analytics/AppsTab/index.jsx` with a minimal placeholder (Task 6 replaces this file's contents — this step only unblocks Task 2 so both can be reviewed independently):

```jsx
export function AppsTab() {
  return <div>Apps tab — under construction</div>;
}
```

- [ ] **Step 2: Create the Analytics page shell**

Create `client/src/analytics/Analytics.jsx`:

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

`renderActiveTabPanelOnly` keeps inactive tabs' data-fetching components unmounted rather than just visually hidden — relevant once a second tab exists, harmless with only one.

Create `client/src/analytics/Analytics.scss` — a minimal page-frame style matching `/live`'s own header treatment (read `client/src/live/Live.scss`'s `.live-page-header`/`.live-page-title`/`.live-page-subtitle` rules first and mirror that structure under an `.analytics-` prefix, reusing the same `--text-primary`/`--text-tertiary` tokens):

```scss
.analytics-page {
  padding: 20px;
}

.analytics-page-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 20px;
}

.analytics-page-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
}

.analytics-page-subtitle {
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.analytics-tabs .bp4-tab-list {
  margin-bottom: 16px;
}
```

- [ ] **Step 3: Add the route**

Read `client/src/Application.jsx` in full first. Add the lazy import alongside the existing ones:

```js
const Analytics = React.lazy(() => import('analytics/Analytics'));
```

Add the route, mirroring `/live`'s exact wrapper structure:

```jsx
<Route
  path='/analytics'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <PremiumGate feature='Analytics'>
          <Analytics />
        </PremiumGate>
      </React.Suspense>
    </ErrorBoundary>
  }
/>
```

Place it directly after the existing `/live` route, before the catch-all `*` route.

- [ ] **Step 4: Add the Navbar entry**

Read `client/src/components/Navbar/index.jsx` in full first (confirm it matches the current Live-button shape below before editing). Add, directly after the existing Live button block:

```jsx
let analyticsBtnProps = useMatch('/analytics') == null ? inActiveProps : activeProps;
```

(alongside the existing `liveBtnProps` line). Then add the button itself, right after the closing `</Tooltip2>` of the Live button:

```jsx
<Tooltip2 content={premiumUnlocked ? 'Network-wide stats' : 'Premium feature — unlock by donating FLUX'}>
  <Button
    className={'margin-r-s' + (premiumUnlocked ? '' : ' navbar-btn--locked')}
    icon={premiumUnlocked ? 'chart' : undefined}
    rightIcon={premiumUnlocked ? undefined : <Lock size={13} />}
    text='Analytics'
    {...analyticsBtnProps}
    onClick={() => navigate('/analytics')}
  />
</Tooltip2>
```

`premiumUnlocked` is already in scope from the existing `const { isUnlocked: premiumUnlocked } = useDonorStatus();` line — reuse it, don't call the hook twice. `Lock` is already imported from `lucide-react` for the Live button. `'chart'` is a built-in Blueprint icon name (same icon-name-as-string pattern the other Navbar buttons already use, e.g. `icon='home'`, `icon='layout-auto'`) — no new import needed.

- [ ] **Step 5: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, same count as after Task 1 (no new tests in this task).

- [ ] **Step 6: Build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 7: Manual check**

`yarn start`, navigate to `/analytics` directly:
- Without a donor wallet / `PREMIUM_TESTING_MODE` unset: locked explainer renders (same as `/live`'s locked state), Navbar's "Analytics" button is greyed out with the lock icon and tooltip.
- With `PREMIUM_TESTING_MODE=true` (set in `client/public/runtime/app-content.js` for this local check): the page renders with the "Apps" tab showing the placeholder text, Navbar's "Analytics" button is active/unlocked-styled.
- Click the "Analytics" nav button from another page — confirm navigation works and active-route styling applies.

- [ ] **Step 8: Commit**

```bash
git add client/src/analytics client/src/Application.jsx client/src/components/Navbar/index.jsx
git commit -m "feat(analytics): add the /analytics page shell, tab scaffold, and nav entry"
```

---

## Task 3: `topOwners.js` — node-operator ranking (supply side)

**Files:**
- Create: `client/src/analytics/topOwners.js`
- Test: `client/src/analytics/topOwners.test.js`

**Interfaces:**
- Produces: `rankNodeOperators(nodes, topN = 20)` — pure, `nodes: Array<{payment_address}>` → `Array<{address, nodeCount}>` sorted descending. `fetch_top_node_operators(topN = 20): Promise<Array<{address, nodeCount}>>` — fetch/parse layer. Consumed by Task 6's `AppsTab`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/analytics/topOwners.test.js`:

```js
import { rankNodeOperators } from './topOwners';

describe('rankNodeOperators', () => {
  it('counts nodes per payment_address and sorts descending', () => {
    const nodes = [
      { payment_address: 'addrA' },
      { payment_address: 'addrB' },
      { payment_address: 'addrA' },
      { payment_address: 'addrA' },
    ];
    const result = rankNodeOperators(nodes);
    expect(result).toEqual([
      { address: 'addrA', nodeCount: 3 },
      { address: 'addrB', nodeCount: 1 },
    ]);
  });

  it('skips nodes with no payment_address rather than throwing', () => {
    const nodes = [{ payment_address: 'addrA' }, {}, { payment_address: null }];
    expect(() => rankNodeOperators(nodes)).not.toThrow();
    expect(rankNodeOperators(nodes)).toEqual([{ address: 'addrA', nodeCount: 1 }]);
  });

  it('returns an empty array for no nodes', () => {
    expect(rankNodeOperators([])).toEqual([]);
    expect(rankNodeOperators(undefined)).toEqual([]);
  });

  it('respects the topN cap', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ payment_address: `addr${i}` }));
    expect(rankNodeOperators(nodes, 5)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/topOwners.test.js --watchAll=false`
Expected: FAIL — `topOwners.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `client/src/analytics/topOwners.js`:

```js
const NODE_LIST_URL = 'https://explorer.runonflux.io/api/status?q=getFluxNodes';
const DEFAULT_TOP_N = 20;

/*
 * Pure: network-wide node-operator concentration, NOT the per-country max
 * apidata.js's countryDominance computes — this counts every node an
 * address controls anywhere on the network. No existing function returns
 * this shape (countryDominance discards the winning address entirely and
 * only keeps the per-country max count), so this is a new aggregation over
 * the same raw node list that function and others already fetch.
 */
export function rankNodeOperators(nodes, topN = DEFAULT_TOP_N) {
  const counts = {};
  for (const node of nodes || []) {
    const addr = node?.payment_address;
    if (!addr) continue;
    counts[addr] = (counts[addr] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([address, nodeCount]) => ({ address, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount)
    .slice(0, topN);
}

export async function fetch_top_node_operators(topN = DEFAULT_TOP_N) {
  try {
    const res = await fetch(NODE_LIST_URL);
    const data = await res.json();
    const nodes = Array.isArray(data?.fluxNodes) ? data.fluxNodes : [];
    return rankNodeOperators(nodes, topN);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/topOwners.test.js --watchAll=false`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/analytics/topOwners.js client/src/analytics/topOwners.test.js
git commit -m "feat(analytics): add rankNodeOperators — network-wide node-operator concentration"
```

---

## Task 4: `topOwners.js` — app-owner ranking (demand side)

**Files:**
- Modify: `client/src/analytics/topOwners.js`
- Modify: `client/src/analytics/topOwners.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (extends the same file as Task 3, doesn't call anything Task 3 defined).
- Produces: `aggregateOwnerTotals(specs)` — pure, `specs: Array<{owner, instances}>` (the shape of `fetch_global_app_specs(gstore).rawSpecs`) → `{ owners: Array<{owner, totalInstances}> (full, unsliced, sorted descending), networkTotalInstances: number }`. Consumed by Task 5 (`teamSponsored.js`) and Task 6 (`AppsTab`, which slices `owners` to a display-sized top N itself).

- [ ] **Step 1: Write the failing tests**

Append to `client/src/analytics/topOwners.test.js`:

```js
describe('aggregateOwnerTotals', () => {
  it('sums instances per owner, sorts descending, and returns the network total', () => {
    const specs = [
      { owner: 'ownerA', instances: 3 },
      { owner: 'ownerB', instances: 1 },
      { owner: 'ownerA', instances: 2 },
    ];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([
      { owner: 'ownerA', totalInstances: 5 },
      { owner: 'ownerB', totalInstances: 1 },
    ]);
    expect(networkTotalInstances).toBe(6);
  });

  it('treats a missing instances field as 1, matching the rest of this codebase\'s convention', () => {
    const specs = [{ owner: 'ownerA' }, { owner: 'ownerA' }];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([{ owner: 'ownerA', totalInstances: 2 }]);
    expect(networkTotalInstances).toBe(2);
  });

  it('still counts a spec with no owner toward the network total, just not toward any owner row', () => {
    const specs = [{ owner: 'ownerA', instances: 2 }, { instances: 5 }];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([{ owner: 'ownerA', totalInstances: 2 }]);
    expect(networkTotalInstances).toBe(7);
  });

  it('returns an empty result for no specs', () => {
    expect(aggregateOwnerTotals([])).toEqual({ owners: [], networkTotalInstances: 0 });
    expect(aggregateOwnerTotals(undefined)).toEqual({ owners: [], networkTotalInstances: 0 });
  });

  it('does not slice — callers get every owner, not just a top N', () => {
    const specs = Array.from({ length: 30 }, (_, i) => ({ owner: `owner${i}`, instances: 1 }));
    expect(aggregateOwnerTotals(specs).owners).toHaveLength(30);
  });
});
```

Update the import line at the top of the file to include the new function:

```js
import { rankNodeOperators, aggregateOwnerTotals } from './topOwners';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/topOwners.test.js --watchAll=false`
Expected: FAIL — `aggregateOwnerTotals` isn't exported yet (the existing `rankNodeOperators` tests from Task 3 should still pass).

- [ ] **Step 3: Add the implementation**

Append to `client/src/analytics/topOwners.js`:

```js
/*
 * Pure: per-owner instance totals across the WHOLE network, unsliced. Deliberately
 * not truncated to a top N here — teamSponsored.js needs the true network total
 * and the team's real total even if the team isn't in whatever slice a caller
 * displays (it should be, given ~51% share, but don't build in a truncation bug
 * for a hypothetical future where it's smaller). Callers slice for display.
 */
export function aggregateOwnerTotals(specs) {
  const perOwner = {};
  let networkTotalInstances = 0;

  for (const spec of specs || []) {
    const instances = spec?.instances || 1;
    networkTotalInstances += instances;

    const owner = spec?.owner;
    if (!owner) continue;
    perOwner[owner] = (perOwner[owner] || 0) + instances;
  }

  const owners = Object.entries(perOwner)
    .map(([owner, totalInstances]) => ({ owner, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  return { owners, networkTotalInstances };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/topOwners.test.js --watchAll=false`
Expected: PASS, all 9 tests (4 from Task 3 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add client/src/analytics/topOwners.js client/src/analytics/topOwners.test.js
git commit -m "feat(analytics): add aggregateOwnerTotals — network-wide app-owner instance totals"
```

---

## Task 5: `teamSponsored.js` — Flux-team share of network instances

**Files:**
- Create: `client/src/analytics/teamSponsored.js`
- Test: `client/src/analytics/teamSponsored.test.js`

**Interfaces:**
- Consumes: the `{owner, totalInstances}` shape Task 4's `aggregateOwnerTotals` produces (does not call that function itself — takes its output as a parameter, keeping this module independently testable).
- Produces: `FLUX_TEAM_OWNER_ZELIDS` (array, named export), `computeTeamSponsoredShare(owners, networkTotalInstances)` → `{ teamInstances: number, sharePct: number }`. Consumed by Task 6's `AppsTab`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/analytics/teamSponsored.test.js`:

```js
import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from './teamSponsored';

describe('FLUX_TEAM_OWNER_ZELIDS', () => {
  it('includes the known Flux team app-owner ZelID', () => {
    expect(FLUX_TEAM_OWNER_ZELIDS).toContain('196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH');
  });
});

describe('computeTeamSponsoredShare', () => {
  it('computes the team\'s share of network instances', () => {
    const owners = [
      { owner: '196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH', totalInstances: 51 },
      { owner: 'someoneElse', totalInstances: 49 },
    ];
    const result = computeTeamSponsoredShare(owners, 100);
    expect(result).toEqual({ teamInstances: 51, sharePct: 51 });
  });

  it('sums multiple team-owned entries if more than one ZelID is ever in the list', () => {
    const owners = [
      { owner: '196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH', totalInstances: 30 },
      { owner: 'someoneElse', totalInstances: 70 },
    ];
    const result = computeTeamSponsoredShare(owners, 100);
    expect(result.teamInstances).toBe(30);
    expect(result.sharePct).toBe(30);
  });

  it('returns zero share when the team owns nothing in the given list', () => {
    const owners = [{ owner: 'someoneElse', totalInstances: 100 }];
    expect(computeTeamSponsoredShare(owners, 100)).toEqual({ teamInstances: 0, sharePct: 0 });
  });

  it('does not divide by zero when the network total is zero', () => {
    expect(computeTeamSponsoredShare([], 0)).toEqual({ teamInstances: 0, sharePct: 0 });
  });

  it('handles a missing/undefined owners list gracefully', () => {
    expect(() => computeTeamSponsoredShare(undefined, 100)).not.toThrow();
    expect(computeTeamSponsoredShare(undefined, 100)).toEqual({ teamInstances: 0, sharePct: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/analytics/teamSponsored.test.js --watchAll=false`
Expected: FAIL — `teamSponsored.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `client/src/analytics/teamSponsored.js`:

```js
/*
 * The Flux team's own app-owner ZelID — confirmed via project research:
 * owns ~51% of network app instances (FoldingAtHome and other official
 * apps), per fluxinfo.js's imageCounts aggregation cross-referenced against
 * this owner value on 2026-08-26. This is a single hardcoded address to
 * keep maintained, not a discovered list — if the team ever deploys under
 * an additional ZelID, add it here. Do NOT confuse this with Girder
 * Works/Beldex (164ubcHD6ERRkhg22qsSrvu7fHjdryJWUs) — that is the largest
 * THIRD-PARTY operator on the network, not the Flux team.
 */
export const FLUX_TEAM_OWNER_ZELIDS = ['196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH'];

// Pure — takes the FULL (unsliced) owner totals from topOwners.js's
// aggregateOwnerTotals, not a display-truncated top N, so the team's true
// share is never understated by falling outside some arbitrary cutoff.
export function computeTeamSponsoredShare(owners, networkTotalInstances) {
  if (!networkTotalInstances) return { teamInstances: 0, sharePct: 0 };

  const teamInstances = (owners || [])
    .filter((o) => FLUX_TEAM_OWNER_ZELIDS.includes(o.owner))
    .reduce((sum, o) => sum + o.totalInstances, 0);

  const sharePct = (teamInstances / networkTotalInstances) * 100;
  return { teamInstances, sharePct };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/analytics/teamSponsored.test.js --watchAll=false`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, total is 239 (baseline) + 4 (Task 3) + 5 (Task 4) + 6 (Task 5) = 254.

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/teamSponsored.js client/src/analytics/teamSponsored.test.js
git commit -m "feat(analytics): add computeTeamSponsoredShare and the team's known ZelID"
```

---

## Task 6: `AppsTab` — assemble the tab's real content

**Files:**
- Modify: `client/src/analytics/AppsTab/index.jsx` (replacing Task 2's placeholder)
- Create: `client/src/analytics/AppsTab/index.scss`

**Interfaces:**
- Consumes: `AppEcosystemBreakdown`, `TopHostedApps` (Task 1); `rankNodeOperators`, `fetch_top_node_operators`, `aggregateOwnerTotals` (Tasks 3-4); `FLUX_TEAM_OWNER_ZELIDS`, `computeTeamSponsoredShare` (Task 5); `fetch_global_app_specs`, `fetch_global_stats`, `fetch_total_network_utils` from `apidata` (existing, same functions `home/Home.jsx` already calls to build its own `gstore` — read `client/src/home/Home.jsx`'s data-loading method first to copy the exact call sequence/shape it uses to build a `gstore` object, since `AppEcosystemBreakdown`/`TopHostedApps` both require a `gstore` prop shaped the way Home already builds one).
- Produces: `AppsTab()` — no props, self-contained data fetching. This is the file Task 2's route mounts; no other task depends on this one's exports.

- [ ] **Step 1: Confirm `Home.jsx`'s no-wallet `gstore`-building sequence**

Read `client/src/home/Home.jsx:222-258` (`hydrateApp()`) to confirm it still matches this exactly (it's what the plan below is built against): the `else` branch (no `?wallet=` param — the network-wide case, exactly analogous to `AppsTab`, which has no wallet concept of its own) does:

```js
fetch_global_stats(null)
  .then((gstore) => {
    this.setState({ gstore });
    // ...(Home also kicks off appSpecs/countryCounts/rankings/gpuPrices here in
    // parallel for OTHER panels HomeOverview renders — AppEcosystemBreakdown and
    // TopHostedApps don't read any of those, only `gstore` itself, so AppsTab
    // doesn't need to fetch them)
    return fetch_total_network_utils(gstore);
  })
  .then((gstore) => {
    this.setState({ gstore });
  });
```

`AppEcosystemBreakdown` only destructures `runningCategoryMap`, `runningCategoryTop`, `node_count`, `runningAppsStatus`, `runningAppsFetchedAt` from `gstore`; `TopHostedApps` only reads `gstore.topRunningImages` and `gstore.node_count` — both come from this exact two-call sequence, not from `fetch_global_app_specs`/`fetch_country_node_counts`/etc. If the current file has diverged from this, stop and report rather than guessing.

- [ ] **Step 2: Write `AppsTab`**

Replace `client/src/analytics/AppsTab/index.jsx`'s placeholder with the real component:

```jsx
import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_global_app_specs, fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';
import { TopHostedApps } from 'components/TopHostedApps';
import { rankNodeOperators, fetch_top_node_operators, aggregateOwnerTotals } from 'analytics/topOwners';
import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from 'analytics/teamSponsored';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

function RankedAddressList({ title, rows, valueLabel, teamZelids = [] }) {
  const maxVal = rows[0]?.value || 1;
  return (
    <div className="hov-panel apps-tab-ranked-panel">
      <div className="hov-header">
        <span className="hov-header-title">{title}</span>
      </div>
      <div className="hov-ranked-list">
        {rows.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          rows.map(({ key, value }, i) => (
            <div key={key} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name" title={key}>
                {truncateAddr(key)}
                {teamZelids.includes(key) && <span className="apps-tab-team-flag">Flux team</span>}
              </span>
              <div className="hov-ranked-bar-wrap">
                <div className="hov-ranked-bar-fill" style={{ width: `${(value / maxVal) * 100}%` }} />
              </div>
              <span className="hov-badge">{fmtNum(value)} {valueLabel}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AppsTab() {
  const [gstore, setGstore] = useState(null);
  const [nodeOperators, setNodeOperators] = useState([]);
  const [ownerTotals, setOwnerTotals] = useState({ owners: [], networkTotalInstances: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Same two-call sequence Home.jsx's hydrateApp() uses for its
      // no-wallet (network-wide) case — see Step 1's note on why
      // AppsTab doesn't need any of Home's other parallel fetches.
      const stage1 = await fetch_global_stats(null);
      if (cancelled) return;
      const builtGstore = await fetch_total_network_utils(stage1);
      if (cancelled) return;
      setGstore(builtGstore);

      const [operators, specsResult] = await Promise.all([
        fetch_top_node_operators(),
        fetch_global_app_specs(builtGstore),
      ]);
      if (cancelled) return;

      setNodeOperators(operators);
      setOwnerTotals(aggregateOwnerTotals(specsResult.rawSpecs));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading || !gstore) {
    return (
      <div className="apps-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const { owners, networkTotalInstances } = ownerTotals;
  const { sharePct } = computeTeamSponsoredShare(owners, networkTotalInstances);

  const nodeOperatorRows = nodeOperators.map((o) => ({ key: o.address, value: o.nodeCount }));
  const ownerRows = owners.slice(0, 20).map((o) => ({ key: o.owner, value: o.totalInstances }));

  return (
    <div className="apps-tab">
      <div className="apps-tab-stat-row">
        <div className="hov-panel apps-tab-stat-card">
          <span className="hov-header-title">FLUX-TEAM-SPONSORED</span>
          <span className="apps-tab-stat-value">{sharePct.toFixed(1)}%</span>
          <span className="apps-tab-stat-caption">of network app instances run under the Flux team's own owner ID</span>
        </div>
      </div>

      <div className="apps-tab-panel-grid">
        <AppEcosystemBreakdown gstore={gstore} />
        <TopHostedApps gstore={gstore} />
        <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        <RankedAddressList
          title="TOP APP OWNERS"
          rows={ownerRows}
          valueLabel="instances"
          teamZelids={FLUX_TEAM_OWNER_ZELIDS}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `AppsTab`'s stylesheet**

Create `client/src/analytics/AppsTab/index.scss`. Reuses the `.hov-panel`/`.hov-header`/`.hov-ranked-*`/`.hov-badge`/`.hov-empty` classes that Task 1's `TopHostedApps` component already defines and imports (its `import './index.scss'` runs as a side effect whenever `TopHostedApps` is rendered on this page, which `AppsTab` always does — so those classes are present without this file redefining them; this mirrors how `AppEcosystemPanel` and `TopHostedAppsPanel` already share `.hov-panel`/`.hov-header` today without either file being "the" owner of those rules). Add only what's new here:

```scss
.apps-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.apps-tab-stat-row {
  display: flex;
}

.apps-tab-stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
}

.apps-tab-stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.apps-tab-stat-caption {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

.apps-tab-panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}

.apps-tab-ranked-panel {
  min-width: 0;
}

.apps-tab-team-flag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #2b61d1;
  background: rgba(43, 97, 209, 0.12);
}
```

- [ ] **Step 4: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, same 254 total as after Task 5 (this task adds no new automated tests — it's a data-assembling component; its correctness is verified manually below, matching how `Live.jsx` and other top-level page components in this codebase aren't unit-tested either).

- [ ] **Step 5: Build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 6: Manual check**

`yarn start`, with `PREMIUM_TESTING_MODE=true`, navigate to `/analytics`:
- The Apps tab shows: the Flux-team-sponsored percentage (a plausible number, roughly in the 30-60% range given prior project research put it near 51%), the migrated App Ecosystem and Top Hosted Apps panels (rendering real data, matching what `/home` shows for the same panels), a "Top Node Operators" ranked list with real addresses and node counts, and a "Top App Owners" ranked list with real addresses and instance counts, with the Flux team's row visibly flagged.
- Open the console — no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/analytics/AppsTab
git commit -m "feat(analytics): build the Apps tab — ecosystem/top-apps panels, owner rankings, team share"
```

---

## Final milestone: full regression pass

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, 254 total (239 baseline + 15 new across Tasks 3-5).

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the 4 baseline warning files.

- [ ] **Step 3: Full manual walkthrough, fresh**

- `/home` (or `/demo`) — App Ecosystem and Top Hosted Apps panels identical to before this plan started; rest of the page unaffected.
- `/nodes` — unaffected (this plan never touches `MainApp.jsx`).
- `/live` — still works as it did after Session 1 (this plan doesn't touch it, but confirm the shared `PremiumGate`/`DonorContext` machinery wasn't disturbed by adding a second consumer route).
- `/analytics` locked (no donor wallet, no testing flag) — locked explainer + greyed nav button.
- `/analytics` unlocked (`PREMIUM_TESTING_MODE=true` or a real donor wallet) — Apps tab renders fully with real data, as checked in Task 6.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin <branch-name>
gh pr create --base main --title "Analytics page: shell + Apps tab (Session 2)" --body "..."
```

Note in the PR body which manual checks were run and their outcomes, following this repo's established convention (see PR #170's body for the format).
