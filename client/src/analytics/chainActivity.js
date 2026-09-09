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
 *   - 'never_run' | 'caught_up' | 'stalled' | 'unreachable' — passed
 *     straight through from the backend's own last_outcome, once a
 *     response WAS received. 'unreachable' here means the SCANNER
 *     couldn't reach the block explorer on its last attempt — a different
 *     thing from 'api_unreachable' above, which is about reaching our own
 *     API at all. See ScanOutcome's doc comment in chain_activity.rs.
 */
export async function fetch_chain_activity() {
  const empty = {
    daily: [],
    teamTxs: [],
    lastScannedHeight: 0,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    syncStatus: 'api_unreachable',
  };
  try {
    const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/chain-activity`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!json?.success) return empty;

    const daily = Array.isArray(json.daily)
      ? json.daily.map((d) => ({ date: d.date, utilityBlocks: d.utility_blocks || 0, emptyBlocks: d.empty_blocks || 0 }))
      : [];
    const teamTxs = Array.isArray(json.team_txs)
      ? json.team_txs.map((t) => ({ txid: t.txid, blockHeight: t.block_height, from: t.from, to: t.to, amount: t.amount }))
      : [];

    return {
      daily,
      teamTxs,
      lastScannedHeight: json.last_scanned_height || 0,
      lastAttemptAt: json.last_attempt_at || 0,
      lastSuccessAt: json.last_success_at || 0,
      syncStatus: json.last_outcome || 'never_run',
    };
  } catch {
    return empty;
  }
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

// Client-side range filter — the backend always returns the full retained
// window in one payload, so toggling 24h/7d never needs a second network call.
export function filterDailyRange(daily, days) {
  return (daily || []).slice(-days);
}

// Rolls a set of daily counts up into a single summary for the range currently shown.
export function summarizeDaily(daily) {
  return (daily || []).reduce(
    (acc, d) => ({
      utilityBlocks: acc.utilityBlocks + (d.utilityBlocks || 0),
      emptyBlocks: acc.emptyBlocks + (d.emptyBlocks || 0),
    }),
    { utilityBlocks: 0, emptyBlocks: 0 }
  );
}
