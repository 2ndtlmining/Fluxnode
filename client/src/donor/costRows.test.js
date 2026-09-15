import { buildCostRows, aggregateCosts, COST_CATEGORY_LABELS } from './costRows';
import { FLUX_CLOUD_ADDRESSES } from './config';

/*
 * Issue #366 -- what the donation address SPENDS, categorised.
 *
 * The fixtures below are the two real outgoing transactions on
 * t3YcVbiQ… as of 2026-09-16, plus the donation that makes one of them a
 * refund. Using the real shapes matters: both carry a change leg back to the
 * donation address, and counting change as an expense would roughly double
 * the headline cost figure.
 */
const DONATION_ADDR = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const CLOUD = FLUX_CLOUD_ADDRESSES[0];
const NOW = 1789600000000;
const DAY = 24 * 3600;
const sec = (daysAgo) => Math.floor(NOW / 1000) - daysAgo * DAY;

function incoming({ txid, from, amount, daysAgo }) {
  return {
    txid,
    time: sec(daysAgo),
    blockheight: 2_946_455,
    vin: [{ addr: from }],
    vout: [{ value: String(amount), scriptPubKey: { addresses: [DONATION_ADDR] } }]
  };
}

function outgoing({ txid, to, amount, change = 0, daysAgo, blockheight = 2_952_400, asm }) {
  const vout = [{ value: String(amount), scriptPubKey: { addresses: [to] } }];
  if (change) vout.push({ value: String(change), scriptPubKey: { addresses: [DONATION_ADDR] } });
  if (asm) vout.push({ value: '0', scriptPubKey: { addresses: null, asm } });
  return { txid, time: sec(daysAgo), blockheight, vin: [{ addr: DONATION_ADDR }], vout };
}

describe('buildCostRows', () => {
  it('ignores incoming transactions entirely', () => {
    expect(buildCostRows([incoming({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1 })], { nowMs: NOW })).toEqual([]);
  });

  it('excludes the change leg returning to the donation address', () => {
    // tx 58add1fd…: 23 out, 1.99 back as change. The expense is 23, not 24.99.
    const rows = buildCostRows([outgoing({ txid: 'a', to: 't1XNTeg', amount: 23, change: 1.99, daysAgo: 1 })], { nowMs: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(23);
  });

  it('labels a payment to Flux Cloud as cloud', () => {
    const rows = buildCostRows([outgoing({ txid: 'a', to: CLOUD, amount: 50, daysAgo: 1 })], { nowMs: NOW });
    expect(rows[0].category).toBe('cloud');
  });

  it('labels a payment to a prior donor as a refund', () => {
    // tx fa6b4c33… pays 189 back to t1Jprekh…, who donated 100 in 1eaab08d…
    const rows = buildCostRows(
      [
        incoming({ txid: 'in', from: 't1Jprekh', amount: 100, daysAgo: 10 }),
        outgoing({ txid: 'out', to: 't1Jprekh', amount: 189, change: 10.99, daysAgo: 9 })
      ],
      { nowMs: NOW }
    );
    const refund = rows.find((r) => r.txid === 'out');
    expect(refund.category).toBe('refund');
    expect(refund.amount).toBe(189);
  });

  it('labels everything else as other', () => {
    const rows = buildCostRows([outgoing({ txid: 'a', to: 't1XNTeg', amount: 23, daysAgo: 1 })], { nowMs: NOW });
    expect(rows[0].category).toBe('other');
  });

  it('does not treat a project-owned wallet as a donor', () => {
    // EXCLUDED_FROM_DONATION_TOTALS wallets are not donors, so paying one back
    // is a transfer, not a refund.
    const rows = buildCostRows(
      [
        incoming({ txid: 'in', from: 't1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh', amount: 500, daysAgo: 10 }),
        outgoing({ txid: 'out', to: 't1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh', amount: 500, daysAgo: 9 })
      ],
      { nowMs: NOW }
    );
    expect(rows.find((r) => r.txid === 'out').category).toBe('other');
  });

  it('only counts donors of the source address, not of the old address', () => {
    /*
     * Decision on #366: refunds match donors of t3YcVbiQ… only. A donation to
     * OLD_ADDRESS_FLUX arrives in the same scan and must NOT make its sender a
     * refund recipient here.
     */
    const oldAddrDonation = {
      txid: 'old',
      time: sec(20),
      blockheight: 2_900_000,
      vin: [{ addr: 't1bob' }],
      vout: [{ value: '50', scriptPubKey: { addresses: ['t1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG'] } }]
    };
    const rows = buildCostRows([oldAddrDonation, outgoing({ txid: 'out', to: 't1bob', amount: 50, daysAgo: 1 })], { nowMs: NOW });
    expect(rows.find((r) => r.txid === 'out').category).toBe('other');
  });

  it('does not credit a consolidation sweep from the OLD address as a donation', () => {
    /*
     * Regression: donorsOf used to pass only [sourceAddress] to senderOf, so a
     * transaction consolidating OLD_ADDRESS_FLUX into the current address was
     * misread as "the OLD address donated". A later payment from the source
     * back to OLD then matched that false donor and was labelled Refund
     * instead of Other -- moving real money out of the header's Costs figure
     * and into Refunds, on a panel whose entire purpose is that those two
     * numbers are right.
     */
    const OLD = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';
    const consolidation = {
      txid: 'sweep',
      time: sec(10),
      blockheight: 2_945_000,
      vin: [{ addr: OLD }],
      vout: [{ value: '500', scriptPubKey: { addresses: [DONATION_ADDR] } }]
    };
    const rows = buildCostRows(
      [consolidation, outgoing({ txid: 'out', to: OLD, amount: 50, daysAgo: 1 })],
      { nowMs: NOW }
    );
    expect(rows.find((r) => r.txid === 'out').category).toBe('other');
  });

  it('classifies a refund correctly even when it appears before its justifying donation', () => {
    // Same fixtures as "labels a payment to a prior donor as a refund", with the
    // array order reversed. The two-pass design (collect donors, then
    // categorise) exists precisely so array order cannot matter; nothing
    // previously pinned that.
    const rows = buildCostRows(
      [
        outgoing({ txid: 'out', to: 't1Jprekh', amount: 189, change: 10.99, daysAgo: 9 }),
        incoming({ txid: 'in', from: 't1Jprekh', amount: 100, daysAgo: 10 })
      ],
      { nowMs: NOW }
    );
    const refund = rows.find((r) => r.txid === 'out');
    expect(refund.category).toBe('refund');
    expect(refund.amount).toBe(189);
  });

  it('ignores transactions sent by the OLD address', () => {
    // The old address is node collateral with 18 pages of unrelated movement.
    const fromOld = {
      txid: 'old',
      time: sec(1),
      blockheight: 2_950_000,
      vin: [{ addr: 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG' }],
      vout: [{ value: '99', scriptPubKey: { addresses: ['t3UmJKLz'] } }]
    };
    expect(buildCostRows([fromOld], { nowMs: NOW })).toEqual([]);
  });

  it('drops payments older than the 365-day window', () => {
    expect(buildCostRows([outgoing({ txid: 'a', to: 't1x', amount: 5, daysAgo: 400 })], { nowMs: NOW })).toEqual([]);
  });

  it('carries the note and gives one row per recipient', () => {
    const rows = buildCostRows(
      [
        outgoing({
          txid: 'a',
          to: 't1XNTeg',
          amount: 23,
          change: 1.99,
          daysAgo: 1,
          asm: 'OP_RETURN 7468616e6b7320666f72207468652068656c70'
        })
      ],
      { nowMs: NOW }
    );
    expect(rows[0].note).toBe('thanks for the help');
    expect(rows[0].key).toBe('a:0');
  });

  it('de-duplicates a transaction that arrives from both address scans', () => {
    const tx = outgoing({ txid: 'a', to: 't1x', amount: 5, daysAgo: 1 });
    expect(buildCostRows([tx, tx], { nowMs: NOW })).toHaveLength(1);
  });

  it('sorts by block height, latest first', () => {
    const rows = buildCostRows(
      [
        outgoing({ txid: 'old', to: 't1x', amount: 1, daysAgo: 5, blockheight: 2_900_000 }),
        outgoing({ txid: 'new', to: 't1y', amount: 1, daysAgo: 1, blockheight: 2_950_000 })
      ],
      { nowMs: NOW }
    );
    expect(rows.map((r) => r.txid)).toEqual(['new', 'old']);
  });
});

describe('aggregateCosts', () => {
  it('counts cloud and other as cost, and refunds separately', () => {
    /*
     * Per #366: "Cost (sum of all payments made from donation … to Flux cloud
     * … and the Other category)" and "Refund (sum of refunds to donor)". A
     * refund is money returned, not money spent, so it must not inflate Cost.
     */
    const totals = aggregateCosts([
      { amount: 50, category: 'cloud' },
      { amount: 23, category: 'other' },
      { amount: 189, category: 'refund' }
    ]);
    expect(totals.cloudFlux).toBe(50);
    expect(totals.otherFlux).toBe(23);
    expect(totals.costFlux).toBe(73);
    expect(totals.refundFlux).toBe(189);
    expect(totals.costCount).toBe(2);
    expect(totals.refundCount).toBe(1);
    expect(totals.rowCount).toBe(3);
  });

  it('is all zeros for an empty list', () => {
    expect(aggregateCosts([])).toEqual({
      costFlux: 0,
      refundFlux: 0,
      cloudFlux: 0,
      otherFlux: 0,
      costCount: 0,
      refundCount: 0,
      rowCount: 0
    });
  });

  it('rounds so floating point cannot reach the screen', () => {
    expect(aggregateCosts([{ amount: 0.1, category: 'other' }, { amount: 0.2, category: 'other' }]).costFlux).toBe(0.3);
  });
});

describe('COST_CATEGORY_LABELS', () => {
  it('labels every category a row can carry', () => {
    expect(COST_CATEGORY_LABELS).toEqual({ cloud: 'Flux Cloud', refund: 'Refund', other: 'Other' });
  });
});
