# Live Redesign Session B — Interaction + Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four `/live` flow-canvas activity cards built in Session A clickable — one-at-a-time outward expansion with real per-category detail, hover relationship highlighting, and a coordinated new-block animation that never fires on an ordinary same-height poll.

**Architecture:** Session A left the flow canvas fully data-driven but inert (no click handlers, no `role`/`tabIndex`, static idle-only connectors). This session adds: (1) two small pure modules for the two genuinely non-trivial pieces of state logic (new-block detection, expand/collapse toggling) so they're unit-tested the same way `blockAnimation.js`/`blockFlowSummary.js` already are; (2) `expandedCategory` state lifted into `Live.jsx` per the spec's own suggested state shape; (3) real per-category expanded content inside `ActivityCard`, following the exact same "one file, one dispatch map, one small component per category" pattern `DetailsPanel/index.jsx` already uses for its four row types; (4) CSS-driven hover/expand/pulse states using `:has()` (already load-bearing in this codebase's SCSS — Session A's `color-mix()` usage sits in the same modern-browser tier) so cross-element highlighting (card → connector → block) needs no extra React state or re-renders.

**Tech Stack:** React 18 (hooks, `forwardRef`), SCSS (`styles/functional` mixins, CSS custom properties, `:has()` selector), no new dependencies — matches Session A and the spec's own §67 instruction not to add React Flow.

**Spec:** `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (this plan implements Phase 3 "Interaction" + Phase 4 "Motion", i.e. §§12–25, plus the parts of §50–52 and §71/§73 that apply to interaction/motion specifically). `LIVE_REDESIGN_PLAN.md`'s "Session B" section is the human-facing summary of the same scope.

## Global Constraints

- **Scope boundary (spec §4):** only files under `client/src/live/` change. No edits to Home, Nodes, Analytics, Demo, nav, auth, routing, or `client/src/styles/_global.scss`. Verified at the end via `git diff --stat main`.
- **No new dependency** (spec §67) — plain React + CSS + SVG only.
- **Testing convention, established by Sessions A/1–5 and to be followed here too:** this codebase tests *pure logic* (`blockAnimation.js`, `blockFlowSummary.js`, `apidata.js`'s extraction functions, `timeFormat.js`) and does **not** unit-test React component wiring — no file in `client/src` uses `@testing-library/react` even though it's an installed CRA-default dependency. The spec's §71/§73 test lists ("clicking Rewards expands", "Escape collapses", "same-height poll does not animate") are satisfied here by extracting the actual *decision* into a pure function and testing that function exhaustively; the thin event-handler wiring that calls it (an `onClick`, a `keydown` listener, an effect) is exercised by the manual QA pass in the final task, exactly as every prior session's click/keyboard/effect wiring has been. This is called out explicitly per-task below so no task looks like it's skipping required tests.
- **Do not modify global tokens** (spec §46) — every color/spacing/shadow value here reuses `--surface-primary`, `--surface-secondary`, `--surface-inset`, `--border-primary`, `--border-hover`, `--text-primary/secondary/tertiary`, `--shadow-sm/md`, `--radius-md`, or a category/tier hex already defined in `categoryMeta.js`/`tierMeta.js`.
- **Animation budget (spec §14, §24, §50):** expansion transitions 280–420ms (this plan uses 320ms); new-block choreography total ~900–1100ms (this plan uses ~1000ms: block 0–220ms, connectors 150–500ms, cards 300–850ms, nothing scheduled past 850ms so the scene is visually settled by ~900ms).
- **`prefers-reduced-motion`** (spec §51–52): every new keyframe animation this plan adds gets a `@media (prefers-reduced-motion: reduce)` override that disables it, following the exact pattern already in `Live.scss`'s `.live-live-dot`.
- **Card interactivity (spec §51):** cards become real interactive elements (`role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space) — mirrors `ChainRail/index.jsx`'s existing `ChainBlock` component almost exactly; reuse that pattern rather than inventing a new one.
- **Regression safety (spec §75):** before the final commit, `git diff --stat main` must show only `client/src/live/**` and this plan file; full test suite and production build must both pass; manual spot-check of `/live`, `/home`, `/nodes`, `/analytics`, and the theme toggle (same routine as Session A's Task 9).

---

## File structure

```text
client/src/live/
├── Live.jsx                       [MODIFY] expandedCategory state, collapse triggers, new-block-pulse wiring
├── blockAnimation.js               [MODIFY] + isFreshLiveTip
├── blockAnimation.test.js          [MODIFY] + tests for isFreshLiveTip
├── flowInteraction.js               [NEW] toggleExpandedCategory, categoriesToPulse (pure)
├── flowInteraction.test.js          [NEW] tests for the above
├── blockFlowSummary.js             [MODIFY] + p2p.transfers
├── blockFlowSummary.test.js        [MODIFY] existing p2p/empty-block assertions gain `transfers`
├── FlowCanvas/
│   ├── index.jsx                  [MODIFY] cardContentFor gains `expanded` per category; canvas-click-collapse; pulse/expanded props threaded through
│   └── index.scss                 [MODIFY] overflow: visible + ::before border-radius (so expanded cards can visually overflow their grid track)
├── FlowBlock/
│   ├── index.jsx                  [MODIFY] accepts `pulseKey`, `haloColor`
│   └── index.scss                 [MODIFY] pulse keyframe, halo modifier, reduced-motion override
├── ActivityCard/
│   ├── index.jsx                  [MODIFY] real interactivity, expand/collapse, four per-category expanded-body renderers
│   └── index.scss                 [MODIFY] expanded/dimmed/pulsing states, quadrant outward transforms, hover via :has(), reduced-motion override
└── FlowConnectors/
    ├── index.jsx                  [MODIFY] accepts `expandedCategory`, `pulseCategories`, `pulseKey`; pathLength for the pulse dash animation
    └── index.scss                 [MODIFY] hover/expanded/pulse states via :has() + modifier classes, reduced-motion override
```

No new component directories — every new behavior fits inside a file Session A already created, matching spec §66's ownership list exactly (`FlowCanvas` owns composition, `FlowBlock` owns the block, `ActivityCard` owns "category summary and expansion presentation", `FlowConnectors` owns "SVG paths and visual connector states").

---

### Task 1: New-block detection + per-category pulse gating (pure logic)

**Files:**
- Modify: `client/src/live/blockAnimation.js`
- Modify: `client/src/live/blockAnimation.test.js`

**Interfaces:**
- Produces: `isFreshLiveTip({ isFollowingLive, tipHeight, lastAnimatedHeight }) => boolean` — used by Task 8 (Live.jsx wiring) to decide whether to bump the new-block-pulse counter.
- Produces: `categoriesToPulse(summary) => string[]` (subset of `['reward','deploy','p2p','confirm']`) — used by Task 8 to pass `pulseCategories` down to `FlowCanvas` → `ActivityCard`/`FlowConnectors`.
- Consumes: nothing new (same shape of `summary` as `buildBlockFlowSummary`'s return value, already defined in `blockFlowSummary.js`).

- [ ] **Step 1: Write the failing tests**

Append to `client/src/live/blockAnimation.test.js`:

```js
import { mergeIncomingBlocks, removeLeavingBlock, isFreshLiveTip, categoriesToPulse } from './blockAnimation';

// ... (existing describe blocks unchanged above this point)

describe('isFreshLiveTip', () => {
  it('is false when not following live, regardless of height difference', () => {
    expect(isFreshLiveTip({ isFollowingLive: false, tipHeight: 106, lastAnimatedHeight: 105 })).toBe(false);
  });

  it('is false when there is no tip yet', () => {
    expect(isFreshLiveTip({ isFollowingLive: true, tipHeight: null, lastAnimatedHeight: null })).toBe(false);
  });

  it('is true on first load (no prior animated height)', () => {
    expect(isFreshLiveTip({ isFollowingLive: true, tipHeight: 100, lastAnimatedHeight: null })).toBe(true);
  });

  it('is false when the tip is unchanged from an ordinary poll', () => {
    expect(isFreshLiveTip({ isFollowingLive: true, tipHeight: 100, lastAnimatedHeight: 100 })).toBe(false);
  });

  it('is true when a genuinely new height lands', () => {
    expect(isFreshLiveTip({ isFollowingLive: true, tipHeight: 101, lastAnimatedHeight: 100 })).toBe(true);
  });
});

describe('categoriesToPulse', () => {
  it('returns an empty list for a null summary', () => {
    expect(categoriesToPulse(null)).toEqual([]);
  });

  it('returns an empty list when every category is empty', () => {
    const summary = {
      rewards: { count: 0 }, deployments: { count: 0 }, p2p: { count: 0 }, confirmations: { count: 0 },
    };
    expect(categoriesToPulse(summary)).toEqual([]);
  });

  it('returns only the categories with actual activity, in canvas order', () => {
    const summary = {
      rewards: { count: 4 }, deployments: { count: 0 }, p2p: { count: 2 }, confirmations: { count: 18 },
    };
    expect(categoriesToPulse(summary)).toEqual(['reward', 'p2p', 'confirm']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test blockAnimation --watchAll=false`
Expected: FAIL — `isFreshLiveTip`/`categoriesToPulse` are not exported.

- [ ] **Step 3: Implement**

Add to `client/src/live/blockAnimation.js`, above the existing module doc comment's closing (append at end of file, after `removeLeavingBlock`):

```js
// Spec §25: "If the same block is fetched again: no new-block animation."
// `lastAnimatedHeight` is a ref the caller (Live.jsx) updates only when
// `isFollowingLive` is true, so viewing history never advances it — meaning
// returning to live after a real new block arrived still reports fresh here,
// while returning to an unchanged tip does not (spec §30).
export function isFreshLiveTip({ isFollowingLive, tipHeight, lastAnimatedHeight }) {
  return Boolean(isFollowingLive) && tipHeight != null && tipHeight !== lastAnimatedHeight;
}

// Spec §24: "Only categories containing actual activity should animate."
// Fixed canvas order (matches FlowCanvas's own CARD_KEYS) so callers can rely
// on it for deterministic staggered-delay indexing if ever needed.
export function categoriesToPulse(summary) {
  if (!summary) return [];
  const active = [];
  if (summary.rewards?.count) active.push('reward');
  if (summary.deployments?.count) active.push('deploy');
  if (summary.p2p?.count) active.push('p2p');
  if (summary.confirmations?.count) active.push('confirm');
  return active;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test blockAnimation --watchAll=false`
Expected: PASS, all `blockAnimation` tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/blockAnimation.js client/src/live/blockAnimation.test.js
git commit -m "feat(live): add isFreshLiveTip and categoriesToPulse pure helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 2: Expand/collapse toggle reducer (pure logic)

**Files:**
- Create: `client/src/live/flowInteraction.js`
- Create: `client/src/live/flowInteraction.test.js`

**Interfaces:**
- Produces: `toggleExpandedCategory(current, clicked) => string | null` — used by Task 8 (`Live.jsx`'s card-click handler) and directly satisfies spec §71's "clicking expands / clicking again collapses / clicking another switches" test list.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `client/src/live/flowInteraction.test.js`:

```js
import { toggleExpandedCategory } from './flowInteraction';

describe('toggleExpandedCategory', () => {
  it('expands a category from no selection', () => {
    expect(toggleExpandedCategory(null, 'reward')).toBe('reward');
  });

  it('collapses when the same category is clicked again', () => {
    expect(toggleExpandedCategory('reward', 'reward')).toBeNull();
  });

  it('switches to the newly clicked category when a different one was already expanded', () => {
    expect(toggleExpandedCategory('reward', 'deploy')).toBe('deploy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && CI=true npx react-scripts test flowInteraction --watchAll=false`
Expected: FAIL — `flowInteraction.js` does not exist yet.

- [ ] **Step 3: Implement**

Create `client/src/live/flowInteraction.js`:

```js
/*
 * Pure state-transition logic for the flow canvas's single-expanded-card
 * model (spec §12: "Only one card can be expanded at a time... Clicking the
 * same card again collapses. Clicking another card switches expansion.").
 * Kept free of React so it's cheap to unit test — the actual state lives in
 * Live.jsx (spec §68's suggested `expandedCategory` state), which calls this
 * on every card click. Escape/click-outside/block-change collapse are a
 * direct `setExpandedCategory(null)` at the call site, not routed through
 * here — there's no decision to make in that case, just a reset.
 */
export function toggleExpandedCategory(current, clicked) {
  return current === clicked ? null : clicked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && CI=true npx react-scripts test flowInteraction --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/flowInteraction.js client/src/live/flowInteraction.test.js
git commit -m "feat(live): add toggleExpandedCategory pure reducer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 3: `p2p.transfers` in `buildBlockFlowSummary`

The expanded P2P card (spec §17) needs individual From → To rows, which the
current summary shape doesn't carry (only `count`/`totalFlux`). This task adds
them as plain derived data — no new API request (spec §33/§69).

**Files:**
- Modify: `client/src/live/blockFlowSummary.js`
- Modify: `client/src/live/blockFlowSummary.test.js`

**Interfaces:**
- Produces: `summary.p2p.transfers: Array<{ id, from, to, amount }>` (in original event order) — consumed by Task 5 (`ActivityCard`'s expanded P2P body, via `FlowCanvas`'s `cardContentFor`).
- Consumes: nothing new (`event.type === 'p2p'` events already carry `id`/`from`/`to`/`amount`, per `DetailsPanel`'s existing `P2pRow`).

- [ ] **Step 1: Write the failing test**

In `client/src/live/blockFlowSummary.test.js`, update the two existing assertions that construct an exact `p2p` shape, and add one new test. Replace:

```js
    it('summarizes an empty block (no events) with all-zero counts and empty lists', () => {
    const summary = buildBlockFlowSummary({ height: 100, hash: 'h100', at: 123, events: [] });
    expect(summary).toEqual({
      height: 100,
      hash: 'h100',
      at: 123,
      rewards: { count: 0, totalFlux: 0, tiers: [] },
      deployments: { count: 0, instances: 0, apps: [] },
      p2p: { count: 0, totalFlux: 0 },
      confirmations: { count: 0, byTier: [] },
    });
  });
```

with:

```js
    it('summarizes an empty block (no events) with all-zero counts and empty lists', () => {
    const summary = buildBlockFlowSummary({ height: 100, hash: 'h100', at: 123, events: [] });
    expect(summary).toEqual({
      height: 100,
      hash: 'h100',
      at: 123,
      rewards: { count: 0, totalFlux: 0, tiers: [] },
      deployments: { count: 0, instances: 0, apps: [] },
      p2p: { count: 0, totalFlux: 0, transfers: [] },
      confirmations: { count: 0, byTier: [] },
    });
  });
```

And replace:

```js
  it('sums P2P count and total', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [p2pEvent('p1', 8), p2pEvent('p2', 4.42)] };
    const summary = buildBlockFlowSummary(block);
    expect(summary.p2p.count).toBe(2);
    expect(summary.p2p.totalFlux).toBeCloseTo(12.42);
  });
```

with:

```js
  it('sums P2P count and total, and lists individual transfers in order', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [p2pEvent('p1', 8), p2pEvent('p2', 4.42)] };
    const summary = buildBlockFlowSummary(block);
    expect(summary.p2p.count).toBe(2);
    expect(summary.p2p.totalFlux).toBeCloseTo(12.42);
    expect(summary.p2p.transfers).toEqual([
      { id: 'p1', from: 'a', to: 'b', amount: 8 },
      { id: 'p2', from: 'a', to: 'b', amount: 4.42 },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test blockFlowSummary --watchAll=false`
Expected: FAIL — both updated assertions fail (`transfers` is `undefined`, not `[]`/the expected array).

- [ ] **Step 3: Implement**

In `client/src/live/blockFlowSummary.js`, replace `summarizeP2p`:

```js
function summarizeP2p(events) {
  const transfers = events
    .filter((e) => e.type === 'p2p')
    .map((e) => ({ id: e.id, from: e.from, to: e.to, amount: e.amount }));
  return {
    count: transfers.length,
    totalFlux: transfers.reduce((sum, t) => sum + t.amount, 0),
    transfers,
  };
}
```

(No other function in this file changes — `count`/`totalFlux` are now derived from the same `transfers` array rather than re-filtering, which also removes the previous double-filter.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test blockFlowSummary --watchAll=false`
Expected: PASS, all `blockFlowSummary` tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/blockFlowSummary.js client/src/live/blockFlowSummary.test.js
git commit -m "feat(live): add individual transfers to p2p summary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 4: `ActivityCard` becomes a real interactive, expandable element

This is the biggest task: `ActivityCard` gains click/keyboard handling, an
expanded/dimmed visual state, and outward quadrant-specific growth. The
per-category expanded *content* (rewards/deployments/p2p/confirmations rows)
is Task 5 — this task wires the chrome and renders a placeholder body so it's
independently testable/reviewable (spec §12–14).

**Files:**
- Modify: `client/src/live/ActivityCard/index.jsx`
- Modify: `client/src/live/ActivityCard/index.scss`

**Interfaces:**
- Consumes: existing props (`quadrant`, `def`, `count`, `primary`, `secondary`, `emptyLabel`) plus new props this task adds: `isExpanded: boolean`, `isDimmed: boolean`, `isPulsing: boolean`, `onToggle: () => void`, `expandedBody: React.ReactNode` (Task 5 fills this in; this task just renders whatever it's given inside the expanded branch).
- Produces: no change to the ref contract — `FlowCanvas` still does `ref={cardRefs[key]}` for `FlowConnectors`' measurement (unchanged from Session A).

- [ ] **Step 1: Replace `client/src/live/ActivityCard/index.jsx`**

```jsx
import React from 'react';
import { ChevronRight } from 'lucide-react';
import './index.scss';

/*
 * One of the four fixed activity nodes around the central block. Real
 * interactive element (spec §51: Tab/Enter/Space/Escape, visible focus) —
 * mirrors ChainRail's ChainBlock role="button"/tabIndex/onKeyDown pattern
 * for consistency with the only other clickable list-item in this page.
 * Escape and click-outside collapse are handled by the caller (Live.jsx /
 * FlowCanvas), not here — this component only owns "clicking *this* card".
 *
 * Expanded content itself (the per-category rows) is supplied by the caller
 * as `expandedBody` — FlowCanvas's cardContentFor (Task 5) builds it from
 * buildBlockFlowSummary's data. This component owns only the chrome: the
 * quadrant-outward growth, dim/highlight states, and the click/keyboard
 * plumbing (spec §66: "ActivityCard: Owns category summary and expansion
 * presentation").
 */
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, def, count, primary, secondary, emptyLabel, isExpanded, isDimmed, isPulsing, onToggle = () => {}, expandedBody },
  ref
) {
  const Icon = def.Icon;
  const isEmpty = !count;

  // `onToggle` defaults to a no-op above: FlowCanvas doesn't actually wire a
  // real handler into this prop until Task 5 (and Live.jsx doesn't own real
  // expandedCategory state until Task 9) — without this default, clicking a
  // card between this task and Task 5 landing would throw ("onToggle is not
  // a function") rather than just harmlessly doing nothing yet.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleClick = (e) => {
    // Stops this from also bubbling to FlowCanvas's click-outside-collapses
    // handler (spec §12: "Clicking empty canvas collapses" — a card click is
    // never "empty canvas").
    e.stopPropagation();
    onToggle();
  };

  const classes = [
    'live-flow-card',
    `live-flow-card--${quadrant}`,
    isEmpty && 'live-flow-card--empty',
    isExpanded && 'live-flow-card--expanded',
    isDimmed && 'live-flow-card--dimmed',
    isPulsing && 'live-flow-card--pulse',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      ref={ref}
      style={{ '--card-accent': def.color }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${def.label}, ${count} — ${isExpanded ? 'expanded, activate to collapse' : 'activate to expand'}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="live-flow-card-header">
        <span className="live-flow-card-icon">
          <Icon size={15} />
        </span>
        <span className="live-flow-card-label">{def.label}</span>
        <span className="live-flow-card-count">{count}</span>
      </div>

      {isExpanded ? (
        <div className="live-flow-card-expanded-body">{expandedBody}</div>
      ) : isEmpty ? (
        <div className="live-flow-card-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="live-flow-card-primary">{primary}</div>
          {secondary && <div className="live-flow-card-secondary">{secondary}</div>}
        </>
      )}

      <ChevronRight
        size={14}
        className={`live-flow-card-chevron${isExpanded ? ' live-flow-card-chevron--open' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
});
```

- [ ] **Step 2: Replace `client/src/live/ActivityCard/index.scss`**

```scss
.live-flow-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 300px;
  min-height: 145px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: width 320ms ease, min-height 320ms ease, transform 320ms ease,
    box-shadow 320ms ease, border-color 320ms ease, opacity 320ms ease;

  &:focus-visible {
    outline: 2px solid var(--card-accent);
    outline-offset: 2px;
  }
}

.live-flow-card--top-left { grid-area: reward; }
.live-flow-card--top-right { grid-area: deploy; }
.live-flow-card--bottom-left { grid-area: p2p; }
.live-flow-card--bottom-right { grid-area: confirm; }

// Hover relationship (spec §19): card lifts 1-2px, border/icon brighten. Its
// matching connector/block-halo reactions live in FlowConnectors'/FlowBlock's
// own SCSS via :has(), since those are different elements in the DOM tree.
.live-flow-card:hover:not(.live-flow-card--expanded) {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--card-accent) 45%, var(--border-primary));
}

// ── Expansion (spec §12-14) ──────────────────────────────────────────────
// Growth happens via width/min-height (real layout, not scale — content
// structurally changes between compact and expanded, so faking it with
// `transform: scale()` would distort text/rows rather than reveal them).
// The `transform: translate(...)` per quadrant below is purely visual
// (spec §13: "expansion must be outward") and doesn't affect anything's
// measured layout box, so it composites cheaply alongside the width/height
// transition already running.
.live-flow-card--expanded {
  width: 420px;
  max-width: 420px;
  min-height: 320px;
  z-index: 5;
  box-shadow: var(--shadow-md), 0 0 24px color-mix(in srgb, var(--card-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--card-accent) 55%, var(--border-primary));
  cursor: default;
}

.live-flow-card--expanded.live-flow-card--top-left { transform: translate(-24px, -24px); }
.live-flow-card--expanded.live-flow-card--top-right { transform: translate(24px, -24px); }
.live-flow-card--expanded.live-flow-card--bottom-left { transform: translate(-24px, 24px); }
.live-flow-card--expanded.live-flow-card--bottom-right { transform: translate(24px, 24px); }

// Spec §12 point 3: "dims other cards slightly" — spec §14 recommends
// roughly 0.65-0.8; not applied to the expanded card itself or while nothing
// is expanded (isDimmed is only ever true on the three non-expanded cards).
.live-flow-card--dimmed {
  opacity: 0.72;
}

.live-flow-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-flow-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--card-accent);
  background: color-mix(in srgb, var(--card-accent) 16%, transparent);
  transition: filter 320ms ease;
}

.live-flow-card:hover .live-flow-card-icon,
.live-flow-card--expanded .live-flow-card-icon {
  filter: brightness(1.25);
}

.live-flow-card-label {
  flex: 1;
  font-size: var(--live-fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.live-flow-card-count {
  font-size: var(--live-fs-md);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.live-flow-card-primary {
  font-size: var(--live-fs-lg);
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.live-flow-card-secondary {
  font-size: var(--live-fs-sm);
  color: var(--text-tertiary);
}

.live-flow-card-empty {
  font-size: var(--live-fs-sm);
  color: var(--text-tertiary);
  font-style: italic;
  flex: 1;
}

.live-flow-card-expanded-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
}

.live-flow-card-chevron {
  position: absolute;
  bottom: 12px;
  right: 14px;
  color: var(--text-tertiary);
  opacity: 0.6;
  transition: transform 320ms ease;
}

.live-flow-card-chevron--open {
  transform: rotate(90deg);
}

// ── New-block pulse highlight (spec §24 T+300-850ms) ─────────────────────
// Keyed by the caller re-mounting this element (via a changing `key` on the
// pulse counter — see FlowCanvas Task) so this only plays once per genuine
// new block, never on an ordinary re-render (spec §25).
@keyframes live-card-pulse {
  0% { box-shadow: var(--shadow-sm); border-color: var(--border-primary); }
  40% { box-shadow: var(--shadow-md), 0 0 16px color-mix(in srgb, var(--card-accent) 30%, transparent); border-color: color-mix(in srgb, var(--card-accent) 60%, var(--border-primary)); }
  100% { box-shadow: var(--shadow-sm); border-color: var(--border-primary); }
}

.live-flow-card--pulse {
  animation: live-card-pulse 550ms ease-out 300ms backwards;
}

@media (prefers-reduced-motion: reduce) {
  .live-flow-card {
    transition: opacity 150ms ease;
  }
  .live-flow-card--expanded { transform: none; }
  .live-flow-card:hover:not(.live-flow-card--expanded) { transform: none; }
  .live-flow-card--pulse { animation: none; }
}

@media (max-width: 1199px) {
  .live-flow-card {
    min-height: 120px;
    padding: 12px 14px;
  }

  .live-flow-card-primary {
    font-size: var(--live-fs-md);
  }

  .live-flow-card--expanded {
    width: 100%;
    max-width: 340px;
    min-height: 260px;
  }

  .live-flow-card--expanded.live-flow-card--top-left,
  .live-flow-card--expanded.live-flow-card--top-right,
  .live-flow-card--expanded.live-flow-card--bottom-left,
  .live-flow-card--expanded.live-flow-card--bottom-right {
    transform: none;
  }
}
```

- [ ] **Step 3: Manual verification (no automated test — pure UI wiring, per this plan's Global Constraints testing-convention note)**

Run: `cd client && yarn start`, open `/live`. Confirm: clicking a card grows it outward without expandedBody content yet (still `undefined` until Task 5 — fine, the expanded box should just show empty/blank where the body will go); clicking it again collapses it; Tab reaches each card with a visible focus ring; Enter/Space toggle expansion; hovering a non-expanded card lifts it slightly.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/ActivityCard/index.jsx client/src/live/ActivityCard/index.scss
git commit -m "feat(live): make ActivityCard a real interactive, expandable element

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 5: Per-category expanded content + `FlowCanvas` wiring

Adds the four expanded-body renderers (spec §15–18) inside `ActivityCard`
(same file — mirrors `DetailsPanel/index.jsx`'s existing `RewardRow`/`P2pRow`/
`DeployRow`/`ConfirmRow` + `ROW_COMPONENT` map pattern exactly, just for
expanded-card bodies instead of detail-panel rows) and extends `FlowCanvas`'s
`cardContentFor` to build the data each one needs.

**Files:**
- Modify: `client/src/live/ActivityCard/index.jsx`
- Modify: `client/src/live/FlowCanvas/index.jsx`

**Interfaces:**
- Consumes: `summary.rewards.tiers[]` (`{tier,label,color,amount,address}`), `summary.deployments.apps[]` (`{name,instances,cpuPerInst,ramGBPerInst,ssdGBPerInst,category,owner}`), `summary.p2p.transfers[]` (`{id,from,to,amount}`, from Task 3), `summary.confirmations.byTier[]` (`{tier,label,color,count}`) — all already produced by `blockFlowSummary.js`.
- Produces: `cardContentFor` now also returns `expandedBody` (a React node) per card, consumed by `ActivityCard` (Task 4's `expandedBody` prop).

- [ ] **Step 1: Add expanded-body renderers to `client/src/live/ActivityCard/index.jsx`**

Add near the top of the file, after the imports (`React`, `ChevronRight`, `'./index.scss'`):

```jsx
function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

// Spec §15: all four tiers (incl. Dev Fund) with amount + address.
function RewardExpandedBody({ summary }) {
  const { totalFlux, tiers } = summary.rewards;
  return (
    <>
      <div className="live-flow-expanded-total">{totalFlux.toFixed(2)} FLUX total</div>
      {tiers.map((t) => (
        <div key={t.tier} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-label" style={{ color: t.color }}>{t.label}</span>
          <span className="live-flow-expanded-row-value">{t.amount.toFixed(2)} FLUX</span>
          <span className="live-flow-expanded-row-sub" title={t.address}>{truncateAddr(t.address)}</span>
        </div>
      ))}
    </>
  );
}

// Spec §16: representative apps with resource specs; explicit non-claim
// wording about deployment-vs-block timing (spec §36).
function DeployExpandedBody({ summary }) {
  const { apps } = summary.deployments;
  return (
    <>
      {apps.map((a) => (
        <div key={a.name} className="live-flow-expanded-row live-flow-expanded-row--stacked">
          <div className="live-flow-expanded-row-head">
            <span className="live-flow-expanded-row-label">{a.name}</span>
            {a.instances > 1 && <span className="live-flow-expanded-badge">{a.instances}×</span>}
          </div>
          <span className="live-flow-expanded-row-sub">
            {a.cpuPerInst ?? '—'} vCPU · {a.ramGBPerInst ?? '—'} GB · {a.ssdGBPerInst ?? '—'} GB
          </span>
        </div>
      ))}
      <div className="live-flow-expanded-note">
        Deployment data is observed from the network and may appear shortly after block confirmation.
      </div>
    </>
  );
}

// Spec §17: From → To rows for a representative subset, "View all" for the
// rest — "View all" here just means "see DetailsPanel below" (the full
// scroll/focus wiring is Session C's job, spec §38; this session's affordance
// is honest about that rather than pretending to jump anywhere).
const P2P_EXPANDED_VISIBLE = 3;
function P2pExpandedBody({ summary }) {
  const { totalFlux, transfers } = summary.p2p;
  const visible = transfers.slice(0, P2P_EXPANDED_VISIBLE);
  const remaining = transfers.length - visible.length;
  return (
    <>
      <div className="live-flow-expanded-total">{totalFlux.toFixed(4)} FLUX moved</div>
      {visible.map((t) => (
        <div key={t.id} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-sub" title={t.from}>{truncateAddr(t.from)}</span>
          <span aria-hidden="true">→</span>
          <span className="live-flow-expanded-row-sub" title={t.to}>{truncateAddr(t.to)}</span>
          <span className="live-flow-expanded-row-value">{t.amount.toFixed(4)} FLUX</span>
        </div>
      ))}
      {remaining > 0 && <div className="live-flow-expanded-note">+{remaining} more — see full details below</div>}
    </>
  );
}

// Spec §18: tier breakdown + a "network reach" line — deliberately not
// dumping all 18+ rows into the card (spec's own instruction); representative
// per-node rows are marked optional by the spec and are skipped here in
// favor of the tier summary, which is the one thing every block has.
function ConfirmExpandedBody({ summary }) {
  const { count, byTier } = summary.confirmations;
  return (
    <>
      {byTier.map((t) => (
        <div key={t.tier} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-label" style={{ color: t.color }}>{t.label}</span>
          <span className="live-flow-expanded-row-value">{t.count}</span>
        </div>
      ))}
      <div className="live-flow-expanded-note">Network reach: {count} confirmation{count === 1 ? '' : 's'}</div>
    </>
  );
}

const EXPANDED_BODY_COMPONENT = {
  reward: RewardExpandedBody,
  deploy: DeployExpandedBody,
  p2p: P2pExpandedBody,
  confirm: ConfirmExpandedBody,
};
```

Then change `ActivityCard`'s signature and expanded branch to build the body
itself from `summary`/`categoryKey` rather than receiving a pre-built node —
simpler prop surface, and keeps the four renderers' dispatch logic co-located
with their definitions (same reasoning as `DetailsPanel`'s `ROW_COMPONENT`
map). Replace the destructured props and the `isExpanded` render branch:

```jsx
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, categoryKey, def, count, primary, secondary, emptyLabel, summary, isExpanded, isDimmed, isPulsing, onToggle },
  ref
) {
```

```jsx
      {isExpanded ? (
        <div className="live-flow-card-expanded-body">
          {(() => {
            const ExpandedBody = EXPANDED_BODY_COMPONENT[categoryKey];
            return <ExpandedBody summary={summary} />;
          })()}
        </div>
      ) : isEmpty ? (
```

(`aria-label` in Step 1 of Task 4 already reads `def.label`/`count`/`isExpanded` — unchanged.)

- [ ] **Step 2: Simplify `cardContentFor` in `client/src/live/FlowCanvas/index.jsx`**

`cardContentFor` no longer needs to build `expandedBody` itself (that moved
into `ActivityCard`, keyed by `categoryKey`) — it still builds the *compact*
`count`/`primary`/`secondary`/`emptyLabel` shape exactly as Session A left it.
No change needed to `cardContentFor`'s body. Instead, update the `.map` in
`FlowCanvas` that renders each `<ActivityCard>` to also pass `categoryKey` and
`summary`:

```jsx
      {CARD_KEYS.map((key) => {
        const content = cardContentFor(key, summary);
        return (
          <ActivityCard
            key={key}
            ref={cardRefs[key]}
            quadrant={QUADRANT_BY_KEY[key]}
            categoryKey={key}
            def={SECTION_BY_KEY[key]}
            count={content.count}
            primary={content.primary}
            secondary={content.secondary}
            emptyLabel={content.emptyLabel}
            summary={summary}
            isExpanded={expandedCategory === key}
            isDimmed={expandedCategory != null && expandedCategory !== key}
            isPulsing={pulseCategories.includes(key) && pulseKey > 0}
            onToggle={() => onToggleCategory(key)}
          />
        );
      })}
```

This introduces four new props `FlowCanvas` itself must now accept:
`expandedCategory`, `onToggleCategory`, `pulseCategories`, `pulseKey` — update
`FlowCanvas`'s own function signature:

```jsx
export function FlowCanvas({ block, summary, expandedCategory, onToggleCategory, pulseCategories, pulseKey }) {
```

(`pulseCategories`/`pulseKey` are threaded further into `FlowBlock`/
`FlowConnectors` in Tasks 6–7; `expandedCategory`/`onToggleCategory` are fully
wired here. Task 8 supplies real values from `Live.jsx`; until then, existing
callers of `FlowCanvas` that don't pass these props get `undefined` —
`pulseCategories.includes` would throw on `undefined`, so default it:)

```jsx
export function FlowCanvas({ block, summary, expandedCategory = null, onToggleCategory = () => {}, pulseCategories = [], pulseKey = 0 }) {
```

- [ ] **Step 3: Manual verification (no automated test — same convention note as Task 4; the four renderers are presentation-only, and their inputs — `tiers`/`apps`/`transfers`/`byTier` — are already fully covered by Task 3's and Session A's `blockFlowSummary.test.js`)**

Run: `cd client && yarn start`, open `/live`. Expand each of the four cards
in turn against a block with real activity (the live tip usually has at
least reward + confirmation activity) and confirm the rows match spec
§15/§18 (rewards show all tiers with addresses; confirmations show tier
counts + network reach). If the current tip has no P2P/deployments, force
it by selecting an older block from the chain rail until one with that
activity is visible, or temporarily log `summary` to the console to inspect
a block with all four categories populated.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/ActivityCard/index.jsx client/src/live/FlowCanvas/index.jsx
git commit -m "feat(live): per-category expanded card content

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 6: Expanded-body row styling + hover cross-highlight (card → connector → block)

**Files:**
- Modify: `client/src/live/ActivityCard/index.scss`

**Interfaces:** none new — pure styling for the markup Task 5 added, plus the
`:has()` cross-highlight rules that reach into `FlowConnectors`/`FlowBlock`
(those two components render no new classes for this — the selectors below
target their *existing* Session A class names directly).

- [ ] **Step 1: Append to `client/src/live/ActivityCard/index.scss`**

```scss
.live-flow-expanded-total {
  font-size: var(--live-fs-lg);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.live-flow-expanded-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--live-fs-base);
  color: var(--text-secondary);
  padding: 6px 0;
  border-bottom: 1px solid var(--border-primary);

  &:last-of-type { border-bottom: none; }
}

.live-flow-expanded-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.live-flow-expanded-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-flow-expanded-row-label {
  font-weight: 600;
  flex: 1;
}

.live-flow-expanded-row-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.live-flow-expanded-row-sub {
  font-size: var(--live-fs-sm);
  color: var(--text-tertiary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-flow-expanded-badge {
  font-size: var(--live-fs-xs);
  font-weight: 700;
  color: var(--text-tertiary);
  background: var(--surface-inset);
  border-radius: 4px;
  padding: 1px 6px;
}

.live-flow-expanded-note {
  font-size: var(--live-fs-sm);
  color: var(--text-tertiary);
  font-style: italic;
  padding-top: 4px;
}

// ── Hover relationship (spec §19) ─────────────────────────────────────────
// The card's own lift/border-brighten lives in ActivityCard's own :hover
// rule above (Task 4). These reach across to the SVG connector and central
// block, which are *sibling* elements under the same .live-flow-canvas
// container (see FlowCanvas/index.jsx) — CSS :has() lets a hover on one
// child style another without any extra React state or re-render, keeping
// hover response effectively instant (spec §50: "input → response under
// ~100ms").
.live-flow-canvas:has(.live-flow-card--top-left:hover:not(.live-flow-card--expanded)) .live-flow-connector--reward {
  opacity: 0.9;
  stroke-width: 2.5;
}
.live-flow-canvas:has(.live-flow-card--top-right:hover:not(.live-flow-card--expanded)) .live-flow-connector--deploy {
  opacity: 0.9;
  stroke-width: 2.5;
}
.live-flow-canvas:has(.live-flow-card--bottom-left:hover:not(.live-flow-card--expanded)) .live-flow-connector--p2p {
  opacity: 0.9;
  stroke-width: 2.5;
}
.live-flow-canvas:has(.live-flow-card--bottom-right:hover:not(.live-flow-card--expanded)) .live-flow-connector--confirm {
  opacity: 0.9;
  stroke-width: 2.5;
}

// A tiny matching halo on the central block (spec §19: "central block gets a
// tiny matching halo") — one rule per category since each needs its own
// halo color; reuses categoryMeta.js's own colors (duplicated as hex here,
// same convention tierMeta.js documents for the same reason: can't read a
// CSS custom property into these selectors from JS).
.live-flow-canvas:has(.live-flow-card--top-left:hover:not(.live-flow-card--expanded)) .live-flow-block {
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent), 0 0 0 2px color-mix(in srgb, #3b82f6 35%, transparent);
}
.live-flow-canvas:has(.live-flow-card--top-right:hover:not(.live-flow-card--expanded)) .live-flow-block {
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent), 0 0 0 2px color-mix(in srgb, #22c55e 35%, transparent);
}
.live-flow-canvas:has(.live-flow-card--bottom-left:hover:not(.live-flow-card--expanded)) .live-flow-block {
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent), 0 0 0 2px color-mix(in srgb, #8b93a6 35%, transparent);
}
.live-flow-canvas:has(.live-flow-card--bottom-right:hover:not(.live-flow-card--expanded)) .live-flow-block {
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent), 0 0 0 2px color-mix(in srgb, #eab308 35%, transparent);
}

@media (max-width: 899px) {
  // Connectors are already hidden below 900px (Session A, spec §48) and
  // hover is not a mobile concept — the :has() rules above are harmless
  // no-ops there, nothing further to override.
}
```

- [ ] **Step 2: Manual verification (visual — CSS-only, no automated test)**

Run: `cd client && yarn start`, open `/live`. Hover each of the four cards
(not expanded): confirm its connector brightens/thickens and the central
block gets a faint matching halo, and that this stops the instant the mouse
leaves. Confirm hovering an *expanded* card does nothing extra (the
`:not(.live-flow-card--expanded)` guard).

- [ ] **Step 3: Commit**

```bash
git add client/src/live/ActivityCard/index.scss
git commit -m "style(live): expanded-body row styling and hover cross-highlight

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 7: `FlowConnectors` — expanded + new-block-pulse states

**Files:**
- Modify: `client/src/live/FlowConnectors/index.jsx`
- Modify: `client/src/live/FlowConnectors/index.scss`

**Interfaces:**
- Consumes: new props `expandedCategory` (string|null), `pulseCategories` (string[], from Task 1's `categoriesToPulse`), `pulseKey` (number, from Task 8).
- Produces: no change to `paths` measurement logic.

- [ ] **Step 1: Modify `client/src/live/FlowConnectors/index.jsx`**

Change the function signature and the `<path>` rendering:

```jsx
export function FlowConnectors({ containerRef, blockRef, cardRefs, colors, expandedCategory = null, pulseCategories = [], pulseKey = 0 }) {
```

Replace the return statement's `.map`:

```jsx
  return (
    <svg className="live-flow-connectors" aria-hidden="true">
      {CONNECTOR_ORDER.map((key) => {
        if (!paths[key]) return null;
        const isExpanded = key === expandedCategory;
        const isPulsing = pulseCategories.includes(key);
        const classes = [
          'live-flow-connector',
          `live-flow-connector--${key}`,
          isExpanded && 'live-flow-connector--expanded',
        ].filter(Boolean).join(' ');
        return (
          <path
            // Remounts (replaying the pulse keyframe) only when this
            // specific category is both active this block AND pulseKey has
            // advanced — every other poll keeps the same key, so the path
            // updates in place with no replay (spec §25).
            key={isPulsing ? `${key}-pulse-${pulseKey}` : key}
            className={isPulsing ? `${classes} live-flow-connector--pulse` : classes}
            d={paths[key]}
            pathLength="100"
            style={{ '--connector-color': colors?.[key] }}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Wire the new props from `FlowCanvas`**

`FlowConnectors` cannot receive `expandedCategory`/`pulseCategories`/
`pulseKey` unless its caller passes them. In `client/src/live/FlowCanvas/
index.jsx`, update the `<FlowConnectors>` call site:

```jsx
      <FlowConnectors
        containerRef={containerRef}
        blockRef={blockRef}
        cardRefs={cardRefs}
        colors={colors}
        expandedCategory={expandedCategory}
        pulseCategories={pulseCategories}
        pulseKey={pulseKey}
      />
```

(`expandedCategory`/`pulseCategories`/`pulseKey` are already parameters of
`FlowCanvas` itself, added in Task 5 Step 2 — this just forwards them one
level further down.)

- [ ] **Step 3: Append to `client/src/live/FlowConnectors/index.scss`**

```scss
.live-flow-connector--expanded {
  opacity: 0.95;
  stroke-width: 2.5;
}

// Spec §22 "New block: One short travelling pulse." `pathLength="100"` (set
// in the JSX above) normalizes stroke-dasharray/offset to a 0-100 scale
// regardless of this path's actual geometric length, so one keyframe works
// for all four (slightly different) Bézier curves.
@keyframes live-connector-pulse {
  0% { stroke-dashoffset: 100; opacity: 0.9; stroke-width: 3; }
  100% { stroke-dashoffset: -40; opacity: 0.45; stroke-width: 1.5; }
}

.live-flow-connector--pulse {
  stroke-dasharray: 16 84;
  animation: live-connector-pulse 350ms ease-out 150ms backwards;
}

@media (prefers-reduced-motion: reduce) {
  .live-flow-connector--pulse {
    animation: none;
    stroke-dasharray: none;
  }
}
```

- [ ] **Step 4: Manual verification (visual — no automated test; geometry/measurement logic is unchanged from Session A, which has no test file for this component either, matching the established per-component-vs-per-pure-function testing split)**

Note: the new-block pulse itself only fires once Task 9 wires `pulseKey`
from `Live.jsx`'s real `isFreshLiveTip` check — before that, `pulseKey`
stays `0` (FlowCanvas's default) and no pulse plays yet. If Task 9 hasn't
run yet when this task executes, just confirm the expanded-state connector
strengthening and that nothing throws/renders incorrectly with a static
`pulseKey`; the pulse itself gets verified for real in Task 11's final pass.

Run: `cd client && yarn start`, open `/live`. Expand a card and confirm its
connector visibly strengthens relative to the other three. If Task 9 has
already run, wait for (or force, see Task 9's verification note) a genuine
new block and confirm the active categories' connectors show a brief
traveling pulse while empty categories' connectors do not animate at all.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/FlowConnectors/index.jsx client/src/live/FlowConnectors/index.scss client/src/live/FlowCanvas/index.jsx
git commit -m "feat(live): connector expanded and new-block-pulse states

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 8: `FlowBlock` new-block pulse + expanded-category halo

**Files:**
- Modify: `client/src/live/FlowBlock/index.jsx`
- Modify: `client/src/live/FlowBlock/index.scss`

**Interfaces:**
- Consumes: new props `pulseKey` (number), `haloColor` (string|null — the expanded category's color, or `null` when nothing is expanded).

- [ ] **Step 1: Modify `client/src/live/FlowBlock/index.jsx`**

Change the function signature and the non-null render branch's wrapping
`<div>`:

```jsx
export const FlowBlock = React.forwardRef(function FlowBlock({ block, summary, pulseKey = 0, haloColor = null }, ref) {
```

```jsx
  return (
    <div
      className={`live-flow-block${pulseKey > 0 ? ' live-flow-block--pulse' : ''}`}
      ref={ref}
      key={pulseKey > 0 ? `pulse-${pulseKey}` : 'idle'}
      style={haloColor ? { '--flow-block-halo': haloColor } : undefined}
      title={`Block #${block.height}\nHash: ${block.hash || '—'}\nTimestamp: ${exactTimestamp(block.at)}`}
    >
```

And add a halo modifier class alongside the existing markup — change the
outer `<div>`'s className list to also include a `live-flow-block--halo`
class when `haloColor` is set:

```jsx
      className={[
        'live-flow-block',
        pulseKey > 0 && 'live-flow-block--pulse',
        haloColor && 'live-flow-block--halo',
      ].filter(Boolean).join(' ')}
```

(This replaces the single-class template-string version above — use this
array form instead, it's the only version that actually ships.)

- [ ] **Step 2: Append to `client/src/live/FlowBlock/index.scss`**

```scss
.live-flow-block--halo {
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent),
    0 0 0 2px color-mix(in srgb, var(--flow-block-halo) 40%, transparent);
}

// Spec §9/§24: "New-block glow: briefly stronger." Keyed remount (via the
// `key` prop change in FlowBlock's JSX) makes this replay exactly once per
// genuine new block — an ordinary poll re-render with the same key does not
// restart it (spec §25).
@keyframes live-block-pulse {
  0% { box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent); }
  30% { box-shadow: var(--shadow-md), 0 0 48px color-mix(in srgb, #2b61d1 35%, transparent); border-color: color-mix(in srgb, #2b61d1 55%, var(--border-primary)); }
  100% { box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent); }
}

.live-flow-block--pulse {
  animation: live-block-pulse 220ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .live-flow-block--pulse { animation: none; }
}
```

- [ ] **Step 3: Wire `haloColor` from `FlowCanvas`**

In `client/src/live/FlowCanvas/index.jsx`, update the `<FlowBlock>` call to
pass the expanded category's color and the pulse key:

```jsx
      <FlowBlock
        ref={blockRef}
        block={block}
        summary={summary}
        pulseKey={pulseKey}
        haloColor={expandedCategory ? colors[expandedCategory] : null}
      />
```

- [ ] **Step 4: Manual verification (visual — no automated test, same convention as Tasks 6-7)**

Run: `cd client && yarn start`, open `/live`. Expand a card and confirm the
central block shows a faint halo in that category's color. Wait for (or
force) a genuine new block and confirm the block's glow briefly strengthens
once, then settles back — and does not repeat on the next ordinary poll of
the same block.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/FlowBlock/index.jsx client/src/live/FlowBlock/index.scss client/src/live/FlowCanvas/index.jsx
git commit -m "feat(live): central block new-block pulse and expanded-category halo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 9: `Live.jsx` wiring — expandedCategory state, collapse triggers, new-block-pulse counter

Ties Tasks 1–8 together: this is where `expandedCategory` actually lives
(spec §68), where the three collapse triggers this session owns (Escape,
click-outside, block-change — spec §12/§57) are implemented, and where the
new-block-pulse counter is computed using Task 1's `isFreshLiveTip`.

**Files:**
- Modify: `client/src/live/Live.jsx`
- Modify: `client/src/live/FlowCanvas/index.jsx` (canvas-level click-outside handler)

**Interfaces:**
- Consumes: `isFreshLiveTip`, `categoriesToPulse` (Task 1), `toggleExpandedCategory` (Task 2).
- Produces: nothing further downstream — this is the top of the chain.

- [ ] **Step 1: Modify `client/src/live/Live.jsx` imports**

```jsx
import { mergeIncomingBlocks, removeLeavingBlock, isFreshLiveTip, categoriesToPulse } from 'live/blockAnimation';
import { toggleExpandedCategory } from 'live/flowInteraction';
```

- [ ] **Step 2: Add state and refs**

Immediately after the existing `visibleBlockCount`/`chainRailWrapperRef`
declarations:

```jsx
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [pulseKey, setPulseKey] = useState(0);
  const lastAnimatedHeightRef = useRef(null);
```

- [ ] **Step 3: Compute `isFollowingLive` and bump the pulse counter**

The existing `tipHeight`/`displayedHeight`/`displayedBlock`/`summary` block
(around the middle of the component, right after the `pollFast`
`useEffect`) already computes `tipHeight` — add right after it:

```jsx
  const isFollowingLive = selectedHeight == null;

  useEffect(() => {
    if (isFreshLiveTip({ isFollowingLive, tipHeight, lastAnimatedHeight: lastAnimatedHeightRef.current })) {
      setPulseKey((n) => n + 1);
    }
    if (isFollowingLive && tipHeight != null) lastAnimatedHeightRef.current = tipHeight;
  }, [isFollowingLive, tipHeight]);
```

- [ ] **Step 4: Collapse on block change (spec §57)**

Add a new effect right after the one added in Step 3:

```jsx
  useEffect(() => {
    setExpandedCategory(null);
  }, [displayedBlock?.height]);
```

- [ ] **Step 5: Collapse on Escape (spec §12)**

```jsx
  useEffect(() => {
    if (expandedCategory == null) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setExpandedCategory(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expandedCategory]);
```

- [ ] **Step 6: Card-click handler**

```jsx
  const handleToggleCategory = useCallback((key) => {
    setExpandedCategory((current) => toggleExpandedCategory(current, key));
  }, []);
```

- [ ] **Step 7: Wire everything into `<FlowCanvas>`**

```jsx
      <FlowCanvas
        block={displayedBlock}
        summary={summary}
        expandedCategory={expandedCategory}
        onToggleCategory={handleToggleCategory}
        pulseCategories={categoriesToPulse(summary)}
        pulseKey={pulseKey}
      />
```

- [ ] **Step 8: Click-outside-collapses on the canvas itself (spec §12)**

In `client/src/live/FlowCanvas/index.jsx`, add an `onClick` to the root
`<div className="live-flow-canvas" ...>` that collapses when the click
didn't originate from a card (cards already call `e.stopPropagation()` in
Task 4's `ActivityCard`, so this handler only ever fires for a genuine
canvas-background click):

```jsx
    <div className="live-flow-canvas" ref={containerRef} onClick={() => onToggleCategory(null)}>
```

Wait — `onToggleCategory` is currently only called with a specific category
key (`onToggle={() => onToggleCategory(key)}` in Task 5/`ActivityCard`) and
routes through `toggleExpandedCategory`'s toggle logic in `Live.jsx`'s
`handleToggleCategory`. A bare "collapse regardless of current state" call
needs its own path, not the toggle — calling `onToggleCategory(null)` would
run `toggleExpandedCategory(current, null)`, which only returns `null` when
`current === null` already (otherwise it returns `null` anyway, since
`current === clicked` is `current === null`, false when something's expanded,
so the function's `: clicked` branch returns `null` — the parameter itself).
Confirm this in Task 2's implementation: `return current === clicked ?
null : clicked;` — when `clicked` is `null` and `current` is anything else,
it returns `clicked`, i.e. `null`. So `onToggleCategory(null)` does correctly
collapse in every case. No separate handler needed — the existing toggle
function already generalizes correctly.

- [ ] **Step 9: Manual verification**

Run: `cd client && yarn start`, open `/live`.
- Click a card → expands. Click empty canvas background (not a card) →
  collapses.
- Click a card → expands. Press Escape → collapses.
- Click a card → expands. Click a different card → switches. Click the same
  card again → collapses.
- Click a card to expand it, then click a different block in the chain rail
  → expansion collapses.
- To force a genuine new-block pulse without waiting up to 30s: temporarily
  change `FAST_POLL_MS` to a smaller value (e.g. `5 * 1000`) locally, observe
  the pulse on the next real block, then revert the change before
  committing (do not commit a modified poll interval).

- [ ] **Step 10: Commit**

```bash
git add client/src/live/Live.jsx client/src/live/FlowCanvas/index.jsx
git commit -m "feat(live): wire expandedCategory state, collapse triggers, and new-block pulse

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 10: `FlowCanvas` overflow fix for expanded cards

Session A's `.live-flow-canvas` clips overflow (`overflow: hidden`) to keep
the decorative dot-grid background's corners rounded. Task 4's expanded
cards (420×320px, quadrant-translated outward) need to visually extend
beyond their grid track, which `overflow: hidden` would clip. This task
flips that without losing the rounded-corner clipping on the background
layer.

**Files:**
- Modify: `client/src/live/FlowCanvas/index.scss`

- [ ] **Step 1: Edit `client/src/live/FlowCanvas/index.scss`**

Change:

```scss
  border: 1px solid var(--border-primary);
  overflow: hidden;

  // Very subtle static network dot grid (spec §7/§47) — never animated.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, var(--border-primary) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.6;
    pointer-events: none;
  }
```

to:

```scss
  border: 1px solid var(--border-primary);
  // Expanded cards (ActivityCard's --expanded modifier) visually grow past
  // their grid track and must not be clipped — the dot-grid background
  // below gets its own border-radius instead, so this doesn't un-round the
  // canvas's corners.
  overflow: visible;

  // Very subtle static network dot grid (spec §7/§47) — never animated.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
    background-image: radial-gradient(circle, var(--border-primary) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.6;
    pointer-events: none;
  }
```

- [ ] **Step 2: Manual verification**

Run: `cd client && yarn start`, open `/live`. Expand each of the four cards
in turn and confirm none of them are visually clipped at the canvas edge,
and that the dot-grid background still shows rounded corners matching the
canvas's own border radius.

- [ ] **Step 3: Commit**

```bash
git add client/src/live/FlowCanvas/index.scss
git commit -m "fix(live): allow expanded cards to overflow the canvas grid track

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

---

### Task 11: Final integration verification

**Files:** none modified — verification only, plus doc status updates.

- [ ] **Step 1: Confirm the scope boundary held**

Run: `git diff --stat main` (from within the worktree)
Expected: every changed file is under `client/src/live/`, plus this plan
doc — no changes to Home, Nodes, Analytics, Demo, nav, auth, routing, or
`client/src/styles/_global.scss` (spec §4/§75).

- [ ] **Step 2: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, all tests green (baseline 306 + this session's new tests
from Tasks 1–3).

- [ ] **Step 3: Run the production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the same 4 pre-existing baseline warning files
(Navbar, NodeGridTable, LayoutContext, WalletNodes) — no new warnings from
any file touched this session.

- [ ] **Step 4: Manual regression + visual QA pass**

Run: `cd client && yarn start`.
- Visit `/home`, `/nodes`, `/analytics` (toggle `PREMIUM_TESTING_MODE`/
  `TESTING` in `client/public/runtime/app-content.js` temporarily if needed
  to reach it — revert before committing anything, confirm `git status`
  clean), and toggle the theme switcher — confirm all three are visually
  unaffected (spec §75).
- On `/live`: re-run every interaction check from Tasks 4–9's manual
  verification steps once more, together, in one sitting (expand/collapse/
  switch/Escape/click-outside/block-change/keyboard/hover/new-block pulse).
- Resize the browser through the four responsive breakpoints (spec §48:
  ≥1400px, 1200–1399px, 900–1199px, <900px) and confirm cards remain usable
  and expansion doesn't visually break at each width.
- Enable "reduce motion" (OS-level or `prefers-reduced-motion` via Chrome
  DevTools' Rendering tab) and confirm: no card lift/pulse/connector-pulse/
  block-pulse animations play, but expand/collapse and hover states are
  still clearly visible via the instant opacity/border changes.

- [ ] **Step 5: Update `todo.md`**

In the repo-root `todo.md`, check off Session B in the Track 1 list (find
the existing `- [ ] **Session B — Interaction + motion.**...` bullet and
change its checkbox to `[x]`, appending a `Shipped in PR #<fill in after
opening the PR> — see docs/superpowers/plans/2026-09-07-live-session-b.md
for the full task breakdown.` sentence, matching the exact convention
`todo.md`'s own Session A line already uses).

- [ ] **Step 6: Update `LIVE_REDESIGN_PLAN.md`**

Check off Session B in the "Build order" list near the top:

```markdown
- [x] **Session B — Interaction + motion** (spec Phases 3-4, §§12-14, 19, 22, 24-25, 50-52)
```

- [ ] **Step 7: Commit the doc updates**

```bash
git add todo.md LIVE_REDESIGN_PLAN.md
git commit -m "docs: mark Live Redesign Session B complete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E1ecjdbpuwMe6F4qRJtjGU"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/live-session-b
gh pr create --base main --head feat/live-session-b \
  --title "feat(live): Session B — interaction + motion" \
  --body "See docs/superpowers/plans/2026-09-07-live-session-b.md for the full task breakdown. Implements FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md Phases 3-4."
```

Fill in the actual PR number back into `todo.md`'s Session B line (Step 5)
with a follow-up commit once the number is known, matching the convention
every prior session in this repo has followed.

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** §12-14 (expansion state/outward/timing) → Tasks 2, 4,
  10. §15-18 (per-category expanded content) → Tasks 3, 5, 6. §19 (hover
  relationship) → Task 6. §20-23 (connector architecture/geometry/endpoint
  calculation) — unchanged from Session A, no task needed. §22 (connector
  states) → Tasks 6 (hover/expanded), 7 (pulse). §24 (new-block choreography)
  → Tasks 1, 7, 8, 9. §25 (no animation on ordinary polling) → Task 1
  (`isFreshLiveTip`) is the single source of truth every pulse-driving prop
  traces back to. §50 (interaction performance) → Task 6's `:has()`-based
  hover (no re-render) and Task 4/9's UI-only expansion (no API wait). §51-52
  (accessibility/reduced motion) → Task 4 (real interactive element),
  every task's `@media (prefers-reduced-motion: reduce)` block. §71
  (expansion tests) → Task 2's `toggleExpandedCategory` tests + Task 9's
  manual verification for the trigger wiring (Escape/click-outside/block-
  change — see Global Constraints' testing-convention note for why these
  aren't separately unit-tested). §73 (animation tests) → Task 1's
  `isFreshLiveTip`/`categoriesToPulse` tests cover every listed case except
  "reduced-motion mode removes elaborate animation", which is a CSS media
  query, verified manually in Task 11 (there is no automated CSS-media-query
  test anywhere in this codebase either).
- **Deliberately deferred to Session C** (per `LIVE_REDESIGN_PLAN.md`'s own
  phase table, which assigns spec §37-39/§26-32/§63-65 to Session C): the
  "View full details →" button's *behavior* (scroll into view + temporary
  `.live-detail-section--focused` highlight, spec §38) is not wired this
  session — Task 5's expanded bodies mention "see full details below" as
  plain text rather than a button that does nothing, so nothing this session
  ships looks broken. The LIVE/HISTORY status badge, Return-to-Live UI, and
  "new block while historical" toast (spec §26-30) are also Session C scope;
  this session's `isFollowingLive`/`isFreshLiveTip` logic is written so it
  already behaves correctly once Session C adds that UI on top (verified by
  the "historical mode does not get forced into new-block animation" test
  case in Task 1), but no historical-mode UI is added here.
- **Type/name consistency check:** `expandedCategory` (Live.jsx state) →
  `FlowCanvas`'s `expandedCategory` prop → `ActivityCard`'s `isExpanded`
  (`=== key`) and `FlowConnectors`'/`FlowBlock`'s use of the same string
  directly — consistent throughout, no renaming across tasks.
  `pulseCategories`/`pulseKey` similarly flow Live.jsx → FlowCanvas →
  ActivityCard/FlowConnectors/FlowBlock unchanged. `categoryKey` (the prop
  name on `ActivityCard`) matches the `CARD_KEYS` string values (`'reward'`,
  `'deploy'`, `'p2p'`, `'confirm'`) used as `EXPANDED_BODY_COMPONENT` map keys
  in Task 5 — same four strings `blockFlowSummary.js` and `categoryMeta.js`
  already use everywhere else in this directory.
