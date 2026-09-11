/*
 * Network-wide performance rankings.
 *
 * Extracted from apidata.js (issue #147), which had grown to 1,702 lines
 * owning the global store, wallet lookup, node transformation, currency,
 * parallel assets, rankings, app specs, geolocation, GPU pricing and DOS
 * state. That grab-bag has already caused two real bugs -- duplicated resource
 * maths fixed in one place and not the other, and the same 465 KB endpoint
 * fetched twice inside one Promise.all because the two callers were sixty
 * lines apart in a file nobody reads end to end.
 *
 * This module is a MOVE, not a rewrite: the code below is unchanged from
 * apidata.js. apidata.js re-exports it, so no call site changes in this pass.
 *
 * It owns:
 *   buildTierResolver                 ip:port -> tier (issue #215)
 *   fetch_global_performance_rankings nodeData, tierWinners, countryTierCounts
 *   the globalPerfRankings_v5 sessionStorage cache and its stale-key pruning
 */

import { explorerFetchJson } from 'explorer';
import { fetch_node_benchmarks, fetch_node_geolocation, fetch_flux_nodes } from 'networkNodes';
import { topInGroup } from 'main/Gamification/rankInGroup';
import { EXPLORER_FLUX_NODES_PATH } from 'api/endpoints';

// Moved with the code that uses it: nothing outside this module reads it.
const VALID_TIERS = new Set(['CUMULUS', 'NIMBUS', 'STRATUS']);

function _flagFromCountryCode(cc) {
  if (!cc || cc.length !== 2) return '';
  const base = 0x1f1e6 - 65;
  return (
    String.fromCodePoint(cc.charCodeAt(0) + base) +
    String.fromCodePoint(cc.charCodeAt(1) + base)
  );
}

const GLOBAL_RANKINGS_CACHE_KEY = 'globalPerfRankings_v5';
const GLOBAL_RANKINGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
// v4 rows carried a full `geo` object; v5 carries `cc` only (#153). A
// leftover v4 entry would silently yield zero country ranks, so it is
// pruned rather than left to expire.
const GLOBAL_RANKINGS_STALE_KEYS = ['globalPerfRankings_v3', 'globalPerfRankings_v4'];

function _prune_stale_global_rankings_caches() {
  for (const key of GLOBAL_RANKINGS_STALE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

/**
 * Resolves a benchmark entry's `ipaddress` to its tier.
 *
 * Issue #215: this used to be a plain `host -> tier` map built by stripping the
 * port. One host can run several Flux nodes OF DIFFERENT TIERS, so they
 * collided and whichever entry the API returned last won for all of them.
 * Measured on a live fixture: 254 hosts run mixed tiers, and 788 of 6237
 * benchmarked nodes (12.6%) were assigned the wrong one -- always upward,
 * since the API returns a host's nodes in ascending-tier order. Cumulus
 * operators were being ranked against Nimbus and Stratus hardware.
 *
 * Both feeds carry the port that separates these nodes. The old code discarded
 * exactly the field that made them distinguishable.
 *
 * Resolution order, with the live counts each path serves (2026-09-11):
 *
 *   1. Exact match on the ip string as it appears        4035 entries
 *   2. Bare ip, when both feeds report it bare           2151 (free -- the
 *                                                        key is the raw string)
 *   3. Host fallback, ONLY if that host runs one tier      60 entries where the
 *                                                        feeds disagree about
 *                                                        including a port
 *   4. Otherwise null                                       0 today
 *
 * Rule 4 is the point. When a host runs mixed tiers and no exact key matched,
 * there is no honest answer, so this returns null and the caller drops the node
 * -- exactly as it already does for an unknown host. Guessing is what caused
 * the bug.
 *
 * Verified lossless against a live fixture: every benchmarked node that
 * resolved under the old host-collapsed map still resolves here, and the
 * per-tier totals move from 2397/1996/1855 to 3026/1580/1631 against the
 * daemon's authoritative 3119/1581/1634.
 */
export function buildTierResolver(fluxNodes) {
  const byExactIp = new Map();
  const tiersByHost = new Map();

  for (const node of (Array.isArray(fluxNodes) ? fluxNodes : [])) {
    const raw = node?.ip || '';
    if (!raw) continue;
    const tier = (node.tier || '').toUpperCase();
    if (!tier) continue;

    byExactIp.set(raw, tier);

    const host = raw.split(':')[0];
    if (!tiersByHost.has(host)) tiersByHost.set(host, new Set());
    tiersByHost.get(host).add(tier);
  }

  return function resolveTier(ipAddress) {
    const raw = ipAddress || '';
    if (!raw) return null;

    const exact = byExactIp.get(raw);
    if (exact) return exact;

    // Only safe where the host is unambiguous; a mixed-tier host has no
    // defensible answer without the port.
    const tiers = tiersByHost.get(raw.split(':')[0]);
    if (tiers && tiers.size === 1) return tiers.values().next().value;
    return null;
  };
}

/**
 * Fetches and joins node list (tier), benchmark data, and geolocation for all
 * ~8000 Flux nodes. Builds a flat nodeData array plus two small precomputed
 * aggregates (tierWinners, countryTierCounts) — see issue #153: the old
 * pre-sorted tierRankings/countryRankings shape duplicated every node 12+
 * times and was the single biggest sessionStorage-quota offender. Results
 * are cached in sessionStorage for 10 minutes.
 *
 * Returns: { nodeData, tierWinners, countryTierCounts, officialNodeCounts,
 * countryDominance, nodeGeoMap, addressGeoMap } or null on failure.
 */
export async function fetch_global_performance_rankings() {
  _prune_stale_global_rankings_caches();

  // Return cached data if fresh
  try {
    const raw = sessionStorage.getItem(GLOBAL_RANKINGS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GLOBAL_RANKINGS_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    // benchmark and geolocation come from the shared fetchers so they are not
    // pulled a second time by fetch_total_network_utils / fetch_country_node_counts
    const [nodesJsonRaw, benchData, geoData, countRes] = await Promise.all([
      // Shared so the Network tab's region aggregation does not pull this 4 MB
      // list a second time on the same page load (#254).
      fetch_flux_nodes(),
      fetch_node_benchmarks(),
      fetch_node_geolocation(),
      fetch('https://api.runonflux.io/daemon/getzelnodecount'),
    ]);

    const nodesJson = { fluxNodes: Array.isArray(nodesJsonRaw) ? nodesJsonRaw : [] };
    const benchJson = { data: benchData };
    const geoJson = { data: geoData };
    const countJson = await countRes.json();

    // Official enabled node counts — same source as the dashboard header
    const officialNodeCounts = {
      CUMULUS: countJson.data?.['cumulus-enabled'] || 0,
      NIMBUS:  countJson.data?.['nimbus-enabled']  || 0,
      STRATUS: countJson.data?.['stratus-enabled'] || 0,
    };

    // ip:port → tier, with a guarded host fallback. See buildTierResolver.
    const resolveTier = buildTierResolver(nodesJson.fluxNodes);

    // IP host → geo
    // API shape: { data: [ { geolocation: { ip, country, countryCode, continent, ... } } ] }
    const nodeGeoMap = {};
    for (const entry of (Array.isArray(geoJson.data) ? geoJson.data : [])) {
      const geo = entry.geolocation;
      if (!geo) continue;
      const host = (geo.ip || '').split(':')[0];
      if (!host) continue;
      const cc = geo.countryCode || geo.country_code;
      if (!cc) continue;
      nodeGeoMap[host] = {
        country: geo.country || cc,
        countryCode: cc,
        continent: geo.continent || '',
        flag: _flagFromCountryCode(cc),
      };
    }

    // Country dominance: count all nodes per wallet per country to find the leader in each country.
    // Uses payment_address from the tier endpoint (same source as wallet node lookup).
    //
    // The same loop also builds addressGeoMap (payment_address -> geo): the
    // Live page resolves a block reward's real payout address to a country
    // this way, since geo elsewhere is only ever keyed by IP. A wallet with
    // nodes in more than one country just gets whichever this loop sees last
    // — a reasonable "somewhere this operator runs" answer, not a claim of
    // precision.
    const countryDominance = {};
    const addressGeoMap = {};
    {
      const countryWalletCounts = {}; // cc → { country, counts: { addr → count } }
      for (const node of (Array.isArray(nodesJson.fluxNodes) ? nodesJson.fluxNodes : [])) {
        const host = (node.ip || '').split(':')[0];
        if (!host || !node.payment_address) continue;
        const geo = nodeGeoMap[host];
        if (!geo?.countryCode) continue;
        const cc = geo.countryCode;
        if (!countryWalletCounts[cc]) {
          countryWalletCounts[cc] = { country: geo.country, counts: {} };
        }
        const addr = node.payment_address;
        countryWalletCounts[cc].counts[addr] = (countryWalletCounts[cc].counts[addr] || 0) + 1;
        addressGeoMap[addr] = geo;
      }
      for (const [cc, data] of Object.entries(countryWalletCounts)) {
        const leaderCount = Math.max(0, ...Object.values(data.counts));
        countryDominance[cc] = { leaderCount, country: data.country };
      }
    }

    // Build unified node list from benchmark data
    // API shape: { data: [ { benchmark: { bench: { ipaddress, eps, ddwrite, download_speed, upload_speed, ... } } } ] }
    const VALID_TIERS = new Set(['CUMULUS', 'NIMBUS', 'STRATUS']);
    const nodeData = [];
    for (const entry of (Array.isArray(benchJson.data) ? benchJson.data : [])) {
      const bench = entry.benchmark?.bench;
      if (!bench) continue;
      const host = (bench.ipaddress || '').split(':')[0];
      if (!host) continue;
      // Resolve from the FULL ip:port, not the bare host -- a host can run
      // several nodes of different tiers (issue #215).
      const tier = resolveTier(bench.ipaddress);
      if (!tier || !VALID_TIERS.has(tier)) continue;
      nodeData.push({
        ip: host,
        tier,
        eps: bench.eps || 0,
        dws: bench.ddwrite || 0,
        down_speed: bench.download_speed || 0,
        up_speed: bench.upload_speed || 0,
        // Country CODE only -- not the whole geo record.
        //
        // This used to inline nodeGeoMap[host], duplicating each host's full
        // geolocation object (country, countryCode, continent, lat, lon, org,
        // region, city) once per NODE, while nodeGeoMap already stores the
        // same records once per HOST. With ~6,200 nodes across ~2,350 hosts
        // that was ~1 MB of pure duplication in a cache measured at 63% of
        // the sessionStorage quota (issue #153).
        //
        // Every consumer of the inlined object only ever read .countryCode
        // (achievements.js's two country-rank filters, and countryTierCounts
        // below). Anything needing the full record has nodeGeoMap, which is
        // cached alongside this and keyed by the same host -- see
        // live/apidata.js's lookupNodeInfo, which already works that way.
        cc: nodeGeoMap[host]?.countryCode || null,
      });
    }

    // Every consumer of this data (achievements.js's 6 dynamic functions,
    // NetworkTab's TopDogsPanel, _extract_country_counts below) only
    // ever needs ONE of: a specific wallet's own node's rank (computed
    // on demand via rankInGroup, cheap since it's only ever a handful of
    // nodes — see main/Gamification/rankInGroup.js), the single #1 node
    // per tier/metric (tierWinners, precomputed here), or a country's
    // node count (countryTierCounts, precomputed here). Nothing needs a
    // pre-sorted rank list for the whole network — that used to cost 12+
    // duplicated copies of every node (issue #153).
    const METRICS = ['eps', 'dws', 'down_speed', 'up_speed'];
    const TIERS = ['CUMULUS', 'NIMBUS', 'STRATUS'];

    const tierWinners = {};
    for (const tier of TIERS) {
      tierWinners[tier] = {};
      const tierNodes = nodeData.filter((n) => n.tier === tier);
      for (const metric of METRICS) {
        tierWinners[tier][metric] = topInGroup(tierNodes, metric);
      }
    }

    const countryTierCounts = {};
    for (const node of nodeData) {
      if (!node.cc) continue;
      const cc = node.cc;
      if (!countryTierCounts[cc]) {
        // The display name comes from nodeGeoMap rather than the row, which
        // now carries only the code.
        countryTierCounts[cc] = { country: nodeGeoMap[node.ip]?.country || cc, tiers: {} };
      }
      countryTierCounts[cc].tiers[node.tier] = (countryTierCounts[cc].tiers[node.tier] || 0) + 1;
    }

    const data = { nodeData, tierWinners, countryTierCounts, officialNodeCounts, countryDominance, addressGeoMap, nodeGeoMap };

    try {
      sessionStorage.setItem(
        GLOBAL_RANKINGS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (e) {
      console.warn('[GlobalRankings] Cache write failed:', e?.message);
    }

    return data;
  } catch (e) {
    console.warn('[GlobalRankings] Failed to fetch:', e);
    return null;
  }
}

/*
 * Country node counts.
 *
 * Moved here with the rankings rather than left in apidata.js because it reads
 * the globalPerfRankings cache DIRECTLY -- it opportunistically reuses the full
 * rankings payload when the gamification tab has already populated it, and
 * falls back to a lighter geolocation-only fetch otherwise. Splitting the two
 * apart would have meant exporting the cache key and TTL purely so another
 * module could reach into this one's storage, which is not a boundary worth
 * having.
 */
const HOME_GEO_CACHE_KEY = 'homeGeoCounts_v1';
const HOME_GEO_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetch_country_node_counts() {
  // Reuse the full rankings cache if available (populated by gamification tab)
  try {
    const raw = sessionStorage.getItem(GLOBAL_RANKINGS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GLOBAL_RANKINGS_CACHE_TTL) {
        return _extract_country_counts(cached.data.countryTierCounts);
      }
    }
  } catch {}

  // Check lightweight geo cache
  try {
    const raw = sessionStorage.getItem(HOME_GEO_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < HOME_GEO_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    const json = { data: await fetch_node_geolocation() };
    const countryMap = {};
    for (const entry of json.data || []) {
      const geo = entry.geolocation;
      if (!geo) continue;
      const cc = geo.countryCode || geo.country_code;
      if (!cc) continue;
      if (!countryMap[cc]) countryMap[cc] = { country: geo.country || cc, countryCode: cc, nodeCount: 0 };
      countryMap[cc].nodeCount++;
    }
    const data = Object.values(countryMap).sort((a, b) => b.nodeCount - a.nodeCount);
    try {
      sessionStorage.setItem(HOME_GEO_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      console.warn('[Geo] Cache write failed:', e?.message);
    }
    return data;
  } catch {
    return [];
  }
}

export function _extract_country_counts(countryTierCounts) {
  if (!countryTierCounts) return [];
  return Object.entries(countryTierCounts)
    .map(([countryCode, { country, tiers }]) => ({
      country,
      countryCode,
      nodeCount: Object.values(tiers).reduce((sum, c) => sum + c, 0),
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}

// ── GPU Prices (FluxAI) ──────────────────────────────────────────────────────

