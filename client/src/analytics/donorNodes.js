import dayjs from 'dayjs';
import { getWalletNodes, transformRawNode, DISPLAY_DATE_FORMAT } from 'apidata';

/*
 * Pure: soonest-payout-first ordering over a wallet's own transformed node
 * list. main/WalletNodes/index.jsx:129-155 does the same "lowest rank wins"
 * selection today, just picking one node (highestRankedNode) instead of
 * sorting the whole list — this is the same comparison, generalised.
 */
export function sortByRank(nodes) {
  return [...(nodes || [])].sort((a, b) => a.rank - b.rank);
}

/*
 * Pure: the node among the wallet's own that was paid most recently.
 * transformRawNode() only keeps last_reward as a formatted display string
 * (apidata.js:754, DISPLAY_DATE_FORMAT), not the raw lastpaid unix
 * timestamp — parsed back with that same format for comparison rather than
 * re-fetching the raw value separately. '-' (empty_flux_node's default,
 * apidata.js:647) means "never paid" and is excluded rather than sorted as
 * an ancient date.
 */
export function mostRecentPayout(nodes) {
  const paid = (nodes || []).filter((n) => n?.last_reward && n.last_reward !== '-');
  if (paid.length === 0) return null;

  return paid.reduce((latest, n) =>
    dayjs(n.last_reward, DISPLAY_DATE_FORMAT).isAfter(dayjs(latest.last_reward, DISPLAY_DATE_FORMAT)) ? n : latest
  );
}

export async function fetch_donor_nodes(walletAddress) {
  if (!walletAddress) return [];
  const raw = await getWalletNodes(walletAddress);
  return sortByRank((raw || []).map(transformRawNode));
}
