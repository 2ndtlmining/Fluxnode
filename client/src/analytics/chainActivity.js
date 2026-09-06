import { FLUXNODE_INFO_API_URL } from 'app-buildinfo';

/*
 * Fetches the Chain Activity backend rollup (api/src/services/chain_activity.rs) —
 * daily utility/empty block counts and the Flux-team transaction log, for however
 * much of the ~8-day retention window the scanning replica has caught up to.
 * Mirrors the existing `${FLUXNODE_INFO_API_URL}/api/v1/...` fetch pattern already
 * used by getDemoWallet() (apidata.js). The backend's JSON is snake_case (Rust's
 * serde default) — normalized to camelCase here, once, at the boundary.
 */
export async function fetch_chain_activity() {
  const empty = { daily: [], teamTxs: [], lastScannedHeight: 0 };
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

    return { daily, teamTxs, lastScannedHeight: json.last_scanned_height || 0 };
  } catch {
    return empty;
  }
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
