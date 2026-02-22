# FluxNode Code Improvement Plan

> Generated: 2026-02-19
> Branch: `review/code-improvements`
> Status: Planning

---

## Golden Rules

> **DO NOT break existing functionality.**
>
> Every change must be verified against the demo wallet before moving to the next task.
> The demo wallet at the link below is the source of truth for all calculations:
>
> **Demo URL:** `https://fluxnode.app.runonflux.io/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ`
>
> This covers: Flux price, node counts, estimated earnings, wallet amounts (Flux + USD), parallel assets,
> node tier breakdown, utilization bars, and payout timers.

---

## Testing Protocol

Every task **must** follow this test cycle before being marked complete:

1. **Before changes** — Run `yarn start` and verify demo wallet loads correctly. Note key values:
   - Flux price displayed
   - Total node counts (Cumulus / Nimbus / Stratus)
   - Estimated earnings (daily and monthly, Flux and USD)
   - Wallet Flux balance and USD value
   - Parallel Assets (all chains including MATIC and BASE)
   - Utilization bars (CPU / RAM / SSD / Nodes)
2. **Make changes**
3. **After changes** — Repeat the same checks. All values must match step 1 exactly.
4. **Build Docker image** to confirm production build succeeds:
   ```bash
   docker build -t fluxnode-test:latest .
   docker run --rm -p 9000:80 fluxnode-test:latest
   ```
   Then open `http://localhost:9000/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ` and verify.
5. Only mark task complete once both dev (`yarn start`) and Docker build pass.

---

## Discovered Issues Summary

### Critical Bugs
| ID | File | Issue |
|----|------|-------|
| B1 | `home/apidata.js:42-48` | `getFluxNodes()` fires a large API call on every module import and discards the result — debug code left in |
| B2 | `components/NodeGridTable/index.jsx:226` | `this.setState()` called inside a functional component — crashes when maximize button is clicked |
| B3 | `home/apidata.js` | `calc_mtn_window` formula is `win * 2` vs `win / 2` in `main/apidata.js` — 4x calculation error |

### Major Duplications
| ID | Files | Issue |
|----|-------|-------|
| D1 | `main/AppToaster.js` + `home/AppToaster.js` | 100% identical — should be a single shared component |
| D2 | `main/InfoCell/` + `home/InfoCell/` | 100% identical — `home/InfoCell/` is dead code (home/Header already imports from main) |
| D3 | `main/Header/index.jsx` + `home/Header/index.jsx` | ~200-line utilization bars section duplicated verbatim |
| D4 | `main/apidata.js` (849 lines) + `home/apidata.js` (1010 lines) | Diverged fork — new features added only to home version, bugs not present in main |
| D5 | `main/MainApp.jsx` (646 lines) + `home/Home.jsx` (552 lines) | Near-identical class components — same constructor, lifecycle, subscription pattern |
| D6 | `main/BestUptime/`, `main/MostHosted/`, `main/PayoutTimer/` | Identical `tierMapping` objects and component structure across all three |

### Data Gaps / Missing Features
| ID | File | Issue |
|----|------|-------|
| M1 | `home/apidata.js` | `matic` and `base` PA chains missing from `pa_summary_full()` |
| M2 | `home/apidata.js` | `empty_flux_node()` missing `score` field |
| M3 | `home/Home.jsx` | `methodCallSubscription.unsubscribe()` missing in `componentWillUnmount` — memory leak |
| M4 | Both routes | No React Error Boundary — unhandled API errors crash the full page |
| M5 | `persistance/store.js` | `CURRENCY_RATES` cleared on every startup — forces re-fetch each page load |

### Performance Issues
| ID | Issue |
|----|-------|
| P1 | No request deduplication — navigating between `/home` and `/nodes` fires two full independent sets of API calls |
| P2 | `rxjs` 5.x in use — old, not tree-shakeable, upgrade to 7.x |
| P3 | Multiple fetch calls in `home/apidata.js` lack `cors` mode specification |
| P4 | Exchange rates fetched fresh on every page load (related to M5) |

### Code Quality
| ID | Issue |
|----|-------|
| Q1 | ESLint effectively disabled — critical rules like `no-unused-vars` and `eqeqeq` are off |
| Q2 | `millify` package listed in `package.json` but replaced by custom `format_thousands_separator` — unused dependency |
| Q3 | `home/Header/index.jsx` labels "Streamr instances" but shows `kadenaRunningApps` — misleading label |
| Q4 | `home/Header` imports from `main/InfoCell` (cross-folder dependency) instead of a shared component |

---

## Execution Plan

---

### Phase 1 — Critical Bug Fixes
**Priority: Immediate | Risk: Low | Effort: Low**

These are pure bug fixes with no structural changes. Safe to do first, independently.

---

#### Task 1A — Remove rogue API call in `home/apidata.js`
- **File:** `home/apidata.js`
- **Lines:** 42–48
- **What to do:** Remove the `getFluxNodes()` function definition and the immediate call to it at module level. This fires a massive API call (`/daemon/viewdeterministiczelnodelist`) on every import and throws away the result.
- **Risk:** None — the result is never used. Confirm with a search that `getFluxNodes` is not referenced anywhere else.
- **Test:** Load demo wallet. Check that page loads normally and Chrome DevTools Network tab no longer shows a call to `viewdeterministiczelnodelist` on page load.
- **Issues resolved:** B1

---

#### Task 1B — Fix `setState` crash in NodeGridTable
- **File:** `components/NodeGridTable/index.jsx:226`
- **What to do:** Identify the `this.setState(...)` call inside the functional component. Convert to use `useState` / `useRef` appropriately, or move the state to the parent class component.
- **Risk:** Low — only affects the maximize/fullscreen button in the node grid. Does not affect any calculations.
- **Test:** Load demo wallet → open `/nodes` tab → click the maximize button. Should not throw a React error.
- **Issues resolved:** B2

---

#### Task 1C — Correct `calc_mtn_window` formula in `home/apidata.js`
- **File:** `home/apidata.js`
- **What to do:** Find `calc_mtn_window` and change `format_minutes(win * 2)` to `format_minutes(win / 2)` to match `main/apidata.js`.
- **Note:** `MaintenanceCell.jsx` currently imports `calc_mtn_window` exclusively from `main/apidata.js`, so this bug is not currently visible in the UI. However it must be fixed before the API merge in Phase 3.
- **Risk:** Low — this function is not currently used from `home/apidata.js` in the UI.
- **Test:** Verify maintenance window values in the node grid match expected values (cross-check with live site).
- **Issues resolved:** B3

---

### Phase 2 — Shared Component Extraction
**Priority: High | Risk: Low | Effort: Medium**

Extract duplicate code into shared components under `client/src/components/`. Each sub-task is independent and safe to do in parallel.

---

#### Task 2A — Deduplicate `AppToaster`
- **What to do:**
  1. Create `client/src/components/AppToaster.js` with the shared content (identical to both existing files)
  2. Update `main/` and `home/` import paths to point to `components/AppToaster`
  3. Delete `main/AppToaster.js` and `home/AppToaster.js`
- **Risk:** Very low — pure import path change. No logic changes.
- **Test:** Load demo wallet. Confirm toast notifications still appear (e.g., trigger a wallet load error by entering an invalid address).
- **Issues resolved:** D1

---

#### Task 2B — Deduplicate `InfoCell` and fix cross-folder import
- **What to do:**
  1. Move `main/InfoCell/` → `components/InfoCell/` (move folder, not copy)
  2. Delete `home/InfoCell/` (it is dead code — `home/Header/index.jsx` already imports from `main/InfoCell`)
  3. Update all imports in `main/Header/index.jsx`, `home/Header/index.jsx`, and any other file that imports `InfoCell`
- **Risk:** Low — pure file move and import update. No logic changes.
- **Test:** Load demo wallet. Check both `/home` and `/nodes` routes display all info cells (Flux price, node counts, wallet amounts) with correct values and animations.
- **Issues resolved:** D2, Q4

---

#### Task 2C — Extract shared `UtilizationBars` component
- **What to do:**
  1. Identify the ~200-line utilization bars section that is identical in both `main/Header/index.jsx` and `home/Header/index.jsx`
  2. Create `client/src/components/UtilizationBars/index.jsx` and `index.scss`
  3. Replace the duplicated section in both Header files with `<UtilizationBars ... />`
  4. Ensure all required props are passed correctly (the component receives utilization data from the store)
- **Risk:** Medium — involves JSX restructuring in both Header components. Must ensure all data props flow correctly.
- **Test:** Load demo wallet on both `/home` and `/nodes`. Verify all four bars (Nodes, CPU, RAM, SSD) display with correct percentages. Cross-reference with live site.
- **Issues resolved:** D3

---

#### Task 2D — Extract shared `tierMapping` constant
- **What to do:**
  1. Add `tierMapping` constant to `client/src/content/index.js` (or a new `client/src/content/constants.js`)
  2. Remove the duplicated `tierMapping` objects from `main/BestUptime/index.jsx`, `main/MostHosted/index.jsx`, `main/PayoutTimer/index.jsx`, and both Header files
  3. Import from the shared location
- **Risk:** Low — data-only change. The mapping values (CUMULUS/NIMBUS/STRATUS) do not change.
- **Test:** Load demo wallet on `/nodes`. Check that the Notable Nodes tab shows correct tier labels. Verify PayoutTimer shows the correct tier name for the highest-ranked node.
- **Issues resolved:** D6

---

### Phase 3 — API Layer Merge
**Priority: High | Risk: Medium | Effort: High**

This is the most impactful change. Merge the two diverged `apidata.js` files into a single shared module.

---

#### Task 3A — Merge `main/apidata.js` and `home/apidata.js` into a single shared module

> **Warning:** This task has the highest risk of breaking calculations. Follow the testing protocol strictly. Do NOT rush this task.

- **Strategy:** Start from `home/apidata.js` (it is newer and has more features), apply all Phase 1 fixes, then backport any fixes from `main/apidata.js`.
- **What to do:**
  1. Create `client/src/apidata.js` as the new merged file
  2. Carry over all functions from `home/apidata.js` with Phase 1 fixes already applied
  3. Apply these specific fixes from `main/apidata.js`:
     - Add `matic` and `base` to `pa_summary_full()` (fixes M1)
     - Add `score: 0` to `empty_flux_node()` (fixes M2)
     - Add `mode: 'cors'` to `fetch_fusion_fees()` fetch call (fixes P3)
     - Add `mode: 'cors'` to `fetch_wallet_pas()` (fixes P3)
     - Ensure `calc_mtn_window` uses `win / 2` formula (Task 1C already handles this)
  4. Create route-specific thin re-export files if needed:
     - `main/apidata.js` → re-exports everything from `../../apidata.js`
     - `home/apidata.js` → re-exports everything from `../../apidata.js`
     - This minimizes import changes needed in other files
  5. Delete original `main/apidata.js` and `home/apidata.js` once all imports verified
- **Calculation-critical functions to verify individually:**
  - `calc_estimated_earnings()` — daily and monthly rewards per tier
  - `calc_mtn_window()` — maintenance window in minutes
  - `pa_summary_full()` — parallel assets totals (all chains including MATIC/BASE)
  - `fetch_exchange_rates()` — USD conversion
  - `create_global_store()` — store shape used by all components
- **Test:**
  1. Before merge: note exact values from demo wallet (earnings, node counts, PA totals)
  2. After merge: all values must be identical
  3. Test on both `/home` and `/nodes` routes
  4. Build Docker image and test again
- **Issues resolved:** D4, M1, M2, P3

---

### Phase 4 — Performance & Polish
**Priority: Medium | Risk: Low | Effort: Low–Medium**

---

#### Task 4A — Add TTL-based currency rate caching
- **File:** `persistance/store.js`, `home/apidata.js` / merged `apidata.js`
- **What to do:** Instead of clearing `CURRENCY_RATES` on every app startup, store a timestamp alongside the rates. On startup, check if rates are older than 1 hour — only re-fetch if stale.
- **Risk:** Low — only affects how often exchange rate API is called. Calculations use the same data.
- **Test:** Load app twice in quick succession. Second load should not show a network request to `api.frankfurter.app`. After 1 hour (or force-clear for testing), rates should re-fetch.
- **Issues resolved:** M5, P4

---

#### Task 4B — Fix misleading "Streamr instances" label in `home/Header`
- **File:** `home/Header/index.jsx`
- **What to do:** Find the label "Streamr instances" and change it to the correct label for `kadenaRunningApps` (e.g., "Kadena nodes").
- **Risk:** None — display label only.
- **Test:** Load `/home`. Verify the label is correct and the value displayed is the Kadena app count.
- **Issues resolved:** Q3

---

#### Task 4C — Fix subscription memory leak in `Home.jsx`
- **File:** `home/Home.jsx`
- **What to do:** Add `this.methodCallSubscription.unsubscribe()` to `componentWillUnmount` (following the same pattern as `main/MainApp.jsx`).
- **Risk:** None — adds missing cleanup only.
- **Test:** Navigate to `/home`, then navigate away. Check browser DevTools memory profile — no RxJS subscription warnings.
- **Issues resolved:** M3

---

#### Task 4D — Remove unused `millify` dependency
- **File:** `client/package.json`
- **What to do:** Run `yarn remove millify`. Confirm no files import from `millify` (search codebase).
- **Risk:** Low — verify with a full codebase search for `millify` imports before removing.
- **Test:** `yarn build` must complete without errors.
- **Issues resolved:** Q2

---

### Phase 5 — Structural Improvements (Longer Term)
**Priority: Low | Risk: Medium–High | Effort: High**

These are architectural improvements that should be planned carefully. Do not start until Phases 1–4 are complete and stable.

---

#### Task 5A — Extract shared data hook `useFluxNodeData()`
- **What to do:** Refactor the shared logic from `MainApp.jsx` and `Home.jsx` class components into a `useFluxNodeData()` custom hook. This removes the near-duplicate class component pattern.
- **Risk:** High — touches core data flow. Requires thorough testing of all routes.
- **Prerequisite:** Phase 3 (API merge) must be complete.

---

#### Task 5B — Add React Error Boundaries
- **What to do:** Create an `ErrorBoundary` component. Wrap each route (`/home`, `/nodes`) so that API failures show a friendly error message rather than crashing the whole page.
- **Risk:** Low — adds defensive wrapping only, no logic changes.

---

#### Task 5C — Upgrade rxjs from 5.x to 7.x
- **What to do:** Upgrade `rxjs` and `localforage-observable` to modern versions. Update all observable patterns to use the pipe-based API (rxjs 7 is not backwards compatible).
- **Risk:** High — `rxjs` 5 → 7 is a breaking change. Requires careful review of every subscription in `MainApp.jsx`, `Home.jsx`, and `LayoutContext.jsx`.
- **Prerequisite:** Phase 5A should be complete to reduce the number of files that need updating.

---

## Task Dependency Graph

```
Phase 1 (Bugs)
├── 1A (rogue API call)       → no dependencies
├── 1B (setState crash)       → no dependencies
└── 1C (calc_mtn_window)      → no dependencies

Phase 2 (Shared Components)
├── 2A (AppToaster)           → no dependencies
├── 2B (InfoCell)             → no dependencies
├── 2C (UtilizationBars)      → no dependencies
└── 2D (tierMapping)          → no dependencies

Phase 3 (API Merge)
└── 3A (merge apidata)        → requires: 1A, 1B, 1C complete

Phase 4 (Polish)
├── 4A (rate caching)         → requires: 3A complete
├── 4B (label fix)            → no dependencies
├── 4C (unsubscribe fix)      → no dependencies
└── 4D (remove millify)       → no dependencies

Phase 5 (Structural)
├── 5A (shared hook)          → requires: 3A complete
├── 5B (error boundaries)     → requires: 5A complete
└── 5C (rxjs upgrade)         → requires: 5A complete
```

---

## File Change Inventory

| File | Action | Phase |
|------|---------|-------|
| `home/apidata.js` | Remove rogue `getFluxNodes()` call | 1A |
| `components/NodeGridTable/index.jsx` | Fix `this.setState` in functional component | 1B |
| `home/apidata.js` | Fix `calc_mtn_window` formula | 1C |
| `main/AppToaster.js` | Delete (replaced by shared) | 2A |
| `home/AppToaster.js` | Delete (replaced by shared) | 2A |
| `components/AppToaster.js` | **Create new** shared file | 2A |
| `main/InfoCell/` | Move → `components/InfoCell/` | 2B |
| `home/InfoCell/` | Delete (dead code) | 2B |
| `main/Header/index.jsx` | Update import paths | 2B, 2C, 2D |
| `home/Header/index.jsx` | Update import paths + extract UtilizationBars | 2B, 2C, 2D |
| `components/UtilizationBars/index.jsx` | **Create new** shared component | 2C |
| `components/UtilizationBars/index.scss` | **Create new** shared styles | 2C |
| `content/index.js` (or new `constants.js`) | Add shared `tierMapping` | 2D |
| `main/BestUptime/index.jsx` | Import `tierMapping` from shared location | 2D |
| `main/MostHosted/index.jsx` | Import `tierMapping` from shared location | 2D |
| `main/PayoutTimer/index.jsx` | Import `tierMapping` from shared location | 2D |
| `client/src/apidata.js` | **Create new** merged API module | 3A |
| `main/apidata.js` | Replace with re-export shim (then delete when safe) | 3A |
| `home/apidata.js` | Replace with re-export shim (then delete when safe) | 3A |
| `persistance/store.js` | Add TTL logic for currency rates | 4A |
| `home/Header/index.jsx` | Fix misleading "Streamr" label | 4B |
| `home/Home.jsx` | Add `unsubscribe()` to `componentWillUnmount` | 4C |
| `client/package.json` | Remove `millify` dependency | 4D |

---

## Notes for Sub-Agents

When delegating a task to a sub-agent, provide:
1. The Task ID (e.g., `2B`)
2. The exact files to modify (see File Change Inventory above)
3. The Testing Protocol section from this document
4. The demo URL: `https://fluxnode.app.runonflux.io/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ`
5. A note on which tasks are prerequisites (see Dependency Graph)

Each sub-agent should:
- Read all files it will modify before making any changes
- Make the smallest possible change that achieves the goal
- Not refactor anything outside the task scope
- Verify imports after any file move or rename
- Report exact values from before and after the change for key calculations
