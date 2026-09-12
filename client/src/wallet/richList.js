/*
 * Where a wallet sits on the Flux rich list, in bands (issue #266).
 *
 * `in_rich_list` used to be a single boolean: you were on the list or you were
 * not, and everyone on it got the same whale. The list is 1,000 entries sorted
 * by balance, and when this was written rank 1 held 160,000,029 FLUX while rank
 * 1,000 held 26,974 -- a ~5,900x spread behind one identical badge. The top 100
 * alone hold 82.6% of the listed balance.
 *
 * Bands are RANK-based and must stay that way. The balances at each boundary
 * move every day, so encoding "320,000 FLUX = top 100" would be wrong within a
 * week; the rank is the stable fact.
 */

export const RICH_LIST_BANDS = {
  top100: { label: 'Top 100', max: 100, blurb: 'Top 100 wallet on the Flux rich list' },
  top500: { label: 'Top 500', max: 500, blurb: 'Top 500 wallet on the Flux rich list' },
  top1000: { label: 'Rich list', max: Infinity, blurb: 'Listed on the Flux rich list' }
};

// Most significant first, so the first match wins.
const ORDER = ['top100', 'top500', 'top1000'];

/*
 * 1-based position, or null when the wallet is not listed.
 *
 * This is the whole fix for the original defect: globalStats used `.some()` and
 * threw the position away, even though the endpoint returns the list in order.
 */
export function richListRank(entries, walletAddress) {
  if (!Array.isArray(entries) || !walletAddress) return null;
  const index = entries.findIndex((entry) => entry?.address === walletAddress);
  return index === -1 ? null : index + 1;
}

export function richListBand(rank) {
  if (typeof rank !== 'number' || rank < 1) return null;
  // Beyond the last explicit boundary everything falls into the entry band --
  // the list is 1,000 long today, but that is the explorer's choice and could
  // change without notice.
  return ORDER.find((band) => rank <= RICH_LIST_BANDS[band].max) || 'top1000';
}
