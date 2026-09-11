import { explorerFetchJson, EXPLORER_HOSTS, __resetExplorerHealth, __explorerHealth } from './explorer';

/*
 * Explorer failover.
 *
 * The bug this fixes was misdiagnosed for a long time as a CORS
 * misconfiguration. It is not. Measured 2026-09-11:
 *
 *   explorer.runonflux.io      -> HTTP 429, Retry-After: 31, and NO
 *                                 access-control-allow-origin header
 *   explorer.app.runonflux.io  -> HTTP 200, access-control-allow-origin: *
 *
 * A rate-limited response omits CORS headers, so the browser cannot read the
 * 429 and reports "blocked by CORS policy" instead. Every one of those console
 * errors was a rate limit wearing a CORS costume. Nothing was misconfigured.
 *
 * Both hosts are fallible -- the secondary returned a transient 503 during the
 * same testing session -- so this is a POOL with bidirectional failover, not a
 * primary with a spare. A host that fails is benched and the other is used;
 * benching expires so a recovered host comes back into rotation.
 */

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
  };
}

const [PRIMARY, SECONDARY] = EXPLORER_HOSTS;

beforeEach(() => {
  __resetExplorerHealth();
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('explorerFetchJson', () => {
  it('uses the primary host when it is healthy', async () => {
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    await expect(explorerFetchJson('/blocks?limit=1')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${PRIMARY}/blocks?limit=1`);
  });

  it('falls over to the secondary on a 429', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY)
          ? jsonResponse('Too Many Requests', { status: 429, headers: { 'retry-after': '31' } })
          : jsonResponse({ from: 'secondary' })
      )
    );
    await expect(explorerFetchJson('/blocks')).resolves.toEqual({ from: 'secondary' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('benches a 429ing host for its Retry-After, skipping it on the next call', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY)
          ? jsonResponse('', { status: 429, headers: { 'retry-after': '31' } })
          : jsonResponse({ from: 'secondary' })
      )
    );

    await explorerFetchJson('/one');
    expect(global.fetch).toHaveBeenCalledTimes(2); // primary tried, then secondary

    global.fetch.mockClear();
    await explorerFetchJson('/two');
    // The whole point: a benched host is not retried on every subsequent call.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${SECONDARY}/two`);
  });

  it('honours Retry-After rather than guessing a cooldown', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY)
          ? jsonResponse('', { status: 429, headers: { 'retry-after': '31' } })
          : jsonResponse({})
      )
    );
    await explorerFetchJson('/x');
    expect(__explorerHealth()[PRIMARY].benchedUntil).toBe(1_000_000 + 31_000);
  });

  it('brings a host back into rotation once its bench expires', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY)
          ? jsonResponse('', { status: 429, headers: { 'retry-after': '5' } })
          : jsonResponse({ from: 'secondary' })
      )
    );
    await explorerFetchJson('/x');

    // Primary recovers, and time moves past the bench.
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse({ from: 'primary-again' })));
    Date.now.mockReturnValue(1_000_000 + 6_000);

    await expect(explorerFetchJson('/y')).resolves.toEqual({ from: 'primary-again' });
    expect(global.fetch.mock.calls[0][0]).toBe(`${PRIMARY}/y`);
  });

  it('falls over on a network error, not only on a 429', async () => {
    // This is what a blocked-by-CORS failure actually looks like to fetch():
    // a rejected promise with no status to inspect.
    global.fetch = jest.fn((url) =>
      url.startsWith(PRIMARY)
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonResponse({ from: 'secondary' }))
    );
    await expect(explorerFetchJson('/x')).resolves.toEqual({ from: 'secondary' });
  });

  it('falls over on a 5xx', async () => {
    // The secondary returned a transient 503 during testing; neither host is
    // assumed reliable.
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY) ? jsonResponse('', { status: 503 }) : jsonResponse({ from: 'secondary' })
      )
    );
    await expect(explorerFetchJson('/x')).resolves.toEqual({ from: 'secondary' });
  });

  it('falls over when a host returns non-JSON (the "Loading block index..." case)', async () => {
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url.startsWith(PRIMARY)
          ? { ok: true, status: 200, headers: { get: () => 'text/plain' }, json: () => Promise.reject(new Error('not json')) }
          : jsonResponse({ from: 'secondary' })
      )
    );
    await expect(explorerFetchJson('/x')).resolves.toEqual({ from: 'secondary' });
  });

  it('resolves null when every host fails, rather than throwing', async () => {
    // Call sites across this codebase fail soft (donations resolve 0, chain
    // activity returns empty defaults). Throwing here would turn a degraded
    // page into a blank one.
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse('', { status: 429 })));
    await expect(explorerFetchJson('/x')).resolves.toBeNull();
  });

  it('does not bench every host permanently when all are failing', async () => {
    // If a total outage benched both hosts forever, recovery would need a page
    // reload. Bench windows must still expire.
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse('', { status: 429 })));
    await explorerFetchJson('/x');
    for (const host of EXPLORER_HOSTS) {
      expect(__explorerHealth()[host].benchedUntil).toBeGreaterThan(Date.now());
      expect(__explorerHealth()[host].benchedUntil).toBeLessThan(Date.now() + 10 * 60 * 1000);
    }
  });

  it('accepts a path with or without a leading slash', async () => {
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse({})));
    await explorerFetchJson('blocks');
    expect(global.fetch.mock.calls[0][0]).toBe(`${PRIMARY}/blocks`);
  });
});
