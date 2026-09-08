import { addressOf } from 'networkNodes';

/*
 * Pure: tally the donor's own running apps by category, from the IP-keyed
 * lookup fetch_fluxinfo_aggregate() carries as nodesByIp, joined against a
 * name-keyed spec index (appSpecs.js's buildSpecIndex) for category —
 * fluxinfo no longer reports a docker image (issue #187), so category can
 * only be recovered by joining the running app's name to its
 * globalappsspecifications repotag, same as runningAppsCategorized.js does
 * network-wide. A running app whose spec can't be found (e.g. it expired
 * between the two independent fetches) falls back to 'other' rather than
 * being dropped from the tally.
 *
 * containrrr/watchtower is excluded from the tally by its resolved repotag:
 * every Flux node runs it to auto-update its own containers, so it's
 * infrastructure the node runs for itself, not something the donor deployed.
 *
 * Addresses are normalized via addressOf() before lookup, matching
 * donorUtilization.js's own normalization.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses, specIndex) {
  const perCategory = {};
  let totalApps = 0;
  const index = specIndex || {};

  for (const rawAddr of donorAddresses || []) {
    const node = nodesByIp?.[addressOf(rawAddr)];
    if (!node) continue;

    for (const name of node.containerAppNames || []) {
      const spec = index[name];
      const repotag = spec?.repotag || '';
      if (repotag.toLowerCase().includes('containrrr/watchtower')) continue;

      const cat = spec?.category || 'other';
      perCategory[cat] = (perCategory[cat] || 0) + 1;
      totalApps++;
    }
  }

  const categories = Object.entries(perCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return { categories, totalApps };
}
