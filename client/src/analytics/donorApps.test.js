import { aggregateDonorAppsByCategory } from './donorApps';

const nodesByIp = {
  '1.2.3.4:16127': { images: ['yurinnick/folding-at-home:latest', 'runonflux/wp-nginx:latest'] },
  '5.6.7.8:16127': { images: ['itzg/minecraft-server:latest'] },
  '9.9.9.9:16127': { images: ['someone/unrelated-node-not-the-donors:latest'] },
};

describe('aggregateDonorAppsByCategory', () => {
  it('tallies one entry per running container (image), by category, across the donor\'s own nodes only', () => {
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127', '5.6.7.8:16127']);

    expect(totalApps).toBe(3);
    // computing: folding-at-home, web: wp-nginx, gaming: minecraft
    const byCat = Object.fromEntries(categories.map((c) => [c.category, c.count]));
    expect(byCat.computing).toBe(1);
    expect(byCat.web).toBe(1);
    expect(byCat.gaming).toBe(1);
  });

  it('sorts categories descending by count', () => {
    const twoOnOneNode = {
      '1.1.1.1:1': { images: ['yurinnick/folding-at-home:latest', 'boinc/client:latest', 'itzg/minecraft-server:latest'] },
    };
    const { categories } = aggregateDonorAppsByCategory(twoOnOneNode, ['1.1.1.1:1']);
    expect(categories[0]).toEqual({ category: 'computing', count: 2 });
    expect(categories[1]).toEqual({ category: 'gaming', count: 1 });
  });

  it('never counts an address that is not the donor\'s own', () => {
    const { totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['1.2.3.4:16127']);
    expect(totalApps).toBe(2); // not 3 — 9.9.9.9's app is excluded
  });

  it('skips a donor address with no matching nodesByIp entry, rather than throwing', () => {
    expect(() => aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0'])).not.toThrow();
    const { categories, totalApps } = aggregateDonorAppsByCategory(nodesByIp, ['0.0.0.0:0']);
    expect(categories).toEqual([]);
    expect(totalApps).toBe(0);
  });

  it('returns an empty result for no donor addresses or an empty/undefined lookup', () => {
    expect(aggregateDonorAppsByCategory(nodesByIp, [])).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory({}, ['1.2.3.4:16127'])).toEqual({ categories: [], totalApps: 0 });
    expect(aggregateDonorAppsByCategory(undefined, undefined)).toEqual({ categories: [], totalApps: 0 });
  });
});
