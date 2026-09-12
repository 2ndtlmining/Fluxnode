import { categorizeRunningApps } from './runningAppsCategorized';
import { componentCountKey } from 'fluxinfo';

const specIndex = {
  FoldingAtRunOnFlux1: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  FoldingAtRunOnFlux2: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  wordpress123: { repotag: 'runonflux/wp-nginx:latest', category: 'web' },
  streamr1: { repotag: 'streamr/broker-node:latest', category: 'other' },
  Presearch: { repotag: 'presearch/node:latest', category: 'other' },
  minecraft1: { repotag: 'itzg/minecraft-server:latest', category: 'gaming' },
};

// Every app in this fixture is single-component, so each componentCounts key
// carries an empty component half — the exact shape fluxinfo produces for
// `/flux<appname>` containers.
const aggregate = {
  nameCounts: {
    FoldingAtRunOnFlux1: 1,
    FoldingAtRunOnFlux2: 1,
    wordpress123: 1,
    streamr1: 1,
    Presearch: 1,
    minecraft1: 1,
    unknownApp: 2, // not in specIndex — must not throw, must not silently vanish
  },
  componentCounts: {
    'FoldingAtRunOnFlux1\u0000': 1,
    'FoldingAtRunOnFlux2\u0000': 1,
    'wordpress123\u0000': 1,
    'streamr1\u0000': 1,
    'Presearch\u0000': 1,
    'minecraft1\u0000': 1,
    'unknownApp\u0000': 2,
  },
  nodesByIp: {
    '1.2.3.4:16127': { containerAppNames: ['streamr1', 'FoldingAtRunOnFlux1'], containerComponents: [null, null] },
    '5.6.7.8:16127': { containerAppNames: ['Presearch'], containerComponents: [null] },
  },
};

describe('categorizeRunningApps', () => {
  it('groups by repotag (not app name) so many instances of one image collapse into one bucket', () => {
    const { runningCategoryMap } = categorizeRunningApps(aggregate, specIndex);
    expect(runningCategoryMap.computing).toBe(2); // two Folding@Home instances, one category total
  });

  it('falls back to an "other" bucket for a running app whose spec is missing, without throwing', () => {
    const { runningCategoryMap, totalRunningApps } = categorizeRunningApps(aggregate, specIndex);
    expect(runningCategoryMap.other).toBeGreaterThanOrEqual(2); // unknownApp's 2 containers land somewhere, not dropped
    expect(totalRunningApps).toBe(8); // sum of every nameCounts value, unknownApp included
  });

  /*
   * The list is capped so the panel has a fixed length. 20 rather than 10
   * (issue #273): TOP NODE OPERATORS and TOP APP OWNERS sit beside it at 20,
   * and #248's uniform 665x738 panel made the shorter list read as missing
   * data. Checked against live network data before changing it -- the 20th
   * row still carried 51 instances (mysql 119, blockbook 114, minecraft 52,
   * rusty-kaspad 51), so the tail is real apps, not single-instance filler.
   */
  it('caps topRunningApps at 20 rows', () => {
    const manyNames = {};
    const manyComponents = {};
    const manySpecs = {};
    // 30 distinct repotags, descending popularity, so a cap of 20 is visible.
    for (let i = 0; i < 30; i++) {
      const name = `app${i}`;
      manyNames[name] = 30 - i;
      manyComponents[`${name}\u0000`] = 30 - i;
      manySpecs[name] = { repotag: `vendor/image${i}:latest`, category: 'computing' };
    }
    const { topRunningApps } = categorizeRunningApps(
      { nameCounts: manyNames, componentCounts: manyComponents, nodesByIp: {} },
      manySpecs
    );

    expect(topRunningApps).toHaveLength(20);
    // Still ranked, and still the most popular 20 rather than an arbitrary 20.
    expect(topRunningApps[0].image).toBe('vendor/image0:latest');
    expect(topRunningApps[19].image).toBe('vendor/image19:latest');
  });

  it('ranks topRunningApps by repotag popularity, most-instances first', () => {
    const { topRunningApps } = categorizeRunningApps(aggregate, specIndex);
    const folding = topRunningApps.find((r) => r.image === 'yurinnick/folding-at-home:latest');
    expect(folding.nodeCount).toBe(2);
  });

  it('counts wordpress by resolved repotag, not by the (arbitrary) app name', () => {
    const { wordpressCount } = categorizeRunningApps(aggregate, specIndex);
    expect(wordpressCount).toBe(1);
  });

  it('counts streamr/presearch once per NODE that hosts one, not once per container', () => {
    const twoOnOneNode = {
      nameCounts: { streamr1: 2 },
      componentCounts: { 'streamr1\u0000': 2 },
      nodesByIp: { '1.1.1.1:1': { containerAppNames: ['streamr1', 'streamr1'], containerComponents: [null, null] } },
    };
    const { streamrRunningApps } = categorizeRunningApps(twoOnOneNode, specIndex);
    expect(streamrRunningApps).toBe(1);
  });

  it('returns all-zero/empty output for an empty aggregate, without throwing', () => {
    const result = categorizeRunningApps({ nameCounts: {}, componentCounts: {}, nodesByIp: {} }, {});
    expect(result.runningCategoryMap).toEqual({});
    expect(result.topRunningApps).toEqual([]);
    expect(result.totalRunningApps).toBe(0);
    expect(result.wordpressCount).toBe(0);
    expect(result.streamrRunningApps).toBe(0);
    expect(result.presearchRunningApps).toBe(0);
  });

  it('does not throw when nodesByIp or specIndex is missing entirely', () => {
    expect(() => categorizeRunningApps({ nameCounts: { a: 1 } }, undefined)).not.toThrow();
    expect(() => categorizeRunningApps({}, {})).not.toThrow();
  });

  it('reports enterpriseContainers separately from the ranking, for apps whose spec is Enterprise (repotag deliberately hidden)', () => {
    const aggregate = {
      nameCounts: { entApp: 2 },
      componentCounts: { [componentCountKey('entApp', null)]: 2 },
      nodesByIp: {},
    };
    const specIndex = { entApp: { category: 'enterprise', repotag: '', compose: null } };
    const { enterpriseContainers, unresolvedContainers } = categorizeRunningApps(aggregate, specIndex);
    expect(enterpriseContainers).toBe(2);
    expect(unresolvedContainers).toBe(0);
  });

  it('reports unresolvedContainers separately, for apps with no spec found at all', () => {
    const aggregate = {
      nameCounts: { ghostApp: 1 },
      componentCounts: { [componentCountKey('ghostApp', null)]: 1 },
      nodesByIp: {},
    };
    const { enterpriseContainers, unresolvedContainers } = categorizeRunningApps(aggregate, {});
    expect(enterpriseContainers).toBe(0);
    expect(unresolvedContainers).toBe(1);
  });
});

/*
 * The regression this fix wave exists for.
 *
 * A WordPress deployment on Flux is one app running three containers — wp,
 * mysql and an operator. Resolving each of those by APP NAME gave all three
 * compose[0]'s image, so one deployment reported as three WordPress instances
 * (258 network-wide against a true 86) and mysql/shared-db never appeared in
 * Top Hosted Apps at all.
 */
describe('categorizeRunningApps with a multi-component (compose) app', () => {
  const composeIndex = {
    wordpressCompose1: {
      repotag: 'runonflux/wp-nginx:latest', // compose[0], what the old code used for all three
      category: 'web',
      compose: [
        { name: 'wp', repotag: 'runonflux/wp-nginx:latest' },
        { name: 'mysql', repotag: 'mysql:8.3.0' },
        { name: 'operator', repotag: 'runonflux/shared-db:latest' },
      ],
    },
  };

  const composeAggregate = {
    nameCounts: { wordpressCompose1: 3 }, // three containers, one deployment
    componentCounts: {
      'wordpressCompose1\u0000wp': 1,
      'wordpressCompose1\u0000mysql': 1,
      'wordpressCompose1\u0000operator': 1,
    },
    nodesByIp: {
      '1.2.3.4:16127': {
        containerAppNames: ['wordpressCompose1', 'wordpressCompose1', 'wordpressCompose1'],
        containerComponents: ['wp', 'mysql', 'operator'],
      },
    },
  };

  it('counts one WordPress instance for a 3-container deployment, not three', () => {
    const { wordpressCount } = categorizeRunningApps(composeAggregate, composeIndex);
    expect(wordpressCount).toBe(1);
  });

  it('ranks each component under its OWN image', () => {
    const { topRunningApps } = categorizeRunningApps(composeAggregate, composeIndex);
    const byImage = Object.fromEntries(topRunningApps.map((r) => [r.image, r.nodeCount]));
    expect(byImage).toEqual({
      'runonflux/wp-nginx:latest': 1,
      'mysql:8.3.0': 1,
      'runonflux/shared-db:latest': 1,
    });
  });

  it('still counts every container toward the app-level category total', () => {
    const { runningCategoryMap, totalRunningApps } = categorizeRunningApps(composeAggregate, composeIndex);
    expect(runningCategoryMap.web).toBe(3); // category stays app-level, unchanged by this fix
    expect(totalRunningApps).toBe(3);
  });

  it('detects streamr on the component that actually runs it, not just compose[0]', () => {
    const index = {
      bundle1: {
        repotag: 'nginx:latest',
        category: 'other',
        compose: [
          { name: 'front', repotag: 'nginx:latest' },
          { name: 'broker', repotag: 'streamr/broker-node:latest' },
        ],
      },
    };
    const agg = {
      nameCounts: { bundle1: 2 },
      componentCounts: { 'bundle1\u0000front': 1, 'bundle1\u0000broker': 1 },
      nodesByIp: {
        '9.9.9.9:1': { containerAppNames: ['bundle1', 'bundle1'], containerComponents: ['front', 'broker'] },
      },
    };
    expect(categorizeRunningApps(agg, index).streamrRunningApps).toBe(1);
  });

  it('falls back to the app-level repotag when a node carries no component info', () => {
    // A cache entry written before containerComponents existed, or a spec
    // updated mid-flight: resolution degrades to the old behaviour rather
    // than dropping the node.
    const agg = {
      nameCounts: { streamr1: 1 },
      componentCounts: { 'streamr1\u0000': 1 },
      nodesByIp: { '1.1.1.1:1': { containerAppNames: ['streamr1'] } },
    };
    expect(categorizeRunningApps(agg, specIndex).streamrRunningApps).toBe(1);
  });
});

/*
 * runonflux/orbit is Flux's git-deployment wrapper: whatever it builds is
 * opaque, so the operator's deployment name says nothing reliable about what
 * the app does. The pre-#187 aggregation forced these to 'other'; that guard
 * was lost when categories moved onto the spec index.
 */
describe('categorizeRunningApps opaque runtime images', () => {
  it('puts a git-deployed (orbit) app in "other", not in whatever its name suggests', () => {
    const index = { myMinecraftThing: { repotag: 'runonflux/orbit:latest', category: 'gaming' } };
    const agg = { nameCounts: { myMinecraftThing: 4 }, componentCounts: { 'myMinecraftThing\u0000': 4 } };

    const { runningCategoryMap } = categorizeRunningApps(agg, index);

    expect(runningCategoryMap.other).toBe(4);
    expect(runningCategoryMap.gaming).toBeUndefined();
  });

  it('leaves every other image categorised by its spec', () => {
    const { runningCategoryMap } = categorizeRunningApps(aggregate, specIndex);
    expect(runningCategoryMap.gaming).toBe(1); // minecraft1 is a real minecraft image
    expect(runningCategoryMap.web).toBe(1);
  });
});
