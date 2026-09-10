# FluxNode — Project Plan

> **This is now the single top-level planning/status doc for this repo.** It replaced
> `PREMIUM_FEATURES_PLAN.md` (retired 2026-09-06 — fully shipped, see Changelog below)
> and consolidates status-tracking that used to be scattered across several root-level
> `.md` files. `LIVE_REDESIGN_PLAN.md` and `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` stay as
> separate files — they're large, detailed, and actively needed as the execution
> reference for Track 1 below — but this file is where "what's next and in what order"
> lives. Update this file's status lines as work lands; don't let a second copy of the
> plan drift in a session's memory file instead.

**Last updated:** 2026-09-11.

---

## What's next, in order

### Track 1 — Live Page Redesign (DONE — all four sessions shipped)

**Status: complete.** Sessions A-D shipped as PRs #184, #185, #186 and #190.

Full detail lives in `LIVE_REDESIGN_PLAN.md` (session breakdown) and
`FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (the 80-section source-of-truth spec) — this
section is a pointer, not a restatement.

- [x] **Session A — Visual shell + data summaries.** `FlowCanvas`/`FlowBlock`/
  `ActivityCard`/`FlowConnectors`, restyled `ChainRail`/`DetailsPanel`,
  `buildBlockFlowSummary()` + tests, Dev Fund reward-category extraction.
  Shipped in PR #184 — see
  `docs/superpowers/plans/2026-09-07-live-session-a.md` for the full task
  breakdown.
- [x] **Session B — Interaction + motion.** Depends on Session A's shell existing.
  Shipped in PR #185 — see
  `docs/superpowers/plans/2026-09-07-live-session-b.md` for the full task
  breakdown.
- [x] **Session C — History + details integration.** Depends on Session B's state
  model. Shipped in PR #186 — see
  `docs/superpowers/plans/2026-09-08-live-session-c.md` for the full task
  breakdown.
- [x] **Session D — Resilience + final polish.** Depends on all three prior sessions;
  runs the full manual QA matrix. Shipped in PR #190 — see
  `docs/superpowers/plans/2026-09-09-live-session-d.md` for the full task
  breakdown.

Process: same as every prior session in this repo — `superpowers:writing-plans` →
`superpowers:subagent-driven-development` (fresh implementer per task, task review,
final whole-branch review) → PR.

### Track 2 — Analytics rework (IN PROGRESS — Sessions 1-3 shipped, Session 4 spec'd and next)

**Status: brainstorming underway, one sub-piece already shipped.** Track 1 (Live
Redesign) is fully done — see above. Track 2 started as a proposed "premium feel"
visual refresh (2026-09-06 analysis below) and was expanded 2026-09-09 to also cover:
bringing `/home` features into `/analytics` where it makes sense, rethinking the
wallet-unlock UX for donor-gated content, and Chain Activity's sync-status messaging.

- [x] **Chain Activity sync-status messaging** — split off as its own bounded fix
  (existing flow, no spec needed) since it was small and independently valuable.
  **PR #192, merged 2026-09-09.** The `/api/v1/chain-activity` endpoint used to
  hardcode `success: true` regardless of what was on disk, so a scanner that had
  never run, stalled (most likely rate-limited by `explorer.runonflux.io`, a
  documented failure mode of that API), or a frontend that couldn't reach the API
  at all were all indistinguishable — same silent "Still building history" message
  every time. Backend now tracks and exposes real scan health
  (`last_attempt_at`/`last_success_at`/`last_outcome`); frontend shows an accurate
  banner instead, hidden when healthy.
  - [ ] **Follow-up found post-merge, PR #193 open (`fix/chain-activity-in-progress-status`), awaiting review/merge.**
    Actually running the production Docker image (not just `yarn start`) surfaced
    a real second bug: a scan that's been legitimately running/retrying for
    minutes (a genuine cold-start backfill takes that long even with zero
    problems) looked identical to "never started" — the same ambiguity #192 was
    meant to fix, just relocated to a different time window. Fixed: a new
    `in_progress` status persisted the instant a cycle starts. Also adds real
    progress visibility (block X of Y, %, console logging) per direct user
    request.
  - [ ] **Still unverified: block 2,934,901 / tx `46ebc1517f0a5bc7e781e46e2c380f98fe6ce210b1699ab433e084d6a1ce2b2c`
    on `/live` and Chain Activity.** Blocked by `explorer.runonflux.io`'s rate
    limit — confirmed both currently active AND very easy to re-trip (one clean
    check is not a green light for more). `/live` also has no historical-block
    lookup at all (live rolling window only), so this needs either a long
    genuinely-idle wait, the user checking from a different network, or a
    different verification approach entirely (e.g. a fixture-based test using
    this block's real API response) — see the memory file's 2026-09-09d session
    entry for full detail before picking this back up.
- [x] **Visual refresh + home→analytics migration + wallet-unlock UX** — the
  bigger, architectural piece. Brainstormed and spec'd as the **Analytics Rework
  (Track 2)**, `docs/superpowers/specs/2026-09-10-analytics-rework-design.md`,
  five sessions. The 2026-09-06 findings below are the background analysis that
  fed it, kept for reference.
  - [x] **Session 1 — Foundation.** `useDonorWalletCheck`, `PremiumUnlock`,
    `panelAccess.js` + `PanelGate`, route-level gate removed. PR #197.
  - [x] **Session 2 — IA migration.** The four panel moves off `/home`. PR #200.
  - [x] **Session 3 — Visual refresh, Apps + Network.** Per-tab accents, headline
    heroes, `PanelGate`'s `preview="blur"`. PR #201. Its final review caught a
    Critical unscoped-`hov-*`-selector collision — see the Changelog.
  - [ ] **Session 4 — Visual refresh, Donor + Chain Activity + Recharts.**
    **Spec written and committed:**
    `docs/superpowers/specs/2026-09-11-analytics-session4-design.md`
    (branch `docs/analytics-session4-design`). Issue #199's drill-down was
    bundled in, then unbundled 2026-09-11 — its full design lives on the issue.
    **This is next.** Worktree must be `analytics-session4-donor-chain`;
    `worktrees/analytics-session4` is a stale dir from the older numbering.
  - [ ] **Session 5 — Cross-tab QA + dark-mode fix + final whole-branch review.**

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

### Track 3 — Calculation correctness audit (next after Track 2)

**Status: approach agreed 2026-09-11, not yet spec'd.** Ordered deliberately
after Track 2's remaining visual sessions, and before production is brought
back up.

The ask: verify every displayed figure across `/analytics`, `/home` and `/live`,
plus the premium-donor gating, against real data. **80 formatted-value sites**
(32 home / 37 analytics / 11 live) over ~1,979 lines of shared calculation
modules.

**Method — independent recomputation, not more unit tests.** The app side runs
the app's own functions; the reference side is independently reimplemented; both
are fed the same captured upstream bytes, so there is no timing skew and the run
is reproducible. Adding unit tests cannot find this bug class: `donorStatus.test.js`
passes, `apidata.test.js` passes, and `fetch_total_donations` still carries the
exact bug PR #196 fixed in the file next door. Tests written from the same
understanding as the code inherit the code's assumptions. They earn their keep
*after* the harness finds a bug, as the regression guard on its fix.

**Five domains, following the real dependency graph** (not page-by-page —
`apidata.js` alone feeds Home, Nodes and Analytics):

1. **D1 Earnings & rewards** — `apidata.js` tier projections, APY, payout timing.
2. **D2 Node & app counts** — `fluxinfo.js`, `appSpecs.js`,
   `runningAppsCategorized.js`. Must assert the "never silently fall back to
   `globalappsspecifications` for running apps" rule.
3. **D3 Donations & donor status** — `fetch_total_donations`, `donorStatus.js`.
4. **D4 Rankings & achievements** — `rankInGroup.js`, `globalRankings`,
   `achievements.js`, `donorNodes.js`.
5. **D5 Live & chain** — `blockFlowSummary.js`, `live/apidata.js`,
   `chainActivity.js`.

**Five risk classes**, since the class determines the check: *sourcing* (right
math, wrong input), *arithmetic* (formula/units/rounding), *aggregation*
(grouping, double-count, off-by-one), *staleness* (cache outlives validity),
*presentation* (correct value, misleading label).

**Order: D3 → D4 → D1 → D2 → D5, then the donor-gating matrix.** D3 first
because it is small and already has a confirmed bug in it, which makes it the
honest end-to-end proof the harness catches real things rather than just running
green. D4 next because it has broken twice. D1 third because it is money.

**Already-confirmed bug, found 2026-09-11 while sizing this:**
`apidata.js:197`'s `fetch_total_donations` scans only
`window.gContent.ADDRESS_FLUX`, while `donorStatus.js:166` correctly iterates
`[ADDRESS_FLUX, OLD_ADDRESS_FLUX]`. The donation address changed 2026-09-03, so
the "total donations" figure on Home/MainApp silently under-reports everything
donated to the old address. This is the second copy of the bug PR #196 fixed.

**Deliverables:** a `docs/superpowers/audits/` inventory (one row per figure:
page · component · `file:line` · formula · upstream · domain · risk class ·
verification · status · finding), one runnable script per domain under
`tools/audit/`, and findings filed then fixed in severity order with a
regression test each.

**Sizing, stated plainly:** this is several sessions — more work than Track 2's
remaining visual sessions combined.

### Track 4 — Bring production back up (last)

`fluxnode.app.runonflux.io` currently returns HTTP 200 serving
`<title>FluxNode Dashboard - Temporarily Unavailable</title>` rather than the
app (confirmed 2026-09-11). Deliberate hold: production goes back up **once
Track 2 and Track 3 are done and the site's numbers are accurate**, per the
user's explicit direction 2026-09-11.

### Not being worked on now — whitepaper v9 reward-schedule changes

Filed 2026-09-11 as #202-#207 from the updated Flux whitepaper
(<https://whitepaper.app.runonflux.io/>), and **deliberately not scheduled** —
the user's direction is site polish and correctness first.

One of them is time-boxed and should not be forgotten: **#202** —
`CC_BLOCK_REWARD = 14` is a bare scalar, and the first PoN subsidy reduction
lands at **block 3,071,200 (~2026-10-25)**, taking it to 12.6 FLUX. After that
height every earnings and APY figure on the site reads ~11% high, silently. At
filing the tip was ~2,939,041, roughly 46 days out.

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
- **Issue #187 fix (fluxinfo Image field removed)** — PR #188 (2026-09-09,
  merged). FluxOS v8.18 dropped the docker `Image` field from
  `stats.runonflux.io/fluxinfo`; running-app categorization now joins each
  container's name against `globalappsspecifications` instead. New module
  `client/src/runningAppsCategorized.js`.
- **Live Redesign Session D (Resilience + final polish)** — PR #190
  (2026-09-09, merged). Closes the entire 4-session Live Redesign (Sessions
  A-D, PR #184/#185/#186/#190) — `LIVE_REDESIGN_PLAN.md`'s scope is fully
  shipped.
- **Accuracy/reliability pass — Top Hosted Apps categories, #153, #189** —
  PR #191 (2026-09-09, merged). Top Hosted Apps now
  distinguishes Enterprise
  apps from genuinely-unresolved ones (footnote on `/home` and
  `/analytics`'s Apps tab); closes **#153** (sessionStorage quota — full
  `globalPerfRankings`/`tierRankings`/`countryRankings` redesign onto an
  on-demand `nodeData` + `rankInGroup`/`topInGroup` model, live-measured
  86.3%→46.7% of the ~5,120KB quota on the same real wallet) and **#189**
  (unguarded `fetch_global_stats` fetchers that could zero the whole Home
  page on one rate-limited endpoint). Full characterization test coverage
  added for `achievements.js` (previously zero). See
  `docs/superpowers/specs/2026-09-09-accuracy-and-reliability-fixes-design.md`
  and `docs/superpowers/plans/2026-09-09-accuracy-and-reliability-fixes.md`.

## Known, filed elsewhere or unfiled (not scheduled)

- `stats.runonflux.io/fluxinfo` intermittently returns HTTP 200 with `status:
  "error"` — resilience layer (retry → last-known-good → stale marker) already
  handles it; still genuinely flaky upstream, nothing to build.
- Older backlog items from 2026-08-26, re-checked 2026-09-09: split
  `apidata.js` (#147), Rust `/header` endpoint (#145), Titan Info (#47), iOS
  column width (#141) — still not picked up; sessionStorage-quota (#153) and
  the unguarded-fetch issue (#189) are now closed, see Changelog above.
- Home-vs-VPS/datacenter detection (ipinfo.io-based) — deferred, unscheduled, not
  blocking anything (see the git history of the now-retired
  `PREMIUM_FEATURES_PLAN.md` for the full research if this gets picked up later).
- FLUX-sent-to-exchanges tracking — no reliable public data source exists (checked
  CoinCarp, both Fluxtracker repos). Not buildable until real deposit addresses
  surface somewhere.
