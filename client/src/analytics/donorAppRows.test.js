import { buildDonorAppRows, tallyRowCategories } from './donorAppRows';

/*
 * Spec entries are the shape buildSpecIndex() produces: specResources() fields
 * spread flat, plus category/instances/compose. Enterprise entries carry null
 * resources rather than zeros — that distinction is the whole point of
 * specResources(), and the table must not turn it back into "0.00 cores".
 */
const specIndex = {
  folding1: {
    repotag: 'yurinnick/folding-at-home:latest',
    category: 'computing',
    cpuPerInst: 4,
    ramGBPerInst: 8,
    ssdGBPerInst: 50,
    isEnterprise: false,
    compose: null,
  },
  wp1: {
    repotag: 'runonflux/wp-nginx:latest',
    category: 'web',
    cpuPerInst: 1.5,
    ramGBPerInst: 2,
    ssdGBPerInst: 10,
    isEnterprise: false,
    compose: [
      { name: 'nginx', repotag: 'runonflux/wp-nginx:latest' },
      { name: 'mysql', repotag: 'runonflux/wp-mysql:8' },
    ],
  },
  ent1: {
    repotag: '',
    category: 'enterprise',
    cpuPerInst: null,
    ramGBPerInst: null,
    ssdGBPerInst: null,
    isEnterprise: true,
    compose: null,
  },
  watchtower: {
    repotag: 'containrrr/watchtower:latest',
    category: 'other',
    cpuPerInst: 0.1,
    ramGBPerInst: 0.1,
    ssdGBPerInst: 1,
    isEnterprise: false,
    compose: null,
  },
};

const nodesByIp = {
  '1.2.3.4:16127': { containerAppNames: ['folding1', 'wp1'], containerComponents: [null, 'mysql'] },
  '5.6.7.8:16127': { containerAppNames: ['ent1'], containerComponents: [null] },
  '9.9.9.9:16127': { containerAppNames: ['unrelated'], containerComponents: [null] },
};

const ALL = ['1.2.3.4:16127', '5.6.7.8:16127'];

describe('buildDonorAppRows', () => {
  it('emits one row per running container on the donor\'s own nodes', () => {
    const rows = buildDonorAppRows(nodesByIp, ALL, specIndex);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name).sort()).toEqual(['ent1', 'folding1', 'wp1']);
  });

  it('tags every row with the node it runs on, so a node selection can filter it', () => {
    const rows = buildDonorAppRows(nodesByIp, ALL, specIndex);

    const onFirst = rows.filter((r) => r.nodeAddress === '1.2.3.4:16127');
    expect(onFirst.map((r) => r.name).sort()).toEqual(['folding1', 'wp1']);
  });

  it('carries the per-instance resources off the spec', () => {
    const [folding] = buildDonorAppRows(nodesByIp, ['1.2.3.4:16127'], specIndex);

    expect(folding).toMatchObject({ name: 'folding1', cpu: 4, ramGB: 8, ssdGB: 50, category: 'computing' });
  });

  it('resolves the repotag of the exact component a container is running', () => {
    const rows = buildDonorAppRows(nodesByIp, ['1.2.3.4:16127'], specIndex);
    const wp = rows.find((r) => r.name === 'wp1');

    // The container is wp1's `mysql` component, not its primary nginx image.
    expect(wp.repotag).toBe('runonflux/wp-mysql:8');
  });

  it('reports unknown resources as null rather than zero for an enterprise app', () => {
    const [ent] = buildDonorAppRows(nodesByIp, ['5.6.7.8:16127'], specIndex);

    expect(ent.cpu).toBeNull();
    expect(ent.ramGB).toBeNull();
    expect(ent.ssdGB).toBeNull();
  });

  it('falls back to "other" with unknown resources when the spec is missing', () => {
    const [row] = buildDonorAppRows(nodesByIp, ['9.9.9.9:16127'], specIndex);

    expect(row).toMatchObject({ name: 'unrelated', category: 'other', repotag: '', cpu: null, ramGB: null, ssdGB: null });
  });

  it('excludes containrrr/watchtower by resolved repotag', () => {
    const withWatchtower = {
      '1.1.1.1:1': { containerAppNames: ['folding1', 'watchtower'], containerComponents: [null, null] },
    };

    const rows = buildDonorAppRows(withWatchtower, ['1.1.1.1:1'], specIndex);

    expect(rows.map((r) => r.name)).toEqual(['folding1']);
  });

  it('gives two containers of the same app on one node distinct keys', () => {
    const twice = {
      '1.1.1.1:1': { containerAppNames: ['folding1', 'folding1'], containerComponents: [null, null] },
    };

    const rows = buildDonorAppRows(twice, ['1.1.1.1:1'], specIndex);

    expect(rows).toHaveLength(2);
    expect(rows[0].key).not.toBe(rows[1].key);
  });

  it('normalizes the donor address before lookup', () => {
    const rows = buildDonorAppRows(nodesByIp, [' 1.2.3.4:16127 '], specIndex);

    expect(rows).toHaveLength(2);
  });

  it('returns an empty list for missing nodes, empty input or an absent lookup', () => {
    expect(buildDonorAppRows(nodesByIp, ['0.0.0.0:0'], specIndex)).toEqual([]);
    expect(buildDonorAppRows(nodesByIp, [], specIndex)).toEqual([]);
    expect(buildDonorAppRows(undefined, undefined, specIndex)).toEqual([]);
  });

  it('tolerates a node entry with no index-aligned components array', () => {
    const noComponents = { '1.1.1.1:1': { containerAppNames: ['folding1'] } };

    const rows = buildDonorAppRows(noComponents, ['1.1.1.1:1'], specIndex);

    expect(rows).toHaveLength(1);
    expect(rows[0].component).toBeNull();
    expect(rows[0].repotag).toBe('yurinnick/folding-at-home:latest');
  });
});

describe('tallyRowCategories', () => {
  it('counts rows by category, descending', () => {
    const rows = [
      { category: 'computing' },
      { category: 'web' },
      { category: 'computing' },
    ];

    expect(tallyRowCategories(rows)).toEqual({
      categories: [
        { category: 'computing', count: 2 },
        { category: 'web', count: 1 },
      ],
      totalApps: 3,
    });
  });

  it('returns an empty tally for no rows', () => {
    expect(tallyRowCategories([])).toEqual({ categories: [], totalApps: 0 });
    expect(tallyRowCategories(undefined)).toEqual({ categories: [], totalApps: 0 });
  });

  it('tallies a filtered slice of rows, so a node selection narrows the categories', () => {
    const rows = buildDonorAppRows(nodesByIp, ALL, specIndex);

    const justFirstNode = rows.filter((r) => r.nodeAddress === '1.2.3.4:16127');

    expect(tallyRowCategories(justFirstNode).totalApps).toBe(2);
    expect(tallyRowCategories(rows).totalApps).toBe(3);
  });
});
