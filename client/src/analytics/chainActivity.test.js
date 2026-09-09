import { fetch_chain_activity, filterDailyRange, summarizeDaily, relativeTimeAgo } from './chainActivity';

function mockJsonResponse(body) {
  return { ok: true, json: async () => body };
}

const EMPTY_RESULT = {
  daily: [],
  teamTxs: [],
  lastScannedHeight: 0,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  syncStatus: 'api_unreachable',
};

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
      last_attempt_at: 1788900000,
      last_success_at: 1788899000,
      last_outcome: 'caught_up',
    }));

    const result = await fetch_chain_activity();

    expect(result.daily).toEqual([{ date: '2026-09-06', utilityBlocks: 5, emptyBlocks: 2 }]);
    expect(result.teamTxs).toEqual([{ txid: 'abc', blockHeight: 100, from: 't1a', to: 't1b', amount: 3.5 }]);
    expect(result.lastScannedHeight).toBe(12345);
    expect(result.lastAttemptAt).toBe(1788900000);
    expect(result.lastSuccessAt).toBe(1788899000);
    expect(result.syncStatus).toBe('caught_up');
  });

  it('passes through a stalled outcome so the UI can show a non-misleading message', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [],
      team_txs: [],
      last_scanned_height: 500,
      last_attempt_at: 1788900000,
      last_success_at: 1788800000,
      last_outcome: 'stalled',
    }));

    const result = await fetch_chain_activity();
    expect(result.syncStatus).toBe('stalled');
    expect(result.lastSuccessAt).toBe(1788800000); // preserved even though the latest attempt stalled
  });

  it('defaults syncStatus to never_run when the backend omits last_outcome (older API version)', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [],
      team_txs: [],
      last_scanned_height: 0,
    }));

    const result = await fetch_chain_activity();
    expect(result.syncStatus).toBe('never_run');
  });

  it('returns empty defaults when success is false', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({ success: false }));
    const result = await fetch_chain_activity();
    expect(result).toEqual(EMPTY_RESULT);
  });

  it('fails soft on a network error, distinguishably from a genuinely-empty backend response', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await fetch_chain_activity();
    expect(result).toEqual(EMPTY_RESULT);
    expect(result.syncStatus).toBe('api_unreachable');
  });
});

describe('relativeTimeAgo', () => {
  const NOW = 1788900000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for a falsy/never-happened timestamp', () => {
    expect(relativeTimeAgo(0)).toBeNull();
    expect(relativeTimeAgo(null)).toBeNull();
  });

  it('returns "just now" for anything under a minute old', () => {
    expect(relativeTimeAgo(NOW - 10)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(relativeTimeAgo(NOW - 5 * 60)).toBe('5m ago');
  });

  it('formats hours', () => {
    expect(relativeTimeAgo(NOW - 3 * 3600)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(relativeTimeAgo(NOW - 2 * 86400)).toBe('2d ago');
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
