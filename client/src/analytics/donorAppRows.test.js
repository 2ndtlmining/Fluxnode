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
  /*
   * Rows carry nodeAddress and name because the tally now counts INSTANCES,
   * and an instance is (app, node). The original fixture was three bare
   * `{ category }` objects -- a shape buildDonorAppRows cannot produce, and
   * one that silently collapses to a single instance once deduping exists.
   */
  it('counts instances by category, descending', () => {
    const rows = [
      { category: 'computing', name: 'folding1', nodeAddress: '1.1.1.1:16127' },
      { category: 'web', name: 'wp1', nodeAddress: '1.1.1.1:16127' },
      { category: 'computing', name: 'folding1', nodeAddress: '2.2.2.2:16127' },
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

/*
 * Issue #344 (reported alongside the utilisation miscount): the apps table
 * never said how many instances of an app the donor actually runs.
 *
 * One row per running CONTAINER was the right level for the table -- an app on
 * three nodes should be visible as three things running -- but the reader was
 * left to count rows, and for a multi-component app counting rows gives the
 * wrong answer: a two-component app on one node is two rows and ONE instance.
 *
 * So a Flux app instance is one deployment on one NODE, and `yours` counts
 * distinct node addresses. `instances` is the spec's own ordered count, which
 * gives the row its context: three of seventy-five, not just three.
 */
describe('instance counts (#344)', () => {
  const nodesByIp = {
    // The donor's own nodes.
    '1.2.3.4:16127': { containerAppNames: ['folding1', 'wp1', 'wp1'], containerComponents: [null, 'nginx', 'mysql'] },
    '1.2.3.4:16137': { containerAppNames: ['folding1'], containerComponents: [null] },
    '5.6.7.8:16127': { containerAppNames: ['folding1'], containerComponents: [null] },
    // Somebody else's nodes, also running folding1. nodesByIp is the WHOLE
    // network's map -- the donor's addresses are a filter over it, not its
    // contents.
    '9.9.9.9:16127': { containerAppNames: ['folding1'], containerComponents: [null] },
    '9.9.9.9:16137': { containerAppNames: ['folding1'], containerComponents: [null] },
  };
  const addresses = ['1.2.3.4:16127', '1.2.3.4:16137', '5.6.7.8:16127'];

  it('counts an app once per NODE, not once per container', () => {
    const rows = buildDonorAppRows(nodesByIp, addresses, specIndex);

    // wp1 is two containers on ONE node: one instance, not two.
    const wp = rows.filter((r) => r.name === 'wp1');
    expect(wp).toHaveLength(2);
    expect(wp.every((r) => r.yours === 1)).toBe(true);

    // folding1 runs on three of the donor's nodes, two sharing a host.
    const folding = rows.filter((r) => r.name === 'folding1');
    expect(folding).toHaveLength(3);
    expect(folding.every((r) => r.yours === 3)).toBe(true);
  });

  it('counts nodes on a shared host separately', () => {
    // Two of folding1's three nodes are 1.2.3.4 on different ports. They are
    // two instances -- the same ip:port-not-ip distinction that #344's
    // utilisation miscount turned on.
    const rows = buildDonorAppRows(nodesByIp, ['1.2.3.4:16127', '1.2.3.4:16137'], specIndex);

    expect(rows.find((r) => r.name === 'folding1').yours).toBe(2);
  });

  /*
   * THE DENOMINATOR IS RUNNING, NOT ORDERED.
   *
   * The first pass at this used the spec's `instances` field, which is how
   * many were ORDERED. Measured across the live feeds, those two numbers
   * disagree for most apps:
   *
   *     806 apps  running == ordered
   *     483 apps  running <  ordered
   *      10 apps  running >  ordered   -- alphexplorer: 592 running, 30 ordered
   *
   * So "1 / 30" would have been shown for an app with 592 instances up, and
   * for those ten a row could read "3 / 1", which just looks broken. #327
   * settled that this project reports what is actually RUNNING, and the
   * running count is already in nodesByIp -- the same object the rows are
   * built from, so it costs nothing.
   */
  it('reports the network-wide RUNNING count, not the ordered one', () => {
    const rows = buildDonorAppRows(nodesByIp, addresses, specIndex);
    const folding = rows.find((r) => r.name === 'folding1');

    // Three of the donor's nodes plus two strangers' = five running.
    expect(folding.networkInstances).toBe(5);
    expect(folding.yours).toBe(3);
  });

  it('never reports fewer network instances than the donor runs', () => {
    // The nonsense "3 / 1" the ordered figure could produce. The donor's nodes
    // are part of the network, so yours <= networkInstances always holds.
    const rows = buildDonorAppRows(nodesByIp, addresses, specIndex);

    expect(rows.every((r) => r.yours <= r.networkInstances)).toBe(true);
  });

  it('keeps the ordered count separately, since the gap is itself the story', () => {
    // #327 is open on exactly this gap, so the figure is kept for the tooltip
    // rather than discarded -- it is just not the headline.
    const withInstances = { ...specIndex, folding1: { ...specIndex.folding1, instances: 30 } };

    const folding = buildDonorAppRows(nodesByIp, addresses, withInstances).find((r) => r.name === 'folding1');

    expect(folding.ordered).toBe(30);
    expect(folding.networkInstances).toBe(5);
  });

  it('still counts running instances when there is no spec at all', () => {
    // An app running with no matching spec has no ordered count, but it is
    // demonstrably running -- that is observed, not inferred.
    const rows = buildDonorAppRows(
      { '1.2.3.4:16127': { containerAppNames: ['ghost'], containerComponents: [null] } },
      ['1.2.3.4:16127'],
      {}
    );

    expect(rows[0].ordered).toBeNull();
    expect(rows[0].networkInstances).toBe(1);
    expect(rows[0].yours).toBe(1);
  });
});

/*
 * WHAT COUNTS AS ONE APP (#344).
 *
 * A multi-component app runs several containers on ONE node: WordPress is an
 * nginx container and a mysql container, deployed together, as one instance.
 * The table shows a row per container -- that is what is actually running and
 * collapsing it would hide what a node filter is for -- but every COUNT on the
 * screen must agree that this is one app, not two.
 *
 * It did not. The instances column said 1 while the category tally said 2, on
 * the same screen, for the same app. Measured network-wide: 8,354 running
 * containers against 7,104 real instances, so counting containers as apps
 * overstates by 17.6%.
 *
 * Category is taken from the SPEC, not the component, so both of WordPress's
 * rows already carry WordPress's single category -- the tally was never split
 * between "database" and "proxy". The error was only in how many times it
 * counted.
 */
describe('an app instance is one deployment on one node, everywhere (#344)', () => {
  const nodesByIp = {
    '1.2.3.4:16127': { containerAppNames: ['wp1', 'wp1', 'folding1'], containerComponents: ['nginx', 'mysql', null] },
    '1.2.3.4:16137': { containerAppNames: ['wp1', 'wp1'], containerComponents: ['nginx', 'mysql'] },
  };
  const addresses = ['1.2.3.4:16127', '1.2.3.4:16137'];

  it('tallies WordPress once per node, not once per container', () => {
    const rows = buildDonorAppRows(nodesByIp, addresses, specIndex);
    const tally = tallyRowCategories(rows);

    // Four wp1 rows across two nodes, but two instances.
    expect(rows.filter((r) => r.name === 'wp1')).toHaveLength(4);
    expect(tally.categories.find((c) => c.category === 'web').count).toBe(2);
  });

  it('agrees with the instances column on the same screen', () => {
    const rows = buildDonorAppRows(nodesByIp, addresses, specIndex);
    const tally = tallyRowCategories(rows);

    const wpYours = rows.find((r) => r.name === 'wp1').yours;
    const wpTally = tally.categories.find((c) => c.category === 'web').count;

    expect(wpTally).toBe(wpYours);
  });

  it('counts totalApps as instances, not containers', () => {
    // Two wp1 instances + one folding1 = 3, from 5 containers.
    const tally = tallyRowCategories(buildDonorAppRows(nodesByIp, addresses, specIndex));

    expect(tally.totalApps).toBe(3);
  });

  it('still counts two single-component apps on one node as two', () => {
    // Deduping is on (app, node), not on node -- a node running two DIFFERENT
    // apps is running two instances.
    const twoApps = {
      '1.2.3.4:16127': { containerAppNames: ['folding1', 'ent1'], containerComponents: [null, null] },
    };

    const tally = tallyRowCategories(buildDonorAppRows(twoApps, ['1.2.3.4:16127'], specIndex));

    expect(tally.totalApps).toBe(2);
  });

  it('counts the same app on two nodes as two instances', () => {
    const spread = {
      '1.2.3.4:16127': { containerAppNames: ['folding1'], containerComponents: [null] },
      '5.6.7.8:16127': { containerAppNames: ['folding1'], containerComponents: [null] },
    };

    const tally = tallyRowCategories(buildDonorAppRows(spread, ['1.2.3.4:16127', '5.6.7.8:16127'], specIndex));

    expect(tally.totalApps).toBe(2);
  });
});
