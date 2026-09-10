# Analytics Session 4 (Donor + Chain Activity Visual Refresh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Session 3's visual vocabulary (per-tab accent, headline hero) to the Donor and Chain Activity tabs, and replace Chain Activity's single aggregate progress bar with a real Recharts daily trend chart.

**Architecture:** Frontend only. Extends the existing `client/src/styles/_global.scss` token system without adding tokens; reuses Session 3's left-edge-strip + gradient-wash panel pattern and its `.apps-tab-hero` type scale. Recharts is added as a new dependency scoped to `client/src/analytics/` only. Testable logic is extracted into pure helpers in `chainActivity.js` and tested there, matching this repo's convention.

**Tech Stack:** React 18.2, SASS, Jest via react-scripts 5.0.1, Recharts (new).

**Spec:** `docs/superpowers/specs/2026-09-11-analytics-session4-design.md`

## Global Constraints

- **Test baseline, measured 2026-09-11 on `main` @ `4d1f59a`: 27 suites, 438 tests, all passing, exit 0.** One file emits console warnings during the run (`src/fluxinfo.js`, from `fluxinfoResilience.test.js` deliberately exercising the all-attempts-failed path). Tests must stay green and no NEW warning-emitting file may appear.
- Test command: `cd client && CI=true npx react-scripts test --watchAll=false`
- Build command: `cd client && npx react-scripts build` — must exit 0.
- **The accent tokens have NO dark-mode override.** `.app-mode-dark` in `_global.scss:38-52` redefines surfaces, borders, text and shadows only. `--accent-green: #0ea271`, `--accent-amber: #e09205`, `--accent-red: #dc3a3a` are identical in both themes. Do not add dark-mode accent overrides.
- **No new tokens.** Use the six existing `--accent-*` values.
- Recharts must be imported only from files under `client/src/analytics/`. `client/src/live/` keeps its no-new-dependency rule.
- SCSS files must `@import 'styles/functional';` to use the `rule-mode-dark()` mixin (`client/src/styles/_functional.scss:9`).
- Windows environment: avoid unicode arrows in console output or comments; use ASCII (`->`).
- Worktree name: `analytics-session4-donor-chain`. **NOT** `analytics-session4` — `worktrees/analytics-session4` already exists as a stale directory from an older session numbering.

---

### Task 1: Remove the 24H/7D range toggle

Done first deliberately: Task 2 recolors `ChainActivityTab/index.scss`, and `.ca-range-btn--active` currently hardcodes `#2686d0`. Removing the toggle first means Task 2 never restyles markup that is about to be deleted.

**Files:**
- Modify: `client/src/analytics/chainActivity.js` (remove `filterDailyRange`, add two exported constants)
- Modify: `client/src/analytics/chainActivity.test.js:1` (import line) and `:189-207` (the `filterDailyRange` describe block)
- Modify: `client/src/analytics/ChainActivityTab/index.jsx` (remove `RANGE_OPTIONS`, `rangeDays` state, toggle markup; change `UtilitySummary` and `TeamTxList` signatures)
- Modify: `client/src/analytics/ChainActivityTab/index.scss:47-72` (remove `.ca-range-toggle` and `.ca-range-btn`; line numbers are pre-edit and valid for this task, which touches this file first)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BLOCKS_PER_DAY: number` (2880) and `RETENTION_DAYS: number` (8), both exported from `client/src/analytics/chainActivity.js`. Both are consumed by this task's own `TeamTxList` cutoff; no later task imports them. `filterDailyRange` no longer exists after this task — do not import it anywhere.

- [ ] **Step 1: Write the failing test**

In `client/src/analytics/chainActivity.test.js`, change the import on line 1 to drop `filterDailyRange` and add the two constants:

```js
import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, BLOCKS_PER_DAY, RETENTION_DAYS } from './chainActivity';
```

Then replace the entire `describe('filterDailyRange', ...)` block (lines 189-207) with:

```js
describe('retention constants', () => {
  it('BLOCKS_PER_DAY matches the backend 30s block target', () => {
    // chain_activity.rs: BLOCKS_PER_DAY = 2880. 86400 / 2880 == 30s.
    expect(BLOCKS_PER_DAY).toBe(2880);
    expect(86400 / BLOCKS_PER_DAY).toBe(30);
  });

  it('RETENTION_DAYS matches the backend retention window', () => {
    // chain_activity.rs: RETENTION_DAYS = 8, RETENTION_BLOCKS = 23040.
    expect(RETENTION_DAYS).toBe(8);
    expect(BLOCKS_PER_DAY * RETENTION_DAYS).toBe(23040);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false -t "retention constants"`
Expected: FAIL — `BLOCKS_PER_DAY` and `RETENTION_DAYS` are `undefined`, so `expect(undefined).toBe(2880)` fails.

- [ ] **Step 3: Add the constants and delete `filterDailyRange`**

In `client/src/analytics/chainActivity.js`, DELETE this function entirely:

```js
// Client-side range filter — the backend always returns the full retained
// window in one payload, so toggling 24h/7d never needs a second network call.
export function filterDailyRange(daily, days) {
  return (daily || []).slice(-days);
}
```

And add, immediately above `summarizeDaily`:

```js
// Kept in sync with the backend constants of the same name in
// api/src/services/chain_activity.rs. The backend always returns the full
// retained window in one payload, so the UI never needs a second network call
// to change what it shows -- which is why the old 24H/7D toggle was removed:
// a 1-day chart is a single bar, not a trend.
export const BLOCKS_PER_DAY = 2880; // 30 sec/block
export const RETENTION_DAYS = 8;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false -t "retention constants"`
Expected: PASS (2 tests)

- [ ] **Step 5: Remove the toggle from the component**

In `client/src/analytics/ChainActivityTab/index.jsx`:

Change the import line to drop `filterDailyRange`:

```js
import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, BLOCKS_PER_DAY, RETENTION_DAYS } from 'analytics/chainActivity';
```

DELETE this block entirely:

```js
const RANGE_OPTIONS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
];
```

Replace the whole `UtilitySummary` function signature and body opening so it no longer takes or uses range props:

```js
function UtilitySummary({ daily, syncStatus }) {
  const { utilityBlocks, emptyBlocks } = summarizeDaily(daily);
  const total = utilityBlocks + emptyBlocks;
  const badgeText = daily.length === 1 ? '1 day' : `${daily.length} days`;
```

(Delete the `const ranged = filterDailyRange(...)`, `const isPartial = ...` lines and the old `badgeText` ternary. Everything from `const stillBuilding = ...` onward stays, except replace the two `'No blocks in this range yet'` / `ranged` references — the `total === 0` branch now reads:)

```js
      {total === 0 ? (
        <div className="hov-empty">
          {daily.length === 0
            ? (stillBuilding ? 'Still building history — check back shortly' : 'No data available')
            : 'No blocks recorded yet'}
        </div>
      ) : (
```

Replace `TeamTxList`'s signature and cutoff:

```js
function TeamTxList({ teamTxs, lastScannedHeight }) {
  const cutoffHeight = lastScannedHeight - RETENTION_DAYS * BLOCKS_PER_DAY;
  const ranged = (teamTxs || []).filter((t) => t.blockHeight >= cutoffHeight);
```

In the `ChainActivityTab` component, DELETE this line:

```js
  const [rangeDays, setRangeDays] = useState(1);
```

DELETE this line:

```js
  const activeRange = RANGE_OPTIONS.find((r) => r.days === rangeDays) || RANGE_OPTIONS[0];
```

DELETE the entire toggle markup:

```jsx
      <div className="ca-range-toggle">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`ca-range-btn${r.days === rangeDays ? ' ca-range-btn--active' : ''}`}
            onClick={() => setRangeDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
```

And change the two panel usages to:

```jsx
      <UtilitySummary daily={data.daily} syncStatus={data.syncStatus} />
      <TeamTxList teamTxs={data.teamTxs} lastScannedHeight={data.lastScannedHeight} />
```

- [ ] **Step 6: Remove the toggle styles**

In `client/src/analytics/ChainActivityTab/index.scss`, DELETE lines 47-72 — the entire `.ca-range-toggle` and `.ca-range-btn` blocks (`.ca-range-btn` is the only remaining user of the hardcoded `#2686d0` outside `.hov-badge`, which Task 2 handles).

- [ ] **Step 7: Verify nothing still references the removed names**

Run: `cd client && grep -rn "filterDailyRange\|RANGE_OPTIONS\|rangeDays\|ca-range-" src/ ; echo "exit=$?"`
Expected: no matches (grep prints nothing, `exit=1`). Any match is a leftover reference that must be removed.

- [ ] **Step 8: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: 27 suites pass. Test count drops by 3 and rises by 2 (438 -> 437) because three `filterDailyRange` tests were replaced by two constants tests.

- [ ] **Step 9: Commit**

```bash
git add client/src/analytics/chainActivity.js client/src/analytics/chainActivity.test.js client/src/analytics/ChainActivityTab/index.jsx client/src/analytics/ChainActivityTab/index.scss
git commit -m "refactor(analytics): remove the Chain Activity 24H/7D range toggle

The Recharts trend chart replacing UtilitySummary's aggregate bar always
shows the full retained window -- a 1-day chart is a single bar, not a
trend -- so the toggle has nothing left to switch between.

filterDailyRange goes with it. BLOCKS_PER_DAY and RETENTION_DAYS are now
exported from chainActivity.js instead of living as an inline 2880 in the
component, so the backend constants they mirror are named in one place."
```

---

### Task 2: Accent tokens and the `hov-badge` collision guard

**Files:**
- Modify: `client/src/analytics/ChainActivityTab/index.scss`
- Modify: `client/src/analytics/DonorTab/index.scss`
- Modify: `client/src/analytics/WorldMap/index.scss:38-40`

**Interfaces:**
- Consumes: Task 1 having removed `.ca-range-btn` (otherwise a `#2686d0` reference survives).
- Produces: no JS interface. Produces the CSS classes `.chain-activity-tab .hov-badge` and `.donor-tab .hov-badge` at specificity (0,2,0).

**Why this task is not cosmetic.** Session 3 shipped a Critical bug caught only in final review: unscoped single-class `hov-*` selectors collide inside the shared `/analytics` lazy webpack chunk, and whichever stylesheet imports last in `Analytics.jsx` wins silently. It produces **zero visible difference from baseline**, so screenshot QA cannot catch it. `ChainActivityTab/index.scss:177` and `DonorTab/index.scss:205` both still define an unscoped `.hov-badge`, and they collide with each other as well as with `AppsTab` and `TopHostedApps`. **Both must be scoped in the same task** or the verification in Step 5 cannot pass.

- [ ] **Step 1: Scope and recolor Chain Activity's badge**

In `client/src/analytics/ChainActivityTab/index.scss`, find the `.hov-badge` block (it opens with `font-size: 0.68rem;` and sets `color: #2686d0`) and replace it entirely with:

```scss
// Scoped to the tab root, not left as a bare .hov-badge: four other analytics
// stylesheets define this same class at the same specificity and all land in
// the same /analytics webpack chunk, so an unscoped rule silently wins or
// loses on import order alone. (0,2,0) beats those (0,1,0) rules durably,
// regardless of future import order. See Session 3's final-review finding.
.chain-activity-tab .hov-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(224, 146, 5, 0.12);
  color: var(--accent-amber);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--transition-fast);

  @include rule-mode-dark() {
    background: rgba(224, 146, 5, 0.22);
  }
}
```

- [ ] **Step 2: Give Chain Activity its accent strip and recolor the utility bar**

In `client/src/analytics/ChainActivityTab/index.scss`, add immediately after the `.hov-panel` block (the one ending with the `rule-mode-dark()` include, just above `.hov-header`):

```scss
// Per-tab accent, matching Session 3's Apps/Network pattern: a left-edge strip
// plus a faint gradient wash on the header. Chain Activity -> amber.
.chain-activity-tab .hov-panel {
  border-left: 2px solid var(--accent-amber);
}

.chain-activity-tab .hov-panel .hov-header {
  background: linear-gradient(90deg, rgba(224, 146, 5, 0.04) 0%, transparent 60%);
}
```

Then tokenize the two summary-line colours, which survive this session:

```scss
.ca-utility-stat--utility {
  color: var(--accent-green);
}

.ca-utility-stat--empty {
  color: var(--accent-red);
}
```

**Do NOT touch `.ca-utility-bar` or `.ca-utility-bar-fill`.** They still carry hardcoded hexes (`#22c55e`, `#4ade80`, `rgba(239, 68, 68, ...)`), and that is deliberate: Task 4 deletes both blocks outright when the Recharts chart replaces the aggregate bar. Recolouring them here would be work thrown away two tasks later, for the same reason Task 1 runs before this one.

Note also that `.ca-utility-bar*` and `.ca-utility-stat*` are `ca-`-prefixed and carry no collision risk — they never need scoping. Only the shared `hov-*` family does.

- [ ] **Step 3: Scope and recolor Donor's badge, and give it its accent strip**

In `client/src/analytics/DonorTab/index.scss`, find the `.hov-badge` block (same shape as Chain Activity's — `font-size: 0.68rem`, `color: #2686d0`) and replace it entirely with:

```scss
// Scoped for the same reason as ChainActivityTab's -- see that file's comment.
.donor-tab .hov-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(14, 162, 113, 0.12);
  color: var(--accent-green);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--transition-fast);

  @include rule-mode-dark() {
    background: rgba(14, 162, 113, 0.22);
  }
}
```

And add immediately after `DonorTab`'s `.hov-panel` block:

```scss
// Per-tab accent: Donor -> green.
.donor-tab .hov-panel {
  border-left: 2px solid var(--accent-green);
}

.donor-tab .hov-panel .hov-header {
  background: linear-gradient(90deg, rgba(14, 162, 113, 0.04) 0%, transparent 60%);
}
```

- [ ] **Step 4: Tokenize WorldMap's hardcoded accent**

In `client/src/analytics/WorldMap/index.scss`, replace the `.wm-panel` block (lines 38-40 — this file is untouched by earlier tasks, so the line numbers hold):

```scss
.wm-panel {
  border-left: 2px solid var(--accent-purple);
}
```

This is the third un-tokenized Network-tab accent, parked from Session 3 and folded in here by explicit user selection.

- [ ] **Step 5: Verify against BUILT CSS, not source**

This is the step that would have caught Session 3's bug. A source diff cannot.

Run:
```bash
cd client && npx react-scripts build && grep -o "[^{}]*\.hov-badge[^{]*{" build/static/css/*.chunk.css
```

Expected: every emitted `.hov-badge` rule is either prefixed with a tab-root class (`.chain-activity-tab `, `.donor-tab `, `.nt-continent-panel `) or comes from a file this session did not touch (`AppsTab`, `TopHostedApps`). **If a bare `.hov-badge{` appears from ChainActivityTab or DonorTab, the scoping did not take effect — stop and fix before continuing.**

Also confirm the badge and strip hexes are gone from the touched files:
```bash
cd client && grep -n "#2686d0\|#5eb8ff\|#0ea5e9" src/analytics/ChainActivityTab/index.scss src/analytics/DonorTab/index.scss src/analytics/WorldMap/index.scss ; echo "exit=$?"
```
Expected: no matches, `exit=1`.

`#22c55e`, `#4ade80` and `rgba(239, 68, 68, ...)` are deliberately NOT checked here — they live in `.ca-utility-bar*`, which Task 4 deletes. Task 4's Step 10 runs the complete hex check once those blocks are gone.

- [ ] **Step 6: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: 27 suites pass, 437 tests (unchanged from Task 1 — this task is CSS only).

- [ ] **Step 7: Commit**

```bash
git add client/src/analytics/ChainActivityTab/index.scss client/src/analytics/DonorTab/index.scss client/src/analytics/WorldMap/index.scss
git commit -m "feat(analytics): per-tab accents for Donor and Chain Activity, scoped hov-badge

Completes Part D's accent mapping -- Donor -> --accent-green, Chain
Activity -> --accent-amber -- using Session 3's left-edge-strip plus
gradient-wash pattern. No new tokens.

Both tabs' .hov-badge rules were unscoped single-class selectors landing
in the shared /analytics chunk alongside four other copies of the same
class, so whichever imported last won silently. Scoped both to their tab
root at (0,2,0), which beats the unscoped rules durably rather than only
under today's import order. Verified against the built CSS chunk, not the
source -- this bug class produces no visible difference from baseline.

Also tokenizes WorldMap's .wm-panel #0ea5e9, the third un-tokenized
Network-tab accent, parked from Session 3."
```

---

### Task 3: Headline hero stats

**Files:**
- Modify: `client/src/analytics/chainActivity.js` (add `todaysUtilityBlocks`)
- Modify: `client/src/analytics/chainActivity.test.js` (tests for it)
- Modify: `client/src/analytics/ChainActivityTab/index.jsx` (render the hero)
- Modify: `client/src/analytics/ChainActivityTab/index.scss` (hero styles)
- Modify: `client/src/analytics/DonorTab/index.jsx` (render the hero)
- Modify: `client/src/analytics/DonorTab/index.scss` (hero styles)

**Interfaces:**
- Consumes: `RETENTION_DAYS` is not needed here. Nothing from Task 2.
- Produces: `todaysUtilityBlocks(daily: Array<{date, utilityBlocks, emptyBlocks}>) => number` exported from `client/src/analytics/chainActivity.js`. Returns 0 for an empty or missing array.

- [ ] **Step 1: Write the failing test**

Append to `client/src/analytics/chainActivity.test.js`:

```js
describe('todaysUtilityBlocks', () => {
  it('returns the most recent day\'s utility count', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 100, emptyBlocks: 200 },
      { date: '2026-09-10', utilityBlocks: 490, emptyBlocks: 2390 },
    ];
    expect(todaysUtilityBlocks(daily)).toBe(490);
  });

  it('reads the LAST entry, not the largest', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 999, emptyBlocks: 0 },
      { date: '2026-09-10', utilityBlocks: 12, emptyBlocks: 0 },
    ];
    expect(todaysUtilityBlocks(daily)).toBe(12);
  });

  it('returns 0 for an empty or missing array', () => {
    expect(todaysUtilityBlocks([])).toBe(0);
    expect(todaysUtilityBlocks(null)).toBe(0);
    expect(todaysUtilityBlocks(undefined)).toBe(0);
  });

  it('returns 0 when the last entry has no utility count', () => {
    expect(todaysUtilityBlocks([{ date: '2026-09-10', emptyBlocks: 5 }])).toBe(0);
  });
});
```

And add `todaysUtilityBlocks` to the import on line 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false -t "todaysUtilityBlocks"`
Expected: FAIL — `todaysUtilityBlocks is not a function`.

- [ ] **Step 3: Implement it**

Add to `client/src/analytics/chainActivity.js`, below `summarizeDaily`:

```js
// The headline stat for the Chain Activity tab. Deliberately the LAST entry
// rather than a max or an average: the backend appends days in date order and
// trims from the front (trim_daily_retention sorts by date before draining),
// so the last entry is always the most recent day. Part D's spec originally
// proposed "today's tx count" for this hero, but no transaction count exists
// anywhere in the data model -- daily entries carry only utility/empty block
// counts -- so this is the real number closest to that intent.
export function todaysUtilityBlocks(daily) {
  if (!daily || daily.length === 0) return 0;
  return daily[daily.length - 1].utilityBlocks || 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false -t "todaysUtilityBlocks"`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the shared hero styles to both tabs**

In `client/src/analytics/ChainActivityTab/index.scss`, append:

```scss
// ── Headline stat (hero number) ──────────────────────────────────────────
// Mirrors AppsTab/index.scss's .apps-tab-hero, with this tab's accent. The
// gradient-clip treatment is dark-mode only; light mode uses a plain
// --text-primary, same as Session 3's version.

.ca-tab-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}

.ca-tab-hero-value {
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1.1;

  @include rule-mode-dark() {
    background: linear-gradient(135deg, var(--accent-amber), #f5c451);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.ca-tab-hero-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
```

In `client/src/analytics/DonorTab/index.scss`, append the same structure with the green accent:

```scss
// ── Headline stat (hero number) ──────────────────────────────────────────
// Mirrors AppsTab/index.scss's .apps-tab-hero, with this tab's accent.

.dt-tab-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}

.dt-tab-hero-value {
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1.1;

  @include rule-mode-dark() {
    background: linear-gradient(135deg, var(--accent-green), #34d399);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.dt-tab-hero-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
```

- [ ] **Step 6: Render the Chain Activity hero**

In `client/src/analytics/ChainActivityTab/index.jsx`, add `todaysUtilityBlocks` to the `analytics/chainActivity` import, then insert the hero as the first child of the returned `<div className="chain-activity-tab">`, above `<SyncStatusBanner ... />`:

```jsx
      <div className="ca-tab-hero">
        <span className="ca-tab-hero-value">{fmtNum(todaysUtilityBlocks(data.daily))}</span>
        <span className="ca-tab-hero-label">Utility blocks today</span>
      </div>
```

`fmtNum` already exists in this file and renders an em-dash for null/undefined; `todaysUtilityBlocks` returns a real `0` rather than null, so an empty history shows "0", not "—". That is correct: zero utility blocks today is a fact, not missing data.

- [ ] **Step 7: Render the Donor hero**

In `client/src/analytics/DonorTab/index.jsx`, insert the hero as the first child of the final returned `<div className="donor-tab">` (the one that renders `<PayoutCard .../>`), above `<PayoutCard>`:

```jsx
      <div className="dt-tab-hero">
        <span className="dt-tab-hero-value">{nextNode ? nextNode.next_reward : '—'}</span>
        <span className="dt-tab-hero-label">Next payout</span>
      </div>
```

`nextNode` is already computed on the line above the return (`const nextNode = sortByRank(nodes)[0] || null;`). This uses real unlocked data — consistent with the spec's decision that the Donor tab's locked state stays `preview="plain"` and shows no preview at all. Do NOT add this hero to the `!donorWallet` (`NoWalletState`) branch or the `loading` branch.

- [ ] **Step 8: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && npx react-scripts build`
Expected: 27 suites pass, 441 tests (437 + 4 new), build exits 0.

- [ ] **Step 9: Commit**

```bash
git add client/src/analytics/chainActivity.js client/src/analytics/chainActivity.test.js client/src/analytics/ChainActivityTab/index.jsx client/src/analytics/ChainActivityTab/index.scss client/src/analytics/DonorTab/index.jsx client/src/analytics/DonorTab/index.scss
git commit -m "feat(analytics): headline hero stats for Donor and Chain Activity

Extends Session 3's .apps-tab-hero type scale to the last two tabs, each
in its own accent.

Chain Activity's hero is today's utility block count. Part D originally
proposed 'today's tx count', but no transaction count exists anywhere in
the data model -- daily entries carry only utility/empty block counts --
so todaysUtilityBlocks() is the real number closest to that intent, and
it reads the last entry rather than a max because the backend appends in
date order and trims from the front.

Donor's hero is the next payout, from data the tab already computes. It
renders only in the unlocked branch: a locked visitor always has
donorWallet === null and gets NoWalletState instead, so there is nothing
to preview and nothing to blur."
```

---

### Task 4: Recharts daily trend chart, and the theme prop

**Files:**
- Modify: `client/package.json` (add `recharts`)
- Modify: `client/src/Application.jsx:178` (pass `theme` to `Analytics`)
- Modify: `client/src/analytics/Analytics.jsx` (accept `theme`, forward to `ChainActivityTab`)
- Create: `client/src/analytics/ChainActivityTab/UtilityTrendChart.jsx`
- Create: `client/src/analytics/ChainActivityTab/utilityTrend.js`
- Create: `client/src/analytics/ChainActivityTab/utilityTrend.test.js`
- Modify: `client/src/analytics/ChainActivityTab/index.jsx` (accept `theme`, render the chart inside `UtilitySummary`)
- Modify: `client/src/analytics/ChainActivityTab/index.scss` (chart container styles)

**Interfaces:**
- Consumes: Task 1 having removed the range toggle (this task edits the same `UtilitySummary` body), and Task 2's `.chain-activity-tab` panel accent for visual consistency. It imports nothing from either.
- Produces: `buildTrendSeries(daily) => Array<{date, label, utility, empty}>` from `utilityTrend.js`; `<UtilityTrendChart daily theme />` from `UtilityTrendChart.jsx`. `Analytics` and `ChainActivityTab` both gain an optional `theme` prop defaulting to `'dark'`.

**Why the theme prop is needed.** Recharts takes colors as JS props, not CSS. `Application.jsx:178` currently renders `<Analytics />` with no `theme` prop, unlike `Home` (line 130), `MainApp` (line 144) and `Demo` (line 156), which all receive `theme={darkMode ? 'dark' : 'light'}`. This repo has no theme context or hook. Threading the existing prop follows the established convention; a `MutationObserver` or `getComputedStyle` read would be a new pattern. Note the **accent tokens have no dark-mode override**, so only axis/grid/tooltip chrome varies by theme — the bar colors do not.

- [ ] **Step 1: Install Recharts**

Run: `cd client && npm install --save recharts@2.12.7`
Expected: `client/package.json` gains `"recharts": "^2.12.7"` under `dependencies`, and `package-lock.json` updates. Pin this exact minor — 2.x is the React 18-compatible line.

- [ ] **Step 2: Write the failing test**

Create `client/src/analytics/ChainActivityTab/utilityTrend.test.js`:

```js
import { buildTrendSeries } from './utilityTrend';

describe('buildTrendSeries', () => {
  it('maps daily entries to chart rows with a short label', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 100, emptyBlocks: 200 },
      { date: '2026-09-10', utilityBlocks: 490, emptyBlocks: 2390 },
    ];
    expect(buildTrendSeries(daily)).toEqual([
      { date: '2026-09-09', label: '09-09', utility: 100, empty: 200 },
      { date: '2026-09-10', label: '09-10', utility: 490, empty: 2390 },
    ]);
  });

  it('defaults missing counts to 0 rather than undefined', () => {
    expect(buildTrendSeries([{ date: '2026-09-10' }])).toEqual([
      { date: '2026-09-10', label: '09-10', utility: 0, empty: 0 },
    ]);
  });

  it('handles an empty or missing array', () => {
    expect(buildTrendSeries([])).toEqual([]);
    expect(buildTrendSeries(null)).toEqual([]);
  });

  it('leaves a malformed date string as its own label rather than throwing', () => {
    expect(buildTrendSeries([{ date: 'oops', utilityBlocks: 1, emptyBlocks: 2 }])).toEqual([
      { date: 'oops', label: 'oops', utility: 1, empty: 2 },
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false utilityTrend`
Expected: FAIL — cannot resolve `./utilityTrend`.

- [ ] **Step 4: Implement the pure helper**

Create `client/src/analytics/ChainActivityTab/utilityTrend.js`:

```js
/*
 * Shapes the backend's daily rollup into Recharts rows. Kept as a pure
 * function in its own file so it is testable without rendering a chart --
 * this repo's 27 test files all test pure logic, none render components, and
 * this task does not change that convention.
 *
 * The label is a bare MM-DD slice rather than a locale-formatted date: the
 * x-axis holds at most RETENTION_DAYS (8) ticks in a narrow panel, and a
 * full date does not fit. A date string that is not in YYYY-MM-DD form is
 * passed through unchanged rather than sliced into nonsense.
 */
export function buildTrendSeries(daily) {
  return (daily || []).map((d) => ({
    date: d.date,
    label: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date.slice(5) : d.date,
    utility: d.utilityBlocks || 0,
    empty: d.emptyBlocks || 0,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false utilityTrend`
Expected: PASS (4 tests)

- [ ] **Step 6: Build the chart component**

Create `client/src/analytics/ChainActivityTab/UtilityTrendChart.jsx`:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { buildTrendSeries } from './utilityTrend';

/*
 * Recharts takes colors as JS props, not CSS, so the token values are
 * duplicated here as literals. That duplication is deliberate and bounded:
 * the six --accent-* tokens have NO dark-mode override in _global.scss (only
 * surfaces, borders, text and shadows are redefined under .app-mode-dark), so
 * these two bar colors are correct in both themes and need no theme branch.
 */
const BAR_UTILITY = '#0ea271'; // --accent-green
const BAR_EMPTY = '#dc3a3a';   // --accent-red

/*
 * Chrome DOES vary by theme, because these mirror tokens that .app-mode-dark
 * genuinely overrides: --text-tertiary, --border-primary, --surface-elevated,
 * --text-primary and --border-hover respectively.
 */
const CHROME = {
  dark: {
    axis: '#6b6b78',
    grid: 'rgba(255, 255, 255, 0.07)',
    tooltipBg: '#1e1e21',
    tooltipText: '#ededef',
    tooltipBorder: 'rgba(255, 255, 255, 0.12)',
  },
  light: {
    axis: '#8b8d9e',
    grid: 'rgba(0, 0, 0, 0.08)',
    tooltipBg: '#ffffff',
    tooltipText: '#1a1a2e',
    tooltipBorder: 'rgba(0, 0, 0, 0.15)',
  },
};

export function UtilityTrendChart({ daily, theme }) {
  const data = buildTrendSeries(daily);
  const chrome = CHROME[theme] || CHROME.dark;

  return (
    <div className="ca-trend-chart">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={chrome.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chrome.axis, fontSize: 11 }}
            axisLine={{ stroke: chrome.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chrome.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: chrome.grid }}
            contentStyle={{
              background: chrome.tooltipBg,
              border: `1px solid ${chrome.tooltipBorder}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: chrome.tooltipText, fontWeight: 600 }}
            itemStyle={{ color: chrome.tooltipText }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: chrome.axis }} />
          <Bar dataKey="utility" name="Utility" stackId="blocks" fill={BAR_UTILITY} />
          <Bar dataKey="empty" name="Empty" stackId="blocks" fill={BAR_EMPTY} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 7: Thread the theme prop**

In `client/src/Application.jsx`, change line 178 from `<Analytics />` to:

```jsx
                        <Analytics theme={darkMode ? 'dark' : 'light'} />
```

In `client/src/analytics/Analytics.jsx`, change the component signature and the Chain Activity tab:

```jsx
export default function Analytics({ theme = 'dark' }) {
```

```jsx
        <Tab id="chain-activity" title="Chain Activity" panel={
          <PanelGate panelKey="chainActivity" feature="Chain Activity">
            <ChainActivityTab theme={theme} />
          </PanelGate>
        } />
```

- [ ] **Step 8: Render the chart in place of the aggregate bar**

In `client/src/analytics/ChainActivityTab/index.jsx`:

Add the import:

```js
import { UtilityTrendChart } from './UtilityTrendChart';
```

Change `UtilitySummary`'s signature to take `theme`:

```js
function UtilitySummary({ daily, syncStatus, theme }) {
```

Replace the `ca-utility-bar` markup — DELETE these three lines:

```jsx
          <div className="ca-utility-bar">
            <div className="ca-utility-bar-fill" style={{ width: `${pct(utilityBlocks, total)}%` }} />
          </div>
```

and put the chart in their place:

```jsx
          <UtilityTrendChart daily={daily} theme={theme} />
```

The `.ca-utility-stats` summary line below it stays — it is the at-a-glance total the chart complements, not duplicates.

Change the component signature and the usage:

```js
export function ChainActivityTab({ theme = 'dark' }) {
```

```jsx
      <UtilitySummary daily={data.daily} syncStatus={data.syncStatus} theme={theme} />
```

- [ ] **Step 9: Remove the now-dead bar styles and add the chart container**

In `client/src/analytics/ChainActivityTab/index.scss`, DELETE the `.ca-utility-bar` and `.ca-utility-bar-fill` blocks (now unused — the chart replaced them), and add:

```scss
.ca-trend-chart {
  margin-bottom: 10px;

  // Recharts renders an inline SVG that sets its own focus outline on click;
  // suppress it to match the rest of the panel chrome.
  .recharts-wrapper:focus,
  .recharts-surface:focus {
    outline: none;
  }
}
```

- [ ] **Step 10: Verify the dead styles are gone and Recharts is scoped to analytics/**

```bash
cd client && grep -rn "ca-utility-bar" src/ ; echo "styles exit=$?"
cd client && grep -rn "from 'recharts'\|require('recharts')" src/ | grep -v "^src/analytics/" ; echo "scope exit=$?"
cd client && grep -n "#2686d0\|#5eb8ff\|#22c55e\|#4ade80\|#ef4444\|#0ea5e9" src/analytics/ChainActivityTab/index.scss src/analytics/DonorTab/index.scss src/analytics/WorldMap/index.scss ; echo "hex exit=$?"
```
Expected: all three print nothing and report `exit=1`.

The third is the complete hardcoded-hex check deferred from Task 2 Step 5 — it can only pass now, because `.ca-utility-bar` and `.ca-utility-bar-fill` (which held `#22c55e`, `#4ade80` and the `rgba(239, 68, 68, ...)` track) were just deleted in Step 9.

Any `recharts` import outside `src/analytics/` violates the constraint that `/live` stays dependency-free.

- [ ] **Step 11: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && npx react-scripts build`
Expected: 28 suites pass (the new `utilityTrend.test.js`), 445 tests (441 + 4), build exits 0. Note the `/analytics` chunk will grow noticeably — Recharts is roughly 100 KB gzipped. It is lazy-loaded, so first paint is unaffected.

- [ ] **Step 12: Commit**

```bash
git add client/package.json client/package-lock.json client/src/Application.jsx client/src/analytics/Analytics.jsx client/src/analytics/ChainActivityTab/
git commit -m "feat(analytics): Recharts daily trend chart for Chain Activity

Replaces UtilitySummary's single aggregate two-colour progress bar with a
stacked daily bar chart across the full retained window -- the one place
in this rework where hand-rolled SVG was genuinely limiting. Recharts is
scoped to client/src/analytics/ only; /live keeps its no-new-dependency
rule.

Application.jsx rendered <Analytics /> with no theme prop, unlike Home,
MainApp and Demo which all receive one, and this repo has no theme
context or hook -- so the existing prop is threaded down rather than
introducing a MutationObserver or a getComputedStyle read. Only axis,
grid and tooltip chrome varies by theme: the --accent-* tokens have no
dark-mode override, so the bar colours are correct in both."
```

---

### Task 5: Live QA and verification (no code)

Mandatory, per the spec's verification section and the user's explicit choice of the full Sessions 1-2 discipline. **This task produces a written QA report, not a commit.** If any check fails, stop and file the finding rather than proceeding to PR.

**Files:** none modified.

**Interfaces:** consumes the complete branch from Tasks 1-4.

- [ ] **Step 1: Start the app**

```bash
cd client && npm start
```
Open <http://localhost:3000/analytics>.

Note: the Donor and Chain Activity tabs are both gated (`panelAccess.js` marks `donorTab` and `chainActivity` as `'donor'`). Use the repo's testing flag to unlock — see `chore/rename-testing-flag`'s `TESTING` flag — or connect a qualifying donor wallet.

- [ ] **Step 2: Chain Activity tab, dark mode**

Confirm each, and record a PASS/FAIL line for each:
- The hero shows a real "Utility blocks today" number, gradient-filled amber.
- Panels carry an amber left-edge strip and a faint amber header wash.
- Badges are amber, not blue.
- The trend chart renders stacked green/red daily bars, one per retained day.
- The chart tooltip shows date, Utility and Empty on hover, with dark chrome.
- The 24H/7D toggle is **gone**.
- The `X utility (N%) / Y empty (N%)` summary line still renders below the chart.

- [ ] **Step 3: Chain Activity tab, light mode**

Toggle the theme. Confirm:
- The hero is plain dark text, not gradient (gradient is dark-mode only by design).
- The chart's axis labels, grid and tooltip switch to light chrome and stay legible.
- **This is the check that catches a broken theme prop.** If the chart chrome stays dark in light mode, the prop is not reaching `UtilityTrendChart` — trace `Application.jsx:178` -> `Analytics` -> `ChainActivityTab` -> `UtilitySummary` -> `UtilityTrendChart`.

- [ ] **Step 4: Donor tab, both themes**

- The hero shows the real next-payout value, gradient-filled green in dark mode.
- Panels carry a green left-edge strip and header wash; badges are green.
- Locked state (no donor wallet) still shows the plain `NoWalletState` lock message with **no hero and no blur** — this is intended, not a bug.

- [ ] **Step 5: Confirm Apps and Network are unchanged**

Session 3's blue and purple accents must be untouched. **If Apps or Network badges have changed colour, the Task 2 scoping is wrong and has leaked** — that is exactly the collision bug this session was supposed to prevent, now inverted.

- [ ] **Step 6: Responsive check**

Narrow the viewport to ~400px. The chart must shrink via `ResponsiveContainer` without overflowing its panel or forcing horizontal page scroll.

- [ ] **Step 7: Built-CSS collision re-verification**

Re-run the Task 2 Step 5 grep against the final build of the whole branch, not just that task's build:

```bash
cd client && npx react-scripts build && grep -o "[^{}]*\.hov-badge[^{]*{" build/static/css/*.chunk.css
```
Expected: no bare `.hov-badge{` originating from ChainActivityTab or DonorTab.

- [ ] **Step 8: Live wallet regression replay**

Per the user's explicit choice of the conservative option. No `globalRankings` or ranking-calculation code is touched in this session — DonorTab's data path (`donorNodes.js`, `donorUtilization.js`, `donorApps.js`) is visually reskinned, not restructured — so this is expected to be a no-op. Run it anyway:

1. Check out `main` in a second worktree, run it, and record a real wallet's Nodes-page numbers: every rank, achievement and tier stat.
2. Run the same wallet on this branch.
3. Diff. **Any difference at all is a finding** — this session should change no number anywhere on the Nodes page.

- [ ] **Step 9: Full suite and build, one final time**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && npx react-scripts build`
Expected: 28 suites, 445 tests, all pass; build exits 0; no new warning-emitting file beyond the baseline `src/fluxinfo.js`.

- [ ] **Step 10: Write the QA report**

Record the results of Steps 2-9 as a comment on the PR, or in the session's handoff notes if no PR exists yet. A bare "QA passed" is not acceptable — list each check with its result, and paste the Step 8 diff (or state explicitly that it was empty).

---

## Definition of done

- All four code tasks committed on `analytics-session4-donor-chain`.
- 28 suites / 445 tests green; build exit 0.
- No bare `.hov-badge` from ChainActivityTab or DonorTab in the built CSS.
- No `recharts` import outside `client/src/analytics/`.
- Live QA report written, including an explicitly empty wallet-replay diff.
- Final whole-branch review before PR, matching every prior session in this rework.
