import { rankNodeOperators, aggregateOwnerTotals } from './topOwners';

describe('rankNodeOperators', () => {
  it('counts nodes per payment_address and sorts descending', () => {
    const nodes = [
      { payment_address: 'addrA' },
      { payment_address: 'addrB' },
      { payment_address: 'addrA' },
      { payment_address: 'addrA' },
    ];
    const result = rankNodeOperators(nodes);
    expect(result).toEqual([
      { address: 'addrA', nodeCount: 3 },
      { address: 'addrB', nodeCount: 1 },
    ]);
  });

  it('skips nodes with no payment_address rather than throwing', () => {
    const nodes = [{ payment_address: 'addrA' }, {}, { payment_address: null }];
    expect(() => rankNodeOperators(nodes)).not.toThrow();
    expect(rankNodeOperators(nodes)).toEqual([{ address: 'addrA', nodeCount: 1 }]);
  });

  it('returns an empty array for no nodes', () => {
    expect(rankNodeOperators([])).toEqual([]);
    expect(rankNodeOperators(undefined)).toEqual([]);
  });

  it('respects the topN cap', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ payment_address: `addr${i}` }));
    expect(rankNodeOperators(nodes, 5)).toHaveLength(5);
  });
});

describe('aggregateOwnerTotals', () => {
  it('sums instances per owner, sorts descending, and returns the network total', () => {
    const specs = [
      { owner: 'ownerA', instances: 3 },
      { owner: 'ownerB', instances: 1 },
      { owner: 'ownerA', instances: 2 },
    ];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([
      { owner: 'ownerA', totalInstances: 5 },
      { owner: 'ownerB', totalInstances: 1 },
    ]);
    expect(networkTotalInstances).toBe(6);
  });

  it('treats a missing instances field as 1, matching the rest of this codebase\'s convention', () => {
    const specs = [{ owner: 'ownerA' }, { owner: 'ownerA' }];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([{ owner: 'ownerA', totalInstances: 2 }]);
    expect(networkTotalInstances).toBe(2);
  });

  it('still counts a spec with no owner toward the network total, just not toward any owner row', () => {
    const specs = [{ owner: 'ownerA', instances: 2 }, { instances: 5 }];
    const { owners, networkTotalInstances } = aggregateOwnerTotals(specs);
    expect(owners).toEqual([{ owner: 'ownerA', totalInstances: 2 }]);
    expect(networkTotalInstances).toBe(7);
  });

  it('returns an empty result for no specs', () => {
    expect(aggregateOwnerTotals([])).toEqual({ owners: [], networkTotalInstances: 0 });
    expect(aggregateOwnerTotals(undefined)).toEqual({ owners: [], networkTotalInstances: 0 });
  });

  it('does not slice — callers get every owner, not just a top N', () => {
    const specs = Array.from({ length: 30 }, (_, i) => ({ owner: `owner${i}`, instances: 1 }));
    expect(aggregateOwnerTotals(specs).owners).toHaveLength(30);
  });
});
