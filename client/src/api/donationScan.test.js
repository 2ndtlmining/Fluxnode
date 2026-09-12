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
