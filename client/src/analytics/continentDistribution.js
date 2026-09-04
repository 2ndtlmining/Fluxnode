import { fetch_node_geolocation } from 'networkNodes';

/*
 * Pure: network-wide node counts grouped by continent. Country-level counts
 * already exist (fetch_country_node_counts, apidata.js:1407), but nothing
 * groups by continent even though the raw geolocation payload already
 * carries it per node (apidata.js's fetch_global_performance_rankings reads
 * `geo.continent` today, just never aggregates on it) — this is a new
 * aggregation over data already fetched elsewhere, not a new data source.
 *
 * `geoEntries` is the raw array fetch_node_geolocation() resolves to:
 * [{ geolocation: { continent, countryCode, country, ip, ... } }, ...].
 * A node with geolocation but no continent value still counts toward
 * networkTotal, just not toward any continent row — same convention
 * topOwners.js's aggregateOwnerTotals uses for a spec with no owner.
 */
export function rollupByContinent(geoEntries) {
  const perContinent = {};
  let networkTotal = 0;

  for (const entry of geoEntries || []) {
    const geo = entry?.geolocation;
    if (!geo) continue;
    networkTotal++;

    const continent = geo.continent;
    if (!continent) continue;
    perContinent[continent] = (perContinent[continent] || 0) + 1;
  }

  const continents = Object.entries(perContinent)
    .map(([continent, nodeCount]) => ({ continent, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount);

  return { continents, networkTotal };
}

// fetch_node_geolocation() is shared/deduped (in-flight sharing + a 60s TTL
// cache) via networkNodes.js, so calling this alongside fetch_country_node_counts
// (which also calls fetch_node_geolocation() internally) costs one real
// network request, not two — no manual plumbing needed between the two.
export async function fetch_continent_distribution() {
  const geoEntries = await fetch_node_geolocation();
  return rollupByContinent(geoEntries);
}
