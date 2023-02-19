# syntax=docker/dockerfile:1.2

# name of the rust crate
ARG RUST_APP_PACKAGE_NAME=fluxnode_api_mask

FROM rust:1.67.1 as build
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

FROM nginx:1.23.3
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

# create a new non-root user
RUN adduser --disabled-password myuser

RUN mkdir -p /app
WORKDIR /app

# Copy over API build files from the previous stage
COPY --from=build /app-build/target/release/${RUST_APP_PACKAGE_NAME} ./main

# Change ownership of the application files to the new user
RUN chown -R myuser:myuser /app

# switch to the new user
USER myuser

# --------------------

## Static frontend files

ARG FRONTED_SRC=./client
# Copy build files. Also, as mentioned as above, don't add a trailing slash
COPY ${FRONTED_SRC}/build /usr/share/nginx/html

# --------------------

## Container entrypoint and services

COPY service/dumb-init/init ./init

USER root
RUN chmod +x ./init

COPY service/container-entrypoint.sh ./container-entrypoint.sh

CMD ["/app/init", "/bin/sh", "/app/container-entrypoint.sh"]
