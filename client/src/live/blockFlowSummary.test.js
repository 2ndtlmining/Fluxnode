import { buildBlockFlowSummary } from './blockFlowSummary';

function rewardEvent(tier, amount, address = `addr-${tier}`) {
  return { id: `reward-${tier}`, type: 'reward', tier, amount, paymentAddress: address };
}
function confirmEvent(tier, id) {
  return { id, type: 'confirm', tier, ip: '1.2.3.4' };
}
function p2pEvent(id, amount) {
  return { id, type: 'p2p', from: 'a', to: 'b', amount };
}
function deployEvent(id, overrides = {}) {
  return {
    id,
    type: 'deploy',
    appName: 'TestApp',
    category: 'blockchain',
    instances: 2,
    cpuPerInst: 4,
    ramGBPerInst: 8,
    ssdGBPerInst: 100,
    owner: 't1owner',
    ...overrides,
  };
}

describe('buildBlockFlowSummary', () => {
  it('returns null for a missing block', () => {
    expect(buildBlockFlowSummary(null)).toBeNull();
    expect(buildBlockFlowSummary(undefined)).toBeNull();
  });

  it('summarizes an empty block (no events) with all-zero counts and empty lists', () => {
    const summary = buildBlockFlowSummary({ height: 100, hash: 'h100', at: 123, events: [] });
    expect(summary).toEqual({
      height: 100,
      hash: 'h100',
      at: 123,
      rewards: { count: 0, totalFlux: 0, tiers: [] },
      deployments: { count: 0, instances: 0, apps: [] },
      p2p: { count: 0, totalFlux: 0, transfers: [] },
      confirmations: { count: 0, byTier: [] },
    });
  });

  it('treats a block with no events array the same as an empty one', () => {
    const summary = buildBlockFlowSummary({ height: 1, hash: 'h', at: 1 });
    expect(summary.rewards).toEqual({ count: 0, totalFlux: 0, tiers: [] });
  });

  it('sums reward totals and lists tiers in fixed order including Dev Fund', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [
        rewardEvent('STRATUS', 9, 'addrStratus'),
        rewardEvent('DEVFUND', 0.5, 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA'),
        rewardEvent('CUMULUS', 1, 'addrCumulus'),
      ],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.rewards.count).toBe(3);
    expect(summary.rewards.totalFlux).toBeCloseTo(10.5);
    expect(summary.rewards.tiers.map((t) => t.tier)).toEqual(['CUMULUS', 'STRATUS', 'DEVFUND']);
    expect(summary.rewards.tiers.find((t) => t.tier === 'DEVFUND')).toMatchObject({
      label: 'Dev Fund',
      amount: 0.5,
      address: 't3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA',
    });
  });

  it('sums P2P count and total, and lists individual transfers in order', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [p2pEvent('p1', 8), p2pEvent('p2', 4.42)] };
    const summary = buildBlockFlowSummary(block);
    expect(summary.p2p.count).toBe(2);
    expect(summary.p2p.totalFlux).toBeCloseTo(12.42);
    expect(summary.p2p.transfers).toEqual([
      { id: 'p1', from: 'a', to: 'b', amount: 8 },
      { id: 'p2', from: 'a', to: 'b', amount: 4.42 },
    ]);
  });

  it('counts deployments and sums instances, carrying resource/owner details', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [deployEvent('d1', { appName: 'Nextcloud', instances: 2 }), deployEvent('d2', { appName: 'Jellyfin', instances: 1 })],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.deployments.count).toBe(2);
    expect(summary.deployments.instances).toBe(3);
    expect(summary.deployments.apps).toEqual([
      { name: 'Nextcloud', instances: 2, cpuPerInst: 4, ramGBPerInst: 8, ssdGBPerInst: 100, category: 'blockchain', owner: 't1owner' },
      { name: 'Jellyfin', instances: 1, cpuPerInst: 4, ramGBPerInst: 8, ssdGBPerInst: 100, category: 'blockchain', owner: 't1owner' },
    ]);
  });

  it('breaks confirmations down by tier in fixed order, excluding Dev Fund', () => {
    const block = {
      height: 1, hash: 'h', at: 1,
      events: [
        confirmEvent('CUMULUS', 'c1'), confirmEvent('CUMULUS', 'c2'),
        confirmEvent('NIMBUS', 'c3'),
        confirmEvent('STRATUS', 'c4'),
      ],
    };
    const summary = buildBlockFlowSummary(block);

    expect(summary.confirmations.count).toBe(4);
    expect(summary.confirmations.byTier).toEqual([
      { tier: 'CUMULUS', label: 'Cumulus', color: '#2686d0', count: 2 },
      { tier: 'NIMBUS', label: 'Nimbus', color: '#d07e26', count: 1 },
      { tier: 'STRATUS', label: 'Stratus', color: '#c92641', count: 1 },
    ]);
  });

  it('ignores event types it does not recognize rather than throwing', () => {
    const block = { height: 1, hash: 'h', at: 1, events: [{ id: 'x', type: 'unknown-future-type' }] };
    expect(() => buildBlockFlowSummary(block)).not.toThrow();
  });
});
