# Live Redesign Session C — History + Details Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/live` an honest, non-disruptive way to look at history — a real status
badge (LIVE/SYNCING/DELAYED/HISTORY), a "Return to Live" affordance that survives a new
block landing mid-inspection, richer rail/block hover detail, and a working "View full
details →" action that actually jumps into `DetailsPanel`.

**Architecture:** Almost everything here is new presentation and wiring on top of state
`Live.jsx` already has (`selectedHeight`, `expandedCategory`) or that the spec explicitly
suggests adding (`focusedDetailCategory`). Two new pure functions get dedicated unit
tests (`computeLiveStatus`, extended `isFreshLiveTip` coverage); everything else is
React wiring + SCSS, verified manually per this codebase's established convention (see
`docs/superpowers/plans/2026-09-07-live-session-b.md`'s own testing-convention note —
pure logic gets tests, presentational/wiring components get a manual QA pass, because
this repo does not use `@testing-library/react`).

**Tech Stack:** React 18 (hooks), SCSS, `lucide-react` icons, plain `Date.now()`/
`matchMedia` — no new npm dependency (spec §67).

**Spec:** `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (repo root) — this plan implements §26-32,
§37-39, §57 (already satisfied, verified not re-broken), §63-65, §68, §72. See
`LIVE_REDESIGN_PLAN.md`'s "Session C" section for how these were scoped out of the
80-section spec.

## Global Constraints

- **No new npm dependency** (spec §67) — React + CSS + SVG + `ResizeObserver`/
  `matchMedia` only, matching Sessions A and B.
- **Global theme tokens untouched** (spec §4/§75) — only `client/src/live/**` files
  change, plus `todo.md`/`LIVE_REDESIGN_PLAN.md` doc checkboxes. Verify with
  `git diff --stat main` before the final commit.
- **`PREMIUM_TESTING_MODE`/`TESTING` toggle** in `client/public/runtime/app-content.js`:
  flip to `true` for local manual testing only, **always revert to `false` before
  committing** — confirm `git status` clean before any commit that isn't reverting it.
- **Preserve existing data foundation** — 15s/5min polling, `live/apidata.js` event
  extraction, `blockAnimation.js`'s phase state machine, `categoryMeta.js`/
  `tierMeta.js` — this session adds new *presentation* state, it does not touch how
  blocks/events are fetched.
- **Keep the existing state architecture where possible rather than renaming
  everything** (spec §68) — `selectedHeight` and `expandedCategory` keep their current
  names and semantics; only `focusedDetailCategory` is new state, exactly as spec §68
  suggests.
- **Test with** `cd client && CI=true npx react-scripts test --watchAll=false`,
  **build with** `npx react-scripts build`. Baseline going into this session (PR #185,
  merged): **317 tests, build exit 0, exactly 4 pre-existing baseline warning files**
  (`Navbar/index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`,
  `WalletNodes/index.jsx`). Anything beyond those four is new work.

## Design decision: retire the `DetailsPanel` Lock/Unlock button

`DetailsPanel` currently has its own `Lock`/`Unlock` button (`live-lock-btn`) that
toggles the exact same `selectedHeight` state a `ChainRail` block click does
(`handleToggleLock`, `Live.jsx:256-259`: `setSelectedHeight((prev) => (prev != null ?
null : tipHeight))`). Once this session adds a spec-driven LIVE/HISTORY status badge
with its own "Return to Live" action covering the identical state transition, keeping
both affordances would give the page two different visual languages (Lock/Unlock vs.
LIVE/HISTORY) for one concept — confusing, and outside `DetailsPanel`'s spec-assigned
job of "full evidence / deep inspection" (spec §37), not page navigation chrome. This
plan removes `live-lock-btn` and the `locked`/`onToggleLock` props entirely (Task 3).
The one thing the old Lock button did that a rail click alone doesn't obviously
communicate — "freeze on the block I'm looking at right now, even if it's still the
live tip" — is still fully reachable: clicking the tip block in the rail (which gets a
Live marker in Task 6, making it obvious which one that is) sets `selectedHeight` to
that exact height, identically to what Lock did.

---

### Task 1: `computeLiveStatus` pure function

**Files:**
- Create: `client/src/live/liveStatus.js`
- Test: `client/src/live/liveStatus.test.js`

**Interfaces:**
- Produces: `computeLiveStatus({ isFollowingLive, hasEverLoaded, unavailable })` →
  one of the strings `'live' | 'syncing' | 'delayed' | 'historical'`. Consumed by
  Task 3 (`Live.jsx`) and Task 2 (`LiveStatusBadge`, via the value Task 3 passes it).

- [ ] **Step 1: Write the failing tests**

```js
import { computeLiveStatus } from './liveStatus';

describe('computeLiveStatus', () => {
  it('is historical whenever not following live, regardless of other flags', () => {
    expect(computeLiveStatus({ isFollowingLive: false, hasEverLoaded: true, unavailable: true })).toBe('historical');
    expect(computeLiveStatus({ isFollowingLive: false, hasEverLoaded: false, unavailable: false })).toBe('historical');
  });

  it('is syncing before the first successful load, while following live', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: false, unavailable: false })).toBe('syncing');
  });

  it('is delayed once data has loaded before but polling is currently failing', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: true, unavailable: true })).toBe('delayed');
  });

  it('is live once loaded and polling is healthy', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: true, unavailable: false })).toBe('live');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=liveStatus`
Expected: FAIL — `Cannot find module './liveStatus'`

- [ ] **Step 3: Implement**

```js
// client/src/live/liveStatus.js

/*
 * Spec §26: four states, in priority order. "Historical" always wins — it's a
 * deliberate user choice (clicked an older block) and should never be masked
 * by a transient polling hiccup. "Syncing" only applies before the very first
 * successful poll has ever resolved (spec's "Checking network…"); after that,
 * a failed poll streak is "Delayed" (spec's "Retrying automatically"), not a
 * reversion to Syncing — the page has real (if stale) data to keep showing.
 */
export function computeLiveStatus({ isFollowingLive, hasEverLoaded, unavailable }) {
  if (!isFollowingLive) return 'historical';
  if (!hasEverLoaded) return 'syncing';
  if (unavailable) return 'delayed';
  return 'live';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=liveStatus`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/live/liveStatus.js client/src/live/liveStatus.test.js
git commit -m "feat(live): add computeLiveStatus pure function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 2: `LiveStatusBadge` component

**Files:**
- Create: `client/src/live/LiveStatusBadge/index.jsx`
- Create: `client/src/live/LiveStatusBadge/index.scss`

**Interfaces:**
- Consumes: nothing from earlier tasks except the `status` string shape Task 1 defines
  (`'live' | 'syncing' | 'delayed' | 'historical'`).
- Produces: `<LiveStatusBadge status tipHeight updatedAgoText selectedHeight
  historicalAgoText onReturnToLive />`, consumed by Task 3.

- [ ] **Step 1: Create the component**

```jsx
// client/src/live/LiveStatusBadge/index.jsx
import React from 'react';
import './index.scss';

/*
 * Spec §26-27: an honest status readout — never claims websocket-precision
 * realtime, never predicts "next block in Ns". Four states map 1:1 to
 * computeLiveStatus's return values (live/liveStatus.js).
 */
export function LiveStatusBadge({ status, tipHeight, updatedAgoText, selectedHeight, historicalAgoText, onReturnToLive }) {
  if (status === 'historical') {
    return (
      <div className="live-status-badge live-status-badge--historical">
        <span className="live-status-label">HISTORY</span>
        <span className="live-status-detail">
          Viewing #{selectedHeight}{historicalAgoText ? ` · ${historicalAgoText}` : ''}
        </span>
        <button type="button" className="live-status-return-btn" onClick={onReturnToLive}>
          Return to Live
        </button>
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div className="live-status-badge live-status-badge--syncing">
        <span className="live-status-dot live-status-dot--syncing" />
        <span className="live-status-label">SYNCING</span>
        <span className="live-status-detail">Checking network…</span>
      </div>
    );
  }

  if (status === 'delayed') {
    return (
      <div className="live-status-badge live-status-badge--delayed">
        <span className="live-status-dot live-status-dot--delayed" />
        <span className="live-status-label">DELAYED</span>
        <span className="live-status-detail">
          Last update {updatedAgoText || 'a while ago'} · Retrying automatically
        </span>
      </div>
    );
  }

  return (
    <div className="live-status-badge live-status-badge--live">
      <span className="live-status-dot live-status-dot--live" />
      <span className="live-status-label">LIVE</span>
      <span className="live-status-detail">
        {tipHeight != null ? `Network tip #${tipHeight} · ` : ''}Updated {updatedAgoText || 'just now'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

```scss
// client/src/live/LiveStatusBadge/index.scss

.live-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: var(--live-fs-xs);
}

.live-status-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.live-status-detail {
  color: var(--text-tertiary);
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}

.live-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.live-status-badge--live {
  .live-status-label { color: #22c55e; }
  .live-status-dot--live {
    background: #22c55e;
    animation: live-status-pulse-dot 1.6s ease-in-out infinite;
  }
}

.live-status-badge--syncing {
  .live-status-label { color: var(--text-tertiary); }
  .live-status-dot--syncing {
    background: var(--text-tertiary);
    animation: live-status-pulse-dot 1s ease-in-out infinite;
  }
}

.live-status-badge--delayed {
  .live-status-label { color: #eab308; }
  .live-status-dot--delayed { background: #eab308; }
}

.live-status-badge--historical {
  .live-status-label { color: #64748b; }
}

@keyframes live-status-pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.live-status-return-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
  background: var(--surface-primary);
  color: var(--text-secondary);
  font-size: var(--live-fs-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-status-dot { animation: none; }
}
```

- [ ] **Step 3: Manual verification (no automated test — pure presentation, mirrors
  Session B's ActivityCard/FlowBlock convention)**

Not wired into `Live.jsx` yet (Task 3 does that) — nothing to click yet. Just confirm
`npx eslint client/src/live/LiveStatusBadge/index.jsx` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/LiveStatusBadge/
git commit -m "feat(live): add LiveStatusBadge component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 3: Wire status + Return to Live into `Live.jsx`

**Files:**
- Modify: `client/src/live/Live.jsx`
- Modify: `client/src/live/DetailsPanel/index.jsx` (remove Lock/Unlock button + props)
- Modify: `client/src/live/DetailsPanel/index.scss` (remove `.live-lock-btn` rules)

**Interfaces:**
- Consumes: `computeLiveStatus` (Task 1), `<LiveStatusBadge>` (Task 2), `relativeTime`
  (existing, `live/timeFormat.js`).
- Produces: `handleReturnToLive` callback in `Live.jsx`, consumed by Task 5
  (`NewBlockNotice`).

- [ ] **Step 1: Remove the Lock/Unlock button from `DetailsPanel`**

In `client/src/live/DetailsPanel/index.jsx`:
- Remove the `Lock, Unlock` import from `lucide-react` (keep `ChevronDown`).
- Remove the `locked`, `onToggleLock` parameters from the `DetailsPanel` function
  signature.
- Remove the `<button className="live-lock-btn" ...>` block entirely from the header
  (lines currently ~170-178) — the header now renders just the title span.

In `client/src/live/DetailsPanel/index.scss`, delete the entire `.live-lock-btn { ... }`
rule block (currently lines ~7-30).

- [ ] **Step 2: Add `computeLiveStatus` wiring and `handleReturnToLive` to `Live.jsx`**

Add the import near the other `live/` imports:

```js
import { computeLiveStatus } from 'live/liveStatus';
import { LiveStatusBadge } from 'live/LiveStatusBadge';
```

Replace the `handleToggleLock` callback (currently `Live.jsx:256-259`) with:

```js
  // Spec §30: clears selectedHeight, but must NOT let the new-block pulse
  // fire for a tip that advanced while the user was looking at history — the
  // pulse is "a block just landed", not "here's everything you missed". By
  // writing tipHeight into lastAnimatedHeightRef synchronously, before the
  // isFreshLiveTip effect below re-runs, the effect sees tipHeight ===
  // lastAnimatedHeight and correctly stays quiet (spec: "Do not replay a
  // new-block animation unless a genuinely new block was detected at that
  // moment").
  const handleReturnToLive = useCallback(() => {
    if (tipHeight != null) lastAnimatedHeightRef.current = tipHeight;
    setSelectedHeight(null);
  }, [tipHeight]);
```

Remove the old `handleToggleLock` definition and its `// eslint-disable-next-line
react-hooks/exhaustive-deps` comment entirely — `handleReturnToLive` replaces it and
needs no such suppression (its one dependency, `tipHeight`, is genuinely used and
listed).

Add a `hasEverLoaded` derivation right after the existing `tipHeight`/`displayedHeight`
block (~`Live.jsx:223-229`):

```js
  const hasEverLoaded = displayBlocks.length > 0;
  const liveStatus = computeLiveStatus({ isFollowingLive, hasEverLoaded, unavailable });
```

- [ ] **Step 3: Compute the "ago" text and render `LiveStatusBadge`**

Right below the `liveStatus` line, add:

```js
  // Reuses the tip block's own timestamp rather than tracking a separate
  // "last successful poll" wall-clock value (spec §69: prefer derived state)
  // — at a 15s poll / ~30s block cadence, block age and poll recency read
  // the same to a user either way, and this avoids a second source of truth.
  const tipBlock = displayBlocks.find((b) => b.phase !== 'leaving') || null;
  const updatedAgoText = tipBlock ? relativeTime(tipBlock.at) : null;
  const historicalAgoText = locked && displayedBlock ? relativeTime(displayedBlock.at) : null;
```

Add the `relativeTime` import to the existing `live/timeFormat` import (if `Live.jsx`
does not already import it directly — check first; it currently does not, so add):

```js
import { relativeTime } from 'live/timeFormat';
```

Note `locked` (`const locked = selectedHeight != null;`, already defined at
`Live.jsx:227`) is kept as a local variable — it's just no longer passed to
`DetailsPanel` (Task 1's removal). It's still exactly `!isFollowingLive`, used here for
readability at the call site.

Replace the static badge markup in the header (currently `Live.jsx:279-282`):

```jsx
          <span className="live-live-badge">
            <span className="live-live-dot" />
            LIVE
          </span>
```

with:

```jsx
          <LiveStatusBadge
            status={liveStatus}
            tipHeight={tipHeight}
            updatedAgoText={updatedAgoText}
            selectedHeight={selectedHeight}
            historicalAgoText={historicalAgoText}
            onReturnToLive={handleReturnToLive}
          />
```

Remove the now-unused `.live-live-badge`/`.live-live-dot`/`@keyframes live-pulse-dot`
rules from `client/src/live/Live.scss` (lines ~50-76) — `LiveStatusBadge`'s own SCSS
(Task 2) fully replaces them.

Update the `<DetailsPanel>` call (currently `Live.jsx:315-320`) to drop the two removed
props:

```jsx
        <DetailsPanel
          block={displayedBlock}
          globalRankings={globalRankings}
        />
```

- [ ] **Step 4: Manual verification**

`cd client && yarn start`, navigate to `/live` (flip `TESTING` to `true` in
`client/public/runtime/app-content.js` first if `/live` isn't reachable directly in
your environment — **revert before committing**):
- Confirm the header shows `● LIVE` with `Network tip #<height> · Updated <n>s ago`,
  updating as new blocks land.
- Click an older block in the rail. Confirm the header switches to `HISTORY / Viewing
  #<height> · <n> ago / [Return to Live]`, and clicking Return to Live restores the
  live badge and the live tip in the canvas/rail selection.
- Confirm `DetailsPanel`'s header no longer shows a Lock/Unlock button.
- Confirm `git status` shows `app-content.js` unchanged (or reverted) before
  committing.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/Live.jsx client/src/live/Live.scss client/src/live/DetailsPanel/index.jsx client/src/live/DetailsPanel/index.scss
git commit -m "feat(live): wire LiveStatusBadge and Return to Live, retire Lock button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 4: `NewBlockNotice` component

**Files:**
- Create: `client/src/live/NewBlockNotice/index.jsx`
- Create: `client/src/live/NewBlockNotice/index.scss`

**Interfaces:**
- Produces: `<NewBlockNotice tipHeight onReturnToLive />`, consumed by Task 5.

- [ ] **Step 1: Create the component**

```jsx
// client/src/live/NewBlockNotice/index.jsx
import React from 'react';
import './index.scss';

/*
 * Spec §29: "New block while historical" — shown whenever the live tip has
 * moved past whatever block the user is currently inspecting. The caller
 * (Live.jsx) only renders this when that's actually true, so this component
 * has no internal visibility logic of its own — it just always shows
 * tipHeight, which is naturally always current (spec's own example number
 * #2923515 is exactly "whatever the current tip is", not a frozen snapshot
 * of the block that first triggered this).
 */
export function NewBlockNotice({ tipHeight, onReturnToLive }) {
  return (
    <div className="live-new-block-notice">
      <span className="live-new-block-dot" />
      <span className="live-new-block-label">NEW BLOCK #{tipHeight}</span>
      <button type="button" className="live-new-block-btn" onClick={onReturnToLive}>
        Return to Live
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

```scss
// client/src/live/NewBlockNotice/index.scss

.live-new-block-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, #3b82f6 10%, var(--surface-primary));
  border: 1px solid color-mix(in srgb, #3b82f6 35%, var(--border-primary));
  font-size: var(--live-fs-xs);
  animation: live-new-block-in 220ms ease-out;
}

.live-new-block-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b82f6;
  animation: live-status-pulse-dot 1.4s ease-in-out infinite;
}

.live-new-block-label {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.live-new-block-btn {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, #3b82f6 45%, var(--border-primary));
  background: transparent;
  color: #3b82f6;
  font-size: var(--live-fs-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover { background: color-mix(in srgb, #3b82f6 12%, transparent); }
}

@keyframes live-new-block-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .live-new-block-notice { animation: none; }
  .live-new-block-dot { animation: none; }
}
```

- [ ] **Step 3: Manual verification (no automated test — pure presentation)**

Not wired yet (Task 5 does that). Confirm `npx eslint
client/src/live/NewBlockNotice/index.jsx` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/live/NewBlockNotice/
git commit -m "feat(live): add NewBlockNotice component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 5: Wire `NewBlockNotice` into `Live.jsx`

**Files:**
- Modify: `client/src/live/Live.jsx`

**Interfaces:**
- Consumes: `<NewBlockNotice>` (Task 4), `handleReturnToLive` (Task 3), `tipHeight`/
  `selectedHeight` (existing).

- [ ] **Step 1: Add the import and conditional render**

Add the import next to `LiveStatusBadge`'s:

```js
import { NewBlockNotice } from 'live/NewBlockNotice';
```

Add, right after the `{unavailable && (...)}` block (currently `Live.jsx:290-295`):

```jsx
      {locked && tipHeight != null && tipHeight > selectedHeight && (
        <NewBlockNotice tipHeight={tipHeight} onReturnToLive={handleReturnToLive} />
      )}
```

- [ ] **Step 2: Manual verification**

With `/live` open (flip `TESTING` if needed, **revert before committing**): click an
older block in the rail, then wait for (or, if testing locally against a slow chain,
simulate by picking a block a few slots back from the tip) a newer block to land.
Confirm:
- The notice appears above the flow canvas with the correct, currently-live height.
- The central block/canvas do **not** change while the notice is showing (spec §29:
  "keep #2923511 central; do not replay the full central animation").
- Clicking "Return to Live" on the notice clears it and returns to the live tip, same
  as the header's own Return to Live button.
- Confirm no new-block pulse animation plays on the canvas at the moment of returning
  (spec §30) — this is the `lastAnimatedHeightRef` fix from Task 3; if it does replay,
  re-check that fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add client/src/live/Live.jsx
git commit -m "feat(live): show NewBlockNotice while viewing history behind the tip

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 6: `ChainRail` — Live marker + richer hover (spec §31, §63)

**Files:**
- Modify: `client/src/live/ChainRail/index.jsx`
- Modify: `client/src/live/ChainRail/index.scss`

**Interfaces:**
- Consumes: nothing new — `ChainRail`'s existing props (`blocks`, `tipHeight`,
  `selectedHeight`, `onSelectBlock`) already carry everything needed; `tipHeight` was
  previously only used to key the remounting track (`Live.jsx` already passes it).

- [ ] **Step 1: Add an `isTip` flag and a Live marker to `ChainBlock`**

In `client/src/live/ChainRail/index.jsx`, change `ChainBlock`'s signature and add the
marker:

```jsx
function ChainBlock({ block, isSelected, isTip, onSelect }) {
  const chips = sectionCounts(block.events);
  const activate = () => onSelect(block);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  const hoverTitle = [
    `Block #${block.height}`,
    exactTimestamp(block.at),
    chips.length > 0 ? chips.map((c) => `${c.label}: ${c.count}`).join(' · ') : 'No activity this block',
  ].join('\n');

  return (
    <div
      className={`live-chain-block live-chain-block--${block.phase}${isSelected ? ' live-chain-block--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
      title={hoverTitle}
    >
      {isTip && <span className="live-chain-block-live-marker">LIVE</span>}
      <span className={`live-chain-block-icon ${activityWeightClass(block.events)}`}>
        <FluxMark />
      </span>
      <span className="live-chain-block-height">#{block.height}</span>
      <span className="live-chain-block-time">{relativeTime(block.at)}</span>
      <span className="live-chain-block-chips">
        {chips.length === 0 ? (
          <span className="live-chain-chip live-chain-chip--empty">—</span>
        ) : (
          chips.map(({ key, Icon, color, count }) => (
            <span key={key} className="live-chain-chip" style={{ '--chip-color': color }}>
              <Icon size={10} />
              {count > 1 ? count : ''}
            </span>
          ))
        )}
      </span>
    </div>
  );
}
```

Add `exactTimestamp` to the existing `live/timeFormat` import at the top of the file:

```js
import { relativeTime, exactTimestamp } from 'live/timeFormat';
```

Note `chips` already carries `{ key, Icon, color, count, label }` — `DETAIL_SECTIONS`
entries include `label` (`live/categoryMeta.js`), so `c.label` is available without
further plumbing; verify this by checking `DETAIL_SECTIONS`'s shape before writing this
step's final code (it does — see `categoryMeta.js:38-51`).

- [ ] **Step 2: Pass `isTip` from `ChainRail`**

Change the `.map` call in `ChainRail`'s track render (currently
`ChainRail/index.jsx:94-103`):

```jsx
          blocks.map((block, i) => (
            <React.Fragment key={block.height}>
              <ChainBlock
                block={block}
                isSelected={selectedHeight == null ? i === 0 : selectedHeight === block.height}
                isTip={block.height === tipHeight}
                onSelect={onSelectBlock}
              />
              {i < blocks.length - 1 && <span className="live-chain-connector" aria-hidden="true" />}
            </React.Fragment>
          ))
```

(`isTip` is independent of `isSelected` — spec §31: "The current tip gets a Live
marker. Historical blocks do not." — a selected *historical* block must never get the
Live marker, and the tip keeps its Live marker even when a different, older block is
currently selected/highlighted.)

- [ ] **Step 3: Style the marker**

Add to `client/src/live/ChainRail/index.scss`:

```scss
.live-chain-block-live-marker {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #22c55e;
  background: var(--surface-primary);
  border: 1px solid #22c55e;
  border-radius: 999px;
  padding: 0 5px;
  line-height: 1.4;
  white-space: nowrap;
}
```

Check `.live-chain-block`'s existing rule has `position: relative` (needed for the
marker's `position: absolute` to anchor correctly) — add it if missing.

- [ ] **Step 4: Manual verification**

On `/live`, confirm: the leftmost (current tip) block always shows a small green "LIVE"
tag above it, even after clicking an older block to select it (the older block gets the
existing selection highlight, not the Live tag). Hover any rail block and confirm the
native tooltip shows height, exact timestamp, and category counts (e.g. "Node Rewards:
4") rather than the old generic "click to inspect" text.

- [ ] **Step 5: Commit**

```bash
git add client/src/live/ChainRail/
git commit -m "feat(live): ChainRail Live marker on the tip, richer hover detail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 7: `FlowBlock` hover — category counts (spec §64)

**Files:**
- Modify: `client/src/live/FlowBlock/index.jsx`

**Interfaces:** none new — purely extends the existing `title` string.

- [ ] **Step 1: Extend the hover tooltip**

In `client/src/live/FlowBlock/index.jsx`, replace the `title` attribute (currently
line 44):

```jsx
      title={[
        `Block #${block.height}`,
        `Hash: ${block.hash || '—'}`,
        `Timestamp: ${exactTimestamp(block.at)}`,
        `Rewards: ${summary.rewards.count}`,
        `P2P: ${summary.p2p.count}`,
        `Deployments: ${summary.deployments.count}`,
        `Confirmations: ${summary.confirmations.count}`,
      ].join('\n')}
```

- [ ] **Step 2: Manual verification**

Hover the central block on `/live`. Confirm the tooltip now includes all four category
counts below the hash/timestamp, matching spec §64's example exactly in content (exact
formatting/line breaks are a native browser tooltip, not pixel-matched to the spec's
mockup).

- [ ] **Step 3: Commit**

```bash
git add client/src/live/FlowBlock/index.jsx
git commit -m "feat(live): add category counts to central block hover tooltip

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 8: "View full details →" button in `ActivityCard`

**Files:**
- Modify: `client/src/live/ActivityCard/index.jsx`
- Modify: `client/src/live/ActivityCard/index.scss`
- Modify: `client/src/live/FlowCanvas/index.jsx`

**Interfaces:**
- Consumes: `categoryKey` (existing `ActivityCard` prop).
- Produces: `ActivityCard`'s new `onViewDetails(categoryKey)` prop and
  `FlowCanvas`'s new `onViewDetails` prop, both consumed by Task 10 (`Live.jsx`).

- [ ] **Step 1: Add the button to `ActivityCard`'s expanded body**

In `client/src/live/ActivityCard/index.jsx`, add `ArrowRight` to the existing
`lucide-react` import:

```js
import { ChevronRight, ArrowRight } from 'lucide-react';
```

Add `onViewDetails` to the destructured props (the function signature currently at
line 118):

```jsx
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, categoryKey, def, count, primary, secondary, emptyLabel, summary, isExpanded, isDimmed, isPulsing, onToggle, onViewDetails },
  ref
) {
```

Change the expanded-body render block (currently lines 168-174):

```jsx
      {isExpanded ? (
        <div className="live-flow-card-expanded-body">
          {(() => {
            const ExpandedBody = EXPANDED_BODY_COMPONENT[categoryKey];
            return ExpandedBody ? <ExpandedBody summary={summary} /> : null;
          })()}
          <button
            type="button"
            className="live-flow-view-details-btn"
            onClick={(e) => {
              // Same reason as the card's own handleClick: this must not
              // also bubble to FlowCanvas's click-outside-collapses handler.
              e.stopPropagation();
              onViewDetails(categoryKey);
            }}
          >
            View full details <ArrowRight size={12} />
          </button>
        </div>
      ) : isEmpty ? (
```

- [ ] **Step 2: Style the button**

Add to `client/src/live/ActivityCard/index.scss`:

```scss
.live-flow-view-details-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--card-accent, #3b82f6);
  font-size: var(--live-fs-sm);
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;

  &:hover { text-decoration: underline; }
}
```

- [ ] **Step 3: Thread `onViewDetails` through `FlowCanvas`**

In `client/src/live/FlowCanvas/index.jsx`, add `onViewDetails` to the component's
props (default to a no-op, matching the existing `onToggleCategory` pattern):

```jsx
export function FlowCanvas({ block, summary, expandedCategory = null, onToggleCategory = () => {}, pulseCategories = [], pulseKey = 0, onViewDetails = () => {} }) {
```

Pass it to each `<ActivityCard>` (in the `CARD_KEYS.map` block):

```jsx
            onToggle={() => onToggleCategory(key)}
            onViewDetails={onViewDetails}
```

- [ ] **Step 4: Manual verification (no automated test — pure UI wiring, matching
  Session B's Task 4/5 convention for this exact file)**

Expand any card on `/live` and confirm a "View full details →" link/button appears
below its content, in the card's own accent color. (It won't do anything yet — Task 10
wires the actual scroll/highlight behavior.)

- [ ] **Step 5: Commit**

```bash
git add client/src/live/ActivityCard/ client/src/live/FlowCanvas/index.jsx
git commit -m "feat(live): add View full details button to expanded ActivityCards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 9: `DetailsPanel` focused-section support (spec §38)

**Files:**
- Modify: `client/src/live/DetailsPanel/index.jsx`
- Modify: `client/src/live/DetailsPanel/index.scss`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `DetailsPanel`'s new `focusedCategory`/`onFocusedCategoryHandled` props,
  consumed by Task 10 (`Live.jsx`).

- [ ] **Step 1: Add `sectionHeaderRefs`, `highlightedKey` state, and the focus effect**

In `client/src/live/DetailsPanel/index.jsx`, add `useEffect`, `useRef` to the React
import:

```js
import React, { useState, useEffect, useRef } from 'react';
```

Add the new props to `DetailsPanel`'s signature (removing `locked`/`onToggleLock`,
already done in Task 3 — confirm that edit landed before this one, since this task's
diff assumes it did):

```jsx
export function DetailsPanel({ block, globalRankings, focusedCategory, onFocusedCategoryHandled }) {
```

Add, right after the existing `expandedKeys` state declaration:

```jsx
  const [highlightedKey, setHighlightedKey] = useState(null);
  const sectionHeaderRefs = useRef({
    reward: React.createRef(),
    p2p: React.createRef(),
    deploy: React.createRef(),
    confirm: React.createRef(),
  }).current;
  // Mirrors home/WorkhorsePanel's existing reduced-motion check — this is the
  // first place in live/ that needs the JS-side (not just CSS-side) answer,
  // to pick 'smooth' vs 'auto' scrollIntoView behavior.
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ).current;

  // Spec §38: expand the matching section, scroll it into view, briefly
  // highlight its header, then clear the highlight after ~1.5s. Runs once per
  // distinct focusedCategory value (Live.jsx's handleViewFullDetails always
  // clears then re-sets it, even for the same category twice in a row, so
  // clicking "View full details" again always replays this).
  useEffect(() => {
    if (!focusedCategory) return undefined;
    setExpandedKeys((prev) => {
      if (prev.has(focusedCategory)) return prev;
      const next = new Set(prev);
      next.add(focusedCategory);
      return next;
    });
    sectionHeaderRefs[focusedCategory]?.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
    setHighlightedKey(focusedCategory);
    const timer = setTimeout(() => {
      setHighlightedKey(null);
      onFocusedCategoryHandled?.();
    }, 1500);
    return () => clearTimeout(timer);
  }, [focusedCategory, onFocusedCategoryHandled, prefersReducedMotion, sectionHeaderRefs]);
```

- [ ] **Step 2: Thread `headerRef`/`focused` through `Section`**

Change `Section`'s signature and header button (currently lines 103-123):

```jsx
function Section({ def, events, expanded, onToggle, globalRankings, headerRef, focused }) {
  const Icon = def.Icon;
  const RowComponent = ROW_COMPONENT[def.key];
  const items = (events || []).filter((e) => (def.key === 'reward' ? e.type === 'reward' : e.type === def.key));

  return (
    <div
      className={`live-detail-section${focused ? ' live-detail-section--focused' : ''}`}
      style={{ '--section-accent': def.color }}
    >
      <button
        type="button"
        ref={headerRef}
        className="live-detail-section-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
```

Note the `style={{ '--section-accent': def.color }}` custom property moved from the
header `<button>` (where it lived before this task) up to this outer `<div>` — Step 4
below adds a `.live-detail-section--focused` rule on this same outer div that needs to
read `--section-accent`, and CSS custom properties only inherit downward, so it has to
be set here rather than on the button for that rule to see it.
`.live-detail-section-header`'s own existing use of `var(--section-accent, #888)`
still resolves correctly afterward, since the property now inherits down from the div
to the button exactly as it inherits to every other descendant.

(The rest of `Section` — icon, label, count, chevron, body — is unchanged.)

- [ ] **Step 3: Pass the new props from `DetailsPanel`'s render**

Update the `DETAIL_SECTIONS.map` call (currently lines 185-193):

```jsx
          {DETAIL_SECTIONS.map((def) => (
            <Section
              key={def.key}
              def={def}
              events={block.events}
              expanded={expandedKeys.has(def.key)}
              onToggle={() => toggle(def.key)}
              globalRankings={globalRankings}
              headerRef={sectionHeaderRefs[def.key]}
              focused={highlightedKey === def.key}
            />
          ))}
```

- [ ] **Step 4: Style the focused state**

Add to `client/src/live/DetailsPanel/index.scss`:

```scss
.live-detail-section--focused {
  animation: live-detail-section-flash 1.5s ease-out;
}

@keyframes live-detail-section-flash {
  0% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--section-accent, #3b82f6) 55%, transparent); }
  70% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--section-accent, #3b82f6) 55%, transparent); }
  100% { box-shadow: none; }
}

@media (prefers-reduced-motion: reduce) {
  .live-detail-section--focused {
    animation: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--section-accent, #3b82f6) 55%, transparent);
  }
}
```

(The reduced-motion fallback keeps the highlight instantly visible rather than
animated, matching Session B's established convention of instant opacity/border
changes standing in for motion — Task 10's `setTimeout` in `Live.jsx`/`DetailsPanel`
still clears it after 1.5s either way, so reduced-motion users still see it end, just
without the animated fade. This rule reads `--section-accent` from the outer div, which
Step 2 already moved the custom property onto — no further wiring needed here.)

- [ ] **Step 5: Manual verification**

Not wired to a trigger yet (Task 10 does that) — for now, confirm
`npx eslint client/src/live/DetailsPanel/index.jsx` reports no errors and the existing
expand/collapse-by-click behavior on `/live` still works exactly as before (nothing in
this task should change default behavior when `focusedCategory` is `null`).

- [ ] **Step 6: Commit**

```bash
git add client/src/live/DetailsPanel/
git commit -m "feat(live): DetailsPanel focused-section expand/scroll/highlight support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 10: Wire `focusedDetailCategory` end-to-end in `Live.jsx`

**Files:**
- Modify: `client/src/live/Live.jsx`

**Interfaces:**
- Consumes: `onViewDetails` (Task 8, `FlowCanvas`), `focusedCategory`/
  `onFocusedCategoryHandled` (Task 9, `DetailsPanel`).

- [ ] **Step 1: Add `focusedDetailCategory` state and its handler**

Add near the other `useState` declarations in `Live.jsx` (spec §68's suggested name):

```js
  const [focusedDetailCategory, setFocusedDetailCategory] = useState(null);
```

Add the handler near `handleToggleCategory`:

```js
  // Always forces a fresh effect run in DetailsPanel even if the same
  // category is clicked twice in a row without an intervening reset —
  // otherwise React sees an unchanged state value on the second click and
  // never re-fires the scroll/highlight effect.
  const handleViewFullDetails = useCallback((key) => {
    setFocusedDetailCategory(null);
    requestAnimationFrame(() => setFocusedDetailCategory(key));
  }, []);
```

- [ ] **Step 2: Wire the new props into `<FlowCanvas>` and `<DetailsPanel>`**

Update the `<FlowCanvas>` call (`Live.jsx`, currently ~lines 297-304):

```jsx
      <FlowCanvas
        block={displayedBlock}
        summary={summary}
        expandedCategory={expandedCategory}
        onToggleCategory={handleToggleCategory}
        pulseCategories={pulseCategories}
        pulseKey={pulseKey}
        onViewDetails={handleViewFullDetails}
      />
```

Update the `<DetailsPanel>` call (from Task 3's edit):

```jsx
        <DetailsPanel
          block={displayedBlock}
          globalRankings={globalRankings}
          focusedCategory={focusedDetailCategory}
          onFocusedCategoryHandled={() => setFocusedDetailCategory(null)}
        />
```

- [ ] **Step 3: Manual verification (spec §71's last bullet: "View details focuses the
  correct DetailsPanel section")**

On `/live`: expand each of the four cards in turn, click "View full details →" on
each, and confirm for each one:
- The matching `DetailsPanel` section expands (if it was collapsed).
- The panel scrolls that section's header into view if it wasn't already visible.
- The section's header briefly shows a highlighted border/glow, which fades after
  about 1.5 seconds.
- Clicking the *same* card's "View full details →" a second time in a row still
  replays the highlight (this is the `requestAnimationFrame` reset-then-set trick from
  Step 1 — if it doesn't replay, re-check that).
- Selecting a different block while a highlight is mid-flight doesn't throw or leave a
  stuck highlight (the `setTimeout` cleanup in Task 9's effect handles this via its
  cleanup function).

- [ ] **Step 4: Commit**

```bash
git add client/src/live/Live.jsx
git commit -m "feat(live): wire View full details to DetailsPanel expand/scroll/highlight

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

---

### Task 11: Final integration verification

**Files:** none (verification only, plus doc updates).

- [ ] **Step 1: Confirm the scope boundary held**

```bash
git diff --stat main
```

Expected: every changed file under `client/src/live/`, plus this plan file, plus
`todo.md`/`LIVE_REDESIGN_PLAN.md` (Step 5 below). No changes outside `client/src/live/`
and those two doc files (spec §4/§75).

- [ ] **Step 2: Run the full test suite**

```bash
cd client && CI=true npx react-scripts test --watchAll=false
```

Expected: all tests pass — 317 (baseline) + 4 new (`computeLiveStatus`'s tests) = 321,
0 failures.

- [ ] **Step 3: Run the production build**

```bash
cd client && npx react-scripts build
```

Expected: exit 0, warnings limited to the same 4 pre-existing baseline files (`Navbar/
index.jsx`, `NodeGridTable/index.jsx`, `LayoutContext.jsx`, `WalletNodes/index.jsx`) —
confirm with `grep -n "^src"` on the build output, same technique used to verify PR
#185.

- [ ] **Step 4: Manual regression + full spec QA pass**

Re-run every check from this plan's individual tasks together, in one sitting, plus:
- Spec §71 (expansion): no expansion initially; clicking Rewards expands it; clicking
  again collapses; clicking Deployments switches expansion; Escape collapses; selecting
  another block collapses (already implemented pre-Session-C — confirm still true);
  View details focuses the correct section (Task 10).
- Spec §72 (live/history): latest block follows live; clicking an old block enters
  history; a new block still arrives (rail updates) while historical; the historical
  block stays central; Return to Live works (both the header button and the
  `NewBlockNotice` button); a new block only becomes central after explicitly
  returning to live.
- Spec §73 (animation): genuine height change triggers the pulse; a same-height poll
  does not; empty categories never pulse; **historical mode does not get forced into
  new-block animation, including immediately after Return to Live** (Task 3's
  `lastAnimatedHeightRef` fix — this is the one most likely to regress silently, check
  it explicitly by leaving a block selected across at least two real block arrivals
  before returning to live); reduced-motion mode removes the elaborate animations
  (toggle via Chrome DevTools' Rendering tab, as in prior sessions).
- Toggle light/dark theme and confirm `LiveStatusBadge`/`NewBlockNotice`/the focused-
  section highlight all render correctly in both.
- Confirm `TESTING`/`PREMIUM_TESTING_MODE` in `client/public/runtime/app-content.js`
  is `false` and `git status` is clean before any commit in this step.

- [ ] **Step 5: Update `todo.md` and `LIVE_REDESIGN_PLAN.md`**

In `todo.md`, find the `- [ ] **Session C — History + details integration.**...`
bullet and change it to `[x]`, appending a `Shipped in PR #<fill in after opening the
PR> — see docs/superpowers/plans/2026-09-08-live-session-c.md for the full task
breakdown.` sentence, matching Sessions A/B's exact convention.

In `LIVE_REDESIGN_PLAN.md`, check off Session C in the "Build order" list:

```markdown
- [x] **Session C — History + details integration** (spec Phases 5-6, §§26-32, 37-39, 63-65)
```

- [ ] **Step 6: Commit the doc updates**

```bash
git add todo.md LIVE_REDESIGN_PLAN.md
git commit -m "docs: mark Live Redesign Session C complete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DUzTRdEwAxVLz2YskPDs9Y"
```

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/live-session-c
gh pr create --base main --head feat/live-session-c \
  --title "feat(live): Session C — history + details integration" \
  --body "See docs/superpowers/plans/2026-09-08-live-session-c.md for the full task breakdown. Implements FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md Phases 5-6."
```

Fill in the actual PR number back into `todo.md`'s Session C line (Step 5) with a
follow-up commit once the number is known — this exact step was missed after opening
both PR #184 and PR #185 in prior sessions and had to be caught during this session's
own review; don't repeat that.

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** §26-27 (status states, block cadence) → Tasks 1-3 (cadence text
  appears in the Syncing/Delayed copy strings, per spec's "can be communicated"
  framing — not repeated under Live/Historical, which would be noise). §28 (historical
  mode: central block/summaries/DetailsPanel/status/expandedCategory/polling all
  update) — the block/summary/DetailsPanel/polling pieces were already correct before
  this session (verified by reading current `Live.jsx`); status is new (Task 3).
  §29-30 (new block while historical, Return to Live) → Tasks 3-5. §31-32 (history
  rail, older blocks) → Task 6; "Load older"/"Browse history" (§32) is explicitly
  optional and deliberately not built, matching the spec's own instruction not to
  expand live-polling workload for this. §33-36 (summary transformation, category
  metadata, existing data sources, deployment timing) — all pre-existing from Sessions
  A/B, unchanged by this plan. §37 (DetailsPanel role) — no code change, just the
  rationale for retiring the Lock button (see "Design decision" section above). §38
  (DetailsPanel integration) → Tasks 8-10. §39 (DetailsPanel data) — untouched,
  verified no renderer logic changes in Task 9 beyond threading refs/props. §57
  (avoid stale expanded content) — already implemented pre-Session-C
  (`setExpandedCategory(null)` on `displayedBlock?.height` change); this plan doesn't
  touch it, only re-verifies it in Task 11's manual pass. §63-64 (history hover,
  central block hover) → Tasks 6-7. §65 (deep-linking) — explicitly optional/later per
  spec, not built. §68 (suggested Live state) → `focusedDetailCategory` added exactly
  as suggested (Task 10); `selectedHeight`/`expandedCategory` kept as-is;
  `isNewBlock` from the spec's suggested state was never actually needed — the
  existing `pulseKey`/`pulseCategories` state (from Session B) already serves that
  purpose, so it's intentionally not added (avoids redundant state, spec §69). §72
  (testing — live/history) → covered by Task 11's manual QA list (this codebase's
  established convention is manual verification for `Live.jsx`-level state-machine
  behavior, matching Sessions A/B — see this plan's Architecture section).

- **Placeholder scan:** no "TBD"/"handle appropriately" language; every code block is
  complete, copy-pasteable code, not a description of code.

- **Type/name consistency check:** `focusedDetailCategory` (Live.jsx state) →
  `handleViewFullDetails` → `FlowCanvas`'s `onViewDetails` prop → `ActivityCard`'s
  `onViewDetails` prop, called with the same `categoryKey` string values
  (`'reward'|'deploy'|'p2p'|'confirm'`) already used everywhere else in this
  directory → `DetailsPanel`'s `focusedCategory` prop, compared directly against
  `DETAIL_SECTIONS`' `key` values (same four strings). `liveStatus` return values
  (`'live'|'syncing'|'delayed'|'historical'`) are consumed only by
  `LiveStatusBadge`'s own `status` prop via string equality checks — no
  intermediate renaming anywhere in that chain. `handleReturnToLive` is the single
  function passed to both `LiveStatusBadge.onReturnToLive` and
  `NewBlockNotice.onReturnToLive` — verified both call sites in Tasks 3 and 5 pass the
  exact same reference, not two separately-defined callbacks that could drift.
