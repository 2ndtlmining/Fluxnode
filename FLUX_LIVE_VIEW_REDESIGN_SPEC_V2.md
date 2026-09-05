# FluxNode `/live` — Premium Live Block Flow Redesign V2

## 1. Executive direction

The previous concept was directionally correct, but this version is intentionally more prescriptive.

The final page must **not** feel like “four cards around a block with decorative lines”. It should feel like a **Flux Network Control Room**:

> **BLOCK → ACTIVITY → INSPECTION**

The selected Flux block is the visual hero. Four activity domains are connected to it as interactive nodes. New blocks produce a short, coordinated visual event. Clicking an activity node expands it outward and reveals richer information without leaving the network canvas. The existing detailed panel remains the deep-inspection layer.

This should feel premium, technical, calm, precise and alive — not cyberpunk, gaming-oriented or overloaded.

---

# 2. Design references

## Primary reference: NetBird Control Center

Study:

- https://docs.netbird.io/manage/control-center
- https://netbird.io/knowledge-hub/netbird-control-center
- https://github.com/netbirdio/dashboard

NetBird is a useful reference because it treats **relationships as the primary visual object** and allows nodes/relationships to be selected. Their dashboard repository documents React Flow as the Control Center technology.

Borrow:

- central/focused object
- relationship lines
- clickable nodes
- selection/focus
- information revealed through interaction
- restrained density

Do NOT copy:

- NetBird layout
- exact colours
- node appearance
- toolbar
- terminology
- card styling

FluxNode must have its own Flux-native identity.

## Additional references

Study modern observability/control interfaces for:

- calm live indicators
- historical/live states
- event timelines
- graceful loading/error states
- data-driven animation

React Flow examples can be consulted for interaction ideas, but **do not add React Flow automatically**. There are only four fixed nodes; custom React + CSS + SVG is safer and gives tighter control.

---

# 3. Current codebase — preserve the foundation

The current `/live` implementation already provides:

- 15-second recent-block polling;
- visible block window;
- normal transaction fetching;
- reward extraction;
- P2P extraction;
- daemon-based node-confirmation extraction;
- 5-minute rankings refresh;
- 5-minute application-spec refresh;
- event association by block;
- block selection;
- lock/pin behaviour;
- block enter/leave animation;
- four category DetailsPanel sections.

Relevant current structure:

```text
client/src/live/
├── Live.jsx
├── Live.scss
├── apidata.js
├── apidata.test.js
├── blockAnimation.js
├── blockAnimation.test.js
├── categoryMeta.js
├── tierMeta.js
├── ChainRail/
│   ├── index.jsx
│   └── index.scss
├── DetailsPanel/
│   ├── index.jsx
│   └── index.scss
└── FluxMark/
```

The current Live component owns polling, selection and event accumulation. The ChainRail already supports keyboard selection and activity chips. The DetailsPanel already renders the four event categories.

**Do not rewrite this data foundation.**

---

# 4. Scope boundary

Only modify the Live experience.

Do not change:

- Home
- Nodes
- Analytics
- Demo
- navigation
- authentication
- routing
- global theme tokens
- unrelated API wrappers
- unrelated components

All new CSS must remain scoped to Live.

---

# 5. Files to modify

## Required

### `client/src/live/Live.jsx`

Modify to:

- render the new flow canvas;
- manage `expandedCategory`;
- manage Live vs History presentation;
- provide block summary data;
- coordinate new-block animation state;
- provide Return to Live;
- retain existing polling;
- retain existing event fetching;
- retain existing error handling.

### `client/src/live/Live.scss`

Replace the current page composition styling with the new:

- hero canvas;
- flow layout;
- card states;
- connector states;
- history treatment;
- live/history status;
- responsive rules;
- motion.

### `client/src/live/ChainRail/index.jsx`

Convert the current large block rail into a compact historical timeline.

Keep:

- block selection;
- keyboard accessibility;
- activity indicators;
- existing block lifecycle state.

### `client/src/live/ChainRail/index.scss`

Restyle as the secondary history/navigation component.

### `client/src/live/DetailsPanel/index.jsx`

Keep the existing data/rendering logic. Add only what is required for:

- focused category;
- opening a requested category;
- scroll/focus from an expanded flow card.

### `client/src/live/DetailsPanel/index.scss`

Restyle to match the new visual language.

## Likely new components

Create only if useful:

```text
client/src/live/FlowCanvas/
  index.jsx
  index.scss

client/src/live/FlowBlock/
  index.jsx
  index.scss

client/src/live/ActivityCard/
  index.jsx
  index.scss

client/src/live/FlowConnectors/
  index.jsx
  index.scss
```

No new dependency should be required.

---

# 6. Final page composition

Desktop:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Live Network Activity                              ● LIVE                │
│ Network tip #2923514 · Updated 7s ago                                   │
│                                                                         │
│   ┌─────────────────┐                           ┌────────────────────┐   │
│   │ NODE REWARDS    │                           │ CLOUD DEPLOYMENTS  │   │
│   │ 4 outputs       │                           │ 0 detected         │   │
│   │ 14.50 FLUX      │                           │                    │   │
│   └────────╲────────┘                           └────────╱───────────┘   │
│             ╲                                           ╱                │
│              ╲                                         ╱                 │
│                 ┌──────────────────────────┐                             │
│                 │          FLUX            │                             │
│                 │       #2923514           │                             │
│                 │         8s ago           │                             │
│                 │     18 confirmations     │                             │
│                 └──────────────────────────┘                             │
│              ╱                                         ╲                 │
│             ╱                                           ╲                │
│   ┌────────╱────────┐                           ┌───────╲────────────┐   │
│   │ P2P TRANSFERS   │                           │ NODE CONFIRMATIONS │   │
│   │ 2 transfers     │                           │ 18 confirmations   │   │
│   │ 12.42 FLUX      │                           │ 12 C · 4 N · 2 S  │   │
│   └─────────────────┘                           └────────────────────┘   │
│                                                                         │
│ HISTORY   ● #2923514   #2923513   #2923512   #2923511   #2923510       │
└─────────────────────────────────────────────────────────────────────────┘
```

This diagram is structural only. The real UI must use much more refined spacing, depth, typography and animation.

---

# 7. Canvas requirements

The flow canvas is the hero region.

Desktop target:

- 560–680px high;
- enough space that cards do not feel cramped;
- no heavy surrounding border;
- subtle network dot/grid atmosphere;
- subtle radial light around the central block;
- no animated background.

The canvas must feel like a **network workspace**, not a card containing four cards.

---

# 8. Central block

The central block is the most important visual object.

Target desktop:

```text
220–260px wide
190–230px high
```

It should include:

- existing FluxMark;
- `#blockHeight`;
- relative age;
- Live/History state;
- category activity summary;
- optional abbreviated hash;
- exact timestamp on hover.

Suggested visual:

```text
┌──────────────────────────────┐
│                              │
│             FLUX             │
│                              │
│          #2923514            │
│           8s ago             │
│                              │
│       18 confirmations       │
│                              │
│  4 rewards · 0 · 0 transfers │
└──────────────────────────────┘
```

Do not overload it with addresses or transaction rows.

The block identifies the event; the outer nodes explain the event.

---

# 9. Central block visual treatment

Use three layers:

1. elevated dark surface;
2. subtle Flux-blue border;
3. very subtle radial glow behind the block.

Idle glow: almost imperceptible.

New-block glow: briefly stronger.

Expanded-category glow: small matching accent halo.

No permanent neon effect.

---

# 10. Four outer activity nodes

Exactly four:

1. Node Rewards
2. Cloud Deployments
3. P2P Transfers
4. Node Confirmations

Each has:

- icon;
- category label;
- count;
- one or two useful metrics;
- short status;
- clear expansion affordance.

Target:

```text
270–330px wide
145px minimum height
```

---

# 11. Card anatomy

Example:

```text
┌──────────────────────────────────────┐
│  ◉  NODE REWARDS                    4│
│     Rewards distributed               │
│                                      │
│     14.50 FLUX                       │
│                                      │
│ Cumulus 1.00   Nimbus 3.50    ›     │
└──────────────────────────────────────┘
```

The card should look like an interactive network node, not a generic dashboard button.

Use a small Chevron/Arrow affordance.

---

# 12. REQUIRED: clickable expansion

The four outer cards **must be clickable**.

This is a core part of the design.

State model:

```js
expandedCategory = null | 'reward' | 'deploy' | 'p2p' | 'confirm'
```

Only one card can be expanded at a time.

Clicking a card:

1. expands it;
2. strengthens its connector;
3. dims other cards slightly;
4. keeps all four cards visible;
5. keeps the central block visible;
6. reveals richer content;
7. provides a `View details →` action.

Clicking the same card again collapses it.

Clicking another card switches expansion.

Pressing Escape collapses.

Clicking empty canvas collapses.

Selecting another block collapses the expansion.

---

# 13. Expansion must be outward

The expansion should preserve the network metaphor.

Top-left Node Rewards expands:

- up;
- left.

Top-right Cloud Deployments:

- up;
- right.

Bottom-left P2P:

- down;
- left.

Bottom-right Confirmations:

- down;
- right.

The expanded card must not cover the central block.

Recommended expanded target:

```text
380–460px wide
300–380px high
```

Use quadrant-specific transform origins.

Example modifiers:

```text
.live-flow-card--top-left
.live-flow-card--top-right
.live-flow-card--bottom-left
.live-flow-card--bottom-right
.live-flow-card--expanded
```

---

# 14. Expansion animation

Target:

`280–420ms`

Use:

- transform;
- opacity;
- border-color;
- box-shadow.

Avoid heavy layout animation where possible.

When expanded:

- selected card border strengthens;
- icon brightens;
- connector becomes thicker/brighter;
- other cards reduce opacity to roughly 0.65–0.8;
- central block remains clear.

The transition must feel like the selected network node is opening, not like a modal appearing.

---

# 15. Expanded Node Rewards

Show:

```text
NODE REWARDS                         4

TOTAL
14.50 FLUX

CUMULUS                 1.00 FLUX
address…

NIMBUS                  3.50 FLUX
address…

STRATUS                 9.00 FLUX
address…

DEV FUND                1.00 FLUX
address…

View full details →
```

Use existing `tierMeta.js`.

Do not duplicate tier colours in new components.

---

# 16. Expanded Cloud Deployments

Show:

```text
CLOUD DEPLOYMENTS                    2

Recently detected

Nextcloud
2×
4 vCPU · 8 GB · 100 GB

Jellyfin
1×
2 vCPU · 4 GB · 50 GB

Deployment data may appear shortly
after block confirmation.

View full details →
```

Do not claim a deployment happened inside a block unless the source data proves it.

---

# 17. Expanded P2P

Show:

```text
P2P TRANSFERS                        2

12.4200 FLUX MOVED

t1abc…92  →  t1def…31
8.0000 FLUX

t1ghi…44  →  t1jkl…77
4.4200 FLUX

View full details →
```

For many transfers, show a small representative subset and a `View all` action.

---

# 18. Expanded Confirmations

Do not dump 18+ rows into the outer card.

Show:

```text
NODE CONFIRMATIONS                   18

CUMULUS       12
NIMBUS         4
STRATUS        2

NETWORK REACH
18 confirmations

View confirmations →
```

Optionally show 2–3 representative nodes.

Full details remain in DetailsPanel.

---

# 19. Hover relationship

Hovering an activity card should highlight its relationship to the block.

Example:

```text
CARD
  ╲
   ╲ brighter
    ● BLOCK
```

Required:

- card moves 1–2px;
- accent border brightens;
- icon brightens;
- matching connector brightens;
- central block gets a tiny matching halo.

Do not dim the whole page.

---

# 20. Connector architecture

Use **one SVG overlay**.

```jsx
<svg className="live-flow-connectors">
  <path className="live-flow-connector live-flow-connector--reward" />
  <path className="live-flow-connector live-flow-connector--deploy" />
  <path className="live-flow-connector live-flow-connector--p2p" />
  <path className="live-flow-connector live-flow-connector--confirm" />
</svg>
```

Requirements:

- one SVG layer;
- behind cards;
- above background;
- `pointer-events: none`;
- CSS variables for category accents;
- dynamically positioned endpoints.

---

# 21. Connector geometry

Never use straight lines.

Use cubic Bézier paths.

The curves must:

- feel organic;
- avoid text;
- terminate behind card/block edges;
- not cross another card;
- remain visually balanced.

Do not make all four curves mathematically identical.

Slight asymmetry should make the topology feel more natural.

---

# 22. Connector states

### Idle

Thin and muted.

### Hover

Slightly brighter and thicker.

### Expanded

Strongest selected relationship.

### New block

One short travelling pulse.

Do not continuously animate idle connectors.

---

# 23. Connector endpoint calculation

Do not hardcode one-resolution coordinates.

Use refs for:

- central block;
- four cards.

Measure their geometry using:

- `ResizeObserver`;
- layout reads only when layout changes.

Calculate anchor points and generate the SVG paths.

Do not run measurement on every animation frame.

---

# 24. New block choreography

When a genuinely new height is detected:

```text
T+0ms
new block detected

T+0–200ms
central block activates

T+150–500ms
active connectors illuminate

T+300–850ms
active activity cards highlight/update

T+850–1100ms
scene settles
```

Total target:

`~900–1100ms`

Only categories containing actual activity should animate.

---

# 25. Important: no animation on ordinary polling

If the same block is fetched again:

- no new-block animation;
- no connector pulse;
- no card pulse.

The existing `blockAnimation.js` / tip-height state-machine concept should remain the source of truth.

---

# 26. Live status

Do not simply say `LIVE`.

Use:

```text
● LIVE
Network tip #2923514 · Updated 7s ago
```

Possible states:

### Live

```text
● LIVE
Updated 7s ago
```

### Syncing

```text
◌ SYNCING
Checking network…
```

### Delayed

```text
○ DELAYED
Last update 46s ago
Retrying automatically
```

### Historical

```text
HISTORY
Viewing #2923511 · 2m ago

[ Return to Live ]
```

Do not claim realtime websocket precision when the page is polling.

---

# 27. Block cadence

The network's approximate block cadence can be communicated:

```text
Blocks are produced approximately every 30 seconds.
```

Do not display:

```text
Next block in 17s
```

unless reliable prediction data exists.

---

# 28. Historical mode

The existing `selectedHeight` concept should remain.

When the user selects a historical block:

- central block changes;
- four summaries change;
- DetailsPanel changes;
- status becomes HISTORY;
- expanded category resets;
- polling continues.

---

# 29. New block while historical

This is REQUIRED.

If the user is viewing #2923511 and #2923515 arrives:

- keep #2923511 central;
- do not replay the full central animation;
- add #2923515 to the history rail;
- show a small notification.

Example:

```text
● NEW BLOCK #2923515

[ Return to Live ]
```

The user should never lose their historical inspection.

---

# 30. Return to Live

When clicked:

1. clear `selectedHeight`;
2. display current tip;
3. set status to LIVE;
4. update the flow;
5. remove historical styling.

Do not replay a new-block animation unless a genuinely new block was detected at that moment.

---

# 31. History rail

The current ChainRail should become a compact chronological navigator.

Example:

```text
LATEST

● #2923514    #2923513    #2923512    #2923511    #2923510
   8s ago        38s          1m          2m          2m
```

It should be visually secondary.

The current tip gets a Live marker.

Historical blocks do not.

---

# 32. Older blocks

Recommended:

- live window: 6–10 blocks;
- optional `Load older` / `Browse history`;
- fetch 10–20 additional blocks on demand;
- cache fetched block details;
- do not download large history automatically.

If deeper history becomes a product requirement, implement it as a deliberate extension rather than expanding the live polling workload.

---

# 33. Summary transformation

Add a pure function:

```js
buildBlockFlowSummary(block)
```

Suggested output:

```js
{
  height,
  hash,
  at,

  rewards: {
    count,
    totalFlux,
    tiers
  },

  deployments: {
    count,
    instances,
    apps
  },

  p2p: {
    count,
    totalFlux
  },

  confirmations: {
    count,
    byTier
  }
}
```

Do not change the event model.

Do not create duplicate API requests just for summaries.

---

# 34. Category metadata

Continue using `categoryMeta.js` for:

- labels;
- icons;
- colours;
- empty-state labels.

Continue using `tierMeta.js` for:

- Cumulus;
- Nimbus;
- Stratus;
- colours;
- labels.

---

# 35. Existing data sources

Keep the current architecture.

### Recent blocks

Existing recent-block endpoint.

### Regular transactions

Existing block transaction endpoint.

Used for:

- rewards;
- P2P.

### Node confirmations

Existing daemon `getblock` path.

### Cloud deployments

Existing global app-specification refresh.

Do not merge these into one fake transaction model.

---

# 36. Deployment timing

Deployment data has different timing from block data.

The UI must visually distinguish:

> block-confirmed transaction data

from:

> network deployment data observed after the deployment API refreshes.

Recommended copy:

```text
Deployment data is observed from the
network and may appear shortly after
block confirmation.
```

Do not use wording such as:

```text
Deployed in this block
```

unless actually provable.

---

# 37. DetailsPanel role

Keep DetailsPanel.

Its job becomes:

> **full evidence / deep inspection**

The flow canvas answers:

> What happened?

The DetailsPanel answers:

> Exactly what happened?

---

# 38. DetailsPanel integration

Clicking:

```text
View full details →
```

should:

1. expand the matching DetailsPanel section;
2. scroll it into view if necessary;
3. briefly highlight its header;
4. remove highlight after ~1.5s.

Use:

```text
.live-detail-section--focused
```

for the temporary state.

---

# 39. DetailsPanel data

Preserve existing renderers for:

- rewards;
- P2P;
- deployments;
- confirmations.

Preserve:

- reward amounts;
- payment addresses;
- country flags;
- app information;
- app resources;
- owners;
- P2P addresses;
- confirmation IPs;
- benchmark metrics.

Do not rewrite data logic unnecessarily.

---

# 40. Empty states

Empty states should look intentional.

Example:

```text
CLOUD DEPLOYMENTS

No deployments detected

Waiting for network activity
```

P2P:

```text
No wallet-to-wallet transfers
detected in this block.
```

Do not use huge blank spaces.

Do not animate zero-activity cards.

---

# 41. Loading states

Loading must be visually distinct from empty.

Example:

```text
CLOUD DEPLOYMENTS

Loading network data…
```

Do not show an empty card while waiting.

---

# 42. Partial API failure

One failed source must not blank the whole block.

Example:

```text
NODE REWARDS             4
P2P TRANSFERS             0
NODE CONFIRMATIONS       18

CLOUD DEPLOYMENTS

Deployment data temporarily unavailable
Retrying automatically
```

---

# 43. Colour system

Use the existing FluxNode palette.

Recommended:

| Category | Treatment |
|---|---|
| Rewards | Flux blue / existing tier colours |
| Deployments | existing green |
| P2P | neutral/slate |
| Confirmations | existing amber |
| Live | existing green |
| History | neutral/blue |

Colours should mainly appear in:

- icons;
- small accents;
- connectors;
- active borders;
- counts;
- brief activity pulses.

Never fill entire cards with saturated colour.

---

# 44. Typography

Use the existing application font.

Recommended hierarchy:

```text
Page title       18–20px
Block number     20–26px
Card title       12–14px
Primary metric   18–22px
Secondary        11–13px
Micro label       9–11px
```

Do not enlarge everything.

Premium UI comes from hierarchy, not giant text.

---

# 45. Spacing

Use an intentional 4/8px-based scale:

```text
4
8
12
16
20
24
32
40
48
```

Avoid arbitrary spacing.

---

# 46. Depth

Use existing:

```text
--surface-primary
--surface-inset
--border-primary
--shadow-sm
--shadow-md
```

Do not modify global tokens.

Premium depth should come from:

- subtle borders;
- surface separation;
- restrained shadows;
- controlled glow.

---

# 47. Background

Retain the current dark FluxNode environment.

Add only a very subtle network grid/dot pattern.

No:

- animated starfield;
- moving background;
- heavy texture.

---

# 48. Responsive layout

## >= 1400px

Full radial/relationship layout.

## 1200–1399px

Compressed radial layout.

## 900–1199px

Four-card 2×2 arrangement:

```text
REWARDS          DEPLOYMENTS

       BLOCK

P2P              CONFIRMATIONS
```

## < 900px

Stack:

```text
BLOCK

REWARDS
DEPLOYMENTS
P2P
CONFIRMATIONS

HISTORY
```

Connectors may be simplified/removed on mobile.

Do not force radial geometry onto narrow screens.

---

# 49. Stable layout

The canvas must have a stable minimum height.

Expansion should not make the entire page jump.

The canvas absorbs the expansion.

DetailsPanel remains below.

---

# 50. Interaction performance

Target:

- input → response under ~100ms;
- expansion animation ~320ms;
- new-block choreography ~900ms.

The user must not wait for an API request to expand a card.

Expansion is UI-only.

---

# 51. Accessibility

Activity cards must be real interactive elements.

Support:

- Tab;
- Enter;
- Space;
- Escape.

Visible focus state is required.

SVG connectors are decorative and must not be keyboard targets.

Respect `prefers-reduced-motion`.

---

# 52. Reduced motion

Disable:

- travelling particles;
- large scaling;
- pulsing glow;
- elaborate connector motion.

Keep:

- simple opacity;
- immediate/very short transitions;
- clear state changes.

The interface must remain understandable without motion.

---

# 53. Avoid constant animation

When nothing is happening:

> the page should mostly be still.

When a block arrives:

> the page briefly comes alive.

When the user interacts:

> the page responds.

This distinction is essential to making it feel professional rather than gimmicky.

---

# 54. Recommended animation philosophy

Use animation to communicate:

```text
NEW BLOCK
    ↓
ACTIVITY DETECTED
    ↓
RELATIONSHIP HIGHLIGHTED
    ↓
STATE SETTLES
```

Never animate simply because the page is open.

---

# 55. Card content should be data-driven

Do not hardcode example counts.

For every card:

```text
count
summary
items
empty/loading/error state
```

must come from actual block/event data.

---

# 56. Block switching

When changing blocks:

1. update block identity;
2. calculate summary;
3. show available summary immediately;
4. load missing detail data;
5. update card contents;
6. update DetailsPanel;
7. do not blank the entire canvas.

---

# 57. Avoid stale expanded content

When selecting another block:

```js
setExpandedCategory(null)
```

Then load/render the new block.

This prevents a category expansion from visually persisting against another block's data.

---

# 58. Central summary semantics

Do not use ambiguous:

```text
18 transactions
```

if 18 represents node confirmations rather than ordinary transactions.

Prefer category-specific labels:

```text
18 confirmations
4 reward outputs
2 transfers
```

This avoids misleading the user.

---

# 59. Node reward card

Compact:

```text
NODE REWARDS                 4

14.50 FLUX

Cumulus · Nimbus · Stratus
```

Expanded contains full reward rows.

---

# 60. Confirmation card

Compact:

```text
NODE CONFIRMATIONS          18

12 Cumulus
4 Nimbus
2 Stratus
```

Expanded contains tier summary and a few representative nodes.

Full list remains below.

---

# 61. P2P card

Compact:

```text
P2P TRANSFERS                2

12.4200 FLUX moved
```

Expanded shows From → To rows.

---

# 62. Deployment card

Compact:

```text
CLOUD DEPLOYMENTS            2

Nextcloud · Jellyfin
```

Expanded shows:

- app;
- instances;
- CPU;
- RAM;
- SSD;
- category;
- owner where available.

---

# 63. History hover

History item hover should show:

- exact block height;
- timestamp;
- category counts.

Do not show giant tooltips.

---

# 64. Central block hover

Show:

```text
Block #2923514

Hash: xxxxx…
Timestamp: 5 Sep 2026 · 17:03:42
Rewards: 4
P2P: 0
Deployments: 0
Confirmations: 18
```

---

# 65. Deep-linking

Optional / later:

```text
/live?block=2923511
```

This should not be required for V1.

Do not expand scope unless it is trivial and compatible with existing routing.

---

# 66. New component responsibilities

## `FlowCanvas`

Owns layout composition only.

## `FlowBlock`

Owns central block presentation.

## `ActivityCard`

Owns category summary and expansion presentation.

## `FlowConnectors`

Owns SVG paths and visual connector states.

## `ChainRail`

Owns chronological block navigation.

## `DetailsPanel`

Owns exhaustive event details.

Keep responsibilities separated.

---

# 67. Do not add React Flow unless necessary

A fixed four-node topology does not justify a graph library by default.

Use:

```text
React
CSS
SVG
ResizeObserver
```

If implementation later becomes significantly more complex, React Flow can be reconsidered.

Do not introduce it merely because NetBird uses it.

---

# 68. Suggested Live state

```js
const [selectedHeight, setSelectedHeight] = useState(null)
const [expandedCategory, setExpandedCategory] = useState(null)
const [focusedDetailCategory, setFocusedDetailCategory] = useState(null)
const [isNewBlock, setIsNewBlock] = useState(false)
```

Keep the existing state architecture where possible rather than renaming everything.

---

# 69. Summary state should remain derived

Do not store redundant summary state if it can be derived from:

```js
displayedBlock.events
```

Prefer:

```js
const summary = useMemo(
  () => buildBlockFlowSummary(displayedBlock),
  [displayedBlock]
)
```

or an equivalent pure transformation.

---

# 70. Testing — summary

Add tests for:

```text
buildBlockFlowSummary()
```

Verify:

- reward count;
- reward total;
- tier totals;
- Dev Fund;
- P2P count;
- P2P total;
- deployment count;
- deployment instances;
- confirmation count;
- confirmation tier breakdown;
- empty block.

---

# 71. Testing — expansion

Verify:

- no expansion initially;
- clicking Rewards expands Rewards;
- clicking Rewards again collapses;
- clicking Deployments switches expansion;
- Escape collapses;
- selecting another block collapses;
- View details focuses the correct DetailsPanel section.

---

# 72. Testing — live/history

Verify:

- latest block follows live;
- clicking old block enters history;
- new block still arrives;
- historical block remains central;
- Return to Live works;
- new block becomes central only after returning to live.

---

# 73. Testing — animation

Verify:

- genuine height change triggers animation;
- same-height poll does not;
- empty categories do not animate;
- historical mode does not get forced into new-block animation;
- reduced-motion mode removes elaborate animation.

---

# 74. Manual visual QA

Test:

```text
1920×1080
1440×900
1280×800
1024×768
900×800
768×1024
390×844
```

Data states:

- rewards only;
- deployments only;
- P2P only;
- confirmations only;
- all four active;
- all four empty;
- many confirmations;
- long app names;
- long addresses;
- missing country;
- missing benchmark;
- delayed deployment data;
- partial API failure;
- no blocks.

Interaction:

- hover;
- expand;
- collapse;
- Escape;
- keyboard;
- history;
- Return to Live;
- new block while historical.

---

# 75. Regression safety

Before merge:

```text
git diff
```

must contain only intended Live-related changes.

Run the repository's normal tests and production build.

Verify:

- `/live`;
- `/home`;
- `/nodes`;
- `/analytics`;
- navigation;
- theme.

No unrelated route should change.

---

# 76. What NOT to add

Do not turn the Live page into:

- a full blockchain transaction table;
- a map;
- a 3D graph;
- a giant node network;
- a trading terminal;
- a cyberpunk HUD;
- a WebGL scene;
- a permanently animated background;
- a NetBird clone.

Do not add extra KPI widgets just because there is empty space.

---

# 77. Implementation phases

## Phase 1 — Visual shell

- new header;
- flow canvas;
- central block;
- four cards;
- SVG connectors;
- history rail.

## Phase 2 — Data summaries

- `buildBlockFlowSummary`;
- category totals;
- category counts;
- tier summaries.

## Phase 3 — Interaction

- hover relationships;
- clickable cards;
- outward expansion;
- View details;
- Escape/click-outside.

## Phase 4 — Motion

- new block choreography;
- connector pulse;
- activity highlight;
- settle.

## Phase 5 — History

- LIVE/HISTORY state;
- Return to Live;
- historical selection;
- new block while historical;
- optional older blocks.

## Phase 6 — Details integration

- focus section;
- scroll;
- temporary highlight;
- visual polish.

## Phase 7 — resilience

- loading;
- empty;
- delayed;
- partial failure.

## Phase 8 — final polish

- typography;
- spacing;
- borders;
- shadows;
- glow;
- responsive geometry;
- animation timing.

---

# 78. Final design acceptance test

A user should understand within five seconds:

1. this is the Flux network;
2. this is the current block;
3. four activity types surround it;
4. the lines represent relationships;
5. active activity is visually apparent;
6. each category can be explored;
7. older blocks can be inspected.

If this is not obvious, the design is not finished.

---

# 79. Final visual quality bar

The page should feel:

### Idle

Calm, premium and precise.

### New block

Briefly alive and informative.

### Hover

Responsive and connected.

### Expanded

Rich and interactive without becoming cluttered.

### Historical

Stable and analytical.

### Error

Informative, not alarming.

The goal is not maximum animation.

The goal is **maximum perceived quality per interaction**.

---

# 80. Final product principle

The final Live experience should communicate:

> **“This is what the Flux network is doing right now.”**

The central block is the event.

The four outer nodes explain the activity.

The connectors explain the relationship.

The animation explains what changed.

The history rail explains time.

The DetailsPanel provides the evidence.

That is the complete UX model.
