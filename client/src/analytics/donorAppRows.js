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
        /*
         * How many the spec ORDERED. Kept, but deliberately not the headline
         * -- see the network-wide count below. null when no spec matched, the
         * same rule the resource columns follow.
         */
        ordered: spec?.instances ?? null,
        // Both filled in below: they need every row, and the whole network.
        yours: 0,
        networkInstances: 0,
      });
    });
  }

  /*
   * How many instances are RUNNING -- the donor's, and the network's
   * (issue #344).
   *
   * A Flux app instance is one deployment on one NODE, so both counts are over
   * distinct node addresses, NOT rows. Counting rows would be wrong for any
   * multi-component app: WordPress is an nginx container and a mysql container
   * on a single node, which is two rows and ONE instance.
   *
   * Nodes are distinguished by ip:port, so two nodes sharing a host count
   * twice. They are two separate deployments, and collapsing them by IP is the
   * same mistake that made the utilisation figure wrong in this issue.
   *
   * WHY THE NETWORK FIGURE IS RUNNING RATHER THAN ORDERED. The first pass used
   * the spec's `instances` field, which is how many were ordered. Measured
   * across the live feeds those disagree for most apps:
   *
   *     806 apps  running == ordered
   *     483 apps  running <  ordered
   *      10 apps  running >  ordered   -- alphexplorer: 592 running, 30 ordered
   *
   * So an app with 592 instances up would have read "1 / 30", and for those
   * ten a row could read "3 / 1" -- a denominator smaller than the numerator,
   * which reads as a bug rather than as the over-deployment it is. #327
   * settled that this project reports what is actually running; `ordered`
   * stays on the row because the GAP between the two is itself the story
   * there, but it is context, not the count.
   *
   * nodesByIp is the whole network's map -- donorAddresses is a filter over
   * it, not its contents -- so the network figure costs no extra fetch.
   */
  const donorNodesPerApp = {};
  for (const row of rows) {
    (donorNodesPerApp[row.name] ||= new Set()).add(row.nodeAddress);
  }

  const networkNodesPerApp = {};
  for (const [nodeAddress, node] of Object.entries(nodesByIp || {})) {
    for (const name of node?.containerAppNames || []) {
      (networkNodesPerApp[name] ||= new Set()).add(nodeAddress);
    }
  }

  for (const row of rows) {
    row.yours = donorNodesPerApp[row.name].size;
    // The donor's own nodes are part of the network, so this can never be
    // smaller than `yours` -- unlike the ordered figure it replaces.
    row.networkInstances = networkNodesPerApp[row.name]?.size ?? row.yours;
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
