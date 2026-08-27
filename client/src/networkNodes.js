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

/** The bare IP, no port. Geolocation is per-machine, so it keys on this. */
export function hostOf(address) {
  return (address || '').split(':')[0];
}

/**
 * The full address including port, normalised.
 *
 * One machine commonly runs several nodes on different ports — 82.66.83.104 has
 * three, each with its own wallet, benchmark row and resource reservation.
 * Keying on the bare IP silently merged them and attributed one node's wallet
 * to another, so everything except geolocation joins on this.
 */
export function addressOf(address) {
  return (address || '').trim();
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
export function buildWorkhorseNodes(
  topNodesByApps,
  benchmarks,
  geolocations,
  resources,
  paymentAddresses,
  limit = 3
) {
  if (!Array.isArray(topNodesByApps) || topNodesByApps.length === 0) return [];

  const benchByAddr = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const addr = addressOf(bench?.ipaddress);
    if (addr) benchByAddr[addr] = { bench, tier: entry?.benchmark?.status?.benchmarking || null };
  }

  const geoByHost = {};
  for (const entry of geolocations || []) {
    const geo = entry?.geolocation;
    const host = hostOf(geo?.ip);
    if (host) geoByHost[host] = geo;
  }

  const resByAddr = {};
  for (const entry of resources || []) {
    const addr = addressOf(entry?.ip);
    if (addr) resByAddr[addr] = entry?.apps?.resources || null;
  }

  // So the showcase can link a node through to the wallet that runs it.
  const walletByAddr = {};
  for (const entry of paymentAddresses || []) {
    const addr = addressOf(entry?.ip);
    if (addr && entry?.payment_address) walletByAddr[addr] = entry.payment_address;
  }

  const out = [];
  for (const node of topNodesByApps) {
    const addr = addressOf(node.ip);
    const host = hostOf(node.ip);
    const benchEntry = benchByAddr[addr];
    const b = benchEntry?.bench || null;
    const geo = geoByHost[host] || {};   // per-machine, carries no port
    const res = resByAddr[addr] || {};

    out.push({
      ip: node.ip,
      host,
      appCount: node.appCount,
      containerCount: node.containerCount ?? node.appCount,
      images: node.images,
      appNames: node.appNames || [],
      paymentAddress: walletByAddr[addr] || null,
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
