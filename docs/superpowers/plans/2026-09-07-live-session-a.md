# Live Redesign Session A — Visual Shell + Data Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/live` a real visual hero — a central block with four fixed
activity nodes (Node Rewards, Cloud Deployments, P2P Transfers, Node
Confirmations) connected to it by curved SVG connectors — rendering real,
derived block data. Static/inert this session (no click-to-expand, no hover
highlighting, no new-block choreography — those are Sessions B/C/D).

**Architecture:** Four new presentational components under `client/src/live/`
(`FlowCanvas`, `FlowBlock`, `ActivityCard`, `FlowConnectors`) compose around
the existing `Live.jsx` polling/state machinery, fed by one new pure function
(`buildBlockFlowSummary`) that derives per-category counts/totals from a
block's already-accumulated `events` array — no new network requests, no new
event model. `ChainRail` and `DetailsPanel` get CSS-only restyle passes
(their data/rendering logic is untouched). One SVG connector overlay uses
`ResizeObserver` + refs to measure real DOM geometry rather than hardcoded
per-resolution coordinates.

**Tech Stack:** React 18.2 (function components, hooks), SCSS (existing
`styles/_global.scss` tokens only, no new tokens), `lucide-react` icons
(already a dependency), Jest + React Testing Library conventions already used
in `live/apidata.test.js` / `live/blockAnimation.test.js`. No new npm
dependency.

**Spec:** `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (repo root, 80-section source
of truth) — this plan implements spec Phases 1-2 (§77), specifically §§6-24,
33-34, 66 as scoped by `LIVE_REDESIGN_PLAN.md`'s "Session A" section. Read
both if a task's intent is unclear; this plan argues from them but does not
restate every rationale.

## Global Constraints

- **Scope boundary — `client/src/live/**` only.** No changes to Home, Nodes,
  Analytics, Demo, nav, auth, routing, or global theme tokens
  (`client/src/styles/_global.scss`). Verify with `git diff --stat` before
  the final PR (spec §4/§75).
- **No new npm dependency.** React + CSS + SVG + `ResizeObserver` only (spec
  §67) — no React Flow, no charting library.
- **Preserve the existing data foundation.** 15s fast poll / 5min slow
  refresh, `live/apidata.js`'s event extraction, `live/blockAnimation.js`'s
  phase state machine, `ChainRail`'s keyboard accessibility, `DetailsPanel`'s
  four renderers all stay as-is except the one additive Dev Fund change
  (Task 1) and CSS-only restyle passes (Tasks 8-9).
- **Static this session.** No `expandedCategory` state, no click-to-expand,
  no hover relationship highlighting, no new-block choreography, no
  live/history switching, no connector pulse states beyond idle (spec
  explicitly defers these to Sessions B/C — see `LIVE_REDESIGN_PLAN.md`).
  Cards render real data but have no click handlers wired up.
- **Test commands:** `cd client && CI=true npx react-scripts test
  --watchAll=false` (baseline: 290 passing) and `npx react-scripts build`
  (baseline: exit 0, exactly 4 pre-existing warning files — Navbar,
  NodeGridTable, LayoutContext, WalletNodes). Every task that touches
  `.js`/`.jsx` ends with both green.
- **Colour system (spec §43):** existing palette only — Rewards uses the
  existing tier colours (`live/tierMeta.js`) plus Flux blue for the section
  itself, Deployments existing green (`#22c55e`), P2P neutral slate
  (`#8b93a6`), Confirmations existing amber (`#eab308`) — these four hex
  values already live in `live/categoryMeta.js`'s `DETAIL_SECTIONS`; reuse
  them, don't reinvent.
- **Spacing (spec §45):** 4/8px-based scale (4, 8, 12, 16, 20, 24, 32, 40,
  48) for any new padding/gap/margin value.
- **Depth (spec §46):** only `--surface-primary` / `--surface-inset` /
  `--border-primary` / `--shadow-sm` / `--shadow-md` (already defined in
  `styles/_global.scss`) — no new tokens.

---

## File structure

```
client/src/live/
├── Live.jsx                    (MODIFY — render FlowCanvas, compute summary)
├── Live.scss                   (MODIFY — minor header spacing only)
├── apidata.js                  (MODIFY — Task 1: Dev Fund extraction)
├── apidata.test.js             (MODIFY — Task 1: update/add tests)
├── tierMeta.js                 (MODIFY — Task 1: add DEVFUND entry)
├── categoryMeta.js             (MODIFY — Task 1: add DEVFUND to CATEGORY_META)
├── timeFormat.js               (CREATE — Task 2: shared relativeTime/exactTimestamp)
├── timeFormat.test.js          (CREATE — Task 2)
├── blockFlowSummary.js         (CREATE — Task 3: buildBlockFlowSummary)
├── blockFlowSummary.test.js    (CREATE — Task 3)
├── ChainRail/
│   ├── index.jsx                (MODIFY — Task 2: use shared relativeTime; Task 8: visual demotion, no behavior change)
│   └── index.scss               (MODIFY — Task 8)
├── DetailsPanel/
│   ├── index.jsx                 (unchanged)
│   └── index.scss                (MODIFY — Task 8: spacing/hierarchy polish only)
├── FlowConnectors/
│   ├── index.jsx                 (CREATE — Task 4)
│   └── index.scss                (CREATE — Task 4)
├── FlowBlock/
│   ├── index.jsx                 (CREATE — Task 5)
│   └── index.scss                (CREATE — Task 5)
├── ActivityCard/
│   ├── index.jsx                 (CREATE — Task 6)
│   └── index.scss                (CREATE — Task 6)
└── FlowCanvas/
    ├── index.jsx                 (CREATE — Task 7)
    └── index.scss                (CREATE — Task 7)
```

---

### Task 1: Dev Fund reward extraction

**Files:**
- Modify: `client/src/live/apidata.js` (`extractRewardsFromCoinbase`)
- Modify: `client/src/live/tierMeta.js`
- Modify: `client/src/live/categoryMeta.js`
- Modify: `client/src/live/apidata.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `extractRewardsFromCoinbase()` now returns a 4th possible tier,
  `'DEVFUND'`, matched by exact address rather than percentage share.
  `TIER_META.DEVFUND = { label: 'Dev Fund', color: '#6366f1' }` — later
  tasks (3, 6) rely on this key existing in `TIER_META`.

- [ ] **Step 1: Update the existing coinbase test to expect the treasury output recognized, not ignored**

The current test asserts the treasury/Dev Fund output is excluded. That
assertion is about to become wrong on purpose — replace it in
`client/src/live/apidata.test.js`:

```js
describe('extractRewardsFromCoinbase', () => {
  it('identifies all three tier outputs by percentage share, plus the Dev Fund output by exact address', () => {
    const rewards = extractRewardsFromCoinbase(realCoinbaseTx());

    expect(rewards).toEqual(
      expect.arrayContaining([
        { tier: 'DEVFUND', address: 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA', amount: 0.5 },
        { tier: 'CUMULUS', address: 't1aDybT3BM7hkpween5SwrGhTam1gBXuBgG', amount: 1 },
        { tier: 'NIMBUS', address: 't3aqgLXMH6LHgCH7dGAZTBp3PWaaLPrHw8t', amount: 3.5 },
        { tier: 'STRATUS', address: 't3N6aaTHN8WBcaYbQrHvGDGJH9Wg73AN367', amount: 9 },
      ])
    );
    expect(rewards).toHaveLength(4);
  });

  it('recognizes the Dev Fund output by its exact address even if its value drifted off the usual ~0.5 FLUX', () => {
    const tx = {
      isCoinBase: true,
      valueOut: 14,
      vout: [{ value: '0.71000000', scriptPubKey: { addresses: ['t3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA'] } }],
    };
    expect(extractRewardsFromCoinbase(tx)).toEqual([
      { tier: 'DEVFUND', address: 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA', amount: 0.71 },
    ]);
  });

  it('does not misidentify an ordinary tier output as Dev Fund just because its percentage is close', () => {
    // A CUMULUS-percentage output at some other address must still resolve as CUMULUS,
    // not fall through unmatched, now that Dev Fund matching runs first.
    const tx = {
      isCoinBase: true,
      valueOut: 14,
      vout: [{ value: '1.00000000', scriptPubKey: { addresses: ['t1SomeCumulusNode'] } }],
    };
    expect(extractRewardsFromCoinbase(tx)).toEqual([
      { tier: 'CUMULUS', address: 't1SomeCumulusNode', amount: 1 },
    ]);
  });

  it('returns nothing for a non-coinbase transaction', () => {
    expect(extractRewardsFromCoinbase({ isCoinBase: false, valueOut: 14, vout: [] })).toEqual([]);
  });

  it('returns nothing when the transaction is missing or malformed', () => {
    expect(extractRewardsFromCoinbase(null)).toEqual([]);
    expect(extractRewardsFromCoinbase({ isCoinBase: true })).toEqual([]);
  });

  it('skips an output with no resolvable address rather than throwing', () => {
    const tx = { isCoinBase: true, valueOut: 14, vout: [{ value: '9.00000000', scriptPubKey: {} }] };
    expect(() => extractRewardsFromCoinbase(tx)).not.toThrow();
    expect(extractRewardsFromCoinbase(tx)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail against the current implementation**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/apidata`
Expected: the two new/changed `extractRewardsFromCoinbase` assertions FAIL
(current code excludes the treasury output entirely; the "close percentage"
test doesn't exist yet in a way that would fail — that one should already
pass, it's here as a regression guard).

- [ ] **Step 3: Add exact-address Dev Fund matching to `extractRewardsFromCoinbase`**

In `client/src/live/apidata.js`, replace the function and its constants:

```js
/*
 * Every block's first transaction is its coinbase — the block reward itself,
 * split across a handful of outputs. This is the real payout, not a
 * network-average projection: matching each output's share of the total
 * against the tier reward percentages (already known network constants)
 * identifies which output is which tier, by percentage rather than a fixed
 * vout index/count, so this keeps working if the payout tx's shape changes
 * (extra treasury outputs, reordering, etc.) as long as the tier splits
 * stay close to their configured percentages.
 *
 * The Dev Fund output is matched separately, by its known fixed address
 * (not percentage) — the three tier percentages above only sum to 96.422%,
 * so Dev Fund was previously falling through unmatched entirely. It pays a
 * fixed ~0.5 FLUX/block to a static address rather than a tier-proportional
 * share, so percentage matching doesn't apply to it the way it does to the
 * three node tiers.
 */
const TIER_REWARD_PERCENT = {
  CUMULUS: window.gContent?.CC_FLUX_REWARD_CUMULUS,
  NIMBUS: window.gContent?.CC_FLUX_REWARD_NIMBUS,
  STRATUS: window.gContent?.CC_FLUX_REWARD_STRATUS,
};
const TIER_MATCH_TOLERANCE_PCT = 0.5;
const DEV_FUND_ADDRESS = 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA';

export function extractRewardsFromCoinbase(coinbaseTx) {
  const totalOut = Number(coinbaseTx?.valueOut);
  if (!coinbaseTx?.isCoinBase || !totalOut || !Array.isArray(coinbaseTx.vout)) return [];

  const rewards = [];
  for (const vout of coinbaseTx.vout) {
    const value = Number(vout.value);
    const address = vout.scriptPubKey?.addresses?.[0];
    if (!value || !address) continue;

    if (address === DEV_FUND_ADDRESS) {
      rewards.push({ tier: 'DEVFUND', address, amount: value });
      continue;
    }

    const pct = (value / totalOut) * 100;
    const tier = Object.entries(TIER_REWARD_PERCENT).find(
      ([, expectedPct]) => expectedPct != null && Math.abs(pct - expectedPct) <= TIER_MATCH_TOLERANCE_PCT
    )?.[0];
    if (tier) rewards.push({ tier, address, amount: value });
  }
  return rewards;
}
```

- [ ] **Step 4: Add the Dev Fund tier to `TIER_META`**

In `client/src/live/tierMeta.js`:

```js
// Same tier colors used elsewhere on the site (see home/HomeOverview's
// TopDogsPanel), duplicated here rather than imported since that constant
// isn't exported and the two pages are otherwise independent. DEVFUND is
// live/-only — the network's Dev Fund treasury output, not a node tier —
// but reuses this same lookup everywhere tier labels/colors are rendered
// (live/apidata.js's extractRewardsFromCoinbase, DetailsPanel's RewardRow,
// live/blockFlowSummary.js). Color matches --accent-indigo in
// styles/_global.scss — can't reference the CSS custom property directly
// from a JS style object, so the hex is duplicated here by design, same as
// every other tier color in this file.
export const TIER_META = {
  CUMULUS: { label: 'Cumulus', color: '#2686d0' },
  NIMBUS: { label: 'Nimbus', color: '#d07e26' },
  STRATUS: { label: 'Stratus', color: '#c92641' },
  DEVFUND: { label: 'Dev Fund', color: '#6366f1' },
};
```

- [ ] **Step 5: Add DEVFUND to `CATEGORY_META`**

In `client/src/live/categoryMeta.js`, add one more entry alongside the
existing tier entries (keeps `CATEGORY_META` — used by future flow
components for icon/label/tooltip lookups keyed by tier — complete for all
four reward tiers):

```js
export const CATEGORY_META = {
  CUMULUS: { ...TIER_META.CUMULUS, Icon: Coins, kind: 'reward', tooltip: 'Cumulus node reward paid this block (exact amount, from the coinbase transaction)' },
  NIMBUS: { ...TIER_META.NIMBUS, Icon: Coins, kind: 'reward', tooltip: 'Nimbus node reward paid this block (exact amount, from the coinbase transaction)' },
  STRATUS: { ...TIER_META.STRATUS, Icon: Coins, kind: 'reward', tooltip: 'Stratus node reward paid this block (exact amount, from the coinbase transaction)' },
  DEVFUND: { ...TIER_META.DEVFUND, Icon: Coins, kind: 'reward', tooltip: 'Dev Fund treasury payment this block (exact amount, from the coinbase transaction)' },
  DEPLOY: { label: 'Deployed', color: '#22c55e', Icon: Rocket, kind: 'deploy', tooltip: 'A Flux app was deployed this block' },
  P2P: {
    label: 'P2P',
    color: '#8b93a6',
    Icon: ArrowLeftRight,
    kind: 'p2p',
    tooltip: 'A real on-chain transfer this block — a small share may be app-funding rather than a personal send',
  },
  CONFIRM: {
    label: 'Confirmed',
    color: '#eab308',
    Icon: ShieldCheck,
    kind: 'confirm',
    tooltip: 'A node re-confirming itself as active this block',
  },
};
```

(No other line in this file changes — `DETAIL_SECTIONS` stays as-is; Dev
Fund rewards render inside the existing "Node Rewards" section via
`DetailsPanel`'s existing `TIER_META[event.tier]` lookup, which now resolves
for `DEVFUND` too.)

- [ ] **Step 6: Run tests to confirm they pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/apidata`
Expected: PASS, all `extractRewardsFromCoinbase` and `buildRewardEvents`
tests green.

- [ ] **Step 7: Run the full suite and build to confirm no regressions elsewhere**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, 293 tests (290 baseline + 3 new in this task — 2 new cases,
1 rewritten).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files.

- [ ] **Step 8: Commit**

```bash
git add client/src/live/apidata.js client/src/live/apidata.test.js client/src/live/tierMeta.js client/src/live/categoryMeta.js
git commit -m "feat(live): extract Dev Fund reward by exact address

Adds a 4th recognized reward category — the network's Dev Fund treasury
output (~0.5 FLUX/block to a static address) — matched by exact address
rather than the percentage-tolerance heuristic used for Cumulus/Nimbus/
Stratus, whose configured percentages only sum to 96.422% and so never
covered this output. Additive: existing tier detection is unchanged."
```

---

### Task 2: Shared time formatting util

**Files:**
- Create: `client/src/live/timeFormat.js`
- Create: `client/src/live/timeFormat.test.js`
- Modify: `client/src/live/ChainRail/index.jsx` (use the shared function instead of its own private copy)

**Interfaces:**
- Consumes: nothing.
- Produces: `relativeTime(atMs)` (same behavior as ChainRail's current
  private copy), `exactTimestamp(atMs)` — both used by Task 5's `FlowBlock`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/live/timeFormat.test.js`:

```js
import { relativeTime, exactTimestamp } from './timeFormat';

describe('relativeTime', () => {
  it('returns an empty string for a missing timestamp', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime(undefined)).toBe('');
    expect(relativeTime(0)).toBe('');
  });

  it('reports "just now" for a timestamp within the last few seconds', () => {
    expect(relativeTime(Date.now())).toBe('just now');
  });

  it('reports whole seconds for anything under a minute', () => {
    expect(relativeTime(Date.now() - 45 * 1000)).toMatch(/^\d+s ago$/);
  });

  it('reports whole minutes for a minute or more', () => {
    expect(relativeTime(Date.now() - 125 * 1000)).toMatch(/^\d+m ago$/);
  });
});

describe('exactTimestamp', () => {
  it('returns an em dash for a missing timestamp', () => {
    expect(exactTimestamp(null)).toBe('—');
    expect(exactTimestamp(undefined)).toBe('—');
  });

  it('returns a non-empty formatted string for a real timestamp', () => {
    const result = exactTimestamp(Date.UTC(2026, 8, 5, 17, 3, 42));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/timeFormat`
Expected: FAIL — `Cannot find module './timeFormat'`.

- [ ] **Step 3: Create `timeFormat.js`**

```js
// Shared relative/absolute time formatting for anything in live/ that shows
// a block's age — relativeTime was previously a private copy inside
// ChainRail; pulled out here so FlowBlock (live/FlowBlock) can use the exact
// same "Xs/Xm ago" phrasing without re-deriving its own.

export function relativeTime(atMs) {
  if (!atMs) return '';
  const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

// Full localized date/time for a block's hover tooltip (spec §64 central
// block hover: "Timestamp: 5 Sep 2026 · 17:03:42").
export function exactTimestamp(atMs) {
  if (!atMs) return '—';
  return new Date(atMs).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/timeFormat`
Expected: PASS.

- [ ] **Step 5: Point ChainRail at the shared function**

In `client/src/live/ChainRail/index.jsx`, remove the private `relativeTime`
function (lines 32-38 in the current file) and import the shared one
instead:

```js
import React from 'react';
import { DETAIL_SECTIONS } from 'live/categoryMeta';
import { FluxMark } from 'live/FluxMark';
import { relativeTime } from 'live/timeFormat';
import './index.scss';
```

(Delete the local `function relativeTime(atMs) { ... }` block entirely —
everything else in the file stays byte-identical, it already calls
`relativeTime(block.at)` the same way.)

- [ ] **Step 6: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, 297 tests (293 + 4 new `timeFormat` tests... actually 6 new
`it` blocks, so 299 — count is illustrative, confirm the actual number in
output rather than asserting on it).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files.

- [ ] **Step 7: Commit**

```bash
git add client/src/live/timeFormat.js client/src/live/timeFormat.test.js client/src/live/ChainRail/index.jsx
git commit -m "refactor(live): extract relativeTime into shared live/timeFormat

Pulled ChainRail's private relativeTime helper out into live/timeFormat.js
(plus a new exactTimestamp for hover tooltips) so the upcoming FlowBlock
component can share the exact same age-formatting phrasing rather than
re-deriving its own. No behavior change to ChainRail."
```

---

### Task 3: `buildBlockFlowSummary` pure function

**Files:**
- Create: `client/src/live/blockFlowSummary.js`
- Create: `client/src/live/blockFlowSummary.test.js`

**Interfaces:**
- Consumes: `TIER_META` from `live/tierMeta.js` (Task 1's `DEVFUND` entry).
- Produces: `buildBlockFlowSummary(block)` returning `null` for a missing
  block, or:
  ```js
  {
    height, hash, at,
    rewards: { count, totalFlux, tiers: [{ tier, label, color, amount, address }] },
    deployments: { count, instances, apps: [{ name, instances, cpuPerInst, ramGBPerInst, ssdGBPerInst, category, owner }] },
    p2p: { count, totalFlux },
    confirmations: { count, byTier: [{ tier, label, color, count }] },
  }
  ```
  `tiers`/`byTier` only include tiers actually present this block, in fixed
  order (CUMULUS, NIMBUS, STRATUS, DEVFUND). Used by Task 7's `FlowCanvas`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/live/blockFlowSummary.test.js`:

```js
import { buildBlockFlowSummary } from './blockFlowSummary';

function rewardEvent(tier, amount, address = `addr-${tier}`) {
  return { id: `reward-${tier}`, type: 'reward', tier, amount, paymentAddress: address };
}
function confirmEvent(tier, id) {
  return { id, type: 'confirm', tier, ip: '1.2.3.4' };
}
function p2pEvent(id, amount) {
  return { id, type: 'p2p', from: 'a', to: 'b', amount };
}
function deployEvent(id, overrides = {}) {
  return {
    id,
    type: 'deploy',
    appName: 'TestApp',
    category: 'blockchain',
    instances: 2,
    cpuPerInst: 4,
    ramGBPerInst: 8,
    ssdGBPerInst: 100,
    owner: 't1owner',
    ...overrides,
  };
}

describe('buildBlockFlowSummary', () => {
  it('returns null for a missing block', () => {
    expect(buildBlockFlowSummary(null)).toBeNull();
    expect(buildBlockFlowSummary(undefined)).toBeNull();
  });

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

  it('treats a block with no events array the same as an empty one', () => {
    const summary = buildBlockFlowSummary({ height: 1, hash: 'h', at: 1 });
    expect(summary.rewards).toEqual({ count: 0, totalFlux: 0, tiers: [] });
  });

  it('sums reward totals and lists tiers in fixed order including Dev Fund', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [
        rewardEvent('STRATUS', 9, 'addrStratus'),
        rewardEvent('DEVFUND', 0.5, 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA'),
        rewardEvent('CUMULUS', 1, 'addrCumulus'),
      ],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.rewards.count).toBe(3);
    expect(summary.rewards.totalFlux).toBeCloseTo(10.5);
    expect(summary.rewards.tiers.map((t) => t.tier)).toEqual(['CUMULUS', 'STRATUS', 'DEVFUND']);
    expect(summary.rewards.tiers.find((t) => t.tier === 'DEVFUND')).toMatchObject({
      label: 'Dev Fund',
      amount: 0.5,
      address: 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA',
    });
  });

  it('sums P2P count and total', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [p2pEvent('p1', 8), p2pEvent('p2', 4.42)] };
    const summary = buildBlockFlowSummary(block);
    expect(summary.p2p.count).toBe(2);
    expect(summary.p2p.totalFlux).toBeCloseTo(12.42);
  });

  it('counts deployments and sums instances, carrying resource/owner details', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [deployEvent('d1', { appName: 'Nextcloud', instances: 2 }), deployEvent('d2', { appName: 'Jellyfin', instances: 1 })],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.deployments.count).toBe(2);
    expect(summary.deployments.instances).toBe(3);
    expect(summary.deployments.apps).toEqual([
      { name: 'Nextcloud', instances: 2, cpuPerInst: 4, ramGBPerInst: 8, ssdGBPerInst: 100, category: 'blockchain', owner: 't1owner' },
      { name: 'Jellyfin', instances: 1, cpuPerInst: 4, ramGBPerInst: 8, ssdGBPerInst: 100, category: 'blockchain', owner: 't1owner' },
    ]);
  });

  it('breaks confirmations down by tier in fixed order, excluding Dev Fund', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [
        confirmEvent('CUMULUS', 'c1'), confirmEvent('CUMULUS', 'c2'),
        confirmEvent('NIMBUS', 'c3'),
        confirmEvent('STRATUS', 'c4'),
      ],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.confirmations.count).toBe(4);
    expect(summary.confirmations.byTier).toEqual([
      { tier: 'CUMULUS', label: 'Cumulus', color: '#2686d0', count: 2 },
      { tier: 'NIMBUS', label: 'Nimbus', color: '#d07e26', count: 1 },
      { tier: 'STRATUS', label: 'Stratus', color: '#c92641', count: 1 },
    ]);
  });

  it('ignores event types it does not recognize rather than throwing', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [{ id: 'x', type: 'unknown-future-type' }] };
    expect(() => buildBlockFlowSummary(block)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/blockFlowSummary`
Expected: FAIL — `Cannot find module './blockFlowSummary'`.

- [ ] **Step 3: Implement `blockFlowSummary.js`**

```js
import { TIER_META } from 'live/tierMeta';

// Tiers appear in this fixed order regardless of the order their reward/
// confirm events happened to arrive in — matches the spec's own reward-card
// ordering (Cumulus, Nimbus, Stratus, Dev Fund).
const REWARD_TIER_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS', 'DEVFUND'];
const CONFIRM_TIER_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS']; // Dev Fund never confirms a node

function summarizeRewards(events) {
  const byTier = {};
  for (const e of events) {
    if (e.type !== 'reward') continue;
    if (byTier[e.tier]) {
      byTier[e.tier].amount += e.amount;
    } else {
      byTier[e.tier] = { amount: e.amount, address: e.paymentAddress };
    }
  }

  const tiers = REWARD_TIER_ORDER.filter((tier) => byTier[tier]).map((tier) => ({
    tier,
    label: TIER_META[tier]?.label || tier,
    color: TIER_META[tier]?.color || '#888',
    amount: byTier[tier].amount,
    address: byTier[tier].address,
  }));

  return {
    count: tiers.length,
    totalFlux: tiers.reduce((sum, t) => sum + t.amount, 0),
    tiers,
  };
}

function summarizeDeployments(events) {
  const apps = events
    .filter((e) => e.type === 'deploy')
    .map((e) => ({
      name: e.appName,
      instances: e.instances || 1,
      cpuPerInst: e.cpuPerInst ?? null,
      ramGBPerInst: e.ramGBPerInst ?? null,
      ssdGBPerInst: e.ssdGBPerInst ?? null,
      category: e.category || null,
      owner: e.owner || null,
    }));

  return {
    count: apps.length,
    instances: apps.reduce((sum, a) => sum + a.instances, 0),
    apps,
  };
}

function summarizeP2p(events) {
  const transfers = events.filter((e) => e.type === 'p2p');
  return {
    count: transfers.length,
    totalFlux: transfers.reduce((sum, t) => sum + t.amount, 0),
  };
}

function summarizeConfirmations(events) {
  const byTier = {};
  for (const e of events) {
    if (e.type !== 'confirm') continue;
    byTier[e.tier] = (byTier[e.tier] || 0) + 1;
  }

  const tiers = CONFIRM_TIER_ORDER.filter((tier) => byTier[tier]).map((tier) => ({
    tier,
    label: TIER_META[tier]?.label || tier,
    color: TIER_META[tier]?.color || '#888',
    count: byTier[tier],
  }));

  return {
    count: tiers.reduce((sum, t) => sum + t.count, 0),
    byTier: tiers,
  };
}

/*
 * Pure transformation from a displayed block (with its accumulated `events`
 * array — see live/apidata.js's attachEventsToBlocks) into the compact
 * per-category shape the flow canvas's four ActivityCards render. Derived
 * data only — never fetches anything itself (spec §33/§69: "do not create
 * duplicate API requests just for summaries", "summary state should remain
 * derived").
 *
 * Returns null for a missing block — "still loading", distinct from a real
 * block with zero events (see the "empty block" test for that case).
 */
export function buildBlockFlowSummary(block) {
  if (!block) return null;
  const events = block.events || [];

  return {
    height: block.height,
    hash: block.hash,
    at: block.at,
    rewards: summarizeRewards(events),
    deployments: summarizeDeployments(events),
    p2p: summarizeP2p(events),
    confirmations: summarizeConfirmations(events),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=live/blockFlowSummary`
Expected: PASS, all 8 test cases green.

- [ ] **Step 5: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files.

- [ ] **Step 6: Commit**

```bash
git add client/src/live/blockFlowSummary.js client/src/live/blockFlowSummary.test.js
git commit -m "feat(live): add buildBlockFlowSummary pure function

Derives the flow canvas's four per-category summaries (reward tier totals
incl. Dev Fund, P2P count/total, deployment count/instances, confirmation
tier breakdown) from a block's already-accumulated events array. No new
network requests — pure derivation, per spec §33/§69."
```

---

### Task 4: `FlowConnectors` component

**Files:**
- Create: `client/src/live/FlowConnectors/index.jsx`
- Create: `client/src/live/FlowConnectors/index.scss`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (no data dependency) — pure
  layout/geometry component.
- Produces: `<FlowConnectors containerRef={...} blockRef={...} cardRefs={...} colors={...} />`
  where `cardRefs`/`colors` are `{ reward, deploy, p2p, confirm }` maps of
  React ref objects / hex color strings respectively. Task 7's `FlowCanvas`
  renders this and supplies all four refs plus the colors from
  `DETAIL_SECTIONS`.

No unit test for this component — it is pure DOM-measurement/rendering
code with no meaningful assertions outside a real browser layout (same
convention as this repo's existing `ResizeObserver`-driven code in
`Live.jsx`, which also has no dedicated test). Verify visually in Task 7's
manual smoke check instead.

- [ ] **Step 1: Create `FlowConnectors/index.jsx`**

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import './index.scss';

/*
 * One SVG overlay, four cubic Bézier connectors — one per activity category
 * — drawn between each ActivityCard's edge (facing the central block) and
 * the block's matching corner. Endpoints are measured from real DOM
 * geometry via refs + ResizeObserver (spec §20-23), never hardcoded per-
 * resolution coordinates, and re-measured only when something's size
 * actually changes — not on every animation frame.
 *
 * Static/idle only this session — no hover/expanded/pulse states (Session
 * B, spec §22).
 */

const CONNECTOR_ORDER = ['reward', 'deploy', 'p2p', 'confirm'];

// Each connector's control-point "pull" (how far the curve bows away from a
// straight line) is deliberately slightly different per category — an
// identical pull on all four would look mechanically symmetric; slight
// per-category variation reads as a more organic topology (spec §21: "Do
// not make all four curves mathematically identical").
const CONNECTOR_PULL = { reward: 0.42, deploy: 0.38, p2p: 0.46, confirm: 0.4 };

// Anchor point on a rect's edge, biased toward another point's direction —
// approximates "the point on this box's edge closest to the other box"
// without full line/rect intersection math, which is unnecessary precision
// for a decorative connector endpoint.
function anchorTowards(rect, targetCenter) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = targetCenter.x - cx;
  const dy = targetCenter.y - cy;
  const x = cx + Math.sign(dx || 1) * (rect.width / 2) * 0.9;
  const y = cy + Math.sign(dy || 1) * (rect.height / 2) * 0.9;
  return { x, y };
}

function buildPath(from, to, pull) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = Math.max(Math.abs(dx), Math.abs(dy)) * pull;
  const bowSign = dy >= 0 ? 1 : -1;
  const c1x = from.x + dx * 0.35;
  const c1y = from.y + dy * 0.15 + bowSign * bow * 0.3;
  const c2x = from.x + dx * 0.65;
  const c2y = from.y + dy * 0.85 - bowSign * bow * 0.3;
  return `M ${from.x},${from.y} C ${c1x},${c1y} ${c2x},${c2y} ${to.x},${to.y}`;
}

export function FlowConnectors({ containerRef, blockRef, cardRefs, colors }) {
  const [paths, setPaths] = useState({});

  const measure = useCallback(() => {
    const container = containerRef.current;
    const blockEl = blockRef.current;
    if (!container || !blockEl) return;

    const containerRect = container.getBoundingClientRect();
    const toLocal = (rect) => ({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    });

    const blockRect = toLocal(blockEl.getBoundingClientRect());
    const blockCenter = { x: blockRect.left + blockRect.width / 2, y: blockRect.top + blockRect.height / 2 };

    const next = {};
    for (const key of CONNECTOR_ORDER) {
      const cardEl = cardRefs[key]?.current;
      if (!cardEl) continue;
      const cardRect = toLocal(cardEl.getBoundingClientRect());
      const cardCenter = { x: cardRect.left + cardRect.width / 2, y: cardRect.top + cardRect.height / 2 };

      const fromCard = anchorTowards(cardRect, blockCenter);
      const toBlock = anchorTowards(blockRect, cardCenter);
      next[key] = buildPath(fromCard, toBlock, CONNECTOR_PULL[key]);
    }
    setPaths(next);
  }, [containerRef, blockRef, cardRefs]);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const targets = [blockRef.current, ...Object.values(cardRefs).map((r) => r.current)].filter(Boolean);
    targets.forEach((t) => observer.observe(t));

    return () => observer.disconnect();
  }, [measure, containerRef, blockRef, cardRefs]);

  return (
    <svg className="live-flow-connectors" aria-hidden="true">
      {CONNECTOR_ORDER.map((key) => (
        paths[key] ? (
          <path
            key={key}
            className={`live-flow-connector live-flow-connector--${key}`}
            d={paths[key]}
            style={{ '--connector-color': colors?.[key] }}
          />
        ) : null
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Create `FlowConnectors/index.scss`**

```scss
.live-flow-connectors {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  overflow: visible;
}

.live-flow-connector {
  fill: none;
  stroke: var(--connector-color, var(--border-hover));
  stroke-width: 1.5;
  opacity: 0.45;
}

// Connectors add visual noise on a narrow single-column layout where cards
// stack directly above/below the block anyway — hidden below 900px (spec
// §48: "Connectors may be simplified/removed on mobile").
@media (max-width: 899px) {
  .live-flow-connectors {
    display: none;
  }
}
```

- [ ] **Step 3: Verify no build errors**

Run: `cd client && npx react-scripts build`
Expected: exit 0 (this component isn't wired into `Live.jsx` yet, so this
just confirms it compiles cleanly in isolation — CRA's build still traverses
every file connected to the entry point, so if this file has a syntax error
it should already fail here once Task 7 wires it in; for now this step is a
lint/syntax sanity check via `npx eslint src/live/FlowConnectors/index.jsx`
if the build doesn't reach it yet).

Run: `cd client && npx eslint src/live/FlowConnectors/index.jsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/FlowConnectors/
git commit -m "feat(live): add FlowConnectors component

One SVG overlay, four cubic Bézier connectors between each ActivityCard and
the central block, geometry measured live via ResizeObserver + refs (spec
§20-23) — not yet wired into Live.jsx (Task 7). Idle state only this
session; hover/expanded/pulse states are Session B."
```

---

### Task 5: `FlowBlock` component

**Files:**
- Create: `client/src/live/FlowBlock/index.jsx`
- Create: `client/src/live/FlowBlock/index.scss`

**Interfaces:**
- Consumes: `FluxMark` from `live/FluxMark`, `relativeTime`/`exactTimestamp`
  from `live/timeFormat` (Task 2), the `buildBlockFlowSummary()` shape
  (Task 3) as its `summary` prop.
- Produces: `<FlowBlock ref={...} block={displayedBlock} summary={summary} />`
  — a `forwardRef` component so Task 7's `FlowCanvas` can pass its DOM node
  to `FlowConnectors`.

- [ ] **Step 1: Create `FlowBlock/index.jsx`**

```jsx
import React from 'react';
import { FluxMark } from 'live/FluxMark';
import { relativeTime, exactTimestamp } from 'live/timeFormat';
import './index.scss';

/*
 * The central hero of the flow canvas — identifies the event; the four
 * ActivityCards around it explain it (spec §8: "The block identifies the
 * event; the outer nodes explain the event." — deliberately not overloaded
 * with addresses or transaction rows).
 *
 * Live/History status treatment (spec §26-27) and the elaborate new-block
 * glow (spec §9, §24) are out of scope this session — this renders the
 * plain idle state only. `block` is null before the first successful poll;
 * FlowCanvas (Task 7) only mounts this once `block` is real, so the null
 * branch here is a defensive fallback, not the primary loading UI.
 */
export const FlowBlock = React.forwardRef(function FlowBlock({ block, summary }, ref) {
  if (!block || !summary) {
    return (
      <div className="live-flow-block live-flow-block--loading" ref={ref}>
        <FluxMark className="live-flow-block-mark" />
      </div>
    );
  }

  const parts = [];
  if (summary.rewards.count) parts.push(`${summary.rewards.count} reward${summary.rewards.count === 1 ? '' : 's'}`);
  if (summary.deployments.count) parts.push(`${summary.deployments.count} deploy${summary.deployments.count === 1 ? '' : 's'}`);
  if (summary.p2p.count) parts.push(`${summary.p2p.count} transfer${summary.p2p.count === 1 ? '' : 's'}`);
  const activitySummary = parts.length > 0 ? parts.join(' · ') : 'No activity this block';

  return (
    <div
      className="live-flow-block"
      ref={ref}
      title={`Block #${block.height}\nHash: ${block.hash || '—'}\nTimestamp: ${exactTimestamp(block.at)}`}
    >
      <FluxMark className="live-flow-block-mark" />
      <span className="live-flow-block-height">#{block.height}</span>
      <span className="live-flow-block-age">{relativeTime(block.at)}</span>
      <span className="live-flow-block-confirmations">
        {summary.confirmations.count} confirmation{summary.confirmations.count === 1 ? '' : 's'}
      </span>
      <span className="live-flow-block-summary">{activitySummary}</span>
    </div>
  );
});
```

- [ ] **Step 2: Create `FlowBlock/index.scss`**

```scss
.live-flow-block {
  grid-area: block;
  width: 240px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 20px;
  border-radius: var(--radius-md);
  background: var(--surface-primary);
  border: 1px solid color-mix(in srgb, #2b61d1 30%, var(--border-primary));
  box-shadow: var(--shadow-md), 0 0 32px color-mix(in srgb, #2b61d1 10%, transparent);
  position: relative;
  z-index: 1;
  text-align: center;
}

.live-flow-block--loading {
  opacity: 0.6;
}

.live-flow-block-mark {
  width: 32px;
  height: 32px;
}

.live-flow-block-height {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.live-flow-block-age {
  font-size: var(--live-fs-sm);
  color: var(--text-tertiary);
}

.live-flow-block-confirmations {
  font-size: var(--live-fs-base);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 4px;
}

.live-flow-block-summary {
  font-size: var(--live-fs-xs);
  color: var(--text-tertiary);
}

@media (max-width: 1199px) {
  .live-flow-block {
    width: 200px;
    min-height: 170px;
    padding: 20px 16px;
  }

  .live-flow-block-height {
    font-size: 1.25rem;
  }
}
```

- [ ] **Step 3: Verify lint passes**

Run: `cd client && npx eslint src/live/FlowBlock/index.jsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/FlowBlock/
git commit -m "feat(live): add FlowBlock component

Central hero of the flow canvas — FluxMark, height, relative age,
confirmation count, and a one-line activity summary derived from
buildBlockFlowSummary. Exact hash/timestamp on hover via native title
attribute. Not yet wired into Live.jsx (Task 7)."
```

---

### Task 6: `ActivityCard` component

**Files:**
- Create: `client/src/live/ActivityCard/index.jsx`
- Create: `client/src/live/ActivityCard/index.scss`

**Interfaces:**
- Consumes: nothing from earlier tasks directly — takes already-formatted
  `count`/`primary`/`secondary`/`emptyLabel` strings and a `def` (one entry
  of `live/categoryMeta.js`'s `DETAIL_SECTIONS`) as props. Task 7's
  `FlowCanvas` is responsible for deriving those strings from the
  `buildBlockFlowSummary()` shape.
- Produces: `<ActivityCard ref={...} quadrant="top-left" def={...} count={4}
  primary="14.50 FLUX" secondary="Cumulus · Nimbus · Stratus"
  emptyLabel="..." />` — a `forwardRef` component so `FlowConnectors` can
  measure its DOM node.

- [ ] **Step 1: Create `ActivityCard/index.jsx`**

```jsx
import React from 'react';
import { ChevronRight } from 'lucide-react';
import './index.scss';

/*
 * One of the four fixed activity nodes around the central block. Static/
 * inert this session — real data, real empty state, but no click-to-expand
 * yet (Session B, spec §12-14). The chevron is a forward-looking
 * affordance only; no handler is wired up here, and the card is not (yet)
 * a real interactive element (no role/tabIndex) — that lands in Session B
 * alongside the click behavior itself (spec §51: cards become real
 * interactive elements when they become clickable).
 */
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, def, count, primary, secondary, emptyLabel },
  ref
) {
  const Icon = def.Icon;
  const isEmpty = !count;

  return (
    <div
      className={`live-flow-card live-flow-card--${quadrant}${isEmpty ? ' live-flow-card--empty' : ''}`}
      ref={ref}
      style={{ '--card-accent': def.color }}
    >
      <div className="live-flow-card-header">
        <span className="live-flow-card-icon">
          <Icon size={15} />
        </span>
        <span className="live-flow-card-label">{def.label}</span>
        <span className="live-flow-card-count">{count}</span>
      </div>

      {isEmpty ? (
        <div className="live-flow-card-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="live-flow-card-primary">{primary}</div>
          {secondary && <div className="live-flow-card-secondary">{secondary}</div>}
        </>
      )}

      <ChevronRight size={14} className="live-flow-card-chevron" aria-hidden="true" />
    </div>
  );
});
```

- [ ] **Step 2: Create `ActivityCard/index.scss`**

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
}

.live-flow-card--top-left { grid-area: reward; }
.live-flow-card--top-right { grid-area: deploy; }
.live-flow-card--bottom-left { grid-area: p2p; }
.live-flow-card--bottom-right { grid-area: confirm; }

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

.live-flow-card-chevron {
  position: absolute;
  bottom: 12px;
  right: 14px;
  color: var(--text-tertiary);
  opacity: 0.6;
}

@media (max-width: 1199px) {
  .live-flow-card {
    min-height: 120px;
    padding: 12px 14px;
  }

  .live-flow-card-primary {
    font-size: var(--live-fs-md);
  }
}
```

- [ ] **Step 3: Verify lint passes**

Run: `cd client && npx eslint src/live/ActivityCard/index.jsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/ActivityCard/
git commit -m "feat(live): add ActivityCard component

One of the four fixed activity nodes (Node Rewards, Cloud Deployments, P2P
Transfers, Node Confirmations) — icon, label, count, primary/secondary
metric, intentional empty state (spec §40). Static/inert this session, no
click handler wired up yet (Session B). Not yet wired into Live.jsx
(Task 7)."
```

---

### Task 7: `FlowCanvas` component + Live.jsx integration

**Files:**
- Create: `client/src/live/FlowCanvas/index.jsx`
- Create: `client/src/live/FlowCanvas/index.scss`
- Modify: `client/src/live/Live.jsx`

**Interfaces:**
- Consumes: `FlowBlock` (Task 5), `ActivityCard` (Task 6), `FlowConnectors`
  (Task 4), `DETAIL_SECTIONS` from `live/categoryMeta.js`,
  `buildBlockFlowSummary` (Task 3).
- Produces: `<FlowCanvas block={displayedBlock} summary={summary} />`,
  rendered by `Live.jsx` between the page header and the existing
  `.live-main-stack` (ChainRail + DetailsPanel).

- [ ] **Step 1: Create `FlowCanvas/index.jsx`**

```jsx
import React, { useRef } from 'react';
import { FlowBlock } from 'live/FlowBlock';
import { ActivityCard } from 'live/ActivityCard';
import { FlowConnectors } from 'live/FlowConnectors';
import { DETAIL_SECTIONS } from 'live/categoryMeta';
import { FluxMark } from 'live/FluxMark';
import './index.scss';

const SECTION_BY_KEY = Object.fromEntries(DETAIL_SECTIONS.map((s) => [s.key, s]));
const QUADRANT_BY_KEY = { reward: 'top-left', deploy: 'top-right', p2p: 'bottom-left', confirm: 'bottom-right' };
const CARD_KEYS = ['reward', 'deploy', 'p2p', 'confirm'];

// Turns a buildBlockFlowSummary() result into the exact per-card
// count/primary/secondary/emptyLabel ActivityCard renders. Kept here (not
// inside ActivityCard) since it's presentation formatting specific to how
// this one canvas lays its four cards out, not a reusable concern.
function cardContentFor(key, summary) {
  switch (key) {
    case 'reward': {
      const { count, totalFlux, tiers } = summary.rewards;
      return {
        count,
        primary: `${totalFlux.toFixed(2)} FLUX`,
        secondary: tiers.map((t) => t.label).join(' · '),
        emptyLabel: 'No rewards paid out yet this block',
      };
    }
    case 'deploy': {
      const { count, apps } = summary.deployments;
      return {
        count,
        primary: apps.map((a) => a.name).join(' · '),
        secondary: null,
        emptyLabel: 'No deployments detected — waiting for network activity',
      };
    }
    case 'p2p': {
      const { count, totalFlux } = summary.p2p;
      return {
        count,
        primary: `${totalFlux.toFixed(4)} FLUX moved`,
        secondary: null,
        emptyLabel: 'No wallet-to-wallet transfers detected in this block',
      };
    }
    case 'confirm': {
      const { count, byTier } = summary.confirmations;
      return {
        count,
        primary: `${count} confirmation${count === 1 ? '' : 's'}`,
        secondary: byTier.map((t) => `${t.count} ${t.label}`).join(' · '),
        emptyLabel: 'No node confirmations seen yet this block',
      };
    }
    default:
      return { count: 0, primary: '', secondary: null, emptyLabel: '' };
  }
}

/*
 * The flow canvas is the hero region of /live (spec §7): a central block
 * connected to four fixed activity nodes by SVG connectors. Owns layout
 * composition only (spec §66) — FlowBlock/ActivityCard/FlowConnectors each
 * own their own presentation.
 */
export function FlowCanvas({ block, summary }) {
  const containerRef = useRef(null);
  const blockRef = useRef(null);
  // One stable ref-holding object for the component's lifetime — created
  // once via the outer useRef, not re-created every render, so
  // FlowConnectors' effect (which depends on this object's identity) does
  // not re-run on every unrelated re-render.
  const cardRefs = useRef({
    reward: React.createRef(),
    deploy: React.createRef(),
    p2p: React.createRef(),
    confirm: React.createRef(),
  }).current;

  if (!block || !summary) {
    return (
      <div className="live-flow-canvas live-flow-canvas--loading">
        <FluxMark />
        <span>Loading network activity…</span>
      </div>
    );
  }

  const colors = Object.fromEntries(CARD_KEYS.map((key) => [key, SECTION_BY_KEY[key].color]));

  return (
    <div className="live-flow-canvas" ref={containerRef}>
      <FlowConnectors containerRef={containerRef} blockRef={blockRef} cardRefs={cardRefs} colors={colors} />

      {CARD_KEYS.map((key) => {
        const content = cardContentFor(key, summary);
        return (
          <ActivityCard
            key={key}
            ref={cardRefs[key]}
            quadrant={QUADRANT_BY_KEY[key]}
            def={SECTION_BY_KEY[key]}
            count={content.count}
            primary={content.primary}
            secondary={content.secondary}
            emptyLabel={content.emptyLabel}
          />
        );
      })}

      <FlowBlock ref={blockRef} block={block} summary={summary} />
    </div>
  );
}
```

- [ ] **Step 2: Create `FlowCanvas/index.scss`**

```scss
@import 'styles/functional';

.live-flow-canvas {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas:
    'reward  .      deploy'
    '.       block  .'
    'p2p     .      confirm';
  align-items: center;
  justify-items: center;
  gap: 28px 24px;
  min-height: 560px;
  padding: 40px 32px;
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, #2b61d1 7%, transparent) 0%, transparent 55%),
    var(--surface-secondary);
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

  @include rule-mode-dark() {
    box-shadow: var(--shadow-md);
  }
}

.live-flow-canvas--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 300px;
  color: var(--text-tertiary);
  font-size: var(--live-fs-base);
}

@media (max-width: 1399px) {
  .live-flow-canvas {
    gap: 20px 16px;
    padding: 32px 20px;
    min-height: 500px;
  }
}

@media (max-width: 1199px) {
  .live-flow-canvas {
    gap: 16px;
    padding: 24px 16px;
    min-height: 460px;
  }
}

@media (max-width: 899px) {
  .live-flow-canvas {
    grid-template-columns: 1fr;
    grid-template-areas:
      'block'
      'reward'
      'deploy'
      'p2p'
      'confirm';
    min-height: 0;
    padding: 20px 16px;
  }
}
```

- [ ] **Step 3: Wire `FlowCanvas` into `Live.jsx`**

In `client/src/live/Live.jsx`, add the import and summary computation:

```js
import { mergeIncomingBlocks, removeLeavingBlock } from 'live/blockAnimation';
import { buildBlockFlowSummary } from 'live/blockFlowSummary';

import { ChainRail } from 'live/ChainRail';
import { DetailsPanel } from 'live/DetailsPanel';
import { FlowCanvas } from 'live/FlowCanvas';
```

Add `useMemo` to the React import at the top of the file:

```js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Then, right after the existing `displayedBlock` derivation (after the line
`const displayedBlock = displayBlocks.find((b) => b.height === displayedHeight) || null;`),
add:

```js
  const summary = useMemo(() => buildBlockFlowSummary(displayedBlock), [displayedBlock]);
```

Finally, render `FlowCanvas` between the header and `.live-main-stack`:

```jsx
      {unavailable && (
        <div className="live-unavailable">
          <Info size={16} className="live-unavailable-icon" />
          <span>Block data is temporarily unavailable — retrying automatically.</span>
        </div>
      )}

      <FlowCanvas block={displayedBlock} summary={summary} />

      <div className="live-main-stack">
```

(No other line in `Live.jsx` changes — polling, event accumulation, lock/
selection state are all untouched.)

- [ ] **Step 4: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same test count as after Task 3 (no new tests this task —
`FlowCanvas` is composition/integration, verified by build + manual smoke,
matching the no-test convention for `FlowConnectors`).

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files, no new ones from the new
components.

- [ ] **Step 5: Manual smoke check**

Run: `cd client && yarn start`, with `TESTING=true` set in
`client/public/runtime/app-content.js` (see `todo.md` / `donor/config.js` —
`/live` is donor-gated). Navigate to `/live`:

- The flow canvas renders below the page header: a central block (FluxMark,
  height, age, confirmation count, activity summary) with four cards around
  it (Node Rewards, Cloud Deployments, P2P Transfers, Node Confirmations),
  connected by faint curved lines.
- Cards with zero activity this block show their empty-state copy, not a
  blank card.
- Resize the browser window across all four breakpoints (>=1400px,
  1200-1399px, 900-1199px, <900px) — the canvas reflows without connectors
  crossing through card text, and connectors disappear below 900px where
  the layout stacks vertically.
- `ChainRail` and `DetailsPanel` below still work exactly as before
  (clicking a block, Lock button, section expand/collapse).

- [ ] **Step 6: Commit**

```bash
git add client/src/live/FlowCanvas/ client/src/live/Live.jsx
git commit -m "feat(live): add FlowCanvas and wire it into Live.jsx

Composes FlowBlock + four ActivityCards + FlowConnectors into the new hero
region, rendered between the page header and the existing ChainRail/
DetailsPanel stack. Live.jsx's polling, event accumulation, and lock/
selection state machinery are untouched — this only adds the derived
summary (buildBlockFlowSummary) and the new render output."
```

---

### Task 8: Restyle `ChainRail` (demoted) and `DetailsPanel` (polish)

**Files:**
- Modify: `client/src/live/ChainRail/index.scss`
- Modify: `client/src/live/DetailsPanel/index.scss`

**Interfaces:**
- Consumes: nothing new — CSS-only, no JS/behavior change in either
  component.
- Produces: no new interfaces — visual-only.

- [ ] **Step 1: Demote `ChainRail`'s visual weight**

Now that `FlowCanvas` is the page's visual hero, `ChainRail` becomes the
secondary component the spec calls for (§31: "It should be visually
secondary"). In `client/src/live/ChainRail/index.scss`, change only the
following (do not touch block width/slot geometry — `Live.jsx`'s
`CHAIN_BLOCK_SLOT_WIDTH` constant depends on the current 122px block width +
28px connector staying in sync, and resizing that is not worth the risk for
a purely visual demotion):

```scss
// Compound selector (not just .live-chain-rail) so this reliably beats the
// base .live-panel rule's own --panel-accent default regardless of which
// component's CSS happens to load first.
.live-panel.live-chain-rail {
  --panel-accent: #3b82f6;
  box-shadow: none;
  border-left-width: 2px;
}

.live-panel.live-chain-rail .live-panel-title {
  font-size: 0.62rem;
}
```

(Add these two rules right after the existing `.live-panel.live-chain-rail`
block at the top of the file — do not remove the existing `--panel-accent`
declaration, just add `box-shadow` and `border-left-width` alongside it, and
add the new `.live-panel-title` override below it.)

- [ ] **Step 2: Polish `DetailsPanel` spacing to match the new canvas system**

In `client/src/live/DetailsPanel/index.scss`, reduce the panel's reserved
minimum height (the flow canvas now provides the page's primary visual
bulk, so `DetailsPanel` no longer needs to reserve as much space) and align
section header padding to the 4/8px spacing scale (spec §45):

```scss
.live-panel.live-details-panel {
  --panel-accent: #64748b;
  min-height: 280px;
}
```

```scss
.live-detail-section-header {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--section-accent, #888) 10%, transparent) 0%, transparent 65%);
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--text-primary);
  transition: background var(--transition-fast);

  &:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--section-accent, #888) 16%, transparent) 0%, transparent 70%);
  }
}
```

(This replaces the existing `.live-panel.live-details-panel` block's
`min-height: 320px` with `280px`, and the existing
`.live-detail-section-header` block's `gap: 10px` / `padding: 11px 14px`
with `gap: 12px` / `padding: 12px 16px` — every other property in both
rules stays identical.)

- [ ] **Step 3: Run the full suite and build**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS — CSS-only change, no test should be affected.

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files.

- [ ] **Step 4: Manual smoke check**

With `yarn start` still running, confirm on `/live`:
- The chain rail below the flow canvas reads as visually secondary (smaller
  title, no shadow, thinner accent) but every block is still clickable and
  keyboard-navigable exactly as before.
- The details panel below that still expands/collapses each section
  correctly, with slightly tighter vertical spacing.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/ChainRail/index.scss client/src/live/DetailsPanel/index.scss
git commit -m "style(live): demote ChainRail, polish DetailsPanel spacing

CSS-only — no behavior change to either component. ChainRail reads as the
secondary history rail now that FlowCanvas is the page's visual hero (spec
§31); DetailsPanel's section header padding aligns to the 4/8px spacing
scale (spec §45) and its reserved min-height shrinks now that the canvas
carries the primary visual bulk."
```

---

### Task 9: Final integration verification

**Files:** none modified — verification only, plus doc status updates.

- [ ] **Step 1: Confirm the scope boundary held**

Run: `git diff --stat main` (from within the worktree, comparing against
the `main` branch this worktree branched from)
Expected: every changed file is under `client/src/live/` — no changes to
Home, Nodes, Analytics, Demo, nav, auth, routing, or
`client/src/styles/_global.scss` (spec §4/§75).

- [ ] **Step 2: Run the full test suite one more time**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, all tests green (baseline 290 + this session's new tests
across Tasks 1-3).

- [ ] **Step 3: Run the production build one more time**

Run: `cd client && npx react-scripts build`
Expected: exit 0, exactly the same 4 pre-existing baseline warning files
(Navbar, NodeGridTable, LayoutContext, WalletNodes) — no new warnings from
any file touched this session.

- [ ] **Step 4: Manual regression check on other routes**

Run: `cd client && yarn start`. Visit `/home`, `/nodes`, `/analytics` (with
`TESTING=true`), and toggle the theme switcher — confirm all four are
visually unaffected (spec §75's explicit route list). This is a spot-check,
not the full manual QA matrix — that's Session D's job (spec §74).

- [ ] **Step 5: Update `todo.md`**

In the repo-root `todo.md`, check off Session A in the Track 1 list:

```markdown
- [x] **Session A — Visual shell + data summaries.** `FlowCanvas`/`FlowBlock`/
  `ActivityCard`/`FlowConnectors`, restyled `ChainRail`/`DetailsPanel`,
  `buildBlockFlowSummary()` + tests, Dev Fund reward-category extraction.
  Shipped in PR #<fill in after opening the PR> — see
  `docs/superpowers/plans/2026-09-07-live-session-a.md` for the full task
  breakdown.
```

(Replace the existing unchecked Session A bullet with this — keep Sessions
B/C/D bullets exactly as they are.)

- [ ] **Step 6: Update `LIVE_REDESIGN_PLAN.md`**

In the repo-root `LIVE_REDESIGN_PLAN.md`, check off Session A in the "Build
order" list near the top:

```markdown
- [x] **Session A — Visual shell + data summaries** (spec Phases 1-2, §§6-24, 33-34, 66)
```

- [ ] **Step 7: Commit the doc updates**

```bash
git add todo.md LIVE_REDESIGN_PLAN.md
git commit -m "docs: mark Live Redesign Session A complete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01R8X1td2Hf3iERc3rhd4v39"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/live-session-a
gh pr create --base main --head feat/live-session-a \
  --title "feat(live): Session A — visual shell + data summaries" \
  --body "See docs/superpowers/plans/2026-09-07-live-session-a.md for the full task breakdown. Implements FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md Phases 1-2."
```

Fill in the actual PR number back into `todo.md`'s Session A line (Step 5)
with a follow-up commit once the number is known, matching the convention
every prior session in this repo has followed.

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** §6 (composition) → Task 7; §7-9 (canvas/block) → Tasks
  5, 7; §10-11 (cards) → Task 6; §20-23 (connectors) → Task 4; §33-34
  (summary/metadata) → Task 3; §43/45-47 (colour/spacing/depth) → constraint
  section + every SCSS task; §48 (responsive) → Task 7's SCSS breakpoints;
  §55 (data-driven, no hardcoded counts) → Task 7's `cardContentFor`; the
  Dev Fund decision from `LIVE_REDESIGN_PLAN.md` → Task 1. Explicitly-out-
  of-scope sections (§12-19 expansion, §22 non-idle connector states, §24-25
  choreography, §26-32 live/history) are correctly left untouched — Sessions
  B/C.
- **Type consistency check:** `buildBlockFlowSummary()`'s return shape
  (Task 3) matches exactly what `FlowCanvas`'s `cardContentFor` (Task 7)
  destructures (`summary.rewards.{count,totalFlux,tiers}`,
  `summary.deployments.{count,apps}`, `summary.p2p.{count,totalFlux}`,
  `summary.confirmations.{count,byTier}`) and what `FlowBlock` (Task 5)
  reads (`summary.rewards.count`, `summary.deployments.count`,
  `summary.p2p.count`, `summary.confirmations.count`) — no drift.
