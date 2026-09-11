import { FLUX_TEAM_OWNER_ZELIDS } from 'analytics/teamSponsored';
import { specResources } from 'appSpecs';

/*
 * The apps behind the "Flux-team-sponsored" percentage.
 *
 * That stat says roughly half of all ordered app instances run under one owner
 * ID, which is a striking claim to make with no way to check it. This turns it
 * into something inspectable: the actual apps, what they are, and what they
 * cost.
 *
 * Kept as a pure function over data the tab already has -- no new fetch. Every
 * field comes from specs already in memory:
 *
 *   name        spec.name
 *   repo        specResources(spec).repotag (component 0 for compose apps)
 *   instances   spec.instances, defaulting to 1 for older specs that omit it
 *   cpu/ram/ssd specResources(spec), summed across compose components
 *   expiry      spec.height + spec.expire, converted to a date via the 30s
 *               block target
 *
 * Expiry is a BLOCK HEIGHT on chain, not a timestamp. Converting it to a date
 * needs the current height, so callers that do not have one get null rather
 * than a date computed from a zero height -- which would read as 1970 and look
 * like real data.
 */

const SECONDS_PER_BLOCK = 30;
const MS_PER_BLOCK = SECONDS_PER_BLOCK * 1000;

/**
 * @param {Array} rawSpecs   every global app spec
 * @param {number} currentBlock  chain height; 0/undefined disables expiry dates
 * @param {Array<string>} [teamZelids]  owner IDs treated as the Flux team
 * @returns {{ rows: Array, totalInstances: number, totalApps: number,
 *             totalCpu: number, totalRamGB: number, totalSsdGB: number }}
 */
export function buildTeamAppRows(rawSpecs, currentBlock, teamZelids = FLUX_TEAM_OWNER_ZELIDS) {
  const team = new Set(teamZelids || []);
  const specs = Array.isArray(rawSpecs) ? rawSpecs : [];

  const rows = [];
  for (const spec of specs) {
    if (!spec?.owner || !team.has(spec.owner)) continue;

    const { cpuPerInst, ramGBPerInst, ssdGBPerInst, repotag, isEnterprise } = specResources(spec);
    const instances = spec.instances || 1;

    // Height + expire is the expiry BLOCK. Without a current height there is
    // no honest way to turn that into a date.
    let expiresInBlocks = null;
    let expiresAt = null;
    if (spec.expire && currentBlock > 0) {
      const expiryBlock = (spec.height || 0) + spec.expire;
      expiresInBlocks = expiryBlock - currentBlock;
      expiresAt = Date.now() + expiresInBlocks * MS_PER_BLOCK;
    }

    rows.push({
      name: spec.name,
      repotag,
      instances,
      cpuPerInst,
      ramGBPerInst,
      ssdGBPerInst,
      // Fleet-wide cost, which is the figure that actually explains the
      // percentage -- one app at 100 instances dominates fifty at one each.
      totalCpu: cpuPerInst == null ? null : cpuPerInst * instances,
      totalRamGB: ramGBPerInst == null ? null : ramGBPerInst * instances,
      totalSsdGB: ssdGBPerInst == null ? null : ssdGBPerInst * instances,
      expiresInBlocks,
      expiresAt,
      isEnterprise,
    });
  }

  // Biggest fleets first: the point of the table is explaining where the
  // instance share comes from, and that is dominated by instance count.
  rows.sort((a, b) => b.instances - a.instances || String(a.name).localeCompare(String(b.name)));

  const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

  return {
    rows,
    totalApps: rows.length,
    totalInstances: sum('instances'),
    totalCpu: sum('totalCpu'),
    totalRamGB: sum('totalRamGB'),
    totalSsdGB: sum('totalSsdGB'),
  };
}

/** "in 34 days" / "in 6 hours" / "expired" — null when the height is unknown. */
export function formatExpiry(expiresInBlocks) {
  if (expiresInBlocks == null) return null;
  if (expiresInBlocks <= 0) return 'expired';

  const hours = (expiresInBlocks * SECONDS_PER_BLOCK) / 3600;
  if (hours < 24) {
    const rounded = Math.max(1, Math.round(hours));
    return `in ${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}
