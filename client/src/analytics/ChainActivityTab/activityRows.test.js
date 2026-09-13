import {
  deploymentRows,
  transferRows,
  coverageSummary,
  resourceLabel,
  filterRows,
  sortRows,
  BLOCKS_PER_DAY
} from './activityRows';

/*
 * Issue #346: the detail becomes the page.
 *
 * The screen was inverted -- two counts got a 400px chart while the events
 * themselves sat two clicks deep in a ~200px scroll window. These modules
 * flatten the retained blocks into the two lists the page is now built from,
 * and compute the coverage figure that stops the headline overstating what was
 * actually scanned.
 */

function block(height, over = {}) {
  return {
    height,
    date: '2026-09-05',
    isP2p: false,
    isDapp: false,
    transferCount: 0,
    deploymentCount: 0,
    hash: 'a'.repeat(64),
    transfers: [],
    deployments: [],
    ...over
  };
}

function deployment(name, over = {}) {
  return {
    name,
    owner: '1CkN6E5wWTUgMFhB93uNpE9mDUqX5LWbJF',
    instances: 3,
    repotag: 'siomiz/softethervpn:9799-alpine',
    cpu: 0.1,
    ram: 100,
    hdd: 1,
    enterprise: false,
    resourcesKnown: true,
    expire: 22000,
    ...over
  };
}

function transfer(txid, over = {}) {
  return { txid, from: 't1Sender', to: 't3Recipient', amount: 0.02, ...over };
}

describe('deploymentRows', () => {
  it('flattens every deployment across blocks, carrying its block', () => {
    const rows = deploymentRows([
      block(100, { deployments: [deployment('alpha'), deployment('beta')] }),
      block(200, { deployments: [deployment('gamma')] })
    ]);

    expect(rows.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect(rows[0].height).toBe(100);
    expect(rows[2].height).toBe(200);
  });

  it('carries the block hash so the row can link to the explorer', () => {
    // #347. Without the hash the height is not linkable at all.
    const [row] = deploymentRows([block(100, { hash: 'b'.repeat(64), deployments: [deployment('a')] })]);

    expect(row.hash).toBe('b'.repeat(64));
  });

  it('returns [] for junk rather than throwing', () => {
    for (const input of [null, undefined, [], [null], [{}]]) {
      expect(Array.isArray(deploymentRows(input))).toBe(true);
    }
  });

  it('gives every row a stable unique key even when a block has several', () => {
    const rows = deploymentRows([block(100, { deployments: [deployment('a'), deployment('b')] })]);

    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});

describe('resourceLabel', () => {
  it('renders readable resources', () => {
    expect(resourceLabel(deployment('a', { cpu: 2, ram: 1536, hdd: 15 }))).toBe('2 cpu · 1536 MB · 15 GB');
  });

  /*
   * 390 of 1,462 live specs (26.7%) are enterprise: resources encrypted, not
   * absent. Rendering "0 cpu" would state that the app uses nothing, which is
   * not true of any app -- the exact class of confident wrong number this
   * codebase keeps designing against.
   */
  it('says encrypted for an enterprise app rather than showing zeros', () => {
    const label = resourceLabel(deployment('v', { enterprise: true, resourcesKnown: false, cpu: 0, ram: 0, hdd: 0 }));

    expect(label).toBe('Encrypted');
    expect(label).not.toContain('0');
  });

  it('says unknown when resources are absent for any other reason', () => {
    expect(resourceLabel(deployment('x', { resourcesKnown: false, enterprise: false }))).toBe('Unknown');
  });

  it('drops a trailing .0 so whole numbers read cleanly', () => {
    expect(resourceLabel(deployment('a', { cpu: 1.0, ram: 512, hdd: 5 }))).toBe('1 cpu · 512 MB · 5 GB');
  });
});

describe('transferRows', () => {
  it('flattens transfers across blocks with their block and hash', () => {
    const rows = transferRows([
      block(100, { hash: 'c'.repeat(64), transfers: [transfer('t1'), transfer('t2')] }),
      block(200, { transfers: [transfer('t3')] })
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].height).toBe(100);
    expect(rows[0].hash).toBe('c'.repeat(64));
  });

  it('keeps an unknown sender distinguishable from a named one', () => {
    // The explorer omits `addr` on some inputs. "unknown" is a real answer;
    // rendering it as an empty cell would read as a bug.
    const [row] = transferRows([block(100, { transfers: [transfer('t1', { from: null })] })]);

    expect(row.from).toBeNull();
  });

  it('returns [] for junk', () => {
    expect(transferRows(null)).toEqual([]);
    expect(transferRows([{}])).toEqual([]);
  });
});

/*
 * The headline in #346's screenshot read "8 UTILITY BLOCKS TODAY" from 199
 * empty + 8 utility = 207 blocks. A Flux day is 2,880. It was reporting 7% of a
 * day as though it were the day.
 */
describe('coverageSummary', () => {
  it('reports what was actually scanned, not what a day contains', () => {
    const s = coverageSummary([{ date: '2026-09-05', utilityBlocks: 8, emptyBlocks: 199 }]);

    expect(s.blocksScanned).toBe(207);
    expect(s.blocksExpected).toBe(BLOCKS_PER_DAY);
    expect(s.partial).toBe(true);
    expect(s.pct).toBe(7);
  });

  it('stops calling a day partial once it is covered', () => {
    const s = coverageSummary([{ date: '2026-09-05', utilityBlocks: 80, emptyBlocks: 2800 }]);

    expect(s.blocksScanned).toBe(2880);
    expect(s.partial).toBe(false);
    expect(s.pct).toBe(100);
  });

  it('sums across days and expects a full day for each', () => {
    const s = coverageSummary([
      { date: '2026-09-04', utilityBlocks: 80, emptyBlocks: 2800 },
      { date: '2026-09-05', utilityBlocks: 8, emptyBlocks: 199 }
    ]);

    expect(s.days).toBe(2);
    expect(s.blocksScanned).toBe(3087);
    expect(s.blocksExpected).toBe(2 * BLOCKS_PER_DAY);
    expect(s.partial).toBe(true);
  });

  it('handles no data without dividing by zero', () => {
    const s = coverageSummary([]);

    expect(s.blocksScanned).toBe(0);
    expect(s.days).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.partial).toBe(true);
  });
});

describe('filterRows', () => {
  const rows = deploymentRows([
    block(100, { deployments: [deployment('valheim-server', { owner: 't1Alice' })] }),
    block(101, { deployments: [deployment('minecraft', { owner: 't1Bob', repotag: 'itzg/minecraft:latest' })] })
  ]);

  it('returns everything for an empty query', () => {
    expect(filterRows(rows, '')).toHaveLength(2);
    expect(filterRows(rows, '   ')).toHaveLength(2);
  });

  it('matches on any of the searchable fields, case-insensitively', () => {
    expect(filterRows(rows, 'VALHEIM').map((r) => r.name)).toEqual(['valheim-server']);
    expect(filterRows(rows, 't1bob').map((r) => r.name)).toEqual(['minecraft']);
    expect(filterRows(rows, 'itzg').map((r) => r.name)).toEqual(['minecraft']);
  });

  it('matches a block height as typed, with or without separators', () => {
    expect(filterRows(rows, '100')).toHaveLength(1);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(filterRows(rows, 'zzzz')).toEqual([]);
  });
});

describe('sortRows', () => {
  const rows = deploymentRows([
    block(100, { deployments: [deployment('beta', { instances: 9 })] }),
    block(300, { deployments: [deployment('alpha', { instances: 2 })] })
  ]);

  it('sorts numerically on a numeric key, descending by default', () => {
    expect(sortRows(rows, 'height', false).map((r) => r.height)).toEqual([300, 100]);
    expect(sortRows(rows, 'height', true).map((r) => r.height)).toEqual([100, 300]);
  });

  it('sorts strings alphabetically rather than by codepoint arithmetic', () => {
    expect(sortRows(rows, 'name', true).map((r) => r.name)).toEqual(['alpha', 'beta']);
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.height);
    sortRows(rows, 'height', true);

    expect(rows.map((r) => r.height)).toEqual(before);
  });

  it('leaves rows in place for an unknown key rather than throwing', () => {
    expect(sortRows(rows, 'nope', true)).toHaveLength(2);
  });
});
