import { aggregateRegions, selectRegionStats, countriesIn } from './regionStats';

/*
 * Issue #254 -- the Network tab's three stat cards, scoped to whatever
 * continent or country is selected.
 *
 * The join that matters: iterate the NODE LIST, not the geolocation feed.
 * The node list carries ip:port AND tier together, so every node gets its exact
 * tier; geolocation is per-machine and is looked up by bare host. Driving this
 * from the geo feed instead would reintroduce the mixed-tier collapse that #215
 * was about -- one host running a CUMULUS and a STRATUS cannot be tiered from
 * geolocation alone.
 */
const NODES = [
  { ip: '1.1.1.1:16137', tier: 'CUMULUS', payment_address: 't1alice' },
  { ip: '1.1.1.1:16147', tier: 'STRATUS', payment_address: 't1alice' },  // same host, different tier
  { ip: '2.2.2.2:16137', tier: 'NIMBUS',  payment_address: 't1bob' },
  { ip: '3.3.3.3:16137', tier: 'CUMULUS', payment_address: 't1carol' },
  { ip: '9.9.9.9:16137', tier: 'CUMULUS', payment_address: 't1dave' },   // no geolocation
];

const GEO_BY_HOST = {
  '1.1.1.1': { continent: 'Europe', country: 'Germany', countryCode: 'DE' },
  '2.2.2.2': { continent: 'Europe', country: 'France', countryCode: 'FR' },
  '3.3.3.3': { continent: 'North America', country: 'United States', countryCode: 'US' },
};

const CAP_BY_NODE = {
  '1.1.1.1:16137': { cores: 4, ram: 8, ssd: 220 },
  '1.1.1.1:16147': { cores: 16, ram: 64, ssd: 1000 },
  '2.2.2.2:16137': { cores: 8, ram: 32, ssd: 440 },
  // 3.3.3.3 deliberately absent: not every node reports a benchmark
};

const APPS_BY_NODE = {
  '1.1.1.1:16137': ['FoldingAtRunOnFlux22', 'presearchnode'],
  '2.2.2.2:16137': ['FoldingAtRunOnFlux23'],
};

// Stands in for the spec-index lookup the real caller supplies.
const CATEGORY_OF = (name) => (/folding/i.test(name) ? 'computing' : 'other');

const AGG = () => aggregateRegions({
  nodes: NODES, geoByHost: GEO_BY_HOST, capByNode: CAP_BY_NODE, appsByNode: APPS_BY_NODE, categoryOf: CATEGORY_OF
});

describe('aggregateRegions', () => {
  it('tiers every node exactly, including two tiers on one host', () => {
    // 1.1.1.1 runs a CUMULUS and a STRATUS. Both must be counted as themselves.
    const eu = AGG().continents.Europe;
    expect(eu.tiers).toEqual({ CUMULUS: 1, NIMBUS: 1, STRATUS: 1 });
    expect(eu.nodes).toBe(3);
  });

  it('counts distinct wallets, not nodes', () => {
    // t1alice owns two nodes in Europe; that is one wallet.
    expect(AGG().continents.Europe.wallets).toBe(2);
  });

  it('sums capacity only over nodes that actually reported it', () => {
    const eu = AGG().continents.Europe;
    expect(eu.cores).toBe(28);   // 4 + 16 + 8
    expect(eu.ram).toBe(104);    // 8 + 64 + 32
    expect(eu.ssd).toBe(1660);   // 220 + 1000 + 440
    expect(eu.capNodes).toBe(3);
  });

  it('reports how many nodes lacked a benchmark, so the figure can be qualified', () => {
    const na = AGG().continents['North America'];
    expect(na.nodes).toBe(1);
    expect(na.capNodes).toBe(0);
    expect(na.cores).toBe(0);
  });

  it('puts nodes with no geolocation in an explicit Unlocated bucket', () => {
    const agg = AGG();
    expect(agg.continents.Unlocated.nodes).toBe(1);
    expect(agg.continents.Unlocated.tiers.CUMULUS).toBe(1);
  });

  it('reconciles: continents sum to the network total', () => {
    const agg = AGG();
    const summed = Object.values(agg.continents).reduce((n, c) => n + c.nodes, 0);
    expect(summed).toBe(agg.network.nodes);
    expect(agg.network.nodes).toBe(NODES.length);
  });

  it('counts app instances per category using the supplied categoriser', () => {
    const eu = AGG().continents.Europe;
    expect(eu.appInstances).toBe(3);
    expect(eu.appsByCategory).toEqual({ computing: 2, other: 1 });
    expect(Object.values(eu.appsByCategory).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('puts everything in "other" when no categoriser is supplied, rather than quietly using a different one', () => {
    const agg = aggregateRegions({ nodes: NODES, geoByHost: GEO_BY_HOST, capByNode: {}, appsByNode: APPS_BY_NODE });
    expect(agg.network.appsByCategory).toEqual({ other: 3 });
  });

  it('aggregates countries separately from continents', () => {
    const agg = AGG();
    expect(agg.countries.DE.nodes).toBe(2);
    expect(agg.countries.FR.nodes).toBe(1);
    expect(agg.countries.DE.continent).toBe('Europe');
    expect(agg.countries.DE.country).toBe('Germany');
  });

  it('network totals cover every node regardless of location', () => {
    const n = AGG().network;
    expect(n.nodes).toBe(5);
    expect(n.tiers).toEqual({ CUMULUS: 3, NIMBUS: 1, STRATUS: 1 });
    expect(n.wallets).toBe(4);
  });

  it('survives empty inputs rather than throwing', () => {
    const agg = aggregateRegions({ nodes: [], geoByHost: {}, capByNode: {}, appsByNode: {} });
    expect(agg.network.nodes).toBe(0);
    expect(agg.continents).toEqual({});
  });

  it('tolerates a node with no tier', () => {
    const agg = aggregateRegions({
      nodes: [{ ip: '1.1.1.1:1', payment_address: 't1x' }],
      geoByHost: GEO_BY_HOST, capByNode: {}, appsByNode: {}
    });
    expect(agg.network.nodes).toBe(1);
    expect(agg.network.tiers.CUMULUS || 0).toBe(0);
  });
});

describe('selectRegionStats', () => {
  it('returns network totals at the network level', () => {
    expect(selectRegionStats(AGG(), { level: 'network' }).nodes).toBe(5);
  });

  it('returns the continent when one is selected', () => {
    expect(selectRegionStats(AGG(), { level: 'continent', continent: 'Europe' }).nodes).toBe(3);
  });

  it('returns the country when one is selected', () => {
    expect(selectRegionStats(AGG(), { level: 'country', country: 'DE' }).nodes).toBe(2);
  });

  it('falls back to network totals for an unknown selection rather than crashing', () => {
    expect(selectRegionStats(AGG(), { level: 'continent', continent: 'Atlantis' }).nodes).toBe(5);
    expect(selectRegionStats(AGG(), { level: 'country', country: 'ZZ' }).nodes).toBe(5);
  });
});

describe('countriesIn', () => {
  it('lists a continent\'s countries, busiest first', () => {
    expect(countriesIn(AGG(), 'Europe').map((c) => c.countryCode)).toEqual(['DE', 'FR']);
  });

  it('is empty for a continent with nothing in it', () => {
    expect(countriesIn(AGG(), 'Antarctica')).toEqual([]);
  });
});
