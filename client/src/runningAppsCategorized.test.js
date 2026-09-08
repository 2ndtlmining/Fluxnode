import { categorizeRunningApps } from './runningAppsCategorized';

const specIndex = {
  FoldingAtRunOnFlux1: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  FoldingAtRunOnFlux2: { repotag: 'yurinnick/folding-at-home:latest', category: 'computing' },
  wordpress123: { repotag: 'runonflux/wp-nginx:latest', category: 'web' },
  streamr1: { repotag: 'streamr/broker-node:latest', category: 'other' },
  Presearch: { repotag: 'presearch/node:latest', category: 'other' },
  minecraft1: { repotag: 'itzg/minecraft-server:latest', category: 'gaming' },
};

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
  nodesByIp: {
    '1.2.3.4:16127': { containerAppNames: ['streamr1', 'FoldingAtRunOnFlux1'] },
    '5.6.7.8:16127': { containerAppNames: ['Presearch'] },
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
      nodesByIp: { '1.1.1.1:1': { containerAppNames: ['streamr1', 'streamr1'] } },
    };
    const { streamrRunningApps } = categorizeRunningApps(twoOnOneNode, specIndex);
    expect(streamrRunningApps).toBe(1);
  });

  it('returns all-zero/empty output for an empty aggregate, without throwing', () => {
    const result = categorizeRunningApps({ nameCounts: {}, nodesByIp: {} }, {});
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
});
