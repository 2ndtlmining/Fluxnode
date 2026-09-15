import { DONOR_WINDOW_DAYS, EXCLUDED_FROM_DONATION_TOTALS, FLUX_CLOUD_ADDRESSES } from './config';
import { senderOf } from './donationTotals';
import { decodeTxNote } from './txNote';

/*
 * What the donation address SPENDS, categorised (issue #366).
 *
 * The counterpart to donationTotals.js, and deliberately a separate module:
 * that one answers "what has the community given", this one answers "what has
 * the project done with it". They read the SAME bytes -- the scan
 * scanBothDonationAddresses already performs -- so this costs no explorer
 * traffic, which given #314 and #341 is the constraint that matters most here.
 *
 * SCOPE: the CURRENT donation address only, never OLD_ADDRESS_FLUX. The old
 * address is a node collateral address carrying 18 pages of history whose
 * outgoing transactions are unrelated movement -- node payouts and exchange
 * deposits. Categorising those as project expenses would be false, and
 * labelling them "Other" would bury the two real expenses under noise. The old
 * address's transactions still arrive in the scan; they are filtered out here.
 */

const WINDOW_SEC = DONOR_WINDOW_DAYS * 24 * 60 * 60;

export const COST_CATEGORY_LABELS = {
  cloud: 'Flux Cloud',
  refund: 'Refund',
  other: 'Other'
};

/** The address costs are measured from. Read at call time -- see donationAddresses. */
function currentDonationAddress() {
  return (typeof window !== 'undefined' && window.gContent?.ADDRESS_FLUX) || null;
}

/*
 * Everyone who has donated to the source address.
 *
 * Used for the "Donation Refund" label: paying back someone who gave is a
 * refund, paying anyone else is not.
 *
 * DONORS OF THE SOURCE ADDRESS ONLY. Donations to OLD_ADDRESS_FLUX arrive in
 * the same scan and are deliberately not counted, per the decision recorded on
 * #366. The consequence is real and accepted: someone who donated before the
 * 2026-09-12 move and is refunded after it reads as "Other". The alternative
 * pulled a second address's donor list into a tab that is otherwise strictly
 * about one address.
 *
 * Project-owned wallets are excluded for a different reason -- they are not
 * donors at all (see EXCLUDED_FROM_DONATION_TOTALS), so money going back to
 * one is a transfer, not a refund.
 */
function donorsOf(txs, sourceAddress) {
  const projectWallets = new Set(EXCLUDED_FROM_DONATION_TOTALS);
  const donors = new Set();

  for (const tx of txs) {
    const paysSource = (tx?.vout || []).some((out) =>
      (out?.scriptPubKey?.addresses || []).includes(sourceAddress)
    );
    if (!paysSource) continue;

    const from = senderOf(tx, [sourceAddress]);
    if (from && !projectWallets.has(from)) donors.add(from);
  }

  return donors;
}

function categorise(to, donors) {
  if (FLUX_CLOUD_ADDRESSES.includes(to)) return 'cloud';
  if (donors.has(to)) return 'refund';
  return 'other';
}

/**
 * One row per payment out of the donation address, latest block first.
 *
 * A row is one OUTPUT, not one transaction: a single transaction can pay a
 * hosting bill and refund someone in the same breath, and those are two
 * different categories that cannot share a row.
 *
 * @param {Array<object>} txs  the flattened scan, both addresses
 * @param {{ nowMs?: number, sourceAddress?: string }} [options]
 * @returns {Array<{key: string, txid: string, to: string, amount: number,
 *   category: 'cloud'|'refund'|'other', note: string|null,
 *   blockHeight: number, timeSec: number}>}
 */
export function buildCostRows(txs, { nowMs = Date.now(), sourceAddress } = {}) {
  if (!Array.isArray(txs)) return [];

  const source = sourceAddress || currentDonationAddress();
  if (!source) return [];

  const cutoffSec = Math.floor(nowMs / 1000) - WINDOW_SEC;
  const donors = donorsOf(txs, source);

  const seen = new Set();
  const rows = [];

  for (const tx of txs) {
    if (!tx?.txid || seen.has(tx.txid)) continue;
    if (typeof tx.time !== 'number' || tx.time < cutoffSec) continue;

    // Outgoing means the source address funded it.
    const sentBySource = (tx.vin || []).some((input) => input?.addr === source);
    if (!sentBySource) continue;

    seen.add(tx.txid);
    const note = decodeTxNote(tx);

    (tx.vout || []).forEach((out, index) => {
      const to = (out?.scriptPubKey?.addresses || [])[0];

      // No address: the OP_RETURN carrying the note. It pays nobody and is
      // already represented by `note`.
      if (!to) return;

      /*
       * Change. A 23 FLUX payment funded by a 25 FLUX input returns the
       * remainder to the source address in the same transaction; counting it
       * would roughly double the headline cost figure on the two real
       * transactions on record.
       */
      if (to === source) return;

      const amount = Number(out.value) || 0;
      if (amount <= 0) return;

      rows.push({
        key: `${tx.txid}:${index}`,
        txid: tx.txid,
        to,
        // Rounded for the same reason the donation total is: binary floating
        // point must not put 0.30000000000000004 on the front page.
        amount: Math.round(amount * 1e8) / 1e8,
        category: categorise(to, donors),
        note,
        blockHeight: tx.blockheight || 0,
        timeSec: tx.time
      });
    });
  }

  return rows.sort((a, b) => b.blockHeight - a.blockHeight);
}

/**
 * The header figures for the Community Support band.
 *
 * Cost is cloud + other; a refund is money RETURNED, not money spent, and
 * folding it into cost would overstate what running the project costs by an
 * order of magnitude on the data as it stands.
 *
 * @param {Array<{amount: number, category: string}>} rows
 */
export function aggregateCosts(rows) {
  const totals = {
    costFlux: 0,
    refundFlux: 0,
    cloudFlux: 0,
    otherFlux: 0,
    costCount: 0,
    refundCount: 0,
    rowCount: 0
  };
  if (!Array.isArray(rows)) return totals;

  for (const row of rows) {
    const amount = Number(row?.amount) || 0;
    totals.rowCount += 1;

    if (row?.category === 'refund') {
      totals.refundFlux += amount;
      totals.refundCount += 1;
      continue;
    }

    if (row?.category === 'cloud') totals.cloudFlux += amount;
    else totals.otherFlux += amount;

    totals.costFlux += amount;
    totals.costCount += 1;
  }

  const round = (n) => Math.round(n * 1e8) / 1e8;
  totals.costFlux = round(totals.costFlux);
  totals.refundFlux = round(totals.refundFlux);
  totals.cloudFlux = round(totals.cloudFlux);
  totals.otherFlux = round(totals.otherFlux);

  return totals;
}
