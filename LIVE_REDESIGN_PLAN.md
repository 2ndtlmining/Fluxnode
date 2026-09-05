# Live Page Redesign Plan — Premium Block Flow (V2)

> Status: **SCOPED, NOT BUILT.** Spec: `FLUX_LIVE_VIEW_REDESIGN_SPEC_V2.md` (80 sections,
> source of truth — this doc organizes it into shippable sessions and tracks status, it
> does not restate it). Written 2026-09-06.
>
> This is a **separate, independent track from `PREMIUM_FEATURES_PLAN.md`** (the
> donor-gating/Analytics work) — it redesigns the presentation layer of the already-
> shipped, already donor-gated `/live` page. It does not depend on Analytics Sessions
> 1-4 (done) or block Session 5+ (Chain Activity), and the two tracks are being worked
> interleaved by the user's own choice, not sequentially.

## Goal

Turn `/live` from "four cards around a block with decorative lines" into a **Flux
Network Control Room**: `BLOCK → ACTIVITY → INSPECTION`. The current tip (or a selected
historical block) is the visual hero; four activity domains (Node Rewards, Cloud
Deployments, P2P Transfers, Node Confirmations) connect to it as interactive nodes;
clicking one expands it outward for richer detail without leaving the canvas; the
existing `DetailsPanel` stays the deep-inspection layer underneath. Premium, technical,
calm — not gaming/cyberpunk, not a NetBird clone (design reference only, not a template).

## Architecture decisions locked in

- **Dev Fund gets real extraction — confirmed with the user 2026-09-06.** It's a fixed
  ~0.5 FLUX/block to a static address, `t3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA` — matched
  by **exact address**, not the percentage-tolerance heuristic
  `live/apidata.js:extractRewardsFromCoinbase` uses for Cumulus/Nimbus/Stratus (whose
  configured percentages only sum to 96.422%, `app-content.js`, which is what left Dev
  Fund unaccounted for today). Add a 4th recognized reward category there; small,
  additive change — read the current function in full before touching it, same care
  every shared-infrastructure task in this codebase gets.
- **No new npm dependency.** Spec is explicit: React + CSS + SVG + `ResizeObserver`
  only. No React Flow, even though the NetBird reference uses it — a fixed 4-node
  topology doesn't justify a graph library (spec §67).
- **Preserve the existing data foundation entirely.** 15s block polling, 5min slow
  refresh, event extraction (`live/apidata.js`), the block phase state machine
  (`live/blockAnimation.js`), `ChainRail`'s existing keyboard accessibility, and
  `DetailsPanel`'s four renderers (verified all still match the spec's own description
  when grounding this plan against the actual code, 2026-09-06). This is a
  **presentation-layer redesign**, not a data-layer rewrite — every session below should
  be reusing `live/apidata.js`, not extending it, except the one Dev Fund addition.
- **Scope boundary: `/live` only.** Home, Nodes, Analytics, Demo, nav, auth, routing,
  global theme tokens untouched — spec §4/§75 makes this a hard gate, verify with
  `git diff` before every PR.

## Build order (4 sessions, confirmed with the user 2026-09-06)

Each session follows the same process the Analytics Sessions used: brainstorm → design
confirm → `docs/superpowers/plans/*.md` → `subagent-driven-development` (fresh
implementer per task, task review, final whole-branch review) → PR. Sessions are
sequential — each genuinely builds on the last (interaction needs the shell to exist,
motion needs interaction's state model, etc.) — spec's own phase numbering already
reflects this dependency order, so no reordering was needed when grouping phases into
sessions.

- [ ] **Session A — Visual shell + data summaries** (spec Phases 1-2, §§6-24, 33-34, 66)
- [ ] **Session B — Interaction + motion** (spec Phases 3-4, §§12-14, 19, 22, 24-25, 50-52)
- [ ] **Session C — History + details integration** (spec Phases 5-6, §§26-32, 37-39, 63-65)
- [ ] **Session D — Resilience + final polish** (spec Phases 7-8, §§40-49, 53-54, 76-80)

---

## Session A — Visual shell + data summaries

**Deliverables:**
- `FlowCanvas`, `FlowBlock`, `ActivityCard` (static, not yet clickable), `FlowConnectors`
  (fixed positions, not yet dynamic-hover/expand-aware) — new components under
  `client/src/live/` (spec §5, §66).
- `ChainRail` restyled as the compact secondary history rail (spec §31) — selection/
  keyboard behavior unchanged, visual treatment demoted.
- `DetailsPanel` restyled to match the new visual language, data/rendering logic
  untouched (spec's own instruction, §37-39).
- New pure function `buildBlockFlowSummary(block)` (spec §33, exact shape given) +
  tests (spec §70: reward count/total/tier totals/Dev Fund, P2P count/total, deployment
  count/instances, confirmation count/tier breakdown, empty block).
- Connector geometry: one SVG overlay, cubic Bézier paths (not straight lines), endpoint
  positions measured via `ResizeObserver` + refs on the block/four cards, not hardcoded
  per-resolution coordinates (spec §20-23).
- Responsive layout rules for all four breakpoints (spec §48) — static geometry only in
  this session, no interaction to adapt yet.

**Explicitly out of scope this session** (later sessions): click-to-expand, hover
relationship highlighting, new-block choreography, live/history switching, connector
pulse states beyond idle. Cards render real data via `buildBlockFlowSummary`, but are
inert.

## Session B — Interaction + motion

**Deliverables:**
- `expandedCategory` state (spec §12, §68), one-at-a-time card expansion, outward
  quadrant-specific expansion (spec §13) with transform-origin modifiers, 280-420ms
  transform/opacity/border/shadow transitions (spec §14).
- Per-category expanded content (spec §15-18): rewards (all 4 tiers incl. Dev Fund),
  deployments, P2P, confirmations — each with the specific compact-vs-expanded shapes
  the spec lays out.
- Hover relationship highlighting (spec §19): card lift, connector brighten, matching
  central-block halo.
- Connector state system: idle/hover/expanded/new-block-pulse (spec §22).
- New-block choreography (spec §24): ~900-1100ms sequence, central block → connectors →
  cards → settle, only for categories with actual activity — and the critical
  **no-animation-on-ordinary-polling** rule (spec §25, §73): same-height poll never
  triggers this, `blockAnimation.js`'s existing phase state machine stays the source of
  truth for "is this a genuine new block."
- Accessibility (spec §51-52): cards are real interactive elements (Tab/Enter/Space/
  Escape, visible focus), SVG connectors are decorative/non-focusable,
  `prefers-reduced-motion` disables the elaborate motion but keeps state changes
  understandable via simple opacity.

**Tests** (spec §71, §73): expansion state transitions, Escape/click-outside/block-
change collapse rules, genuine-height-change vs same-height-poll animation gating,
empty-category no-animation, reduced-motion mode.

## Session C — History + details integration

**Deliverables:**
- Live/Syncing/Delayed/Historical status treatment (spec §26-27) — explicit non-claim of
  websocket-precision realtime, block-cadence copy without false "next block in Ns"
  prediction.
- Historical mode (spec §28-30): selecting a block updates everything (central block,
  four summaries, `DetailsPanel`, status → HISTORY, `expandedCategory` resets per spec
  §57); **new block while historical is a hard requirement** (spec §29) — must not
  disrupt the user's in-progress inspection, shows a small "Return to Live" notification
  instead; Return to Live (spec §30) restores the tip without replaying the new-block
  animation unless a genuinely new block landed at that exact moment.
- History rail refinements (spec §31-32, §63): chronological compact navigator, hover
  detail, optional `Load older`/`Browse history` (deliberately deferred unless trivial —
  spec explicitly says don't expand live-polling workload for this).
- `DetailsPanel` integration (spec §38): `View full details →` expands the matching
  section, scrolls into view, briefly highlights (`.live-detail-section--focused`,
  ~1.5s), matching `focusedDetailCategory` state (spec §68).

**Tests** (spec §72): live-follows-tip, historical selection, new block still arrives
while historical, historical block stays central, Return to Live, new block only
becomes central after explicitly returning to live.

## Session D — Resilience + final polish

**Deliverables:**
- Loading/empty/partial-failure states (spec §40-42): loading visually distinct from
  empty, one failed data source doesn't blank the whole block, intentional (not just
  blank) empty-state copy per category.
- Typography/spacing/depth/background system (spec §44-47): existing font, defined size
  hierarchy, 4/8px spacing scale, existing `--surface-*`/`--shadow-*` tokens only (no
  global token changes), very subtle network grid/dot background — no starfield/texture/
  animated background.
- Color system pass (spec §43): existing palette only, colour as accent (icons,
  connectors, active borders) not full-card fills.
- Final responsive/geometry/timing polish pass across all four breakpoints (spec §48-50).
- Full manual QA matrix (spec §74-75) — see below.

**Tests** (spec §71-73 revisited for regressions introduced by polish, if any) + the
full existing `/live` test suite (`apidata.test.js`, `blockAnimation.test.js`) staying
green throughout — this session touches the most files, highest regression risk of the
four.

---

## Testing checklist (carried across all sessions, spec §70-73)

- `buildBlockFlowSummary()` — reward/P2P/deployment/confirmation shapes, empty block.
- Expansion state machine — one-at-a-time, collapse triggers (Escape, click-outside,
  same-card toggle, other-card switch, block change), `View details` focus routing.
- Live/history — tip-follow, historical entry/exit, new-block-while-historical,
  Return to Live re-arming the new-block animation correctly.
- Animation gating — genuine height change vs. same-height poll, empty-category
  no-animation, reduced-motion.

## Manual QA matrix (spec §74) — spot-checked per session, run in full before Session D ships

7 viewports (1920×1080 → 390×844) × ~14 data/interaction states (rewards-only,
deployments-only, P2P-only, confirmations-only, all-four-active, all-four-empty,
many-confirmations, long names/addresses, missing country/benchmark, delayed
deployment data, partial API failure, no blocks, plus hover/expand/collapse/Escape/
keyboard/history/Return-to-Live/new-block-while-historical). Not practical to re-run
exhaustively after every task within a session — spot-check the states each session's
own changes could plausibly affect, then run the full matrix once as part of Session D's
final regression pass (spec §75: `git diff` must contain only intended Live-related
changes; `/live`, `/home`, `/nodes`, `/analytics`, nav, theme all confirmed unaffected).

## What NOT to build (spec §76, restated so it doesn't get scope-crept into any session)

No full transaction table, no map, no 3D graph, no giant node network, no trading
terminal, no cyberpunk HUD, no WebGL, no permanently-animated background, no NetBird
clone, no extra KPI widgets just because there's empty space. Deep-linking
(`/live?block=N`, spec §65) is optional/later — only add it if it falls out trivially
from Session C's work, never as a deliberate scope addition.
