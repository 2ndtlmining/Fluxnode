/*
 * The donation scan, persisted (issue #341).
 *
 * WHY THIS EXISTS. Scanning both donation addresses costs 19 sequential
 * explorer requests -- 1 for the current address (pagesTotal 0) and 18 for
 * OLD_ADDRESS_FLUX -- and globalStats.js held the result only in a
 * module-level variable behind a 60-second TTL. That was enough for #314,
 * whose problem was three callers each scanning on a single page load, but it
 * does nothing for a REMOUNT: Home is a class component, so leaving for /nodes
 * and coming back past the TTL pays the full 19 requests again with the panel
 * on its spinner throughout. A reload paid them regardless of the TTL.
 *
 * The explorer is tighter than that design assumed. Four manual requests
 * spread over two minutes were enough to draw a 429 while measuring this, and
 * per explorer.js a 429 surfaces in the browser as a CORS error, because a
 * rate-limited response omits its CORS headers. So re-fetching bytes we
 * already hold is not merely slow, it spends a budget that runs out in a way
 * that does not look like rate limiting.
 *
 * WHY TRIM, measured on the real scan rather than estimated:
 *
 *     raw                            4,306 KB   176 transactions
 *     drop script hex                1,034 KB   still 20% of the whole budget
 *     drop irrelevant outputs           49 KB   ~1% of the budget
 *
 * Dropping script hex -- scriptSig.hex, scriptPubKey.hex and the disassembled
 * asm beside them -- was the obvious trim and was NOT enough. The reason is
 * OLD_ADDRESS_FLUX: it is a node collateral address, and the largest
 * transaction touching it carries 2,001 outputs, a mining pool paying its
 * entire roster in one batch. Exactly one of those outputs is a donation.
 *
 * So the trim that matters is dropping outputs that pay no donation address.
 * paidToDonationAddress in donor/donationTotals.js sums ONLY those outputs, so
 * the rest cannot affect any figure this cache feeds. Inputs are reduced to
 * their distinct addresses for the same reason: senderOf returns the first
 * input that is not a donation address, so repeats cannot matter.
 *
 * v2 (#366/#367) widens that trim in two ways, detailed at DONATION_SCAN_CACHE_KEY
 * and inside trimTx below: an OUTGOING transaction keeps every addressed output,
 * not just those paying a donation address, because the Costs tab's whole
 * subject is what those outputs paid; and each transaction's decoded OP_RETURN
 * note (#367) is stored as plain text, not the script it came from.
 *
 * WHAT THIS COSTS. The persisted scan is therefore NOT a faithful copy of the
 * network's answer -- it is a copy adequate for fetch_donation_totals and
 * nothing else. fetch_wallet_donation_summary and fetch_total_donations
 * deliberately do not read it (see globalStats.js): they ask per-wallet
 * questions where a stale or lossy answer would tell a real supporter they had
 * not donated. Do not point them at this cache without revisiting the trim.
 *
 * The precedent is _trimSpecForCache in api/specs.js, which documents the same
 * hazard: a field dropped here does not fail loudly, it becomes a quietly
 * wrong number on a warm cache read.
 */

import { donationAddresses } from 'donor/donationTotals';
import { decodeTxNote } from 'donor/txNote';

/*
 * v2 (#366/#367): the trim now keeps the OP_RETURN note and, on outgoing
 * transactions, every addressed output. A v1 entry has neither, and read back
 * under this trim it would render a blank Note column and an empty Costs tab
 * without erroring -- so the key moves rather than the shape being widened in
 * place.
 */
export const DONATION_SCAN_CACHE_KEY = 'donationScan_v2';
const LEGACY_CACHE_KEYS = ['donationScan_v1'];

/** Same list, same order, so a changed donation address invalidates the entry. */
function sameAddresses(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((addr, i) => addr === b[i]);
}

/*
 * How old a persisted scan may be and still be shown.
 *
 * Generous on purpose. This value does not decide when to refetch -- the
 * caller always revalidates in the background -- it decides only how stale a
 * number may be while the fresh one is still in flight. A day-old donation
 * total displayed for two seconds and then corrected is strictly better than a
 * spinner for those same two seconds. Past a week the figure has drifted far
 * enough that a spinner is the more honest answer.
 */
export const DONATION_SCAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Only what the readers read, and only what they read it for. */
function trimTx(tx, addresses) {
  const vin = Array.isArray(tx?.vin) ? tx.vin : [];
  const vout = Array.isArray(tx?.vout) ? tx.vout : [];

  /*
   * Distinct input addresses, first-occurrence order preserved. senderOf walks
   * vin and returns the first address that is not a donation address, so
   * repeats can never change its answer -- and the largest real transaction
   * here has 33 inputs.
   */
  const seen = new Set();
  const senders = [];
  for (const input of vin) {
    const addr = input?.addr;
    if (seen.has(addr)) continue;
    seen.add(addr);
    senders.push({ addr });
  }

  /*
   * Outgoing transactions keep EVERY addressed output (#366). The recipient is
   * the entire subject of the Costs tab and pays no donation address, so the
   * incoming rule below would delete it; the change leg is kept because
   * buildCostRows must recognise and exclude it rather than guess.
   *
   * This is safe for size in a way the incoming rule is not: the 2,001-output
   * transaction that forced this trim is a mining pool paying its roster INTO
   * a donation address. `isOutgoing` tests against BOTH donation addresses, not
   * just the current one, so a transaction sent by OLD_ADDRESS_FLUX -- a node
   * collateral address with 18 pages of movement, per this file's header --
   * also keeps every addressed output here. That is retained rather than
   * filtered at this layer; buildCostRows (donor/costRows.js) then discards
   * all of it, because it scopes costs to the current address only. Bounded
   * because the old address has never sent a batch payment either: the whole
   * persisted cache, old-address outgoing outputs included, measures 75 KB
   * today. If that ever changes, cap here rather than narrowing the rule.
   */
  const isOutgoing = senders.some((s) => addresses.includes(s.addr));
  const keptVout = isOutgoing
    ? vout.filter((v) => (v?.scriptPubKey?.addresses || []).length > 0)
    : /*
       * Incoming: only the outputs that pay a donation address. EVERY one of
       * them is kept -- paidToDonationAddress sums them, so a donation split
       * across two outputs would otherwise be halved. A transaction that pays
       * none keeps its txid with an empty vout: it still exists, and its txid
       * still de-duplicates against the other address's scan.
       */
      vout.filter((v) => (v?.scriptPubKey?.addresses || []).some((a) => addresses.includes(a)));

  const trimmed = {
    txid: tx?.txid,
    time: tx?.time,
    blockheight: tx?.blockheight,
    vin: senders,
    vout: keptVout.map((v) => ({
      value: v?.value,
      scriptPubKey: { addresses: v?.scriptPubKey?.addresses }
    }))
  };

  /*
   * Stored DECODED (#367). Keeping the OP_RETURN script to re-parse later
   * would re-admit exactly the script hex this trim exists to strip, for no
   * gain: the decode is deterministic and the text is capped at 80 bytes by
   * the relay rule. Absent when there is no note, so the common case costs
   * nothing.
   */
  const note = decodeTxNote(tx);
  if (note) trimmed.note = note;

  return trimmed;
}

export function trimTxsForCache(txs, addresses = donationAddresses()) {
  if (!Array.isArray(txs)) return [];
  return txs.map((tx) => trimTx(tx, addresses));
}

/**
 * The persisted scan, or null when there is nothing usable.
 *
 * @returns {{ scans: Array<Array<object>|null>, timestamp: number } | null}
 */
export function readDonationScanCache() {
  try {
    const raw = localStorage.getItem(DONATION_SCAN_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!Array.isArray(cached?.scans)) return null;
    if (typeof cached.timestamp !== 'number') return null;
    if (Date.now() - cached.timestamp > DONATION_SCAN_MAX_AGE_MS) return null;

    /*
     * The trim discards outputs paying anything but a donation address, so an
     * entry is only readable under the address list it was written against.
     *
     * Not hypothetical: the donation address has already changed twice, most
     * recently on 2026-09-12. An entry written before a change would have
     * dropped every output paying the NEW address, and reading it back would
     * show a total silently missing every recent donation. An entry with no
     * recorded list predates this field and is discarded for the same reason.
     */
    if (!sameAddresses(cached.addresses, donationAddresses())) return null;

    return cached;
  } catch {
    // Corrupt JSON, a disabled storage API, a private window -- none of which
    // is worth failing a page render over.
    return null;
  }
}

/**
 * Persist a scan, trimming it on the way in.
 *
 * Mirrors the in-memory guard in scanBothDonationAddresses: a scan where EVERY
 * address came back null is not an answer, it is an outage, and writing it
 * would turn one 429 into a confident zero that survives reloads -- strictly
 * worse than the re-fetching this exists to avoid. A partial result IS
 * written: one address failing while the other reads is a real answer about
 * the one that read, and the callers already distinguish null from [].
 */
export function writeDonationScanCache(scans) {
  if (!Array.isArray(scans)) return;
  if (scans.every((txs) => txs === null)) return;

  const addresses = donationAddresses();

  try {
    // A v1 entry is unreadable now and is pure dead weight in a storage
    // budget this module already fights for.
    for (const key of LEGACY_CACHE_KEYS) localStorage.removeItem(key);

    localStorage.setItem(
      DONATION_SCAN_CACHE_KEY,
      JSON.stringify({
        scans: scans.map((txs) => (txs === null ? null : trimTxsForCache(txs, addresses))),
        timestamp: Date.now(),
        addresses
      })
    );
  } catch {
    // Quota exceeded or storage unavailable. Non-fatal: the in-memory cache
    // still works for this session.
  }
}
