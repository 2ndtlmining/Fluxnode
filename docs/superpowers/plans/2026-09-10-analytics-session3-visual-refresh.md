# Analytics Rework — Session 3 (Visual Refresh: Apps + Network) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Apps and Network tabs a real "premium feel" pass —
consistent per-tab accent color (drawn from tokens already in
`_global.scss`, not new ones), a headline hero stat per tab, and a
blurred/ghosted-real-data locked-panel treatment replacing today's flat
lock-message — without touching any data-fetching or ranking logic.

**Architecture:** Pure presentation layer. `PanelGate` gains one new
opt-in prop (`preview="blur"`, default `'plain'` so every other caller —
`/live`'s `PremiumGate`, the Donor and Chain Activity tabs — is
byte-for-byte unaffected) that renders the real, already-fetched children
underneath a CSS blur instead of hiding them. Both tabs' own SCSS gets a
small, targeted set of edits: replace two ad hoc hex colors with existing
design tokens, add one new headline-stat block per tab built on a pattern
(`.hov-header-badge--hero`) that already exists and already ships
correctly in both light and dark mode.

**Tech Stack:** React 18 (function components only), SCSS with this
repo's existing `rule-mode-dark()` mixin and CSS custom-property token
system — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-analytics-rework-design.md`
(Part D, scoped to the Apps and Network tabs only — Donor/Chain Activity's
visual pass plus Recharts is Session 4).

## Global Constraints

- **No new design tokens.** `client/src/styles/_global.scss` already
  defines `--accent-blue: #3b82f6`, `--accent-indigo: #6366f1`,
  `--accent-purple: #8b5cf6`, `--accent-green: #0ea271`,
  `--accent-amber: #e09205`, `--accent-red: #dc3a3a` — Apps tab uses
  `--accent-blue`, Network tab uses `--accent-purple`. Nothing else.
- **`PanelGate`'s default behavior must not change for any existing
  caller.** `Analytics.jsx` already uses `PanelGate` for the Donor tab
  (`panelKey="donorTab"`) and Chain Activity tab (`panelKey="chainActivity"`)
  — neither passes a `preview` prop today and neither should render any
  differently after this session. The new prop must default to `'plain'`,
  reproducing exactly today's `panel-gate-locked` markup.
- **Do not touch `panelAccess.js`.** No panel's `'public'`/`'donor'` value
  changes in this session.
- **Do not touch the 0.68rem uppercase micro-label header convention**
  (`.hov-header-title`) used throughout this app. Out of scope — it's a
  live, shipped convention on every page, not something this session's
  two-tab pass should diverge from.
- **`TopDogsPanel`'s amber/gold styling and `.apps-tab-team-flag`'s blue
  are intentionally untouched** — both are the panel's/element's own
  semantic color (achievement gold, "Flux team" identity), not "this
  tab's domain color." Don't recolor either to `--accent-purple`/
  `--accent-blue`.
- **Baseline before starting:** run
  `cd client && CI=true npx react-scripts test --watchAll=false` on
  `origin/main` and confirm the pass count (438 as of this plan being
  written — re-confirm, more may have merged).
- **`client/public/runtime/app-content.js`'s `TESTING` flag**: flip to
  `true` for local manual QA, **always revert to `false` before
  committing** — confirm `git status` clean before every commit.
- **Worktree convention:** `worktrees/analytics-session3` via plain `git
  worktree add` off `origin/main` — **not** the harness's native
  `EnterWorktree` tool (breaks CRA/Jest's `testMatch` glob resolution).

---

### Task 1: `PanelGate` — opt-in blurred-preview locked state

**Files:**
- Modify: `client/src/analytics/PanelGate/index.jsx`
- Modify: `client/src/analytics/PanelGate/index.scss`

**Interfaces:**
- Consumes: `useDonorStatus` (existing), `getPanelAccess` (existing),
  `PremiumUnlock` (existing).
- Produces: `<PanelGate panelKey="..." feature="..." preview="plain"|"blur">`
  — `preview` is optional, defaults to `'plain'`. Tasks 2 and 3 pass
  `preview="blur"` on every currently-`'donor'` panel in `AppsTab`/
  `NetworkTab`.

- [ ] **Step 1: Replace `PanelGate/index.jsx` with this exact content**

```jsx
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import { getPanelAccess } from 'analytics/panelAccess';
import './index.scss';

/*
 * Per-panel sibling to donor/PremiumGate (which gates a whole route).
 *
 * `preview` controls the locked-state treatment:
 * - 'plain' (default): the original flat lock-message card. This is what
 *   every caller gets unless it opts in — /live's PremiumGate-equivalent
 *   route gate and the Donor/Chain Activity tabs (Analytics.jsx) never
 *   pass this prop and must keep rendering exactly as before.
 * - 'blur': the real children still render (mount, fetch, etc. — nothing
 *   about data-fetching changes based on lock state, per Session 1's
 *   design), but visually blurred/dimmed underneath a lock overlay. Used
 *   by AppsTab/NetworkTab (Session 3) to preview real data shapes behind
 *   the wall instead of hiding them entirely.
 */
export function PanelGate({ panelKey, feature, children, preview = 'plain' }) {
  const { isUnlocked } = useDonorStatus();

  if (getPanelAccess(panelKey, isUnlocked)) return children;

  if (preview === 'blur') {
    return (
      <div className="panel-gate-blurred">
        <div className="panel-gate-blurred-content" aria-hidden="true">
          {children}
        </div>
        <div className="panel-gate-blurred-overlay">
          <div className="panel-gate-blurred-scrim" />
          <div className="panel-gate-blurred-card">
            <Lock size={20} className="panel-gate-locked-icon" />
            <span className="panel-gate-locked-title">{feature} is a premium feature</span>
            <PremiumUnlock />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-gate-locked">
      <Lock size={20} className="panel-gate-locked-icon" />
      <span className="panel-gate-locked-title">{feature} is a premium feature</span>
      <PremiumUnlock />
    </div>
  );
}
```

- [ ] **Step 2: Append this exact block to `PanelGate/index.scss`** (the
  existing `.panel-gate-locked`/`.panel-gate-locked-icon`/
  `.panel-gate-locked-title` rules stay untouched — `.panel-gate-locked-icon`
  and `.panel-gate-locked-title` are reused by the new blurred card below,
  don't duplicate them):

```scss

// ── Blurred-preview locked state (preview="blur") ────────────────────────
// Real content renders underneath, blurred and non-interactive; the lock
// card overlays it on its own semi-opaque scrim (a separate layer, so the
// scrim's opacity doesn't also fade the card's own text/icon/form).

.panel-gate-blurred {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  min-height: 160px;
}

.panel-gate-blurred-content {
  filter: blur(6px);
  opacity: 0.4;
  pointer-events: none;
  user-select: none;
}

.panel-gate-blurred-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.panel-gate-blurred-scrim {
  position: absolute;
  inset: 0;
  background: var(--surface-primary);
  opacity: 0.72;

  @include rule-mode-dark() {
    opacity: 0.78;
  }
}

.panel-gate-blurred-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 320px;
}
```

Note: `rule-mode-dark()` is this repo's existing dark-mode mixin — confirm
`PanelGate/index.scss` already has access to it (check for an `@import
'styles/functional';` at the top of the file; if it's missing, add it —
every other file in this codebase that uses `rule-mode-dark()` imports
that partial first).

- [ ] **Step 3: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline (no new tests — this repo has zero
RTL component tests; `PanelGate` has no new pure logic, `preview` is a
simple prop-driven branch).

- [ ] **Step 4: Manual QA — confirm the DEFAULT behavior is unchanged**

With `TESTING=false` (default), `yarn start`, visit `/live` logged out
(uses `PremiumGate`, unaffected by this change but confirm nothing broke)
and `/analytics` logged out — the Donor tab and Chain Activity tab (which
don't pass `preview`) must render EXACTLY the same flat lock-message card
as before this change, byte-for-byte visually identical. Do not check
Apps/Network yet — they don't use `preview="blur"` until Tasks 2-3.

- [ ] **Step 5: Commit**

```bash
git add client/src/analytics/PanelGate/index.jsx client/src/analytics/PanelGate/index.scss
git commit -m "feat(analytics): PanelGate gains an opt-in blurred-preview locked state"
```

---

### Task 2: Apps tab — headline stat + accent consistency + blur preview

**Files:**
- Modify: `client/src/analytics/AppsTab/index.jsx`
- Modify: `client/src/analytics/AppsTab/index.scss`

**Interfaces:**
- Consumes: `PanelGate` with `preview="blur"` (Task 1).
- Produces: nothing new consumed by later tasks (Task 3 is independent).

- [ ] **Step 1: Add the headline stat to `AppsTab`'s return** — replace
  the existing `apps-tab-stat-row` block (currently the
  `appsTeamSponsoredStat` panel) with a new headline row ABOVE it, keeping
  the existing team-sponsored stat card as its own panel below:

```jsx
  return (
    <div className="apps-tab">
      <div className="apps-tab-hero">
        <span className="apps-tab-hero-value">{fmtNum(networkTotalInstances)}</span>
        <span className="apps-tab-hero-label">Ordered app instances</span>
      </div>

      <div className="apps-tab-stat-row">
        <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored stat" preview="blur">
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
        <PanelGate panelKey="appEcosystem" feature="App Ecosystem" preview="blur">
          <AppEcosystemBreakdown gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topHostedApps" feature="Top Hosted Apps" preview="blur">
          <TopHostedApps gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topNodeOperators" feature="Top Node Operators" preview="blur">
          <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        </PanelGate>
        <PanelGate panelKey="topAppOwners" feature="Top App Owners" preview="blur">
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

Note: `expiringToday`/`deployedToday`/`workhorse` are `'public'` already
(Session 1/2) — deliberately NOT given `preview="blur"` since
`getPanelAccess` returns `true` for them regardless of lock state, making
the prop a no-op; leaving it off keeps the diff honest about which panels
are actually gate-relevant. (Adding it wouldn't be wrong — it's genuinely
inert for a `'public'` key — but omitting it is clearer to a future
reader.)

The headline stat uses the same `networkTotalInstances` value the
already-existing FLUX-TEAM-SPONSORED caption uses — no new fetch, no new
state. Confirm `networkTotalInstances` is in scope at this point in the
function (it's destructured from `ownerTotals` a few lines above the
`return` — check the current file, this should already be true).

- [ ] **Step 2: Add the headline-stat CSS** — append to
  `client/src/analytics/AppsTab/index.scss`:

```scss

// ── Headline stat (hero number) ──────────────────────────────────────────
// Scales up the existing hero-number pattern from home/HomeOverview's
// .hov-header-badge--hero (same gradient-clip-in-dark-mode idea, same
// plain-color-in-light-mode fallback) to a real page-level headline
// instead of an in-panel accent.

.apps-tab-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}

.apps-tab-hero-value {
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1.1;

  @include rule-mode-dark() {
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.apps-tab-hero-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
```

- [ ] **Step 3: Replace the ad hoc accent color** — this tab currently has
  no hardcoded accent-strip color of its own to fix (its panels borrow
  `--accent-blue`-adjacent styling only via the new hero above), so this
  step is just a confirmation: grep
  `grep -n "#[0-9a-fA-F]\{6\}" client/src/analytics/AppsTab/index.scss`
  and confirm the only hex literals remaining are `.apps-tab-team-flag`'s
  `#2b61d1`/`#5b9bf5` (intentionally untouched, per Global Constraints) —
  if you find any OTHER hardcoded hex that should obviously be
  `--accent-blue` instead (the plan's author did not find one at the time
  of writing, but the file may have changed), use your judgment and note
  the change in your report; don't invent a change if there's nothing to
  fix here.

- [ ] **Step 4: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline.

- [ ] **Step 5: Manual QA** — with `TESTING=false` and no donor wallet set,
  `yarn start`, **navigate DIRECTLY to `/analytics` in a fresh tab** (do
  NOT click through from `/home` — Session 2's final review found two real
  bugs that only surface on a cold chunk load, not click-through). Confirm:
  the Apps tab shows the new headline stat (a large number, gradient-tinted
  in dark mode, plain in light mode) reading "Ordered app instances"; the
  FLUX-TEAM-SPONSORED, App Ecosystem, Top Hosted Apps, Top Node Operators,
  and Top App Owners panels each show BLURRED real data with the unlock
  card overlaid (not the old flat lock message, and not literally unreadable
  garbage — you should be able to tell there's real content under the
  blur); Expiring Today/Deployed Today/Workhorse render normally (still
  public, unaffected). Then set `TESTING=true`, reload, confirm everything
  renders fully unlocked and normal (no blur, no overlay) — this proves
  `preview="blur"` correctly becomes a no-op once unlocked. Toggle dark
  mode in both states and confirm the hero number's gradient only shows in
  dark mode, plain color in light mode, and the blur-scrim is legible in
  both themes (not too dark/too light to read the overlay card against).
  Revert `TESTING` to `false`, confirm `git status` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(analytics): Apps tab headline stat + blurred locked-panel preview"
```

---

### Task 3: Network tab — headline stat + accent consistency + blur preview

**Files:**
- Modify: `client/src/analytics/NetworkTab/index.jsx`
- Modify: `client/src/analytics/NetworkTab/index.scss`

**Interfaces:**
- Consumes: `PanelGate` with `preview="blur"` (Task 1). Independent of
  Task 2 — both tasks touch disjoint files.

- [ ] **Step 1: Add the headline stat** — `NetworkTab`'s effect already
  fetches `fetch_global_performance_rankings()`, whose result includes
  `officialNodeCounts: { CUMULUS, NIMBUS, STRATUS }` (confirmed —
  `client/src/apidata.js:1159-1163`, comment: "same source as the
  dashboard header", i.e. the canonical count, not a derived guess).
  Sum the three tiers for the total. Modify the return to add a hero row:

```jsx
  const totalNodes = globalRankings
    ? (globalRankings.officialNodeCounts.CUMULUS || 0)
      + (globalRankings.officialNodeCounts.NIMBUS || 0)
      + (globalRankings.officialNodeCounts.STRATUS || 0)
    : null;

  return (
    <div className="network-tab">
      <div className="network-tab-hero">
        <span className="network-tab-hero-value">{totalNodes != null ? fmtNum(totalNodes) : '—'}</span>
        <span className="network-tab-hero-label">Total nodes</span>
      </div>

      <PanelGate panelKey="worldMap" feature="World Map" preview="blur">
        <WorldMap countryCounts={countryCounts} />
      </PanelGate>
      <div className="network-tab-continent-row">
        <PanelGate panelKey="continentBreakdown" feature="Continent Breakdown" preview="blur">
          <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
        </PanelGate>
      </div>
      <PanelGate panelKey="topDogs" feature="Top Dogs">
        <TopDogsPanel globalRankings={globalRankings} />
      </PanelGate>
    </div>
  );
}
```

`topDogs` stays without `preview="blur"` — it's `'public'`, same reasoning
as Task 2's Expiring/Deployed/Workhorse. `totalNodes` is computed just
above the `return`, inside the component body, using the `globalRankings`
state that's already set by the existing rankings fetch — since that
fetch resolves independently of `loading` (Session 2's fix), the hero
number will show `'—'` briefly if `globalRankings` hasn't resolved yet by
the time `loading` clears from the geolocation fetch, then fill in —
this is expected and correct, not a bug to fix.

- [ ] **Step 2: Add the headline-stat CSS** — append to
  `client/src/analytics/NetworkTab/index.scss`:

```scss

// ── Headline stat (hero number) ──────────────────────────────────────────
// Same pattern as AppsTab's hero (see that file's index.scss for the full
// rationale) — Network's own domain accent (--accent-purple) instead.

.network-tab-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}

.network-tab-hero-value {
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1.1;

  @include rule-mode-dark() {
    background: linear-gradient(135deg, var(--accent-purple), var(--accent-indigo));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.network-tab-hero-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
```

- [ ] **Step 3: Replace the two ad hoc hex colors with `--accent-purple`**
  — in `client/src/analytics/NetworkTab/index.scss`:

```scss
// Before:
.nt-continent-panel {
  flex: 1 1 420px;
  max-width: 480px;
  min-width: 0;
  border-left: 2px solid #8b5cf6;
}
// After:
.nt-continent-panel {
  flex: 1 1 420px;
  max-width: 480px;
  min-width: 0;
  border-left: 2px solid var(--accent-purple);
}
```

```scss
// Before:
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
// After:
.hov-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.12);
  color: var(--accent-purple);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--transition-fast);

  @include rule-mode-dark() {
    background: rgba(139, 92, 246, 0.22);
    color: #c4b5fd;
  }
}
```

(`#2686d0`/`#5eb8ff` was a Cumulus-tier blue, semantically wrong for a
generic continent-count badge that has nothing to do with node tiers —
`139, 92, 246` is `--accent-purple`'s own RGB triplet, and `#c4b5fd` is
the same light-lavender already used as `.hov-ranked-bar-fill`'s gradient
endpoint two rules below this one in the same file — reuse it, don't
invent a third purple shade.)

Leave `.hov-ranked-bar-fill`'s `linear-gradient(90deg, #8b5cf6, #c4b5fd)`
as literal hex — Sass `linear-gradient()` values interpolate fine with
`var(--accent-purple)` too, but check whether this codebase's build
tooling handles CSS custom properties inside `linear-gradient()`
correctly elsewhere before changing it (`AppsTab`'s hero gradient in Step
2 above already relies on this working, so if that renders correctly in
Step 6's manual QA, it's safe to also switch this one — your judgment,
not required either way since `#8b5cf6` already equals the token's value
exactly, this is purely a "should it be the token or the literal" style
question, not a visual bug).

- [ ] **Step 4: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline.

- [ ] **Step 5: Manual QA** — with `TESTING=false` and no donor wallet set,
  `yarn start`, **navigate DIRECTLY to `/analytics`'s Network tab** (cold
  load, not click-through — same reasoning as Task 2). Confirm: the
  headline stat shows a real total node count (purple gradient in dark
  mode); World Map and Continent Breakdown show BLURRED real data with the
  unlock overlay (not the flat lock message); Top Dogs renders normally
  (public, unaffected — and still shows real tier/metric data, confirming
  Session 2's live-QA-verified ranking wiring wasn't disturbed by this
  purely visual task). Then `TESTING=true`, reload, confirm everything
  unlocks fully with no blur/overlay anywhere. Toggle dark mode in both
  states. Revert `TESTING` to `false`, confirm `git status` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(analytics): Network tab headline stat, accent-token cleanup, blurred locked-panel preview"
```

---

### Task 4: Mandatory live visual QA + final verification sweep

**This task exists because the last two sessions' final reviews each
found a real bug that only surfaced on a genuine cold/direct route load,
never on click-through navigation. Do not skip the direct-load
requirement below, and do not consider this session done without this
task.**

**Files:** none created — verification only.

- [ ] **Step 1: Real-wallet visual pass** — `yarn start`, `TESTING=true`,
  search a real donor-qualifying wallet (reuse `t1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh`,
  confirmed qualifying in Session 1's own QA) via `/nodes` or `/home` to
  get a genuinely unlocked session, then **hard-reload directly on
  `/analytics`** (not click-through). Confirm both tabs' headline stats,
  accent colors, and panel content render correctly fully-unlocked, in
  both light and dark mode. Take note of anything that looks visually
  broken, misaligned, or illegible — this is a visual QA pass, use your
  own judgment on what "looks premium" means beyond the plan's literal
  words if something looks obviously off.

- [ ] **Step 2: Locked-state visual pass** — clear `localStorage`
  (`donorWallet` key) or use a fresh private/incognito-equivalent context,
  set `TESTING=false`, **hard-reload directly on `/analytics`** (cold
  load, critical per this task's own header). Confirm both tabs show the
  blurred-preview treatment correctly (real data shapes visible-but-blurred
  underneath, unlock card legible on top, no layout breakage) in both
  light and dark mode. Confirm the Donor and Chain Activity tabs (NOT part
  of this session) still show their ORIGINAL flat lock message, unchanged
  — this is the Task 1 constraint, re-verified here at the whole-branch
  level.

- [ ] **Step 3: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as baseline (no new tests this session).

- [ ] **Step 4: Production build**

Run: `cd client && npx react-scripts build` (no `CI=true` prefix — matches
this repo's established baseline-check convention, confirmed in Session
2's final review that `CI=true` changes CRA's warning-handling behavior).
Expected: exit 0, same 4 pre-existing baseline warning files (Navbar,
NodeGridTable, LayoutContext, WalletNodes), no new ones, no Sass errors.

- [ ] **Step 5: `git diff --stat` against the branch's merge-base with
  `origin/main`** — confirm only the files Tasks 1-3 actually named
  changed, plus this plan doc.

PR creation follows this repo's standard
`superpowers:finishing-a-development-branch` flow. The PR description
must note: this session's visual QA was performed on real, direct-loaded
routes (not click-through) specifically because of the pattern from
Sessions 1-2's final reviews, and that `PanelGate`'s default (`'plain'`)
behavior for `/live`, the Donor tab, and the Chain Activity tab was
explicitly re-verified unchanged.
