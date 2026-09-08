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
const FLUXINFO_URL =
  'https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Names,ip,tier';
const FLUXINFO_CACHE_KEY = 'fluxinfoAggregate_v5'; // v5: Image field removed from the API (#187) — imageCounts replaced by nameCounts, per-node `images` renamed `containerAppNames`
const FLUXINFO_STALE_KEYS = ['fluxinfoAggregate_v1', 'fluxinfoAggregate_v2', 'fluxinfoAggregate_v3', 'fluxinfoAggregate_v4'];
const FLUXINFO_STALE_MAX_AGE = 6 * 60 * 60 * 1000; // serve last-known-good for up to 6 hours
// Enough to fill the showcase with a couple spare, in case one drops offline.
const TOP_NODES_KEPT = 5;

const FLUXINFO_ATTEMPTS = 3;
const FLUXINFO_RETRY_BASE_MS = 400;

let _fluxinfoInFlight = null;

const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Recover the Flux app name from a docker container name.
 *
 * Flux names containers `flux<component>_<appname>` for compose apps and
 * `flux<appname>` for single-component ones, so the app name is whatever
 * follows the first underscore. Component names never contain one; app names
 * may, which is why this splits on the first and not the last.
 *
 *   /fluxFoldingAtHome_FoldingAtRunOnFlux29  ->  FoldingAtRunOnFlux29
 *   /fluxPresearch                           ->  Presearch
 */
export function appNameFromContainer(containerName) {
  const raw = (containerName || '').replace(/^\//, '');
  if (!raw.startsWith('flux')) return null;
  const body = raw.slice(4);
  const underscore = body.indexOf('_');
  const name = underscore === -1 ? body : body.slice(underscore + 1);
  return name || null;
}

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
  // Per-app-name running-container tally. Category/repotag/watchtower/
  // wordpress/streamr/presearch detection all used to be image-substring
  // matches done right here — fluxinfo no longer reports an image at all
  // (issue #187), so none of that can happen in this module any more. It now
  // moves to runningAppsCategorized.js, which joins this name-keyed tally
  // against globalappsspecifications (still has the real repotag) once both
  // are available. This module stays a pure, spec-agnostic reader of
  // fluxinfo, same as before.
  const nameCounts = {};
  const perNode = [];
  let totalContainers = 0;

  for (const item of nodes) {
    const running = Array.isArray(item?.apps?.runningapps) ? item.apps.runningapps : [];
    totalContainers += running.length;

    // One name per container, NOT deduped — a 3-component compose app
    // contributes its app name 3 times, matching the pre-#187 per-container
    // imageCounts convention (each component counted once).
    const containerAppNames = running
      .map((a) => appNameFromContainer(Array.isArray(a?.Names) ? a.Names[0] : null))
      .filter(Boolean);

    for (const name of containerAppNames) {
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    }

    const ip = typeof item?.ip === 'string' ? item.ip : '';
    if (ip && running.length > 0) {
      perNode.push({
        ip,
        tier: typeof item?.tier === 'string' ? item.tier : null,
        containerCount: running.length,
        containerAppNames,
        appNames: [],
      });

      const names = [...new Set(containerAppNames)];
      const entry = perNode[perNode.length - 1];
      entry.appNames = names;
      entry.appCount = names.length || running.length;
    }
  }

  perNode.sort((a, b) => b.appCount - a.appCount || a.ip.localeCompare(b.ip));
  const topNodesByApps = perNode.slice(0, TOP_NODES_KEPT);

  const nodesByIp = {};
  for (const entry of perNode) {
    nodesByIp[entry.ip.trim()] = entry;
  }

  return {
    nameCounts,
    totalContainers,
    topNodesByApps,
    nodesByIp,
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
    if (!cached?.aggregate?.nameCounts) return null;
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
