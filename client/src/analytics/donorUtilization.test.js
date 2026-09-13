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

  /*
   * Issue #344. This test previously asserted the OPPOSITE, and the assertion
   * was wrong.
   *
   * It assumed a benchmark reading describes the physical MACHINE, so two nodes
   * sharing a host had to be deduped or that host's capacity would be
   * double-counted. Measured against the live benchmark feed, the premise does
   * not hold: a benchmark describes ONE NODE'S OWN ALLOCATION.
   *
   *     5.230.172.45    8 nodes, each 4 cores / 7.7 GB / 220 GB
   *     31.165.225.118  4c, 4c, 4c, 8c, 16c  -- Cumulus x3, Nimbus, Stratus
   *
   * Those are exactly the Flux tier allocations (Cumulus 4c/8GB/220GB, Nimbus
   * 8c/32GB/440GB, Stratus 16c/64GB/880GB). A host running eight Cumulus nodes
   * really does have 32 cores, and each node truthfully reports its own 4.
   *
   * Deduping to unique hosts therefore kept ONE node's reading and threw the
   * rest away: 4 cores where the donor has 32. Measured across the whole feed
   * -- 6,315 nodes on 2,445 hosts, 816 of them multi-node -- that is a 44%
   * undercount network-wide, and 8x for a donor whose nodes share a host.
   */
  it('sums EVERY node on a shared host, because a benchmark is per node not per machine', () => {
    // Eight Cumulus nodes on one host: the commonest real multi-node shape.
    const cumulus = (port) => ({
      benchmark: { bench: { ipaddress: `1.2.3.4:${port}`, cores: 4, ram: 7.7, totalstorage: 220 } },
    });
    const ports = [16127, 16137, 16147, 16157, 16167, 16177, 16187, 16197];
    const addresses = ports.map((p) => `1.2.3.4:${p}`);

    const result = aggregateDonorUtilization(
      addresses,
      ports.map(cumulus),
      addresses.map((ip) => ({
        ip,
        apps: { resources: { appsCpusLocked: 1, appsRamLocked: 1024, appsHddLocked: 10 } },
      }))
    );

    expect(result.cores.total).toBe(32);
    expect(result.ram.total).toBeCloseTo(61.6, 5);
    expect(result.ssd.total).toBe(1760);
    expect(result.nodesWithCapacity).toBe(8);

    // Utilisation was always per-node and stays so.
    expect(result.cores.utilized).toBe(8);
    expect(result.ram.utilized).toBe(8);
    expect(result.ssd.utilized).toBe(80);

    // The figure the panel actually shows. Host-deduping reported 200%.
    expect(result.cores.percentage).toBeCloseTo(25, 5);
  });

  it('sums mixed tiers on one host at their own allocations', () => {
    // 31.165.225.118's real shape: three Cumulus, one Nimbus, one Stratus.
    const benchmarks = [
      { benchmark: { bench: { ipaddress: '5.6.7.8:16127', cores: 4, ram: 7.7, totalstorage: 240 } } },
      { benchmark: { bench: { ipaddress: '5.6.7.8:16137', cores: 4, ram: 7.7, totalstorage: 240 } } },
      { benchmark: { bench: { ipaddress: '5.6.7.8:16147', cores: 4, ram: 7.7, totalstorage: 240 } } },
      { benchmark: { bench: { ipaddress: '5.6.7.8:16167', cores: 8, ram: 31, totalstorage: 440 } } },
      { benchmark: { bench: { ipaddress: '5.6.7.8:16177', cores: 16, ram: 62, totalstorage: 880 } } },
    ];
    const addresses = ['5.6.7.8:16127', '5.6.7.8:16137', '5.6.7.8:16147', '5.6.7.8:16167', '5.6.7.8:16177'];

    const result = aggregateDonorUtilization(addresses, benchmarks, []);

    // 4 + 4 + 4 + 8 + 16. Host-deduping reported whichever node happened to
    // be written last — 16 here, or 4 on a different feed ordering.
    expect(result.cores.total).toBe(36);
    expect(result.ssd.total).toBe(2040);
  });

  it('counts a node once even if the donor list repeats it', () => {
    // Per-ADDRESS deduping is still needed: one address must not contribute
    // its capacity twice.
    const dup = { benchmark: { bench: { ipaddress: '9.9.9.9:16127', cores: 4, ram: 8, totalstorage: 220 } } };

    const result = aggregateDonorUtilization(['9.9.9.9:16127', '9.9.9.9:16127'], [dup], []);

    expect(result.cores.total).toBe(4);
    expect(result.nodesWithCapacity).toBe(1);
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
