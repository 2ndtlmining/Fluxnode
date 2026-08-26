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

// `ip` is included so per-node app counts can be attributed to a node — the
// Workhorse showcase ranks nodes by how many apps they host. Costs ~158 KB on
// a call the page already makes, rather than a second request.
const FLUXINFO_URL = 'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Image,ip,tier';
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v2'; // v2: adds topNodesByApps
const FLUXINFO_STALE_KEYS = ['fluxinfoAggregate_v1'];
const FLUXINFO_STALE_MAX_AGE = 6 * 60 * 60 * 1000; // serve last-known-good for up to 6 hours
// Enough to fill the showcase with a couple spare, in case one drops offline.
const TOP_NODES_KEPT = 5;

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
  // Per-node app lists, kept only for the busiest handful. Retaining all ~6,500
  // would bloat the cached aggregate for no benefit — the showcase needs three.
  const perNode = [];
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

    const ip = typeof item?.ip === 'string' ? item.ip : '';
    if (ip && running.length > 0) {
      perNode.push({
        ip,
        // Tier comes from here rather than the benchmark projection: this call
        // is ~726 KB and reliable, that one is 3.45 MB and has been observed
        // returning status=error for minutes at a time.
        tier: typeof item?.tier === 'string' ? item.tier : null,
        appCount: running.length,
        images: running.map((a) => (typeof a?.Image === 'string' ? a.Image : '')).filter(Boolean)
      });
    }
  }

  // Descending by app count, ties broken on ip so the order is stable between
  // refreshes rather than reshuffling on equal counts.
  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  return {
    imageCounts,
    totalContainers,
    watchtowerContainers,
    wordpressContainers,
    streamrNodes,
    presearchNodes,
    topNodesByApps,
    nodesReporting: nodes.length
  };
}

function _fluxinfo_prune_stale() {
  for (const key of FLUXINFO_STALE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

function _fluxinfo_read_cache() {
  _fluxinfo_prune_stale();
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

/**
 * Shape per-category image tallies into the top 3 plus a remainder, for the
 * category tooltips.
 *
 * Input is { category: { imageName: count } } with tags already stripped, so
 * feather:1.0.13 and feather:1.0.14 arrive as one entry. Genuinely different
 * images stay separate — minecraft-server and minecraft-bedrock-server are two
 * apps, not two versions of one.
 *
 * Ties break alphabetically. Media currently has three apps on 3 containers
 * each, so sorting by count alone reshuffles them between refreshes.
 */
export function buildCategoryTop(categoryImages) {
  return Object.fromEntries(
    Object.entries(categoryImages || {}).map(([cat, images]) => {
      const ranked = Object.entries(images || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const top = ranked.slice(0, 3);
      return [
        cat,
        {
          top: top.map(([image, count]) => ({ image, count })),
          otherCount: ranked.length - top.length,
          otherTotal: ranked.slice(3).reduce((sum, [, c]) => sum + c, 0)
        }
      ];
    })
  );
}
