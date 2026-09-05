import { fetch_fluxinfo_aggregate, buildCategoryTop, appNameFromContainer } from './fluxinfo';

/*
 * Regression tests for issue #144.
 *
 * The App Ecosystem panel used to swap to a different dataset
 * (globalappsspecifications, which counts ORDERED instances) whenever this
 * fetch came back empty, which users saw as the "Other" category jumping and
 * then settling. These tests pin the behaviour that replaced it: retry, then
 * serve last-known-good marked stale, then report unavailable — but never
 * silently hand back a different dataset.
 */

const NODES = [
  { apps: { runningapps: [{ Image: 'yurinnick/folding-at-home:latest' }, { Image: 'runonflux/wp-nginx:latest' }] } },
  { apps: { runningapps: [{ Image: 'presearch/node:latest' }] } },
  { apps: { runningapps: [{ Image: 'yurinnick/folding-at-home:latest' }] } },
];

// A second fixture, WITH `ip` set (the existing NODES fixture above omits it
// deliberately, to exercise the "no ip, so perNode stays empty" path — these
// nodes exercise the opposite path, the one nodesByIp needs).
const NODES_WITH_IP = [
  {
    ip: '1.2.3.4:16127',
    tier: 'CUMULUS',
    apps: { runningapps: [{ Image: 'yurinnick/folding-at-home:latest', Names: ['/fluxFoldingAtRunOnFlux1'] }] },
  },
  {
    ip: '5.6.7.8:16127',
    tier: 'STRATUS',
    apps: { runningapps: [] },
  },
];

const okResponse = (data) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) });

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('fetch_fluxinfo_aggregate', () => {
  it('aggregates a successful response and reports it as live', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));

    const { aggregate, status } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('live');
    expect(aggregate.totalContainers).toBe(4);
    expect(aggregate.nodesReporting).toBe(3);
    expect(aggregate.wordpressContainers).toBe(1);
    expect(aggregate.presearchNodes).toBe(1);
    expect(aggregate.imageCounts['yurinnick/folding-at-home:latest']).toBe(2);
  });

  it('retries and succeeds after transient failures', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(okResponse(NODES));

    const { status, aggregate } = await fetch_fluxinfo_aggregate();

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(status).toBe('live');
    expect(aggregate.totalContainers).toBe(4);
  });

  it('treats a 200 response carrying status=error as a failure', async () => {
    // The old code only checked Array.isArray(json.data) here, so an error
    // envelope silently produced an empty category map.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', data: { message: 'boom' } }),
    });

    const { status, aggregate } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('unavailable');
    expect(aggregate).toBeNull();
  });

  it('does not throw when a node reports without apps.runningapps', async () => {
    // JSON.stringify(undefined).includes(...) used to raise a TypeError here,
    // which wiped the whole category map for that load.
    const malformed = [...NODES, {}, { apps: {} }, { apps: { runningapps: null } }];
    global.fetch = jest.fn().mockResolvedValue(okResponse(malformed));

    const { status, aggregate } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('live');
    expect(aggregate.totalContainers).toBe(4);
  });

  it('serves last-known-good marked stale when every attempt fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));
    await fetch_fluxinfo_aggregate();

    global.fetch = jest.fn().mockRejectedValue(new Error('endpoint down'));
    const { status, aggregate, fetchedAt } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('stale');
    expect(aggregate.totalContainers).toBe(4);
    expect(typeof fetchedAt).toBe('number');
  });

  it('reports unavailable when it fails with no usable cache', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('endpoint down'));

    const { status, aggregate, fetchedAt } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('unavailable');
    expect(aggregate).toBeNull();
    expect(fetchedAt).toBeNull();
  });

  it('shares one in-flight request between concurrent callers', async () => {
    // fetchTotalDeployedApps and the old fetchWordpressInstancesCount both hit
    // this ~465 KB endpoint in the same Promise.all.
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));

    const [a, b] = await Promise.all([fetch_fluxinfo_aggregate(), fetch_fluxinfo_aggregate()]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('ignores a cache entry older than the stale window', async () => {
    localStorage.setItem(
      'fluxinfoAggregate_v1',
      JSON.stringify({
        aggregate: { imageCounts: { 'busybox:latest': 1 }, totalContainers: 1 },
        timestamp: Date.now() - 7 * 60 * 60 * 1000, // window is 6h
      })
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('endpoint down'));

    const { status, aggregate } = await fetch_fluxinfo_aggregate();

    expect(status).toBe('unavailable');
    expect(aggregate).toBeNull();
  });
});

describe('buildCategoryTop', () => {
  it('returns the three biggest apps, most to least', () => {
    const { computing } = buildCategoryTop({
      computing: { 'a/folding-at-home': 2264, 'b/foldingathome-arm64': 13, 'c/rosetta': 3, 'd/other': 1 },
    });
    expect(computing.top).toEqual([
      { image: 'a/folding-at-home', count: 2264 },
      { image: 'b/foldingathome-arm64', count: 13 },
      { image: 'c/rosetta', count: 3 },
    ]);
  });

  it('never returns more than three', () => {
    const images = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`img${i}`, i + 1]));
    expect(buildCategoryTop({ web: images }).web.top).toHaveLength(3);
  });

  it('reports the remainder so the top 3 are not mistaken for the whole category', () => {
    const { gaming } = buildCategoryTop({ gaming: { a: 10, b: 5, c: 3, d: 2, e: 1 } });
    expect(gaming.otherCount).toBe(2);
    expect(gaming.otherTotal).toBe(3);
    // top + remainder must reconcile to the category total
    expect(gaming.top.reduce((s, x) => s + x.count, 0) + gaming.otherTotal).toBe(21);
  });

  it('breaks ties alphabetically so the order is stable between refreshes', () => {
    // Media really does have three apps on 3 containers each
    const a = buildCategoryTop({ media: { owncast: 3, 'yt-dl': 3, qbittorrent: 3 } });
    const b = buildCategoryTop({ media: { qbittorrent: 3, owncast: 3, 'yt-dl': 3 } });
    expect(a.media.top.map((x) => x.image)).toEqual(['owncast', 'qbittorrent', 'yt-dl']);
    expect(a.media.top).toEqual(b.media.top);
  });

  it('handles categories with fewer than three apps', () => {
    const { ai } = buildCategoryTop({ ai: { doccano: 3, duckling: 3 } });
    expect(ai.top).toHaveLength(2);
    expect(ai.otherCount).toBe(0);
    expect(ai.otherTotal).toBe(0);
  });

  it('handles missing and empty input without throwing', () => {
    expect(buildCategoryTop(undefined)).toEqual({});
    expect(buildCategoryTop({})).toEqual({});
    expect(buildCategoryTop({ web: {} })).toEqual({ web: { top: [], otherCount: 0, otherTotal: 0 } });
  });
});

describe('appNameFromContainer', () => {
  it('takes the app name from a compose container', () => {
    expect(appNameFromContainer('/fluxFoldingAtHome_FoldingAtRunOnFlux29')).toBe('FoldingAtRunOnFlux29');
  });

  it('handles a single-component app with no underscore', () => {
    expect(appNameFromContainer('/fluxPresearch')).toBe('Presearch');
  });

  it('splits on the first underscore, since app names may contain more', () => {
    expect(appNameFromContainer('/fluxbackend_my_app_name')).toBe('my_app_name');
  });

  it('ignores containers that are not Flux apps', () => {
    expect(appNameFromContainer('/watchtower')).toBeNull();
    expect(appNameFromContainer('')).toBeNull();
    expect(appNameFromContainer(undefined)).toBeNull();
  });
});

describe('fetch_fluxinfo_aggregate nodesByIp', () => {
  it('keeps a full per-node lookup, not just the top N kept in topNodesByApps', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES_WITH_IP));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    expect(Object.keys(aggregate.nodesByIp)).toEqual(['1.2.3.4:16127']);
    expect(aggregate.nodesByIp['1.2.3.4:16127'].appCount).toBe(1);
    expect(aggregate.nodesByIp['1.2.3.4:16127'].tier).toBe('CUMULUS');
    expect(aggregate.nodesByIp['1.2.3.4:16127'].images).toEqual(['yurinnick/folding-at-home:latest']);
  });

  it('omits a node with no running apps from nodesByIp, same as topNodesByApps', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES_WITH_IP));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    expect(aggregate.nodesByIp['5.6.7.8:16127']).toBeUndefined();
  });

  it('does not change any existing field for the existing NODES fixture', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(NODES));

    const { aggregate } = await fetch_fluxinfo_aggregate();

    // NODES has no `ip` field on any entry, so perNode was always empty for
    // it, before and after this change — topNodesByApps and nodesByIp both
    // stay empty, everything else stays exactly as the existing test above
    // already pins.
    expect(aggregate.topNodesByApps).toEqual([]);
    expect(aggregate.nodesByIp).toEqual({});
    expect(aggregate.totalContainers).toBe(4);
    expect(aggregate.nodesReporting).toBe(3);
  });
});
