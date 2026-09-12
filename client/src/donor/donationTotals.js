import { DONOR_WINDOW_DAYS, OLD_ADDRESS_FLUX, EXCLUDED_FROM_DONATION_TOTALS } from './config';

/*
 * Network-wide donation aggregates for the Home transparency panel (issue #258).
 *
 * Separate from api/globalStats.js's fetch_total_donations, which answers a
 * different question -- how many donation TRANSACTIONS one wallet has sent,
 * which is what the donor/super_donor/sugar_daddy achievements gate on. This
 * answers "what has the community given in the last year", so it sums FLUX and
 * counts distinct senders instead.
 *
 * Pure on purpose: the numbers it produces are the headline of a panel about
 * transparency, and the rules below (what counts as a donation, whose money is
 * excluded, which window) are exactly the sort of thing that looks right in a
 * screenshot and is wrong on the data.
 */

const WINDOW_SEC = DONOR_WINDOW_DAYS * 24 * 60 * 60;

function donationAddresses() {
  // Read at call time, not module load: window.gContent is populated by
  // public/runtime/app-content.js, which the container entrypoint rewrites.
  const current = (typeof window !== 'undefined' && window.gContent?.ADDRESS_FLUX) || null;
  return [current, OLD_ADDRESS_FLUX].filter(Boolean);
}

/*
 * What this transaction actually paid to a donation address.
 *
 * Summing vout blindly would count CHANGE: a 50 FLUX donation funded by a 200
 * FLUX input returns 150 to the sender in the same transaction, and that return
 * leg is not a donation.
 */
function paidToDonationAddress(tx, addresses) {
  let paid = 0;
  for (const out of tx?.vout || []) {
    const outAddrs = out?.scriptPubKey?.addresses || [];
    if (outAddrs.some((a) => addresses.includes(a))) paid += Number(out.value) || 0;
  }
  return paid;
}

/*
 * Who sent it. Inputs belonging to a donation address are skipped so a
 * consolidation or refund from the project's own address is never credited as
 * an incoming donation.
 */
function senderOf(tx, addresses) {
  for (const input of tx?.vin || []) {
    const addr = input?.addr;
    if (addr && !addresses.includes(addr)) return addr;
  }
  return null;
}

export function aggregateDonations(txs, { nowMs = Date.now(), excluded } = {}) {
  const empty = { totalFlux: 0, uniqueDonors: 0, donationCount: 0, lastDonation: null };
  if (!Array.isArray(txs)) return empty;

  const addresses = donationAddresses();
  const skip = new Set(excluded || EXCLUDED_FROM_DONATION_TOTALS);
  const cutoffSec = Math.floor(nowMs / 1000) - WINDOW_SEC;

  // Callers concatenate one scan per donation address, so a transaction paying
  // BOTH arrives twice.
  const seen = new Set();
  const donors = new Set();
  let totalFlux = 0;
  let donationCount = 0;
  let lastDonation = null;

  for (const tx of txs) {
    if (!tx?.txid || seen.has(tx.txid)) continue;
    if (typeof tx.time !== 'number' || tx.time < cutoffSec) continue;

    const amount = paidToDonationAddress(tx, addresses);
    if (amount <= 0) continue;

    const from = senderOf(tx, addresses);
    if (!from || skip.has(from)) continue;

    seen.add(tx.txid);
    donors.add(from);
    totalFlux += amount;
    donationCount += 1;

    if (!lastDonation || tx.time > lastDonation.timeSec) {
      lastDonation = { amount, from, timeSec: tx.time };
    }
  }

  return {
    // Rounded so binary floating point cannot put 0.30000000000000004 on screen.
    totalFlux: Math.round(totalFlux * 1e8) / 1e8,
    uniqueDonors: donors.size,
    donationCount,
    lastDonation
  };
}

/*
 * How long ago, in words.
 *
 * Deliberately coarsens past a week. The most recent real donation at the time
 * of writing was five weeks old, and a bare date that stale reads as "this
 * project is abandoned" -- "5 weeks ago" says the same thing without the
 * implication that something is broken.
 */
export function relativeAge(timeSec, nowMs = Date.now()) {
  if (typeof timeSec !== 'number') return null;

  const days = Math.floor((Math.floor(nowMs / 1000) - timeSec) / (24 * 60 * 60));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }

  const months = Math.round(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

/*
 * The same donations, one row each, for the Home list (issue #315).
 *
 * Shares paidToDonationAddress, senderOf and the window with
 * aggregateDonations above, deliberately: the list and the total sit in the
 * same panel, and if they disagreed about what counts as a donation the panel
 * would contradict itself on screen. A test pins that they agree.
 *
 * The ONE difference is project-owned transfers. aggregateDonations drops them
 * from the total -- that is the whole point of EXCLUDED_FROM_DONATION_TOTALS,
 * and it stays true. This lists them with `isProjectTransfer` set instead of
 * dropping them, so the panel can label them. Hiding them would leave the list
 * unable to reconcile against the address's on-chain balance with nothing on
 * screen to explain the gap; showing them unlabelled would headline a project
 * transfer as community backing, which is the exact hazard the exclusion list
 * was created for.
 *
 * Sorted by block height, descending -- latest first.
 */
export function buildDonationRows(txs, { nowMs = Date.now(), excluded } = {}) {
  if (!Array.isArray(txs)) return [];

  const addresses = donationAddresses();
  const projectWallets = new Set(excluded || EXCLUDED_FROM_DONATION_TOTALS);
  const cutoffSec = Math.floor(nowMs / 1000) - WINDOW_SEC;

  const seen = new Set();
  const rows = [];

  for (const tx of txs) {
    if (!tx?.txid || seen.has(tx.txid)) continue;
    if (typeof tx.time !== 'number' || tx.time < cutoffSec) continue;

    const amount = paidToDonationAddress(tx, addresses);
    if (amount <= 0) continue;

    const from = senderOf(tx, addresses);
    if (!from) continue;

    seen.add(tx.txid);
    rows.push({
      txid: tx.txid,
      from,
      // Rounded for the same reason the total is: binary floating point must
      // not put 0.30000000000000004 on the front page.
      amount: Math.round(amount * 1e8) / 1e8,
      blockHeight: tx.blockheight || 0,
      timeSec: tx.time,
      isProjectTransfer: projectWallets.has(from)
    });
  }

  return rows.sort((a, b) => b.blockHeight - a.blockHeight);
}

/*
 * Middle-elided identifiers for the Home donation list.
 *
 * Deliberately SHORT. Home is the front page, and a full donor address or
 * transaction id printed there publishes, to everyone who loads the site, a
 * tidy index of who supports the project and exactly which transactions they
 * sent. All of it is public on chain -- but public-if-you-go-looking and
 * published-on-the-landing-page are different things, and the second is not
 * something a donor opted into by donating.
 *
 * What survives is enough to recognise a row and to paste into the explorer's
 * search if you already know what you are looking for, and not enough to read
 * the page as a directory. `head`/`tail` are explicit at each call site
 * because the two columns are deliberately different widths.
 */
export function shortId(value, head, tail) {
  if (typeof value !== 'string' || !value) return '';
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}..${value.slice(-tail)}`;
}
