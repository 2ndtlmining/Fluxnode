# Live Redesign Session D — Resilience + Final Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the four-session Live Redesign. Give `/live` honest partial-failure
behavior (one dead data source never blanks the rest of the block, and it recovers on
its own without a page reload), fix a real layout-stability bug where expanding a card
visibly shifts `ChainRail`/`DetailsPanel` down the page, tidy up spacing values that
drifted off the project's 4/8px scale, and finish with the full manual QA matrix +
regression pass the spec reserves for this session.

**Starting point:** A dedicated `Explore` survey of every file under `client/src/live/`
against spec §40-54 and §76-80 (full results kept in this session's own notes) found
most of "final polish" already satisfied by Sessions A-C: empty-state copy (§40), the
colour system (§43), typography scale (§44), depth/token usage (§46), the background dot
grid (§47), and reduced-motion coverage (§52) are all **already done** — verified against
the actual spec text and code line-by-line, not assumed. This plan only covers what's
genuinely missing:

1. **Partial API failure (§42) — MISSING.** `live/apidata.js`'s two per-block fetchers
   (`fetch_block_transactions`, `fetch_block_confirmations`) swallow a real fetch error
   into the exact same shape as "this block genuinely has zero of that activity" — a
   user has no way to tell a dead endpoint from a quiet block, and `Live.jsx`'s
   `fetchedHeightsRef` permanently marks a height "fetched" the instant it's attempted,
   **so a failed fetch is never retried even though the page already polls every 15s.**
2. **Stable layout (§49) — broken by design.** `ActivityCard`'s expansion is real
   `width`/`min-height` grid growth (145px → 320px, ~175px delta), and
   `.live-flow-canvas`'s own `min-height` (560px) is already smaller than its actual
   idle rendered height (~626px per the survey) — meaning it reserves nothing for the
   expanded state. Expanding any top/bottom-row card visibly pushes `ChainRail` and
   `DetailsPanel` down the page, which is exactly what spec §49 says must not happen.
3. **Spacing (§45) — partial drift.** Mostly on the 4/8/12/16/20/24/32/40/48 scale, but
   several values (`14px`, `145px`, `10px`, `6px`, `5px`, `122px`, `13px`) crept in
   across `Live.scss`, `ActivityCard/index.scss`, `ChainRail/index.scss`,
   `DetailsPanel/index.scss`.
4. **Full manual QA matrix + regression pass (§74-75)** — spot-checked per session so
   far, never run in full; this is the session the spec assigns it to.

**What this plan deliberately does NOT touch:** the responsive breakpoints (§48) already
land on the spec's exact 1400/1200/900px boundaries and correctly collapse to a single
stacked column below 900px — the fact that the two "radial" desktop tiers (≥1400px,
1200-1399px) share one grid-based layout rather than genuinely distinct radial geometry
is a Session A design decision already shipped across three merged, reviewed PRs;
redoing canvas geometry now would be a scope explosion this session's "polish" framing
does not license (spec §76: don't add scope just because there's room). Per-category
*loading* (distinct from *empty*, spec §41) is also intentionally not built as a new
first-load state: `Live.jsx` fetches all four categories for a block atomically before
it ever reaches `displayBlocks` (`ensureBlockDetailsFetched` is awaited first), so
there's no real first-load moment where the block is visible but one category is still
pending — only Task 1's failure/retry state, which already needs its own visual
treatment (Task 2). Deployment data is intentionally excluded from the new
unavailable-tracking mechanism (see Task 1's note) — its fetch (`fetch_global_app_specs`,
`client/src/apidata.js`, not `live/`) is shared across `/home`, `/analytics`, and `/live`;
changing its error contract risks the other two routes and is out of scope for a
`/live`-only session (spec §75: no unrelated route should change).

**Architecture:** Task 1 extends the existing per-block fetch/retry machinery already in
`Live.jsx` (`fetchedHeightsRef`, `eventsByHeightRef`) with a parallel "did this source
succeed" tracker, in the same shape and with the same retention trimming as the existing
`eventsByHeightRef`. Tasks 2-4 are presentation-only (SCSS + small prop threads) on top of
Task 1's data. Nothing here changes the 15s/5min polling cadence, the block/event data
model beyond adding one new field, or any file outside `client/src/live/`.

**Tech Stack:** React 18 (hooks), SCSS — no new npm dependency (spec §67), matching every
prior session.

**Spec:** `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (repo root) — this plan implements §42,
§45, §49, §74-75. See `LIVE_REDESIGN_PLAN.md`'s "Session D" section for how these were
scoped out of the 80-section spec.

## Global Constraints

- **No new npm dependency** (spec §67).
- **Global theme tokens untouched** (spec §4/§75) — only `client/src/live/**` files
  change, plus `todo.md`/`LIVE_REDESIGN_PLAN.md` doc checkboxes. Verify with
  `git diff --stat main` before the final commit.
- **`PREMIUM_TESTING_MODE`/`TESTING` toggle** in `client/public/runtime/app-content.js`:
  flip to `true` for local manual testing only, **always revert to `false` before
  committing** — confirm `git status` clean before any commit that isn't reverting it.
  Every prior session has had to remember this explicitly; don't be the one that forgets.
- **Deployments are out of scope for the unavailable-tracking mechanism** (see Task 1) —
  do not touch `client/src/apidata.js`'s `fetch_global_app_specs` or its cache/resilience
  behavior. That function is shared by `/home` and `/analytics`.
- **Retry granularity: per-block, not per-sub-source.** `fetch_block_transactions` feeds
  both Rewards and P2P from one HTTP call; `fetch_block_confirmations` feeds
  Confirmations from a separate call. On any failure for a block, Task 1 re-fetches
  *both* calls together on the next poll rather than tracking each of the two calls'
  success independently — simpler, and the extra request only happens during a real
  outage on a handful of still-visible blocks, not in steady state. Don't build
  finer-grained per-source retry tracking than this.
- **Test with** `cd client && CI=true npx react-scripts test --watchAll=false`,
  **build with** `npx react-scripts build`. Baseline going into this session (PR #186,
  merged): **321 tests, build exit 0, exactly 4 pre-existing baseline warning files**
  (`Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`,
  `WalletNodes/index.jsx`). Anything beyond those four is new work.
- **This repo does not use `@testing-library/react`.** Pure functions get unit tests
  (this session adds coverage to `apidata.test.js` and `blockFlowSummary.test.js`);
  component wiring and CSS get a manual QA pass, per every prior session's own note.

---

### Task 1: Per-block fetch-failure tracking, retry, and summary propagation

**Files:**
- Modify: `client/src/live/apidata.js` (`fetch_block_transactions`,
  `fetch_block_confirmations`, new `attachUnavailabilityToBlocks`)
- Modify: `client/src/live/apidata.test.js`
- Modify: `client/src/live/blockFlowSummary.js` (`buildBlockFlowSummary`)
- Modify: `client/src/live/blockFlowSummary.test.js`
- Modify: `client/src/live/Live.jsx` (`ensureBlockDetailsFetched`, its refs, `pollFast`)

**Interfaces:**
- `fetch_block_transactions(blockHash)` now returns `{ ok, coinbase, others }` — `ok:
  false` on any fetch/parse error (was previously indistinguishable from a real empty
  result). Every existing call site destructures `{ coinbase, others }` off the result
  already, so this is additive.
- `fetch_block_confirmations(blockHash)` now returns `{ ok, confirmingTxs }` instead of a
  bare array — **this changes the return shape**, so its one call site in `Live.jsx`
  needs updating (`buildConfirmationEvents(block, confirmingTxs)` still takes the plain
  array, just destructured out first).
- New `attachUnavailabilityToBlocks(blocks, unavailableByHeight)` — pure, mirrors the
  existing `attachEventsToBlocks(blocks, eventsByHeight)` exactly: attaches
  `block.unavailable = unavailableByHeight[block.height] || null` (not an empty object —
  `null` is the "nothing wrong" case, since most blocks will never be present in the map
  at all). Consumed by: Task 2 (`FlowCanvas`/`DetailsPanel` reading `block.unavailable`).
- `buildBlockFlowSummary(block)` gains: `summary.rewards.unavailable`,
  `summary.p2p.unavailable`, `summary.confirmations.unavailable` — each `!!` of
  `block.unavailable?.reward` / `?.p2p` / `?.confirm` respectively. **Deployments get no
  `unavailable` field** — leave `summarizeDeployments`'s return shape untouched.

- [ ] **Step 1: Write the failing tests**

Add to `apidata.test.js` (new `describe` block, following the existing
`attachEventsToBlocks` one at the bottom of the file):

```js
describe('attachUnavailabilityToBlocks', () => {
  it('attaches the recorded unavailability for a block by height', () => {
    const blocks = [{ height: 100 }];
    const unavailableByHeight = { 100: { reward: true, p2p: true, confirm: false } };

    const result = attachUnavailabilityToBlocks(blocks, unavailableByHeight);

    expect(result[0].unavailable).toEqual({ reward: true, p2p: true, confirm: false });
  });

  it('gives a block with nothing recorded null, not undefined or an empty object', () => {
    const result = attachUnavailabilityToBlocks([{ height: 100 }], {});
    expect(result[0].unavailable).toBeNull();
  });
});
```

Add to `blockFlowSummary.test.js` (extend whatever `describe('buildBlockFlowSummary', …)`
block already exists — read the file first to match its existing style/fixtures):

```js
it('marks rewards/p2p unavailable when the block carries that flag, leaves confirmations/deployments alone', () => {
  const block = { height: 5, hash: 'h', at: 1, events: [], unavailable: { reward: true, p2p: true, confirm: false } };
  const summary = buildBlockFlowSummary(block);
  expect(summary.rewards.unavailable).toBe(true);
  expect(summary.p2p.unavailable).toBe(true);
  expect(summary.confirmations.unavailable).toBe(false);
  expect(summary.deployments.unavailable).toBeUndefined();
});

it('defaults every category to not-unavailable when the block has no unavailable flag at all', () => {
  const block = { height: 5, hash: 'h', at: 1, events: [] };
  const summary = buildBlockFlowSummary(block);
  expect(summary.rewards.unavailable).toBe(false);
  expect(summary.p2p.unavailable).toBe(false);
  expect(summary.confirmations.unavailable).toBe(false);
});
```

Run `cd client && CI=true npx react-scripts test --watchAll=false -- apidata blockFlowSummary`
and confirm these new cases fail (function/field doesn't exist yet).

- [ ] **Step 2: Implement `fetch_block_transactions` / `fetch_block_confirmations`'s new return shape**

In `apidata.js`:

```js
export async function fetch_block_transactions(blockHash) {
  try {
    const res = await fetch(`${TXS_BY_BLOCK_ENDPOINT}?block=${blockHash}`);
    const json = await res.json();
    const txs = Array.isArray(json?.txs) ? json.txs : [];
    const coinbase = txs.find((t) => t.isCoinBase) || txs[0] || null;
    const others = txs.filter((t) => t !== coinbase);
    return { ok: true, coinbase, others };
  } catch {
    return { ok: false, coinbase: null, others: [] };
  }
}
```

```js
export async function fetch_block_confirmations(blockHash) {
  try {
    const res = await fetch(`${DAEMON_GETBLOCK_ENDPOINT}/${blockHash}`);
    const json = await res.json();
    const txs = Array.isArray(json?.data?.tx) ? json.data.tx : [];
    return { ok: true, confirmingTxs: txs.filter((t) => t && typeof t === 'object' && t.type === CONFIRMING_TX_TYPE) };
  } catch {
    return { ok: false, confirmingTxs: [] };
  }
}
```

Note: a successful response that simply lacks the expected fields (e.g. `json?.txs`
missing) still returns `ok: true` with an empty array — that's a real "nothing here"
result, not a fetch failure. Only the `catch` block means `ok: false`. Don't try to
detect "coinbase came back null on a syntactically valid response" as a failure signal
either — that would conflate a genuine schema surprise with a network failure; the
`try`/`catch` boundary is the only failure signal this task adds.

- [ ] **Step 3: Implement `attachUnavailabilityToBlocks`**

Add directly below `attachEventsToBlocks` in `apidata.js`, matching its exact style:

```js
// Attaches recorded per-source failure flags (keyed by block height) onto each fetched
// block, mirroring attachEventsToBlocks above. `null` (not an empty object) for a block
// nothing went wrong on — most blocks, always — so downstream code's `block.unavailable
// != null` reads as a genuine "something's wrong with this one" check.
export function attachUnavailabilityToBlocks(blocks, unavailableByHeight) {
  return (blocks || []).map((block) => ({
    ...block,
    unavailable: unavailableByHeight?.[block.height] || null,
  }));
}
```

- [ ] **Step 4: Wire retry + unavailability tracking into `Live.jsx`**

Replace the `fetchedHeightsRef` `Set` with a status map ref, and add an unavailability
map ref alongside `eventsByHeightRef` (same retention trimming pattern —
`EVENTS_BY_HEIGHT_RETENTION` already exists as a constant, reuse it):

```js
// was: const fetchedHeightsRef = useRef(new Set());
const blockFetchStatusRef = useRef({}); // { [height]: { ok: boolean } }
const unavailableByHeightRef = useRef({}); // { [height]: { reward, p2p, confirm } }
```

Rewrite `ensureBlockDetailsFetched`:

```js
const ensureBlockDetailsFetched = useCallback(async (blocks) => {
  const addressGeoMap = globalRankingsRef.current?.addressGeoMap;
  const toFetch = blocks.filter((b) => !blockFetchStatusRef.current[b.height]?.ok);
  if (toFetch.length === 0) return;

  await Promise.all(
    toFetch.map(async (block) => {
      const [{ ok: txsOk, coinbase, others }, { ok: confirmOk, confirmingTxs }] = await Promise.all([
        fetch_block_transactions(block.hash),
        fetch_block_confirmations(block.hash),
      ]);

      blockFetchStatusRef.current[block.height] = { ok: txsOk && confirmOk };
      unavailableByHeightRef.current[block.height] =
        txsOk && confirmOk ? undefined : { reward: !txsOk, p2p: !txsOk, confirm: !confirmOk };

      const rewards = extractRewardsFromCoinbase(coinbase);
      const events = [
        ...buildRewardEvents(block, rewards, addressGeoMap),
        ...buildConfirmationEvents(block, confirmingTxs),
        ...extractP2pTransfers(others),
      ];
      rememberEvents(events);
    })
  );

  // Same unbounded-growth guard as eventsByHeightRef — see rememberEvents above.
  const heights = Object.keys(blockFetchStatusRef.current).map(Number).sort((a, b) => b - a);
  for (const h of heights.slice(EVENTS_BY_HEIGHT_RETENTION)) {
    delete blockFetchStatusRef.current[h];
    delete unavailableByHeightRef.current[h];
  }
}, [rememberEvents]);
```

In `pollFast`, thread the new attach call in alongside the existing one:

```js
const withEvents = attachEventsToBlocks(recentBlocks, eventsByHeightRef.current);
const withUnavailability = attachUnavailabilityToBlocks(withEvents, unavailableByHeightRef.current);

setDisplayBlocks((prev) => {
  const next = mergeIncomingBlocks(prev, withUnavailability, visibleBlockCount);
  // ... rest unchanged
```

Don't forget the import line update: `attachEventsToBlocks` → also import
`attachUnavailabilityToBlocks` from `'live/apidata'`.

- [ ] **Step 5: Verify**

```
cd client && CI=true npx react-scripts test --watchAll=false
```

All new tests pass, full suite still green. This task adds no new component rendering,
so no manual QA yet — Task 2 covers the visible behavior.

---

### Task 2: Per-category "temporarily unavailable" UI

**Files:**
- Modify: `client/src/live/FlowCanvas/index.jsx` (`cardContentFor`)
- Modify: `client/src/live/ActivityCard/index.jsx`
- Modify: `client/src/live/ActivityCard/index.scss`
- Modify: `client/src/live/DetailsPanel/index.jsx` (`Section`)

**Interfaces:**
- `cardContentFor(key, summary)` gains `unavailable` and `unavailableLabel` fields on its
  return value for the `'reward'`, `'p2p'`, and `'confirm'` cases only (not `'deploy'` —
  see Task 1's scope note). Consumed by `ActivityCard`.
- `ActivityCard` gains an `unavailable` prop (boolean) alongside its existing
  `emptyLabel` — when true and the card is not expanded, renders `unavailableLabel`
  instead of the empty/primary content, and gets a new `live-flow-card--unavailable`
  modifier class for a distinct (calm, not alarming — spec §79) visual treatment matching
  the existing amber/informational tone the codebase already uses elsewhere, not a
  red/error look.
- `DetailsPanel`'s `Section` gains an `unavailable` prop (boolean), computed by its
  caller as `block.unavailable?.[def.key]` (reads directly off the block — `DetailsPanel`
  already receives `block` as a prop, no new prop needed on `DetailsPanel` itself).

- [ ] **Step 1: `FlowCanvas`'s `cardContentFor`**

Add the field to the `'reward'`, `'p2p'`, and `'confirm'` branches, e.g.:

```js
case 'reward': {
  const { count, totalFlux, tiers, unavailable } = summary.rewards;
  return {
    count,
    primary: `${totalFlux.toFixed(2)} FLUX`,
    secondary: tiers.map((t) => t.label).join(' · '),
    emptyLabel: 'No rewards paid out yet this block',
    unavailable,
    unavailableLabel: 'Reward data temporarily unavailable — retrying automatically',
  };
}
```

Same shape for `'p2p'` ("P2P transfer data temporarily unavailable — retrying
automatically") and `'confirm'` ("Confirmation data temporarily unavailable — retrying
automatically"), matching spec §42's example wording style. Leave `'deploy'` as-is.

- [ ] **Step 2: `ActivityCard`**

Thread `unavailable`/`unavailableLabel` through the prop list and destructure. Add the
modifier class alongside the existing ones:

```js
const classes = [
  'live-flow-card',
  `live-flow-card--${quadrant}`,
  isEmpty && !unavailable && 'live-flow-card--empty',
  unavailable && 'live-flow-card--unavailable',
  isExpanded && 'live-flow-card--expanded',
  isDimmed && 'live-flow-card--dimmed',
  isPulsing && 'live-flow-card--pulse',
].filter(Boolean).join(' ');
```

In the body's conditional rendering, `unavailable` takes priority over the empty branch
(a card can be both, since a failed fetch produces `count: 0`) but never over `isExpanded`
— if the user has a card open, don't yank the expanded body away just because a poll
mid-view found the source still down; the next successful poll's data update fixes it in
place:

```jsx
{isExpanded ? (
  /* unchanged */
) : unavailable ? (
  <div className="live-flow-card-unavailable">{unavailableLabel}</div>
) : isEmpty ? (
  <div className="live-flow-card-empty">{emptyLabel}</div>
) : (
  /* unchanged */
)}
```

Also gate the pulse animation on `!unavailable` if not already implied by `count` being
falsy for a failed fetch (it already is, via `categoriesToPulse`'s `count` check in
`blockAnimation.js` — no change needed there, just confirm during manual QA that an
unavailable card never pulses).

- [ ] **Step 3: `ActivityCard/index.scss`**

Add `.live-flow-card--unavailable` and `.live-flow-card-unavailable` rules near the
existing `--empty`/`.live-flow-card-empty` ones. Reuse the existing amber/confirmations
accent color token already in scope (`categoryMeta.js`'s confirm color) or a neutral
warning tone already used elsewhere in the codebase for "informative, not alarming" —
do not introduce a new red/error color. Follow the 4/8 spacing scale (Task 4 is cleaning
up existing drift — don't add new off-scale values here).

- [ ] **Step 4: `DetailsPanel`'s `Section`**

Add `unavailable` to `Section`'s props, and branch on it inside the expanded body ahead
of the existing empty/list check:

```jsx
{expanded && (
  <div className="live-detail-section-body">
    {unavailable ? (
      <div className="live-detail-unavailable">{def.unavailableLabel || 'Data temporarily unavailable — retrying automatically'}</div>
    ) : items.length === 0 ? (
      <div className="live-detail-empty">{def.emptyLabel || 'None this block'}</div>
    ) : (
      items.map((e) => <RowComponent key={e.id} event={e} globalRankings={globalRankings} />)
    )}
  </div>
)}
```

Find wherever `DetailsPanel` renders its `Section` list (read the file first — this is
below the excerpt already reviewed) and pass `unavailable={block?.unavailable?.[def.key]}`
per section. Add a plain `.live-detail-unavailable` SCSS rule near `.live-detail-empty`.

- [ ] **Step 5: Verify**

No new unit tests needed here (pure presentation wiring, per this repo's convention).
Run the full suite to confirm nothing broke:

```
cd client && CI=true npx react-scripts test --watchAll=false
```

Manual QA: temporarily force `fetch_block_transactions`/`fetch_block_confirmations` to
return `ok: false` (e.g. a local `throw` inside the `try` block, reverted before
committing) and confirm via `yarn start`: the affected card(s) show the unavailable
message without blanking the other cards or the central block, the `DetailsPanel`
section shows the matching message, and — leaving the forced failure in for a couple of
poll cycles — that the card recovers to real data once you remove the forced failure and
wait for the next 15s poll (proving the retry actually happens, not just the display).

---

### Task 3: Stable layout — expansion must not shift `ChainRail`/`DetailsPanel`

**Files:**
- Modify: `client/src/live/FlowCanvas/index.scss`

**Goal (spec §49):** Expanding any single `ActivityCard` (145px → 320px min-height, a
~175px delta) must not change `.live-flow-canvas`'s total rendered height — verified by
comparing `ChainRail`'s on-screen top edge before and after expanding a top-row
(Rewards/Deployments) card and a bottom-row (P2P/Confirmations) card. Currently it does,
because the card rows auto-size from content and the canvas's `min-height` (560px) is
already smaller than the idle rendered height (~626px), so it reserves nothing.

**Suggested approach:** Give the top and bottom card grid rows (currently implicit/
auto-sized — see `grid-template-areas`/`grid-template-rows` in `FlowCanvas/index.scss`)
an explicit fixed height matching the *expanded* card's `min-height` (320px), rather than
the default 145px. This means idle state carries some intentional reserved space around
the (still centered) block — acceptable per spec §79's "calm, premium" idle framing, not
the "huge blank space" §40 warns against (that section is about a category's own empty
copy, not overall canvas breathing room). This keeps the fix to a CSS-only, low-risk
change rather than restructuring expansion to an absolutely-positioned overlay (a bigger,
riskier rework this session's "polish" scope doesn't call for). Pick whichever concrete
technique actually achieves a pixel-stable canvas height when you test it — the
acceptance criterion below is what matters, not the specific CSS property used.

- [ ] **Step 1: Implement and self-verify with a before/after screenshot comparison**

Via `yarn start` + browser automation (or manual): screenshot `/live` idle, screenshot it
with a top-row card expanded, screenshot it with a bottom-row card expanded. Confirm
`ChainRail`'s rendered top-edge Y-position is identical (or within a couple px of
rounding) across all three. Repeat at one narrower desktop breakpoint (e.g. 1300px) to
confirm the fix holds there too — do not check the <900px stacked layout, where cards
already stack in normal document flow and a card growing taller pushing the next card
down *is* the correct, expected mobile behavior (spec §48 never asks mobile expansion to
be non-disruptive the way the desktop radial/grid canvas does).

- [ ] **Step 2: Verify no regression**

```
cd client && CI=true npx react-scripts test --watchAll=false
npx react-scripts build
```

Full suite green, build exit 0, only the 4 baseline warning files.

---

### Task 4: Spacing scale cleanup

**Files:**
- Modify: `client/src/live/Live.scss`
- Modify: `client/src/live/ActivityCard/index.scss`
- Modify: `client/src/live/ChainRail/index.scss`
- Modify: `client/src/live/DetailsPanel/index.scss`

**Goal (spec §45):** Normalize spacing values that drifted off the 4/8/12/16/20/24/32/
40/48px scale to the nearest value on that scale, without changing the overall visual
proportions enough to look different at a glance. This is a cleanup pass, not a redesign
— if rounding a specific value would visibly break an alignment (e.g. a value that's
deliberately half of an adjacent 8px gap), leave it and note why in a code comment rather
than forcing it onto the scale.

Known off-scale values found during this session's survey (re-verify against the actual
current file contents before changing anything — line numbers may have shifted since):

- `Live.scss`: `gap: 14px` (→ likely 12px or 16px), `padding: 14px 16px 16px` (the 14px →
  12px or 16px).
- `ActivityCard/index.scss`: `min-height: 145px` (this one anchors Task 3's fixed-row-
  height fix — coordinate with Task 3's chosen value rather than changing it in isolation
  and having the two tasks disagree; if Task 3 already landed first, treat 145px as
  downstream of whatever Task 3 settled the expanded height at), `gap: 10px` (→ 8px or
  12px), `gap: 8px; padding: 6px 0` (the `6px` → 4px or 8px).
- `ChainRail/index.scss`: `padding: 6px 4px 10px` (6px/10px → nearest scale value),
  `gap: 5px; width: 122px; padding: 16px 10px 13px` (5px/10px/13px — `width: 122px` is
  explicitly tied to `CHAIN_BLOCK_SLOT_WIDTH = 150` in `Live.jsx`'s own comment about
  keeping the two in sync manually — **do not change `122px` without also updating that
  constant and re-verifying the `ResizeObserver`-driven block-count math still fits
  correctly**, or leave it alone entirely if the coordination risk isn't worth a pure
  spacing nitpick).
- `DetailsPanel/index.scss`: `padding: 2px 14px 12px` (14px → nearest scale value).

- [ ] **Step 1: Apply the cleanup**

Go file by file, adjust the values above (re-confirming each still exists and still
matches this description first), and check for any other stray non-scale value while
you're in each file. Skip `ChainRail/index.scss`'s `122px` unless you also update
`CHAIN_BLOCK_SLOT_WIDTH` in `Live.jsx` and re-verify the resize math (see above) — this
one value is genuinely allowed to stay off-scale if that coordination isn't worth doing.

- [ ] **Step 2: Verify no visual regression**

Manual QA via `yarn start`: screenshot each modified component (the four `ActivityCard`
quadrants idle/expanded, `ChainRail`, `DetailsPanel`) before and after, at 1920×1080,
confirming nothing looks visibly broken or misaligned. Run the full suite + build:

```
cd client && CI=true npx react-scripts test --watchAll=false
npx react-scripts build
```

---

### Task 5: Final manual QA matrix + full regression pass (spec §74-75)

**Files:** none expected (verification-only task) — fix forward here only if this step
surfaces something Tasks 1-4 got wrong.

This is the capstone task: the full matrix the spec explicitly reserves for whichever
session ships last, rather than the per-session spot-checks used throughout Sessions
A-D. Not practical to brute-force every one of the spec's 7 viewports × ~14 states
combinations — pick the intersection actually plausible given what changed:

- [ ] **Step 1: Viewport sweep** — at minimum 1920×1080, 1024×768 (mid），and 390×844
  (mobile stack), confirm the page renders correctly and Task 3's stability fix holds at
  each.
- [ ] **Step 2: Data-state sweep** — prioritize states Tasks 1-2 actually touch: partial
  API failure (forced, per Task 2's manual QA), all-four-empty, all-four-active, many
  confirmations (if reachable via a real recent block), long app names/addresses (spot
  data-driven, may need a synthetic block or accept "not currently reachable, noted" if
  no real example exists in recent blocks).
- [ ] **Step 3: Interaction sweep** — hover, expand, collapse, Escape, keyboard
  (Tab/Enter/Space), history (click an older rail block), Return to Live, new-block-
  while-historical. These were already covered by Sessions B/C's own QA — this is a
  final confirmation they still hold after Tasks 1-4's changes, not a first-time check.
- [ ] **Step 4: Regression check (spec §75)** —
  ```
  git diff --stat main
  ```
  confirm only `client/src/live/**` plus `todo.md`/`LIVE_REDESIGN_PLAN.md`/this plan doc
  changed. Then manually verify `/home`, `/nodes`, `/analytics`, top navigation, and the
  light/dark theme toggle are all visually and functionally unaffected (`yarn start` +
  spot check each route) — matches the check every prior session in this plan has done.
- [ ] **Step 5: Full test suite + production build**
  ```
  cd client && CI=true npx react-scripts test --watchAll=false
  npx react-scripts build
  ```
  Record the final test count and confirm build exit 0 with only the 4 pre-existing
  baseline warning files (Navbar, NodeGridTable, LayoutContext, WalletNodes) — anything
  else is new and must be explained or fixed before merge.
- [ ] **Step 6: Documentation** — check off Session D in `todo.md` and
  `LIVE_REDESIGN_PLAN.md`, same convention as every prior session. **Do not leave the PR
  number as a placeholder** — this exact mistake happened on PR #184, #185, *and* #186
  (three sessions in a row); either open the PR first and fill in the real number before
  the doc commit, or treat backfilling it as a mandatory same-session follow-up commit
  immediately once the PR number is known, and confirm before merge that it's actually
  been done (don't just intend to).
- [ ] **Step 7: `PREMIUM_TESTING_MODE` check** — confirm it's `false` in
  `client/public/runtime/app-content.js` and `git status` is otherwise clean before the
  final commit.

Once this task is green, this plan — and the four-session Live Redesign — is complete.
