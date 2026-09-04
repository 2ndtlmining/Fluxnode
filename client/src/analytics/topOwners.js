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
