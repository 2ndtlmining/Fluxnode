import { FLUXNODE_INFO_API_URL } from 'app-buildinfo';

/*
 * Fetches the Chain Activity backend rollup (api/src/services/chain_activity.rs) —
 * daily utility/empty block counts and the Flux-team transaction log, for however
 * much of the ~8-day retention window the scanning replica has caught up to.
 * Mirrors the existing `${FLUXNODE_INFO_API_URL}/api/v1/...` fetch pattern already
 * used by getDemoWallet() (apidata.js). The backend's JSON is snake_case (Rust's
 * serde default) — normalized to camelCase here, once, at the boundary.
 *
 * `syncStatus` distinguishes two different layers, both collapsed into one
 * field so the component only ever needs to switch on one thing:
 *   - 'api_unreachable' — WE (the frontend) couldn't get a response at all
 *     (network error, the backend down, a non-JSON body). This never
 *     reaches the backend's own outcome, so it can't be one of the four
 *     below.
 *   - 'never_run' | 'in_progress' | 'caught_up' | 'stalled' | 'unreachable'
 *     — passed straight through from the backend's own last_outcome, once
 *     a response WAS received. 'unreachable' here means the SCANNER
 *     couldn't reach the block explorer on its last attempt — a different
 *     thing from 'api_unreachable' above, which is about reaching our own
 *     API at all. 'in_progress' means a scan is actively running right
 *     now (persisted the instant a cycle starts, before any of its
 *     potentially minutes-long work) — a genuine cold-start backfill, or
 *     one fighting this API's real rate limits, needs this or it looks
 *     identical to 'never_run' for however long that takes. See
 *     ScanOutcome's doc comment in chain_activity.rs.
 *
 * `scanStartHeight`/`scanTargetHeight` are only nonzero while syncStatus is
 * 'in_progress' AND the current attempt has resolved a real tip height yet
 * (there's a brief window right at cycle start where it's in_progress but
 * these are still both 0 — see scanProgressPct's 0-fallback). Combined with
 * `lastScannedHeight`, this is what lets the UI show real "X of Y blocks"
 * progress instead of just "it's running".
 */
export async function fetch_chain_activity() {
  const empty = {
    daily: [],
    teamTxs: [],
    lastScannedHeight: 0,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    scanStartHeight: 0,
    scanTargetHeight: 0,
    syncStatus: 'api_unreachable',
  };
  try {
    const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/chain-activity`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!json?.success) {
      console.log('[ChainActivity] backend reported success:false — treating as unavailable');
      return empty;
    }

    const daily = Array.isArray(json.daily)
      ? json.daily.map((d) => ({ date: d.date, utilityBlocks: d.utility_blocks || 0, emptyBlocks: d.empty_blocks || 0 }))
      : [];
    const teamTxs = Array.isArray(json.team_txs)
      ? json.team_txs.map((t) => ({ txid: t.txid, blockHeight: t.block_height, from: t.from, to: t.to, amount: t.amount }))
      : [];

    const result = {
      daily,
      teamTxs,
      lastScannedHeight: json.last_scanned_height || 0,
      lastAttemptAt: json.last_attempt_at || 0,
      lastSuccessAt: json.last_success_at || 0,
      scanStartHeight: json.scan_start_height || 0,
      scanTargetHeight: json.scan_target_height || 0,
      syncStatus: json.last_outcome || 'never_run',
    };

    // Visibility for anyone watching devtools during local testing — the
    // banner already shows this, but the console line is easy to spot
    // across repeated polls without opening the Network tab each time.
    if (result.syncStatus === 'in_progress' && result.scanTargetHeight > result.scanStartHeight) {
      const progress = scanProgressPct(result);
      console.log(
        `[ChainActivity] sync in progress: block ${result.lastScannedHeight} of ${result.scanTargetHeight}` +
          ` (${progress}%, started at ${result.scanStartHeight})`
      );
    } else {
      console.log(`[ChainActivity] syncStatus=${result.syncStatus}`);
    }

    return result;
  } catch (error) {
    console.log('[ChainActivity] fetch failed:', error?.message || error);
    return empty;
  }
}

// Percent of the CURRENT in-progress scan's own range that's done — not
// percent of the full retention window, since a scan only ever needs to
// cover from the last checkpoint to the tip, which is usually far smaller.
// Returns 0 rather than NaN/Infinity when there's no real range yet (the
// InProgress status written before the range is known — see
// run_scan_cycle's two-step write in chain_activity.rs).
export function scanProgressPct({ lastScannedHeight, scanStartHeight, scanTargetHeight }) {
  const span = scanTargetHeight - scanStartHeight;
  if (span <= 0) return 0;
  const done = Math.max(0, Math.min(span, lastScannedHeight - scanStartHeight));
  return Math.round((done / span) * 100);
}

// "Xm ago"/"Xh ago"/"Xd ago" for the sync-status banner. A local helper
// rather than reusing live/timeFormat.js's relativeTime: that one only
// covers seconds/minutes (block timestamps are always within a couple
// minutes of "now"), while a stalled chain-activity sync can genuinely be
// hours or days stale, and analytics/ has no existing dependency on live/.
export function relativeTimeAgo(unixSeconds) {
  if (!unixSeconds) return null;
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Kept in sync with the backend constants of the same name in
// api/src/services/chain_activity.rs. The backend always returns the full
// retained window in one payload, so the UI never needs a second network call
// to change what it shows -- which is why the old 24H/7D toggle was removed:
// a 1-day chart is a single bar, not a trend.
export const BLOCKS_PER_DAY = 2880; // 30 sec/block
export const RETENTION_DAYS = 8;

// Rolls the retained daily counts up into a single summary across the whole window.
export function summarizeDaily(daily) {
  return (daily || []).reduce(
    (acc, d) => ({
      utilityBlocks: acc.utilityBlocks + (d.utilityBlocks || 0),
      emptyBlocks: acc.emptyBlocks + (d.emptyBlocks || 0),
    }),
    { utilityBlocks: 0, emptyBlocks: 0 }
  );
}

// The headline stat for the Chain Activity tab. Deliberately the LAST entry
// rather than a max or an average: the backend appends days in date order and
// trims from the front (trim_daily_retention sorts by date before draining),
// so the last entry is always the most recent day. Part D's spec originally
// proposed "today's tx count" for this hero, but no transaction count exists
// anywhere in the data model -- daily entries carry only utility/empty block
// counts -- so this is the real number closest to that intent.
export function todaysUtilityBlocks(daily) {
  if (!daily || daily.length === 0) return 0;
  return daily[daily.length - 1].utilityBlocks || 0;
}
