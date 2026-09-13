import { buildNetworkAppRows, expiryFromHeight, filterByCategory } from './networkAppRows';

/*
 * Issue #351: the hosted-application detail behind the category counts.
 *
 * The Network tab could say a region runs 4 Gaming apps and nothing more. This
 * builds the list behind that number, scoped to whatever continent or country
 * is selected, so clicking a category answers "which ones?".
 *
 * ONE ROW PER INSTANCE, not per container -- the same unit #344 settled on
 * across the Donor tab, regionStats and the app ecosystem panel. A
 * multi-component app is one deployment on one node however many containers it
 * takes, and a fourth surface disagreeing about that would undo the point.
 */

const specIndex = {
  minecraft1: {
    repotag: 'itzg/minecraft-server:latest',
    category: 'gaming',
    cpuPerInst: 4,
    ramGBPerInst: 8,
    ssdGBPerInst: 50,
    expire: 19506,
    height: 2_900_000,
    compose: null,
  },
  wp1: {
    repotag: 'runonflux/wp-nginx:latest',
    category: 'web',
    cpuPerInst: 1.5,
    ramGBPerInst: 2,
    ssdGBPerInst: 10,
    expire: 22000,
    height: 2_910_000,
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
    expire: 0,
    height: 0,
    compose: null,
  },
};

const NODES = [
  { ip: '1.1.1.1:16127' },
  { ip: '1.1.1.1:16137' },
  { ip: '2.2.2.2:16127' },
];

const APPS_BY_NODE = {
  '1.1.1.1:16127': ['minecraft1', 'wp1', 'wp1'],
  '1.1.1.1:16137': ['minecraft1'],
  '2.2.2.2:16127': ['ent1'],
};

const TIP = 2_919_000;

describe('buildNetworkAppRows', () => {
  it('emits one row per app instance, not per container', () => {
    const rows = buildNetworkAppRows({ nodes: NODES, appsByNode: APPS_BY_NODE, specIndex, tipHeight: TIP });

    // wp1 is two containers on ONE node: one row.
    expect(rows.filter((r) => r.name === 'wp1')).toHaveLength(1);
    // minecraft1 on two nodes: two rows, even though they share a host.
    expect(rows.filter((r) => r.name === 'minecraft1')).toHaveLength(2);
    expect(rows).toHaveLength(4);
  });

  it('carries the columns the issue asks for', () => {
    const rows = buildNetworkAppRows({ nodes: NODES, appsByNode: APPS_BY_NODE, specIndex, tipHeight: TIP });
    const mc = rows.find((r) => r.name === 'minecraft1');

    expect(mc.nodeAddress).toBe('1.1.1.1:16127');
    expect(mc.repotag).toBe('itzg/minecraft-server:latest');
    expect(mc.cpu).toBe(4);
    expect(mc.ramGB).toBe(8);
    expect(mc.ssdGB).toBe(50);
    expect(mc.category).toBe('gaming');
  });

  it('only includes nodes in the given scope', () => {
    // The caller passes the region's nodes; a node outside it contributes
    // nothing even though appsByNode is the whole network's map.
    const rows = buildNetworkAppRows({
      nodes: [{ ip: '2.2.2.2:16127' }],
      appsByNode: APPS_BY_NODE,
      specIndex,
      tipHeight: TIP,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ent1');
  });

  /*
   * Enterprise apps encrypt their compose, so specResources returns nulls
   * rather than zeros. A "0" in the CPU column would say the app uses nothing,
   * which is true of no app -- the same rule the Donor apps table follows.
   */
  it('keeps unknown resources null, never zero', () => {
    const rows = buildNetworkAppRows({ nodes: NODES, appsByNode: APPS_BY_NODE, specIndex, tipHeight: TIP });
    const ent = rows.find((r) => r.name === 'ent1');

    expect(ent.cpu).toBeNull();
    expect(ent.ramGB).toBeNull();
    expect(ent.ssdGB).toBeNull();
  });

  it('drops watchtower, which every node runs for itself', () => {
    const withWatchtower = { '1.1.1.1:16127': ['minecraft1', 'watchtower'] };
    const index = { ...specIndex, watchtower: { repotag: 'containrrr/watchtower:latest', category: 'other', compose: null } };

    const rows = buildNetworkAppRows({
      nodes: [{ ip: '1.1.1.1:16127' }], appsByNode: withWatchtower, specIndex: index, tipHeight: TIP,
    });

    expect(rows.map((r) => r.name)).toEqual(['minecraft1']);
  });

  it('lists an app with no spec rather than dropping it', () => {
    // It is demonstrably running. Its size is simply unknown.
    const rows = buildNetworkAppRows({
      nodes: [{ ip: '1.1.1.1:16127' }], appsByNode: { '1.1.1.1:16127': ['ghost'] }, specIndex, tipHeight: TIP,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('other');
    expect(rows[0].cpu).toBeNull();
    expect(rows[0].expiresAt).toBeNull();
  });

  it('gives every row a stable unique key', () => {
    const rows = buildNetworkAppRows({ nodes: NODES, appsByNode: APPS_BY_NODE, specIndex, tipHeight: TIP });

    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('returns [] for junk rather than throwing', () => {
    for (const args of [{}, { nodes: null }, { nodes: [], appsByNode: null }]) {
      expect(buildNetworkAppRows(args)).toEqual([]);
    }
  });
});

/*
 * `expire` is a DURATION IN BLOCKS, not a timestamp and not an absolute
 * height. A spec at height 2,900,000 with expire 19506 runs out at 2,919,506 --
 * 19506 / 2880 is 6.8 days, which is the standard weekly deployment.
 *
 * Treating it as an absolute height would put every app's expiry in 1970's
 * block numbering, and treating it as a timestamp would be worse.
 */
describe('expiryFromHeight', () => {
  it('converts a spec height plus duration into blocks remaining', () => {
    const e = expiryFromHeight({ height: 2_900_000, expire: 19506 }, 2_919_000);

    expect(e.expiryHeight).toBe(2_919_506);
    expect(e.blocksLeft).toBe(506);
  });

  it('reads a whole week as roughly seven days', () => {
    const e = expiryFromHeight({ height: 2_900_000, expire: 20160 }, 2_900_000);

    // 20160 blocks / 2880 per day.
    expect(e.daysLeft).toBeCloseTo(7, 5);
  });

  it('reports an already-expired app as negative rather than clamping to zero', () => {
    // Clamping would render a long-dead app as "expires today", which reads as
    // healthy. fluxinfo can still show it running for a while after expiry.
    const e = expiryFromHeight({ height: 2_900_000, expire: 100 }, 2_919_000);

    expect(e.blocksLeft).toBeLessThan(0);
    expect(e.expired).toBe(true);
  });

  it('returns null when the spec cannot say', () => {
    expect(expiryFromHeight(null, 2_919_000)).toBeNull();
    expect(expiryFromHeight({ height: 0, expire: 0 }, 2_919_000)).toBeNull();
    expect(expiryFromHeight({ height: 2_900_000, expire: 19506 }, 0)).toBeNull();
  });
});

describe('filterByCategory', () => {
  const rows = [
    { name: 'a', category: 'gaming' },
    { name: 'b', category: 'web' },
    { name: 'c', category: 'gaming' },
  ];

  it('returns everything when no category is selected', () => {
    expect(filterByCategory(rows, null)).toHaveLength(3);
  });

  it('narrows to the selected category', () => {
    expect(filterByCategory(rows, 'gaming').map((r) => r.name)).toEqual(['a', 'c']);
  });

  it('returns nothing rather than everything for a category with no rows', () => {
    expect(filterByCategory(rows, 'database')).toEqual([]);
  });
});
