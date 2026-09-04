/*
 * The Flux team's own app-owner ZelID — confirmed via project research:
 * owns ~51% of network app instances (FoldingAtHome and other official
 * apps), per fluxinfo.js's imageCounts aggregation cross-referenced against
 * this owner value on 2026-08-26. This is a single hardcoded address to
 * keep maintained, not a discovered list — if the team ever deploys under
 * an additional ZelID, add it here. Do NOT confuse this with Girder
 * Works/Beldex (164ubcHD6ERRkhg22qsSrvu7fHjdryJWUs) — that is the largest
 * THIRD-PARTY operator on the network, not the Flux team.
 */
export const FLUX_TEAM_OWNER_ZELIDS = ['196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH'];

// Pure — takes the FULL (unsliced) owner totals from topOwners.js's
// aggregateOwnerTotals, not a display-truncated top N, so the team's true
// share is never understated by falling outside some arbitrary cutoff.
export function computeTeamSponsoredShare(owners, networkTotalInstances) {
  if (!networkTotalInstances) return { teamInstances: 0, sharePct: 0 };

  const teamInstances = (owners || [])
    .filter((o) => FLUX_TEAM_OWNER_ZELIDS.includes(o.owner))
    .reduce((sum, o) => sum + o.totalInstances, 0);

  const sharePct = (teamInstances / networkTotalInstances) * 100;
  return { teamInstances, sharePct };
}
