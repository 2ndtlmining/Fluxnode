import { FaStar, FaGamepad, FaTrophy, FaGlobe, FaMedal, FaFire, FaSnowflake, FaLeaf, FaCrown, FaRocket, FaSeedling, FaNetworkWired, FaFlag, FaFeather, FaCouch, FaCoffee, FaPizzaSlice, FaSyncAlt, FaHourglassHalf, FaUtensilSpoon, FaDumbbell, FaBaby, FaMoneyBillWave, FaLayerGroup, FaHeartbeat } from 'react-icons/fa';
import { FiServer, FiZap, FiCpu, FiDatabase, FiAward, FiLink, FiBox, FiShield, FiActivity, FiLayers } from 'react-icons/fi';
import { GiToaster, GiTortoise, GiCastle, GiOilPump, GiSpermWhale, GiPlasticDuck, GiSwan, GiPotato, GiHeartBeats, GiSloth, GiRetroController, GiNestBirds } from 'react-icons/gi';
import { TbBuildingSkyscraper, TbActivityHeartbeat, TbBrowser } from 'react-icons/tb';
import { categorizeApp } from './appCategories';
import { fv_compare } from 'main/flux_version';

export const TIER = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
};

const SECONDS_PER_DAY = 86400;

function def(id, name, description, hint, Icon, tier, category) {
  return { id, name, description, hint, Icon, tier, category };
}

// ── Static achievement definitions ────────────────────────────────────────────
// (Performance medals are computed dynamically from global network rankings)

export const ACHIEVEMENT_DEFS = [
  // Node count
  def('first_node', 'First Steps', 'Own your first Flux node', 'Run your first node', FaBaby, TIER.BRONZE, 'nodes'),
  def('node_five', 'Node Operator', 'Own 5 or more Flux nodes', 'Reach 5 nodes', FiServer, TIER.BRONZE, 'nodes'),
  def('node_ten', 'Node Baron', 'Own 10 or more Flux nodes', 'Reach 10 nodes', GiOilPump, TIER.SILVER, 'nodes'),
  def('node_twentyfive', 'Node Lord', 'Own 25 or more Flux nodes', 'Reach 25 nodes', GiCastle, TIER.SILVER, 'nodes'),
  def('node_fifty', 'Node Titan', 'Own 50 or more Flux nodes', 'Reach 50 nodes', TbBuildingSkyscraper, TIER.GOLD, 'nodes'),
  def('node_hundred', 'Network Pillar', 'Own 100 or more Flux nodes', 'Reach 100 nodes', FaNetworkWired, TIER.PLATINUM, 'nodes'),
  // Tiers
  def('all_tiers', 'Tri-Tier Operator', 'Own nodes in all three tiers: Cumulus, Nimbus, and Stratus', 'Own nodes in all 3 tiers', FaLayerGroup, TIER.SILVER, 'nodes'),
  def('stratus_elite', 'Stratus Elite', 'Own at least one Stratus node', 'Own a Stratus node', FaCrown, TIER.GOLD, 'nodes'),
  // Network / wallet
  def('rich_list', 'Top Wallet', 'Your wallet appears in the Flux rich list', 'Make the Flux rich list', GiSpermWhale, TIER.GOLD, 'network'),
  def('donor', 'Coffee Sponsor', 'You bought the developer a coffee! Your donation helps keep FluxNode running and improving.', 'Make a donation to support FluxNode development', FaCoffee, TIER.BRONZE, 'network'),
  def('super_donor', 'Pizza Patron', "Five donations in — you've kept the developer fed! Your continued support helps fund new features and improvements.", 'Donate 5 times to support FluxNode development', FaPizzaSlice, TIER.SILVER, 'network'),
  def('sugar_daddy', 'Sugar Daddy', "50 donations — you've basically put the developer's kids through college! Truly legendary support.", 'Donate 50 times to support FluxNode development', FaMoneyBillWave, TIER.GOLD, 'network'),
  // Uptime
  def('best_uptime_30d', 'Always On (30d)', 'Best node uptime of at least 30 days', 'Keep a node up for 30 days', FaHeartbeat, TIER.BRONZE, 'performance'),
  def('best_uptime_180d', 'Iron Node (180d)', 'Best node uptime of at least 180 days', 'Keep a node up for 180 days', TbActivityHeartbeat, TIER.SILVER, 'performance'),
  def('best_uptime_365d', 'Legendary Uptime', 'Best node uptime of at least 365 days', 'Keep a node up for 365 days', GiHeartBeats, TIER.GOLD, 'performance'),
  // Benchmarks
  def('all_benchmarks_pass', 'Certified Fleet', 'All your nodes have passed benchmarks', 'Get all nodes to pass benchmarks', FiShield, TIER.SILVER, 'performance'),
  def('all_versions_current', 'Chronically Current', "Every node in your fleet is running the latest Flux OS and benchmark versions. You're always first in line for updates!", 'Keep all your online nodes on the latest Flux OS and benchmark versions', FaSyncAlt, TIER.GOLD, 'performance'),
  def('has_outdated_version', 'Professional Dawdler', 'At least one of your nodes is running an outdated version.', 'Have at least one online node running an outdated Flux OS or benchmark version', GiSloth, TIER.BRONZE, 'performance'),
  // Apps
  def('hosts_gaming', 'Game Server Host', 'Host at least one gaming application', 'Host a gaming app', FaGamepad, TIER.BRONZE, 'apps'),
  def('hosts_multiple_gaming', 'LAN Party', 'Host 3 or more different gaming apps', 'Host 3 different gaming apps', GiRetroController, TIER.SILVER, 'apps'),
  def('hosts_web', 'Web Host', 'Host a web or CMS application', 'Host a web app', TbBrowser, TIER.BRONZE, 'apps'),
  def('hosts_blockchain', 'Chain Validator', 'Host a blockchain node application', 'Host a blockchain app', FiLink, TIER.SILVER, 'apps'),
  def('app_diversity', 'Diverse Host', 'Host applications in 4 or more categories', 'Host apps in 4+ categories', FiBox, TIER.GOLD, 'apps'),
  def('most_apps', 'App Champion', 'Have a node hosting 10 or more apps', 'Get a node to 10+ apps', FiBox, TIER.SILVER, 'apps'),
  def('most_apps_mega', 'Mega Host', 'Have a node hosting 25 or more apps', 'Get a node to 25+ apps', FiBox, TIER.GOLD, 'apps'),
  // Fleet-wide total apps
  def('fleet_apps_10', 'App Farmer', 'Your fleet is collectively running 10 or more apps total', 'Run 10 apps across your fleet', FaSeedling, TIER.BRONZE, 'apps'),
  def('fleet_apps_50', 'App Mogul', 'Your fleet is collectively running 50 or more apps total', 'Run 50 apps across your fleet', FaFire, TIER.SILVER, 'apps'),
  def('fleet_apps_100', 'Hyperscaler', 'Your fleet is collectively running 100 or more apps total', 'Run 100 apps across your fleet', FaRocket, TIER.GOLD, 'apps'),
  // Geographic
  def('multi_national', 'Global Operator', 'Have nodes in 3 or more countries', 'Spread nodes to 3+ countries', FaGlobe, TIER.SILVER, 'geo'),
  def('continental', 'Continental', 'Have nodes on 2 or more continents', 'Span 2 continents', FaGlobe, TIER.SILVER, 'geo'),
  def('world_power', 'World Power', 'Have nodes on 4 or more continents', 'Span 4 continents', FaCrown, TIER.GOLD, 'geo'),
  def('home_nation', 'Local Champion', 'Have 5 or more nodes in the same country', 'Concentrate 5+ nodes in one country', FaFlag, TIER.BRONZE, 'geo'),
  // Ugly Duckling — nodes with no apps
  def('bare_one', 'Ugly Duckling', 'Have at least 1 node running with no applications installed', 'Run a node with no apps', GiPlasticDuck, TIER.BRONZE, 'nodes'),
  def('bare_five', 'Flock of Ducklings', 'Have at least 5 nodes running with no applications installed', 'Run 5 bare nodes', GiNestBirds, TIER.SILVER, 'nodes'),
  def('bare_ten', 'Swan Lake', 'Have at least 10 nodes running with no applications installed', 'Run 10 bare nodes', GiSwan, TIER.GOLD, 'nodes'),
  def('bare_all', 'Free Loader', 'Every single node in your fleet is running with no applications installed', 'Run your entire fleet with no apps at all', FaCouch, TIER.PLATINUM, 'nodes'),
];

// ── Performance metrics definition ────────────────────────────────────────────

const PERF_METRICS = [
  { key: 'eps', label: 'EPS', Icon: FiCpu, unit: '' },
  { key: 'dws', label: 'DWS', Icon: FiDatabase, unit: '' },
  { key: 'down_speed', label: 'Download', Icon: FiZap, unit: ' Mb/s' },
  { key: 'up_speed', label: 'Upload', Icon: FiZap, unit: ' Mb/s' },
];

const MEDAL_RANKS = [
  { rank: 1, tier: TIER.GOLD },
  { rank: 2, tier: TIER.SILVER },
  { rank: 3, tier: TIER.BRONZE },
];

const TIER_DISPLAY = { CUMULUS: 'Cumulus', NIMBUS: 'Nimbus', STRATUS: 'Stratus' };

// Find wallet's best global rank for (tier, metric) across all wallet nodes in that tier
function _bestRankInTier(walletTierNodes, metricRankings) {
  let bestRank = null;
  let bestIp = null;
  let bestValue = 0;
  let bestNodeDisplay = null;

  for (const node of walletTierNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const entry = metricRankings.find((r) => r.ip === ip);
    if (!entry) continue;
    if (bestRank === null || entry.rank < bestRank) {
      bestRank = entry.rank;
      bestIp = ip;
      bestValue = entry.value;
      bestNodeDisplay = node.ip_display;
    }
  }
  return { bestRank, bestIp, bestValue, bestNodeDisplay };
}

// Find wallet's WORST global rank for (tier, metric) — inverse of _bestRankInTier
function _worstRankInTier(walletTierNodes, metricRankings) {
  let worstRank = null;
  let worstValue = 0;
  let worstNodeDisplay = null;

  for (const node of walletTierNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const entry = metricRankings.find((r) => r.ip === ip);
    if (!entry) continue;
    if (worstRank === null || entry.rank > worstRank) {
      worstRank = entry.rank;
      worstValue = entry.value;
      worstNodeDisplay = node.ip_display;
    }
  }
  return { worstRank, worstValue, worstNodeDisplay };
}

// Find wallet's best rank in a country for a metric
function _bestRankInCountry(walletCountryNodes, metricRankings) {
  let bestRank = null;
  let bestValue = 0;
  let bestNodeDisplay = null;

  for (const node of walletCountryNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const entry = metricRankings.find((r) => r.ip === ip);
    if (!entry) continue;
    if (bestRank === null || entry.rank < bestRank) {
      bestRank = entry.rank;
      bestValue = entry.value;
      bestNodeDisplay = node.ip_display;
    }
  }
  return { bestRank, bestValue, bestNodeDisplay };
}

/**
 * Compute global tier performance achievements.
 * Only generated for tiers where the wallet has nodes.
 * officialNodeCounts comes from getzelnodecount (same source as dashboard header).
 */
function computeTierPerformanceAchievements(walletNodes, tierRankings, officialNodeCounts) {
  if (!tierRankings) return [];
  const results = [];

  for (const tier of ['CUMULUS', 'NIMBUS', 'STRATUS']) {
    const walletTierNodes = walletNodes.filter((n) => n.tier === tier);
    if (walletTierNodes.length === 0) continue;
    const rankings = tierRankings[tier];
    if (!rankings) continue;

    for (const metric of PERF_METRICS) {
      const metricRankings = rankings[metric.key] || [];
      if (metricRankings.length === 0) continue;

      // Use official enabled-node count from getzelnodecount to match dashboard header.
      // Fall back to benchmark array length if unavailable.
      const totalInTier = officialNodeCounts?.[tier] || metricRankings.length;

      const { bestRank, bestValue, bestNodeDisplay } = _bestRankInTier(
        walletTierNodes,
        metricRankings
      );

      for (const { rank: medalRank, tier: medalTier } of MEDAL_RANKS) {
        const earned = bestRank !== null && bestRank === medalRank;
        const tierLabel = TIER_DISPLAY[tier];
        const valueStr = bestValue > 0 ? bestValue.toFixed(2) + metric.unit : 'N/A';

        results.push({
          id: `global_${tier}_${metric.key}_${medalTier}`,
          name: `${tierLabel} ${metric.label} ${medalTier.charAt(0).toUpperCase() + medalTier.slice(1)}`,
          description: earned
            ? `Your node (${bestNodeDisplay}) is ranked #${medalRank} globally for ${metric.label} among all ${totalInTier.toLocaleString()} ${tierLabel} nodes! (${valueStr})`
            : bestRank !== null
            ? `Your best ${tierLabel} node ranks #${bestRank.toLocaleString()} of ${totalInTier.toLocaleString()} globally for ${metric.label} (${valueStr})`
            : `No ${tierLabel} nodes with benchmark data found`,
          hint: `Be ranked #${medalRank} globally for ${metric.label} among all ${tierLabel} nodes`,
          Icon: metric.Icon,
          tier: medalTier,
          category: 'performance',
          earned,
          progress:
            bestRank !== null
              ? Math.max(0, Math.min(100, (1 - (bestRank - 1) / Math.max(totalInTier, 1)) * 100))
              : 0,
          progressLabel:
            bestRank !== null
              ? `Global rank #${bestRank.toLocaleString()} of ${totalInTier.toLocaleString()} ${tierLabel} nodes`
              : 'No benchmark data',
        });
      }
    }
  }

  return results;
}

/**
 * Compute global per-country performance achievements.
 * ONLY generated for countries where the wallet has at least one node.
 */
function computeCountryPerformanceAchievements(walletNodes, countryRankings, nodeGeoMap) {
  if (!countryRankings || !nodeGeoMap) return [];
  const results = [];

  // Group wallet nodes by country AND tier — nodes only compete within their own tier per country
  const walletByCountryTier = new Map(); // `${cc}_${tier}` → { cc, tier, nodes[] }
  for (const node of walletNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const geo = nodeGeoMap[ip];
    if (!geo?.countryCode) continue;
    const cc = geo.countryCode;
    const tier = node.tier;
    if (!tier) continue;
    const key = `${cc}_${tier}`;
    if (!walletByCountryTier.has(key)) {
      walletByCountryTier.set(key, { cc, tier, nodes: [] });
    }
    walletByCountryTier.get(key).nodes.push(node);
  }

  for (const [, { cc, tier, nodes: walletCountryTierNodes }] of walletByCountryTier.entries()) {
    const countryData = countryRankings[cc];
    if (!countryData?.tiers) continue;
    const tierData = countryData.tiers[tier];
    if (!tierData) continue;

    const nodeTierLabel = TIER_DISPLAY[tier]; // e.g. 'Stratus'
    const country = countryData.country;

    for (const metric of PERF_METRICS) {
      const metricRankings = tierData.metrics[metric.key] || [];
      const totalInGroup = metricRankings.length;
      if (totalInGroup === 0) continue;

      const { bestRank, bestValue, bestNodeDisplay } = _bestRankInCountry(
        walletCountryTierNodes,
        metricRankings
      );
      if (bestRank === null) continue;

      const valueStr = bestValue > 0 ? bestValue.toFixed(2) + metric.unit : 'N/A';

      for (const { rank: medalRank, tier: medalTier } of MEDAL_RANKS) {
        const earned = bestRank === medalRank;
        const medalLabel = medalTier.charAt(0).toUpperCase() + medalTier.slice(1);

        results.push({
          id: `country_${cc}_${tier}_${metric.key}_${medalTier}`,
          name: `${country} ${nodeTierLabel} ${metric.label} ${medalLabel}`,
          countryCode: cc,
          description: earned
            ? `Your ${nodeTierLabel} node (${bestNodeDisplay}) has the #${medalRank} ${metric.label} score among all ${totalInGroup} ${nodeTierLabel} nodes in ${country}! (${valueStr})`
            : `Your best ${nodeTierLabel} node in ${country} ranks #${bestRank} of ${totalInGroup} ${nodeTierLabel} nodes for ${metric.label} (${valueStr})`,
          hint: `Be ranked #${medalRank} for ${metric.label} among all ${nodeTierLabel} nodes in ${country}`,
          Icon: metric.Icon,
          tier: medalTier,
          category: 'geo',
          earned,
          progress: Math.max(
            0,
            Math.min(100, (1 - (bestRank - 1) / Math.max(totalInGroup, 1)) * 100)
          ),
          progressLabel: `#${bestRank} of ${totalInGroup} ${nodeTierLabel} nodes in ${country}`,
        });
      }
    }
  }

  return results;
}

// ── Slowest-node (ironic) achievements ────────────────────────────────────────
// One set of 3 difficulty levels per tier — based on the wallet's WORST node
// across any metric. Thresholds use metricRankings.length (benchmarked nodes).

function computeTierWorstPerformanceAchievements(walletNodes, tierRankings, officialNodeCounts) {
  if (!tierRankings) return [];
  const results = [];

  for (const tier of ['CUMULUS', 'NIMBUS', 'STRATUS']) {
    const walletTierNodes = walletNodes.filter((n) => n.tier === tier);
    if (walletTierNodes.length === 0) continue;
    const rankings = tierRankings[tier];
    if (!rankings) continue;

    const tierLabel = TIER_DISPLAY[tier];

    // Find worst rank across ALL metrics — whichever metric gives the highest rank number
    let worst = null; // { rank, metricLabel, metricTotal, nodeDisplay, value, unit }

    for (const metric of PERF_METRICS) {
      const metricRankings = rankings[metric.key] || [];
      if (metricRankings.length === 0) continue;
      const { worstRank, worstValue, worstNodeDisplay } = _worstRankInTier(walletTierNodes, metricRankings);
      if (worstRank === null) continue;
      if (worst === null || worstRank > worst.rank) {
        worst = {
          rank: worstRank,
          metricLabel: metric.label,
          metricTotal: metricRankings.length,
          nodeDisplay: worstNodeDisplay,
          value: worstValue,
          unit: metric.unit,
        };
      }
    }

    if (!worst) continue;

    const { rank, metricLabel, metricTotal, nodeDisplay, value, unit } = worst;
    const valueStr = value > 0 ? value.toFixed(2) + unit : 'N/A';
    // pctFromBottom is calculated from the benchmark pool (accurate percentile).
    // Display total uses officialNodeCounts to match the dashboard header.
    const pctFromBottom = ((metricTotal - rank + 1) / metricTotal * 100).toFixed(1);
    const displayTotal = (officialNodeCounts?.[tier] || metricTotal).toLocaleString();

    const levels = [
      {
        id: `slow_${tier}_potato`,
        name: `${tierLabel} Potato`,
        earned: rank >= metricTotal,
        achievementTier: TIER.GOLD,
        Icon: GiPotato,
        hint: `Have a node ranked dead last for any metric among ${tierLabel} nodes`,
        progress: Math.min(100, rank / metricTotal * 100),
        emoji: '🥔',
      },
      {
        id: `slow_${tier}_tortoise`,
        name: `${tierLabel} Flux Tortoise`,
        earned: rank > metricTotal * 0.90,
        achievementTier: TIER.SILVER,
        Icon: GiTortoise,
        hint: `Have a node in the bottom 10% for any metric among ${tierLabel} nodes`,
        progress: Math.min(100, (rank / (metricTotal * 0.90)) * 100),
        emoji: '🐢',
      },
      {
        id: `slow_${tier}_toaster`,
        name: `${tierLabel} Flux Toaster`,
        earned: rank > metricTotal * 0.75,
        achievementTier: TIER.BRONZE,
        Icon: GiToaster,
        hint: `Have a node in the bottom 25% for any metric among ${tierLabel} nodes`,
        progress: Math.min(100, (rank / (metricTotal * 0.75)) * 100),
        emoji: '🔥',
      },
    ];

    for (const level of levels) {
      results.push({
        id: level.id,
        name: level.name,
        description: level.earned
          ? `Your ${tierLabel} node (${nodeDisplay}) is in the bottom ${pctFromBottom}% for ${metricLabel} across all ${displayTotal} ${tierLabel} nodes! ${level.emoji} (${valueStr})`
          : `Your worst ${tierLabel} node is in the bottom ${pctFromBottom}% for ${metricLabel} (${nodeDisplay}, ${valueStr})`,
        hint: level.hint,
        Icon: level.Icon,
        tier: level.achievementTier,
        category: 'performance',
        earned: level.earned,
        progress: Math.max(0, Math.min(100, level.progress)),
        progressLabel: `Bottom ${pctFromBottom}% of ${displayTotal} ${tierLabel} nodes · ${metricLabel}`,
      });
    }
  }

  return results;
}

// ── Wooden Spoon achievements ─────────────────────────────────────────────────
// One per tier × metric — awarded when the wallet's worst node in that tier is
// ranked dead last for that specific metric (more granular than Potato).

function computeWoodenSpoonAchievements(walletNodes, tierRankings, officialNodeCounts) {
  if (!tierRankings) return [];
  const results = [];
  for (const tier of ['CUMULUS', 'NIMBUS', 'STRATUS']) {
    const walletTierNodes = walletNodes.filter((n) => n.tier === tier);
    if (walletTierNodes.length === 0) continue;
    const rankings = tierRankings[tier];
    if (!rankings) continue;
    const tierLabel = TIER_DISPLAY[tier];
    for (const metric of PERF_METRICS) {
      const metricRankings = rankings[metric.key] || [];
      if (metricRankings.length === 0) continue;
      const totalInTier = officialNodeCounts?.[tier] || metricRankings.length;
      const { worstRank, worstValue, worstNodeDisplay } = _worstRankInTier(walletTierNodes, metricRankings);
      if (worstRank === null) continue;
      const earned = worstRank >= metricRankings.length;
      const valueStr = worstValue > 0 ? worstValue.toFixed(2) + metric.unit : 'N/A';
      results.push({
        id: `wooden_spoon_${tier}_${metric.key}`,
        name: `${tierLabel} ${metric.label} Wooden Spoon`,
        description: earned
          ? `Your ${tierLabel} node (${worstNodeDisplay}) is ranked dead last for ${metric.label} among all ${totalInTier.toLocaleString()} ${tierLabel} nodes! 🥄 (${valueStr})`
          : `Your worst ${tierLabel} node for ${metric.label} is ranked #${worstRank.toLocaleString()} of ${totalInTier.toLocaleString()} ${tierLabel} nodes (${valueStr})`,
        hint: `Have a node ranked dead last for ${metric.label} among all ${tierLabel} nodes`,
        Icon: FaUtensilSpoon,
        tier: TIER.GOLD,
        category: 'performance',
        earned,
        progress: Math.max(0, Math.min(100, (worstRank / metricRankings.length) * 100)),
        progressLabel: `Rank #${worstRank.toLocaleString()} of ${totalInTier.toLocaleString()} ${tierLabel} nodes · ${metric.label}`,
      });
    }
  }
  return results;
}

// ── Try Hard achievements ──────────────────────────────────────────────────────
// One per tier × metric — awarded when the wallet's best node in that tier
// ranks in the top 5% for that metric (stacks with medal achievements).

function computeTryHardAchievements(walletNodes, tierRankings, officialNodeCounts) {
  if (!tierRankings) return [];
  const results = [];
  for (const tier of ['CUMULUS', 'NIMBUS', 'STRATUS']) {
    const walletTierNodes = walletNodes.filter((n) => n.tier === tier);
    if (walletTierNodes.length === 0) continue;
    const rankings = tierRankings[tier];
    if (!rankings) continue;
    const tierLabel = TIER_DISPLAY[tier];
    for (const metric of PERF_METRICS) {
      const metricRankings = rankings[metric.key] || [];
      if (metricRankings.length === 0) continue;
      const totalInTier = officialNodeCounts?.[tier] || metricRankings.length;
      const topFivePctThreshold = Math.ceil(metricRankings.length * 0.05);
      if (topFivePctThreshold < 1) continue; // safety guard for empty pools
      const { bestRank, bestValue, bestNodeDisplay } = _bestRankInTier(walletTierNodes, metricRankings);
      if (bestRank === null) continue;
      const earned = bestRank <= topFivePctThreshold;
      const valueStr = bestValue > 0 ? bestValue.toFixed(2) + metric.unit : 'N/A';
      const topPct = ((topFivePctThreshold / metricRankings.length) * 100).toFixed(0);
      results.push({
        id: `try_hard_${tier}_${metric.key}`,
        name: `${tierLabel} ${metric.label} Try Hard`,
        description: earned
          ? `Your ${tierLabel} node (${bestNodeDisplay}) is in the top ${topPct}% globally for ${metric.label} among ${totalInTier.toLocaleString()} ${tierLabel} nodes! 💪 (${valueStr})`
          : `Your best ${tierLabel} node ranks #${bestRank.toLocaleString()} of ${totalInTier.toLocaleString()} for ${metric.label} — top 5% is rank #${topFivePctThreshold} (${valueStr})`,
        hint: `Have a ${tierLabel} node in the top 5% for ${metric.label} (but not top 3)`,
        Icon: FaDumbbell,
        tier: TIER.SILVER,
        category: 'performance',
        earned,
        progress: Math.max(0, Math.min(100, (1 - (bestRank - 1) / Math.max(topFivePctThreshold, 1)) * 100)),
        progressLabel: `Rank #${bestRank.toLocaleString()} of ${totalInTier.toLocaleString()} · top 5% = rank #${topFivePctThreshold}`,
      });
    }
  }
  return results;
}

// ── Country Dictator achievements ─────────────────────────────────────────────
// One per country where the wallet has nodes.
// Earned when the wallet has more nodes in that country than any other single wallet.

function computeDictatorAchievements(walletNodes, globalRankings) {
  if (!globalRankings?.countryDominance || !globalRankings?.nodeGeoMap) return [];
  const { countryDominance, nodeGeoMap } = globalRankings;

  // Count wallet's nodes per country
  const walletByCountry = {};
  for (const node of walletNodes) {
    const ip = node.ip_full?.host;
    if (!ip) continue;
    const geo = nodeGeoMap[ip];
    if (!geo?.countryCode) continue;
    const cc = geo.countryCode;
    if (!walletByCountry[cc]) walletByCountry[cc] = { country: geo.country, count: 0 };
    walletByCountry[cc].count++;
  }

  const results = [];
  for (const [cc, { country, count: walletCount }] of Object.entries(walletByCountry)) {
    const dominance = countryDominance[cc];
    if (!dominance) continue;
    const { leaderCount } = dominance;
    const earned = walletCount >= leaderCount && leaderCount > 0;
    const progress = Math.min(100, (walletCount / Math.max(leaderCount, 1)) * 100);

    results.push({
      id: `dictator_${cc}`,
      name: `${country} Dictator`,
      countryCode: cc,
      description: earned
        ? `Your wallet dominates ${country} with ${walletCount} nodes — the most of any single wallet! 👑`
        : `Your wallet has ${walletCount} node${walletCount !== 1 ? 's' : ''} in ${country}. The current leader has ${leaderCount}.`,
      hint: `Have more nodes in ${country} than any other single wallet`,
      Icon: FaCrown,
      tier: TIER.GOLD,
      category: 'geo',
      earned,
      progress,
      progressLabel: `${walletCount} / ${leaderCount} nodes in ${country}`,
    });
  }

  return results;
}

// ── Static achievement computation ────────────────────────────────────────────

function computeStaticAchievements(gstore, walletNodes, walletPASummary, totalDonations, globalRankings) {
  const nodes = walletNodes;
  const totalNodes = nodes.length;

  const cumulusCount = nodes.filter((n) => n.tier === 'CUMULUS').length;
  const nimbusCount = nodes.filter((n) => n.tier === 'NIMBUS').length;
  const stratusCount = nodes.filter((n) => n.tier === 'STRATUS').length;

  const bestUptimeDays =
    nodes.reduce((max, n) => Math.max(max, n.uptime || 0), 0) / SECONDS_PER_DAY;

  // App analysis
  const gamingApps = new Set();
  const webApps = new Set();
  const blockchainApps = new Set();
  const categorySet = new Set();

  nodes.forEach((node) => {
    (node.installedApps || []).forEach((app) => {
      const cat = categorizeApp(app.name);
      categorySet.add(cat);
      const lower = (app.name || '').toLowerCase();
      if (cat === 'gaming') gamingApps.add(lower);
      if (cat === 'web') webApps.add(lower);
      if (cat === 'blockchain') blockchainApps.add(lower);
    });
  });

  const maxAppCount = nodes.reduce((max, n) => Math.max(max, n.appCount || 0), 0);
  const totalFleetApps = nodes.reduce((sum, n) => sum + (n.appCount || 0), 0);
  const bareNodeCount = nodes.filter((n) => (n.appCount || 0) === 0).length;

  // All benchmarks
  const onlineNodes = nodes.filter((n) => n.maybe_online);
  const allBenchmarksPassed =
    onlineNodes.length > 0 && onlineNodes.every((n) => n.benchmark_status === 'passed');

  // Version currency
  const latestFluxOs = gstore?.fluxos_latest_version;
  const latestBench = gstore?.bench_latest_version;
  const versionDataReady =
    latestFluxOs?.major > 0 || latestFluxOs?.minor > 0 || latestFluxOs?.patch > 0;
  let upToDateCount = 0;
  let outdatedCount = 0;
  if (versionDataReady) {
    onlineNodes.forEach((n) => {
      const fluxOsKnown = n.flux_os?.major > 0 || n.flux_os?.minor > 0 || n.flux_os?.patch > 0;
      const benchKnown =
        n.bench_version?.major > 0 || n.bench_version?.minor > 0 || n.bench_version?.patch > 0;
      const fluxOsCurrent = !fluxOsKnown || fv_compare(n.flux_os, latestFluxOs) >= 0;
      const benchCurrent = !benchKnown || fv_compare(n.bench_version, latestBench) >= 0;
      if (fluxOsCurrent && benchCurrent) upToDateCount++;
      else outdatedCount++;
    });
  }
  const allVersionsCurrent =
    versionDataReady && onlineNodes.length > 0 && outdatedCount === 0;
  const hasOutdatedVersion = versionDataReady && outdatedCount > 0;

  // Geo — derive from globalRankings.nodeGeoMap if available
  const nodeGeoMap = globalRankings?.nodeGeoMap || {};
  const countrySet = new Set();
  const continentSet = new Set();
  const countryNodeCount = {};

  nodes.forEach((n) => {
    const geo = nodeGeoMap[n.ip_full?.host];
    if (geo?.countryCode) {
      countrySet.add(geo.countryCode);
      countryNodeCount[geo.countryCode] = (countryNodeCount[geo.countryCode] || 0) + 1;
    }
    if (geo?.continent) continentSet.add(geo.continent);
  });

  const maxNodesInCountry = Object.values(countryNodeCount).reduce(
    (m, c) => Math.max(m, c),
    0
  );

  const earnedMap = {
    first_node: totalNodes >= 1,
    node_five: totalNodes >= 5,
    node_ten: totalNodes >= 10,
    node_twentyfive: totalNodes >= 25,
    node_fifty: totalNodes >= 50,
    node_hundred: totalNodes >= 100,
    all_tiers: cumulusCount > 0 && nimbusCount > 0 && stratusCount > 0,
    stratus_elite: stratusCount > 0,
    rich_list: gstore.in_rich_list === true,
    donor: (totalDonations || 0) >= 1,
    super_donor: (totalDonations || 0) >= 5,
    sugar_daddy: (totalDonations || 0) >= 50,
    best_uptime_30d: bestUptimeDays >= 30,
    best_uptime_180d: bestUptimeDays >= 180,
    best_uptime_365d: bestUptimeDays >= 365,
    all_benchmarks_pass: allBenchmarksPassed,
    all_versions_current: allVersionsCurrent,
    has_outdated_version: hasOutdatedVersion,
    hosts_gaming: gamingApps.size >= 1,
    hosts_multiple_gaming: gamingApps.size >= 3,
    hosts_web: webApps.size >= 1,
    hosts_blockchain: blockchainApps.size >= 1,
    app_diversity: categorySet.size >= 4,
    most_apps: maxAppCount >= 10,
    most_apps_mega: maxAppCount >= 25,
    fleet_apps_10: totalFleetApps >= 10,
    fleet_apps_50: totalFleetApps >= 50,
    fleet_apps_100: totalFleetApps >= 100,
    bare_one: bareNodeCount >= 1,
    bare_five: bareNodeCount >= 5,
    bare_ten: bareNodeCount >= 10,
    bare_all: totalNodes >= 1 && bareNodeCount === totalNodes,
    multi_national: countrySet.size >= 3,
    continental: continentSet.size >= 2,
    world_power: continentSet.size >= 4,
    home_nation: maxNodesInCountry >= 5,
  };

  const descriptionOverrides = {
    has_outdated_version: hasOutdatedVersion
      ? `${outdatedCount} of ${onlineNodes.length} online node${onlineNodes.length !== 1 ? 's' : ''} need${onlineNodes.length === 1 ? 's' : ''} updating — running an outdated Flux OS or benchmark version.`
      : 'Have at least one online node running an outdated Flux OS or benchmark version.',
  };

  const progressMap = {
    first_node: { p: Math.min(100, totalNodes * 100), label: `${totalNodes} / 1 node` },
    node_five: { p: Math.min(100, (totalNodes / 5) * 100), label: `${totalNodes} / 5 nodes` },
    node_ten: { p: Math.min(100, (totalNodes / 10) * 100), label: `${totalNodes} / 10 nodes` },
    node_twentyfive: { p: Math.min(100, (totalNodes / 25) * 100), label: `${totalNodes} / 25 nodes` },
    node_fifty: { p: Math.min(100, (totalNodes / 50) * 100), label: `${totalNodes} / 50 nodes` },
    node_hundred: { p: Math.min(100, (totalNodes / 100) * 100), label: `${totalNodes} / 100 nodes` },
    donor: { p: Math.min(100, (totalDonations || 0) * 100), label: `${totalDonations || 0} / 1 donation` },
    super_donor: { p: Math.min(100, ((totalDonations || 0) / 5) * 100), label: `${totalDonations || 0} / 5 donations` },
    sugar_daddy: { p: Math.min(100, ((totalDonations || 0) / 50) * 100), label: `${totalDonations || 0} / 50 donations` },
    hosts_multiple_gaming: { p: Math.min(100, (gamingApps.size / 3) * 100), label: `${gamingApps.size} / 3 gaming apps` },
    app_diversity: { p: Math.min(100, (categorySet.size / 4) * 100), label: `${categorySet.size} / 4 categories` },
    most_apps: { p: Math.min(100, (maxAppCount / 10) * 100), label: `${maxAppCount} / 10 apps` },
    most_apps_mega: { p: Math.min(100, (maxAppCount / 25) * 100), label: `${maxAppCount} / 25 apps` },
    fleet_apps_10: { p: Math.min(100, (totalFleetApps / 10) * 100), label: `${totalFleetApps} / 10 fleet apps` },
    fleet_apps_50: { p: Math.min(100, (totalFleetApps / 50) * 100), label: `${totalFleetApps} / 50 fleet apps` },
    fleet_apps_100: { p: Math.min(100, (totalFleetApps / 100) * 100), label: `${totalFleetApps} / 100 fleet apps` },
    bare_one: { p: Math.min(100, bareNodeCount * 100), label: `${bareNodeCount} / 1 bare node` },
    bare_five: { p: Math.min(100, (bareNodeCount / 5) * 100), label: `${bareNodeCount} / 5 bare nodes` },
    bare_ten: { p: Math.min(100, (bareNodeCount / 10) * 100), label: `${bareNodeCount} / 10 bare nodes` },
    bare_all: { p: totalNodes >= 1 ? Math.min(100, (bareNodeCount / totalNodes) * 100) : 0, label: `${bareNodeCount} / ${totalNodes} nodes bare` },
    multi_national: { p: Math.min(100, (countrySet.size / 3) * 100), label: `${countrySet.size} / 3 countries` },
    home_nation: { p: Math.min(100, (maxNodesInCountry / 5) * 100), label: `${maxNodesInCountry} / 5 nodes in one country` },
    all_versions_current: {
      p: onlineNodes.length > 0 ? Math.min(100, (upToDateCount / onlineNodes.length) * 100) : 0,
      label: `${upToDateCount} / ${onlineNodes.length} nodes fully up to date`,
    },
    has_outdated_version: {
      p: onlineNodes.length > 0 ? Math.min(100, (outdatedCount / onlineNodes.length) * 100) : 0,
      label: `${outdatedCount} / ${onlineNodes.length} nodes have outdated versions`,
    },
  };

  return ACHIEVEMENT_DEFS.map((d) => {
    const earned = earnedMap[d.id] || false;
    const prog = progressMap[d.id];
    const description = descriptionOverrides[d.id] || d.description;
    return { ...d, description, earned, progress: prog ? prog.p : null, progressLabel: prog ? prog.label : '' };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute all achievements (static + global performance medals).
 * globalRankings may be null while loading — performance medals are omitted until available.
 */
export function computeAchievements(gstore, walletNodes, walletPASummary, totalDonations, globalRankings) {
  if (!gstore || !walletNodes || walletNodes.length === 0) {
    return ACHIEVEMENT_DEFS.map((d) => ({
      ...d,
      earned: false,
      progress: null,
      progressLabel: '',
    }));
  }

  const staticAchievements = computeStaticAchievements(
    gstore,
    walletNodes,
    walletPASummary,
    totalDonations,
    globalRankings
  );

  if (!globalRankings) return staticAchievements;

  const tierPerf = computeTierPerformanceAchievements(
    walletNodes,
    globalRankings.tierRankings,
    globalRankings.officialNodeCounts
  );
  const countryPerf = computeCountryPerformanceAchievements(
    walletNodes,
    globalRankings.countryRankings,
    globalRankings.nodeGeoMap
  );
  const worstTierPerf = computeTierWorstPerformanceAchievements(
    walletNodes,
    globalRankings.tierRankings,
    globalRankings.officialNodeCounts
  );
  const dictator = computeDictatorAchievements(walletNodes, globalRankings);
  const woodenSpoon = computeWoodenSpoonAchievements(walletNodes, globalRankings.tierRankings, globalRankings.officialNodeCounts);
  const tryHard = computeTryHardAchievements(walletNodes, globalRankings.tierRankings, globalRankings.officialNodeCounts);

  return [...staticAchievements, ...tierPerf, ...countryPerf, ...worstTierPerf, ...dictator, ...woodenSpoon, ...tryHard];
}
