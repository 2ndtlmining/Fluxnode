import { fetch_chain_activity, filterDailyRange, summarizeDaily } from './chainActivity';

function mockJsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('fetch_chain_activity', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes the backend snake_case payload to camelCase', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [{ date: '2026-09-06', utility_blocks: 5, empty_blocks: 2 }],
      team_txs: [{ txid: 'abc', block_height: 100, from: 't1a', to: 't1b', amount: 3.5 }],
      last_scanned_height: 12345,
    }));

    const result = await fetch_chain_activity();

    expect(result.daily).toEqual([{ date: '2026-09-06', utilityBlocks: 5, emptyBlocks: 2 }]);
    expect(result.teamTxs).toEqual([{ txid: 'abc', blockHeight: 100, from: 't1a', to: 't1b', amount: 3.5 }]);
    expect(result.lastScannedHeight).toBe(12345);
  });

  it('returns empty defaults when success is false', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({ success: false }));
    const result = await fetch_chain_activity();
    expect(result).toEqual({ daily: [], teamTxs: [], lastScannedHeight: 0 });
  });

  it('fails soft on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await fetch_chain_activity();
    expect(result).toEqual({ daily: [], teamTxs: [], lastScannedHeight: 0 });
  });
});

describe('filterDailyRange', () => {
  const daily = [
    { date: '2026-08-30', utilityBlocks: 1, emptyBlocks: 1 },
    { date: '2026-08-31', utilityBlocks: 2, emptyBlocks: 2 },
    { date: '2026-09-01', utilityBlocks: 3, emptyBlocks: 3 },
  ];

  it('returns the trailing N entries', () => {
    expect(filterDailyRange(daily, 2)).toEqual(daily.slice(1));
  });

  it('returns everything available when the range exceeds what exists', () => {
    expect(filterDailyRange(daily, 100)).toEqual(daily);
  });

  it('handles an empty/missing array', () => {
    expect(filterDailyRange(null, 7)).toEqual([]);
  });
});

describe('summarizeDaily', () => {
  it('sums utility and empty blocks across all entries', () => {
    const daily = [
      { date: 'a', utilityBlocks: 3, emptyBlocks: 1 },
      { date: 'b', utilityBlocks: 2, emptyBlocks: 4 },
    ];
    expect(summarizeDaily(daily)).toEqual({ utilityBlocks: 5, emptyBlocks: 5 });
  });

  it('handles an empty/missing array', () => {
    expect(summarizeDaily(null)).toEqual({ utilityBlocks: 0, emptyBlocks: 0 });
  });
});
