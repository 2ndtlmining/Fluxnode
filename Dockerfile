# syntax=docker/dockerfile:1.2

# name of the rust crate
ARG RUST_APP_PACKAGE_NAME=fluxnode_api_mask

# ==========================================================
# ================== FRONTEND BUILD STAGE ==================
# ==========================================================

# Issue #219: the image used to COPY a client/build produced on the host, so
# `docker build` on a clean checkout silently shipped either a stale bundle or
# no bundle at all, depending on what happened to be lying around. Building it
# here makes the image reproducible from source alone.
#
# Node 20 (LTS). react-scripts 5.0.1 builds on it, and pinning the major keeps
# a new Node release from changing the bundle underneath us.
FROM node:20-bookworm-slim as frontend-build

WORKDIR /client

# Manifests first so the dependency layer is cached independently of source
# edits -- without this split, every source change reinstalls the whole tree.
COPY client/package.json client/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY client/ ./

# NOT `CI=true`: react-scripts promotes warnings to errors under CI, and the
# repo carries two long-standing lint warnings (a missing alt prop, an
# exhaustive-deps hint). Failing the image build on those would be a change to
# the lint policy smuggled in through the Dockerfile.
RUN yarn build

# Rust 1.98 (pinned). Bumped from 1.67.1, which is an early-2023 toolchain that
# could no longer build current dependency versions -- several security updates
# in the tree now require edition 2024, which needs 1.85+. Staying on 1.67
# meant staying on vulnerable openssl and h2 (issue #179).
FROM rust:1.98.1 as build
USER root

# renew the argument after FROM directive
ARG RUST_APP_PACKAGE_NAME

ARG API_SRC=./api

# set cargo cache directory (currently not used in this config)
# ENV CARGO_HOME=/root/.cargo

# create an empty project and build dependencies only
RUN cargo new --bin --name ${RUST_APP_PACKAGE_NAME} /app-build
WORKDIR /app-build

# copy over your manifests
COPY ${API_SRC}/Cargo.lock ./Cargo.lock
COPY ${API_SRC}/Cargo.toml ./Cargo.toml

# empty build
RUN --mount=type=cache,id=deps-build,sharing=private,mode=0755,target=${CARGO_HOME} \
    cargo -vv build -vv --release

# copy sources
RUN rm -rf src

# Make sure that the paths do not have a trailing slash. Otherwise it will copy the contents of directories rather than
# the directories themselves.
COPY ${API_SRC}/src src

# remove object files generated for the dummy sources
RUN rm -f target/release/${RUST_APP_PACKAGE_NAME} target/release/deps/${RUST_APP_PACKAGE_NAME}*

# build for release
RUN cargo build --release

# ==========================================================
# ==========================================================
# ======================= NEXT STAGE =======================
# ==========================================================
# ==========================================================

# nginx 1.29 (Debian 13 / trixie). Bumped from 1.23.3, a December 2022 release.
#
# This is NOT optional alongside the Rust bump: the API binary is built on
# rust:1.98.1 (Debian bookworm) and dynamically links libssl.so.3, while
# nginx:1.23.3 is bullseye-based and ships only libssl.so.1.1 -- the container
# started nginx fine and then died with
#   /app/main: error while loading shared libraries: libssl.so.3
# The two stages have to agree on the OpenSSL ABI. It also picks up three years
# of nginx security fixes.
FROM nginx:1.29
USER root

# --------------------

## nginx configuraion

RUN rm /etc/nginx/conf.d/*.conf
COPY conf/deploy-nginx.conf /etc/nginx/conf.d/app.conf

# --------------------

## API build

# reset STOPSIGNAL changed by nginx
STOPSIGNAL SIGTERM

ARG RUST_APP_PACKAGE_NAME

# create a new non-root user.
#
# useradd, not adduser: the Debian 13 nginx base dropped the `adduser`
# wrapper, and the build failed with "adduser: not found". useradd is the
# lower-level tool from `passwd` and is present on both the old and new bases,
# so this stays portable if the base moves again.
RUN useradd --create-home --shell /usr/sbin/nologin myuser

RUN mkdir -p /app
WORKDIR /app

# Copy over API build files from the previous stage
COPY --from=build /app-build/target/release/${RUST_APP_PACKAGE_NAME} ./main

# Chain-activity state lives here (issue #231).
#
# services::chain_activity::DATA_DIR is the relative path "data" and the API
# runs with WORKDIR /app, so this is where the scanner's checkpoint, daily
# rollup, team txs and utility blocks land. Without a declared volume the whole
# set is lost on every container restart, which meant re-fetching 8 days of
# history from an explorer that rate-limits us -- and made the #231 drill-down
# bug intermittent, since a fresh container backfills and a long-lived one
# never does.
#
# Declared AFTER the directory is created and chowned so the image carries an
# empty data dir with the right ownership for the volume to inherit.
RUN mkdir -p /app/data

# Change ownership of the application files to the new user
RUN chown -R myuser:myuser /app

VOLUME /app/data

# switch to the new user
USER myuser

# --------------------

## Static frontend files

# Built by the frontend-build stage above rather than copied from the host
# (issue #219).
COPY --from=frontend-build /client/build /usr/share/nginx/html

# --------------------

## Container entrypoint and services

COPY service/dumb-init/init ./init

USER root
RUN chmod +x ./init

COPY service/container-entrypoint.sh ./container-entrypoint.sh

CMD ["/app/init", "/bin/sh", "/app/container-entrypoint.sh"]
