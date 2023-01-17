# Flux-node Website
[Frontend website](https://fluxnode.app.runonflux.io)

## Application Overview

The website allows users to display their node information to get a more collective view of the status of their various nodes.
The website consist out of two pages

- Index : Node health overview linked to a wallet.
- Guides : Provide links to useful guides and Youtube videos. Command troubleshooting commands are also available. 

### Main Features

Below are some of the key features to the website:

- Flux price
- Total nodes
- Total nodes per tier (Cumulus, Nimbus and Stratus)
- Wallet amount (Flux and USD)
- Estimated earnings
- Node Overview
- Parallel Assets


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
```
Replace value of `REACT_APP_FLUXNODE_INFO_API_URL` with the actual url of the API server.

Now you can start the frontend app as usual in a separate terminal. Also make sure the server keeps running.

To revert the change and use the official APIs in dev mode, set the value of `REACT_APP_FLUXNODE_INFO_API_MODE` back to `debug`.

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
  
 - Update to Docker repo after testing
  
  `docker login`
   
  `docker tag <REPOSITORY> <USERNAME>/<REPOSITORY>:<TAG>`
   
  `docker push <USERNAME>/<REPOSITORY>`
  
------

While running the container, map exposed port 80 of the container to your desired port on host machine. For example.

```sh
docker run --rm --name="flux-node-web" -it -p 9000:80 <USERNAME>/<REPOSITORY>:<TAG>
```
The app would then be available on [http://localhost:9000](http://localhost:9000)
