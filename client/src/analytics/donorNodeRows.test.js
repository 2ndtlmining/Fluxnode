import { buildDonorNodeRows } from './donorNodeRows';

const nodes = [
  { id: 'a', ip_display: '1.2.3.4:16127', tier: 'NIMBUS', rank: 10, last_confirmed_height: 2_941_800 },
  { id: 'b', ip_display: '5.6.7.8:16127', tier: 'CUMULUS', rank: 20, last_confirmed_height: 2_941_000 },
];

const benchmarks = [
  { benchmark: { bench: { ipaddress: '1.2.3.4:16127', eps: 512.4 } } },
  { benchmark: { bench: { ipaddress: '5.6.7.8:16127', eps: 128 } } },
];

const CURRENT_HEIGHT = 2_942_000;

describe('buildDonorNodeRows', () => {
  it('keeps every field the node already carried', () => {
    const [first] = buildDonorNodeRows(nodes, benchmarks, CURRENT_HEIGHT);

    expect(first).toMatchObject({ id: 'a', ip_display: '1.2.3.4:16127', tier: 'NIMBUS', rank: 10 });
  });

  it('derives the maintenance window from the node\'s last confirmed height', () => {
    const [first] = buildDonorNodeRows(nodes, benchmarks, CURRENT_HEIGHT);

    // 480 - (2,942,000 - 2,941,800) = 280 blocks left, at 2 blocks/minute =
    // 140 minutes. format_minutes() renders whole hours once past one hour —
    // the same lossy formatting the main node table already shows.
    expect(first.mtnWindow).toBe('2 Hrs');
  });

  it('reports a window that has run out as Closed', () => {
    const [, second] = buildDonorNodeRows(nodes, benchmarks, CURRENT_HEIGHT);

    // 480 - (2,942,000 - 2,941,000) is negative.
    expect(second.mtnWindow).toBe('Closed');
  });

  it('leaves the window unknown rather than wrong when the chain height is missing', () => {
    for (const height of [0, null, undefined]) {
      const [first] = buildDonorNodeRows(nodes, benchmarks, height);
      expect(first.mtnWindow).toBeNull();
    }
  });

  it('joins the benchmark EPS reading onto the node', () => {
    const rows = buildDonorNodeRows(nodes, benchmarks, CURRENT_HEIGHT);

    expect(rows.map((r) => r.eps)).toEqual([512.4, 128]);
  });

  it('matches a benchmark by HOST, since the reading is per-machine not per-port', () => {
    const twoNodesOneHost = [
      { id: 'a', ip_display: '1.2.3.4:16127', tier: 'NIMBUS', rank: 1, last_confirmed_height: 2_941_900 },
      { id: 'b', ip_display: '1.2.3.4:16137', tier: 'NIMBUS', rank: 2, last_confirmed_height: 2_941_900 },
    ];

    const rows = buildDonorNodeRows(twoNodesOneHost, benchmarks, CURRENT_HEIGHT);

    expect(rows.map((r) => r.eps)).toEqual([512.4, 512.4]);
  });

  it('reports EPS as null, never 0, when the node has no benchmark reading', () => {
    const unbenched = [{ id: 'c', ip_display: '9.9.9.9:16127', tier: 'STRATUS', rank: 3, last_confirmed_height: 2_941_900 }];

    const [row] = buildDonorNodeRows(unbenched, benchmarks, CURRENT_HEIGHT);

    expect(row.eps).toBeNull();
  });

  it('returns an empty list for no nodes, and does not throw on missing benchmarks', () => {
    expect(buildDonorNodeRows([], benchmarks, CURRENT_HEIGHT)).toEqual([]);
    expect(buildDonorNodeRows(undefined, undefined, CURRENT_HEIGHT)).toEqual([]);
    expect(() => buildDonorNodeRows(nodes, undefined, CURRENT_HEIGHT)).not.toThrow();
    expect(buildDonorNodeRows(nodes, undefined, CURRENT_HEIGHT).map((r) => r.eps)).toEqual([null, null]);
  });
});
