import { filterAndSortSpecs, nextSortState } from './specFilter';

/*
 * Issue #247 -- EXPIRING TODAY and DEPLOYED TODAY were static lists with no way
 * to narrow or reorder them. DEPLOYED TODAY routinely carries 80+ rows, so
 * finding one app meant scrolling and reading.
 *
 * The logic lives here rather than in the component so the ordering rules are
 * provable without mounting the Analytics page.
 */
const SPECS = [
  { name: 'valheim178', category: 'gaming', instances: 2, cpuPerInst: 4, ramGBPerInst: 11.72, ssdGBPerInst: 35, timeBlocks: 900 },
  { name: 'minecraftj17', category: 'gaming', instances: 2, cpuPerInst: 2, ramGBPerInst: 3.91, ssdGBPerInst: 30, timeBlocks: 120 },
  { name: 'logcursortest', category: 'other', instances: 1, cpuPerInst: 0.1, ramGBPerInst: 0.1, ssdGBPerInst: 1, timeBlocks: 450 },
  { name: 'PALWORLD178', category: 'gaming', instances: 6, cpuPerInst: 6, ramGBPerInst: 15.63, ssdGBPerInst: 40, timeBlocks: 300 },
];

describe('filterAndSortSpecs', () => {
  it('returns everything untouched with no query and no sort', () => {
    expect(filterAndSortSpecs(SPECS, {}).map((s) => s.name)).toEqual([
      'valheim178', 'minecraftj17', 'logcursortest', 'PALWORLD178',
    ]);
  });

  it('filters by name, case-insensitively', () => {
    // The real data mixes cases -- "PALWORLD178" and "palworld178" both occur.
    expect(filterAndSortSpecs(SPECS, { query: 'palworld' }).map((s) => s.name)).toEqual(['PALWORLD178']);
    expect(filterAndSortSpecs(SPECS, { query: 'VALHEIM' }).map((s) => s.name)).toEqual(['valheim178']);
  });

  it('matches on a substring anywhere in the name', () => {
    expect(filterAndSortSpecs(SPECS, { query: '178' }).map((s) => s.name)).toEqual(['valheim178', 'PALWORLD178']);
  });

  it('also matches the category, so a category can be used as a filter', () => {
    expect(filterAndSortSpecs(SPECS, { query: 'gaming' }).length).toBe(3);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(filterAndSortSpecs(SPECS, { query: 'nosuchapp' })).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterAndSortSpecs(SPECS, { query: '  palworld  ' }).map((s) => s.name)).toEqual(['PALWORLD178']);
  });

  it('sorts numerically, not lexicographically, on numeric columns', () => {
    // A string sort would put 11.72 before 3.91.
    expect(filterAndSortSpecs(SPECS, { sortKey: 'ramGBPerInst', sortDir: 'asc' }).map((s) => s.ramGBPerInst))
      .toEqual([0.1, 3.91, 11.72, 15.63]);
  });

  it('sorts descending when asked', () => {
    expect(filterAndSortSpecs(SPECS, { sortKey: 'instances', sortDir: 'desc' }).map((s) => s.instances))
      .toEqual([6, 2, 2, 1]);
  });

  it('sorts names case-insensitively so PALWORLD does not jump above valheim', () => {
    expect(filterAndSortSpecs(SPECS, { sortKey: 'name', sortDir: 'asc' }).map((s) => s.name))
      .toEqual(['logcursortest', 'minecraftj17', 'PALWORLD178', 'valheim178']);
  });

  it('sorts by time, which is the column users actually care about', () => {
    expect(filterAndSortSpecs(SPECS, { sortKey: 'timeBlocks', sortDir: 'asc' }).map((s) => s.timeBlocks))
      .toEqual([120, 300, 450, 900]);
  });

  it('filters first, then sorts the survivors', () => {
    expect(filterAndSortSpecs(SPECS, { query: 'gaming', sortKey: 'instances', sortDir: 'desc' }).map((s) => s.instances))
      .toEqual([6, 2, 2]);
  });

  it('does not mutate the array it was given', () => {
    const before = SPECS.map((s) => s.name);
    filterAndSortSpecs(SPECS, { sortKey: 'instances', sortDir: 'desc' });
    expect(SPECS.map((s) => s.name)).toEqual(before);
  });

  it('survives a missing or non-array input', () => {
    expect(filterAndSortSpecs(null, { query: 'x' })).toEqual([]);
    expect(filterAndSortSpecs(undefined, {})).toEqual([]);
  });

  it('treats a missing numeric field as lowest rather than throwing', () => {
    const withGap = [{ name: 'a', instances: 2 }, { name: 'b' }];
    expect(filterAndSortSpecs(withGap, { sortKey: 'instances', sortDir: 'desc' }).map((s) => s.name))
      .toEqual(['a', 'b']);
  });
});

describe('nextSortState', () => {
  it('starts a fresh column ascending', () => {
    expect(nextSortState({ sortKey: null, sortDir: null }, 'instances')).toEqual({ sortKey: 'instances', sortDir: 'asc' });
  });

  it('toggles asc to desc on the same column', () => {
    expect(nextSortState({ sortKey: 'instances', sortDir: 'asc' }, 'instances')).toEqual({ sortKey: 'instances', sortDir: 'desc' });
  });

  it('clears the sort on the third click, restoring the original order', () => {
    expect(nextSortState({ sortKey: 'instances', sortDir: 'desc' }, 'instances')).toEqual({ sortKey: null, sortDir: null });
  });

  it('switching columns starts the new one ascending', () => {
    expect(nextSortState({ sortKey: 'instances', sortDir: 'desc' }, 'name')).toEqual({ sortKey: 'name', sortDir: 'asc' });
  });
});
