/**
 * Rank of one specific node within a group, by one metric — the on-demand
 * replacement for looking a node up in a pre-sorted array (issue #153:
 * pre-sorting and caching the ENTIRE network for every metric/tier/country
 * combination was the single biggest sessionStorage cost, and no consumer
 * ever needed any node's rank except a searched wallet's own — see
 * docs/superpowers/specs/2026-09-09-accuracy-and-reliability-fixes-design.md).
 *
 * Cheap specifically because it only ever runs for the handful of nodes a
 * searched wallet owns, never for the whole network.
 *
 * Tie-break matches the OLD pre-sort exactly: Array.sort is stable in this
 * engine, so among equal values the one appearing earlier in `groupNodes`
 * always got the better (lower) rank. rank = 1 + (strictly greater) +
 * (equal AND earlier in the array). Getting this wrong flips medal
 * outcomes on tied values — the one behavior change this redesign must
 * never introduce.
 *
 * Returns null if targetIp isn't in groupNodes at all (offline/
 * unbenchmarked node) — every caller already treats "not found" as "skip",
 * matching the old .find()-returns-undefined behavior.
 *
 * A bare IP can legitimately appear more than once in groupNodes: a single
 * host running several Flux nodes on different ports all collapse to one
 * key here, since nodeData carries no port (confirmed live 2026-09-09 —
 * one wallet owning 8 CUMULUS nodes on one host, EPS ranging 265-2143
 * across them). The OLD pre-sorted-array lookup sorted descending by value
 * BEFORE any .find()-by-ip, so a duplicate ip always incidentally resolved
 * to its highest-value entry. A naive first-match scan here would instead
 * land on whatever happens to be first in nodeData's unsorted fetch order
 * — silently downgrading a wallet's real best node to an arbitrary worse
 * one. Scanning for the best (not first) matching entry restores the old
 * behavior exactly, and is a no-op when an ip has only one entry.
 */
export function rankInGroup(groupNodes, targetIp, metricKey) {
  // Ascending iteration + strict `>` already gives earliest-index-wins for
  // ties among the target ip's own duplicates: once targetIndex is set,
  // only a later i can be examined, so an equal-value duplicate can never
  // displace it — no separate "earlier index" clause is needed here.
  let targetIndex = -1;
  let targetValue = 0;
  for (let i = 0; i < groupNodes.length; i++) {
    if (groupNodes[i].ip !== targetIp) continue;
    const v = groupNodes[i][metricKey] || 0;
    if (targetIndex === -1 || v > targetValue) {
      targetIndex = i;
      targetValue = v;
    }
  }
  if (targetIndex === -1) return null;

  let rank = 1;
  for (let i = 0; i < groupNodes.length; i++) {
    if (i === targetIndex) continue;
    const v = groupNodes[i][metricKey] || 0;
    if (v > targetValue || (v === targetValue && i < targetIndex)) rank++;
  }
  return { rank, value: targetValue, total: groupNodes.length };
}

/**
 * The single highest-value node in a group for one metric — replaces
 * indexing [0] on a pre-sorted array (HomeOverview's "Top Dogs" panel).
 * Tie-break: whichever node appears earlier in groupNodes wins, matching
 * the old rank-1 assignment under a stable sort.
 */
export function topInGroup(groupNodes, metricKey) {
  if (groupNodes.length === 0) return null;
  let best = null;
  for (const n of groupNodes) {
    const v = n[metricKey] || 0;
    if (best === null || v > best.value) best = { ip: n.ip, value: v };
  }
  return best;
}
