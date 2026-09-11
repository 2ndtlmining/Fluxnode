# Dependency vulnerability triage

Covers issues #177 (package-lock.json), #178 (yarn.lock) and #179 (Cargo.lock).

The three issues were opened by an automated scanner and report raw advisory
counts. A raw count is close to meaningless here, because the overwhelming
majority of them are in the **build toolchain** — `react-scripts` and the
webpack/babel/svgr/workbox tree beneath it. That code runs on a developer's
machine at build time and is never served to a visitor. Treating those with the
same urgency as something in the shipped bundle would mean a large, risky
upgrade for no change in the site's actual attack surface.

So this splits every finding by one question: **does it reach something an
attacker can touch?** For the frontend that means the browser bundle; for the
API it means a process listening on the internet.

## Method

Not taken on trust from the advisories:

- **Frontend.** Walked the installed `npm ls --all` tree for every high/critical
  advisory and kept only those with a dependency path that does *not* pass
  through `react-scripts` or the dev-only packages (`sass`, `prettier`,
  `preval.macro`, the `@testing-library/*` set). Then confirmed against the
  built output — `grep` for each package across `build/static/js/*.js` — because
  a dependency path proves reachability, not inclusion.
- **API.** `cargo audit` against the RustSec advisory database, rather than the
  single CVE the issue mentioned.

## Results

| | Before | After |
|---|---|---|
| npm total | 84 | 32 |
| npm critical | 6 | **0** |
| npm high | 38 | 13 |
| npm high/critical **reaching the browser** | 2 | **1** |
| Cargo vulnerabilities | 16 | **1** |

### API (#179) — 16 to 1

The issue named one CVE, in `crossbeam-utils`. `cargo audit` found **16**, the
bulk of them in `openssl` (7 advisories) and `h2` (4, all denial-of-service).
Those matter more than the reported one: this is the process exposed to the
internet.

Two root causes, both structural rather than per-crate:

1. **`tokio-timer` was declared in `Cargo.toml` and never used** — zero
   references anywhere in `api/src/`. It is a tokio 0.1-era crate sitting beside
   tokio 1.x, and it alone dragged in `tokio-executor` and the vulnerable
   `crossbeam-utils 0.7.2`. Deleting the dependency removes the CVE outright.
   Note the fix suggested on #179 — bumping `crossbeam-utils` to 0.8 — would not
   have worked: `tokio-timer 0.2` requires the 0.7 line.

2. **The Docker build pinned `rust:1.67.1`**, an early-2023 toolchain. Current
   versions of several dependencies in this tree need edition 2024, which
   requires 1.85 or newer, so the pin silently blocked every security update
   behind it. `cargo update` on 1.67.1 fails outright. Bumped to `rust:1.98.1`.

**Remaining: 1.** `h2 0.3.27` (RUSTSEC-2026-0258, unbounded empty DATA frames).
The fix is h2 >= 0.4.16, which requires hyper 1.x, which requires axum 0.7+.
That is a web-framework migration, not a dependency bump, and it is tracked
separately. It is partially mitigated in deployment: the API sits behind nginx,
which terminates client connections.

### The toolchain bump was not self-contained

Worth knowing before touching these pins again. Raising the Rust version pulled
two further changes with it, neither obvious from the diff:

1. **The base images have to agree on the OpenSSL ABI.** `rust:1.98.1` is Debian
   bookworm and links `libssl.so.3`; the runtime stage was `nginx:1.23.3`, which
   is bullseye and ships only `libssl.so.1.1`. The image built cleanly and nginx
   started normally — then the API died at load:

   ```
   /app/main: error while loading shared libraries: libssl.so.3:
   cannot open shared object file: No such file or directory
   ```

   A build that succeeds proves nothing here; this only appears when the
   container runs. nginx is now 1.29 (Debian 13), which provides
   `libssl.so.3`. The direction matters: the binary is built against OpenSSL
   3.0 and runs against 3.5, and OpenSSL is forward-compatible within a major
   version. Building on a *newer* base than the runtime would break.

2. **`adduser` is gone from the Debian 13 base.** The build then failed with
   `adduser: not found`. Replaced with `useradd`, the lower-level tool from
   `passwd`, which exists on both the old and new bases.

### Frontend (#177 / #178) — one that matters

`npm audit fix --package-lock-only` cleared every critical and most of the
high findings without a single `package.json` change — all within semver.

**Both lockfiles were updated.** This matters: the Docker image builds with
`yarn install --frozen-lockfile`, so `package-lock.json` alone would have fixed
nothing in production. `yarn.lock` is what ships.

**Remaining high/critical that reaches the browser: `ag-grid-community`.**

- Prototype pollution via `_.mergeDeep` (GHSA-876p-c77m-x2hc), vulnerable
  below 31.3.4. Installed: 29.3.5.
- Not fixed here, deliberately. `npm` reports the fix as 36.1.0 — seven major
  versions — and ag-grid renders the main node table, the single most complex
  view in the app, with no render tests to catch a regression.
- Practical exposure is low: the pollution vector is grid options and column
  definitions, which are static and defined in our own source. No user input
  reaches them.
- Tracked separately so it gets the migration and QA pass it needs rather than
  being rushed in behind a security label.

The other 12 remaining high findings are build-toolchain only: `react-scripts`,
`@svgr/*`, `workbox-*`, `postcss`, `svgo`, `nth-check`, `serialize-javascript`,
`ws`. Clearing them means replacing or ejecting `react-scripts`, which is a
much larger piece of work with no effect on what a visitor loads.

## Re-running this

```sh
# API
docker run --rm -v "$PWD/api:/src" -w /src rust:latest \
  sh -c 'cargo install cargo-audit --locked -q && cargo audit'

# Frontend — counts
cd client && npm audit

# Frontend — what actually ships: check the built bundle, not the advisory list
cd client && npx react-scripts build
grep -l "<package>" build/static/js/*.js
```
