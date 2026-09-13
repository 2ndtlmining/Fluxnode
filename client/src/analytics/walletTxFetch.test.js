import { fetch_wallet_tx_history, MAX_PAGES } from './walletTxFetch';

/*
 * Issue #358. This file had NO tests, which is how both bugs below survived.
 *
 * THE WINDOW WAS SILENTLY TRUNCATED. MAX_PAGES capped the scan at 100
 * transactions. Measured against a real 120-node donor wallet: its 7-day window
 * holds 803 transactions across 82 pages, so the panel was summarising 12% of
 * it and reporting the result as "net over 7 days". Understated, with nothing
 * on screen saying so, for exactly the operators with the most at stake.
 *
 * THE EARLY BREAK NEVER FIRED. The guard tested the whole accumulated array,
 * which keeps page 0's recent transactions forever, so it could only be true
 * for a wallet with NO activity in the window -- precisely backwards. Every
 * active wallet paid the full page budget regardless of how little it needed.
 */

const WALLET = 't1DonorWallet';
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

/** A transaction `ageDays` old that pays the wallet. */
function tx(id, ageDays) {
  return {
    txid: `tx${id}`,
    time: now() - Math.round(ageDays * DAY),
    blockheight: 2_900_000 + id,
    isCoinBase: true,
    vin: [{ coinbase: 'deadbeef' }],
    vout: [{ value: '0.75', scriptPubKey: { addresses: [WALLET] } }],
  };
}

/**
 * Serve `pages` through the explorer pool, counting requests.
 *
 * The pool calls fetch(host + path); only the pageNum matters here.
 */
function mockPages(pages) {
  const calls = [];
  global.fetch = jest.fn((url) => {
    const u = String(url);
    calls.push(u);
    const m = u.match(/pageNum=(\d+)/);
    const page = m ? Number(m[1]) : 0;
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ pagesTotal: pages.length, txs: pages[page] || [] }),
    });
  });
  return calls;
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('paging the window', () => {
  it('stops as soon as a fetched page is entirely older than the window', async () => {
    // Page 0 recent, page 1 entirely old. Page 2 must never be requested --
    // pages are newest-first, so nothing beyond page 1 can be in the window.
    const calls = mockPages([
      [tx(1, 0.5), tx(2, 1)],
      [tx(3, 30), tx(4, 31)],
      [tx(5, 60)],
    ]);

    const { ok, summary } = await fetch_wallet_tx_history(WALLET);

    expect(ok).toBe(true);
    expect(summary.rows).toHaveLength(2);
    // Two requests: the recent page, and the one that proved we were past the edge.
    expect(calls.filter((c) => /pageNum=2/.test(c))).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it('does not stop while the page just fetched still holds recent transactions', async () => {
    const calls = mockPages([
      [tx(1, 0.5)],
      [tx(2, 1)],
      [tx(3, 2)],
      [tx(4, 30)],
    ]);

    const { summary } = await fetch_wallet_tx_history(WALLET);

    expect(summary.rows).toHaveLength(3);
    expect(calls).toHaveLength(4);
  });

  it('needs only one request for a wallet whose first page is already old', async () => {
    const calls = mockPages([[tx(1, 30), tx(2, 31)], [tx(3, 60)]]);

    const { summary } = await fetch_wallet_tx_history(WALLET);

    expect(summary.rows).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  /*
   * The cost half of the bug. A quiet wallet used to pay the full page budget
   * because the break could never fire.
   */
  it('costs one request per page it actually needs, not the whole budget', async () => {
    const pages = [[tx(1, 0.5)], [tx(2, 40)]];
    for (let i = 2; i < 30; i += 1) pages.push([tx(i + 10, 50)]);

    const calls = mockPages(pages);
    await fetch_wallet_tx_history(WALLET);

    expect(calls).toHaveLength(2);
    expect(calls.length).toBeLessThan(MAX_PAGES);
  });
});

/*
 * Truncation has to be VISIBLE. An understated total presented as a 7-day
 * figure is worse than a smaller window honestly labelled, because nothing on
 * screen tells the reader to doubt it.
 */
describe('a truncated window says so', () => {
  const busy = () => {
    const pages = [];
    for (let p = 0; p < MAX_PAGES + 5; p += 1) {
      pages.push(Array.from({ length: 10 }, (_, i) => tx(p * 10 + i, 0.1 * p)));
    }
    return pages;
  };

  it('flags the summary when the budget ran out before the window did', async () => {
    mockPages(busy());

    const { summary } = await fetch_wallet_tx_history(WALLET);

    expect(summary.truncated).toBe(true);
  });

  it('reports the span it actually covered, not the span it was asked for', async () => {
    mockPages(busy());

    const { summary } = await fetch_wallet_tx_history(WALLET);

    // The oldest transaction actually scanned, so the totals below it describe
    // a real period rather than a claimed one.
    expect(summary.coveredFrom).toBeGreaterThan(summary.cutoff);
    expect(summary.coveredFrom).toBeLessThanOrEqual(now());
  });

  it('does not flag a window that was fully covered', async () => {
    mockPages([[tx(1, 0.5)], [tx(2, 30)]]);

    const { summary } = await fetch_wallet_tx_history(WALLET);

    expect(summary.truncated).toBe(false);
    // Nothing was cut off, so the window is the one that was asked for.
    expect(summary.coveredFrom).toBe(summary.cutoff);
  });

  it('stops at the page budget rather than walking an 82-page history', async () => {
    // The measured 120-node wallet. Fetching all of it is 82 requests against
    // an explorer that rate-limits hard (#314, #341).
    const calls = mockPages(busy());

    await fetch_wallet_tx_history(WALLET);

    expect(calls).toHaveLength(MAX_PAGES);
  });
});

describe('failure', () => {
  it('returns not-ok when the first page cannot be read', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 429, headers: { get: () => 'text/plain' } })
    );

    expect(await fetch_wallet_tx_history(WALLET)).toEqual({ ok: false, summary: null });
  });

  it('keeps a partial history when a later page fails', async () => {
    let n = 0;
    global.fetch = jest.fn(() => {
      n += 1;
      if (n > 1) return Promise.resolve({ ok: false, status: 429, headers: { get: () => 'text/plain' } });
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ pagesTotal: 5, txs: [tx(1, 0.5)] }),
      });
    });

    const { ok, summary } = await fetch_wallet_tx_history(WALLET);

    expect(ok).toBe(true);
    expect(summary.rows).toHaveLength(1);
    // A page we could not read is a gap, not a complete window.
    expect(summary.truncated).toBe(true);
  });

  it('returns not-ok without a wallet', async () => {
    expect(await fetch_wallet_tx_history(null)).toEqual({ ok: false, summary: null });
  });
});
