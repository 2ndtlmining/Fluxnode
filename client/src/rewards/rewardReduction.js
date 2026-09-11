import {
  CC_BLOCK_REWARD,
  CC_NEXT_BLOCK_REWARD,
  CC_NEXT_REWARD_REDUCTION_BLOCK,
  CC_FLUX_REWARD_CUMULUS,
  CC_FLUX_REWARD_NIMBUS,
  CC_FLUX_REWARD_STRATUS,
  CC_PA_REWARD
} from 'content/index';

/*
 * The next block-reward reduction: how far away it is, and what it costs a
 * given wallet (issue #240).
 *
 * Pure and side-effect free -- every function here takes the current block
 * height and the wallet's nodes as arguments rather than reaching for a store,
 * so the arithmetic can be tested directly. That matters more than usual: these
 * are the numbers a donor will make decisions on.
 *
 * The reduction is a CONSTANT pair in runtime/app-content.js
 * (CC_NEXT_REWARD_REDUCTION_BLOCK, CC_NEXT_BLOCK_REWARD) rather than a schedule
 * derived from chain height. That is a deliberate scope choice: a derived
 * subsidy curve is issue #203 and a much larger change. The constant is a
 * one-line edit on the day, with no rebuild.
 *
 * On the 10% / 11% question, because both numbers are correct and they get
 * confused: the reward falls 14 -> 12.6, which is a 10% CUT. Equivalently,
 * today's figure is 11.1% HIGHER than the post-reduction one (14 / 12.6). This
 * module reports the cut, because that is what happens to the operator's
 * income; issue #202's "11% high" describes the same event from the other side.
 */

// The chain targets one block every 30 seconds, which is also what FLUX_PER_DAY
// in api/globalStats.js is derived from. Kept in sync deliberately: if the
// block target ever changes, both have to move together.
export const SECONDS_PER_BLOCK = 30;
export const BLOCKS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_BLOCK; // 2,880

/** Per-tier share of the block reward, as a percentage. */
const TIER_REWARD_PCT = {
  CUMULUS: CC_FLUX_REWARD_CUMULUS,
  NIMBUS: CC_FLUX_REWARD_NIMBUS,
  STRATUS: CC_FLUX_REWARD_STRATUS
};

/**
 * Whether a reduction is scheduled at all.
 *
 * A zero block means "none scheduled" -- the countdown hides itself rather than
 * rendering a meaningless timer, which is what would happen if this were left
 * to a truthiness check on a height of 0.
 */
export function hasScheduledReduction(currentBlock) {
  return (
    CC_NEXT_REWARD_REDUCTION_BLOCK > 0 &&
    CC_NEXT_BLOCK_REWARD > 0 &&
    Number.isFinite(currentBlock) &&
    currentBlock > 0 &&
    currentBlock < CC_NEXT_REWARD_REDUCTION_BLOCK
  );
}

/** Blocks remaining until the reduction; 0 once it has landed. */
export function blocksUntilReduction(currentBlock) {
  if (!Number.isFinite(currentBlock) || currentBlock <= 0) return null;
  return Math.max(0, CC_NEXT_REWARD_REDUCTION_BLOCK - currentBlock);
}

/**
 * Time until the reduction, split for a clock face.
 *
 * An ESTIMATE, and labelled as one in the UI: it assumes the 30-second target
 * holds, and real block times drift. Returns null when nothing is scheduled so
 * callers render nothing rather than a row of zeros.
 */
export function timeUntilReduction(currentBlock) {
  const blocks = blocksUntilReduction(currentBlock);
  if (blocks == null) return null;

  let seconds = blocks * SECONDS_PER_BLOCK;
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  return { blocks, days, hours, minutes, seconds };
}

/**
 * What one node of `tier` earns per day, in FLUX, at a given block reward.
 *
 * Mirrors fill_tier_g_projection in api/globalStats.js: the network pays
 * blocksPerDay x (blockReward x tierPct / 100) across every node in that tier,
 * and the parallel-asset reward is a further CC_PA_REWARD percent on top.
 */
export function dailyFluxPerNode(tier, tierNodeCount, blockReward) {
  const pct = TIER_REWARD_PCT[tier];
  if (pct == null || !tierNodeCount || tierNodeCount <= 0) return 0;

  const networkPerDay = BLOCKS_PER_DAY * ((blockReward * pct) / 100.0);
  const perNode = networkPerDay / tierNodeCount;
  const paAmount = (perNode * CC_PA_REWARD) / 100.0;

  return perNode + paAmount;
}

/**
 * The reduction's impact on a specific wallet.
 *
 * @param {{CUMULUS?: number, NIMBUS?: number, STRATUS?: number}} walletTiers
 *        how many nodes the wallet runs in each tier
 * @param {{cumulus: number, nimbus: number, stratus: number}} networkCounts
 *        network-wide node counts per tier, which set the per-node share
 * @param {number} fluxPriceUsd
 * @returns {null | object} null when no reduction is scheduled
 *
 * Network counts are held CONSTANT across the before/after comparison. They
 * will of course change by October, but modelling that would mean guessing at
 * network growth and presenting the guess as a number -- the honest figure is
 * "what this reduction does, all else equal".
 */
export function rewardImpact(walletTiers, networkCounts, fluxPriceUsd = 0) {
  if (!(CC_NEXT_REWARD_REDUCTION_BLOCK > 0 && CC_NEXT_BLOCK_REWARD > 0)) return null;

  const counts = {
    CUMULUS: networkCounts?.cumulus || 0,
    NIMBUS: networkCounts?.nimbus || 0,
    STRATUS: networkCounts?.stratus || 0
  };

  let currentDaily = 0;
  let reducedDaily = 0;
  const perTier = {};

  for (const tier of ['CUMULUS', 'NIMBUS', 'STRATUS']) {
    const owned = walletTiers?.[tier] || 0;
    if (owned <= 0) continue;

    const now = dailyFluxPerNode(tier, counts[tier], CC_BLOCK_REWARD) * owned;
    const after = dailyFluxPerNode(tier, counts[tier], CC_NEXT_BLOCK_REWARD) * owned;

    perTier[tier] = { nodes: owned, currentDaily: now, reducedDaily: after, deltaDaily: after - now };
    currentDaily += now;
    reducedDaily += after;
  }

  const deltaDaily = reducedDaily - currentDaily;
  // Guard the divide: a wallet with no nodes has no percentage change, and
  // 0/0 would render as NaN%.
  const pctChange = currentDaily > 0 ? (deltaDaily / currentDaily) * 100 : 0;

  /*
   * `+ 0` normalises negative zero. deltaDaily is negative, so multiplying it
   * by a zero price yields -0, and (-0).toFixed(2) renders "-0.00" -- the UI
   * would show "-$0.00" whenever the price fetch is rate-limited (#189).
   */
  const z = (n) => n + 0;
  const period = (days) => ({
    current: z(currentDaily * days),
    reduced: z(reducedDaily * days),
    delta: z(deltaDaily * days),
    currentUsd: z(currentDaily * days * fluxPriceUsd),
    reducedUsd: z(reducedDaily * days * fluxPriceUsd),
    deltaUsd: z(deltaDaily * days * fluxPriceUsd)
  });

  return {
    currentBlockReward: CC_BLOCK_REWARD,
    reducedBlockReward: CC_NEXT_BLOCK_REWARD,
    reductionBlock: CC_NEXT_REWARD_REDUCTION_BLOCK,
    pctChange,
    perTier,
    daily: period(1),
    weekly: period(7),
    monthly: period(30)
  };
}

/**
 * Node counts per tier for a wallet, from the node rows the app already holds.
 *
 * Tolerates the tier arriving in any case: getWalletNodes normalises to upper
 * case, but demo and cached rows have been seen carrying 'Cumulus'.
 */
export function tallyWalletTiers(walletNodes) {
  const out = { CUMULUS: 0, NIMBUS: 0, STRATUS: 0 };
  for (const node of walletNodes || []) {
    const tier = String(node?.tier || '').toUpperCase();
    if (tier in out) out[tier] += 1;
  }
  return out;
}
