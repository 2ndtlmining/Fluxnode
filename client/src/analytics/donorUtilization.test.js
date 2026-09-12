import { aggregateDonorUtilization, fetch_donor_utilization_source } from './donorUtilization';

const benchmarks = [
  { benchmark: { bench: { ipaddress: '1.2.3.4:16127', cores: 8, ram: 32, totalstorage: 440 } } },
  { benchmark: { bench: { ipaddress: '5.6.7.8:16127', cores: 4, ram: 8, totalstorage: 220 } } },
];

const resources = [
  { ip: '1.2.3.4:16127', apps: { resources: { appsCpusLocked: 2, appsRamLocked: 4096, appsHddLocked: 50 } } },
  { ip: '5.6.7.8:16127', apps: { resources: { appsCpusLocked: 1, appsRamLocked: 1024, appsHddLocked: 10 } } },
];

describe('aggregateDonorUtilization', () => {
  it('sums capacity and utilised resources across the donor\'s own nodes', () => {
    const result = aggregateDonorUtilization(['1.2.3.4:16127', '5.6.7.8:16127'], benchmarks, resources);

    expect(result.nodesWithCapacity).toBe(2);
    expect(result.cores).toEqual({ utilized: 3, total: 12, percentage: 25 });
    expect(result.ram).toEqual({ utilized: 5, total: 40, percentage: 12.5 }); // (4096+1024)/1024 = 5 GB
    expect(result.ssd).toEqual({ utilized: 60, total: 660, percentage: 60 / 660 * 100 });
  });

  it('only counts the donor\'s own addresses, not every node in the lookup', () => {
    const result = aggregateDonorUtilization(['1.2.3.4:16127'], benchmarks, resources);
    expect(result.nodesWithCapacity).toBe(1);
    expect(result.cores).toEqual({ utilized: 2, total: 8, percentage: 25 });
  });

  it('skips a donor address with no matching benchmark/resource entry, rather than throwing', () => {
    const result = aggregateDonorUtilization(['9.9.9.9:16127'], benchmarks, resources);
    expect(result.nodesWithCapacity).toBe(0);
    expect(result.cores).toEqual({ utilized: 0, total: 0, percentage: 0 });
  });

  it('returns all zeros for no donor addresses', () => {
    const result = aggregateDonorUtilization([], benchmarks, resources);
    expect(result).toEqual({
      nodesWithCapacity: 0,
      cores: { utilized: 0, total: 0, percentage: 0 },
      ram: { utilized: 0, total: 0, percentage: 0 },
      ssd: { utilized: 0, total: 0, percentage: 0 },
    });
  });

  it('handles missing/undefined benchmarks and resources gracefully', () => {
    expect(() => aggregateDonorUtilization(['1.2.3.4:16127'], undefined, undefined)).not.toThrow();
    const result = aggregateDonorUtilization(['1.2.3.4:16127'], undefined, undefined);
    expect(result.nodesWithCapacity).toBe(0);
  });

  it('does not double-count a host\'s capacity when the donor runs two nodes on it (different ports)', () => {
    const sharedHostBenchmarks = [
      { benchmark: { bench: { ipaddress: '1.2.3.4:16127', cores: 8, ram: 32, totalstorage: 440 } } },
      { benchmark: { bench: { ipaddress: '1.2.3.4:16227', cores: 8, ram: 32, totalstorage: 440 } } },
    ];
    const sharedHostResources = [
      { ip: '1.2.3.4:16127', apps: { resources: { appsCpusLocked: 2, appsRamLocked: 2048, appsHddLocked: 20 } } },
      { ip: '1.2.3.4:16227', apps: { resources: { appsCpusLocked: 1, appsRamLocked: 1024, appsHddLocked: 10 } } },
    ];

    const result = aggregateDonorUtilization(
      ['1.2.3.4:16127', '1.2.3.4:16227'],
      sharedHostBenchmarks,
      sharedHostResources
    );

    // Capacity counted ONCE for the shared host, not once per node on it.
    expect(result.nodesWithCapacity).toBe(1);
    expect(result.cores.total).toBe(8);
    expect(result.ram.total).toBe(32);
    expect(result.ssd.total).toBe(440);

    // Utilisation IS per-node — both nodes' reservations still sum.
    expect(result.cores.utilized).toBe(3);
    expect(result.ram.utilized).toBe(3); // (2048+1024)/1024
    expect(result.ssd.utilized).toBe(30);
  });
});

/*
 * The Donor tab re-aggregates utilisation when a node is selected (issue
 * #299), so it needs the raw feeds, not just the summed result. This is the
 * accessor that hands them over — the aggregation itself is already covered
 * above and is not re-tested through the network path.
 */
describe('fetch_donor_utilization_source', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns the raw benchmark and resource feeds, so a caller can re-aggregate a subset', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', data: String(url).includes('benchmark') ? benchmarks : resources }),
      })
    );

    const source = await fetch_donor_utilization_source();

    expect(Array.isArray(source.benchmarks)).toBe(true);
    expect(Array.isArray(source.resources)).toBe(true);
    // Proves the halves are not swapped: only the benchmark feed is shaped
    // { benchmark: { bench } }, only the resource feed carries a bare `ip`.
    expect(source.benchmarks[0]).toHaveProperty('benchmark.bench.ipaddress');
    expect(source.resources[0]).toHaveProperty('ip');
  });
});
