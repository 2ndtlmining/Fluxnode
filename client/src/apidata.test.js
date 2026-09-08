import {
  create_global_store,
  tier_global_projections,
  fill_rewards,
  calc_mtn_window,
  normalize_raw_node_tier,
  wallet_health_full,
  fetch_global_app_specs,
  fetch_global_app_specs_raw,
} from './apidata';

import {
  CC_BLOCK_REWARD,
  CC_PA_REWARD,
  CC_FLUX_REWARD_CUMULUS,
  CC_FLUX_REWARD_NIMBUS,
  CC_FLUX_REWARD_STRATUS,
  CC_COLLATERAL_CUMULUS,
  CC_COLLATERAL_NIMBUS,
  CC_COLLATERAL_STRATUS,
} from 'content/index';

/*
 * Baseline for #147.
 *
 * apidata.js is about to be split into modules, and its reward projections are
 * the most financially sensitive numbers in the app — they drive the APY and
 * payout figures node operators actually make decisions on. These tests pin the
 * arithmetic against the constants so the split can be shown to be
 * behaviour-preserving rather than assumed to be.
 *
 * Expected values are derived from the constants rather than hardcoded, so a
 * deliberate change to a reward percentage updates the test with the code,
 * while an accidental change to the *formula* still fails.
 */

const FLUX_PER_DAY = 24 * 60 * 2; // one block every 30s

function expectedFor(rewardPct, nodeCount, collateral) {
  const networkPerDay = FLUX_PER_DAY * ((CC_BLOCK_REWARD * rewardPct) / 100);
  const perNode = networkPerDay / nodeCount;
  const pa = (perNode * CC_PA_REWARD) / 100;
  return {
    pay_frequency: nodeCount / 2,
    payment_amount: perNode,
    pa_amount: pa,
    apy: 100 * (((perNode + pa) * 365) / collateral),
  };
}

describe('create_global_store', () => {
  it('starts zeroed with no running-app data', () => {
    const s = create_global_store();
    expect(s.node_count).toEqual({ cumulus: 0, nimbus: 0, stratus: 0, total: 0 });
    expect(s.flux_price_usd).toBe(0);
    expect(s.totalRunningApps).toBe(0);
    expect(s.runningCategoryMap).toEqual({});
    expect(s.runningCategoryTop).toEqual({});
  });

  it('defaults running-app provenance to unavailable', () => {
    // The App Ecosystem panel keys off this to avoid claiming live data it
    // does not have — see #144.
    const s = create_global_store();
    expect(s.runningAppsStatus).toBe('unavailable');
    expect(s.runningAppsFetchedAt).toBeNull();
  });

  it('returns a fresh object each call', () => {
    const a = create_global_store();
    const b = create_global_store();
    a.node_count.total = 99;
    expect(b.node_count.total).toBe(0);
  });
});

describe('tier_global_projections', () => {
  it('starts every projection at zero', () => {
    expect(tier_global_projections()).toEqual({
      pay_frequency: 0,
      payment_amount: 0,
      pa_amount: 0,
      apy: 0,
    });
  });
});

describe('fill_rewards', () => {
  const store = create_global_store();
  store.node_count = { cumulus: 3199, nimbus: 1637, stratus: 1684, total: 6520 };
  fill_rewards(store);

  it('computes cumulus projections from the reward constants', () => {
    const e = expectedFor(CC_FLUX_REWARD_CUMULUS, 3199, CC_COLLATERAL_CUMULUS);
    const a = store.reward_projections.cumulus;
    expect(a.pay_frequency).toBeCloseTo(e.pay_frequency, 9);
    expect(a.payment_amount).toBeCloseTo(e.payment_amount, 9);
    expect(a.pa_amount).toBeCloseTo(e.pa_amount, 9);
    expect(a.apy).toBeCloseTo(e.apy, 9);
  });

  it('computes nimbus projections from the reward constants', () => {
    const e = expectedFor(CC_FLUX_REWARD_NIMBUS, 1637, CC_COLLATERAL_NIMBUS);
    expect(store.reward_projections.nimbus.apy).toBeCloseTo(e.apy, 9);
    expect(store.reward_projections.nimbus.payment_amount).toBeCloseTo(e.payment_amount, 9);
  });

  it('computes stratus projections from the reward constants', () => {
    const e = expectedFor(CC_FLUX_REWARD_STRATUS, 1684, CC_COLLATERAL_STRATUS);
    expect(store.reward_projections.stratus.apy).toBeCloseTo(e.apy, 9);
    expect(store.reward_projections.stratus.payment_amount).toBeCloseTo(e.payment_amount, 9);
  });

  it('pay frequency is half the node count, in minutes', () => {
    // one payout every two minutes across the tier
    expect(store.reward_projections.cumulus.pay_frequency).toBe(3199 / 2);
    expect(store.reward_projections.stratus.pay_frequency).toBe(1684 / 2);
  });

  it('produces finite, positive numbers for a realistic network', () => {
    for (const tier of ['cumulus', 'nimbus', 'stratus']) {
      const p = store.reward_projections[tier];
      for (const key of ['pay_frequency', 'payment_amount', 'pa_amount', 'apy']) {
        expect(Number.isFinite(p[key])).toBe(true);
        expect(p[key]).toBeGreaterThan(0);
      }
    }
  });

  it('a tier with no nodes yields Infinity rather than silently zeroing', () => {
    // Documents current behaviour: division by a zero node count. Worth knowing
    // before #147 moves this — the UI must not render it raw.
    const empty = create_global_store();
    empty.node_count = { cumulus: 0, nimbus: 0, stratus: 0, total: 0 };
    fill_rewards(empty);
    expect(empty.reward_projections.cumulus.payment_amount).toBe(Infinity);
  });
});

describe('calc_mtn_window', () => {
  // 480 blocks at 30s = a 240 minute maintenance window
  it('returns Closed once the window has elapsed', () => {
    expect(calc_mtn_window(1000, 1480)).toBe('Closed');
    expect(calc_mtn_window(1000, 2000)).toBe('Closed');
  });

  it('returns a formatted duration while the window is open', () => {
    const open = calc_mtn_window(1000, 1000);
    expect(open).not.toBe('Closed');
    expect(typeof open).toBe('string');
    expect(open.length).toBeGreaterThan(0);
  });

  it('closes exactly at the 480 block boundary', () => {
    expect(calc_mtn_window(1000, 1479)).not.toBe('Closed');
    expect(calc_mtn_window(1000, 1480)).toBe('Closed');
  });
});

describe('normalize_raw_node_tier', () => {
  it('upper-cases the tier', () => {
    expect(normalize_raw_node_tier({ tier: 'cumulus' })).toBe('CUMULUS');
    expect(normalize_raw_node_tier({ tier: 'Stratus' })).toBe('STRATUS');
  });
});

describe('wallet_health_full', () => {
  it('starts every tier zeroed', () => {
    const h = wallet_health_full();
    for (const tier of ['cumulus', 'nimbus', 'stratus']) {
      expect(h[tier].node_count).toBe(0);
      expect(h[tier].projection_daily.flux).toBe(0);
      expect(h[tier].projection_montly.flux).toBe(0);
    }
  });
});

describe('fetch_global_app_specs_raw / fetch_global_app_specs', () => {
  const SPECS = [{ name: 'appA', height: 100, compose: [{ repotag: 'someimage/app:latest', cpu: 1, ram: 512, hdd: 5 }] }];

  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('fetch_global_app_specs_raw returns the raw spec array', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });
    const raw = await fetch_global_app_specs_raw();
    expect(raw).toEqual(SPECS);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });
    const [a, b] = await Promise.all([fetch_global_app_specs_raw(), fetch_global_app_specs_raw()]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('recomputes expiringToday/deployedToday fresh from the block height on every call, never from a stale cached value', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });

    // First call at block height 0 (the race this task exists to fix):
    // appA is not "deployed today" because there is no reliable height yet.
    const first = await fetch_global_app_specs({ fluxBlockHeight: 0 });
    expect(first.deployedToday).toEqual([]);

    // Second call moments later, same 5-minute cache window, but with the
    // real block height available — must NOT read back the first call's
    // (wrong) cached deployedToday.
    const second = await fetch_global_app_specs({ fluxBlockHeight: 100 });
    expect(second.deployedToday).toHaveLength(1);
    expect(second.deployedToday[0].name).toBe('appA');

    // Only one network fetch for both calls — the raw array is what's shared.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
