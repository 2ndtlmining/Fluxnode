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
 * than the window. An address with years of history should not cost a full
 * scan to answer "what happened this week"; MAX_PAGES is a hard backstop for
 * an address whose pages are not ordered as expected.
 */

const MAX_PAGES = 10;

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

  for (let page = 1; page < Math.min(pagesTotal, MAX_PAGES); page += 1) {
    // Every transaction on the previous page predates the window, so no later
    // page can contain anything newer.
    const pageAllOld = txs.length > 0 && txs.every((t) => (t.time || 0) < cutoff);
    if (pageAllOld) break;

    const json = await explorerFetchJson(`${basePath}&pageNum=${page}`);
    if (!json) break; // partial history is still worth showing
    if (Array.isArray(json.txs)) txs.push(...json.txs);
  }

  return { ok: true, summary: buildWalletTxSummary(txs, walletAddress, nowSec, windowDays) };
}
