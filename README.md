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
