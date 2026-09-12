# FluxNode Website

[Frontend website](https://fluxnode.app.runonflux.io)

## Project Overview

FluxNode is a React-based frontend website that displays node information to provide a collective view of node statuses. The website displays:
- Flux price
- Total nodes and per-tier nodes (Cumulus, Nimbus, Stratus)
- Wallet amount (Flux and USD)
- Estimated earnings
- Node Overview
- Parallel Assets

## Tech Stack

### Frontend (client/)
- **Framework**: React 18.2.0 with react-scripts 5.0.1
- **UI Library**: Blueprint.js 4.x, React Bootstrap 2.x
- **Styling**: SASS
- **Routing**: React Router DOM 6
- **Data Grid**: AG Grid Community 31.3.4
- **State Management**: LocalForage with rxjs observables
- **Analytics**: React GA4
- **Icons**: React Icons
- **Currency formatting**: Millify, CountUp

### Backend (api/)
- **Language**: Rust 2021 edition
- **Framework**: Axum 0.7 (web framework)
- **Async**: Tokio runtime
- **Serialization**: Serde with JSON
- **API Features**: CORS, retry logic, streaming support

### Infrastructure
- **Deployment**: Docker with BuildKit
- **Web Server**: Nginx 1.29 (was 1.23.3, which is bullseye-based and ships only libssl.so.1.1 -- see the note in the Dockerfile)
- **Process Management**: dumb-init with container-entrypoint.sh

## Project Structure

```
Fluxnode/
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # Reusable React components
│   │   ├── content/     # Static content (API helpers, constants)
│   │   ├── contexts/    # React Context providers
│   │   ├── main/        # /nodes views
│   │   ├── home/        # /home views
│   │   ├── analytics/   # /analytics tabs (Apps, Network, Donor, Chain Activity)
│   │   ├── live/        # /live chain view
│   │   ├── donor/       # Donation checks, premium gating
│   │   ├── rewards/     # Block-reward schedule and countdown
│   │   ├── wallet/      # Address input and wallet state
│   │   ├── geo/         # Map bounds and projections
│   │   ├── demo/        # Demo mode
│   │   ├── notfound/    # 404 page
│   │   ├── styles/      # Global styles
│   │   ├── persistance/ # State persistence (LocalForage)
│   │   ├── assets/      # Static assets
│   │   └── Application.jsx # Main app entry
│   └── package.json
├── api/                 # Rust API server
│   └── src/
│       ├── main.rs      # API router and endpoints
│       ├── core.rs      # Core business logic
│       └── services/    # Service modules
├── conf/                # Configuration files
│   └── deploy-nginx.conf
├── service/             # Container services
│   ├── dumb-init/
│   └── container-entrypoint.sh
├── tools/audit/          # Calculation-correctness harness (see below)
├── docs/                 # Design specs and plans
├── Dockerfile            # Multi-stage Docker build
└── README.md
```

## Development Setup

### Prerequisites

- Node.js and Yarn (npm also works but yarn is recommended)
- Docker with BuildKit enabled
- A Rust toolchain is **optional**. The Docker build compiles the API itself
  (`FROM rust:1.98.1 as build`), which is how the API gets built here -- there is
  no local Rust toolchain on this machine. You only need cargo/rustc to run the
  API outside Docker, per "Using the API Server" below.

Verify installations:
```bash
node --version
yarn --version
docker version
```

### Running the FULL app (Docker) — required for anything API-backed

`yarn start` serves the **client only**. Every `/api/v1/*` route is absent, so
Chain Activity and the footer's host info cannot work there. To exercise the
whole thing, build the image — it compiles the Rust API itself, so no local Rust
toolchain is needed (and there isn't one on this machine):

```bash
docker build -t fluxnode:qa .
docker run -d --name fluxnode-qa -p 9000:80 -v fluxnode-qa-data:/app/data -e TESTING=true fluxnode:qa
```

- **`-v` is not optional.** `VOLUME` alone creates an anonymous volume that
  `--rm` discards, taking the chain-activity scanner's progress with it — a cold
  start rescans ~23,040 blocks and takes many minutes.
- **The app uses HashRouter**: URLs need the `#`, e.g. `localhost:9000/#/analytics`.
- **`TESTING=true` unlocks donor/premium features** without a real donation. It
  also **masks the donor gate entirely**, so set it `false` when testing anything
  about unlocking.
- Rust-only change? `docker build --target build -t api:check .` compiles just
  the API stage — seconds, versus minutes for a full image.

### Starting the Frontend

```bash
cd client
yarn install
yarn start
```

Access at [http://localhost:3000](http://localhost:3000). In dev mode, the client does not use the API wrapper and instead directly uses the official APIs.

### Using the API Server

Build and run the Rust API server (port 5049 by default):
```bash
cd api
cargo build
cargo run
```

To enable the API server in dev mode, create/update `client/.env.development.local`:
```sh
REACT_APP_FLUXNODE_INFO_API_MODE="proxy"
REACT_APP_FLUXNODE_INFO_API_URL="http://localhost:5049"
REACT_APP_ENABLE_FLUX_NODE_API=false
REACT_APP_SEARCH_BY_ZELID=false
```

To revert to using official APIs, set `REACT_APP_FLUXNODE_INFO_API_MODE` back to `debug`.

### Starting the Server

In dev mode, the API is optional. For production, both frontend and backend should be deployed.

## Building for Production

### Build Frontend
```bash
cd client
yarn build
```

### Build Docker Image
```bash
docker build -t <USERNAME>/<REPOSITORY>:<TAG> .
```

### Docker Run
```bash
docker run --rm --name="flux-node-web" -it -p 9000:80 <USERNAME>/<REPOSITORY>:<TAG>
```

## Code Style

### Formatting
Use Prettier for code formatting:
```bash
yarn format
```

### Verifying a change

Beyond `yarn test`, two guards exist and both fail loudly by design:

- **`tools/audit/`** — the calculation-correctness harness. The app side runs the
  app's own code, the reference is independently reimplemented, and both are fed
  the same captured bytes. Run it after touching anything that feeds a displayed
  number:
  ```bash
  python tools/audit/capture.py
  cd client && CI=true npx react-scripts test --watchAll=false d1AppSide && cd ..
  python tools/audit/reference/d1_earnings.py
  python tools/audit/compare.py     # exit 0 = agree, 1 = disagree
  ```
- **`client/src/api/apidataParity.test.js`** — fails on any new `apidata` export
  or any new field in `create_global_store()`. When the addition is deliberate,
  add the key to `api/__fixtures__/apidataBaseline.json` **by hand**. Never
  regenerate the fixture: that silently re-baselines everything else too.

A green test suite is not a green build, and vice versa — both have happened
here. Run `yarn build` as well before assuming a change is sound.

### ESLint
The project extends standard React ESLint rules with some relaxed settings (see `client/package.json`):
- `eqeqeq`: off
- `no-unused-vars`: off
- `no-useless-escape`: off
- Various other rules disabled

## Routes

Registered in `client/src/Application.jsx`.

- `/` → Redirects to `/home`
- `/home` - Network overview, reward-reduction countdown, donations, wallet lookup
- `/nodes` - Main node overview and details
- `/analytics` - Apps / Network / Donor / Chain Activity tabs (donor-gated per panel)
- `/live` - Live chain activity (donor-gated route)
- `/demo` - Demo mode, runs on a fixed wallet
- `/*` - 404 page

There is **no `/guide` route**. The Guides page was removed in c02f781, so
`#/guide` falls through to the 404 view -- quietly, since a hash route cannot
404 at the server.

## API Endpoints

The Rust API server provides:
- `POST /api/v1/nodes` - Aggregate node information
- `GET /api/v1/node-single/:node_address` - Single node details
- `GET /api/v1/demo` - Demo data
- `GET /api/v1/bench-version` - Benchmark version info
- `POST /api/v1/live/current-winners` - Live page block winners
- `GET /api/v1/chain-activity` - Utility/empty block rollup and sync status
- `GET /api/v1/chain-activity/blocks` - Retained utility blocks, for the drill-down
- `GET /api/v1/header` - Host platform, cores, memory, uptime and location (footer)

Routes are registered in `api_v1::make_router()` in `api/src/main.rs`; handlers
are inline `pub mod` blocks in the same file, and the work behind them lives in
`api/src/services/`.

## Dependencies

### Frontend Key Dependencies
- `@blueprintjs/core` - UI component library
- `react-bootstrap` - Bootstrap components
- `ag-grid-react` - Data grid table
- `localforage` - Browser storage
- `react-router-dom` - Client-side routing
- `react-helmet` - Head management
- `dayjs` - Date manipulation

### Backend Key Dependencies
- `axum` - Web framework
- `tokio` - Async runtime
- `serde_json` - JSON serialization
- `reqwest` - HTTP client

## Deployment Notes

- Docker uses BuildKit for caching and parallelization
- Multi-stage build: Rust compilation stage → Nginx static file serving stage
- Non-root user (myuser) for security in container
- Nginx serves both static files and API proxy
- CORS enabled for all origins via mirror_request()

## Tier Configuration

Nodes are organized into three tiers:
- **Cumulus** - Base tier
- **Nimbus** - Intermediate tier
- **Stratus** - High tier

Collateral and rewards differ per tier (see `client/src/content/` for constants).