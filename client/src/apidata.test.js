import {
  create_global_store,
  tier_global_projections,
  fill_rewards,
  calc_mtn_window,
  normalize_raw_node_tier,
  wallet_health_full,
  fetch_global_app_specs,
  fetch_global_app_specs_raw,
  _extract_country_counts,
  fetch_global_stats,
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

  /*
   * Neither of these may ever reject. Three callers have no .catch of their
   * own — AppsSection, analytics/AppsTab, and fetchTotalDeployedApps, which
   * sits in fetch_global_stats' bare Promise.all where a rejection takes the
   * whole Home page load (price, wallet, node counts) down with it.
   */
  describe('never rejects', () => {
    const EMPTY = { expiringToday: [], deployedToday: [], networkCategories: [], rawSpecs: [] };

    it('resolves to empty when data is an object rather than an array', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: { not: 'an array' } }) });

      await expect(fetch_global_app_specs_raw()).resolves.toEqual([]);
      await expect(fetch_global_app_specs({ fluxBlockHeight: 100 })).resolves.toEqual(EMPTY);
    });

    it('does not read a malformed cache entry back as a spec array', async () => {
      sessionStorage.setItem('homeAppSpecsRaw_v1', JSON.stringify({ data: { not: 'an array' }, timestamp: Date.now() }));
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });

      // The bad cache entry is ignored and a real fetch happens instead.
      await expect(fetch_global_app_specs_raw()).resolves.toEqual(SPECS);
    });

    it('resolves to empty when a spec in the array cannot be computed over', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: [null] }) });

      await expect(fetch_global_app_specs({ fluxBlockHeight: 100 })).resolves.toEqual(EMPTY);
      expect(warn).toHaveBeenCalled();
    });

    it('resolves to empty when the request itself fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await expect(fetch_global_app_specs_raw()).resolves.toEqual([]);
      await expect(fetch_global_app_specs({ fluxBlockHeight: 100 })).resolves.toEqual(EMPTY);
      expect(warn).toHaveBeenCalled();
    });

    it('still returns the full shape on the success path', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: SPECS }) });

      const out = await fetch_global_app_specs({ fluxBlockHeight: 100 });

      expect(Object.keys(out).sort()).toEqual(['deployedToday', 'expiringToday', 'networkCategories', 'rawSpecs']);
      expect(out.rawSpecs).toEqual(SPECS);
      expect(out.deployedToday).toHaveLength(1);
      expect(out.networkCategories).toHaveLength(1);
    });
  });
});

/*
 * _extract_country_counts (issue #153) — Task 3 changed this function's
 * entire input contract from the old exploded countryRankings shape to the
 * much smaller countryTierCounts shape. This test replaces (not adds to)
 * Task 1's original version, keeping the exact same expected output.
 */
describe('_extract_country_counts (characterization — current behavior)', () => {
  it("counts nodes per country by summing each tier's count", () => {
    const countryTierCounts = {
      US: { country: 'United States', tiers: { CUMULUS: 2, STRATUS: 1 } },
    };
    const result = _extract_country_counts(countryTierCounts);
    expect(result).toEqual([{ country: 'United States', countryCode: 'US', nodeCount: 3 }]);
  });
});

/*
 * fetch_global_performance_rankings (issue #153 redesign) — replaces the
 * old pre-sorted, massively-duplicated tierRankings/countryRankings cache
 * with a flat nodeData array plus two small precomputed aggregates
 * (tierWinners, countryTierCounts). See Task 3 brief.
 */
describe('fetch_global_performance_rankings (redesigned shape)', () => {
  // 10.0.0.3 is a second CUMULUS node in the US (same tier+country as
  // 10.0.0.1), deliberately given lower metric values than 10.0.0.1 across
  // the board. This pins two things the original one-node-per-tier fixture
  // could not: tierWinners.CUMULUS must still pick 10.0.0.1 (the higher
  // value, not the last-seen or minimum entry), and countryTierCounts.US's
  // CUMULUS count must become 2 (proving the accumulator adds rather than
  // overwrites). NIMBUS has zero nodes in this fixture, pinning the null
  // branch of tierWinners.
  const FLUX_NODES = { fluxNodes: [
    { ip: '10.0.0.1:16127', tier: 'cumulus', payment_address: 't1a' },
    { ip: '10.0.0.2:16127', tier: 'stratus', payment_address: 't1b' },
    { ip: '10.0.0.3:16127', tier: 'cumulus', payment_address: 't1c' },
  ] };
  const BENCH_DATA = [
    { benchmark: { bench: { ipaddress: '10.0.0.1:16127', eps: 100, ddwrite: 10, download_speed: 50, upload_speed: 20 } } },
    { benchmark: { bench: { ipaddress: '10.0.0.2:16127', eps: 200, ddwrite: 20, download_speed: 60, upload_speed: 30 } } },
    { benchmark: { bench: { ipaddress: '10.0.0.3:16127', eps: 60, ddwrite: 8, download_speed: 30, upload_speed: 15 } } },
  ];
  const GEO_DATA = [
    { geolocation: { ip: '10.0.0.1', country: 'United States', countryCode: 'US', continent: 'NA' } },
    { geolocation: { ip: '10.0.0.2', country: 'Germany', countryCode: 'DE', continent: 'EU' } },
    { geolocation: { ip: '10.0.0.3', country: 'United States', countryCode: 'US', continent: 'NA' } },
  ];
  const NODE_COUNT = { data: { 'cumulus-enabled': 2, 'nimbus-enabled': 0, 'stratus-enabled': 1, total: 3 } };

  function mockFetchByUrl() {
    global.fetch = jest.fn((url) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('getFluxNodes')) return Promise.resolve({ json: async () => FLUX_NODES });
      if (u.includes('projection=benchmark')) return Promise.resolve({ json: async () => ({ status: 'success', data: BENCH_DATA }) });
      if (u.includes('projection=geolocation')) return Promise.resolve({ json: async () => ({ status: 'success', data: GEO_DATA }) });
      if (u.includes('getzelnodecount')) return Promise.resolve({ json: async () => NODE_COUNT });
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });
  }

  let fetch_global_performance_rankings;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    sessionStorage.clear();
    mockFetchByUrl();
    fetch_global_performance_rankings = require('./apidata').fetch_global_performance_rankings;
  });

  it('resolves nodeData as one entry per benchmarked node, no duplication', async () => {
    const result = await fetch_global_performance_rankings();
    expect(result.nodeData).toHaveLength(3);
    expect(result.nodeData.find((n) => n.ip === '10.0.0.1')).toMatchObject({ tier: 'CUMULUS', eps: 100 });
    expect(result.tierRankings).toBeUndefined();
    expect(result.countryRankings).toBeUndefined();
  });

  it('tierWinners gives the single highest-value node per tier+metric', async () => {
    const result = await fetch_global_performance_rankings();
    // Two CUMULUS nodes now (10.0.0.1 eps 100, 10.0.0.3 eps 60, added later
    // in fixture order) — 10.0.0.1 must still win, proving this picks the
    // highest value rather than the last-seen or minimum entry.
    expect(result.tierWinners.CUMULUS.eps).toEqual({ ip: '10.0.0.1', value: 100 });
    // Only one node in STRATUS, so it trivially wins its own tier.
    expect(result.tierWinners.STRATUS.eps).toEqual({ ip: '10.0.0.2', value: 200 });
    // NIMBUS has zero nodes in this fixture — the { ip, value } | null contract's
    // null branch, which a single-winner-per-tier fixture would never exercise.
    expect(result.tierWinners.NIMBUS.eps).toBeNull();
  });

  it('countryTierCounts matches nodeData grouped by country+tier', async () => {
    const result = await fetch_global_performance_rankings();
    // Two CUMULUS nodes in the US (10.0.0.1, 10.0.0.3) — proves the
    // accumulator adds per node rather than overwriting with 1 each time.
    expect(result.countryTierCounts.US.tiers.CUMULUS).toBe(2);
    expect(result.countryTierCounts.DE.tiers.STRATUS).toBe(1);
  });

  it('bumps the cache key to v4 and prunes the old v3 entry', async () => {
    sessionStorage.setItem('globalPerfRankings_v3', JSON.stringify({ data: { stale: true }, timestamp: Date.now() }));
    await fetch_global_performance_rankings();
    expect(sessionStorage.getItem('globalPerfRankings_v3')).toBeNull();
    expect(sessionStorage.getItem('globalPerfRankings_v4')).not.toBeNull();
    const cachedV4 = JSON.parse(sessionStorage.getItem('globalPerfRankings_v4'));
    expect(cachedV4.data.nodeData).toHaveLength(3);
    expect(cachedV4.data.tierRankings).toBeUndefined();
    expect(cachedV4.data.countryRankings).toBeUndefined();
  });

  afterEach(() => {
    // A direct `global.fetch = jest.fn()` assignment (as opposed to
    // `jest.spyOn`) is never tracked by jest.restoreAllMocks() — it only
    // restores spies. Restore the pre-suite reference explicitly so this
    // describe block's mock can't leak into whatever runs after it.
    global.fetch = originalFetch;
  });
});

describe('fetch_global_stats resilience (#189)', () => {
  it('a single failing fetch (e.g. rate-limited currency endpoint) does not prevent other fields from populating', async () => {
    global.fetch = jest.fn((url) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/currency')) return Promise.reject(new Error('429 rate limited'));
      if (u.includes('/daemon/getzelnodecount')) return Promise.resolve({ ok: true, json: async () => ({ data: { 'cumulus-enabled': 10, 'nimbus-enabled': 5, 'stratus-enabled': 3, total: 18 } }) });
      if (u.includes('/daemon/getinfo')) return Promise.resolve({ ok: true, json: async () => ({ data: { blocks: 999, version: 5.1 } }) });
      if (u.includes('/api/addr/')) return Promise.resolve({ ok: true, json: async () => ({ balance: 1234.56 }) });
      if (u.includes('/api/statistics/richest-addresses-list')) return Promise.resolve({ ok: true, json: async () => ([]) });
      if (u.includes('package.json')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: '1.2.3' }) });
      if (u.includes('/apps/globalappsspecifications')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
      if (u.includes('viewdeterministiczelnodelist')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (u.includes('benchmarkinfo.json')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: '1.0.0' }) });
      if (u.includes('projection=apps.resources')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
      if (u.includes('projection=benchmark')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
      if (u.includes('projection=geolocation')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
      if (u.includes('projection=flux')) return Promise.resolve({ ok: true, json: async () => ({ status: 'error', data: [] }) });
      if (u.includes('frontendData')) return Promise.resolve({ ok: true, json: async () => ({ latest_price: 0.25 }) });
      // Default fallback for any other fetch
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const store = await fetch_global_stats('t1Hs7jYsXmGXg2c3sW9Vk3nQp8pqRs4tU5vW6xYz7aA');
    // The currency fetch failed, so flux_price_usd should remain at the default (0)
    expect(store.flux_price_usd).toBe(0);
    // But other fields should still be populated by successful fetches
    expect(store.node_count.cumulus).toBe(10);
    expect(store.node_count.nimbus).toBe(5);
    expect(store.node_count.stratus).toBe(3);
    expect(store.node_count.total).toBe(18);
    expect(store.current_block_height).toBe(999);
    expect(store.wallet_amount_flux).toBe(1234.56);
  });
});
