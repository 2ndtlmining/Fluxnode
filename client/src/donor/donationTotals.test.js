import { aggregateDonations, relativeAge } from './donationTotals';

/*
 * Issue #258 -- network-wide donation transparency for the Home panel.
 *
 * Fixtures mirror the real explorer /txs shape: vout carries
 * scriptPubKey.addresses, vin carries addr, and a transaction can pay several
 * outputs of which only some go to a donation address.
 */
const DONATION_ADDR = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr';
const OLD_ADDR = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';
const NOW = 1789000000000; // ms
const DAY = 24 * 3600;
const sec = (daysAgo) => Math.floor(NOW / 1000) - daysAgo * DAY;

function tx({ txid, from, to = DONATION_ADDR, amount, daysAgo, change = 0 }) {
  const vout = [{ value: String(amount), scriptPubKey: { addresses: [to] } }];
  if (change) vout.push({ value: String(change), scriptPubKey: { addresses: [from] } });
  return { txid, time: sec(daysAgo), vin: [{ addr: from }], vout };
}

describe('aggregateDonations', () => {
  it('sums only what was paid TO a donation address, ignoring change outputs', () => {
    // A 50 FLUX donation from a 200 FLUX input returns 150 as change. Counting
    // vout blindly would report 200.
    const r = aggregateDonations([tx({ txid: 'a', from: 't1alice', amount: 50, daysAgo: 10, change: 150 })], { nowMs: NOW });
    expect(r.totalFlux).toBe(50);
  });

  it('counts unique donors, not transactions', () => {
    const r = aggregateDonations([
      tx({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 5 }),
      tx({ txid: 'b', from: 't1alice', amount: 10, daysAgo: 4 }),
      tx({ txid: 'c', from: 't1bob', amount: 10, daysAgo: 3 }),
    ], { nowMs: NOW });
    expect(r.uniqueDonors).toBe(2);
    expect(r.donationCount).toBe(3);
    expect(r.totalFlux).toBe(30);
  });

  it('excludes project-owned addresses entirely', () => {
    // The maintainer's own wallet is 99% of the real total; including it would
    // present project funds as community support.
    const r = aggregateDonations([
      tx({ txid: 'a', from: 't1self', amount: 90000, daysAgo: 5 }),
      tx({ txid: 'b', from: 't1alice', amount: 25, daysAgo: 4 }),
    ], { nowMs: NOW, excluded: ['t1self'] });
    expect(r.totalFlux).toBe(25);
    expect(r.uniqueDonors).toBe(1);
    expect(r.donationCount).toBe(1);
  });

  it('ignores donations older than the 365-day window', () => {
    const r = aggregateDonations([
      tx({ txid: 'old', from: 't1alice', amount: 500, daysAgo: 400 }),
      tx({ txid: 'new', from: 't1bob', amount: 20, daysAgo: 300 }),
    ], { nowMs: NOW });
    expect(r.totalFlux).toBe(20);
    expect(r.uniqueDonors).toBe(1);
  });

  it('counts both donation addresses, since the project changed address', () => {
    const r = aggregateDonations([
      tx({ txid: 'a', from: 't1alice', to: DONATION_ADDR, amount: 10, daysAgo: 5 }),
      tx({ txid: 'b', from: 't1bob', to: OLD_ADDR, amount: 15, daysAgo: 6 }),
    ], { nowMs: NOW });
    expect(r.totalFlux).toBe(25);
    expect(r.uniqueDonors).toBe(2);
  });

  it('de-duplicates a transaction that pays both addresses', () => {
    const both = {
      txid: 'dup', time: sec(5), vin: [{ addr: 't1alice' }],
      vout: [
        { value: '10', scriptPubKey: { addresses: [DONATION_ADDR] } },
        { value: '5', scriptPubKey: { addresses: [OLD_ADDR] } },
      ],
    };
    // The caller concatenates per-address scans, so the same tx arrives twice.
    const r = aggregateDonations([both, both], { nowMs: NOW });
    expect(r.donationCount).toBe(1);
    expect(r.totalFlux).toBe(15);
  });

  it('reports the most recent donation, not the last one in the array', () => {
    const r = aggregateDonations([
      tx({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 2 }),
      tx({ txid: 'b', from: 't1bob', amount: 3, daysAgo: 40 }),
    ], { nowMs: NOW });
    expect(r.lastDonation).toMatchObject({ amount: 10, from: 't1alice' });
  });

  it('has no lastDonation when nothing qualifies', () => {
    expect(aggregateDonations([], { nowMs: NOW }).lastDonation).toBeNull();
  });

  it('ignores transactions with no identifiable sender', () => {
    // Coinbase-style inputs have no addr; they are not donations.
    const orphan = { txid: 'x', time: sec(5), vin: [{}], vout: [{ value: '10', scriptPubKey: { addresses: [DONATION_ADDR] } }] };
    expect(aggregateDonations([orphan], { nowMs: NOW }).donationCount).toBe(0);
  });

  it('ignores transactions that pay no donation address', () => {
    const unrelated = { txid: 'y', time: sec(5), vin: [{ addr: 't1alice' }], vout: [{ value: '10', scriptPubKey: { addresses: ['t1somewhere'] } }] };
    expect(aggregateDonations([unrelated], { nowMs: NOW }).totalFlux).toBe(0);
  });

  it('survives a null input rather than throwing', () => {
    expect(aggregateDonations(null, { nowMs: NOW })).toMatchObject({ totalFlux: 0, uniqueDonors: 0, lastDonation: null });
  });

  it('does not let floating point noise leak into the displayed total', () => {
    const r = aggregateDonations([
      tx({ txid: 'a', from: 't1alice', amount: 0.1, daysAgo: 1 }),
      tx({ txid: 'b', from: 't1bob', amount: 0.2, daysAgo: 1 }),
    ], { nowMs: NOW });
    expect(r.totalFlux).toBeCloseTo(0.3, 8);
  });
});

describe('relativeAge', () => {
  it('reads in days for a recent donation', () => {
    expect(relativeAge(sec(1), NOW)).toBe('yesterday');
    expect(relativeAge(sec(3), NOW)).toBe('3 days ago');
  });

  it('reads today for something within the last day', () => {
    expect(relativeAge(sec(0), NOW)).toBe('today');
  });

  it('switches to weeks, then months, so a stale date does not read as abandoned', () => {
    expect(relativeAge(sec(14), NOW)).toBe('2 weeks ago');
    expect(relativeAge(sec(70), NOW)).toBe('2 months ago');
  });

  it('returns null for a missing timestamp', () => {
    expect(relativeAge(null, NOW)).toBeNull();
  });
});

/*
 * Issue #315 -- the same transactions, listed individually rather than summed.
 */
import { buildDonationRows, shortTxid, explorerTxUrl } from './donationTotals';

const PROJECT_WALLET = 't1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh'; // EXCLUDED_FROM_DONATION_TOTALS

function txAt({ txid, from, amount, daysAgo, blockheight, to = DONATION_ADDR, change = 0 }) {
  return { ...tx({ txid, from, to, amount, daysAgo, change }), blockheight };
}

describe('buildDonationRows', () => {
  const rows = () =>
    buildDonationRows(
      [
        txAt({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 5, blockheight: 300 }),
        txAt({ txid: 'b', from: 't1bob', amount: 50, daysAgo: 30, blockheight: 200 }),
        txAt({ txid: 'c', from: 't1alice', amount: 5, daysAgo: 1, blockheight: 400 }),
      ],
      { nowMs: NOW }
    );

  it('returns one row per donation, with the fields the panel renders', () => {
    const [first] = rows();

    expect(first).toMatchObject({
      txid: 'c',
      from: 't1alice',
      amount: 5,
      blockHeight: 400,
      isProjectTransfer: false,
    });
    expect(typeof first.timeSec).toBe('number');
  });

  it('sorts by block height descending — latest first', () => {
    expect(rows().map((r) => r.blockHeight)).toEqual([400, 300, 200]);
  });

  it('ignores change outputs, exactly as the total does', () => {
    // Same trap as aggregateDonations: a 50 FLUX donation funded by a larger
    // input returns change to the sender in the same transaction.
    const [row] = buildDonationRows(
      [txAt({ txid: 'a', from: 't1alice', amount: 50, change: 150, daysAgo: 1, blockheight: 10 })],
      { nowMs: NOW }
    );

    expect(row.amount).toBe(50);
  });

  it('does not list the same transaction twice when it paid both addresses', () => {
    // Callers concatenate one scan per donation address.
    const shared = txAt({ txid: 'dup', from: 't1alice', amount: 10, daysAgo: 1, blockheight: 10 });

    expect(buildDonationRows([shared, shared], { nowMs: NOW })).toHaveLength(1);
  });

  /*
   * #315: project-owned transfers are SHOWN and LABELLED rather than hidden.
   * aggregateDonations drops them from the total -- that stays true -- but a
   * list that silently omitted them would not reconcile against the address's
   * on-chain balance, and nothing on screen would explain the gap.
   */
  it('includes a project transfer, flagged, rather than dropping it', () => {
    const out = buildDonationRows(
      [
        txAt({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1, blockheight: 20 }),
        txAt({ txid: 'p', from: PROJECT_WALLET, amount: 900, daysAgo: 1, blockheight: 10 }),
      ],
      { nowMs: NOW }
    );

    expect(out).toHaveLength(2);
    expect(out.find((r) => r.txid === 'p').isProjectTransfer).toBe(true);
    expect(out.find((r) => r.txid === 'a').isProjectTransfer).toBe(false);
  });

  it('agrees with aggregateDonations about what counts as a donation', () => {
    // The list and the total sit in the same panel. If they disagree about the
    // window or about change, the panel contradicts itself on screen.
    const txs = [
      txAt({ txid: 'recent', from: 't1alice', amount: 10, daysAgo: 5, blockheight: 300 }),
      txAt({ txid: 'ancient', from: 't1bob', amount: 999, daysAgo: 500, blockheight: 1 }),
    ];

    const listed = buildDonationRows(txs, { nowMs: NOW }).filter((r) => !r.isProjectTransfer);
    const summed = aggregateDonations(txs, { nowMs: NOW });

    expect(listed).toHaveLength(summed.donationCount);
    expect(listed.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(summed.totalFlux, 8);
  });

  it('skips transactions that paid a donation address nothing', () => {
    const unrelated = {
      txid: 'x',
      time: sec(1),
      blockheight: 5,
      vin: [{ addr: 't1alice' }],
      vout: [{ value: '5', scriptPubKey: { addresses: ['t1someoneelse'] } }],
    };

    expect(buildDonationRows([unrelated], { nowMs: NOW })).toEqual([]);
  });

  it('returns an empty list for junk input rather than throwing', () => {
    expect(buildDonationRows(null, { nowMs: NOW })).toEqual([]);
    expect(buildDonationRows([], { nowMs: NOW })).toEqual([]);
    expect(buildDonationRows([{}], { nowMs: NOW })).toEqual([]);
  });
});

describe('shortTxid', () => {
  it('keeps both ends so a reader can match it against the explorer', () => {
    expect(shortTxid('a694d0a592bab79798767c11619a943bd5d28c4667c2c1734cea9f6e199812da'))
      .toBe('a694d0..9812da');
  });

  it('leaves an already-short id alone rather than padding it', () => {
    expect(shortTxid('abc')).toBe('abc');
  });

  it('tolerates a missing id', () => {
    expect(shortTxid(null)).toBe('');
  });
});

describe('explorerTxUrl', () => {
  /*
   * The explorer is a HASH-routed SPA. Measured 2026-09-13:
   *   https://explorer.runonflux.io/tx/<txid>    -> 404
   *   https://explorer.runonflux.io/#/tx/<txid>  -> 200
   * The obvious-looking path is the broken one, so it is pinned here.
   */
  it('uses the hash route, because the plain path 404s', () => {
    expect(explorerTxUrl('abc123')).toBe('https://explorer.runonflux.io/#/tx/abc123');
  });
});
