import { DONATION_SCAN_CACHE_KEY } from './donationScanCache';

/*
 * Issue #341: Home renders last-known donation figures immediately, then
 * corrects them when the live scan lands.
 *
 * THE SPLIT THIS FILE PINS DOWN. Only fetch_donation_totals takes the
 * cached-first path. The two wallet-scoped functions keep awaiting a live
 * scan, and that asymmetry is deliberate:
 *
 *   fetch_donation_totals          network-wide aggregate for Home's panel.
 *                                  A few hours stale is harmless and
 *                                  self-corrects seconds later.
 *   fetch_wallet_donation_summary  drives the donation chip. Its own comment
 *                                  says asking a real supporter to donate
 *                                  because the explorer misbehaved is the one
 *                                  outcome worth engineering against -- and a
 *                                  cache predating their donation would do
 *                                  exactly that.
 *   fetch_total_donations          gates achievements. Same hazard.
 *
 * Both wallet functions still gain from the raised in-memory TTL; what they do
 * not do is answer from a persisted scan that may predate the donation being
 * asked about.
 */

const CURRENT_ADDRESS = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const OLD_ADDRESS = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';
const DONOR = 't1DonorWallet';

/** A donation tx, in the trimmed shape the cache stores and the explorer's superset. */
function donationTx(txid, { amount = '5.0', from = DONOR, to = CURRENT_ADDRESS, ageSec = 60 } = {}) {
  return {
    txid,
    time: Math.floor(Date.now() / 1000) - ageSec,
    blockheight: 2_900_000,
    vin: [{ addr: from }],
    vout: [{ value: amount, scriptPubKey: { addresses: [to] } }]
  };
}

/** A deferred so a test can decide exactly when the explorer answers. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let store;

beforeEach(() => {
  store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      }
    }
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

/**
 * Seed the persisted cache directly, as a previous session would have left it.
 *
 * `addresses` is not optional: an entry is only readable under the donation
 * address list it was trimmed against, so one written without it is discarded
 * (see donationScanCache.test.js for why).
 */
function seedCache(scans, ageMs = 0) {
  store[DONATION_SCAN_CACHE_KEY] = JSON.stringify({
    scans,
    timestamp: Date.now() - ageMs,
    addresses: [CURRENT_ADDRESS, OLD_ADDRESS]
  });
}

function mockExplorer(bodyFor) {
  global.fetch = jest.fn((url) => {
    const body = bodyFor(String(url));
    return Promise.resolve(
      body instanceof Promise
        ? body
        : { ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve(body) }
    );
  });
}

/*
 * A rate-limited explorer, in its real shape: a non-2xx response with a
 * text/plain body. explorerFetchJson rejects it and resolves null, which is
 * what makes "this address could not be read" distinguishable from "this
 * address has no donations". Mocking it as a 200 whose JSON happens to say
 * ok:false would test a case that cannot occur.
 */
function mockExplorerRateLimited() {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 429,
      headers: { get: () => 'text/plain' },
      text: () => Promise.resolve('Too Many Requests'),
      json: () => Promise.reject(new Error('not json'))
    })
  );
}

/** A clean module per test: the scan cache lives at module scope (see #314). */
function fresh() {
  let mod;
  jest.isolateModules(() => {
    mod = require('./globalStats');
  });
  return mod;
}

describe('fetch_donation_totals, cached-first (#341)', () => {
  it('resolves from the persisted cache without waiting for the explorer', async () => {
    seedCache([[donationTx('cached-1', { amount: '12.0' })], []]);

    // The explorer never answers in this test. If the implementation awaited
    // it, this assertion could not be reached.
    const stuck = deferred();
    mockExplorer(() => stuck.promise);

    const { fetch_donation_totals } = fresh();
    const result = await fetch_donation_totals();

    expect(result.status).toBe('cached');
    expect(result.ok).toBe(true);
    expect(result.totals.totalFlux).toBeCloseTo(12.0, 6);
    expect(typeof result.fetchedAt).toBe('number');
  });

  it('calls onRefresh with the live figures once the scan lands', async () => {
    seedCache([[donationTx('cached-1', { amount: '12.0' })], []]);
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS)
        ? { pagesTotal: 1, txs: [donationTx('live-1', { amount: '12.0' }), donationTx('live-2', { amount: '30.0' })] }
        : { pagesTotal: 1, txs: [] }
    );

    const { fetch_donation_totals } = fresh();
    const onRefresh = jest.fn();

    const first = await fetch_donation_totals({ onRefresh });
    expect(first.status).toBe('cached');
    expect(first.totals.totalFlux).toBeCloseTo(12.0, 6);

    // Let the background scan settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    const live = onRefresh.mock.calls[0][0];
    expect(live.status).toBe('live');
    expect(live.totals.totalFlux).toBeCloseTo(42.0, 6);
  });

  it('awaits the explorer when there is no persisted cache', async () => {
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('t1', { amount: '7.0' })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_donation_totals } = fresh();
    const onRefresh = jest.fn();
    const result = await fetch_donation_totals({ onRefresh });

    expect(result.status).toBe('live');
    expect(result.totals.totalFlux).toBeCloseTo(7.0, 6);
    // Nothing to correct -- these figures ARE the live ones.
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores a persisted cache older than the maximum age', async () => {
    seedCache([[donationTx('ancient', { amount: '999.0' })], []], 8 * 24 * 60 * 60 * 1000);
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('t1', { amount: '3.0' })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_donation_totals } = fresh();
    const result = await fetch_donation_totals();

    expect(result.status).toBe('live');
    expect(result.totals.totalFlux).toBeCloseTo(3.0, 6);
  });

  it('persists a successful scan for the next visit', async () => {
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('t1', { amount: '4.0' })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_donation_totals } = fresh();
    await fetch_donation_totals();

    const written = JSON.parse(store[DONATION_SCAN_CACHE_KEY]);
    expect(written.scans[0][0].txid).toBe('t1');
  });

  /*
   * The #314 guard, carried into persistence. One 429 must not become a
   * confident zero that outlives the page.
   */
  it('does not persist, or serve, a scan where every address failed', async () => {
    mockExplorerRateLimited();

    const { fetch_donation_totals } = fresh();
    const result = await fetch_donation_totals();

    expect(result.ok).toBe(false);
    expect(store[DONATION_SCAN_CACHE_KEY]).toBeUndefined();
  });

  it('keeps showing cached figures when the background refresh fails', async () => {
    seedCache([[donationTx('cached-1', { amount: '12.0' })], []]);
    mockExplorerRateLimited();

    const { fetch_donation_totals } = fresh();
    const onRefresh = jest.fn();
    const result = await fetch_donation_totals({ onRefresh });

    expect(result.status).toBe('cached');
    expect(result.totals.totalFlux).toBeCloseTo(12.0, 6);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // A failed refresh has nothing to say. Replacing good figures with
    // "couldn't load" would be a downgrade the user can see.
    expect(onRefresh).not.toHaveBeenCalled();
    // ...and the good cache is still there for the next visit.
    expect(JSON.parse(store[DONATION_SCAN_CACHE_KEY]).scans[0][0].txid).toBe('cached-1');
  });

  it('rebuilds rows against the current time, so the rolling window is not frozen', async () => {
    /*
     * buildDonationRows applies a rolling one-year cutoff using nowMs. Caching
     * derived rows would freeze that window and keep showing donations that
     * have since aged out -- which is why the cache stores TRANSACTIONS.
     */
    const yearSec = 366 * 24 * 60 * 60;
    seedCache([
      [
        donationTx('recent', { amount: '5.0', ageSec: 60 }),
        donationTx('aged-out', { amount: '99.0', ageSec: yearSec + 86_400 })
      ],
      []
    ]);
    mockExplorer(() => new Promise(() => {}));

    const { fetch_donation_totals } = fresh();
    const result = await fetch_donation_totals();

    expect(result.rows.map((r) => r.txid)).toEqual(['recent']);
  });
});

describe('the wallet-scoped functions stay live-only (#341)', () => {
  it('fetch_wallet_donation_summary does not answer from the persisted cache', async () => {
    // The cache predates this wallet's donation. Serving it would tell a real
    // supporter they have not donated.
    seedCache([[donationTx('someone-else', { from: 't1Other' })], []]);
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('theirs', { from: DONOR })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_wallet_donation_summary } = fresh();
    const result = await fetch_wallet_donation_summary(DONOR);

    expect(result.ok).toBe(true);
    expect(result.donationCount).toBe(1);
  });

  it('fetch_total_donations does not answer from the persisted cache', async () => {
    seedCache([[donationTx('someone-else', { from: 't1Other' })], []]);
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('theirs', { from: DONOR })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_total_donations } = fresh();

    expect(await fetch_total_donations(DONOR)).toBe(1);
  });

  it('still shares one scan with fetch_donation_totals within the TTL', async () => {
    // #314's fix must survive: Home calls two of these on one page load and
    // they must not scan twice.
    mockExplorer((url) =>
      url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [donationTx('t1', { from: DONOR })] } : { pagesTotal: 1, txs: [] }
    );

    const { fetch_donation_totals, fetch_wallet_donation_summary } = fresh();
    await fetch_donation_totals();
    const callsAfterFirst = global.fetch.mock.calls.length;

    await fetch_wallet_donation_summary(DONOR);

    expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
    expect(callsAfterFirst).toBe(2); // one page per address
  });
});
