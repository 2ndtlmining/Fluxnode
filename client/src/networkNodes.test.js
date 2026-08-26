import { buildWorkhorseNodes, hostOf } from './networkNodes';

/*
 * The join is the risky part: four sources keyed on a node address that
 * sometimes carries a port and sometimes does not, from three different
 * fluxinfo projections. Everything else in the showcase is presentation.
 */

const topNodes = [
  { ip: '82.66.83.104:16147', tier: 'CUMULUS', appCount: 15, images: ['a/one:latest', 'b/two:latest'] },
  { ip: '99.56.151.69', tier: 'STRATUS', appCount: 13, images: ['c/three:latest'] },
  { ip: '98.174.3.181', tier: 'CUMULUS', appCount: 11, images: ['d/four:latest'] },
];

const benchmarks = [
  {
    benchmark: {
      status: { benchmarking: 'CUMULUS' },
      bench: {
        ipaddress: '82.66.83.104:16157',
        cores: 8, ram: 16, totalstorage: 880,
        eps: 2160, ddwrite: 2539, download_speed: 8746.7, upload_speed: 20631.5,
      },
    },
  },
  {
    benchmark: {
      status: { benchmarking: 'STRATUS' },
      bench: {
        ipaddress: '99.56.151.69:16157',
        cores: 32, ram: 64, totalstorage: 1760,
        eps: 4189, ddwrite: 3044, download_speed: 8275, upload_speed: 9133,
      },
    },
  },
  {
    benchmark: {
      status: { benchmarking: 'CUMULUS' },
      bench: { ipaddress: '98.174.3.181', cores: 8, ram: 16, totalstorage: 880, eps: 1, ddwrite: 1 },
    },
  },
];

const geolocations = [
  { geolocation: { ip: '82.66.83.104', country: 'France', countryCode: 'FR' } },
  { geolocation: { ip: '99.56.151.69', country: 'United States', countryCode: 'US' } },
  { geolocation: { ip: '98.174.3.181', country: 'United States', countryCode: 'US' } },
];

const resources = [
  { ip: '82.66.83.104:16147', apps: { resources: { appsCpusLocked: 5.2, appsRamLocked: 5800, appsHddLocked: 208 } } },
  { ip: '99.56.151.69', apps: { resources: { appsCpusLocked: 14.9, appsRamLocked: 14600, appsHddLocked: 283 } } },
  { ip: '98.174.3.181', apps: { resources: { appsCpusLocked: 4.5, appsRamLocked: 5656, appsHddLocked: 153 } } },
];

describe('hostOf', () => {
  it('strips the port', () => {
    expect(hostOf('82.66.83.104:16147')).toBe('82.66.83.104');
    expect(hostOf('82.66.83.104')).toBe('82.66.83.104');
    expect(hostOf(undefined)).toBe('');
  });
});

describe('buildWorkhorseNodes', () => {
  const out = buildWorkhorseNodes(topNodes, benchmarks, geolocations, resources);

  it('returns three nodes, busiest first', () => {
    expect(out).toHaveLength(3);
    expect(out.map((n) => n.appCount)).toEqual([15, 13, 11]);
  });

  it('joins across differing port suffixes', () => {
    // apps say :16147, benchmark says :16157, geolocation has no port
    expect(out[0].country).toBe('France');
    expect(out[0].tier).toBe('CUMULUS');
    expect(out[0].capacity.cores).toBe(8);
  });

  it('carries capacity and utilisation so headroom can be shown', () => {
    expect(out[0].capacity).toEqual({ cores: 8, ramGB: 16, ssdGB: 880 });
    expect(out[0].utilised.cores).toBe(5.2);
    expect(out[0].utilised.ssdGB).toBe(208);
  });

  it('converts locked RAM from MB to GB', () => {
    // 5800 MB reported -> 5.66 GB, so it can sit next to a GB capacity
    expect(out[0].utilised.ramGB).toBeCloseTo(5800 / 1024, 6);
  });

  it('carries the benchmark figures', () => {
    expect(out[0].benchmark).toEqual({
      eps: 2160, dws: 2539, downloadSpeed: 8746.7, uploadSpeed: 20631.5,
    });
  });

  it('keeps the app images for the list', () => {
    expect(out[0].images).toEqual(['a/one:latest', 'b/two:latest']);
  });

  it('still renders nodes when benchmarks are unavailable', () => {
    // The 3.45 MB benchmark projection returns status=error for minutes at a
    // time. Requiring it would make the whole showcase vanish during an outage.
    const noBench = buildWorkhorseNodes(topNodes, [], geolocations, resources);
    expect(noBench).toHaveLength(3);
    expect(noBench[0].benchmark).toBeNull();
    expect(noBench[0].capacity.cores).toBeNull();
    // identity, location, tier, apps and utilisation all survive
    expect(noBench[0].country).toBe('France');
    expect(noBench[0].tier).toBe('CUMULUS');
    expect(noBench[0].appCount).toBe(15);
    expect(noBench[0].utilised.cores).toBe(5.2);
  });

  it('takes tier from the node feed, falling back to the benchmark status', () => {
    expect(out[1].tier).toBe('STRATUS');
    const noTier = buildWorkhorseNodes(
      topNodes.map((n) => ({ ...n, tier: null })), benchmarks, geolocations, resources
    );
    expect(noTier[0].tier).toBe('CUMULUS'); // from benchmark.status.benchmarking
  });

  it('tolerates missing geolocation and resource rows', () => {
    const bare = buildWorkhorseNodes(topNodes, benchmarks, [], []);
    expect(bare).toHaveLength(3);
    expect(bare[0].country).toBeNull();
    expect(bare[0].utilised.cores).toBeNull();
    expect(bare[0].capacity.cores).toBe(8); // benchmark still present
  });

  it('survives every optional source being unavailable at once', () => {
    const nothing = buildWorkhorseNodes(topNodes, [], [], []);
    expect(nothing).toHaveLength(3);
    expect(nothing[0].appCount).toBe(15);
    expect(nothing[0].images).toHaveLength(2);
  });

  it('respects the limit', () => {
    expect(buildWorkhorseNodes(topNodes, benchmarks, geolocations, resources, 2)).toHaveLength(2);
  });

  it('returns empty for missing or empty input', () => {
    expect(buildWorkhorseNodes(undefined, benchmarks, geolocations, resources)).toEqual([]);
    expect(buildWorkhorseNodes([], benchmarks, geolocations, resources)).toEqual([]);
  });
});
