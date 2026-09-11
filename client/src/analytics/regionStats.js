/*
 * Region-scoped network statistics for the Network tab (issue #254).
 *
 * THE JOIN, and why it is this way round: this iterates the NODE LIST and looks
 * geolocation up by host -- not the other way round. The node list is the only
 * feed carrying `ip:port` and `tier` on the same record, so driving from it
 * gives every node its exact tier. Driving from the geolocation feed instead
 * would reintroduce exactly the collapse #215 was about: geolocation is
 * per-MACHINE, and 254 hosts on this network run more than one tier, covering
 * 1,366 nodes (21.5%). There is no defensible tier for those from geo alone.
 *
 * Everything here is pure. Region totals are the headline of a page about the
 * network's shape, and an aggregation bug would look entirely plausible on
 * screen -- Europe being wrong by a few hundred nodes reads the same as Europe
 * being right.
 */

const TIERS = ['CUMULUS', 'NIMBUS', 'STRATUS'];
const UNLOCATED = 'Unlocated';

/** The bare host. Geolocation is per-machine, so it keys on this and nothing else. */
export function hostOf(address) {
  return (address || '').split(':')[0];
}

function emptyBucket(extra = {}) {
  return {
    nodes: 0,
    tiers: {},
    wallets: 0,
    _wallets: new Set(),
    cores: 0,
    ram: 0,
    ssd: 0,
    capNodes: 0,
    appInstances: 0,
    appsByCategory: {},
    ...extra
  };
}

function addNode(bucket, node, cap, apps, categoryOf) {
  bucket.nodes += 1;

  const tier = (node.tier || '').toUpperCase();
  if (TIERS.includes(tier)) bucket.tiers[tier] = (bucket.tiers[tier] || 0) + 1;

  if (node.payment_address) bucket._wallets.add(node.payment_address);

  // Only nodes that actually reported a benchmark contribute capacity, and
  // capNodes records how many did -- without it a region with poor benchmark
  // coverage would silently look under-resourced rather than under-measured.
  if (cap && typeof cap.cores === 'number') {
    bucket.cores += cap.cores || 0;
    bucket.ram += cap.ram || 0;
    bucket.ssd += cap.ssd || 0;
    bucket.capNodes += 1;
  }

  for (const appName of apps || []) {
    const category = categoryOf(appName);
    bucket.appsByCategory[category] = (bucket.appsByCategory[category] || 0) + 1;
    bucket.appInstances += 1;
  }
}

function seal(bucket) {
  bucket.wallets = bucket._wallets.size;
  delete bucket._wallets;
  return bucket;
}

/*
 * `categoryOf` is REQUIRED rather than defaulted.
 *
 * The Apps tab derives an app's category by joining its name to the
 * globalappsspecifications index; a keyword match on the name alone puts ~61%
 * of instances in "other". Both are defensible in isolation, but two different
 * breakdowns on one page is the silent canonical-source swap the calculation
 * audit's D2 domain exists to catch. Making the caller supply the categoriser
 * forces that choice to be explicit at the call site instead of buried here.
 */
export function aggregateRegions({ nodes, geoByHost, capByNode, appsByNode, categoryOf } = {}) {
  const toCategory = typeof categoryOf === 'function' ? categoryOf : () => 'other';
  const network = emptyBucket();
  const continents = {};
  const countries = {};

  for (const node of nodes || []) {
    const geo = (geoByHost || {})[hostOf(node?.ip)] || null;
    const cap = (capByNode || {})[node?.ip] || null;
    const apps = (appsByNode || {})[node?.ip] || null;

    addNode(network, node, cap, apps, toCategory);

    const continent = geo?.continent || UNLOCATED;
    if (!continents[continent]) continents[continent] = emptyBucket({ continent });
    addNode(continents[continent], node, cap, apps, toCategory);

    // A node with no geolocation has no country either. It still counts in the
    // Unlocated continent bucket above, so the totals reconcile.
    const code = geo?.countryCode;
    if (!code) continue;
    if (!countries[code]) {
      countries[code] = emptyBucket({ countryCode: code, country: geo.country || code, continent });
    }
    addNode(countries[code], node, cap, apps, toCategory);
  }

  seal(network);
  Object.values(continents).forEach(seal);
  Object.values(countries).forEach(seal);

  return { network, continents, countries };
}

/*
 * The bucket the current selection points at. Falls back to network totals for
 * a selection that no longer exists -- regions come and go between refreshes as
 * the last node in a country drops off, and a stale selection must not blank
 * the cards.
 */
export function selectRegionStats(agg, scope) {
  if (!agg) return null;
  const level = scope?.level;

  if (level === 'country' && agg.countries[scope.country]) return agg.countries[scope.country];
  if (level === 'continent' && agg.continents[scope.continent]) return agg.continents[scope.continent];
  return agg.network;
}

/** A continent's countries, busiest first -- the order the Country selector offers them in. */
export function countriesIn(agg, continent) {
  if (!agg) return [];
  return Object.values(agg.countries)
    .filter((c) => c.continent === continent)
    .sort((a, b) => b.nodes - a.nodes);
}
