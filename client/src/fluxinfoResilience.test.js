import { fetch_fluxinfo_aggregate } from './fluxinfo';

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
