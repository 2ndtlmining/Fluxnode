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

  // A single bare IP can legitimately appear more than once: one host
  // running several Flux nodes on different ports all collapse to one
  // nodeData key, since nodeData carries no port. Live-verified 2026-09-09
  // (one wallet, 8 CUMULUS nodes sharing a host, EPS ranging 265-2143) —
  // without this, a plain first-match scan silently downgraded a real #1
  // node to an arbitrary, much worse one, flipping a Gold medal to nothing.
  describe('a target ip with multiple entries in the group (one host, several ports)', () => {
    it('resolves to the BEST (highest-value) entry, not whichever comes first in the array', () => {
      const dup = [
        { ip: 'shared', eps: 10 }, // index 0 — first occurrence, but not the best
        { ip: 'other', eps: 500 }, // index 1
        { ip: 'shared', eps: 900 }, // index 2 — the wallet's actual best node at this host
        { ip: 'shared', eps: 300 }, // index 3 — a third port, mid value
      ];
      expect(rankInGroup(dup, 'shared', 'eps')).toEqual({ rank: 1, value: 900, total: 4 });
    });

    it('ranks the best duplicate correctly against the rest of the group, including its own lower-value siblings', () => {
      const dup = [
        { ip: 'shared', eps: 50 }, // a low-value duplicate — must not inflate the rank
        { ip: 'top', eps: 999 }, // genuinely outranks the best 'shared' entry
        { ip: 'shared', eps: 800 }, // the best 'shared' entry
        { ip: 'mid', eps: 700 }, // below the best 'shared' entry
      ];
      expect(rankInGroup(dup, 'shared', 'eps')).toEqual({ rank: 2, value: 800, total: 4 });
    });

    it('breaks a tie among the target ip\'s own duplicates the same way as any other tie: earliest index wins', () => {
      const dup = [
        { ip: 'shared', eps: 500 }, // index 0 — earliest of the tied max
        { ip: 'shared', eps: 500 }, // index 1 — tied with index 0
        { ip: 'other', eps: 500 }, // index 2 — also tied, different ip
      ];
      expect(rankInGroup(dup, 'shared', 'eps')).toEqual({ rank: 1, value: 500, total: 3 });
    });
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
