/*
 * Shared access to the two heaviest fluxinfo projections.
 *
 * `projection=benchmark` is ~3.45 MB and `projection=geolocation` ~0.5 MB, and
 * before this module each was fetched TWICE per home-page load — benchmark by
 * both fetch_total_network_utils and fetch_global_performance_rankings,
 * geolocation by both fetch_global_performance_rankings and
 * fetch_country_node_counts. That is roughly 7.9 MB of duplicate payload.
 *
 * Everything now goes through here: one in-flight request per projection per
 * refresh, shared by every caller. The Workhorse showcase rides on the same
 * data rather than adding a third fetch of either.
 *
 * Deliberately not cached to storage — these are large and sessionStorage is
 * already near its quota (see #153). In-flight sharing is what removes the
 * duplication; a second load refetches, as it did before.
 */

const BENCHMARKS_URL = 'https://stats.runonflux.io/fluxinfo?projection=benchmark';

// `ip` so utilisation rows can be attributed to a node for the showcase.
const RESOURCES_URL = 'https://stats.runonflux.io/fluxinfo?projection=apps.resources,ip';

const GEOLOCATION_URL = 'https://stats.runonflux.io/fluxinfo?projection=geolocation';

/*
 * In-flight sharing alone only helps when callers overlap. fetch_country_node_counts
 * and fetch_global_performance_rankings ask for geolocation at different moments in
 * the load, so the result is also held briefly — long enough to cover one page load,
 * short enough that the 5-minute refresh still gets fresh data.
 */
const RESULT_TTL_MS = 60 * 1000;

function _shared(url) {
  let inFlight = null;
  let cached = null;
  let cachedAt = 0;

  return async function fetchShared() {
    if (cached && Date.now() - cachedAt < RESULT_TTL_MS) return cached;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        // The endpoint answers 200 with { status: 'error' } when it is unhappy,
        // which is how this looked like a data problem rather than an outage.
        if (json?.status === 'error' || !Array.isArray(json?.data)) {
          console.warn('[networkNodes] upstream returned no data for', url.split('projection=')[1]);
          return [];
        }
        return json.data;
      } catch (error) {
        console.warn('[networkNodes] fetch failed:', error?.message);
        return [];
      }
    })();

    try {
      const data = await inFlight;
      // Only hold on to a real answer; an empty result should be retried.
      if (data.length > 0) {
        cached = data;
        cachedAt = Date.now();
      }
      return data;
    } finally {
      inFlight = null;
    }
  };
}

export const fetch_node_benchmarks = _shared(BENCHMARKS_URL);
export const fetch_node_resources = _shared(RESOURCES_URL);
export const fetch_node_geolocation = _shared(GEOLOCATION_URL);

/** Node addresses arrive with and without a port; the host is the join key. */
export function hostOf(address) {
  return (address || '').split(':')[0];
}

/**
 * Join the busiest nodes against benchmark, geolocation and utilisation data.
 *
 * `topNodesByApps` comes from the fluxinfo aggregate the ecosystem panel
 * already builds. Everything else is looked up by host from data already in
 * flight for other panels.
 *
 * Benchmark data is optional. The 3.45 MB benchmark projection has been seen
 * returning status=error for minutes at a time, and requiring it would make all
 * three cards disappear together during an outage. Identity, location, tier,
 * app list and utilisation all come from cheaper, steadier calls — so the card
 * renders with the specs section omitted rather than not at all.
 */
export function buildWorkhorseNodes(topNodesByApps, benchmarks, geolocations, resources, limit = 3) {
  if (!Array.isArray(topNodesByApps) || topNodesByApps.length === 0) return [];

  const benchByHost = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const host = hostOf(bench?.ipaddress);
    if (host) benchByHost[host] = { bench, tier: entry?.benchmark?.status?.benchmarking || null };
  }

  const geoByHost = {};
  for (const entry of geolocations || []) {
    const geo = entry?.geolocation;
    const host = hostOf(geo?.ip);
    if (host) geoByHost[host] = geo;
  }

  const resByHost = {};
  for (const entry of resources || []) {
    const host = hostOf(entry?.ip);
    if (host) resByHost[host] = entry?.apps?.resources || null;
  }

  const out = [];
  for (const node of topNodesByApps) {
    const host = hostOf(node.ip);
    const benchEntry = benchByHost[host];
    const b = benchEntry?.bench || null;
    const geo = geoByHost[host] || {};
    const res = resByHost[host] || {};

    out.push({
      ip: node.ip,
      host,
      appCount: node.appCount,
      images: node.images,
      tier: node.tier || benchEntry?.tier || null,
      country: geo.country || null,
      // Capacity, from the node's own benchmark run. Null when benchmarks are
      // unavailable; the UI omits the section rather than showing zeros.
      capacity: b
        ? { cores: b.cores ?? null, ramGB: b.ram ?? null, ssdGB: b.totalstorage ?? b.ssd ?? null }
        : { cores: null, ramGB: null, ssdGB: null },
      // What its apps have actually reserved. appsRamLocked is MB.
      utilised: {
        cores: res.appsCpusLocked ?? null,
        ramGB: res.appsRamLocked != null ? res.appsRamLocked / 1024 : null,
        ssdGB: res.appsHddLocked ?? null
      },
      benchmark: b
        ? {
            eps: b.eps ?? null,
            dws: b.ddwrite ?? null,
            downloadSpeed: b.download_speed ?? null,
            uploadSpeed: b.upload_speed ?? null
          }
        : null
    });

    if (out.length >= limit) break;
  }

  return out;
}
