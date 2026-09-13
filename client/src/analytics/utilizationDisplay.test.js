import { usageLabel, usagePercent, formatStorage } from './utilizationDisplay';

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

  /*
   * This asserted "1,200 / 8,800 GB" until #355. Its intent -- SSD totals get
   * large quickly and must stay readable -- is right, and thousands separators
   * turned out to be the wrong answer to it: 27,060 GB is readable in the
   * sense that the digits are grouped and unreadable in the sense that nobody
   * can size it. Scaling to TB serves the same intent properly.
   */
  it('groups thousands while the figure is still in GB', () => {
    expect(usageLabel({ utilized: 200, total: 1000 }, 'GB')).toBe('200 / 1,000 GB (20%)');
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

/*
 * Issue #355, reported on Discord: "SSD needs to be measured in TB (not GB)".
 *
 * The panel read "1,555 / 27,060 GB (6%)". Twenty-seven thousand gigabytes is
 * a five-digit number nobody can size at a glance, and the Network tab was
 * already showing the same quantity as TB two tabs away -- so the site
 * disagreed with itself about how to write a storage figure.
 *
 * THE UNIT IS CHOSEN FROM THE TOTAL AND APPLIED TO BOTH HALVES. Picking per
 * value would produce "1,555 GB / 26.4 TB", where the ratio is unreadable
 * because the two numbers are in different units.
 *
 * A donor with one Cumulus node has 220 GB and must still see GB -- "0.2 TB"
 * would be worse, not better -- so this scales rather than converting
 * unconditionally.
 */
describe('storage units scale with the total (#355)', () => {
  it('reports the reported case in TB', () => {
    expect(usageLabel({ utilized: 1555, total: 27060 }, 'GB')).toBe('1.5 / 26.4 TB (6%)');
  });

  it('keeps a single small node in GB', () => {
    // One Cumulus node: 220 GB. "0.2 TB" would read as nothing at all.
    expect(usageLabel({ utilized: 20, total: 220 }, 'GB')).toBe('20 / 220 GB (9%)');
  });

  it('switches at 1024 GB, not before', () => {
    expect(usageLabel({ utilized: 0, total: 1023 }, 'GB')).toContain('GB');
    expect(usageLabel({ utilized: 0, total: 1024 }, 'GB')).toContain('TB');
  });

  /*
   * Both halves in ONE unit. The whole point: a reader compares the two
   * numbers, and they cannot if the units differ.
   */
  it('never mixes units across the two halves', () => {
    const label = usageLabel({ utilized: 8, total: 27060 }, 'GB');

    expect(label).toBe('0 / 26.4 TB (0%)');
    expect(label).not.toContain('GB');
  });

  it('leaves Cores alone', () => {
    // Not a storage quantity; 492 cores is 492 cores.
    expect(usageLabel({ utilized: 50.8, total: 492 }, 'Cores')).toBe('50.8 / 492 Cores (10%)');
  });

  it('still says nothing was measured rather than 0 TB', () => {
    expect(usageLabel({ utilized: 0, total: 0 }, 'GB')).toBe('No capacity reported');
  });
});

/*
 * Exported so analytics/NetworkTab/regionCards.jsx can stop keeping its own
 * copy. That copy and this one already agreed; a third would be the point at
 * which they start to drift, which is exactly what NODE_TIER_META's own
 * comment describes happening with tier colours.
 */
describe('formatStorage', () => {
  it('uses TB above the threshold and GB below it', () => {
    expect(formatStorage(27060)).toBe('26.4 TB');
    expect(formatStorage(220)).toBe('220 GB');
  });

  it('renders nothing measured as a dash, not 0 GB', () => {
    expect(formatStorage(0)).toBe('—');
    expect(formatStorage(null)).toBe('—');
  });
});
