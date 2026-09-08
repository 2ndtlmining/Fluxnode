import { aggregateDonorAppsByCategory } from './donorApps';

const specIndex = {
  'folding1': { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  'wp1': { repotag: 'runonflux/wp-nginx:latest', category: 'web' },
  'mc1': { repotag: 'itzg/minecraft-server:latest', category: 'gaming' },
  'boinc1': { repotag: 'boinc/client:latest', category: 'computing' },
  'watchtower': { repotag: 'containrrr/watchtower:latest', category: 'other' },
};

const nodesByIp = {
  '1.2.3.4:16127': { containerAppNames: ['folding1', 'wp1'] },
  '5.6.7.8:16127': { containerAppNames: ['mc1'] },
  '9.9.9.9:16127': { containerAppNames: ['unrelated'] },
};

describe('aggregateDonorAppsByCategory', () => {
  it('tallies one entry per running container, by category, across the donor\'s own nodes only', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127', '5.6.7.8:16127'], specIndex);

    expect(totalApps).toBe(3);
    const byCat = Object.fromEntries(categories.map((c) => [c.category, c.count]));
    expect(byCat.computing).toBe(1);
    expect(byCat.web).toBe(1);
    expect(byCat.gaming).toBe(1);
  });

  it('sorts categories descending by count', () => {
    const twoOnOneNode = {
      '1.1.1.1:1': { containerAppNames: ['folding1', 'boinc1', 'mc1'] },
    };
    const { categories } = aggregateDonorAppsByCategory(twoOnOneNode, ['1.1.1.1:1'], specIndex);
    expect(categories[0]).toEqual({ category: 'computing', count: 2 });
    expect(categories[1]).toEqual({ category: 'gaming', count: 1 });
  });

  it('never counts an address that is not the donor\'s own', () => {
    const { totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127'], specIndex);
    expect(totalApps).toBe(2); // not 3 — 9.9.9.9's app is excluded
  });

  it('skips a donor address with no matching nodesByIp entry, rather than throwing', () => {
    expect(() => aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'], specIndex)).not.toThrow();
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'], specIndex);
    expect(categories).toEqual([]);
    expect(totalApps).toBe(0);
  });

  it('returns an empty result for no donor addresses or an empty/undefined lookup', () => {
    expect(aggregateDonorAppsByCategory(nodesByIp, [], specIndex)).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory({}, ['1.2.3.4:16127'], specIndex)).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory(undefined, undefined, specIndex)).toEqual({ categories: [], totalApps: 0 });
  });

  it('excludes containrrr/watchtower from the tally by resolved repotag', () => {
    const nodesByIpWithWatchtower = {
      '1.2.3.4:16127': { containerAppNames: ['folding1', 'watchtower'] },
    };
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIpWithWatchtower, ['1.2.3.4:16127'], specIndex);
    expect(totalApps).toBe(1);
    expect(categories).toEqual([{ category: 'computing', count: 1 }]);
  });

  it('normalizes the donor address before lookup (trims whitespace)', () => {
    const cleanNodesByIp = { '1.2.3.4:16127': { containerAppNames: ['mc1'] } };
    const { totalApps } = aggregateDonorAppsByCategory(cleanNodesByIp, [' 1.2.3.4:16127 '], specIndex);
    expect(totalApps).toBe(1);
  });

  it('falls back to "other" for a running app whose spec is missing, without throwing', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['9.9.9.9:16127'], specIndex);
    expect(totalApps).toBe(1);
    expect(categories).toEqual([{ category: 'other', count: 1 }]);
  });
});
