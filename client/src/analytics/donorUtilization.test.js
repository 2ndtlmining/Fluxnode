import { aggregateDonorUtilization } from './donorUtilization';

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
});
