import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, BLOCKS_PER_DAY, RETENTION_DAYS, todaysUtilityBlocks, fetch_chain_activity_blocks, blockCategoryLabel,
  blocksRemainingInScan, shouldPollSync, blockTransfersState } from './chainActivity';

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

describe('todaysUtilityBlocks', () => {
  it('returns the most recent day\'s utility count', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 100, emptyBlocks: 200 },
      { date: '2026-09-10', utilityBlocks: 490, emptyBlocks: 2390 },
    ];
    expect(todaysUtilityBlocks(daily)).toBe(490);
  });

  it('reads the LAST entry, not the largest', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 999, emptyBlocks: 0 },
      { date: '2026-09-10', utilityBlocks: 12, emptyBlocks: 0 },
    ];
    expect(todaysUtilityBlocks(daily)).toBe(12);
  });

  it('returns 0 for an empty or missing array', () => {
    expect(todaysUtilityBlocks([])).toBe(0);
    expect(todaysUtilityBlocks(null)).toBe(0);
    expect(todaysUtilityBlocks(undefined)).toBe(0);
  });

  it('returns 0 when the last entry has no utility count', () => {
    expect(todaysUtilityBlocks([{ date: '2026-09-10', emptyBlocks: 5 }])).toBe(0);
  });
});

describe('fetch_chain_activity_blocks', () => {
  afterEach(() => { jest.resetAllMocks(); });

  function ok(body) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }

  it('normalises snake_case to camelCase at the boundary', async () => {
    global.fetch = jest.fn(() => ok({
      success: true,
      totals: { p2p_only: 462, dapp_only: 28, both: 4, utility_total: 494 },
      blocks: [{ height: 2939035, date: '2026-09-11', is_p2p: true, is_dapp: false, transfer_count: 2 }],
    }));

    const result = await fetch_chain_activity_blocks(50);
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual({ p2pOnly: 462, dappOnly: 28, both: 4, utilityTotal: 494 });
    expect(result.blocks[0]).toEqual({
      height: 2939035, date: '2026-09-11', isP2p: true, isDapp: false, transferCount: 2,
      // #282. Empty here because this fixture's payload predates the field --
      // which is also the shape a real pre-#282 record deserializes to.
      transfers: [],
    });
  });

  it("maps a block's stored transfers through (#282)", async () => {
    global.fetch = jest.fn(() => ok({
      success: true,
      totals: { p2p_only: 1, dapp_only: 0, both: 0, utility_total: 1 },
      blocks: [{
        height: 42, date: '2026-09-12', is_p2p: true, is_dapp: false, transfer_count: 2,
        transfers: [
          { txid: 'abc', from: 't1alice', to: 't1bob', amount: 1.5 },
          // `from` is genuinely absent on some inputs; it must map to null
          // rather than undefined so the UI can test it.
          { txid: 'def', to: 't1carol', amount: 0.25 },
        ],
      }],
    }));

    const result = await fetch_chain_activity_blocks(50);
    expect(result.blocks[0].transfers).toEqual([
      { txid: 'abc', from: 't1alice', to: 't1bob', amount: 1.5 },
      { txid: 'def', from: null, to: 't1carol', amount: 0.25 },
    ]);
  });

  it('the disjoint totals sum to the utility total', async () => {
    // Overlapping "any P2P"/"any Dapp" counts would not add up, and three
    // numbers that visibly fail to sum read as a bug on screen.
    global.fetch = jest.fn(() => ok({
      success: true,
      totals: { p2p_only: 10, dapp_only: 3, both: 2, utility_total: 15 },
      blocks: [],
    }));
    const { totals } = await fetch_chain_activity_blocks();
    expect(totals.p2pOnly + totals.dappOnly + totals.both).toBe(totals.utilityTotal);
  });

  it('passes the requested limit through', async () => {
    global.fetch = jest.fn(() => ok({ success: true, totals: {}, blocks: [] }));
    await fetch_chain_activity_blocks(25);
    expect(global.fetch.mock.calls[0][0]).toContain('limit=25');
  });

  it('fails soft on success:false rather than throwing', async () => {
    global.fetch = jest.fn(() => ok({ success: false }));
    const result = await fetch_chain_activity_blocks();
    expect(result.ok).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(result.totals.utilityTotal).toBe(0);
  });

  it('fails soft on a network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const result = await fetch_chain_activity_blocks();
    expect(result.ok).toBe(false);
    expect(result.blocks).toEqual([]);
  });

  it('tolerates a malformed blocks field', async () => {
    global.fetch = jest.fn(() => ok({ success: true, totals: {}, blocks: 'nope' }));
    const result = await fetch_chain_activity_blocks();
    expect(result.blocks).toEqual([]);
  });
});

describe('blockCategoryLabel', () => {
  it('names each category, including both', () => {
    expect(blockCategoryLabel({ isP2p: true, isDapp: false })).toBe('P2P');
    expect(blockCategoryLabel({ isP2p: false, isDapp: true })).toBe('Dapp');
    expect(blockCategoryLabel({ isP2p: true, isDapp: true })).toBe('P2P + Dapp');
  });

  it('renders a dash for a block that is neither, and for junk', () => {
    expect(blockCategoryLabel({ isP2p: false, isDapp: false })).toBe('\u2014');
    expect(blockCategoryLabel(null)).toBe('\u2014');
    expect(blockCategoryLabel(undefined)).toBe('\u2014');
  });
});

/*
 * Issue #253 -- the sync banner told a cold-start user the backfill was 2.9
 * MILLION blocks when the scanner's own log said 23,040.
 *
 * `blocksRemaining` was `scanTargetHeight - lastScannedHeight`, and on a cold
 * start lastScannedHeight is 0 (nothing scanned yet), so it reported the chain
 * TIP rather than the span being scanned. The difference matters: 23,040 blocks
 * is "a few minutes", 2.9 million reads as "this will never finish".
 */
describe('blocksRemainingInScan', () => {
  it('is the span still to scan, not the chain tip, on a cold start', () => {
    // Exactly the live cold start: nothing scanned, retention window 23,040.
    expect(
      blocksRemainingInScan({ lastScannedHeight: 0, scanStartHeight: 2919732, scanTargetHeight: 2942772 })
    ).toBe(23040);
  });

  it('counts down as the scan progresses', () => {
    expect(
      blocksRemainingInScan({ lastScannedHeight: 2930000, scanStartHeight: 2919732, scanTargetHeight: 2942772 })
    ).toBe(12772);
  });

  it('is zero once caught up', () => {
    expect(
      blocksRemainingInScan({ lastScannedHeight: 2942772, scanStartHeight: 2919732, scanTargetHeight: 2942772 })
    ).toBe(0);
  });

  it('never goes negative if the checkpoint is ahead of the target', () => {
    expect(
      blocksRemainingInScan({ lastScannedHeight: 2999999, scanStartHeight: 2919732, scanTargetHeight: 2942772 })
    ).toBe(0);
  });

  it('is zero when there is no range yet', () => {
    // run_scan_cycle writes InProgress BEFORE it knows the range.
    expect(blocksRemainingInScan({ lastScannedHeight: 0, scanStartHeight: 0, scanTargetHeight: 0 })).toBe(0);
  });
});

/*
 * Issue #280: the banner was a one-shot snapshot, so it kept saying "Sync is
 * running" long after the backend had moved to "stalled". Re-polling needs a
 * rule for when to stop, and that rule is the part worth testing -- the effect
 * around it is wiring.
 */
describe('shouldPollSync', () => {
  test('keeps polling while a scan is running', () => {
    expect(shouldPollSync('in_progress')).toBe(true);
  });

  test('keeps polling when the scan has stalled, so recovery is noticed', () => {
    expect(shouldPollSync('stalled')).toBe(true);
  });

  test.each(['never_run', 'unreachable', 'api_unreachable', null, undefined])(
    'keeps polling for the unsettled status %p',
    (status) => {
      expect(shouldPollSync(status)).toBe(true);
    }
  );

  test('stops once the scanner has caught up, because nothing further changes', () => {
    expect(shouldPollSync('caught_up')).toBe(false);
  });
});

/*
 * Issue #282: a utility block's transactions are now persisted, so the
 * drill-down can open one. Three states have to be told apart, and the awkward
 * one is the third.
 */
describe('blockTransfersState', () => {
  test('a block whose transfers are all stored is complete', () => {
    const state = blockTransfersState({ transferCount: 2, transfers: [{}, {}] });
    expect(state).toEqual({ kind: 'complete', shown: 2, total: 2 });
  });

  test('a block past the storage cap reports how many of how many', () => {
    const state = blockTransfersState({ transferCount: 40, transfers: new Array(25).fill({}) });
    expect(state).toEqual({ kind: 'capped', shown: 25, total: 40 });
  });

  /*
   * The one that matters. Records written before #282 carry a transferCount
   * but no transfers -- the list was never stored for them. Reporting that as
   * "no transactions" would be a flat lie about a block that had 4.
   */
  test('a pre-#282 record is unavailable, not empty', () => {
    const state = blockTransfersState({ transferCount: 4, transfers: [] });
    expect(state).toEqual({ kind: 'unavailable', shown: 0, total: 4 });
  });

  test('a block that genuinely had no transfers is empty', () => {
    expect(blockTransfersState({ transferCount: 0, transfers: [] })).toEqual({
      kind: 'empty',
      shown: 0,
      total: 0,
    });
  });

  test('tolerates a block with no transfers field at all', () => {
    expect(blockTransfersState({ transferCount: 0 }).kind).toBe('empty');
    expect(blockTransfersState({}).kind).toBe('empty');
    expect(blockTransfersState(null).kind).toBe('empty');
  });
});
