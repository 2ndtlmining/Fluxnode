/*
 * Issue #314: the donation scan is unbounded AND unshared.
 *
 * scanDonationAddress walks every page of an address's lifetime history, and
 * scanBothDonationAddresses does that for both donation addresses. Three
 * exported functions call it, and Home calls two of them on one page load --
 * so a single visit walked the whole history twice, which is what got the
 * explorer to answer 429 (reported as a CORS error, because a rate-limited
 * response omits its CORS headers; see explorer.js).
 *
 * The total is all-time by design -- it feeds Home's transparency panel (#258)
 * and the achievement gates -- so capping the pages would make it WRONG. The
 * fix is to scan once and share, exactly as networkNodes.js's _shared() does
 * for the other large feeds.
 *
 * Each test re-imports the module so the module-level cache starts empty;
 * otherwise these tests would leak into each other, and a test-only reset hook
 * in production code is worse than this.
 */

const CURRENT_ADDRESS = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const DONOR_WALLET = 't1DonorWalletAddressForTest';

function page(txids) {
  return {
    pagesTotal: 1,
    txs: txids.map((txid) => ({ txid, vin: [{ addr: DONOR_WALLET }], vout: [] })),
  };
}

/** Returns the jest.fn so a test can count how many explorer requests happened. */
function mockExplorer(bodyFor) {
  const fetchMock = jest.fn((url) => {
    const body = bodyFor(String(url));
    if (body === null) {
      return Promise.resolve({ ok: false, status: 429, headers: { get: () => null } });
    }
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(body),
    });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function freshModule() {
  let mod;
  jest.isolateModules(() => {
    mod = require('./globalStats');
  });
  return mod;
}

/*
 * Each test starts with an empty PERSISTED cache too (issue #341).
 *
 * #341 gave the scan a localStorage layer on top of the module-level one these
 * tests already isolate. jsdom's localStorage is real and survives
 * jest.isolateModules, so without this an earlier test's successful scan is
 * still on disk when the next one runs -- and the 429 test below, which asserts
 * that a rate-limited scan produces a failure, would instead be served those
 * stale-but-valid figures and pass or fail on test order.
 *
 * Not a weakening. An empty cache is the state a first-ever page load starts
 * from, and the cached-serving behaviour that would otherwise leak in here has
 * its own coverage in donationScanRevalidate.test.js.
 */
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {}
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('the donation scan is shared between its callers', () => {
  it('scans the chain ONCE for two consecutive callers', async () => {
    const fetchMock = mockExplorer((url) => (url.includes(CURRENT_ADDRESS) ? page(['a']) : page([])));
    const { fetch_donation_totals, fetch_wallet_donation_summary } = freshModule();

    await fetch_donation_totals();
    const afterFirst = fetchMock.mock.calls.length;

    await fetch_wallet_donation_summary(DONOR_WALLET);
    const afterSecond = fetchMock.mock.calls.length;

    // Home does exactly this pair on one page load. The second caller must not
    // re-walk the history.
    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBe(afterFirst);
  });

  it('collapses concurrent callers into a single scan', async () => {
    const fetchMock = mockExplorer(() => page(['a']));
    const { fetch_donation_totals, fetch_total_donations } = freshModule();

    await Promise.all([fetch_donation_totals(), fetch_total_donations(DONOR_WALLET)]);

    // Two addresses, one page each, one scan.
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it('still returns the right answer to each caller, not just fewer requests', async () => {
    mockExplorer((url) => (url.includes(CURRENT_ADDRESS) ? page(['a', 'b']) : page([])));
    const { fetch_total_donations, fetch_wallet_donation_summary } = freshModule();

    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(2);
    await expect(fetch_wallet_donation_summary(DONOR_WALLET)).resolves.toEqual({
      ok: true,
      donationCount: 2,
    });
  });

  /*
   * A rate-limited scan must not be cached. Caching it would turn one 429 into
   * a minute of confidently wrong zeros on Home -- worse than the extra
   * requests this change exists to avoid.
   */
  it('does not cache a scan where every address was unreadable', async () => {
    const fetchMock = mockExplorer(() => null); // every host 429s
    const { fetch_donation_totals } = freshModule();

    const first = await fetch_donation_totals();
    const afterFirst = fetchMock.mock.calls.length;
    expect(first.ok).toBe(false);

    await fetch_donation_totals();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});

/*
 * Issue #366. Costs ride along on the scan that donations already pay for --
 * the same argument #315 made for the donation list. A separate fetch would
 * add a fifth caller to an explorer that #314 was raised about.
 */
describe('fetch_donation_totals: costs (#366)', () => {
  it('returns cost rows and totals computed from the same scan', async () => {
    /*
     * The fixture has to satisfy buildCostRows' own filters or this test proves
     * nothing: sent BY the current donation address, a numeric `time` inside
     * the 365-day window, and paying somebody who is not the source. The 1.99
     * change leg is included deliberately -- excluding it from the total is the
     * behaviour most worth pinning here.
     */
    const nowSec = Math.floor(Date.now() / 1000);
    const spend = {
      txid: 'spend-1',
      time: nowSec - 24 * 60 * 60,
      blockheight: 2952400,
      vin: [{ addr: CURRENT_ADDRESS }],
      vout: [
        { value: '23.0', scriptPubKey: { addresses: ['t1XNTegMCLrmRWKzKQwRM8H15arLDzox74g'] } },
        { value: '1.99', scriptPubKey: { addresses: [CURRENT_ADDRESS] } }
      ]
    };

    mockExplorer((url) => (url.includes(CURRENT_ADDRESS) ? { pagesTotal: 1, txs: [spend] } : page([])));

    const { fetch_donation_totals } = freshModule();
    const result = await fetch_donation_totals();

    expect(result.costRows).toHaveLength(1);
    expect(result.costRows[0]).toMatchObject({
      txid: 'spend-1',
      to: 't1XNTegMCLrmRWKzKQwRM8H15arLDzox74g',
      amount: 23,
      category: 'other'
    });
    expect(result.costs.costFlux).toBe(23);
    expect(result.costs.refundFlux).toBe(0);
  });

  // Reuses the "every address was unreadable" mechanism from the describe
  // block above -- mockExplorer(() => null) simulates both donation
  // addresses 429ing, exactly the outage the earlier test covers.
  it('reports zero costs rather than null when the scan is unreadable', async () => {
    // A failed scan must not put `undefined FLUX` in the header band.
    mockExplorer(() => null); // every host 429s
    const { fetch_donation_totals } = freshModule();

    const result = await fetch_donation_totals();

    expect(result.ok).toBe(false);
    expect(result.costRows).toEqual([]);
    expect(result.costs.costFlux).toBe(0);
  });
});
