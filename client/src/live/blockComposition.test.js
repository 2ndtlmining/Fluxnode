import { composeBlock, PARTICLE_CAP } from './blockComposition';

/*
 * Issue #292. One particle per event in a block, coloured by what the event is.
 *
 * The shapes below are the real explorer /txs?block= shape. Measured over 200
 * live blocks while designing this: median 13 transactions, p90 17, p99 65,
 * max 214, and NONE above 500 -- so the cap is a guard against a pathological
 * block, not a routine path.
 *
 * The composition is derived from ONE endpoint. A node transaction announces
 * itself -- it carries `ip`, `benchmarkTier` and `updateType`, and has NO
 * transparent inputs or outputs at all. The fixtures below are that real
 * shape, taken from block 2,945,979.
 *
 * An earlier version of this guessed instead that a confirmation was "a node
 * paying itself", which looks right from the money and is wrong: those
 * transactions move no transparent value, so that test classified all nine of
 * them as transfers-with-no-recipients and silently dropped every confirmation
 * in the block. The fixtures are deliberately the real shape so that mistake
 * cannot be made again from reading the tests.
 */

// The real address the splitter matches on (apidata.js DEV_FUND_ADDRESS).
const DEV_FUND = 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA';

// Percentages the coinbase splitter matches on (TIER_REWARD_PERCENT).
function coinbase({ total = 100, parts } = {}) {
  return {
    isCoinBase: true,
    valueOut: total,
    txid: 'coinbase-tx',
    vin: [{ coinbase: 'deadbeef' }],
    vout: (parts || []).map(([value, address]) => ({
      value: String(value),
      scriptPubKey: { addresses: [address] },
    })),
  };
}

/*
 * A node confirmation, in its real on-chain shape: no transparent movement,
 * and the node's own fields instead.
 */
function confirmationTx(txid) {
  return {
    txid,
    vin: [],
    vout: [],
    type: 'nodetx',
    ip: '1.2.3.4:16127',
    updateType: 'UPDATE_CONFIRM',
    benchmarkTier: 'CUMULUS',
    collateralOutput: { txid: 'collateral', index: 0 },
  };
}

/** A real transfer: outputs to somebody else (plus change back to self). */
function transferTx(txid, { from = 't1Sender', to = ['t1Recipient'], change = 0 } = {}) {
  const vout = to.map((address) => ({ value: '5', scriptPubKey: { addresses: [address] } }));
  if (change) vout.push({ value: String(change), scriptPubKey: { addresses: [from] } });
  return { txid, vin: [{ addr: from }], vout };
}

// A realistic block: 4 rewards + a handful of confirmations, no transfers.
// This is what almost every Flux block looks like.
const TYPICAL = {
  txs: [
    coinbase({
      total: 100,
      // Cumulus/Nimbus/Stratus shares plus the dev fund.
      parts: [[7.142, 't1Cumulus'], [25.0, 't1Nimbus'], [64.28, 't1Stratus'], [3.578, DEV_FUND]],
    }),
    confirmationTx('c1'),
    confirmationTx('c2'),
    confirmationTx('c3'),
  ],
};

describe('composeBlock', () => {
  it('emits one particle per event, with the totals broken out', () => {
    const out = composeBlock(TYPICAL);

    expect(out.counts.reward).toBe(4);
    expect(out.counts.confirm).toBe(3);
    expect(out.counts.p2p).toBe(0);
    expect(out.total).toBe(7);
    expect(out.particles).toHaveLength(7);
  });

  it('keeps each reward particle on its own tier, so the colours mean something', () => {
    const cats = composeBlock(TYPICAL)
      .particles.filter((p) => p.kind === 'reward')
      .map((p) => p.category)
      .sort();

    expect(cats).toEqual(['CUMULUS', 'DEVFUND', 'NIMBUS', 'STRATUS']);
  });

  /*
   * The distinction the whole single-request design rests on. Get this wrong
   * and every confirmation is miscounted as a transfer, which would show the
   * chain as roughly ten times busier than it is.
   */
  it('reads a node transaction as a confirmation, not a transfer', () => {
    const out = composeBlock({ txs: [confirmationTx('c1')] });

    expect(out.counts.confirm).toBe(1);
    expect(out.counts.p2p).toBe(0);
  });

  it('recognises a node transaction with no transparent movement at all', () => {
    // The fallback: a node transaction type whose specific fields differ.
    // Nothing on this chain moves no transparent value AND is a transfer.
    const bare = { txid: 'bare', vin: [], vout: [] };

    expect(composeBlock({ txs: [bare] }).counts.confirm).toBe(1);
  });

  it('does not mistake a node transaction for an empty transfer', () => {
    // The exact regression: classified as a transfer, it contributes no
    // particles at all and the block silently loses ~10 of its ~15 events.
    const out = composeBlock({ txs: Array.from({ length: 9 }, (_, i) => confirmationTx(`c${i}`)) });

    expect(out.total).toBe(9);
    expect(out.particles).toHaveLength(9);
  });

  it('reads a transaction paying someone else as a transfer', () => {
    const out = composeBlock({ txs: [transferTx('t1')] });

    expect(out.counts.p2p).toBe(1);
    expect(out.counts.confirm).toBe(0);
  });

  it('emits one transfer particle PER RECIPIENT, not per transaction', () => {
    // One transaction can pay many addresses -- block 2,920,896 has twelve
    // outputs sharing a single txid.
    const out = composeBlock({ txs: [transferTx('t1', { to: ['t1A', 't1B', 't1C'] })] });

    expect(out.counts.p2p).toBe(3);
  });

  it('does not count change back to the sender as a transfer', () => {
    const out = composeBlock({ txs: [transferTx('t1', { to: ['t1A'], change: 150 })] });

    expect(out.counts.p2p).toBe(1);
  });

  it('gives every particle a stable unique key', () => {
    const keys = composeBlock(TYPICAL).particles.map((p) => p.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  describe('the particle cap', () => {
    const flood = (n) => ({
      txs: [
        coinbase({ total: 100, parts: [[7.142, 't1C'], [25.0, 't1N'], [64.28, 't1S'], [3.578, DEV_FUND]] }),
        ...Array.from({ length: n }, (_, i) => confirmationTx(`c${i}`)),
      ],
    });

    it('leaves a normal block completely untouched', () => {
      // Measured: no block in 200 came close. The cap must not be a thing
      // that quietly reshapes ordinary output.
      const out = composeBlock(flood(60));

      expect(out.capped).toBe(false);
      expect(out.hidden).toBe(0);
      expect(out.particles).toHaveLength(64);
    });

    it('caps a pathological block and says how many it withheld', () => {
      const out = composeBlock(flood(PARTICLE_CAP + 200));

      expect(out.particles.length).toBeLessThanOrEqual(PARTICLE_CAP);
      expect(out.capped).toBe(true);
      expect(out.hidden).toBe(out.total - out.particles.length);
      // The true total is still reported -- the cap is a rendering limit, not
      // a claim about the chain.
      expect(out.total).toBe(PARTICLE_CAP + 204);
    });

    it('never drops a reward particle to make room', () => {
      // Four per block, and they are the only ones that identify a tier.
      const out = composeBlock(flood(PARTICLE_CAP + 200));

      expect(out.particles.filter((p) => p.kind === 'reward')).toHaveLength(4);
    });
  });

  it('returns an empty composition for junk rather than throwing', () => {
    for (const input of [null, undefined, {}, { txs: null }, { txs: [] }]) {
      const out = composeBlock(input);
      expect(out.particles).toEqual([]);
      expect(out.total).toBe(0);
    }
  });

  it('survives a block with no coinbase, which should not happen but must not crash', () => {
    const out = composeBlock({ txs: [confirmationTx('c1')] });

    expect(out.counts.reward).toBe(0);
    expect(out.total).toBe(1);
  });
});
