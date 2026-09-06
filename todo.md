# FluxNode — Project Plan

> **This is now the single top-level planning/status doc for this repo.** It replaced
> `PREMIUM_FEATURES_PLAN.md` (retired 2026-09-06 — fully shipped, see Changelog below)
> and consolidates status-tracking that used to be scattered across several root-level
> `.md` files. `LIVE_REDESIGN_PLAN.md` and `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` stay as
> separate files — they're large, detailed, and actively needed as the execution
> reference for Track 1 below — but this file is where "what's next and in what order"
> lives. Update this file's status lines as work lands; don't let a second copy of the
> plan drift in a session's memory file instead.

**Last updated:** 2026-09-06.

---

## What's next, in order

### Track 1 — Live Page Redesign (ready to start, do this first)

**Status: fully spec'd, zero open design questions, start straight at Session A.**

Full detail lives in `LIVE_REDESIGN_PLAN.md` (session breakdown) and
`FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (the 80-section source-of-truth spec) — this
section is a pointer, not a restatement.

- [x] **Session A — Visual shell + data summaries.** `FlowCanvas`/`FlowBlock`/
  `ActivityCard`/`FlowConnectors`, restyled `ChainRail`/`DetailsPanel`,
  `buildBlockFlowSummary()` + tests, Dev Fund reward-category extraction.
  Shipped in PR #<fill in after opening the PR> — see
  `docs/superpowers/plans/2026-09-07-live-session-a.md` for the full task
  breakdown.
- [ ] **Session B — Interaction + motion.** Depends on Session A's shell existing.
- [ ] **Session C — History + details integration.** Depends on Session B's state
  model.
- [ ] **Session D — Resilience + final polish.** Depends on all three prior sessions;
  runs the full manual QA matrix.

Process: same as every prior session in this repo — `superpowers:writing-plans` →
`superpowers:subagent-driven-development` (fresh implementer per task, task review,
final whole-branch review) → PR.

### Track 2 — Analytics "Premium Feel" Visual Refresh (proposed, needs a decision pass before planning starts)

**Status: reviewed and scoped below, but NOT yet brainstormed/confirmed with the
user** — the findings and proposed direction below are my analysis from a live visual
pass (2026-09-06) plus a code read of the current SCSS/design-token system, not
settled decisions. Genuine aesthetic choices here (palette, whether to add a charting
library, how aggressive the redesign gets) need the same confirm-before-plan treatment
every other piece of new work in this repo has gotten — run
`superpowers:brainstorming` on this before writing an implementation plan. Queued
**after** Track 1 per your instruction — pick it up once Live Redesign is done, or
sooner if you'd rather interleave (same as Analytics/Live were interleaved before).

#### Why: what's actually wrong, specifically

Checked live (2026-09-06, `PREMIUM_TESTING_MODE=true`, all 4 tabs, light + dark) and
against the current SCSS. Not vague "make it nicer" — specific, reproducible
observations:

1. **The paywall and every empty-state reuse one identical, generic pattern**: a
   small centered card — gray lock icon, bold one-line headline, gray subtext, blue
   "Unlock" button — floating on an otherwise blank page. This is the exact same
   component/markup shape whether it's the top-level "Analytics is a premium
   feature" gate or the Donor tab's "No donor wallet connected" state. A feature
   being sold as premium currently *looks* identical to a plain access-denied
   screen — no preview of what's behind it, no tab-specific framing of what that
   donation actually unlocks, nothing that would make the wall itself feel worth
   crossing.
2. **Every panel uses the same tiny, low-contrast chrome**: 0.68rem uppercase
   letter-spaced micro-labels for headers, 14-16px padding, and the only color
   accent per panel is either a single 2px border (`NetworkTab`'s
   `border-left: 2px solid #8b5cf6`) or one two-tone bar (`ChainActivityTab`'s
   utility/empty split). Reads as an internal admin dashboard, not a paid feature.
3. **No hero moment anywhere.** Every tab goes straight from a one-line page
   subtitle into small ranked-list panels. There's no headline stat, no "here's the
   one number that matters," nothing that signals you unlocked something.
4. **"Charts" are minimal by any standard**: horizontal ranked bar lists (Apps,
   Network's continent breakdown), a dot-scatter world map (Network), and one
   2-color progress bar (Chain Activity, and only for the currently-selected
   range — no trend over time). No per-day/per-category breakdown visualization
   anywhere, no smooth data-entry animation, no tooltips beyond Blueprint's
   defaults.
5. **Whitespace imbalance, not "spacious."** E.g. Chain Activity's two ~250px
   panels sit above roughly 700px of flat blank page at a standard viewport height
   — reads as unfinished, not premium-minimal.
6. **Ad hoc, inconsistent accent colors.** `_global.scss` already defines a real
   token set (`--accent-blue/indigo/purple/green/amber/red`) but almost nothing
   uses them — `NetworkTab` hardcodes `#8b5cf6`, `ChainActivityTab` hardcodes its
   own green/red instead of `--accent-green`/`--accent-red`, `hov-badge` hardcodes
   `#2686d0`. Every tab invented its own one-off palette rather than drawing from
   one shared system, so the four tabs don't read as one designed product.
7. **Single typography scale reused everywhere** — no real size hierarchy beyond
   "bold vs. not," nothing sized for a genuine headline stat.
8. **Possible dark-mode rendering issue, unconfirmed** — right after toggling dark
   mode, the Analytics page header/subtitle and tab labels appeared washed-out
   (still light-styled) for at least one full screenshot while the top nav and
   footer had already switched, even though `Analytics.scss` uses theme-aware
   `var(--text-primary)`/`var(--text-tertiary)` tokens that should switch
   automatically. `ChainActivityTab`'s own panels rendered dark mode correctly in
   the same pass. **Not root-caused** — could be a genuine bug in how/where the
   `app-mode-dark` class lands relative to Blueprint's `<Tabs>`, or could be a
   transition-timing artifact I caught mid-frame. Verify with a clean screenshot
   sequence before assuming either way; worth a few minutes at the start of
   whichever session touches this.

#### What's already a solid foundation (don't rebuild this part)

- A real design-token system exists (`client/src/styles/_global.scss`):
  `--surface-*`, `--text-*`, `--border-*`, `--accent-*`, `--shadow-*`, `--radius-*`,
  full light/dark pairs, plus the `rule-mode-dark()` mixin
  (`client/src/styles/_functional.scss`) every component already uses correctly.
  A refresh should *lean on and extend* this system (new tokens if needed), not
  replace it.
- The shared `.hov-panel`/`.hov-header`/`.hov-ranked-list` chrome convention
  (deliberately duplicated per component, not cross-imported — see any tab's
  `index.scss` header comment) is a reasonable base to restyle *once* and have every
  tab pick up, even duplicated — don't relitigate the duplication convention itself.

#### Proposed direction (for the brainstorming pass to confirm or redirect, not a locked decision)

A session structure mirroring `LIVE_REDESIGN_PLAN.md`'s proven shape (shared
foundation first, then apply it, then polish):

- **Session 1 — Design foundation.** Extend the token system with whatever a
  "premium" pass actually needs (a distinct accent treatment per data domain,
  a real headline/stat type scale), and build ONE shared, richer empty-state/gate
  component to replace the generic lock-box — reused everywhere instead of the
  current duplicated ad hoc markup. This is the enabling session everything else
  builds on, same role Live Redesign's Session A plays for that track.
- **Session 2 — Apps + Network tabs.** Apply the new system; add a headline stat
  per tab; evaluate whether the world map and ranked lists need real visual
  upgrades or just the new chrome.
- **Session 3 — Donor + Chain Activity tabs.** Apply the new system; Chain
  Activity is the clearest case for a real trend chart (7 daily bars instead of
  one aggregate ratio); Donor gets a payout-timing hero treatment.
- **Session 4 — Cross-tab QA + dark-mode fix + final polish.** Resolve item 8
  above for real, full light/dark matrix across all 4 tabs plus both gate states,
  responsive check.

**Open questions for the brainstorming pass** (don't guess these — ask):
- Does "premium feel" call for a real charting library (e.g. Recharts, already
  flagged as "not installed, recommended" in the original Analytics data-inventory
  reference), or should it stay hand-rolled SVG/CSS to match `/live`'s "no new
  dependency" discipline?
- Is a redesigned gate/empty-state allowed to preview real (blurred/ghosted) data
  shapes behind the lock, or does that raise its own concerns (showing real network
  data to non-donors even abstracted)?
- How much of this should share visual language with the upcoming `/live` redesign
  (both are "premium" surfaces) vs. stay Analytics-specific?

---

## Changelog (what's already shipped)

Consolidated from the now-retired `PREMIUM_FEATURES_PLAN.md`.

- **Donor verification** — PR #170, #171, #172 (2026-09-05). `/live` genuinely
  donor-gated for real visitors, `DonorContext.donorWallet` real.
- **Analytics page shell + Apps tab** — PR #173. `/analytics` route + tab shell,
  App Ecosystem/Top Hosted Apps extracted from Home, top node operators, top app
  owners, Flux-team-sponsored %.
- **Analytics Network tab** — PR #174. Continent rollup, hand-rolled world map.
- **Analytics Donor tab** — PR #175. Payout timing, his nodes, apps-by-category,
  utilization vs. network average.
- **Live redesign planning (docs only)** — PR #176. `LIVE_REDESIGN_PLAN.md` +
  `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md`.
- **Chain Activity design spec** — PR #180 (2026-09-06).
  `docs/superpowers/specs/2026-09-06-chain-activity-design.md`.
- **Chain Activity tab implementation** — PR #181 (2026-09-06, merged). First
  persisted/periodically-scanned backend state this Rust API has had; first
  Rust-side test coverage in this repo. Includes a mid-build rate-limit resilience
  fix and a final-review fix wave (gap-safe tx-page failures, chunked/incremental
  backfill, wider retry budget, partial-range UI indicator) — see
  `docs/superpowers/plans/2026-09-06-analytics-session5-chain-activity.md` for full
  detail. **This closes out the Analytics tab set originally scoped in
  `PREMIUM_FEATURES_PLAN.md`** — Apps/Network/Donor/Chain Activity are all shipped.

## Known, filed elsewhere or unfiled (not scheduled)

- `stats.runonflux.io/fluxinfo` intermittently returns HTTP 200 with `status:
  "error"` — resilience layer (retry → last-known-good → stale marker) already
  handles it; still genuinely flaky upstream, nothing to build.
- Older backlog items from 2026-08-26 (split `apidata.js` #147, sessionStorage-quota
  #153, Rust `/header` endpoint #145, Titan Info #47, iOS column width #141) — never
  picked back up across several sessions since; re-check the issue tracker before
  assuming still relevant.
- Home-vs-VPS/datacenter detection (ipinfo.io-based) — deferred, unscheduled, not
  blocking anything (see the git history of the now-retired
  `PREMIUM_FEATURES_PLAN.md` for the full research if this gets picked up later).
- FLUX-sent-to-exchanges tracking — no reliable public data source exists (checked
  CoinCarp, both Fluxtracker repos). Not buildable until real deposit addresses
  surface somewhere.
