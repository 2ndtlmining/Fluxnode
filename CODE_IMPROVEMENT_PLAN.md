# FluxNode Code Improvement Plan

> Generated: 2026-08-14 (supersedes the 2026-02-19 version)
> Branch: `review/code-improvements-v2`
> Status: Planning

This file is self-contained. A model picking this up cold should be able to execute
any task below without needing the original conversation that produced it.

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

## Status of the Previous Plan (2026-02-19)

A prior pass already completed most of Phases 1–3. Verified against the current `main` branch:

| ID | Item | Status |
|----|------|--------|
| B1 | Rogue `getFluxNodes()` call in `home/apidata.js` | ✅ Done — `main/apidata.js` and `home/apidata.js` are now thin re-export shims of `client/src/apidata.js` |
| B2 | `setState` crash in `NodeGridTable` | ✅ Done — no `setState` call remains in that file |
| B3 | `calc_mtn_window` formula mismatch | ✅ Done — resolved by the apidata merge |
| D1 | `AppToaster` duplication | ✅ Done — lives in `components/AppToaster.js` only |
| D2 | `InfoCell` duplication | ✅ Done — lives in `components/InfoCell/` only |
| D3 | Utilization bars duplication | ✅ Done — `components/UtilizationBars/` exists and is shared |
| D4 | `apidata.js` fork merge | ✅ Done |
| D5 | `MainApp.jsx` / `Home.jsx` duplication | ⚠️ Still open — both are still near-identical class components |
| D6 | `tierMapping` duplication | ✅ Done — all three components import `tierMapping` from `content/index.js` |
| M3 | Subscription memory leak in `Home.jsx` | Not re-verified in this pass — recheck `componentWillUnmount` |
| M4 | No React Error Boundary | ✅ Done — `components/ErrorBoundary` exists and wraps route sections in `Application.jsx` |
| M5 | Currency rates re-fetched every startup | ✅ Done — `CURRENCY_RATE_TTL_MS` (1 hour) TTL is implemented in `apidata.js` |
| P1 | No request deduplication between `/home` and `/nodes` | ⚠️ Still open |
| P2 / 5C | `rxjs` 5.x → 7.x upgrade | ⚠️ Still open — `client/package.json` pins `"rxjs": "^5.6.0-forward-compat.5"` |
| Q1 | ESLint rules disabled | ⚠️ Still open — see new Task S4 below, this is directly responsible for a live security gap |
| Q2 | Unused `millify` dependency | ✅ Done — removed from `client/package.json` (one commented-out reference remains in `utils.js:144`, harmless) |
| Q3 | Misleading "Streamr instances" label | Not re-verified in this pass |
| Q4 | Cross-folder `InfoCell` import | ✅ Done, resolved alongside D2 |

Everything still open above is carried forward into the phases below, alongside new findings from a follow-up review focused on speed and security.

---

## Discovered Issues Summary (New Findings — 2026-08-14 pass)

### Security
| ID | File | Issue |
|----|------|-------|
| S1 | `main/MostHosted/index.jsx:74`, `main/BestUptime/index.jsx:74`, `main/PayoutTimer/index.jsx:139`, `components/NodeGridTable/CustomisedCells/IpCell.jsx:16` | `target='_blank'` links to node dashboards missing `rel='noopener noreferrer'` — reverse tabnabbing risk (opened page gets a `window.opener` handle back to fluxnode.app) |
| S2 | `client/package.json` → `eslintConfig.rules` | `"react/jsx-no-target-blank": "off"` — this is *why* S1 exists and why it won't get caught again; several other safety-relevant rules are also disabled (`eqeqeq`, `no-unused-vars`, `no-func-assign`, `no-cond-assign`, etc.) |
| S3 | `main/Gamification/geolocate.js` (fetch to `ip-api.com/batch`) | Calls `http://ip-api.com/batch` over plain HTTP, not HTTPS. If the site is served over HTTPS this will be blocked as mixed content; if it isn't blocked, node IP data is sent unencrypted to a third party |
| S4 | `conf/deploy-nginx.conf` | No security headers set at all — missing `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` |
| S5 (informational) | `client/src/apidata.js` — `usdCurrencyRate()` / `lazy_load_currency_rate()` | Calls `api.frankfurter.app` directly from the browser; that third-party host is intermittently blocking the request via CORS (no `Access-Control-Allow-Origin` header), which surfaces as a console error. Not exploitable, but it's unnecessary third-party exposure and console noise. See Task S5 for the fix (route through your own API) |

**Good news from this pass:** no `dangerouslySetInnerHTML`, `eval()`, or `new Function()` usage anywhere in `client/src`; no hardcoded API keys, secrets, or passwords found in `client/src` or `api/src`.

### Performance
| ID | File | Issue |
|----|------|-------|
| P5 | `client/src/apidata.js` → `fetch_total_donations()` | Fetches the donation address's **entire** transaction history on every wallet search, and previously fired every page in parallel with `Promise.all`, which explorer.runonflux.io rate-limits (400s). Needs sequential/guarded fetching regardless of how large the donation address's history grows — see Task P5 below for the exact fix |
| P6 | `client/src/apidata.js` — several `fetch()` calls | No `res.ok` / content-type check before calling `.json()` — a non-JSON error body (e.g. `explorer.runonflux.io` returning `Loading block index.... Code:-28` while its node resyncs) throws an uncaught `SyntaxError` instead of failing gracefully |

---

## Execution Plan

---

### Phase A — Security Fixes (do first — low risk, no visual/calculation impact)
**Priority: Immediate | Risk: Very Low | Effort: Low**

---

#### Task S1 — Add `rel="noopener noreferrer"` to external node-dashboard links

- **Files:**
  - `client/src/main/MostHosted/index.jsx:74`
  - `client/src/main/BestUptime/index.jsx:74`
  - `client/src/main/PayoutTimer/index.jsx:139`
  - `client/src/components/NodeGridTable/CustomisedCells/IpCell.jsx:16`
- **What to do:** Each of these renders an `<a target='_blank' href={...}>` pointing at a node's own dashboard IP. Add `rel='noopener noreferrer'`.

  Before (e.g. `MostHosted/index.jsx:74`):
  ```jsx
  <a target='_blank' href={`http://${nodeIpDef.host}:${nodeIpDef.active_port_os}`}>
  ```
  After:
  ```jsx
  <a target='_blank' rel='noopener noreferrer' href={`http://${nodeIpDef.host}:${nodeIpDef.active_port_os}`}>
  ```
  Repeat the same `rel` addition in the other three files at the lines listed above.
- **Risk:** None — purely additive attribute, no behavior change to the click itself.
- **Test:** Load demo wallet → open `/nodes`, and check the "Best Uptime" / "Most Hosted" panels on `/home`. Click through to a node IP link (or inspect the rendered `<a>` tag in DevTools) and confirm `rel="noopener noreferrer"` is present on all four.
- **Issues resolved:** S1

---

#### Task S2 — Re-enable `react/jsx-no-target-blank` (and review other disabled ESLint rules)

- **File:** `client/package.json` → `eslintConfig.rules`
- **What to do:** Remove `"react/jsx-no-target-blank": "off"` so this class of bug (Task S1) gets caught automatically in future. While in this block, also review whether these are safe to leave off long-term or were only disabled to unblock a build at some point:
  - `"eqeqeq": "off"` — allows `==`/`!=`, a common source of subtle bugs
  - `"no-unused-vars": "off"` — hides dead code and typos
  - `"no-func-assign": "off"`, `"no-cond-assign": "off"` — both can mask real bugs
  - Recommendation: re-enable `react/jsx-no-target-blank` now (Task S1 depends on it staying clean). For the rest, re-enable one at a time, run `yarn build`/`yarn lint`, and fix what surfaces rather than re-disabling — each will likely surface a handful of small, low-risk cleanups.
- **Risk:** Low, but re-enabling several at once could surface a lot of lint errors at once. Do `react/jsx-no-target-blank` first (small, contained), then tackle the others as separate follow-up tasks if desired.
- **Test:** `yarn build` completes without new errors after Task S1 is also done (so the target-blank rule has nothing left to flag).
- **Issues resolved:** S2

---

#### Task S3 — Switch node geolocation to HTTPS (or drop it gracefully)

- **File:** `client/src/main/Gamification/geolocate.js`
- **What to do:** Replace the plain-HTTP call to `ip-api.com` with an HTTPS-capable alternative. `ip-api.com`'s free tier doesn't support HTTPS, so either:
  - Move to a provider with a free HTTPS tier (e.g. `ipapi.co`, `ip-api.com`'s paid HTTPS tier, or similar), or
  - If geolocation isn't essential, wrap the call so it fails silently and skip it in production over HTTPS.

  Before:
  ```javascript
  const res = await fetch('http://ip-api.com/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unique.map((query) => ({ query })))
  });
  ```
  After (example using an HTTPS-capable host — adjust request/response shape to match whichever provider you choose):
  ```javascript
  const res = await fetch('https://your-chosen-https-geo-api/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unique.map((query) => ({ query })))
  });
  ```
- **Risk:** Low — this function already returns `{}` on failure (per its own doc comment), so worst case geolocation flags just don't show.
- **Test:** Load demo wallet, confirm country flags still appear next to node IPs where expected, and confirm the browser console shows no mixed-content warnings for this call.
- **Issues resolved:** S3

---

#### Task S4 — Add security headers to nginx config

- **File:** `conf/deploy-nginx.conf`
- **What to do:** Add a baseline security header set inside the `server` block. Start conservative and tighten `Content-Security-Policy` once you've confirmed nothing breaks (it's the one most likely to need iteration, since the app calls several third-party APIs directly from the browser — `explorer.runonflux.io`, `api.runonflux.io`, `api.frankfurter.app` unless Task S5 is done, `fusion.runonflux.io`, `ip-api.com`/its replacement).

  Add inside `server { ... }`, before the `location` blocks:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  # Enable once served over HTTPS in production:
  # add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  # Start permissive, then tighten connect-src to the exact list of hosts you call.
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://explorer.runonflux.io https://api.runonflux.io https://fusion.runonflux.io https://api.frankfurter.app; style-src 'self' 'unsafe-inline'; script-src 'self'" always;
  ```
- **Risk:** Low, but `Content-Security-Policy` can break third-party calls if a host is missed from `connect-src`. Test thoroughly after adding — check DevTools console for any `Refused to connect` CSP errors and add the missing host.
- **Test:** Deploy locally via the Docker build/run steps in the Testing Protocol above, load the demo wallet, and confirm no CSP violations appear in the console and all data still loads.
- **Issues resolved:** S4

---

#### Task S5 — Proxy currency rates through your own API (removes CORS console noise)

- **File:** `client/src/apidata.js` (`usdCurrencyRate()`, `lazy_load_currency_rate()`), plus a new endpoint in `api/src`
- **What to do:** `api.frankfurter.app` intermittently responds without an `Access-Control-Allow-Origin` header, which the browser blocks and logs as a CORS error. This is a third-party host you don't control, so it can't be fixed from the client. The clean fix is to fetch it server-side (from your Rust `api/` service, which nginx already proxies at `/api`) and serve it same-origin with your own caching:

  New Rust endpoint (sketch — adapt to your existing `api/src` structure/framework):
  ```rust
  // GET /api/currency-rates
  // Fetches https://api.frankfurter.app/latest?to=USD,EUR,AUD&base=USD server-side,
  // caches the result in memory for 1 hour, and returns it same-origin.
  ```

  Client change in `apidata.js`:
  ```javascript
  export async function lazy_load_currency_rate() {
    const res = await fetch('/api/currency-rates');
    if (!res.ok) return null;
    return res.json();
  }
  ```
- **Risk:** Medium — touches the API service, not just the client. Keep the existing client-side TTL cache (`CURRENCY_RATE_TTL_MS`) as a second layer regardless.
- **Test:** Confirm `/api/currency-rates` returns rates in the browser network tab (not `api.frankfurter.app` directly), and confirm no CORS errors appear in the console across several reloads.
- **Issues resolved:** S5, and removes the console noise from the current implementation

---

### Phase B — Performance Fixes
**Priority: High | Risk: Low–Medium | Effort: Low–Medium**

---

#### Task P5 — Guard and de-parallelize `fetch_total_donations()`

- **File:** `client/src/apidata.js`
- **What to do:** This function fetches the full transaction history of the donation address (`window.gContent.ADDRESS_FLUX`) on every wallet search, to check whether the searched wallet appears as a sender. Two problems: it fires every page of results in parallel (which explorer.runonflux.io rate-limits, returning 400s as the donation address accumulates more transaction history), and neither `.json()` call checks `res.ok` or content-type first, so a non-JSON error response (e.g. `Loading block index.... Code:-28` while the explorer's node resyncs) throws an uncaught `SyntaxError`.

  Replace the function with:
  ```javascript
  export function fetch_total_donations(walletAddress) {
    return new Promise((resolve) => {
      const baseUrl = 'https://explorer.runonflux.io/api/txs?address=' + window.gContent.ADDRESS_FLUX;

      const safeFetchJson = async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null; // e.g. 400/500 — skip this page
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) return null; // e.g. "Loading block index..."
          return await res.json();
        } catch (e) {
          return null;
        }
      };

      (async () => {
        const firstPage = await safeFetchJson(baseUrl);
        if (!firstPage) {
          resolve(0); // explorer unavailable — fail gracefully instead of crashing
          return;
        }

        const { pagesTotal } = firstPage;
        const pageNums = pagesTotal <= 1 ? [] : new Array(pagesTotal - 1).fill(0).map((_v, i) => i + 1);

        // Fetch pages sequentially instead of all at once, to avoid the explorer
        // API's rate limiting on bursts of concurrent requests.
        const pages = [firstPage];
        for (const page of pageNums) {
          const json = await safeFetchJson(`${baseUrl}&pageNum=${page}`);
          if (json) pages.push(json);
        }

        const txs = pages.reduce((prev, current) => prev.concat(current.txs || []), []);
        resolve(txs.filter((tx) => tx.vin.some((v) => v.addr === walletAddress)).length);
      })();
    });
  }
  ```
- **Risk:** Low — behavior on success is identical; the only change is failure handling and request pacing.
- **Test:** Load demo wallet, confirm the donation count still displays correctly, and confirm the Network tab no longer shows a burst of parallel `txs?address=...` requests or `400` responses.
- **Issues resolved:** P5, and eliminates the `SyntaxError: Unexpected token 'L', "Loading bl"...` console error

---

#### Task P6 — Guard all remaining raw `fetch().then(res => res.json())` calls

- **File:** `client/src/apidata.js` (multiple locations — search for `.json()`)
- **What to do:** Apply the same `res.ok` + content-type pattern used in Task P5 to the other unguarded fetches in this file (e.g. `validateAddress`, `getDemoWallet`, the `explorer.runonflux.io/api/addr/...` and `richest-addresses-list` calls). Wrap each in try/catch if not already, and check `res.ok` before parsing.
- **Risk:** Low — purely defensive, no change to the happy path.
- **Test:** Load demo wallet and confirm all values still populate correctly; spot-check by temporarily pointing one URL at a bad endpoint to confirm it fails gracefully instead of throwing.
- **Issues resolved:** P6

---

#### Task P1 (carried over) — Request deduplication between `/home` and `/nodes`

- **What to do:** Navigating between the two routes currently fires two independent full sets of API calls (`fetch_global_stats`, `fetch_total_donations`, `fetch_total_network_utils`, `fetch_global_performance_rankings`, etc. are each called separately in `MainApp.jsx` and `Home.jsx`). Introduce a shared in-memory cache (keyed by wallet address + a short TTL, e.g. 30–60s) at the top of `apidata.js` so a route switch within that window reuses the last result instead of re-fetching.
- **Risk:** Medium — needs care around cache invalidation when the user searches a *different* wallet.
- **Test:** Load demo wallet on `/home`, switch to `/nodes`, switch back. Confirm values stay consistent and the Network tab shows no duplicate calls within the TTL window.
- **Issues resolved:** P1

---

### Phase C — Structural Improvements (carried over, longer term)
**Priority: Low–Medium | Risk: Medium–High | Effort: High**

---

#### Task D5 — Extract shared `useFluxNodeData()` hook

- **What to do:** `MainApp.jsx` and `Home.jsx` are still near-identical class components (same constructor, lifecycle, RxJS subscription pattern). Refactor the shared logic into a `useFluxNodeData()` custom hook to remove the duplication.
- **Risk:** High — touches core data flow for both routes. Requires thorough before/after value checks per the Testing Protocol.
- **Prerequisite:** None blocking, but easier once Task P1 (shared caching) is in place, since the hook is a natural place to hold that cache.

---

#### Task 5C — Upgrade `rxjs` from 5.x to 7.x

- **What to do:** `client/package.json` still pins `"rxjs": "^5.6.0-forward-compat.5"`, an old, non-tree-shakeable version. Upgrade `rxjs` and `localforage-observable` to modern versions and migrate all subscriptions to the pipe-based API (rxjs 7 is not backwards compatible with 5's operator-chaining style).
- **Risk:** High — breaking change across every subscription in `MainApp.jsx`, `Home.jsx`, and any `LayoutContext` usage.
- **Prerequisite:** Easier after Task D5 (shared hook), since it reduces the number of places the subscription pattern needs migrating.

---

## Task Dependency Graph

```
Phase A (Security) — do first, all independent
├── S1 (noopener links)        → no dependencies
├── S2 (eslint rule)           → do after S1, so the rule has nothing to flag
├── S3 (geolocate HTTPS)       → no dependencies
├── S4 (nginx headers)         → no dependencies
└── S5 (currency proxy)        → touches api/src, independent otherwise

Phase B (Performance)
├── P5 (donations fetch fix)   → no dependencies
├── P6 (guard remaining fetches) → no dependencies, same pattern as P5
└── P1 (request dedup)         → no dependencies, but pairs naturally with D5 below

Phase C (Structural, longer term)
├── D5 (shared useFluxNodeData hook) → no hard blockers
└── 5C (rxjs upgrade)                → easier after D5
```

---

## File Change Inventory

| File | Action | Task |
|------|---------|-------|
| `client/src/main/MostHosted/index.jsx` | Add `rel='noopener noreferrer'` to line 74 | S1 |
| `client/src/main/BestUptime/index.jsx` | Add `rel='noopener noreferrer'` to line 74 | S1 |
| `client/src/main/PayoutTimer/index.jsx` | Add `rel='noopener noreferrer'` to line 139 | S1 |
| `client/src/components/NodeGridTable/CustomisedCells/IpCell.jsx` | Add `rel='noopener noreferrer'` to line 16 | S1 |
| `client/package.json` | Remove `"react/jsx-no-target-blank": "off"`; review other disabled rules | S2 |
| `client/src/main/Gamification/geolocate.js` | Switch to HTTPS geolocation provider | S3 |
| `conf/deploy-nginx.conf` | Add security headers | S4 |
| `api/src/...` (new endpoint) | Add `/api/currency-rates` server-side proxy | S5 |
| `client/src/apidata.js` | Point `lazy_load_currency_rate()` at `/api/currency-rates` | S5 |
| `client/src/apidata.js` | Rewrite `fetch_total_donations()` per Task P5 | P5 |
| `client/src/apidata.js` | Guard remaining unguarded `fetch()` calls | P6 |
| `client/src/apidata.js` | Add short-TTL in-memory cache for shared route data | P1 |
| `client/src/main/MainApp.jsx`, `client/src/home/Home.jsx` | Extract into `useFluxNodeData()` hook | D5 |
| `client/package.json` | Upgrade `rxjs` and `localforage-observable` | 5C |

---

## Notes for Sub-Agents

When delegating a task to a sub-agent, provide:
1. The Task ID (e.g., `S1`, `P5`)
2. The exact files to modify (see File Change Inventory above)
3. The Testing Protocol section from this document
4. The demo URL: `https://fluxnode.app.runonflux.io/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ`
5. Whether the task has a prerequisite (see Dependency Graph)

Each sub-agent should:
- Read all files it will modify before making any changes
- Make the smallest possible change that achieves the goal
- Not refactor anything outside the task scope
- Verify imports after any file move or rename
- Report exact values from before and after the change for key calculations
- Flag anything in the "Status of the Previous Plan" table above that turns out to be inaccurate (it was verified against `main` as of 2026-08-14, but the branch may have moved on)
