import { explorerFetchJson } from 'explorer';
import { buildWalletTxSummary, WINDOW_DAYS } from 'analytics/walletTxHistory';

/*
 * A wallet's recent transactions, for the Donor tab's activity panel.
 *
 * Goes through the explorer POOL (src/explorer.js) rather than a hardcoded
 * host, so a rate limit on one explorer fails over instead of blanking the
 * panel -- the same failure that was presenting as a CORS error before #218.
 *
 * Pages are walked newest-first and stop as soon as a page is entirely older
 * than the window.
 *
 * TWO BUGS LIVED HERE UNTIL #358, because this file had no tests.
 *
 * 1. The early break tested the whole ACCUMULATED array, which keeps page 0's
 *    recent transactions forever -- so it could only be true for a wallet with
 *    NO activity in the window, precisely backwards. Every active wallet paid
 *    the full page budget however little it needed. It now tests the page just
 *    fetched, which is what the comment always claimed.
 *
 * 2. The budget silently truncated the window. Measured against a real
 *    120-node donor wallet: its 7-day window holds 803 transactions across 82
 *    pages, so a 10-page cap summarised 12% of it and the panel reported the
 *    result as "net over 7 days" -- understated, with nothing saying so, for
 *    exactly the operators with the most at stake.
 *
 * WHY THE BUDGET STAYS. Fetching all 82 pages for one panel is not affordable
 * against an explorer that rate-limits this hard (#314, #341). So the scan is
 * capped and, when it runs out, the summary reports THE SPAN IT ACTUALLY
 * COVERED rather than the span it was asked for. A smaller window honestly
 * labelled beats a 7-day figure that is quietly an eighth of the truth.
 */

/*
 * 25 pages, 250 transactions. Sampled donor wallets needed 8-9 pages to cover
 * a full week; this clears the ordinary case outright and bounds the rest.
 * With the break above fixed, a quiet wallet costs one or two requests rather
 * than the whole budget, so raising this does not raise the typical cost.
 */
export const MAX_PAGES = 25;

export async function fetch_wallet_tx_history(walletAddress, windowDays = WINDOW_DAYS) {
  const empty = { ok: false, summary: null };
  if (!walletAddress) return empty;

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - windowDays * 86400;
  const basePath = `/txs?address=${walletAddress}`;

  const first = await explorerFetchJson(basePath);
  if (!first) return empty;

  const txs = Array.isArray(first.txs) ? [...first.txs] : [];
  const pagesTotal = first.pagesTotal || 1;

  /** Every transaction on this page predates the window, so no later page can help. */
  const pageAllOld = (page) => page.length > 0 && page.every((t) => (t.time || 0) < cutoff);

  let reachedWindowEdge = pageAllOld(txs) || pagesTotal <= 1;
  let page = 1;

  while (!reachedWindowEdge && page < Math.min(pagesTotal, MAX_PAGES)) {
    const json = await explorerFetchJson(`${basePath}&pageNum=${page}`);
    if (!json || !Array.isArray(json.txs)) {
      // A page we could not read is a GAP, not the end of the window. Partial
      // history is still worth showing, but it must not claim to be complete.
      break;
    }
    txs.push(...json.txs);
    page += 1;
    if (pageAllOld(json.txs)) reachedWindowEdge = true;
  }

  const summary = buildWalletTxSummary(txs, walletAddress, nowSec, windowDays);

  /*
   * The oldest transaction actually scanned, when the scan stopped short. The
   * totals describe this span, so the panel states it instead of "7 days".
   */
  const oldestScanned = txs.reduce(
    (oldest, t) => (t?.time && t.time < oldest ? t.time : oldest),
    nowSec
  );

  return {
    ok: true,
    summary: {
      ...summary,
      truncated: !reachedWindowEdge,
      coveredFrom: reachedWindowEdge ? cutoff : Math.max(cutoff, oldestScanned),
    },
  };
}
