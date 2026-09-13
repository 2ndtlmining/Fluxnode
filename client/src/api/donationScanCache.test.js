import {
  trimTxsForCache,
  readDonationScanCache,
  writeDonationScanCache,
  DONATION_SCAN_CACHE_KEY,
  DONATION_SCAN_MAX_AGE_MS
} from './donationScanCache';
import { donationAddresses } from 'donor/donationTotals';
import { OLD_ADDRESS_FLUX } from 'donor/config';

const DONATION_ADDRESS = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const OLD_DONATION_ADDRESS = OLD_ADDRESS_FLUX;

/*
 * paidToDonationAddress is private to donor/donationTotals.js. Reimplemented
 * here on purpose rather than exported: this is the reference the trim is
 * asserted against, and a reference that shares code with the thing it checks
 * cannot catch them drifting apart.
 */
function paidToDonationAddressForTest(tx, addresses) {
  let paid = 0;
  for (const out of tx?.vout || []) {
    const outAddrs = out?.scriptPubKey?.addresses || [];
    if (outAddrs.some((a) => addresses.includes(a))) paid += Number(out.value) || 0;
  }
  return paid;
}

/*
 * Issue #341. The donation scan costs 19 sequential explorer requests, held
 * only in a module-level variable, so every return to Home past the TTL pays
 * for it again. This module is the persistence layer that lets Home render
 * last-known values immediately.
 *
 * The trim is not an optimisation detail -- the raw scan carries script hex
 * that makes it an order of magnitude too big for localStorage. What survives
 * the trim is exactly what the three callers in globalStats.js read:
 *
 *   fetch_donation_totals         -> aggregateDonations + buildDonationRows
 *   fetch_wallet_donation_summary -> tx.vin[].addr, tx.txid
 *   fetch_total_donations         -> tx.vin[].addr, tx.txid
 *
 * Anything dropped here becomes a silently wrong number on a warm cache read,
 * which is the failure mode api/specs.js already documents for
 * _trimSpecForCache.
 */

/** A tx in the shape the explorer actually returns, script hex and all. */
function explorerTx(overrides = {}) {
  return {
    txid: 'abc123',
    time: 1_700_000_000,
    blockheight: 2_900_000,
    confirmations: 412,
    valueOut: 10.5,
    valueIn: 10.6,
    fees: 0.1,
    size: 372,
    locktime: 0,
    vin: [
      {
        addr: 't1Sender',
        txid: 'prev-tx',
        vout: 1,
        value: 10.6,
        valueSat: 1060000000,
        n: 0,
        scriptSig: { hex: 'deadbeef'.repeat(40), asm: 'OP_DUP OP_HASH160 ...' },
        doubleSpentTxID: null
      }
    ],
    vout: [
      {
        value: '10.50000000',
        n: 0,
        scriptPubKey: {
          addresses: [DONATION_ADDRESS],
          hex: '76a914'.repeat(20),
          asm: 'OP_DUP OP_HASH160 ...',
          type: 'pubkeyhash'
        },
        spentTxId: null,
        spentIndex: null
      }
    ],
    ...overrides
  };
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

describe('trimTxsForCache', () => {
  it('keeps every field the three callers read', () => {
    const [tx] = trimTxsForCache([explorerTx()]);

    expect(tx.txid).toBe('abc123');
    expect(tx.time).toBe(1_700_000_000);
    expect(tx.blockheight).toBe(2_900_000);
    expect(tx.vin[0].addr).toBe('t1Sender');
    expect(tx.vout[0].value).toBe('10.50000000');
    expect(tx.vout[0].scriptPubKey.addresses).toEqual([DONATION_ADDRESS]);
  });

  it('drops the script hex that makes the raw scan too big to persist', () => {
    const raw = JSON.stringify([explorerTx()]);
    const trimmed = JSON.stringify(trimTxsForCache([explorerTx()]));

    expect(trimmed).not.toContain('deadbeef');
    expect(trimmed).not.toContain('OP_DUP');
    // The trim has to be a real reduction, not a rename -- persisting ~180 of
    // these is the whole point.
    expect(trimmed.length).toBeLessThan(raw.length / 3);
  });

  it('keeps a donation split across several outputs, dropping only the change', () => {
    // buildDonationRows sums every output paying a donation address, so losing
    // one understates that donation. The change leg pays the sender and was
    // never part of the total.
    const tx = explorerTx({
      vout: [
        { value: '1.0', scriptPubKey: { addresses: [DONATION_ADDRESS] } },
        { value: '2.0', scriptPubKey: { addresses: [DONATION_ADDRESS] } },
        { value: '7.5', scriptPubKey: { addresses: ['t1Change'] } }
      ]
    });

    const [trimmed] = trimTxsForCache([tx]);

    expect(trimmed.vout.map((v) => v.value)).toEqual(['1.0', '2.0']);
  });

  it('preserves every input address, not just the first', () => {
    // senderOf and the wallet summary both scan all of vin.
    const tx = explorerTx({ vin: [{ addr: 't1A' }, { addr: 't1B' }, { addr: 't1C' }] });

    expect(trimTxsForCache([tx])[0].vin.map((v) => v.addr)).toEqual(['t1A', 't1B', 't1C']);
  });

  it('survives malformed transactions rather than throwing', () => {
    const out = trimTxsForCache([{ txid: 'x' }, { txid: 'y', vin: null, vout: undefined }, null]);

    expect(out).toHaveLength(3);
    expect(out[0].vin).toEqual([]);
    expect(out[0].vout).toEqual([]);
    expect(out[2].vin).toEqual([]);
    expect(out[2].vout).toEqual([]);
  });

  it('returns [] for a non-array', () => {
    expect(trimTxsForCache(null)).toEqual([]);
    expect(trimTxsForCache(undefined)).toEqual([]);
  });

  /*
   * THE TRIM THAT ACTUALLY MATTERS, measured on the real scan.
   *
   * Dropping script hex took 4,306 KB down to 1,034 KB -- still 20% of the
   * whole localStorage budget for one entry, which is not affordable. The
   * reason is the OLD donation address: it is a node collateral address, and
   * the largest transaction touching it has 2,001 outputs, a mining pool
   * paying its whole roster in one batch. Exactly one of those outputs is a
   * donation.
   *
   * paidToDonationAddress sums ONLY outputs paying a donation address, so
   * every other output is dead weight. Dropping them takes the scan to 49 KB
   * -- a 21x reduction, and about 1% of the budget.
   */
  it('drops outputs that pay nobody the totals care about', () => {
    const batch = explorerTx({
      vout: [
        { value: '0.5', scriptPubKey: { addresses: ['t1SomeMiner'] } },
        { value: '25.0', scriptPubKey: { addresses: [DONATION_ADDRESS] } },
        { value: '0.5', scriptPubKey: { addresses: ['t1AnotherMiner'] } }
      ]
    });

    const [trimmed] = trimTxsForCache([batch]);

    expect(trimmed.vout).toHaveLength(1);
    expect(trimmed.vout[0].value).toBe('25.0');
  });

  it('keeps EVERY output paying a donation address, not just the first', () => {
    // paidToDonationAddress sums them; keeping one would understate the donation.
    const split = explorerTx({
      vout: [
        { value: '1.0', scriptPubKey: { addresses: [DONATION_ADDRESS] } },
        { value: '2.0', scriptPubKey: { addresses: ['t1Unrelated'] } },
        { value: '3.0', scriptPubKey: { addresses: [OLD_DONATION_ADDRESS] } }
      ]
    });

    expect(trimTxsForCache([split])[0].vout.map((v) => v.value)).toEqual(['1.0', '3.0']);
  });

  /*
   * The property that makes the trim safe. If these two ever disagree, the
   * panel shows a smaller total on a warm cache than on a cold one -- the
   * quiet kind of wrong that a green suite hides.
   */
  it('leaves what the totals compute unchanged', () => {
    const tx = explorerTx({
      vout: [
        ...Array.from({ length: 2000 }, (_, i) => ({
          value: '0.1',
          scriptPubKey: { addresses: [`t1Miner${i}`] }
        })),
        { value: '12.5', scriptPubKey: { addresses: [DONATION_ADDRESS] } }
      ]
    });

    const addresses = donationAddresses();
    const before = paidToDonationAddressForTest(tx, addresses);
    const after = paidToDonationAddressForTest(trimTxsForCache([tx])[0], addresses);

    expect(after).toBeCloseTo(before, 8);
    expect(after).toBeCloseTo(12.5, 8);
  });

  it('collapses repeated input addresses, keeping the first occurrence order', () => {
    // senderOf returns the first input that is not a donation address, so only
    // the distinct addresses in order can matter. The largest real transaction
    // here has 33 inputs.
    const tx = explorerTx({
      vin: [{ addr: 't1A' }, { addr: 't1A' }, { addr: 't1B' }, { addr: 't1A' }, { addr: 't1B' }]
    });

    expect(trimTxsForCache([tx])[0].vin.map((v) => v.addr)).toEqual(['t1A', 't1B']);
  });

  it('keeps a transaction that pays no donation address, with no outputs', () => {
    // The transaction still exists and its txid still de-duplicates against the
    // other address's scan; it simply contributes nothing.
    const [trimmed] = trimTxsForCache([explorerTx({ vout: [{ value: '1.0', scriptPubKey: { addresses: ['t1Other'] } }] })]);

    expect(trimmed.txid).toBe('abc123');
    expect(trimmed.vout).toEqual([]);
  });
});

/*
 * The trim is relative to the donation address list, so a cache written under
 * one list cannot be read under another (#341).
 *
 * This is not hypothetical: the donation address has already changed twice,
 * most recently on 2026-09-12. A scan trimmed against the old list would have
 * discarded every output paying the NEW address, and reading it back would
 * silently under-count -- the panel would show a total missing every recent
 * donation, with nothing on screen to say why.
 */
describe('the cache is scoped to the address list it was trimmed against', () => {
  it('records the addresses used for the trim', () => {
    writeDonationScanCache([[explorerTx()], []]);

    expect(JSON.parse(store[DONATION_SCAN_CACHE_KEY]).addresses).toEqual(donationAddresses());
  });

  it('discards an entry written against a different address list', () => {
    writeDonationScanCache([[explorerTx()], []]);
    const stored = JSON.parse(store[DONATION_SCAN_CACHE_KEY]);
    stored.addresses = ['t1SomeOtherDonationAddress'];
    store[DONATION_SCAN_CACHE_KEY] = JSON.stringify(stored);

    expect(readDonationScanCache()).toBeNull();
  });

  it('discards an entry written before addresses were recorded at all', () => {
    store[DONATION_SCAN_CACHE_KEY] = JSON.stringify({ scans: [[]], timestamp: Date.now() });

    expect(readDonationScanCache()).toBeNull();
  });
});

describe('writeDonationScanCache / readDonationScanCache', () => {
  it('round-trips a two-address scan', () => {
    const scans = [[explorerTx({ txid: 'new1' })], [explorerTx({ txid: 'old1' })]];

    writeDonationScanCache(scans);
    const back = readDonationScanCache();

    expect(back.scans).toHaveLength(2);
    expect(back.scans[0][0].txid).toBe('new1');
    expect(back.scans[1][0].txid).toBe('old1');
    expect(typeof back.timestamp).toBe('number');
  });

  it('returns null when nothing has been written', () => {
    expect(readDonationScanCache()).toBeNull();
  });

  it('preserves a per-address null, which means "this address could not be read"', () => {
    // globalStats.js distinguishes null from [] throughout; collapsing the two
    // would turn an unreadable address into a confident zero.
    writeDonationScanCache([[explorerTx()], null]);

    expect(readDonationScanCache().scans[1]).toBeNull();
  });

  /*
   * The guard scanBothDonationAddresses already applies in memory, which must
   * survive persistence. A 429 caching as zeros for 60 seconds was judged worse
   * than duplicate requests; persisted, it would be a confident wrong zero that
   * outlives reloads.
   */
  it('refuses to persist a scan where every address failed', () => {
    writeDonationScanCache([null, null]);

    expect(readDonationScanCache()).toBeNull();
  });

  it('does not overwrite good cached values with an all-null scan', () => {
    writeDonationScanCache([[explorerTx({ txid: 'good' })], []]);
    writeDonationScanCache([null, null]);

    expect(readDonationScanCache().scans[0][0].txid).toBe('good');
  });

  it('ignores a cache entry older than the maximum age', () => {
    writeDonationScanCache([[explorerTx()], []]);
    const stored = JSON.parse(store[DONATION_SCAN_CACHE_KEY]);
    stored.timestamp = Date.now() - DONATION_SCAN_MAX_AGE_MS - 1;
    store[DONATION_SCAN_CACHE_KEY] = JSON.stringify(stored);

    expect(readDonationScanCache()).toBeNull();
  });

  it('serves an entry just inside the maximum age', () => {
    writeDonationScanCache([[explorerTx()], []]);
    const stored = JSON.parse(store[DONATION_SCAN_CACHE_KEY]);
    stored.timestamp = Date.now() - DONATION_SCAN_MAX_AGE_MS + 60_000;
    store[DONATION_SCAN_CACHE_KEY] = JSON.stringify(stored);

    expect(readDonationScanCache()).not.toBeNull();
  });

  it('returns null on corrupt JSON rather than throwing', () => {
    store[DONATION_SCAN_CACHE_KEY] = '{not json';

    expect(readDonationScanCache()).toBeNull();
  });

  it('returns null when the stored shape is not a scan', () => {
    store[DONATION_SCAN_CACHE_KEY] = JSON.stringify({ timestamp: Date.now(), scans: 'nope' });

    expect(readDonationScanCache()).toBeNull();
  });

  it('survives localStorage being unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled');
      }
    });

    expect(() => writeDonationScanCache([[explorerTx()], []])).not.toThrow();
    expect(readDonationScanCache()).toBeNull();
  });

  it('survives a quota error on write', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {}
      }
    });

    expect(() => writeDonationScanCache([[explorerTx()], []])).not.toThrow();
  });

  it('trims on the way in, so the caller cannot accidentally persist script hex', () => {
    writeDonationScanCache([[explorerTx()], []]);

    expect(store[DONATION_SCAN_CACHE_KEY]).not.toContain('deadbeef');
  });
});
