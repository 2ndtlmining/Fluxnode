import {
  extractRewardsFromCoinbase,
  buildRewardEvents,
  buildConfirmationEvents,
  lookupNodeInfo,
  extractP2pTransfers,
  diffDeployedForEvents,
  attachEventsToBlocks,
} from './apidata';

// Real shape from a real block's coinbase tx (height 2916763): a small
// treasury/dev output plus one output per tier, in CC_FLUX_REWARD_* splits
// of the 14 FLUX block reward (7.142% / 25% / 64.28%).
function realCoinbaseTx() {
  return {
    isCoinBase: true,
    valueOut: 14,
    vout: [
      { value: '0.50000000', scriptPubKey: { addresses: ['t3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA'] } }, // treasury
      { value: '1.00000000', scriptPubKey: { addresses: ['t1aDybT3BM7hkpween5SwrGhTam1gBXuBgG'] } }, // Cumulus
      { value: '3.50000000', scriptPubKey: { addresses: ['t3aqgLXMH6LHgCH7dGAZTBp3PWaaLPrHw8t'] } }, // Nimbus
      { value: '9.00000000', scriptPubKey: { addresses: ['t3N6aaTHN8WBcaYbQrHvGDGJH9Wg73AN367'] } }, // Stratus
    ],
  };
}

describe('extractRewardsFromCoinbase', () => {
  it('identifies all three tier outputs by percentage share, ignoring the treasury output', () => {
    const rewards = extractRewardsFromCoinbase(realCoinbaseTx());

    expect(rewards).toEqual(
      expect.arrayContaining([
        { tier: 'CUMULUS', address: 't1aDybT3BM7hkpween5SwrGhTam1gBXuBgG', amount: 1 },
        { tier: 'NIMBUS', address: 't3aqgLXMH6LHgCH7dGAZTBp3PWaaLPrHw8t', amount: 3.5 },
        { tier: 'STRATUS', address: 't3N6aaTHN8WBcaYbQrHvGDGJH9Wg73AN367', amount: 9 },
      ])
    );
    expect(rewards).toHaveLength(3); // treasury output correctly excluded
  });

  it('returns nothing for a non-coinbase transaction', () => {
    expect(extractRewardsFromCoinbase({ isCoinBase: false, valueOut: 14, vout: [] })).toEqual([]);
  });

  it('returns nothing when the transaction is missing or malformed', () => {
    expect(extractRewardsFromCoinbase(null)).toEqual([]);
    expect(extractRewardsFromCoinbase({ isCoinBase: true })).toEqual([]);
  });

  it('skips an output with no resolvable address rather than throwing', () => {
    const tx = { isCoinBase: true, valueOut: 14, vout: [{ value: '9.00000000', scriptPubKey: {} }] };
    expect(() => extractRewardsFromCoinbase(tx)).not.toThrow();
    expect(extractRewardsFromCoinbase(tx)).toEqual([]);
  });
});

describe('buildRewardEvents', () => {
  it('builds a full event per reward, resolving country from the address geo map', () => {
    const block = { height: 2916763 };
    const rewards = [{ tier: 'STRATUS', address: 'addrA', amount: 9 }];
    const addressGeoMap = { addrA: { country: 'Germany', countryCode: 'DE' } };

    const [event] = buildRewardEvents(block, rewards, addressGeoMap);

    expect(event).toMatchObject({
      type: 'reward',
      tier: 'STRATUS',
      blockHeight: 2916763,
      paymentAddress: 'addrA',
      country: 'Germany',
      countryCode: 'DE',
      amount: 9, // real, not a network-average estimate
    });
  });

  it('leaves country null rather than throwing when the address has no known geo', () => {
    const [event] = buildRewardEvents({ height: 1 }, [{ tier: 'CUMULUS', address: 'unknown', amount: 1 }], {});
    expect(event.country).toBeNull();
    expect(event.countryCode).toBeNull();
  });
});

describe('buildConfirmationEvents', () => {
  // Real shape of a "Confirming a fluxnode" special transaction, from the
  // daemon's verbose getblock (see live/apidata.js for why this needs that
  // endpoint specifically — the explorer's own block/tx endpoints omit it).
  function confirmingTx(overrides = {}) {
    return {
      txid: 'tx1',
      type: 'Confirming a fluxnode',
      ip: '51.178.29.46',
      benchmark_tier: 'CUMULUS',
      ...overrides,
    };
  }

  it('builds one event per confirming transaction with its real tier and IP', () => {
    const events = buildConfirmationEvents({ height: 100 }, [confirmingTx()]);

    expect(events).toEqual([
      { id: 'confirm-tx1', type: 'confirm', tier: 'CUMULUS', blockHeight: 100, ip: '51.178.29.46', at: expect.any(Number) },
    ]);
  });

  it('strips a trailing :port from the ip when present', () => {
    const [event] = buildConfirmationEvents({ height: 1 }, [confirmingTx({ ip: '90.24.3.81:16177' })]);
    expect(event.ip).toBe('90.24.3.81');
  });

  it('handles multiple confirmations in the same block independently', () => {
    const txs = [confirmingTx({ txid: 'a', benchmark_tier: 'CUMULUS' }), confirmingTx({ txid: 'b', benchmark_tier: 'STRATUS' })];
    const events = buildConfirmationEvents({ height: 1 }, txs);
    expect(events.map((e) => e.tier)).toEqual(['CUMULUS', 'STRATUS']);
  });

  it('returns nothing when there are no confirming transactions this block', () => {
    expect(buildConfirmationEvents({ height: 1 }, [])).toEqual([]);
    expect(buildConfirmationEvents({ height: 1 }, undefined)).toEqual([]);
  });
});

describe('lookupNodeInfo', () => {
  const globalRankings = {
    nodeGeoMap: { '1.2.3.4': { country: 'Germany', countryCode: 'DE' } },
    tierRankings: {
      CUMULUS: {
        eps: [{ ip: '1.2.3.4', rank: 3, value: 900 }, { ip: '5.6.7.8', rank: 1, value: 950 }],
        dws: [{ ip: '1.2.3.4', rank: 2, value: 210 }],
        down_speed: [{ ip: '1.2.3.4', rank: 1, value: 87.5 }],
        up_speed: [{ ip: '1.2.3.4', rank: 4, value: 41.2 }],
      },
    },
  };

  it('resolves country and real benchmark numbers for a known node', () => {
    const info = lookupNodeInfo('1.2.3.4', 'CUMULUS', globalRankings);
    expect(info).toEqual({
      country: 'Germany',
      countryCode: 'DE',
      benchmark: { eps: 900, dws: 210, down_speed: 87.5, up_speed: 41.2 },
    });
  });

  it('leaves country and benchmark null for an unknown node rather than throwing', () => {
    const info = lookupNodeInfo('9.9.9.9', 'CUMULUS', globalRankings);
    expect(info).toEqual({ country: null, countryCode: null, benchmark: null });
  });

  it('handles a missing rankings snapshot gracefully', () => {
    expect(() => lookupNodeInfo('1.2.3.4', 'CUMULUS', {})).not.toThrow();
    expect(lookupNodeInfo('1.2.3.4', 'CUMULUS', undefined)).toEqual({ country: null, countryCode: null, benchmark: null });
  });

  it('handles a missing ip or tier gracefully', () => {
    expect(lookupNodeInfo(null, 'CUMULUS', globalRankings)).toEqual({ country: null, countryCode: null, benchmark: null });
    expect(lookupNodeInfo('1.2.3.4', null, globalRankings)).toEqual({ country: 'Germany', countryCode: 'DE', benchmark: null });
  });
});

describe('extractP2pTransfers', () => {
  it('extracts the real sender and recipient of a simple send', () => {
    const tx = {
      txid: 'tx1',
      vin: [{ addr: 'sender' }],
      vout: [
        { value: '5.00000000', scriptPubKey: { addresses: ['recipient'] } },
        { value: '1.23000000', scriptPubKey: { addresses: ['sender'] } }, // change back to self
      ],
    };

    const transfers = extractP2pTransfers([tx]);

    expect(transfers).toEqual([{ id: 'p2p-tx1-recipient', type: 'p2p', txid: 'tx1', from: 'sender', to: 'recipient', amount: 5 }]);
  });

  it('excludes change-back-to-self outputs', () => {
    const tx = { txid: 'tx1', vin: [{ addr: 'sender' }], vout: [{ value: '1', scriptPubKey: { addresses: ['sender'] } }] };
    expect(extractP2pTransfers([tx])).toEqual([]);
  });

  it('produces one transfer per distinct recipient when a tx pays multiple addresses', () => {
    const tx = {
      txid: 'tx1',
      vin: [{ addr: 'sender' }],
      vout: [
        { value: '1', scriptPubKey: { addresses: ['recipientA'] } },
        { value: '2', scriptPubKey: { addresses: ['recipientB'] } },
      ],
    };
    expect(extractP2pTransfers([tx])).toHaveLength(2);
  });

  it('returns nothing for an empty or missing transaction list', () => {
    expect(extractP2pTransfers([])).toEqual([]);
    expect(extractP2pTransfers(undefined)).toEqual([]);
  });

  it('skips an output with no resolvable address or zero value rather than throwing', () => {
    const tx = { txid: 'tx1', vin: [{ addr: 'sender' }], vout: [{ value: '0', scriptPubKey: { addresses: ['recipient'] } }, { value: '1', scriptPubKey: {} }] };
    expect(() => extractP2pTransfers([tx])).not.toThrow();
    expect(extractP2pTransfers([tx])).toEqual([]);
  });
});

describe('diffDeployedForEvents', () => {
  it('emits an event only for specs not present in the previous list', () => {
    const prev = [{ name: 'appA', height: 100 }];
    const next = [{ name: 'appA', height: 100 }, { name: 'appB', height: 105 }];

    const events = diffDeployedForEvents(prev, next);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'deploy', appName: 'appB', blockHeight: 105 });
  });

  it('fires nothing when nothing new has deployed', () => {
    const list = [{ name: 'appA', height: 100 }];
    expect(diffDeployedForEvents(list, list)).toHaveLength(0);
  });

  it('treats a first-ever list as all-new', () => {
    const next = [{ name: 'appA', height: 100 }];
    expect(diffDeployedForEvents(null, next)).toHaveLength(1);
  });

  it('files a new deploy under the attribution height, not the app spec\'s own real height', () => {
    // The real height (spec.height) is where the app was actually deployed,
    // which can be anywhere in the last ~24h/2880 blocks — far outside the
    // ~5 blocks the chain rail displays. Filing it under attributionHeight
    // (the tip at detection time) is what makes it show up at all.
    const next = [{ name: 'appA', height: 41230 }];
    const [event] = diffDeployedForEvents(null, next, 99999);

    expect(event.blockHeight).toBe(99999);
    expect(event.deployedAtHeight).toBe(41230);
  });

  it('falls back to the spec\'s own height when no attribution height is given', () => {
    const next = [{ name: 'appA', height: 100 }];
    const [event] = diffDeployedForEvents(null, next);
    expect(event.blockHeight).toBe(100);
  });

  it('carries repo, resource and owner details through for the details panel', () => {
    const next = [{
      name: 'appA', height: 100, owner: 't1owner',
      cpuPerInst: 2, ramGBPerInst: 4, ssdGBPerInst: 10,
      compose: [{ repotag: 'someimage/app:latest' }],
    }];
    const [event] = diffDeployedForEvents(null, next);
    expect(event).toMatchObject({
      owner: 't1owner', cpuPerInst: 2, ramGBPerInst: 4, ssdGBPerInst: 10, repos: ['someimage/app:latest'],
    });
  });

  it('falls back to a legacy top-level repotag when there is no compose array', () => {
    const next = [{ name: 'appA', height: 100, repotag: 'legacy/image:1' }];
    const [event] = diffDeployedForEvents(null, next);
    expect(event.repos).toEqual(['legacy/image:1']);
  });

  it('carries description and expire duration through, null when absent', () => {
    const withBoth = [{ name: 'appA', height: 100, description: 'A cool app', expire: 22000 }];
    const [event] = diffDeployedForEvents(null, withBoth);
    expect(event.description).toBe('A cool app');
    expect(event.expireBlocks).toBe(22000);

    const withNeither = [{ name: 'appB', height: 100 }];
    const [event2] = diffDeployedForEvents(null, withNeither);
    expect(event2.description).toBeNull();
    expect(event2.expireBlocks).toBeNull();
  });
});

describe('attachEventsToBlocks', () => {
  it('attaches accumulated events for a block by height', () => {
    const blocks = [{ height: 100 }];
    const eventsByHeight = { 100: [{ id: 'e1', type: 'reward' }] };

    const result = attachEventsToBlocks(blocks, eventsByHeight);

    expect(result[0].events).toEqual([{ id: 'e1', type: 'reward' }]);
  });

  it('gives a block with nothing accumulated an empty events list, not undefined', () => {
    const result = attachEventsToBlocks([{ height: 100 }], {});
    expect(result[0].events).toEqual([]);
  });
});
