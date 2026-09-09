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
 *  1. CUMULUS_EPS_RANKINGS has only 19 entries (node19 is deliberately
 *     omitted to simulate an unbenchmarked node), so node18 (value=1, the
 *     lowest value present) sorts to rank 19, not rank 20. The brief's dead-
 *     last test comment/assertion assumed rank 20 of 20; the CURRENT code
 *     computes rank 19 of 20 (rank from the 19-entry benchmark array, total
 *     displayed from officialNodeCounts=20).
 *  2. TIER_DISPLAY (in achievements.js) maps 'CUMULUS' -> 'Cumulus' (title
 *     case), not 'CUMULUS' (upper case), for every tier label used in
 *     user-facing strings (progressLabel/description). The brief's literal
 *     string assertions used 'CUMULUS' verbatim; the CURRENT code renders
 *     'Cumulus'. Corrected below to match the real rendered output.
 */

// A small CUMULUS tier: 20 nodes total, values chosen so every case below
// (clear win, clear loss, exact tie, offline/unbenchmarked node, dead-last,
// top-5%-boundary) is deliberately reachable.
//
// eps values, index 0..18: node0 is the clear #1 (100), node1 ties node2 at
// 50 (tie case — node1 appears first in this array, so under the current
// stable-sort behavior node1 must rank ABOVE node2 on a tie), nodes 3..17
// descend from 45 to 3, node18 is the clear last (1), node19 has NO
// benchmark entry at all (simulates an offline/unbenchmarked node — must
// be absent from tierRankings.CUMULUS.eps entirely, not present with a 0).
function buildCumulusTierRankings() {
  const values = [100, 50, 50, 45, 42, 39, 36, 33, 30, 27, 24, 21, 18, 15, 12, 9, 7, 5, 1];
  // node19 deliberately omitted — it exists in walletNodes but never appears here.
  const sorted = values
    .map((v, i) => ({ ip: `10.0.0.${i}`, value: v }))
    .sort((a, b) => b.value - a.value); // stable: node1 (index1) stays before node2 (index2) on the tie
  return sorted.map((n, i) => ({ ip: n.ip, rank: i + 1, value: n.value }));
}

const CUMULUS_EPS_RANKINGS = buildCumulusTierRankings();
// Verified by hand and with a standalone Node script running the identical
// sort/map logic (Array.prototype.sort is stable per spec since ES2019, and
// this repo's benchmarked V8/Node confirms it): the resulting array has 19
// entries (ranks 1..19). Index 1 (ip 10.0.0.1, value 50) lands at rank 2 and
// index 2 (ip 10.0.0.2, value 50) lands at rank 3 — i.e. the first-appearing
// node of a tie wins the better rank, exactly as the brief describes for the
// tie case. Index 18 (ip 10.0.0.18, value 1) lands at rank 19 (dead last of
// the 19-entry benchmarked pool), NOT rank 20 — see file-level comment above.

// dws/down_speed/up_speed: reuse the same shape so tests can pick whichever
// metric is convenient — only `eps` needs the carefully-tuned tie/edge values.
const FLAT_RANKINGS = (n) =>
  Array.from({ length: 20 }, (_, i) => ({ ip: `10.0.0.${i}`, rank: i + 1, value: n - i }));

const TIER_RANKINGS = {
  CUMULUS: {
    eps: CUMULUS_EPS_RANKINGS,
    dws: FLAT_RANKINGS(200),
    down_speed: FLAT_RANKINGS(300),
    up_speed: FLAT_RANKINGS(400),
  },
};

const OFFICIAL_NODE_COUNTS = { CUMULUS: 20 };

function walletNode(ip, tier = 'CUMULUS') {
  return { ip_full: { host: ip }, ip_display: ip, tier };
}

describe('computeTierPerformanceAchievements (characterization — current behavior)', () => {
  it('awards gold to the node ranked #1', () => {
    const wallet = [walletNode('10.0.0.0')]; // eps=100, rank 1
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const gold = results.find((r) => r.id === 'global_CUMULUS_eps_gold');
    expect(gold.earned).toBe(true);
    // CORRECTED vs brief: TIER_DISPLAY.CUMULUS = 'Cumulus' (title case), not 'CUMULUS'.
    expect(gold.progressLabel).toBe('Global rank #1 of 20 Cumulus nodes');
  });

  it('does not award any medal to a node far from the top', () => {
    const wallet = [walletNode('10.0.0.10')]; // eps=24, rank 11
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const medals = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(medals.every((m) => !m.earned)).toBe(true);
  });

  it('breaks a tie the same way the current stable-sort ranking does — first-appearing node wins the better rank', () => {
    // node at array index 1 (ip 10.0.0.1, eps=50) must rank ABOVE node at index 2 (10.0.0.2, eps=50)
    const walletA = [walletNode('10.0.0.1')];
    const walletB = [walletNode('10.0.0.2')];
    const resultsA = computeTierPerformanceAchievements(walletA, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const resultsB = computeTierPerformanceAchievements(walletB, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const silverA = resultsA.find((r) => r.id === 'global_CUMULUS_eps_silver');
    const silverB = resultsB.find((r) => r.id === 'global_CUMULUS_eps_silver');
    expect(silverA.earned).toBe(true);  // rank 2
    expect(silverB.earned).toBe(false); // rank 3, not silver
  });

  it('omits a node with no benchmark entry from the rankings entirely (not present, not rank 0)', () => {
    const wallet = [walletNode('10.0.0.19')]; // never appears in CUMULUS_EPS_RANKINGS
    const results = computeTierPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const eps = results.filter((r) => r.id.startsWith('global_CUMULUS_eps_'));
    expect(eps.every((m) => !m.earned)).toBe(true);
    // CORRECTED vs brief: TIER_DISPLAY.CUMULUS = 'Cumulus' (title case), not 'CUMULUS'.
    expect(eps[0].description).toBe('No Cumulus nodes with benchmark data found');
  });
});

describe('computeTierWorstPerformanceAchievements / computeWoodenSpoonAchievements (characterization)', () => {
  it('awards Potato (dead last) only to the true last-ranked node, using the TRUE total, not a trimmed approximation', () => {
    // 10.0.0.18 is eps rank 19 of 19 benchmarked CUMULUS nodes (node19 is
    // deliberately unbenchmarked, so the eps array itself has 19 entries) —
    // the actual last position in the benchmark pool.
    const wallet = [walletNode('10.0.0.18')];
    const worst = computeTierWorstPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    const potato = worst.find((r) => r.id === 'slow_CUMULUS_potato');
    expect(potato.earned).toBe(true);
    const spoon = computeWoodenSpoonAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(true);
    // CORRECTED vs brief: rank is #19 (of the 19-entry benchmark array), not
    // #20 — the display total (20) comes from officialNodeCounts and is a
    // separate number from the rank, which is computed against the 19-entry
    // eps array. Tier label is 'Cumulus' (title case), not 'CUMULUS'.
    expect(spoon.progressLabel).toBe('Rank #19 of 20 Cumulus nodes · EPS');
  });

  it('does not award Potato/Wooden Spoon to a node one place off last', () => {
    const wallet = [walletNode('10.0.0.17')]; // eps rank 18 of 19 — not dead last
    const worst = computeTierWorstPerformanceAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS);
    expect(worst.find((r) => r.id === 'slow_CUMULUS_potato').earned).toBe(false);
    const spoon = computeWoodenSpoonAchievements(wallet, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'wooden_spoon_CUMULUS_eps');
    expect(spoon.earned).toBe(false);
  });
});

describe('computeTryHardAchievements (characterization — top-5%-of-19-benchmarked = rank 1)', () => {
  it('Math.ceil(19 * 0.05) = 1, so only rank 1 qualifies for this fixture\'s benchmarked pool', () => {
    const walletRank1 = [walletNode('10.0.0.0')];
    const walletRank2 = [walletNode('10.0.0.1')];
    const r1 = computeTryHardAchievements(walletRank1, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r2 = computeTryHardAchievements(walletRank2, TIER_RANKINGS, OFFICIAL_NODE_COUNTS)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r1.earned).toBe(true);
    expect(r2.earned).toBe(false);
  });

  it('with a larger pool (200 nodes), top 5% is rank 10 — reachable well beyond any small fixed top-N', () => {
    const bigRankings = {
      CUMULUS: { eps: Array.from({ length: 200 }, (_, i) => ({ ip: `10.0.1.${i}`, rank: i + 1, value: 200 - i })) },
    };
    const officialCounts = { CUMULUS: 200 };
    const walletRank10 = [walletNode('10.0.1.9')]; // rank 10
    const walletRank11 = [walletNode('10.0.1.10')]; // rank 11
    const r10 = computeTryHardAchievements(walletRank10, bigRankings, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    const r11 = computeTryHardAchievements(walletRank11, bigRankings, officialCounts)
      .find((r) => r.id === 'try_hard_CUMULUS_eps');
    expect(r10.earned).toBe(true);
    expect(r11.earned).toBe(false);
  });
});

describe('computeCountryPerformanceAchievements (characterization)', () => {
  const countryRankings = {
    US: {
      country: 'United States',
      tiers: {
        CUMULUS: { metrics: { eps: [
          { ip: '10.0.0.0', rank: 1, value: 100 },
          { ip: '10.0.0.1', rank: 2, value: 50 },
          { ip: '10.0.0.2', rank: 3, value: 10 },
        ] } },
      },
    },
  };
  const nodeGeoMap = { '10.0.0.0': { countryCode: 'US' }, '10.0.0.1': { countryCode: 'US' }, '10.0.0.2': { countryCode: 'US' } };

  it('awards a country medal using the country-scoped total (3), not the network total', () => {
    const wallet = [walletNode('10.0.0.0')];
    const results = computeCountryPerformanceAchievements(wallet, countryRankings, nodeGeoMap);
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
  const nodeGeoMap = {
    '10.0.0.0': { countryCode: 'US', country: 'United States' },
    '10.0.0.1': { countryCode: 'US', country: 'United States' },
  };

  it('awards Dictator when the wallet node count meets or exceeds the leader count', () => {
    const globalRankings = { countryDominance: { US: { leaderCount: 2 } }, nodeGeoMap };
    const wallet = [walletNode('10.0.0.0'), walletNode('10.0.0.1')];
    const results = computeDictatorAchievements(wallet, globalRankings);
    const dictator = results.find((r) => r.id === 'dictator_US');
    expect(dictator.earned).toBe(true);
    expect(dictator.progressLabel).toBe('2 / 2 nodes in United States');
  });

  it('does not award Dictator when the wallet node count is below the leader count', () => {
    const globalRankings = { countryDominance: { US: { leaderCount: 3 } }, nodeGeoMap };
    const wallet = [walletNode('10.0.0.0')];
    const results = computeDictatorAchievements(wallet, globalRankings);
    const dictator = results.find((r) => r.id === 'dictator_US');
    expect(dictator.earned).toBe(false);
  });
});
