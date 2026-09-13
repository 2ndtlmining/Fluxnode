import { applyCategoryFilter, toggleCategory, chipState } from './categoryFilter';

/*
 * Issue #332: the category breakdown on the /nodes Apps tab becomes a
 * multi-select filter.
 *
 * The trap this exists to prevent: the chips are counted FROM the rows. Derive
 * them from rows that have already been category-filtered and every unselected
 * chip disappears the instant you select one -- which makes multi-select
 * impossible and leaves no way back except a reset the reader has to find.
 * Chips must always be counted from the text-filtered set, never the
 * category-filtered one, and these tests pin that separation.
 */

const rows = [
  { appName: 'a', category: 'computing' },
  { appName: 'b', category: 'gaming' },
  { appName: 'c', category: 'computing' },
  { appName: 'd', category: 'web' },
];

describe('applyCategoryFilter', () => {
  it('shows everything when nothing is selected', () => {
    // Empty selection means "all", not "none" -- the default state of the page.
    expect(applyCategoryFilter(rows, new Set())).toHaveLength(4);
    expect(applyCategoryFilter(rows, null)).toHaveLength(4);
  });

  it('narrows to one selected category', () => {
    expect(applyCategoryFilter(rows, new Set(['computing'])).map((r) => r.appName)).toEqual(['a', 'c']);
  });

  it('includes every selected category, not just the first', () => {
    const out = applyCategoryFilter(rows, new Set(['gaming', 'web']));

    expect(out.map((r) => r.appName)).toEqual(['b', 'd']);
  });

  it('returns nothing when a selected category has no rows', () => {
    expect(applyCategoryFilter(rows, new Set(['media']))).toEqual([]);
  });

  it('does not throw on an absent row list', () => {
    expect(applyCategoryFilter(undefined, new Set(['computing']))).toEqual([]);
  });
});

describe('toggleCategory', () => {
  it('adds a category that was not selected', () => {
    expect([...toggleCategory(new Set(), 'gaming')]).toEqual(['gaming']);
  });

  it('removes one that was', () => {
    expect([...toggleCategory(new Set(['gaming']), 'gaming')]).toEqual([]);
  });

  it('keeps the others when toggling one', () => {
    const next = toggleCategory(new Set(['gaming', 'web']), 'web');

    expect([...next]).toEqual(['gaming']);
  });

  it('returns a new set rather than mutating, so React sees the change', () => {
    const before = new Set(['gaming']);
    const after = toggleCategory(before, 'web');

    expect(after).not.toBe(before);
    expect([...before]).toEqual(['gaming']);
  });

  /*
   * Deselecting the last one returns to "all" rather than to an empty table.
   * A filter UI that can reach a state showing nothing, with every chip off
   * and no obvious cause, reads as the page being broken.
   */
  it('turning the last category off means all, not none', () => {
    const cleared = toggleCategory(new Set(['gaming']), 'gaming');

    expect(cleared.size).toBe(0);
    expect(applyCategoryFilter(rows, cleared)).toHaveLength(4);
  });
});

describe('chipState', () => {
  it('is neutral for every chip while nothing is selected', () => {
    // Not "all dimmed" and not "all lit" -- with no filter on, no chip should
    // be making a claim about itself.
    expect(chipState('computing', new Set())).toBe('neutral');
    expect(chipState('gaming', new Set())).toBe('neutral');
  });

  it('marks the selected ones on and the rest off once a filter is active', () => {
    const selected = new Set(['computing']);

    expect(chipState('computing', selected)).toBe('on');
    expect(chipState('gaming', selected)).toBe('off');
  });
});
