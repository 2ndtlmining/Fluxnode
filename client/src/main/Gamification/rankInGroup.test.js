import { rankInGroup, topInGroup } from './rankInGroup';

describe('rankInGroup', () => {
  const nodes = [
    { ip: 'a', eps: 50 }, // index 0
    { ip: 'b', eps: 50 }, // index 1 — tied with a, appears later
    { ip: 'c', eps: 100 }, // index 2 — highest
    { ip: 'd', eps: 10 },  // index 3 — lowest
  ];

  it('ranks the clear highest as #1', () => {
    expect(rankInGroup(nodes, 'c', 'eps')).toEqual({ rank: 1, value: 100, total: 4 });
  });

  it('ranks the clear lowest as last', () => {
    expect(rankInGroup(nodes, 'd', 'eps')).toEqual({ rank: 4, value: 10, total: 4 });
  });

  it('breaks a tie in favor of whichever node appears earlier in the array (matches JS stable-sort behavior)', () => {
    expect(rankInGroup(nodes, 'a', 'eps')).toEqual({ rank: 2, value: 50, total: 4 });
    expect(rankInGroup(nodes, 'b', 'eps')).toEqual({ rank: 3, value: 50, total: 4 });
  });

  it('returns null for an ip not present in the group', () => {
    expect(rankInGroup(nodes, 'not-here', 'eps')).toBeNull();
  });

  it('returns total:1, rank:1 for a single-node group', () => {
    expect(rankInGroup([{ ip: 'only', eps: 5 }], 'only', 'eps')).toEqual({ rank: 1, value: 5, total: 1 });
  });

  it('treats a missing metric value as 0', () => {
    const withMissing = [{ ip: 'x' }, { ip: 'y', eps: 5 }];
    expect(rankInGroup(withMissing, 'x', 'eps')).toEqual({ rank: 2, value: 0, total: 2 });
  });
});

describe('topInGroup', () => {
  const nodes = [{ ip: 'a', eps: 50 }, { ip: 'b', eps: 100 }, { ip: 'c', eps: 10 }];

  it('returns the highest-value node as {ip, value}', () => {
    expect(topInGroup(nodes, 'eps')).toEqual({ ip: 'b', value: 100 });
  });

  it('returns null for an empty group', () => {
    expect(topInGroup([], 'eps')).toBeNull();
  });

  it('breaks a tie in favor of whichever node appears earlier (matches the old rank-1 behavior)', () => {
    const tied = [{ ip: 'first', eps: 100 }, { ip: 'second', eps: 100 }];
    expect(topInGroup(tied, 'eps')).toEqual({ ip: 'first', value: 100 });
  });
});
