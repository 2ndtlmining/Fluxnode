# Analytics Rework — Session 4 Design Spec

Donor + Chain Activity visual refresh and the Recharts trend chart.

This is the fourth of the five sessions laid out in
`2026-09-10-analytics-rework-design.md` ("Part D — Visual/premium refresh",
delivery item 4). That document remains the governing spec; this one adds the
detail Part D deferred, and records the decisions taken during Session 4's own
brainstorming.

Baseline: `main` at `4d1f59a` (PR #201, Session 3, merged).

## Overview

Session 3 established the visual vocabulary — a per-tab accent color applied as
a left-edge strip plus a faint gradient wash, a headline "hero" stat per tab,
and `PanelGate`'s opt-in `preview="blur"` locked state. Session 4 applies that
vocabulary to the two remaining tabs and replaces Chain Activity's single
aggregate progress bar with a real daily trend chart.

This session is **purely frontend**. Issue #199's utility drill-down was
briefly bundled in and has been unbundled again (2026-09-11): it is a backend
feature, and the work ahead of it is a site-wide correctness-and-polish pass.
The design work already done for it is recorded on the issue itself so none of
it needs redoing.

## Decisions taken before this spec

These decisions were settled during brainstorming and are recorded here so they
are not relitigated during implementation.

1. **The Donor tab's locked state stays `preview="plain"`**, not blur-preview.
   `donorWallet` (`DonorContext.jsx`) is only ever set via
   `useDonorWalletCheck`'s `SUCCESS` path, so a genuinely locked visitor always
   has `donorWallet === null` and `DonorTab` renders its own `NoWalletState()`
   (`DonorTab/index.jsx:154`) — a second, independent lock message nested inside
   whatever `PanelGate` renders, since `Analytics.jsx:30` gates DonorTab at the
   whole-tab level. Blurring that would either be a double-gate over nothing, or
   would require fabricated sample data. Both were rejected.

2. **Chain Activity's headline hero is "today's utility blocks"**, a real count.
   Part D originally suggested "today's tx count", which does not exist anywhere
   in the data model — `chainActivity.js`'s `daily` array carries only
   `{date, utilityBlocks, emptyBlocks}`.

3. **The 24H/7D range toggle is removed.** The Recharts trend chart always shows
   the full retained window (up to `RETENTION_DAYS = 8`). A 1-day chart is a
   single bar, not a trend.

4. **Issue #199 is NOT part of this session.** It was bundled in, then
   unbundled on 2026-09-11 when the wider priority became site-wide
   correctness and visual polish rather than new features. Its full design —
   the measured ~17% utility-block ratio, the disjoint-subtotals shape, the
   `UtilityBlockRecord` model and the new endpoint — is recorded as a comment
   on the issue.

5. **Verification uses the full Sessions 1-2 discipline**, including the live
   wallet replay, despite no ranking code being touched.

## Part A — Accent tokens

Extends the existing system in `client/src/styles/_global.scss`. No new tokens.

Per-tab accent, completing Part D's mapping (Apps → `--accent-blue` and Network
→ `--accent-purple` shipped in Session 3):

- **Donor tab → `--accent-green`**
- **Chain Activity tab → `--accent-amber`**

Applied via Session 3's established pattern: a 2px `border-left` strip on
`.hov-panel`, plus a faint gradient wash on `.hov-header`
(`linear-gradient(90deg, rgba(...) 0%, transparent 60%)`).

Hardcoded one-offs replaced with tokens:

| file | line | current | becomes |
|---|---|---|---|
| `ChainActivityTab/index.scss` | 67–69 | `#2686d0` | `--accent-amber` |
| `ChainActivityTab/index.scss` | 183, 190 | `#2686d0`, `#5eb8ff` | `--accent-amber` |
| `ChainActivityTab/index.scss` | 205, 216 | `#22c55e`, `#4ade80` | `--accent-green` |
| `ChainActivityTab/index.scss` | 220 | `#ef4444` | `--accent-red` |
| `WorldMap/index.scss` | `.wm-panel` | `#0ea5e9` | `--accent-purple` |

The `WorldMap` entry is the item parked from Session 3, folded in here by
explicit user selection. Session 4 is the last session that touches the token
system, so it is now or never.

### The `hov-*` collision guard — mandatory, not optional

Session 3 shipped a Critical bug caught only during final review: unscoped
single-class `hov-*` selectors collide inside the shared `/analytics` lazy
webpack chunk, and whichever stylesheet imports last in `Analytics.jsx` wins
silently. It produces **zero visible difference from baseline**, so no amount of
screenshot or click-through QA can catch it.

Session 4 recolors exactly the two files that still carry the hazard:

- `ChainActivityTab/index.scss:177` — unscoped `.hov-badge`
- `DonorTab/index.scss:205` — unscoped `.hov-badge`

Both must be scoped to their tab root — `.chain-activity-tab .hov-badge` and
`.donor-tab .hov-badge` — giving specificity (0,2,0), which durably beats the
unscoped (0,1,0) rules in `AppsTab` and `TopHostedApps` regardless of future
import order. This is a durable fix, not a today's-order fix.

**Verification is against built CSS bytes, not source.** A source-level diff
cannot detect this class of bug. Build, then grep the emitted chunks —
`client/build/static/css/*.chunk.css` — for `.hov-badge` and confirm every
surviving rule is either scoped to a tab root or belongs to a file this session
did not touch. Checking only the file you edited is exactly what missed the bug
in Session 3.

## Part B — Headline hero stats

Reuses the `.apps-tab-hero` pattern established in Session 3
(`AppsTab/index.scss:239`): a 2.75rem tabular-nums value over a small uppercase
label, plain `--text-primary` in light mode and a gradient-clipped fill in dark
mode using the tab's own accent.

- **Chain Activity** → today's utility blocks, read from the most recent entry
  in the `daily` array. Falls back to the existing "still building history"
  empty treatment when the array is empty.
- **Donor** → the payout headline, from `PayoutCard`'s existing real LAST /
  NEXT PAYOUT values. This is real unlocked content, consistent with decision 1;
  the plain lock message is restyled with the new tokens, not replaced
  structurally.

New classes `.ca-tab-hero*` and `.dt-tab-hero*` mirror `.apps-tab-hero*`. They
are prefixed per-tab, so they carry no collision risk of their own.

## Part C — Recharts trend chart

Adds **Recharts** as a new npm dependency, scoped to `client/src/analytics/`
only. `/live` keeps its no-new-dependency discipline unchanged. The existing
hand-rolled ranked-bar panels in Apps and Network are explicitly not touched.

Replaces `UtilitySummary`'s single aggregate two-color progress bar with a
**stacked daily bar chart** — utility and empty blocks per day — across the full
retained window (up to `RETENTION_DAYS = 8` days).

Removed with the toggle (decision 3):

- `RANGE_OPTIONS` and the `.ca-range-toggle` / `.ca-range-btn` markup and styles
  in `ChainActivityTab/index.jsx`
- `filterDailyRange` in `chainActivity.js` and its tests
- The `rangeDays` state and its propagation into `UtilitySummary` and
  `TeamTxList`

`TeamTxList` currently derives its cutoff from `rangeDays`
(`ChainActivityTab/index.jsx:122` — `cutoffHeight = lastScannedHeight -
rangeDays * 2880`). With the toggle gone it uses the full retained window.

The frontend has no `RETENTION_DAYS` constant: the backend's lives in
`chain_activity.rs`, and `apidata.js:1295`'s `BLOCKS_PER_DAY = 2880` is local
and unexported. Export both from `chainActivity.js` as
`BLOCKS_PER_DAY = 2880` and `RETENTION_DAYS = 8`, each carrying the existing
"kept in sync with the backend constant" comment, and use them in place of the
inline `2880`. This keeps the duplication in exactly one place per side rather
than adding a third copy.

Chart requirements:

- Theme-aware, and this needs a wiring change. Recharts takes colors as props,
  not CSS, so the chart needs a React-level theme signal — and
  `Application.jsx:178` currently renders `<Analytics />` with **no `theme`
  prop**, unlike `Home` (line 130), `MainApp` (line 144) and `Demo` (line 156),
  which all receive `theme={darkMode ? 'dark' : 'light'}`. There is no theme
  context or hook in this codebase; the only signals are that prop, the
  `app-mode-dark` class on the `.App` element, and `localStorage`'s `appTheme`
  (which does not react to a toggle).

  **Decision: thread the existing prop.** `Application.jsx:178` becomes
  `<Analytics theme={darkMode ? 'dark' : 'light'} />`, matching the three
  existing call sites exactly; `Analytics` passes it to `ChainActivityTab`,
  which passes it to the chart. This follows the established convention rather
  than introducing a `MutationObserver` or a `getComputedStyle` read, both of
  which would be new patterns for this repo. SCSS keeps using
  `rule-mode-dark()` for everything that is not a Recharts prop.
- Responsive via `ResponsiveContainer`.
- Tooltip showing date, utility count, empty count.
- Accessible fallback: when `daily` is empty, keep the existing "still building
  history" / "no data available" copy rather than rendering an empty chart.

**Cost, recorded rather than hidden:** Recharts is roughly 100 KB gzipped for
one chart — the single largest addition this rework makes. It lands in the lazy
`/analytics` chunk and so does not affect first paint. Part D committed to this
dependency; this spec does not reopen it, but the cost is named.

## Testing

Baseline to re-confirm at session start: `cd client && CI=true npx react-scripts
test --watchAll=false` green, build exit 0. The Session 3 baseline was 317 tests
with 4 pre-existing warning files; more has merged since, so re-measure rather
than assume.

**Frontend unit tests** (new):

- Removal coverage: the `filterDailyRange` tests are deleted with the function;
  confirm nothing else imports it, and that `TeamTxList`'s cutoff still matches
  the full retained window after the `rangeDays` prop is gone.
- The new exported `BLOCKS_PER_DAY` / `RETENTION_DAYS` constants are used
  everywhere the inline `2880` was.
- The chart renders from a `daily` fixture, and falls back to the existing
  empty-state copy rather than an empty chart when `daily` is `[]`.

**Live verification** (mandatory):

- Full light/dark matrix across both refreshed tabs, both gate states,
  responsive check.
- **Built-CSS grep** confirming the scoped `.hov-badge` rules ship in the
  emitted analytics chunk.
- **Live wallet replay**: diff a real wallet's Nodes-page numbers (rankings,
  achievements, tier stats) before and after, per Sessions 1-2. No
  `globalRankings` or ranking-calculation code is touched — DonorTab's data path
  (`donorNodes.js` / `donorUtilization.js` / `donorApps.js`) is visually
  reskinned, not restructured — so this is conservative rather than strictly
  implied. It was chosen deliberately over reasoning about which sessions are
  exempt.

## Delivery

Worktree name **`analytics-session4-donor-chain`**. It cannot be
`analytics-session4`: `worktrees/analytics-session4` already exists as a stale
directory from the earlier session numbering (one of 14 such directories that
`git worktree list` no longer tracks).

Implementation proceeds via `superpowers:writing-plans` then
`subagent-driven-development`, with a final whole-branch review before PR —
matching every prior session in this rework.

**Sizing.** With the #199 drill-down unbundled this is a single, well-sized
visual session,
comparable to Session 3. The sizing risk that the bundled version carried is
gone.

## Out of scope

- **Issue #199's utility drill-down** — unbundled 2026-09-11. Its full design
  lives on the issue.
- `teamSponsored.js`'s unsourced `FLUX_TEAM_OWNER_ZELIDS` comment — parked
  again, not selected for this session.
- The 14 stale `worktrees/` directories and the stray `api;C` file — housekeeping
  unrelated to this work.
- Everything in issues #202–#207 (whitepaper v9 reward-schedule changes, filed
  2026-09-11). Those are tracked separately and deliberately not implemented
  here.
- The dark-mode wash-out bug (todo.md item 8) and the final cross-tab QA, which
  Part D assigns to Session 5.
