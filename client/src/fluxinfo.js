// Shared access layer for stats.runonflux.io/fluxinfo.
//
// Kept in its own module so it can be tested without pulling in the rest of
// apidata.js.

/*
 * This endpoint is the source of truth for what is actually RUNNING on the
 * network, but it is not always up. It used to be fetched twice per load (once
 * for app counts, once for the WordPress tally) and any failure silently left
 * the category map empty, which made the App Ecosystem panel fall back to
 * globalappsspecifications — a completely different dataset counting ORDERED
 * instances rather than running containers. That swap is what users saw as the
 * "Other" category jumping and settling (issue #144).
 *
 * Now: one shared request per refresh, retried with backoff, with the derived
 * aggregate persisted so a failure serves last-known-good marked as stale
 * instead of switching datasets. Only the aggregate is cached (~365 image
 * counts), never the ~465 KB raw payload, and categories are recomputed from it
 * on every read so keyword changes take effect immediately.
 */

const FLUXINFO_URL = 'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Image';
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v1';
const FLUXINFO_STALE_MAX_AGE = 6 * 60 * 60 * 1000; // serve last-known-good for up to 6 hours
const FLUXINFO_ATTEMPTS = 3;
const FLUXINFO_RETRY_BASE_MS = 400;

let _fluxinfoInFlight = null;

const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function _fluxinfo_fetch_once() {
  const res = await fetch(FLUXINFO_URL);
  if (!res.ok) throw new Error('fluxinfo HTTP ' + res.status);

  const json = await res.json();
  // The API signals failure in the body with a 200, so check it explicitly.
  if (json?.status === 'error') throw new Error('fluxinfo responded status=error');
  if (!Array.isArray(json?.data)) throw new Error('fluxinfo response had no data array');

  return json.data;
}

/*
 * Reduce the raw node list to the handful of figures the app needs.
 * Every field is defensive: a single node reporting without `apps.runningapps`
 * used to throw a TypeError here and wipe the whole category map.
 */
function _fluxinfo_aggregate(nodes) {
  const streamrImage = process.env.REACT_APP_STREAMR || 'streamr/broker-node:latest';
  const presearchImage = process.env.REACT_APP_PRE_SEARCH || 'presearch/node:latest';

  const imageCounts = {};
  let totalContainers = 0;
  let watchtowerContainers = 0;
  let wordpressContainers = 0;
  let streamrNodes = 0;
  let presearchNodes = 0;

  for (const item of nodes) {
    const running = Array.isArray(item?.apps?.runningapps) ? item.apps.runningapps : [];
    totalContainers += running.length;

    // streamr / presearch are counted per NODE, matching the original behaviour
    let hasStreamr = false;
    let hasPresearch = false;

    for (const app of running) {
      const image = typeof app?.Image === 'string' ? app.Image : '';
      if (!image) continue;

      imageCounts[image] = (imageCounts[image] || 0) + 1;

      const lower = image.toLowerCase();
      if (lower.includes('containrrr/watchtower')) watchtowerContainers++;
      if (lower === 'runonflux/wp-nginx' || lower.startsWith('runonflux/wp-nginx:')) wordpressContainers++;
      if (image.includes(streamrImage)) hasStreamr = true;
      if (image.includes(presearchImage)) hasPresearch = true;
    }

    if (hasStreamr) streamrNodes++;
    if (hasPresearch) presearchNodes++;
  }

  return {
    imageCounts,
    totalContainers,
    watchtowerContainers,
    wordpressContainers,
    streamrNodes,
    presearchNodes,
    nodesReporting: nodes.length
  };
}

function _fluxinfo_read_cache() {
  try {
    const raw = localStorage.getItem(FLUXINFO_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.aggregate?.imageCounts) return null;
    if (Date.now() - cached.timestamp > FLUXINFO_STALE_MAX_AGE) return null;
    return cached;
  } catch {
    return null;
  }
}

function _fluxinfo_write_cache(aggregate) {
  try {
    localStorage.setItem(FLUXINFO_CACHE_KEY, JSON.stringify({ aggregate, timestamp: Date.now() }));
  } catch {}
}

/**
 * Returns { aggregate, status, fetchedAt } where status is:
 *   'live'        — fetched successfully just now
 *   'stale'       — every attempt failed, serving last-known-good from cache
 *   'unavailable' — every attempt failed and there is no usable cache
 *
 * Callers within the same refresh share a single in-flight request.
 */
export async function fetch_fluxinfo_aggregate() {
  if (_fluxinfoInFlight) return _fluxinfoInFlight;

  _fluxinfoInFlight = (async () => {
    let lastError = null;

    for (let attempt = 0; attempt < FLUXINFO_ATTEMPTS; attempt++) {
      try {
        const nodes = await _fluxinfo_fetch_once();
        const aggregate = _fluxinfo_aggregate(nodes);
        _fluxinfo_write_cache(aggregate);
        return { aggregate, status: 'live', fetchedAt: Date.now() };
      } catch (error) {
        lastError = error;
        if (attempt < FLUXINFO_ATTEMPTS - 1) {
          await _delay(FLUXINFO_RETRY_BASE_MS * Math.pow(2, attempt));
        }
      }
    }

    console.warn('[fluxinfo] all attempts failed:', lastError?.message);

    const cached = _fluxinfo_read_cache();
    if (cached) return { aggregate: cached.aggregate, status: 'stale', fetchedAt: cached.timestamp };

    return { aggregate: null, status: 'unavailable', fetchedAt: null };
  })();

  try {
    return await _fluxinfoInFlight;
  } finally {
    _fluxinfoInFlight = null;
  }
}
