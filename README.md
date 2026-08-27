# Fluxnode Website

[Frontend website](https://fluxnode.app.runonflux.io)

## Application Overview

FluxNode is a React-based dashboard that gives Flux node operators a collective view of their node fleet. Enter a wallet address to instantly see the health, performance, earnings, and geographic spread of all your nodes in one place.

### Routes

| Route | Description |
|---|---|
| `/home` | Node health overview — enter a wallet address to load your fleet |
| `/nodes` | Full node overview table with filtering, sorting, and per-node detail |
| `/guide` | Useful guides, YouTube links, and copy-paste troubleshooting commands |
| `/demo` | Demo mode — loads a sample wallet so you can explore the UI without a real address |
| `/*` | 404 page |

### Main Features

- **Flux price** — live price display in the header
- **Node counts** — total nodes and per-tier breakdown (Cumulus, Nimbus, Stratus)
- **Wallet summary** — balance in Flux and USD, estimated monthly/yearly earnings
- **Node Overview table** — sortable AG Grid with IP, tier, rank, benchmark status, uptime, maintenance, Flux OS version, and hosted apps
- **Best Uptime / Highest Ranked / Most Hosted** — spotlight cards for your standout nodes
- **Parallel Assets** — overview of Flux parallel asset holdings
- **Achievements** — gamification panel tracking 30+ milestones for your fleet (see [Gamification & Achievements](#gamification--achievements))
- **Privacy Mode** — hides wallet address, IP addresses, and geographic data from the UI
- **Auto-Refresh** — optional automatic data reload on a timer
- **Demo mode** — explore the full UI using a pre-loaded sample wallet at `/demo`

## Development and Building

### Tools

Make sure to have the following stuff installed on your machine.

- Node & Yarn (_npm can be used too, but yarn is recommended_)
- Docker (_with BuildKit enabled_)
- A Rust toolchain (_cargo and rustc, v1.62 or higher_)

Verify the installation with these commands:

- Node/Yarn

  ```sh
  node --version
  yarn --version
  ```

- Docker

  ```sh
  docker version
  ```

  _If the output says "Cannot connect to the Docker daemon" (or similar) start the docker service using `sudo systemctl enable --now docker` and then try again._

- Cargo/Rust

  ```sh
  cargo --version
  rustc --version
  ```

  Make sure the version is 1.62 or higher.

### Starting the app

The `client/` folder contains all the code for frontend app made with React.

- Install the frontend client dependencies

  ```sh
  # This assumes your working directory is the repository's root
  cd client
  yarn install
  ```

  _Subsequent commands assume that you are still in the `client/` directory._

- Run the app:

  ```sh
  yarn start
  ```

- Visit [http://localhost:3000](http://localhost:3000) in your browser. The app does not use the API wrapper in dev mode, so you do not need to start the server. (See below)

### Starting the server

The `api/` folder contains a server (written in [Rust](https://www.rust-lang.org/)) that acts as a thin wrapper/proxy in front of the official flux node API.

- Build the server

  ```sh
  # This assumes your working directory is the repository's root
  cd api
  cargo build
  ```

  _Subsequent commands assume that you are still in the `api/` directory._

- Start the server

  ```sh
  cargo run
  ```

  This starts server on port 5049. The port can be changed using the `APP_API_PORT` environment variable. For example: `APP_API_PORT=7000 cargo run`

#### Using the server

In dev mode, the frontend client is configured to not use the API wrapper and instead directly use the official APIs.

To make it use the server in dev mode too, first start the server in another terminal using above steps. Then add the following lines in `<REPO_ROOT>/client/.env.development.local` (create the file if it doesn't exist).

```sh
REACT_APP_FLUXNODE_INFO_API_MODE="proxy"
REACT_APP_FLUXNODE_INFO_API_URL="http://localhost:5049"
REACT_APP_ENABLE_FLUX_NODE_API=false
REACT_APP_SEARCH_BY_ZELID=false
```

Replace value of `REACT_APP_FLUXNODE_INFO_API_URL` with the actual url of the API server.

Now you can start the frontend app as usual in a separate terminal. Also make sure the server keeps running.

To revert the change and use the official APIs in dev mode, set the value of `REACT_APP_FLUXNODE_INFO_API_MODE` back to `debug`.

## App Categories

Every app on the network is placed in exactly one category. Categorisation runs on the
**Docker image name (repotag)**, never on the user-chosen app name — app names are freeform
and collide badly (an app called `FoldingAtFluxCloud...` is Folding@Home, not a blockchain
node). The logic lives in `client/src/main/Gamification/appCategories.js`, and the labels,
colours and icons in `client/src/content/appCategoryMeta.js`.

Categories are matched by keyword substring, **first match wins**, in the order listed below.

| Category | What belongs here | Example images |
|---|---|---|
| **Computing** | Volunteer & distributed computing | `yurinnick/folding-at-home`, `beastob/foldingathome-arm64`, `runonflux/rosetta-server` |
| **Gaming** | Game servers and browser games | `itzg/minecraft-server`, `thijsvanloef/palworld-server-docker`, `lloesche/valheim-server`, `spritsail/fivem`, `littlestache/abioticfactorserver`, `rouhim/arma-reforger-server` |
| **Communication** | Chat, messaging & voice servers | `simplexchat/smp-server`, `teamspeaksystems/teamspeak6-server`, `vectorim/element-web`, `streamr/node` |
| **Web / CMS** | Websites, CMS & alternative frontends | `runonflux/wp-nginx`, `ghost:alpine`, `nextcloud`, `benbusby/whoogle-search`, `littlestache/cors-anywhere` |
| **Blockchain** | Chain nodes, explorers & DeFi | `kaspanet/rusty-kaspad`, `ruimarinho/bitcoin-core`, `runonflux/blockbook-docker`, `runonflux/fironode`, `alephium/explorer`, `ghcr.io/girderworks/edge` |
| **Database** | Database & queue servers | `mysql`, `postgres`, `runonflux/shared-db`, `runonflux/flux-pg-cluster`, `mvertes/alpine-mongo` |
| **DevOps / CI** | Build, automation & remote access tools | `n8nio/n8n`, `budibase/budibase`, `linuxserver/code-server`, `rustdesk/rustdesk-server`, `vaultwarden/server` |
| **Media** | Media servers & downloaders | `gabekangas/owncast`, `linuxserver/qbittorrent`, `jellyfin/jellyfin`, `wirewrex/yt-dl` |
| **AI / ML** | Model serving & ML tooling | `ollama/ollama`, `doccano/doccano`, `rasa/duckling`, `vllm/vllm-openai` |
| **VPN / Privacy** | VPN, proxy & bandwidth-sharing agents | `siomiz/softethervpn`, `presearch/node`, `ghcr.io/runonflux/cumulusvpn-gateway`, `iproyal/pawns-cli`, `sandmanshiri/shadowsocks` |
| **Monitoring** | Observability & network probes | `grafana/grafana`, `louislam/uptime-kuma`, `globalping/globalping-probe`, `travelping/nettools` |
| **Enterprise** | Apps whose specification is encrypted | *(no image visible — see below)* |
| **Other** | Image not recognised, or deliberately not classified | `busybox`, `alpine`, `runonflux/orbit` |

### Three rules that override keyword matching

**1. A dedicated website is Web, not the app it advertises.**
`runonflux/minecraft-server-website` is the landing page that sells Minecraft hosting — it is
not a Minecraft server. Any image containing `website` is categorised as **Web / CMS** before
keyword matching runs. Without this, Gaming was inflated by pages hosting no game at all.

> This matches the rest of the Flux tooling: [Fluxtracker](https://github.com/2ndtlmining/Fluxtracker)
> carries an explicit `CATEGORY_EXCLUDE` for `-server-website` (added after 47 phantom gaming
> instances were traced to it), and [fluxview](https://github.com/RunOnFlux/fluxview) renamed
> its Gaming page to "Dedicated Websites".

**2. Git-deployed apps stay in Other.**
Every app deployed from a git repository runs the same wrapper image, `runonflux/orbit`. The
wrapper says nothing about the workload inside it, so these are deliberately left
uncategorised rather than being reported as a DevOps tool. They appear in the Apps table with
a GitHub icon in the **Type** column.

**3. Enterprise apps get their own bucket.**
Enterprise apps ship an encrypted `compose` block, so no image name is ever visible. They are
categorised as **Enterprise** rather than Other — "we are not permitted to see this" is a
different fact from "we do not recognise this". Their CPU / RAM / SSD columns show `—` because
those figures are genuinely unknown.

**Bonus: when the image name tells you nothing, read its labels.**
`ghcr.io/girderworks/edge` and `/feather` gave no clue from the name and account for ~790
containers. Pulling the image settled it in seconds:

```bash
docker pull ghcr.io/girderworks/edge:1.0.13
docker inspect ghcr.io/girderworks/edge:1.0.13 --format '{{json .Config.Labels}}'
docker history --no-trunc ghcr.io/girderworks/edge:1.0.13 | grep LABEL
```

```
org.opencontainers.image.title=beldex-node
org.opencontainers.image.description=Beldex master node (beldexd + storage + belnet + telemetry API) for Flux
```

They bundle `beldexd` 7.0.2, `beldex-storage` 2.4.0 and `belnet` 0.9.8, and run in `MODE`
A/B/C with +0/+100/+200 port offsets so a single Flux node can host up to three master nodes.
That is why one operator shows ~790 containers. They are categorised as **Blockchain**.

### Where the numbers come from

The **App Ecosystem** panel on the home page counts **running containers**, reported by the
nodes themselves via `stats.runonflux.io/fluxinfo`. A multi-component app contributes one
count per component.

This is deliberately the only source. `api.runonflux.io/apps/globalappsspecifications` counts
what was *ordered* rather than what is running, so it always reads higher and must never be
used as a silent fallback — doing so made the whole panel change numbers and row order at
random ([#144](https://github.com/2ndtlmining/Fluxnode/issues/144)). When fluxinfo is
unreachable the app retries, then serves the last good reading marked with a **STALE** badge,
and only reports the panel as unavailable if there is nothing cached.

### Adding a keyword

Add it to the relevant array in `appCategories.js`, then run the tests:

```bash
cd client
yarn test
```

Keep keywords long enough to avoid substring collisions — `llm` used to match the "llm" inside
`fu`**`llm`**`ent-engine` and put a fulfilment service in AI / ML. `client/src/main/Gamification/appCategories.test.js`
pins both the intended matches and the collisions already fixed, so a careless keyword fails
the suite rather than quietly skewing the chart.

---

## Gamification & Achievements

The Achievements panel is accessible via the trophy icon (🏆) in the Nodes Overview header. It tracks milestones earned by your Flux node fleet and updates automatically whenever your wallet is loaded.

### Achievement Tiers

Each achievement is awarded at one of four tiers:

| Tier | Colour | What it means |
|---|---|---|
| Bronze | Copper | Entry-level milestone |
| Silver | Grey | Intermediate achievement |
| Gold | Yellow | High achievement |
| Platinum | White/Silver | Elite — top of the ladder |

### Achievement Categories

#### Nodes — Fleet size & structure
Tracks how many nodes you run and which tiers they cover.

| Achievement | How to earn |
|---|---|
| First Steps | Run your first node |
| Node Operator → Network Pillar | Progressive milestones: 1 / 5 / 10 / 25 / 50 / 100 nodes |
| Tri-Tier Operator | Own at least one node in each of Cumulus, Nimbus, and Stratus |
| Stratus Elite | Own at least one Stratus node |

#### Network — Wallet standing
| Achievement | How to earn |
|---|---|
| Top Wallet | Your wallet appears in the Flux rich list |
| Coffee Sponsor ☕ | Made at least one donation — bought the developer a coffee! |
| Pizza Patron 🍕 | Made 5 or more donations — kept the developer fed! |

#### Performance — Uptime, benchmarks & global rankings

**Uptime medals** — based on your single longest-running node:
- *Always On (30d)* — one node up for 30+ days
- *Iron Node (180d)* — one node up for 180+ days
- *Legendary Uptime* — one node up for 365+ days

**Certified Fleet** — every one of your online nodes has passed the benchmark check.

**Version currency** — tracks whether your online nodes are running the latest Flux OS and benchmark software:
- *Chronically Current* (Gold) — every online node is on the latest Flux OS **and** benchmark version
- *Professional Dawdler* (Bronze) — at least one online node is running an outdated Flux OS or benchmark version (these two are mutually exclusive)

**Global performance medals** — the site downloads live benchmark data for all ~8,000 Flux nodes every 10 minutes, ranks them within their tier, and finds where your best node lands. Medals are awarded for ranking #1, #2, or #3 globally within your tier for each of these metrics: EPS (events per second), DWS (disk write speed), Download speed, and Upload speed.

> **Example:** Your Stratus node scores the highest download speed of all 1,628 Stratus nodes worldwide → earns *Stratus Download Gold*.

Country-level medals work the same way but are scoped to the country **and tier** where your node is located — Cumulus nodes only compete against other Cumulus nodes in that country, Nimbus against Nimbus, and Stratus against Stratus. This keeps the playing field fair across tiers.

Achievement names follow the pattern *Country Tier Metric Medal* (e.g. *Germany Cumulus EPS Silver*, *Finland Stratus Download Gold*).

> **Example:** Your Cumulus node in Germany ranks #2 for EPS among all Cumulus nodes in Germany → earns *Germany Cumulus EPS Silver*.

**Slowest node achievements (ironic)** — awarded when your *worst* node falls into the bottom percentiles globally. These are earned within a tier, based on whichever single metric performs worst:

| Achievement | Threshold | Tier |
|---|---|---|
| Flux Toaster 🔥 | Worst node in bottom 25% for any metric | Bronze |
| Flux Tortoise 🐢 | Worst node in bottom 10% for any metric | Silver |
| Potato 🥔 | Worst node ranked dead last for any metric | Gold |

The percentile is calculated from all nodes with benchmark data in that tier (which may be slightly more than the enabled node count shown in the header — the benchmark dataset includes nodes in all states, not just currently-enabled ones). The node count shown in the achievement text matches the dashboard header for easy reference.

> **Example:** You have 122 Stratus nodes. Your weakest one is in the bottom 7.8% for Download among all 1,628 Stratus nodes — earning *Stratus Flux Tortoise* (Silver).

**Wooden Spoon** — per tier × metric, awarded when your *worst* node in that tier is ranked dead last for that specific benchmark metric (Gold, ironic). More granular than Potato — one per tier × metric combination (up to 12 total).

**Try Hard** — per tier × metric, awarded when your *best* node in that tier is ranked in the top 5% globally for that metric (Silver). Stacks with medal achievements. Only generated for tier pools large enough to make top 5% meaningful.

#### Apps — Hosted applications

**Single-node milestones** — based on the number of apps on your busiest single node:
- *App Champion* — one node running 10+ apps
- *Mega Host* — one node running 25+ apps

**Fleet-wide totals** — total apps running across all your nodes combined:
- *App Farmer* — 10+ total apps across your fleet (Bronze)
- *App Mogul* — 50+ total apps (Silver)
- *Hyperscaler* — 100+ total apps (Gold)

**Category-specific** — based on what type of apps you host:

| Achievement | What triggers it |
|---|---|
| Game Server Host | Host at least 1 gaming app (e.g. Minecraft, Valheim) |
| LAN Party | Host 3+ different gaming apps |
| Web Host | Host a web or CMS app (e.g. WordPress, Nextcloud) |
| Chain Validator | Host a blockchain node app (e.g. Bitcoin, Kaspa) |
| Diverse Host | Host apps in 4 or more different categories |

#### Geographic — Where your nodes are located

| Achievement | How to earn |
|---|---|
| Local Champion | 5+ nodes concentrated in one country |
| Global Operator | Nodes spread across 3+ countries |
| Continental | Nodes on 2+ continents |
| World Power | Nodes on 4+ continents |

**Dictator** — One per country where you have nodes. Earned when your wallet has more nodes in that country than any other single wallet on the network. Each country shows as a separate achievement (e.g., *Finland Dictator*, *Germany Dictator*). Locked versions show a progress bar indicating how close you are to overtaking the current leader.

> **Example:** You have 400 nodes in Finland. The next-largest wallet in Finland has 310. You earn *Finland Dictator* (Gold). In Germany you have 80 nodes and the leader has 120, so *Germany Dictator* remains locked at 67%.

The **Network Footprint** row at the top of the Achievements panel shows SVG flag chips for every country your nodes are located in. A `? N` chip means N nodes whose location hasn't been indexed by the Flux network geo database yet — these typically resolve within a few hours as new nodes are registered.

#### Ugly Duckling — Bare nodes (no apps)

These are awarded when you run nodes that have no applications installed at all:
- *Ugly Duckling* — 1 bare node (Bronze)
- *Flock of Ducklings* — 5 bare nodes (Silver)
- *Swan Lake* — 10 bare nodes (Gold)

### Achievement Progress Bars

Each locked achievement shows a small progress bar indicating how close you are to earning it. For example, if you have 7 nodes the *Node Baron* bar (requires 10) will show at 70%.

### Privacy Mode

When Privacy Mode is enabled (toggle in the top navigation), the Network Footprint section is hidden entirely so that no geographic information about your nodes is displayed.

---

## Deployment Steps (using Docker)

- First, [enable BuildKit](https://docs.docker.com/develop/develop-images/build_enhancements/#to-enable-buildkit-builds).

- Build the frontend

  ```sh
  # This assumes your working directory is the repository's root
  cd client
  yarn build
  ```

- Build the docker image

  ```sh
  # This assumes your working directory is the repository's root
  docker build -t <USERNAME>/<REPOSITORY>:<TAG> .
  ```

  Replace `<USERNAME>`, `<REPOSITORY>` and `<TAG>` with your own values.

- Push to Docker Hub after testing

  ```sh
  docker login
  docker push <USERNAME>/<REPOSITORY>:<TAG>
  ```

- Run the container locally (maps container port 80 → host port 9000):

  ```sh
  docker run --rm --name="flux-node-web" -it -p 9000:80 <USERNAME>/<REPOSITORY>:<TAG>
  ```

  The app is then available at [http://localhost:9000](http://localhost:9000)
