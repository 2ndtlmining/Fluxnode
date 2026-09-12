import { addressOf } from 'networkNodes';
import { repotagForComponent } from 'appSpecs';

/*
 * One row per running container on the donor's own nodes (issue #299).
 *
 * This is the level the Donor tab's "Apps on your Nodes" table renders, and it
 * is also what the App Categories panel is now tallied from — see
 * tallyRowCategories below and donorApps.js. Keeping one producer means a node
 * filter narrows the table and the category counts through the same list, so
 * the two can never disagree about what is running where.
 *
 * The join is the same one aggregateDonorAppsByCategory always did: fluxinfo
 * reports a running container's app NAME but no docker image (issue #187), so
 * category and resources are recovered by looking that name up in the
 * globalappsspecifications index. The repotag is resolved per COMPONENT rather
 * than per app — a multi-component app runs several distinct images, and the
 * table is showing the one this container actually is.
 *
 * Unknown resources are null, never 0. specResources() is careful to return
 * nulls for enterprise apps (their compose is encrypted, so there is nothing to
 * sum) and a "0.00 cores" in the table would read as a confident zero rather
 * than "not knowable". A missing spec is treated the same way: the app is real
 * enough to list, but nothing about its size is known.
 */
export function buildDonorAppRows(nodesByIp, donorAddresses, specIndex) {
  const index = specIndex || {};
  const rows = [];

  for (const rawAddr of donorAddresses || []) {
    const nodeAddress = addressOf(rawAddr);
    const node = nodesByIp?.[nodeAddress];
    if (!node) continue;

    const names = node.containerAppNames || [];
    // Index-aligned with names (fluxinfo.js), but absent on older cached
    // payloads — a missing array means "no component", not a crash.
    const components = node.containerComponents || [];

    names.forEach((name, i) => {
      const spec = index[name];
      const component = components[i] ?? null;
      const repotag = spec ? repotagForComponent(spec, component) : '';

      // Every Flux node runs watchtower to auto-update its own containers. It
      // is infrastructure the node runs for itself, not something the donor
      // deployed, so it is excluded here exactly as it was from the tally.
      if (repotag.toLowerCase().includes('containrrr/watchtower')) return;

      rows.push({
        // Two containers of one app can run on a single node, so neither the
        // name nor the name+component pair is unique. The container's index
        // within the node is what distinguishes them.
        key: `${nodeAddress}|${i}|${name}`,
        nodeAddress,
        name,
        component,
        repotag,
        category: spec?.category || 'other',
        cpu: spec ? spec.cpuPerInst : null,
        ramGB: spec ? spec.ramGBPerInst : null,
        ssdGB: spec ? spec.ssdGBPerInst : null,
      });
    });
  }

  return rows;
}

/*
 * Pure: category counts over a row list, descending. Taking rows rather than
 * the raw lookup is what lets the Donor tab tally a FILTERED slice — the same
 * function serves "all my apps" and "the apps on this one node".
 */
export function tallyRowCategories(rows) {
  const perCategory = {};
  let totalApps = 0;

  for (const row of rows || []) {
    perCategory[row.category] = (perCategory[row.category] || 0) + 1;
    totalApps++;
  }

  const categories = Object.entries(perCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return { categories, totalApps };
}
