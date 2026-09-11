import { lookupAddress } from 'data/fluxAddressBook';

/*
 * A wallet's recent on-chain history, grouped the way an address actually
 * experiences it: what came IN, what went OUT.
 *
 * Why direction-first rather than a flat list of types: "payments sent" and
 * "P2P" overlap -- a payment you send IS a P2P transfer -- so a flat list
 * double-counts or forces an arbitrary rule about which bucket wins. Splitting
 * on direction first means every transaction lands in exactly one bucket, and
 * the summary reads as in/out/net, which is the question someone actually has.
 *
 * Amounts are computed from the wallet's own perspective:
 *
 *   received  the sum of outputs paid TO the wallet
 *   sent      the sum of outputs paid to ANYONE ELSE in a transaction the
 *             wallet funded -- change returning to itself is excluded, or every
 *             send would look larger than it was
 *
 * Counterparty labelling uses the checked-in address book (exchanges, Flux
 * Foundation). An unknown counterparty is reported as unknown rather than
 * guessed at: a wrong label is worse than no label.
 *
 * On app deployments -- deliberately NOT a separate category. Flux app payments
 * go to a Foundation address (per the v9 whitepaper: consensus splits the
 * payment, with the remainder going to "the Foundation address that already
 * receives application payments today"), so they are indistinguishable on chain
 * from any other payment to the Foundation without a per-spec payment memo,
 * which the current app-spec version does not carry. They therefore show as
 * "Flux Foundation" rather than being asserted as deployments.
 */

export const WINDOW_DAYS = 7;
const SECONDS_PER_DAY = 86400;

/** Sum of every output in `tx` paid to `address`. An output can repeat. */
function paidTo(tx, address) {
  let total = 0;
  for (const vout of tx?.vout || []) {
    const addresses = vout?.scriptPubKey?.addresses || [];
    if (!addresses.includes(address)) continue;
    const value = Number(vout.value);
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

/** Sum of every output paid to someone OTHER than `address` (i.e. not change). */
function paidToOthers(tx, address) {
  let total = 0;
  let counterparty = null;
  for (const vout of tx?.vout || []) {
    const addresses = vout?.scriptPubKey?.addresses || [];
    if (addresses.length === 0 || addresses.includes(address)) continue;
    const value = Number(vout.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    total += value;
    // First non-self output with a real value is the counterparty shown. A
    // transaction paying several parties is rare here and the full amount is
    // still summed, so the total stays correct even when the label is partial.
    if (counterparty === null) counterparty = addresses[0];
  }
  return { total, counterparty };
}

/**
 * Classify one transaction from `walletAddress`'s point of view.
 * Returns null for a transaction that does not touch the wallet at all.
 */
export function categorizeWalletTx(tx, walletAddress) {
  if (!tx || !walletAddress) return null;

  const fundedByWallet = (tx.vin || []).some((v) => v?.addr === walletAddress);
  const received = paidTo(tx, walletAddress);

  // A coinbase output to the wallet is a node reward. Checked before the
  // generic incoming case so rewards do not land in "transfers in", which
  // would make the headline "rewards received" figure meaningless.
  if (tx.isCoinBase) {
    if (received <= 0) return null;
    return {
      txid: tx.txid,
      height: tx.blockheight,
      time: tx.time,
      direction: 'in',
      type: 'reward',
      amount: received,
      counterparty: null,
      counterpartyLabel: 'Node reward',
      counterpartyKind: 'reward',
    };
  }

  if (fundedByWallet) {
    const { total, counterparty } = paidToOthers(tx, walletAddress);
    // A self-send (consolidation) pays nobody else. Reporting it as an
    // outgoing payment of 0 would add a meaningless row.
    if (total <= 0) return null;
    const known = lookupAddress(counterparty);
    return {
      txid: tx.txid,
      height: tx.blockheight,
      time: tx.time,
      direction: 'out',
      type: known?.kind === 'exchange' ? 'exchange' : known?.kind === 'foundation' ? 'foundation' : 'transfer',
      amount: total,
      counterparty,
      counterpartyLabel: known?.name || null,
      counterpartyKind: known?.kind || null,
    };
  }

  if (received > 0) {
    const counterparty = (tx.vin || []).find((v) => v?.addr)?.addr || null;
    const known = lookupAddress(counterparty);
    return {
      txid: tx.txid,
      height: tx.blockheight,
      time: tx.time,
      direction: 'in',
      type: known?.kind === 'exchange' ? 'exchange' : known?.kind === 'foundation' ? 'foundation' : 'transfer',
      amount: received,
      counterparty,
      counterpartyLabel: known?.name || null,
      counterpartyKind: known?.kind || null,
    };
  }

  return null;
}

/**
 * Roll a wallet's transactions up into the in/out summary and a row list.
 *
 * @param {Array} txs explorer transactions (newest first is not required)
 * @param {string} walletAddress
 * @param {number} [nowSec] unix seconds; defaults to now. Injectable so tests
 *        are not time-dependent.
 * @param {number} [windowDays]
 */
export function buildWalletTxSummary(txs, walletAddress, nowSec, windowDays = WINDOW_DAYS) {
  const now = nowSec || Math.floor(Date.now() / 1000);
  const cutoff = now - windowDays * SECONDS_PER_DAY;

  const rows = [];
  for (const tx of Array.isArray(txs) ? txs : []) {
    // A transaction with no timestamp cannot be placed in the window. Dropping
    // it is safer than assuming "now" and inflating the totals.
    if (!tx?.time || tx.time < cutoff) continue;
    const row = categorizeWalletTx(tx, walletAddress);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => (b.time || 0) - (a.time || 0));

  const bucket = () => ({ rewards: 0, exchange: 0, foundation: 0, transfers: 0, total: 0, count: 0 });
  const received = bucket();
  const sent = bucket();

  for (const row of rows) {
    const side = row.direction === 'in' ? received : sent;
    if (row.type === 'reward') side.rewards += row.amount;
    else if (row.type === 'exchange') side.exchange += row.amount;
    else if (row.type === 'foundation') side.foundation += row.amount;
    else side.transfers += row.amount;
    side.total += row.amount;
    side.count += 1;
  }

  return {
    windowDays,
    cutoff,
    rows,
    received,
    sent,
    net: received.total - sent.total,
  };
}

/** "Kucoin", "Flux Foundation", "Node reward", or a shortened raw address. */
export function counterpartyDisplay(row) {
  if (!row) return '—';
  if (row.counterpartyLabel) return row.counterpartyLabel;
  if (!row.counterparty) return 'Unknown';
  return `${row.counterparty.slice(0, 8)}…${row.counterparty.slice(-4)}`;
}
