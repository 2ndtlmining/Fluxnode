import { sortByRank, mostRecentPayout } from './donorNodes';

function node(overrides) {
  return { rank: 0, last_reward: '-', next_reward: '-', tier: 'CUMULUS', id: 'x', ip_display: 'x', ...overrides };
}

describe('sortByRank', () => {
  it('sorts ascending by rank — lowest rank (soonest payout) first', () => {
    const nodes = [node({ id: 'c', rank: 300 }), node({ id: 'a', rank: 10 }), node({ id: 'b', rank: 150 })];
    expect(sortByRank(nodes).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const nodes = [node({ id: 'b', rank: 2 }), node({ id: 'a', rank: 1 })];
    const original = [...nodes];
    sortByRank(nodes);
    expect(nodes).toEqual(original);
  });

  it('handles empty and undefined input', () => {
    expect(sortByRank([])).toEqual([]);
    expect(sortByRank(undefined)).toEqual([]);
  });
});

describe('mostRecentPayout', () => {
  it('picks the node with the most recent last_reward', () => {
    const nodes = [
      node({ id: 'old', last_reward: '01-Jan-2026 10:00:00' }),
      node({ id: 'newest', last_reward: '20-Feb-2026 08:30:00' }),
      node({ id: 'middle', last_reward: '05-Feb-2026 12:00:00' }),
    ];
    expect(mostRecentPayout(nodes).id).toBe('newest');
  });

  it('excludes nodes that have never been paid (last_reward === "-")', () => {
    const nodes = [node({ id: 'never', last_reward: '-' }), node({ id: 'paid', last_reward: '01-Jan-2026 00:00:00' })];
    expect(mostRecentPayout(nodes).id).toBe('paid');
  });

  it('returns null when no node has ever been paid', () => {
    expect(mostRecentPayout([node({ last_reward: '-' }), node({ last_reward: '-' })])).toBeNull();
  });

  it('returns null for empty or undefined input', () => {
    expect(mostRecentPayout([])).toBeNull();
    expect(mostRecentPayout(undefined)).toBeNull();
  });
});
