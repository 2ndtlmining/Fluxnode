import baseline from './__fixtures__/apidataBaseline.json';
import * as apidata from 'apidata';
import {
  create_global_store,
  fill_rewards,
  tier_global_projections,
  transformRawNode,
  normalize_raw_node_tier,
  wallet_health_full,
  fill_health,
  calc_mtn_window,
  fetch_global_stats
} from 'apidata';

/*
 * Cross-build parity for the API layer (issue #147).
 *
 * The #147 split moved ~1,600 lines out of apidata.js into api/*.js. Every
 * check that ran during that work -- byte-identical diffs, a green suite, a
 * clean production build, a container that boots -- can all pass while a number
 * on screen is wrong, because none of them evaluates a calculation. A re-export
 * barrel that resolves a symbol to `undefined` compiles perfectly.
 *
 * So these assert the actual VALUES, captured from the build immediately before
 * the split (commit 6038396) and committed as a fixture. Three layers:
 *
 *   1. the export surface -- every name, its type, its arity
 *   2. the reward maths -- APY, pay frequency, payment and PA amounts
 *   3. fetch_global_stats end to end against a fixed mocked network
 *
 * A failure here means a value changed. That is not necessarily a bug, but it
 * is never something to "fix" by regenerating the fixture without first
 * understanding which number moved and why.
 */

const REWARD_CASES = [
  { label: 'typical', cumulus: 8000, nimbus: 3000, stratus: 1400 },
  { label: 'small-network', cumulus: 10, nimbus: 5, stratus: 2 },
  { label: 'large-network', cumulus: 50000, nimbus: 20000, stratus: 9000 },
  { label: 'lopsided', cumulus: 1, nimbus: 99999, stratus: 3 },
  { label: 'asymmetric', cumulus: 12345, nimbus: 678, stratus: 91011 }
];

const RAW_NODES = [
  {
    ip: '1.2.3.4:16127',
    tier: 'cumulus',
    payment_address: 't1aaa',
    added_height: 100,
    confirmed_height: 900,
    last_confirmed_height: 1000,
    activesince: '1700000000',
    collateral: 'COutPoint(abc, 0)',
    rank: 5
  },
  {
    ip: '5.6.7.8',
    tier: 'NIMBUS',
    payment_address: 't1bbb',
    added_height: 200,
    confirmed_height: 800,
    last_confirmed_height: 990,
    activesince: '1700000001',
    collateral: 'COutPoint(def, 1)',
    rank: 12
  },
  {
    ip: '9.10.11.12:16137',
    tier: 'Stratus',
    payment_address: 't1ccc',
    added_height: 0,
    confirmed_height: 0,
    last_confirmed_height: 0,
    activesince: '0',
    collateral: '',
    rank: 0
  }
];

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function realisticStore() {
  const gstore = create_global_store();
  gstore.node_count.cumulus = 8000;
  gstore.node_count.nimbus = 3000;
  gstore.node_count.stratus = 1400;
  gstore.node_count.total = 12400;
  fill_rewards(gstore);
  return gstore;
}

describe('apidata export surface', () => {
  it('exposes exactly the same names, types and arities as before the split', () => {
    const actual = {};
    for (const key of Object.keys(apidata).sort()) {
      const value = apidata[key];
      actual[key] =
        typeof value === 'function'
          ? { type: 'function', length: value.length, name: value.name }
          : {
              type: typeof value,
              value: value === undefined ? '__undefined__' : JSON.stringify(value)?.slice(0, 200)
            };
    }
    expect(actual).toEqual(baseline.surface);
  });

  it('resolves every export to something defined', () => {
    // The specific failure a barrel introduces: `export { x } from 'y'` where y
    // no longer exports x. It compiles; x is simply undefined at every call site.
    const undefinedExports = Object.keys(apidata).filter((key) => apidata[key] === undefined);
    expect(undefinedExports).toEqual([]);
  });
});

describe('reward maths parity', () => {
  it.each(REWARD_CASES.map((c) => [c.label, c]))(
    '%s network reproduces the captured projections',
    (label, c) => {
      const gstore = create_global_store();
      gstore.node_count.cumulus = c.cumulus;
      gstore.node_count.nimbus = c.nimbus;
      gstore.node_count.stratus = c.stratus;
      gstore.node_count.total = c.cumulus + c.nimbus + c.stratus;
      fill_rewards(gstore);

      expect({ reward_projections: gstore.reward_projections, node_count: gstore.node_count }).toEqual(
        baseline.rewards[label]
      );
    }
  );

  it('an empty store matches the captured shape', () => {
    expect(plain(create_global_store())).toEqual(baseline.rewards.__empty_store);
  });

  it('tier projections start from the captured zeroed shape', () => {
    expect(tier_global_projections()).toEqual(baseline.rewards.__tier_projection_shape);
  });
});

describe('node transformation parity', () => {
  it('transforms raw daemon records identically', () => {
    const out = RAW_NODES.map((n) => transformRawNode({ ...n }));
    expect(plain(out)).toEqual(baseline.nodes.transformed);
  });

  it('normalises tiers identically', () => {
    const out = RAW_NODES.map((n) => normalize_raw_node_tier({ ...n }));
    expect(plain(out)).toEqual(baseline.nodes.tiers);
  });

  it('computes the maintenance window identically across the 480-block boundary', () => {
    const out = [0, 100, 479, 480, 481, 1000].map((h) => calc_mtn_window(h, 1000));
    expect(out).toEqual(baseline.nodes.mtn);
  });

  it('fills wallet health identically', () => {
    const health = wallet_health_full();
    health.cumulus.amount = 2;
    health.nimbus.amount = 1;
    health.stratus.amount = 3;
    fill_health(health, realisticStore());

    expect(plain(health)).toEqual(baseline.nodes.health_filled);
  });
});

describe('fetch_global_stats parity', () => {
  const NODES = [
    {
      ip: '1.2.3.4:16127',
      tier: 'CUMULUS',
      payment_address: 't1aaa',
      added_height: 100,
      confirmed_height: 900,
      last_confirmed_height: 1000,
      activesince: '1700000000',
      collateral: 'COutPoint(abc, 0)'
    },
    {
      ip: '5.6.7.8',
      tier: 'NIMBUS',
      payment_address: 't1bbb',
      added_height: 200,
      confirmed_height: 800,
      last_confirmed_height: 990,
      activesince: '1700000001',
      collateral: 'COutPoint(def, 1)'
    },
    {
      ip: '9.10.11.12:16137',
      tier: 'STRATUS',
      payment_address: 't1aaa',
      added_height: 300,
      confirmed_height: 700,
      last_confirmed_height: 980,
      activesince: '1700000002',
      collateral: 'COutPoint(ghi, 2)'
    }
  ];

  const BENCH = [
    {
      ip: '1.2.3.4:16127',
      benchmark: {
        bench: { eps: 100, ddwrite: 50, totalstorage: 200, ram: 8, cores: 4, thunder: false },
        status: 'success'
      }
    },
    {
      ip: '5.6.7.8:16127',
      benchmark: { bench: { eps: 200, ddwrite: 60, totalstorage: 400, ram: 32, cores: 8, thunder: true } }
    }
  ];

  const GEO = [
    {
      ip: '1.2.3.4:16127',
      geolocation: { country: 'Germany', countryCode: 'DE', lat: '52.5', lon: '13.4', org: 'Hetzner' }
    },
    {
      ip: '9.10.11.12:16137',
      geolocation: { country: 'United States', countryCode: 'US', lat: '40.7', lon: '-74.0', org: 'AWS' }
    }
  ];

  const SPECS = [
    {
      name: 'appA',
      owner: 'owner1',
      instances: 3,
      height: 500,
      expire: 22000,
      compose: [{ repotag: 'runonflux/folding-at-home:latest', cpu: 1, ram: 1024, hdd: 10 }]
    },
    {
      name: 'appB',
      owner: 'owner2',
      instances: 1,
      height: 600,
      expire: 22000,
      compose: [{ repotag: 'mysql:8', cpu: 2, ram: 2048, hdd: 20 }]
    }
  ];

  const RESOURCES = [
    { ip: '1.2.3.4:16127', apps: { resources: { appsRamLocked: 2048, appsCpusLocked: 2, appsHddLocked: 40 } } }
  ];

  function ok(data) {
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => data });
  }

  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      const u = typeof url === 'string' ? url : String(url);
      if (u.includes('/daemon/getzelnodecount'))
        return ok({ data: { 'cumulus-enabled': 8000, 'nimbus-enabled': 3000, 'stratus-enabled': 1400, total: 12400 } });
      if (u.includes('/daemon/getinfo')) return ok({ data: { blocks: 1234567, version: 5.1 } });
      if (u.includes('/daemon/getdoslist')) return ok({ data: [] });
      if (u.includes('viewdeterministiczelnodelist')) return ok({ data: NODES });
      if (u.includes('/api/addr/')) return ok({ balance: 4321.99 });
      if (u.includes('/api/txs')) return ok({ txs: [], pagesTotal: 1 });
      if (u.includes('richest-addresses-list')) return ok([]);
      if (u.includes('/apps/globalappsspecifications')) return ok({ status: 'success', data: SPECS });
      if (u.includes('projection=apps.resources')) return ok({ status: 'success', data: RESOURCES });
      if (u.includes('projection=benchmark')) return ok({ status: 'success', data: BENCH });
      if (u.includes('projection=geolocation')) return ok({ status: 'success', data: GEO });
      if (u.includes('projection=flux')) return ok({ status: 'success', data: [{ flux: { version: '5.1.0' } }] });
      if (u.includes('frontendData')) return ok({ latest_price: 0.25 });
      if (u.includes('package.json')) return ok({ version: '1.2.3' });
      if (u.includes('benchmarkinfo.json')) return ok({ version: '1.0.0' });
      return ok({});
    });
  });

  it('produces the captured store for a fixed network', async () => {
    const store = await fetch_global_stats('t1aaa');

    // Wall-clock fields are normalised: they are provenance, not calculation,
    // and would differ between any two runs.
    const normalised = JSON.parse(
      JSON.stringify(store, (key, value) =>
        key === 'runningAppsFetchedAt' || key === 'fetchedAt' || key === 'timestamp'
          ? '__NORMALISED__'
          : value
      )
    );

    expect(normalised).toEqual(baseline.globalStore);
  });
});
