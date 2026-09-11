import { categorizeWalletTx, buildWalletTxSummary, counterpartyDisplay, WINDOW_DAYS } from './walletTxHistory';
import { EXCHANGES, FOUNDATION, lookupAddress } from 'data/fluxAddressBook';

const WALLET = 't1WalletUnderTest0000000000000000000';
const STRANGER = 't1SomeoneElse00000000000000000000000';
const KUCOIN = EXCHANGES.find((e) => e.name === 'Kucoin').addresses[0];
const FOUNDATION_ADDR = FOUNDATION.addresses[0];

const NOW = 1_800_000_000;
const recent = NOW - 3600;               // an hour ago
const old = NOW - 30 * 86400;            // 30 days ago, outside the 7-day window

function out(address, value) {
  return { value: String(value), scriptPubKey: { addresses: [address] } };
}

function tx({ txid = 'tx', time = recent, vin = [], vout = [], isCoinBase = false, blockheight = 100 }) {
  return { txid, time, vin, vout, isCoinBase, blockheight };
}

describe('fluxAddressBook', () => {
  it('resolves exchange and foundation addresses, and nothing else', () => {
    expect(lookupAddress(KUCOIN)).toEqual({ kind: 'exchange', name: 'Kucoin' });
    expect(lookupAddress(FOUNDATION_ADDR)).toEqual({ kind: 'foundation', name: 'Flux Foundation' });
    expect(lookupAddress(STRANGER)).toBeNull();
    expect(lookupAddress(null)).toBeNull();
  });

  it('keeps the exchange and foundation sets disjoint', () => {
    // An address in both would resolve to whichever loaded last -- a silent,
    // order-dependent mislabel.
    const exchangeAddrs = new Set(EXCHANGES.flatMap((e) => e.addresses));
    const overlap = FOUNDATION.addresses.filter((a) => exchangeAddrs.has(a));
    expect(overlap).toEqual([]);
  });
});

describe('categorizeWalletTx', () => {
  it('reads a coinbase output to the wallet as a node reward, not a transfer', () => {
    // Checked before the generic incoming case: rewards landing in "transfers
    // in" would make the headline rewards figure meaningless.
    const row = categorizeWalletTx(tx({ isCoinBase: true, vout: [out(WALLET, 2.8125)] }), WALLET);
    expect(row.type).toBe('reward');
    expect(row.direction).toBe('in');
    expect(row.amount).toBeCloseTo(2.8125);
  });

  it('ignores a coinbase that pays someone else', () => {
    expect(categorizeWalletTx(tx({ isCoinBase: true, vout: [out(STRANGER, 2.8)] }), WALLET)).toBeNull();
  });

  it('labels an outgoing payment to a known exchange', () => {
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: WALLET }], vout: [out(KUCOIN, 100)] }), WALLET
    );
    expect(row.direction).toBe('out');
    expect(row.type).toBe('exchange');
    expect(row.counterpartyLabel).toBe('Kucoin');
    expect(row.amount).toBe(100);
  });

  it('labels an outgoing payment to the Flux Foundation', () => {
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: WALLET }], vout: [out(FOUNDATION_ADDR, 10)] }), WALLET
    );
    expect(row.type).toBe('foundation');
    expect(row.counterpartyLabel).toBe('Flux Foundation');
  });

  it('EXCLUDES change returning to the wallet from a send', () => {
    // The bug this guards: counting every output would report a 10 FLUX send
    // as 90, because 80 came straight back as change.
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: WALLET }], vout: [out(STRANGER, 10), out(WALLET, 80)] }), WALLET
    );
    expect(row.direction).toBe('out');
    expect(row.amount).toBe(10);
  });

  it('sums a send that pays several parties', () => {
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: WALLET }], vout: [out(STRANGER, 10), out(KUCOIN, 5), out(WALLET, 1)] }), WALLET
    );
    expect(row.amount).toBe(15);
    // The label names the first real counterparty; the total still covers all.
    expect(row.counterparty).toBe(STRANGER);
  });

  it('ignores a self-send that pays nobody else', () => {
    // A consolidation would otherwise add a meaningless 0-value outgoing row.
    expect(categorizeWalletTx(
      tx({ vin: [{ addr: WALLET }], vout: [out(WALLET, 50)] }), WALLET
    )).toBeNull();
  });

  it('reads an incoming transfer from an unknown sender', () => {
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: STRANGER }], vout: [out(WALLET, 7.5)] }), WALLET
    );
    expect(row.direction).toBe('in');
    expect(row.type).toBe('transfer');
    expect(row.counterpartyLabel).toBeNull();
    expect(row.amount).toBe(7.5);
  });

  it('labels an incoming transfer FROM an exchange', () => {
    const row = categorizeWalletTx(
      tx({ vin: [{ addr: KUCOIN }], vout: [out(WALLET, 40)] }), WALLET
    );
    expect(row.direction).toBe('in');
    expect(row.type).toBe('exchange');
    expect(row.counterpartyLabel).toBe('Kucoin');
  });

  it('returns null for a transaction that does not touch the wallet', () => {
    expect(categorizeWalletTx(tx({ vin: [{ addr: STRANGER }], vout: [out(KUCOIN, 1)] }), WALLET)).toBeNull();
  });

  it('survives malformed input', () => {
    expect(categorizeWalletTx(null, WALLET)).toBeNull();
    expect(categorizeWalletTx(tx({}), WALLET)).toBeNull();
    expect(categorizeWalletTx(tx({ vin: [{ addr: WALLET }], vout: [{ value: 'x' }] }), WALLET)).toBeNull();
  });
});

describe('buildWalletTxSummary', () => {
  it('splits totals by direction and type, and nets them', () => {
    const summary = buildWalletTxSummary([
      tx({ txid: 'r1', isCoinBase: true, vout: [out(WALLET, 3)] }),
      tx({ txid: 'r2', isCoinBase: true, vout: [out(WALLET, 2)] }),
      tx({ txid: 'in', vin: [{ addr: STRANGER }], vout: [out(WALLET, 10)] }),
      tx({ txid: 'ex', vin: [{ addr: WALLET }], vout: [out(KUCOIN, 4)] }),
      tx({ txid: 'fo', vin: [{ addr: WALLET }], vout: [out(FOUNDATION_ADDR, 1)] }),
    ], WALLET, NOW);

    expect(summary.received.rewards).toBe(5);
    expect(summary.received.transfers).toBe(10);
    expect(summary.received.total).toBe(15);
    expect(summary.sent.exchange).toBe(4);
    expect(summary.sent.foundation).toBe(1);
    expect(summary.sent.total).toBe(5);
    expect(summary.net).toBe(10);
    expect(summary.rows).toHaveLength(5);
  });

  it('excludes transactions older than the window', () => {
    const summary = buildWalletTxSummary([
      tx({ txid: 'recent', isCoinBase: true, time: recent, vout: [out(WALLET, 3)] }),
      tx({ txid: 'old', isCoinBase: true, time: old, vout: [out(WALLET, 999)] }),
    ], WALLET, NOW);
    expect(summary.rows.map((r) => r.txid)).toEqual(['recent']);
    expect(summary.received.rewards).toBe(3);
  });

  it('drops a transaction with no timestamp rather than assuming it is recent', () => {
    // Assuming "now" would silently inflate the window's totals.
    const summary = buildWalletTxSummary([
      // NB: null, not undefined -- a destructuring default fires on undefined,
      // so tx({ time: undefined }) would silently get the helper default and
      // this test would pass for the wrong reason.
      tx({ txid: 'notime', time: null, isCoinBase: true, vout: [out(WALLET, 500)] }),
    ], WALLET, NOW);
    expect(summary.rows).toEqual([]);
    expect(summary.received.total).toBe(0);
  });

  it('honours the window boundary exactly', () => {
    const onEdge = NOW - WINDOW_DAYS * 86400;
    const summary = buildWalletTxSummary([
      tx({ txid: 'edge', time: onEdge, isCoinBase: true, vout: [out(WALLET, 1)] }),
      tx({ txid: 'past', time: onEdge - 1, isCoinBase: true, vout: [out(WALLET, 1)] }),
    ], WALLET, NOW);
    expect(summary.rows.map((r) => r.txid)).toEqual(['edge']);
  });

  it('sorts rows newest first', () => {
    const summary = buildWalletTxSummary([
      tx({ txid: 'older', time: NOW - 7200, isCoinBase: true, vout: [out(WALLET, 1)] }),
      tx({ txid: 'newer', time: NOW - 60, isCoinBase: true, vout: [out(WALLET, 1)] }),
    ], WALLET, NOW);
    expect(summary.rows.map((r) => r.txid)).toEqual(['newer', 'older']);
  });

  it('handles an empty or missing list', () => {
    expect(buildWalletTxSummary([], WALLET, NOW).rows).toEqual([]);
    expect(buildWalletTxSummary(null, WALLET, NOW).net).toBe(0);
  });
});

describe('counterpartyDisplay', () => {
  it('prefers a known name', () => {
    expect(counterpartyDisplay({ counterpartyLabel: 'Kucoin', counterparty: KUCOIN })).toBe('Kucoin');
  });

  it('shortens an unknown address rather than showing it whole', () => {
    const shown = counterpartyDisplay({ counterpartyLabel: null, counterparty: STRANGER });
    expect(shown).toContain('…');
    expect(shown.length).toBeLessThan(STRANGER.length);
  });

  it('says Unknown when there is no counterparty at all', () => {
    expect(counterpartyDisplay({ counterpartyLabel: null, counterparty: null })).toBe('Unknown');
    expect(counterpartyDisplay(null)).toBe('—');
  });
});
