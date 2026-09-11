import {
  hasScheduledReduction,
  blocksUntilReduction,
  timeUntilReduction,
  dailyFluxPerNode,
  rewardImpact,
  tallyWalletTiers,
  BLOCKS_PER_DAY,
  SECONDS_PER_BLOCK
} from './rewardReduction';

import { create_global_store, fill_rewards } from 'apidata';
import {
  CC_BLOCK_REWARD,
  CC_NEXT_BLOCK_REWARD,
  CC_NEXT_REWARD_REDUCTION_BLOCK
} from 'content/index';

const NETWORK = { cumulus: 8000, nimbus: 3000, stratus: 1400 };

describe('block target', () => {
  it('derives 2,880 blocks per day from the 30-second target', () => {
    expect(SECONDS_PER_BLOCK).toBe(30);
    expect(BLOCKS_PER_DAY).toBe(2880);
  });
});

describe('hasScheduledReduction', () => {
  it('is true before the reduction block', () => {
    expect(hasScheduledReduction(CC_NEXT_REWARD_REDUCTION_BLOCK - 1)).toBe(true);
  });

  it('is false once the reduction has landed', () => {
    // The countdown must disappear rather than counting up from zero forever.
    expect(hasScheduledReduction(CC_NEXT_REWARD_REDUCTION_BLOCK)).toBe(false);
    expect(hasScheduledReduction(CC_NEXT_REWARD_REDUCTION_BLOCK + 5000)).toBe(false);
  });

  it('is false when the height is unknown', () => {
    // A store that has not loaded yet reports 0, which must not render as
    // "the reduction is 3,071,200 blocks away".
    expect(hasScheduledReduction(0)).toBe(false);
    expect(hasScheduledReduction(null)).toBe(false);
    expect(hasScheduledReduction(undefined)).toBe(false);
    expect(hasScheduledReduction(NaN)).toBe(false);
  });
});

describe('blocksUntilReduction', () => {
  it('counts down to the reduction block', () => {
    expect(blocksUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK - 2880)).toBe(2880);
  });

  it('clamps at zero rather than going negative', () => {
    expect(blocksUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK + 100)).toBe(0);
  });

  it('returns null for an unknown height', () => {
    expect(blocksUntilReduction(0)).toBeNull();
    expect(blocksUntilReduction(undefined)).toBeNull();
  });
});

describe('timeUntilReduction', () => {
  it('splits exactly one day for one day of blocks', () => {
    const t = timeUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK - BLOCKS_PER_DAY);
    expect(t).toEqual({ blocks: 2880, days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('splits a mixed duration correctly', () => {
    // 2 days + 3 hours + 30 minutes = 5760 + 360 + 60 blocks
    const t = timeUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK - (5760 + 360 + 60));
    expect(t).toMatchObject({ days: 2, hours: 3, minutes: 30, seconds: 0 });
  });

  it('renders a half-block as 30 seconds', () => {
    const t = timeUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK - 1);
    expect(t).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 30 });
  });

  it('is all zeroes once the reduction has landed', () => {
    expect(timeUntilReduction(CC_NEXT_REWARD_REDUCTION_BLOCK)).toEqual({
      blocks: 0, days: 0, hours: 0, minutes: 0, seconds: 0
    });
  });
});

describe('dailyFluxPerNode', () => {
  it('agrees with the app’s own reward pipeline', () => {
    /*
     * The load-bearing test. fill_rewards() in api/globalStats.js is what the
     * dashboard already shows; if this module disagreed with it, a donor would
     * see two different "current daily" figures on two screens.
     */
    const gstore = create_global_store();
    gstore.node_count.cumulus = NETWORK.cumulus;
    gstore.node_count.nimbus = NETWORK.nimbus;
    gstore.node_count.stratus = NETWORK.stratus;
    gstore.node_count.total = NETWORK.cumulus + NETWORK.nimbus + NETWORK.stratus;
    fill_rewards(gstore);

    for (const [tier, key] of [['CUMULUS', 'cumulus'], ['NIMBUS', 'nimbus'], ['STRATUS', 'stratus']]) {
      const projection = gstore.reward_projections[key];
      const expected = projection.payment_amount + projection.pa_amount;
      expect(dailyFluxPerNode(tier, NETWORK[key], CC_BLOCK_REWARD)).toBeCloseTo(expected, 10);
    }
  });

  it('scales linearly with the block reward', () => {
    const now = dailyFluxPerNode('CUMULUS', NETWORK.cumulus, CC_BLOCK_REWARD);
    const after = dailyFluxPerNode('CUMULUS', NETWORK.cumulus, CC_NEXT_BLOCK_REWARD);
    expect(after / now).toBeCloseTo(CC_NEXT_BLOCK_REWARD / CC_BLOCK_REWARD, 12);
  });

  it('returns 0 rather than Infinity for an empty tier', () => {
    // A tier with no nodes divides by zero. fill_rewards yields Infinity there
    // (asserted in apidata.test.js); this is a per-operator figure, so 0 is the
    // honest answer -- you cannot earn a share of a tier you have no node in.
    expect(dailyFluxPerNode('CUMULUS', 0, CC_BLOCK_REWARD)).toBe(0);
  });

  it('returns 0 for an unknown tier', () => {
    expect(dailyFluxPerNode('FRACTUS', 100, CC_BLOCK_REWARD)).toBe(0);
  });
});

describe('rewardImpact', () => {
  const WALLET = { CUMULUS: 2, NIMBUS: 1, STRATUS: 3 };

  it('reports the cut as a negative percentage matching the reward drop', () => {
    const impact = rewardImpact(WALLET, NETWORK, 0.25);
    // 14 -> 12.6 is a 10% cut, whatever the tier mix.
    const expectedPct = ((CC_NEXT_BLOCK_REWARD - CC_BLOCK_REWARD) / CC_BLOCK_REWARD) * 100;
    expect(impact.pctChange).toBeCloseTo(expectedPct, 10);
    expect(impact.pctChange).toBeLessThan(0);
  });

  it('scales weekly and monthly straight off the daily figure', () => {
    const impact = rewardImpact(WALLET, NETWORK, 0.25);
    expect(impact.weekly.delta).toBeCloseTo(impact.daily.delta * 7, 10);
    expect(impact.monthly.delta).toBeCloseTo(impact.daily.delta * 30, 10);
  });

  it('converts to USD at the supplied price', () => {
    const price = 0.25;
    const impact = rewardImpact(WALLET, NETWORK, price);
    expect(impact.daily.deltaUsd).toBeCloseTo(impact.daily.delta * price, 10);
    expect(impact.monthly.currentUsd).toBeCloseTo(impact.monthly.current * price, 10);
  });

  it('leaves USD at zero when the price is unknown', () => {
    // flux_price_usd defaults to 0 when the currency fetch fails (#189), and a
    // rate-limited price must not silently render every dollar figure as 0
    // without the caller being able to tell. It returns 0, and the UI checks.
    const impact = rewardImpact(WALLET, NETWORK, 0);
    expect(impact.daily.deltaUsd).toBe(0);
    expect(impact.daily.delta).not.toBe(0);
  });

  it('breaks the impact down per tier', () => {
    const impact = rewardImpact(WALLET, NETWORK, 0.25);
    expect(Object.keys(impact.perTier).sort()).toEqual(['CUMULUS', 'NIMBUS', 'STRATUS']);
    expect(impact.perTier.STRATUS.nodes).toBe(3);
    for (const tier of Object.keys(impact.perTier)) {
      expect(impact.perTier[tier].deltaDaily).toBeLessThan(0);
    }
  });

  it('omits tiers the wallet has no nodes in', () => {
    const impact = rewardImpact({ CUMULUS: 1 }, NETWORK, 0.25);
    expect(Object.keys(impact.perTier)).toEqual(['CUMULUS']);
  });

  it('reports a flat zero for a wallet with no nodes, not NaN', () => {
    const impact = rewardImpact({}, NETWORK, 0.25);
    expect(impact.pctChange).toBe(0);
    expect(impact.daily.delta).toBe(0);
    expect(Number.isNaN(impact.daily.deltaUsd)).toBe(false);
  });

  it('survives missing network counts', () => {
    const impact = rewardImpact(WALLET, null, 0.25);
    expect(Number.isNaN(impact.daily.delta)).toBe(false);
    expect(impact.daily.delta).toBe(0);
  });
});

describe('tallyWalletTiers', () => {
  it('counts nodes per tier', () => {
    const nodes = [{ tier: 'CUMULUS' }, { tier: 'CUMULUS' }, { tier: 'STRATUS' }];
    expect(tallyWalletTiers(nodes)).toEqual({ CUMULUS: 2, NIMBUS: 0, STRATUS: 1 });
  });

  it('accepts any casing', () => {
    // Demo and cached rows have been seen carrying 'Cumulus' rather than the
    // upper-cased form getWalletNodes produces.
    expect(tallyWalletTiers([{ tier: 'Cumulus' }, { tier: 'nimbus' }]))
      .toEqual({ CUMULUS: 1, NIMBUS: 1, STRATUS: 0 });
  });

  it('ignores unknown or missing tiers instead of throwing', () => {
    expect(tallyWalletTiers([{ tier: 'FRACTUS' }, {}, null]))
      .toEqual({ CUMULUS: 0, NIMBUS: 0, STRATUS: 0 });
  });

  it('handles no nodes at all', () => {
    expect(tallyWalletTiers(null)).toEqual({ CUMULUS: 0, NIMBUS: 0, STRATUS: 0 });
  });
});
