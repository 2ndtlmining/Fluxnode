import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, BLOCKS_PER_DAY, RETENTION_DAYS } from './chainActivity';

function mockJsonResponse(body) {
  return { ok: true, json: async () => body };
}

const EMPTY_RESULT = {
  daily: [],
  teamTxs: [],
  lastScannedHeight: 0,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  scanStartHeight: 0,
  scanTargetHeight: 0,
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

  it('passes through in_progress, distinguishable from never_run', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [],
      team_txs: [],
      last_scanned_height: 200,
      last_attempt_at: 1788900000,
      last_success_at: 0,
      last_outcome: 'in_progress',
    }));

    const result = await fetch_chain_activity();
    expect(result.syncStatus).toBe('in_progress');
    expect(result.lastAttemptAt).toBe(1788900000);
  });

  it('passes through the scan range while a scan is in progress', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [],
      team_txs: [],
      last_scanned_height: 1200,
      last_attempt_at: 1788900000,
      last_success_at: 0,
      last_outcome: 'in_progress',
      scan_start_height: 1000,
      scan_target_height: 2000,
    }));

    const result = await fetch_chain_activity();
    expect(result.scanStartHeight).toBe(1000);
    expect(result.scanTargetHeight).toBe(2000);
  });

  it('defaults the scan range to 0/0 when the backend omits it (not currently in progress)', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      daily: [],
      team_txs: [],
      last_scanned_height: 500,
      last_outcome: 'caught_up',
    }));

    const result = await fetch_chain_activity();
    expect(result.scanStartHeight).toBe(0);
    expect(result.scanTargetHeight).toBe(0);
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

describe('scanProgressPct', () => {
  it('computes percent of the current scan\'s own range covered so far', () => {
    expect(scanProgressPct({ lastScannedHeight: 1200, scanStartHeight: 1000, scanTargetHeight: 2000 })).toBe(20);
  });

  it('returns 0 when there is no real range yet (target not resolved)', () => {
    expect(scanProgressPct({ lastScannedHeight: 0, scanStartHeight: 0, scanTargetHeight: 0 })).toBe(0);
  });

  it('clamps at 100 rather than going over if lastScannedHeight is somehow past the target', () => {
    expect(scanProgressPct({ lastScannedHeight: 2500, scanStartHeight: 1000, scanTargetHeight: 2000 })).toBe(100);
  });

  it('clamps at 0 rather than going negative if lastScannedHeight is somehow before the start', () => {
    expect(scanProgressPct({ lastScannedHeight: 500, scanStartHeight: 1000, scanTargetHeight: 2000 })).toBe(0);
  });
});

describe('retention constants', () => {
  it('BLOCKS_PER_DAY matches the backend 30s block target', () => {
    // chain_activity.rs: BLOCKS_PER_DAY = 2880. 86400 / 2880 == 30s.
    expect(BLOCKS_PER_DAY).toBe(2880);
    expect(86400 / BLOCKS_PER_DAY).toBe(30);
  });

  it('RETENTION_DAYS matches the backend retention window', () => {
    // chain_activity.rs: RETENTION_DAYS = 8, RETENTION_BLOCKS = 23040.
    expect(RETENTION_DAYS).toBe(8);
    expect(BLOCKS_PER_DAY * RETENTION_DAYS).toBe(23040);
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
