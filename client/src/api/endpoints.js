/*
 * Endpoint paths shared by more than one API module.
 *
 * Exists so a path used from two places is defined once. Duplicating a URL
 * across modules is exactly the drift issue #147 is about -- it is how the
 * same endpoint ended up fetched twice inside one Promise.all.
 *
 * Explorer paths are PATHS, not full URLs: src/explorer.js owns host selection
 * and fails over between explorer hosts on a rate limit (#218).
 */

export const EXPLORER_FLUX_NODES_PATH = '/status?q=getFluxNodes';
