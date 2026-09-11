import {
  computeTierPerformanceAchievements,
  computeCountryPerformanceAchievements,
  computeTierWorstPerformanceAchievements,
  computeWoodenSpoonAchievements,
  computeTryHardAchievements,
  computeDictatorAchievements,
} from './achievements';

/*
 * Characterization tests for achievements.js's dynamic (network-ranking-based)
 * achievement functions — established BEFORE the globalPerfRankings redesign
 * (issue #153 / Tasks 2-5) so that redesign can be proven behavior-preserving
 * instead of assumed to be. achievements.js had zero test coverage before this.
 *
 * IMPORTANT — fixture verification note:
 * The task brief this file was derived from hand-computed a couple of expected
 * values that do not match the CURRENT code when traced by hand (confirmed with
 * a standalone Node script reproducing the exact sort/rank algorithm from
 * apidata.js's fetch_global_performance_rankings). Both are corrected below,
 * not silently — see the two comments marked "CORRECTED vs brief":
 *
 *  1. The CUMULUS nodeData fixture has only 19 entries (node19 is deliberately
 *     omitted to simulate an unbenchmarked node), so node18 (value=1, the
 *     lowest value present) ranks 19, not rank 20. The brief's dead-
 *     last test comment/assertion assumed rank 20 of 20; the CURRENT code
 *     computes rank 19 of 20 (rank from the 19-node benchmarked pool, total
 *     displayed from officialNodeCounts=20).
 *  2. TIER_DISPLAY (in achievements.js) maps 'CUMULUS' -> 'Cumulus' (title
 *     case), not 'CUMULUS' (upper case), for every tier label used in
 *     user-facing strings (progressLabel/description). The brief's literal
 *     string assertions used 'CUMULUS' verbatim; the CURRENT code renders
 *     'Cumulus'. Corrected below to match the real rendered output.
 *
 * ── TASK 4 FIXTURE-SHAPE MIGRATION ─────────────────────────────────────────
 * Task 4 (issue #153) moved achievements.js's ranking functions from
 * consuming pre-sorted per-metric arrays (`tierRankings`/`countryRankings`)
 * to a flat `nodeData` array (`{ip, tier, eps, dws, down_speed, up_speed,
 * geo}`, one entry per benchmarked node) ranked on demand via
 * rankInGroup()/topInGroup() (Task 2). This file's FIXTURE SETUP below was
 * reshaped accordingly — every expected value in every `expect(...)` call
 * is UNCHANGED from before this migration; only the shape of the input data
 * that produces those values changed.
 *
 * Reshaping note: the old fixture built 4 SEPARATE per-metric arrays for
 * the CUMULUS tier (eps had 19 entries — node19 omitted to model an
 * unbenchmarked node — while dws/down_speed/up_speed had 20, via
 * FLAT_RANKINGS). A flat nodeData array can't represent "this node is
 * benchmarked for dws but not eps" (one entry per node, not per metric) —
 * so node19 is simply omitted from nodeData entirely (unbenchmarked for
 * every metric). No existing test asserted anything about node19's
 * dws/down_speed/up_speed standing, so this is a safe, behavior-preserving
 * collapse: CUMULUS_NODE_DATA below has exactly 19 entries, and every
 * tier-level total (`groupNodes.length` in achievements.js) that used to
 * come from a metric-specific array's `.length` now comes from this same
 * 19-node pool for every metric alike, which is what the old fixture's eps
 * arithmetic already assumed for every rank/percentage computed below.
 */

// A small CUMULUS tier: 19 benchmarked nodes (node19 deliberately omitted
// entirely, to model an unbenchmarked/offline node — see migration note
// above), values chosen so every case below (clear win, clear loss, exact
// tie, offline/unbenchmarked node, dead-last, top-5%-boundary) is
// deliberately reachable.
//
// eps values, index 0..18: node0 is the clear #1 (100), node1 ties node2 at
// 50 (tie case — node1 appears first in this array, so under rankInGroup's
// stable-sort-equivalent tie-break node1 must rank ABOVE node2 on a tie),
// nodes 3..17 descend from 45 to 5, node18 is the clear last (1). The array
// is already in non-increasing eps order (matching the OLD fixture's
// post-sort order exactly, since sorting an already-sorted array changes
// nothing), so building nodeData directly in this index order reproduces
// identical ranks to the old buildCumulusTierRankings()/sort step —
// rankInGroup's tie-break is array-index-based, same as the old stable sort.
//
// dws/down_speed/up_speed reuse the old FLAT_RANKINGS(n) shape's per-index
// formula (n - i) truncated to these same 19 nodes — no test asserts on
// their values directly, they just need to exist so every metric in
// PERF_METRICS has real numbers to rank.
const CUMULUS_EPS_VALUES = [100, 50, 50, 45, 42, 39, 36, 33, 30, 27, 24, 21, 18, 15, 12, 9, 7, 5, 1];

const CUMULUS_NODE_DATA = CUMULUS_EPS_VALUES.map((eps, i) => ({
  ip: `10.0.0.${i}`,
  tier: 'CUMULUS',
  eps,
  dws: 200 - i,
  down_speed: 300 - i,
  up_speed: 400 - i,
  cc: null,
}));
// Verified by hand: eps rank for node i (0-indexed) = 1 + count of nodes with
// strictly greater eps, plus (for a tie) count of earlier-indexed nodes with
// an equal eps. node0 (100) -> rank 1. node1 (50, tie w/ node2, earlier index)
// -> rank 2. node2 (50, tie w/ node1, later index) -> rank 3. nodes 3..18
// have unique descending values -> rank = index + 1 (ranks 4..19). node18
// (value=1) lands at rank 19 (dead last of the 19-node benchmarked pool),
// NOT rank 20 — see file-level comment above. node19 has no entry at all —
// rankInGroup returns null for it, matching the old .find()-returns-
// undefined "not present, not rank 0" behavior.

const OFFICIAL_NODE_COUNTS = { CUMULUS: 20 };

function walletNode(ip, tier = 'CUMULUS') {
  return { ip_full: { host: ip }, ip_display: ip, tier };
}

describe('computeTierPerformanceAchievements (characterization — current behavior)', () => {
  it('awards gold to the node ranked #1', () => {
    const wallet = [walletNode('10.0.0.0')]; // eps=100, rank 1
    const results = computeTierPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const gold = results.find((r) => r.id === 'global_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    // CORRECTED vs brief: TIER_DISPLAY.CUMULUS = 'Cumulus' (title case), not 'CUMULUS'.
    expect(gold.progressLabel).toBe('Global rank #1 of 20 Cumulus nodes');
  });

  it('does not award any medal to a node far from the top', () => {
    const wallet = [walletNode('10.0.0.10')]; // eps=24, rank 11
    const results = computeTierPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const medals = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(medals.every((m) => !m.earned)).toBe(true);
    // progress (achievements.js:185-188): bestRank=11, totalInTier=20 (from
    // OFFICIAL_NODE_COUNTS.CUMULUS) →
    // (1 - (11-1)/20) * 100 = (1 - 0.5) * 100 = 50
    const gold = medals.find((m) => m.id === 'global_CUMULUS_eps_gold');
    expect(gold.progress).toBe(50);
  });

  it('breaks a tie the same way the current stable-sort ranking does — first-appearing node wins the better rank', () => {
    // node at array index 1 (ip 10.0.0.1, eps=50) must rank ABOVE node at index 2 (10.0.0.2, eps=50)
    const walletA = [walletNode('10.0.0.1')];
    const walletB = [walletNode('10.0.0.2')];
    const resultsA = computeTierPerformanceAchievements(walletA, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const resultsB = computeTierPerformanceAchievements(walletB, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const silverA = resultsA.find((r) => r.id === 'global_CUMULUS_eps_silver');
    const silverB = resultsB.find((r) => r.id === 'global_CUMULUS_eps_silver');
    expect(silverA.earned).toBe(true);  // rank 2
    expect(silverB.earned).toBe(false); // rank 3, not silver
  });

  it('omits a node with no benchmark entry from the rankings entirely (not present, not rank 0)', () => {
    const wallet = [walletNode('10.0.0.19')]; // never appears in CUMULUS_NODE_DATA
    const results = computeTierPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const eps = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(eps.every((m) => !m.earned)).toBe(true);
    // CORRECTED vs brief: TIER_DISPLAY.CUMULUS = 'Cumulus' (title case), not 'CUMULUS'.
    expect(eps[0].description).toBe('No Cumulus nodes with benchmark data found');
  });

  it('falls back to the benchmarked-node count when officialNodeCounts is missing (achievements.js:158)', () => {
    // officialNodeCounts?.[tier] || groupNodes.length — omit officialNodeCounts
    // entirely so totalInTier must come from CUMULUS_NODE_DATA.length (19),
    // NOT OFFICIAL_NODE_COUNTS.CUMULUS (20), proving the fallback branch ran.
    const wallet = [walletNode('10.0.0.0')]; // eps rank 1
    const results = computeTierPerformanceAchievements(wallet, CUMULUS_NODE_DATA, undefined);
    const gold = results.find((r) => r.id === 'global_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    expect(gold.progressLabel).toBe('Global rank #1 of 19 Cumulus nodes');
  });
});

describe('computeTierWorstPerformanceAchievements / computeWoodenSpoonAchievements (characterization)', () => {
  it('awards Potato (dead last) to the true last-ranked node — earned boundary checked against the benchmarked count (metricTotal), not the true/official count (only the display string uses that)', () => {
    // 10.0.0.18 is eps rank 19 of 19 benchmarked CUMULUS nodes (node19 is
    // deliberately unbenchmarked, so nodeData itself has 19 CUMULUS entries) —
    // the actual last position in the benchmark pool.
    const wallet = [walletNode('10.0.0.18')];
    const worst = computeTierWorstPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    const potato = worst.find((r) => r.id === 'slow_CUMULUS_potato');
    expect(potato.earned).toBe(true);
    // progress (achievements.js:328): Math.min(100, rank / metricTotal * 100)
    // = Math.min(100, 19 / 19 * 100) = 100
    expect(potato.progress).toBe(100);
    const spoon = computeWoodenSpoonAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(true);
    // progress (achievements.js:404): Math.max(0, Math.min(100, worstRank /
    // groupNodes.length * 100)) = Math.min(100, 19 / 19 * 100) = 100
    expect(spoon.progress).toBe(100);
    // CORRECTED vs brief: rank is #19 (of the 19-node benchmark pool), not
    // #20 — the display total (20) comes from officialNodeCounts and is a
    // separate number from the rank, which is computed against the 19-node
    // nodeData pool. Tier label is 'Cumulus' (title case), not 'CUMULUS'.
    expect(spoon.progressLabel).toBe('Rank #19 of 20 Cumulus nodes · EPS');
  });

  it('does not award Potato/Wooden Spoon to a node one place off last', () => {
    const wallet = [walletNode('10.0.0.17')]; // eps rank 18 of 19 — not dead last
    const worst = computeTierWorstPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_potato').earned).toBe(false);
    const spoon = computeWoodenSpoonAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(false);
  });

  // ── Tortoise / Toaster levels (achievements.js:332-349) — the existing
  // tests above only ever exercise the Potato (dead-last) level. rank/
  // metricTotal for this fixture's eps pool: 10.0.0.16 -> rank 17,
  // 10.0.0.17 -> rank 18, 10.0.0.18 -> rank 19, metricTotal = 19 (verified
  // by hand against CUMULUS_NODE_DATA's ranking above).
  //
  // Thresholds (achievements.js:334, :344): tortoise earned when
  // rank > metricTotal * 0.90 = 17.1; toaster earned when
  // rank > metricTotal * 0.75 = 14.25.
  it('rank 18 of 19 (10.0.0.17): Tortoise is earned but Potato is not (18 > 17.1 but 18 < 19)', () => {
    const wallet = [walletNode('10.0.0.17')];
    const worst = computeTierWorstPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_potato').earned).toBe(false);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_tortoise').earned).toBe(true);
  });

  it('rank 17 of 19 (10.0.0.16): Toaster is earned but Tortoise is not (17 > 14.25 but 17 < 17.1)', () => {
    const wallet = [walletNode('10.0.0.16')];
    const worst = computeTierWorstPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_tortoise').earned).toBe(false);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_toaster').earned).toBe(true);

    // pctFromBottom (achievements.js:317):
    // ((metricTotal - rank + 1) / metricTotal * 100).toFixed(1)
    // = ((19 - 17 + 1) / 19 * 100).toFixed(1) = (3 / 19 * 100).toFixed(1)
    // = (15.789473...).toFixed(1) = '15.8'
    // progressLabel (achievements.js:366):
    // `Bottom ${pctFromBottom}% of ${displayTotal} ${tierLabel} nodes · ${metricLabel}`
    // displayTotal = officialNodeCounts.CUMULUS.toLocaleString() = '20'
    const toaster = worst.find((r) => r.id === 'slow_CUMULUS_toaster');
    expect(toaster.progressLabel).toBe('Bottom 15.8% of 20 Cumulus nodes · EPS');
  });

  it('rank 1 of 19 (10.0.0.0): none of Potato/Tortoise/Toaster are earned — comfortably not near the bottom', () => {
    const wallet = [walletNode('10.0.0.0')];
    const worst = computeTierWorstPerformanceAchievements(wallet, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_potato').earned).toBe(false);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_tortoise').earned).toBe(false);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_toaster').earned).toBe(false);
  });
});

describe('computeTryHardAchievements (characterization — top-5%-of-19-benchmarked = rank 1)', () => {
  it('Math.ceil(19 * 0.05) = 1, so only rank 1 qualifies for this fixture\'s benchmarked pool', () => {
    const walletRank1 = [walletNode('10.0.0.0')];
    const walletRank2 = [walletNode('10.0.0.1')];
    const r1 = computeTryHardAchievements(walletRank1, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r2 = computeTryHardAchievements(walletRank2, CUMULUS_NODE_DATA, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r1.earned).toBe(true);
    expect(r2.earned).toBe(false);
    // progress (achievements.js:445): Math.max(0, Math.min(100,
    //   (1 - (bestRank - 1) / Math.max(topFivePctThreshold, 1)) * 100))
    // topFivePctThreshold = Math.ceil(19 * 0.05) = 1
    // r1: bestRank=1 -> (1 - 0/1) * 100 = 100
    // r2: bestRank=2 -> (1 - 1/1) * 100 = 0
    expect(r1.progress).toBe(100);
    expect(r2.progress).toBe(0);
  });

  it('with a larger pool (200 nodes), top 5% is rank 10 — reachable well beyond any small fixed top-N', () => {
    const bigNodeData = Array.from({ length: 200 }, (_, i) => ({
      ip: `10.0.1.${i}`,
      tier: 'CUMULUS',
      eps: 200 - i,
    }));
    const officialCounts = { CUMULUS: 200 };
    const walletRank10 = [walletNode('10.0.1.9')]; // rank 10
    const walletRank11 = [walletNode('10.0.1.10')]; // rank 11
    const r10 = computeTryHardAchievements(walletRank10, bigNodeData, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r11 = computeTryHardAchievements(walletRank11, bigNodeData, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r10.earned).toBe(true);
    expect(r11.earned).toBe(false);
  });
});

describe('computeCountryPerformanceAchievements (characterization)', () => {
  // Reshaped from the old countryRankings-shaped fixture into flat nodeData:
  // 3 CUMULUS nodes, all geo-tagged US, eps 100/50/10 (ranks 1/2/3).
  const countryNodeData = [
    { ip: '10.0.0.0', tier: 'CUMULUS', eps: 100, cc: 'US' },
    { ip: '10.0.0.1', tier: 'CUMULUS', eps: 50, cc: 'US' },
    { ip: '10.0.0.2', tier: 'CUMULUS', eps: 10, cc: 'US' },
  ];
  // nodeGeoMap must carry `.country` (display name) too — achievements.js's
  // computeCountryPerformanceAchievements looks up the country's display
  // name via Object.values(nodeGeoMap).find(g => g.countryCode === cc)?.country
  // (chosen over threading in countryTierCounts as an extra parameter, since
  // nodeGeoMap is already part of this function's signature — keeps the
  // parameter list the same size it was before this migration).
  const nodeGeoMap = {
    '10.0.0.0': { countryCode: 'US', country: 'United States' },
    '10.0.0.1': { countryCode: 'US', country: 'United States' },
    '10.0.0.2': { countryCode: 'US', country: 'United States' },
  };

  it('awards a country medal using the country-scoped total (3), not the network total', () => {
    const wallet = [walletNode('10.0.0.0')];
    const results = computeCountryPerformanceAchievements(wallet, countryNodeData, nodeGeoMap);
    const gold = results.find((r) => r.id === 'country_US_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    // CORRECTED vs brief: TIER_DISPLAY.CUMULUS = 'Cumulus' (title case), not 'CUMULUS'.
    expect(gold.description).toContain('among all 3 Cumulus nodes in United States');
  });
});

describe('computeDictatorAchievements (characterization)', () => {
  // Not covered by explicit test code in the brief, but the task requires
  // coverage for all 6 dynamic ranking functions — this one ranks a wallet's
  // node count in a country against the country's current leader count.
  // computeDictatorAchievements is UNCHANGED by Task 4 (it never used
  // tierRankings/countryRankings, only countryDominance/nodeGeoMap, both
  // untouched by Task 3) — no fixture reshaping needed here.
  const nodeGeoMap = {
    '10.0.0.0': { countryCode: 'US', country: 'United States' },
    '10.0.0.1': { countryCode: 'US', country: 'United States' },
  };

  it('awards Dictator when the wallet node count meets or exceeds the leader count', () => {
    // countryDominance[cc] shape per apidata.js:1179 is { leaderCount, country }.
    const globalRankings = { countryDominance: { US: { leaderCount: 2, country: 'United States' } }, nodeGeoMap };
    const wallet = [walletNode('10.0.0.0'), walletNode('10.0.0.1')];
    const results = computeDictatorAchievements(wallet, globalRankings);
    const dictator = results.find((r) => r.id === 'dictator_US');
    expect(dictator.earned).toBe(true);
    expect(dictator.progressLabel).toBe('2 / 2 nodes in United States');
  });

  it('does not award Dictator when the wallet node count is below the leader count', () => {
    // countryDominance[cc] shape per apidata.js:1179 is { leaderCount, country }.
    const globalRankings = { countryDominance: { US: { leaderCount: 3, country: 'United States' } }, nodeGeoMap };
    const wallet = [walletNode('10.0.0.0')];
    const results = computeDictatorAchievements(wallet, globalRankings);
    const dictator = results.find((r) => r.id === 'dictator_US');
    expect(dictator.earned).toBe(false);
  });
});
