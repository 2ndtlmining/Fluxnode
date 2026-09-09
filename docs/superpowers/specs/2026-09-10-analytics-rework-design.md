# Analytics Rework (Track 2) — Design Spec

**Date:** 2026-09-10
**Status:** Approved for implementation

## Overview

Track 2 started (2026-09-06) as a "premium feel" visual refresh of `/analytics`'s
four tabs (Apps, Network, Donor, Chain Activity) and was expanded 2026-09-09/10
after user brainstorming to cover four things together:

- **Part A** — A cross-page donor auto-detection mechanism: typing a wallet
  address into Home's or the Nodes page's existing search box, if that address
  independently qualifies as a donor, unlocks donor status app-wide — today
  that only happens via a dedicated unlock dialog on `/live`.
- **Part B** — Replace the modal `DonorUnlockDialog` with an inline unlock UI,
  used everywhere (both `/live`'s gate and `/analytics`), and restructure
  Analytics' access model from one whole-route gate to **per-panel** gating so
  some panels can be public while others stay donor-only.
- **Part C** — Move four panels from `/home` into `/analytics` (Top Dogs → the
  Network tab; Expiring Today / Deployed Today / Workhorse → the Apps tab),
  starting **public**, with everything already in Analytics today staying
  **donor**-gated.
- **Part D** — A visual/premium refresh of all Analytics content (extended
  design tokens, per-domain accent colors, headline stats, a real Recharts
  trend chart for Chain Activity, and a blurred/ghosted-data-preview treatment
  for locked panels), replacing today's generic lock-box empty state.

All four parts are changes to code that already exists in this repo
(`client/src/` only, plus one new npm dependency — Recharts). No changes to
the Rust API.

**Governing constraint, explicit from the user:** Part A touches the Nodes
page's (`WalletNodes`) and Home's existing wallet-search handlers directly,
and Part C moves `TopDogsPanel`'s data path
(`globalRankings`/`achievements.js`). Both are exactly the code that produced
two real, live-data-only duplicate-ip ranking bugs on 2026-09-09
(`rankInGroup`, `lookupNodeInfo` — see `fluxnode-next-steps` memory, session
2026-09-09c). **Every session touching either area must include a live
before/after comparison on a real wallet, not just unit tests, matching the
manual-comparison discipline that caught those two bugs.** This is a hard
requirement for this spec, not a nice-to-have.

## Part A — Cross-page donor auto-detection

### Current behavior

`DonorContext` (`client/src/contexts/DonorContext.jsx`) is already app-wide
and localStorage-persisted, but only one place ever calls
`setDonorWallet`: `DonorUnlockDialog`, reachable only from `/live`'s and
`/analytics`' route-level `PremiumGate`. Home's wallet search
(`client/src/home/Home.jsx`, class component, `onProcessAddress`) and the
Nodes page's wallet search (`client/src/main/WalletNodes`) are both
completely independent of donor verification today — searching a qualifying
wallet there has no effect on donor status.

`fetch_donor_status` (`client/src/donor/donorStatus.js`) verifies a wallet's
own on-chain donation history to the project's donation address — there is
no wallet-ownership/signature check anywhere in this system, today or in this
design. Auto-detecting from more entry points doesn't change that trust
model, it just reaches the same public on-chain check from two more places
it's already reachable from manually via the dialog.

### New: `useDonorWalletCheck` hook

New module `client/src/donor/useDonorWalletCheck.js`, extracting
`DonorUnlockDialog`'s existing `handleCheck` logic (validate address →
`fetch_donor_status` → on qualifying result, `setDonorWallet`) into a
reusable hook:

```js
const { status, result, check } = useDonorWalletCheck();
// status: same STATUS enum DonorUnlockDialog already has
//   (idle/checking/success/failure/invalid/unverified)
// check(address): async, does the same work handleCheck does today
```

No behavior change to verification itself — this is a pure extraction so
three call sites can share it instead of one.

### Wiring

- Home's `onProcessAddress` and `WalletNodes`' equivalent submit handler each
  gain one additional, fire-and-forget call: `check(address)`. Their existing
  node/earnings lookups for that address are untouched — this is purely
  additive.
- On a qualifying (`isDonor: true`) result, show a success toast via
  `AppToaster` (already imported in `Home.jsx`) — an explicit "You qualify as
  a donor — premium features unlocked!" moment, not silent.
- On a non-qualifying result, do nothing visible — the user didn't search
  that wallet to check donor status, so a random non-donor address shouldn't
  produce an error/toast.
- `WalletNodes` needs the same wiring added; confirm at implementation time
  whether it needs its own `AppToaster` instance or can reach Home's (check
  current toast-plumbing before assuming).

## Part B — Inline unlock UI + per-panel gating

### New: `PremiumUnlock` component

New module `client/src/donor/PremiumUnlock/index.jsx` — the same
input+button+status-message UI `DonorUnlockDialog` has today (same `STATUS`
states, same messages), rendered as a plain inline block instead of inside a
Blueprint `Dialog`. Built on `useDonorWalletCheck` from Part A instead of its
own local logic.

`DonorUnlockDialog` is removed; both `/live`'s gate and `/analytics`' panel
gates render `PremiumUnlock` inline instead of opening a modal.

### Analytics access model change

Today: `Application.jsx` wraps the entire `/analytics` route in one
`<PremiumGate feature='Analytics'>` (`client/src/donor/PremiumGate`) —
non-donors never see the tab shell at all.

New: that route-level wrap is **removed**. `/analytics` becomes an open shell
(page header + tabs always render); individual panels within each tab gate
themselves via a new `PanelGate` component reading from a single config file:

```js
// client/src/analytics/panelAccess.js
export const PANEL_ACCESS = {
  topDogs: 'public',
  expiringToday: 'public',
  deployedToday: 'public',
  workhorse: 'public',
  appEcosystem: 'donor',
  topHostedApps: 'donor',
  worldMap: 'donor',
  donorTab: 'donor',
  chainActivity: 'donor',
};
```

`client/src/analytics/PanelGate/index.jsx` — sibling to `PremiumGate`, same
`isUnlocked` check from `DonorContext`, but takes a `panelKey` prop and looks
up `PANEL_ACCESS[panelKey]` instead of gating unconditionally. When
`'public'` (or when unlocked regardless of config), renders `children`
directly with zero gate chrome. When `'donor'` and locked, renders the
blurred-preview locked state (Part D).

Toggling any panel's access later is a one-line edit to `panelAccess.js` — no
component restructuring needed, per the user's explicit "easy to toggle on
and off" requirement.

`/live`'s `PremiumGate` usage is unaffected — it stays a whole-route gate
(only `/analytics` changes shape here), just with `PremiumUnlock` inline
instead of `DonorUnlockDialog` inside it.

## Part C — Home → Analytics panel moves

Four panels move out of `client/src/home/HomeOverview/index.jsx`:

- **`TopDogsPanel`** → `client/src/analytics/NetworkTab`, alongside the
  existing continent rollup/world map. Data dependency (`globalRankings`,
  i.e. `fetch_global_performance_rankings`) is already fetched independently
  of Home's wallet-lookup flow — a clean cut. `panelAccess.topDogs = 'public'`.
- **`ExpiringTodayPanel`, `DeployedTodayPanel`, `WorkhorsePanel`** →
  `client/src/analytics/AppsTab`, alongside the existing App
  Ecosystem/Top Hosted Apps content. `panelAccess.expiringToday /
  deployedToday / workhorse = 'public'`.

Home keeps `NetworkStatsPanel`, `NetworkResourcesPanel`,
`GeoDistributionPanel`, and the optional `FluxAIPanel` — all confirmed to
stay. `HomeOverview/index.jsx` loses roughly half its panels; the
implementation must check whether the remaining panels' layout/grid CSS
assumed the moved panels' presence (e.g. a grid sized for the old panel
count) and adjust if so.

Everything already in Analytics today (App Ecosystem, Top Hosted Apps, World
Map, the whole Donor tab, Chain Activity) stays `'donor'` in
`panelAccess.js` — confirmed explicitly, not assumed.

## Part D — Visual/premium refresh

### Token extension

Extends (does not replace) the existing system in
`client/src/styles/_global.scss` (`--surface-*/--text-*/--border-*/
--accent-*/--shadow-*/--radius-*`, full light/dark pairs, `rule-mode-dark()`
mixin already used correctly everywhere):

- Per-data-domain accent mapping: Apps → `--accent-blue`, Network →
  `--accent-purple`, Donor → `--accent-green`, Chain Activity →
  `--accent-amber` — replacing today's hardcoded one-offs (`NetworkTab`'s
  `#8b5cf6`, `ChainActivityTab`'s own green/red, `hov-badge`'s `#2686d0`).
- A headline-stat type scale: one large number + label per tab, for a "hero
  moment" every tab currently lacks (Apps → total running apps, Network →
  total nodes, Donor → payout timing headline, Chain Activity → today's tx
  count).

### Locked-panel treatment

`PanelGate`'s `'donor'`-and-locked state replaces today's generic lock-box
(gray icon, one-line headline, gray subtext, blue button — identical
everywhere) with a blurred/ghosted preview: the panel's real content renders
underneath a CSS blur + reduced opacity, with the lock icon/CTA overlaid on
top. Real shapes and rough magnitudes are visible; exact values are
illegible. `'public'` panels render with zero gate chrome, same as any other
panel.

### Charting

Adds **Recharts** as a new npm dependency (already flagged "not installed,
recommended" in the original Analytics data-inventory), scoped specifically
to Chain Activity's daily trend — 7 daily bars with tooltips, replacing
today's single aggregate 2-color progress bar, the one place hand-rolled
SVG was genuinely limiting. Existing hand-rolled ranked-bar-list panels
(Apps, Network) are explicitly **not** touched — no reason to rebuild what
already works, and `/live` keeps its own no-new-dependency discipline
unchanged (Recharts is scoped to `client/src/analytics/` only).

### Dark-mode bug (todo.md item 8)

The unconfirmed dark-mode rendering issue (Analytics header/tab labels
briefly washed-out right after a theme toggle) gets root-caused and resolved
in the final cross-tab QA session below — not a separate piece of work.

## Delivery structure

Mirrors the proven Live-Redesign/prior-Analytics-session pattern (shared
foundation first, then apply it, then polish), five sessions:

1. **Foundation** — `useDonorWalletCheck`, `PremiumUnlock`, `panelAccess.js`
   + `PanelGate`, remove the route-level Analytics `PremiumGate`, wire Home +
   `WalletNodes` auto-detect + toast, remove `DonorUnlockDialog`.
   **Highest-risk session** — touches the Nodes page's and Home's existing
   wallet-search handlers directly. **Must include a live before/after
   comparison of Nodes-page calculations on a real wallet**, per the
   governing constraint above.
2. **IA migration** — move the four panels, trim Home, wire their
   `panelAccess.js` entries. **Must include the same live-data replay
   discipline** used to catch the 2026-09-09 `rankInGroup`/`lookupNodeInfo`
   bugs, since this session moves `TopDogsPanel`'s data path.
3. **Visual refresh, Apps + Network tabs** — token extension, per-domain
   accents, headline stats, blurred-gate preview for the donor-only panels on
   these two tabs.
4. **Visual refresh, Donor + Chain Activity tabs** + the Recharts trend
   chart.
5. **Cross-tab QA + dark-mode fix + final whole-branch review** — full
   light/dark matrix across all tabs and both gate states, responsive check,
   and a final Nodes-page regression pass (live wallet comparison against
   `main`) before this is considered shippable.

Each session gets its own worktree, written task plan (via
`superpowers:writing-plans`/`subagent-driven-development`, matching this
repo's established convention), and a final whole-branch review before PR —
same process every prior session here has used.

## Testing

- Standard suite: `cd client && CI=true npx react-scripts test --watchAll=false`
  must stay green throughout; baseline is 317 tests / build exit 0 / 4
  pre-existing baseline warning files (as of PR #185 merging to `main`,
  2026-09-08 — re-confirm current baseline at Session 1's start since more
  has merged since).
- New unit coverage needed: `useDonorWalletCheck` (all `STATUS` transitions),
  `PanelGate` (public vs. donor vs. unlocked-regardless-of-config), the Home/
  `WalletNodes` auto-detect wiring (qualifying vs. non-qualifying vs.
  fetch-failure cases).
- **Live/manual QA is mandatory, not optional, for Sessions 1 and 2** — see
  the governing constraint above. A real wallet's Nodes-page numbers
  (rankings, achievements, tier stats) must be diffed before/after each of
  those sessions' changes, not assumed safe from unit tests alone.
- Session 5's final review must include the same live Chrome walkthrough
  discipline used for the Live Redesign (light + dark, `/home`, `/nodes`,
  `/analytics` all four tabs, both gate states) before PR.
