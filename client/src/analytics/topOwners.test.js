import { rankNodeOperators } from './topOwners';

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
