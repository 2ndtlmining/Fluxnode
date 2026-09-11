/*
 * Endpoint paths and request options shared by more than one API module.
 *
 * Exists so a path used from two places is defined once. Duplicating a URL
 * across modules is exactly the drift issue #147 is about -- it is how the
 * same endpoint ended up fetched twice inside one Promise.all.
 *
 * Explorer paths are PATHS, not full URLs: src/explorer.js owns host selection
 * and fails over between explorer hosts on a rate limit (#218).
 */

export const EXPLORER_FLUX_NODES_PATH = '/status?q=getFluxNodes';

/*
 * Fetch options for the plain public JSON APIs (api.runonflux.io,
 * stats.runonflux.io).
 *
 * Lives here rather than in either caller because it is genuinely shared:
 * api/walletNodes.js uses it for the three per-node endpoints and apidata.js
 * uses it for GPU prices. It was previously declared beside the node code, so
 * splitting that out broke the GPU-price fetch at build time -- which is the
 * duplication-and-drift problem issue #147 exists to fix, in miniature.
 *
 * `credentials: 'omit'` is deliberate: these are unauthenticated endpoints, and
 * sending cookies to them would be pointless at best. Callers spread it
 * (`{ ...REQUEST_OPTIONS_API }`) rather than passing it directly, so nothing can
 * mutate the shared object.
 */
export const REQUEST_OPTIONS_API = {
  credentials: 'omit',
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5'
  },
  method: 'GET',
  mode: 'cors'
};
