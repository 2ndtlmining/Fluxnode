import { TIER_META } from 'live/tierMeta';

// Tiers appear in this fixed order regardless of the order their reward/
// confirm events happened to arrive in — matches the spec's own reward-card
// ordering (Cumulus, Nimbus, Stratus, Dev Fund).
const REWARD_TIER_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS', 'DEVFUND'];
const CONFIRM_TIER_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS']; // Dev Fund never confirms a node

function summarizeRewards(events) {
  const byTier = {};
  for (const e of events) {
    if (e.type !== 'reward') continue;
    if (byTier[e.tier]) {
      byTier[e.tier].amount += e.amount;
    } else {
      byTier[e.tier] = { amount: e.amount, address: e.paymentAddress };
    }
  }

  const tiers = REWARD_TIER_ORDER.filter((tier) => byTier[tier]).map((tier) => ({
    tier,
    label: TIER_META[tier]?.label || tier,
    color: TIER_META[tier]?.color || '#888',
    amount: byTier[tier].amount,
    address: byTier[tier].address,
  }));

  return {
    count: tiers.length,
    totalFlux: tiers.reduce((sum, t) => sum + t.amount, 0),
    tiers,
  };
}

function summarizeDeployments(events) {
  const apps = events
    .filter((e) => e.type === 'deploy')
    .map((e) => ({
      name: e.appName,
      instances: e.instances || 1,
      cpuPerInst: e.cpuPerInst ?? null,
      ramGBPerInst: e.ramGBPerInst ?? null,
      ssdGBPerInst: e.ssdGBPerInst ?? null,
      category: e.category || null,
      owner: e.owner || null,
    }));

  return {
    count: apps.length,
    instances: apps.reduce((sum, a) => sum + a.instances, 0),
    apps,
  };
}

function summarizeP2p(events) {
  const transfers = events
    .filter((e) => e.type === 'p2p')
    .map((e) => ({ id: e.id, from: e.from, to: e.to, amount: e.amount }));
  return {
    count: transfers.length,
    totalFlux: transfers.reduce((sum, t) => sum + t.amount, 0),
    transfers,
  };
}

function summarizeConfirmations(events) {
  const byTier = {};
  for (const e of events) {
    if (e.type !== 'confirm') continue;
    byTier[e.tier] = (byTier[e.tier] || 0) + 1;
  }

  const tiers = CONFIRM_TIER_ORDER.filter((tier) => byTier[tier]).map((tier) => ({
    tier,
    label: TIER_META[tier]?.label || tier,
    color: TIER_META[tier]?.color || '#888',
    count: byTier[tier],
  }));

  return {
    count: tiers.reduce((sum, t) => sum + t.count, 0),
    byTier: tiers,
  };
}

/*
 * Pure transformation from a displayed block (with its accumulated `events`
 * array — see live/apidata.js's attachEventsToBlocks) into the compact
 * per-category shape the flow canvas's four ActivityCards render. Derived
 * data only — never fetches anything itself (spec §33/§69: "do not create
 * duplicate API requests just for summaries", "summary state should remain
 * derived").
 *
 * Returns null for a missing block — "still loading", distinct from a real
 * block with zero events (see the "empty block" test for that case).
 */
export function buildBlockFlowSummary(block) {
  if (!block) return null;
  const events = block.events || [];

  return {
    height: block.height,
    hash: block.hash,
    at: block.at,
    rewards: summarizeRewards(events),
    deployments: summarizeDeployments(events),
    p2p: summarizeP2p(events),
    confirmations: summarizeConfirmations(events),
  };
}
