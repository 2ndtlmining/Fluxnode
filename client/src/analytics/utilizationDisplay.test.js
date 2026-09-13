import { usageLabel, usagePercent } from './utilizationDisplay';

/*
 * Issue #335. The panel showed percentages and a network-average comparison.
 * What an operator actually wants is how much of their own capacity is in use:
 * "10 / 40 Cores (25%)", summed across their nodes by default and narrowed to
 * one node when one is selected.
 *
 * aggregateDonorUtilization already returns {utilized, total, percentage} per
 * resource -- the old panel rendered only the percentage and discarded the two
 * numbers the request is asking for.
 */

describe('usagePercent', () => {
  it('is the share of capacity in use', () => {
    expect(usagePercent(10, 40)).toBe(25);
  });

  it('is zero, not NaN, when there is no capacity to divide by', () => {
    // A node with no benchmark reading reports total 0. 0/0 must not reach
    // the page as NaN%.
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(5, 0)).toBe(0);
  });

  it('does not exceed 100 even if a node reserves more than it benchmarks', () => {
    // Reservations and benchmarks come from different feeds and can disagree;
    // a bar past the end of its track reads as a rendering bug.
    expect(usagePercent(50, 40)).toBe(100);
  });
});

describe('usageLabel', () => {
  it('reads as used over total, with the unit and the share', () => {
    expect(usageLabel({ utilized: 10, total: 40 }, 'Cores')).toBe('10 / 40 Cores (25%)');
  });

  it('says zero plainly for an unused node rather than hiding it', () => {
    // Selecting an idle 4-core node is a case the request calls out.
    expect(usageLabel({ utilized: 0, total: 4 }, 'Cores')).toBe('0 / 4 Cores (0%)');
  });

  it('drops trailing zeroes so whole numbers read as whole numbers', () => {
    expect(usageLabel({ utilized: 12, total: 64 }, 'GB')).toBe('12 / 64 GB (19%)');
  });

  it('keeps one decimal where the figure genuinely has one', () => {
    // appsCpusLocked can be fractional -- half a core is a real reservation.
    expect(usageLabel({ utilized: 0.5, total: 4 }, 'Cores')).toBe('0.5 / 4 Cores (13%)');
  });

  it('groups thousands, because SSD totals get large quickly', () => {
    expect(usageLabel({ utilized: 1200, total: 8800 }, 'GB')).toBe('1,200 / 8,800 GB (14%)');
  });

  it('says so when there is no capacity reading at all', () => {
    // Distinct from "0 used": nothing was measured, so claiming 0/0 (0%) would
    // be asserting a fact about a node that never reported.
    expect(usageLabel({ utilized: 0, total: 0 }, 'Cores')).toBe('No capacity reported');
  });

  it('tolerates missing or malformed input rather than rendering NaN', () => {
    for (const input of [null, undefined, {}, { utilized: null, total: null }]) {
      expect(usageLabel(input, 'Cores')).toBe('No capacity reported');
    }
  });
});
