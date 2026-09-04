import { computeDonorStatus, fetch_donor_status } from './donorStatus';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-05T00:00:00Z').getTime();

describe('computeDonorStatus', () => {
  it('is not a donor with no records', () => {
    expect(computeDonorStatus([], NOW)).toEqual({
      isDonor: false, totalInWindow: 0, expiresAt: null, daysLeft: 0,
    });
  });

  it('is not a donor below the threshold', () => {
    const records = [{ date: NOW - 10 * DAY_MS, amount: 9.99 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBeCloseTo(9.99);
  });

  it('is a donor exactly at the threshold', () => {
    const records = [{ date: NOW - 10 * DAY_MS, amount: 10 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBe(10);
  });

  it('ignores a donation older than the 365-day window entirely', () => {
    const records = [{ date: NOW - 400 * DAY_MS, amount: 50 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBe(0);
  });

  it('expiresAt is exactly 365 days after a single donation', () => {
    const donationDate = NOW - 10 * DAY_MS;
    const records = [{ date: donationDate, amount: 15 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(true);
    expect(result.expiresAt).toBe(donationDate + 365 * DAY_MS);
    expect(result.daysLeft).toBe(355);
  });

  it('expiry is driven by the next drop that would fall below threshold, not the first', () => {
    // Two donations of 6 each (total 12, threshold 10). The older one (300 days
    // ago) ages out first, dropping the running total to 6 — below threshold —
    // so THAT drop date is the expiry, not the newer donation's.
    const older = { date: NOW - 300 * DAY_MS, amount: 6 };
    const newer = { date: NOW - 50 * DAY_MS, amount: 6 };
    const result = computeDonorStatus([newer, older], NOW); // order-independent input
    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBe(12);
    expect(result.expiresAt).toBe(older.date + 365 * DAY_MS);
  });

  it('a donation large enough alone keeps donor status past a smaller one aging out', () => {
    // Older 15 (well above threshold alone) + newer 5. When the older one ages
    // out, running drops from 20 to 5 — below threshold 10 — so it's still the
    // older donation's drop date that matters here, same shape as above but
    // confirms the loop doesn't stop at the newer record first.
    const older = { date: NOW - 300 * DAY_MS, amount: 15 };
    const newer = { date: NOW - 50 * DAY_MS, amount: 5 };
    const result = computeDonorStatus([older, newer], NOW);
    expect(result.expiresAt).toBe(older.date + 365 * DAY_MS);
  });
});

describe('fetch_donor_status', () => {
  const WALLET = 't1SenderRealWalletAddressXXXXXXXXX';
  const DONATION_ADDR = window.gContent.ADDRESS_FLUX;

  // Full Insight-API tx shape, same convention as live/apidata.test.js's
  // realTransparentTx() — the extra fields (n, scriptSig, confirmations, fees)
  // real /api/txs responses carry, not a hand-trimmed minimal fixture.
  function realDonationTx({ blockheight, time, amount, fromWallet = WALLET }) {
    return {
      txid: `tx-${blockheight}`,
      version: 4,
      locktime: 0,
      blockheight,
      confirmations: 1000,
      time,
      blocktime: time,
      vin: [{
        txid: 'prevtx', vout: 0, sequence: 4294967295, n: 0,
        scriptSig: { hex: '...', asm: '...' },
        addr: fromWallet, valueSat: 0, value: 0,
      }],
      vout: [
        {
          value: amount.toFixed(8), n: 0,
          scriptPubKey: { hex: '...', asm: '...', addresses: [DONATION_ADDR], type: 'pubkeyhash' },
          spentTxId: null,
        },
        {
          value: '0.01000000', n: 1,
          scriptPubKey: { hex: '...', asm: '...', addresses: [fromWallet], type: 'pubkeyhash' }, // change
          spentTxId: null,
        },
      ],
      isCoinBase: false,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockJsonResponse(body) {
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  }

  it('sums donations from the wallet across a single page', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [
        realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 6 }),
        realDonationTx({ blockheight: 99, time: nowSec - 20 * 86400, amount: 6 }),
      ],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBeCloseTo(12);
    expect(result.verified).toBe(true);
  });

  it('ignores a transaction sent by a different wallet', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 50, fromWallet: 'someone-else' })],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBe(0);
    expect(result.verified).toBe(true);
  });

  it('sums donations across multiple pages and fetches the second page with pageNum=1', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({
        pagesTotal: 2,
        txs: [realDonationTx({ blockheight: 200, time: nowSec - 5 * 86400, amount: 6 })],
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        pagesTotal: 2,
        txs: [realDonationTx({ blockheight: 199, time: nowSec - 6 * 86400, amount: 6 })],
      }));

    const result = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('&pageNum=1');
    expect(result.totalInWindow).toBeCloseTo(12);
    expect(result.isDonor).toBe(true);
    expect(result.verified).toBe(true);
  });

  it('stops paginating once it reaches a transaction older than the window, without fetching further pages', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 3,
      txs: [
        realDonationTx({ blockheight: 200, time: nowSec - 5 * 86400, amount: 20 }),
        realDonationTx({ blockheight: 50, time: nowSec - 400 * 86400, amount: 999 }), // past the window — stop here
      ],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(1); // never fetched page 2 or 3
    expect(result.totalInWindow).toBeCloseTo(20); // the 999 past the window never counted
    expect(result.verified).toBe(true); // hit the window edge — a complete, trustworthy scan
  });

  it('caches a result and serves it without a second network call within the TTL', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 15 })],
    }));

    const first = await fetch_donor_status(WALLET);
    const second = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.verified).toBe(true);
  });

  it('fails soft — not a donor, not a throw — when the explorer is unreachable', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetch_donor_status(WALLET)).resolves.toEqual(
      expect.objectContaining({ isDonor: false })
    );
  });

  it('does not cache a result from a failed fetch — retry will re-attempt the network call', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    const first = await fetch_donor_status(WALLET);
    const second = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(2); // both calls fetch, no cache from failure
    expect(first).toEqual(expect.objectContaining({ isDonor: false }));
    expect(second).toEqual(expect.objectContaining({ isDonor: false }));
  });

  it('a scan that fails partway through a multi-page fetch is not verified and not cached', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Page 1 succeeds but the donation total stays below threshold, so
    // computeDonorStatus alone would say isDonor: false — the only thing
    // that should keep this from being reported/cached as a confident
    // "not a donor" is the page-2 failure below.
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({
        pagesTotal: 3,
        txs: [realDonationTx({ blockheight: 200, time: nowSec - 5 * 86400, amount: 2 })],
      }))
      .mockRejectedValueOnce(new Error('network down'));

    const first = await fetch_donor_status(WALLET);

    expect(first.isDonor).toBe(false);
    expect(first.verified).toBe(false);

    // Not cached — a retry re-attempts the network call rather than serving
    // the unverified partial result.
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({
        pagesTotal: 3,
        txs: [realDonationTx({ blockheight: 200, time: nowSec - 5 * 86400, amount: 2 })],
      }))
      .mockRejectedValueOnce(new Error('network down'));

    await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(4); // 2 calls per attempt, both attempts hit the network
  });

  // Page-cap truncation (pageNum reaches DONOR_MAX_PAGES_FETCHED without
  // hitWindowEdge or exhausting pagesTotal) is intentionally not covered by
  // a dedicated test here — mocking DONOR_MAX_PAGES_FETCHED (20) sequential
  // page responses to exercise it end-to-end would be a large, low-signal
  // fixture. The same `scanComplete = hitWindowEdge || pageNum >= pagesTotal`
  // boundary is already exercised from both sides by the tests above (hit via
  // hitWindowEdge in "stops paginating...", hit via pageNum >= pagesTotal in
  // "sums donations...single page" and "ignores a transaction..."), and the
  // cap only changes which of those two conditions is reached, not the logic
  // that decides verified from them.
});
