const NODE_LIST_URL = 'https://explorer.runonflux.io/api/status?q=getFluxNodes';
const DEFAULT_TOP_N = 20;

/*
 * Pure: network-wide node-operator concentration, NOT the per-country max
 * apidata.js's countryDominance computes — this counts every node an
 * address controls anywhere on the network. No existing function returns
 * this shape (countryDominance discards the winning address entirely and
 * only keeps the per-country max count), so this is a new aggregation over
 * the same raw node list that function and others already fetch.
 */
export function rankNodeOperators(nodes, topN = DEFAULT_TOP_N) {
  const counts = {};
  for (const node of nodes || []) {
    const addr = node?.payment_address;
    if (!addr) continue;
    counts[addr] = (counts[addr] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([address, nodeCount]) => ({ address, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount)
    .slice(0, topN);
}

export async function fetch_top_node_operators(topN = DEFAULT_TOP_N) {
  try {
    const res = await fetch(NODE_LIST_URL);
    const data = await res.json();
    const nodes = Array.isArray(data?.fluxNodes) ? data.fluxNodes : [];
    return rankNodeOperators(nodes, topN);
  } catch {
    return [];
  }
}

/*
 * Pure: per-owner instance totals across the WHOLE network, unsliced. Deliberately
 * not truncated to a top N here — teamSponsored.js needs the true network total
 * and the team's real total even if the team isn't in whatever slice a caller
 * displays (it should be, given ~51% share, but don't build in a truncation bug
 * for a hypothetical future where it's smaller). Callers slice for display.
 */
export function aggregateOwnerTotals(specs) {
  const perOwner = {};
  let networkTotalInstances = 0;

  for (const spec of specs || []) {
    const instances = spec?.instances || 1;
    networkTotalInstances += instances;

    const owner = spec?.owner;
    if (!owner) continue;
    perOwner[owner] = (perOwner[owner] || 0) + instances;
  }

  const owners = Object.entries(perOwner)
    .map(([owner, totalInstances]) => ({ owner, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  return { owners, networkTotalInstances };
}
