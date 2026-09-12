import { filterAppRows, utilizationAddresses } from './donorFilters';

const rows = [
  { key: '1', nodeAddress: '1.2.3.4:16127', name: 'folding1', category: 'computing' },
  { key: '2', nodeAddress: '1.2.3.4:16127', name: 'wp1', category: 'web' },
  { key: '3', nodeAddress: '5.6.7.8:16127', name: 'mc1', category: 'gaming' },
  { key: '4', nodeAddress: '5.6.7.8:16127', name: 'boinc1', category: 'computing' },
];

const ALL_ADDRESSES = ['1.2.3.4:16127', '5.6.7.8:16127', '9.9.9.9:16127'];

describe('filterAppRows', () => {
  it('returns every row when nothing is selected', () => {
    expect(filterAppRows(rows, {})).toHaveLength(4);
    expect(filterAppRows(rows, { node: null, category: null })).toHaveLength(4);
  });

  it('narrows to one node', () => {
    expect(filterAppRows(rows, { node: '1.2.3.4:16127' }).map((r) => r.name)).toEqual(['folding1', 'wp1']);
  });

  it('narrows to one category', () => {
    expect(filterAppRows(rows, { category: 'computing' }).map((r) => r.name)).toEqual(['folding1', 'boinc1']);
  });

  it('applies both selections together, not one or the other', () => {
    const both = filterAppRows(rows, { node: '5.6.7.8:16127', category: 'computing' });

    expect(both.map((r) => r.name)).toEqual(['boinc1']);
  });

  it('returns nothing when the two selections do not intersect', () => {
    expect(filterAppRows(rows, { node: '1.2.3.4:16127', category: 'gaming' })).toEqual([]);
  });

  it('does not throw on an absent row list', () => {
    expect(filterAppRows(undefined, { node: '1.2.3.4:16127' })).toEqual([]);
  });
});

describe('utilizationAddresses', () => {
  it('is every address when no node is selected', () => {
    expect(utilizationAddresses(ALL_ADDRESSES, null)).toEqual(ALL_ADDRESSES);
  });

  it('is just the selected node when one is selected', () => {
    expect(utilizationAddresses(ALL_ADDRESSES, '5.6.7.8:16127')).toEqual(['5.6.7.8:16127']);
  });

  /*
   * A category is not a set of machines. Utilisation is a percentage of a
   * node's capacity, and "the capacity backing my gaming apps" is not a
   * quantity that exists -- one node's cores serve every app on it. Narrowing
   * the panel by category would put a number on screen that means nothing.
   */
  it('ignores a category selection entirely', () => {
    expect(utilizationAddresses(ALL_ADDRESSES, null, 'gaming')).toEqual(ALL_ADDRESSES);
  });

  it('does not throw on an absent address list', () => {
    expect(utilizationAddresses(undefined, null)).toEqual([]);
    expect(utilizationAddresses(undefined, '1.2.3.4:16127')).toEqual(['1.2.3.4:16127']);
  });
});
