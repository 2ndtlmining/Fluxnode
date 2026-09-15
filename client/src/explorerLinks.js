import { EXPLORER_HOSTS } from 'explorer';

/*
 * Links INTO the block explorer's web pages (issue #347).
 *
 * Distinct from explorer.js's explorerUrl(), and it has to be. Every entry in
 * EXPLORER_HOSTS ends in `/api`, because everything else in the app uses those
 * hosts for JSON -- so explorerUrl('/block/<hash>') yields
 *
 *     https://explorer.runonflux.io/api/block/<hash>
 *
 * which is the API path, not the page a person should land on. Building links
 * from it would ship a broken URL on every row, invisibly, because nothing
 * checks a link until somebody clicks it.
 *
 * THE PATH TAKES A HASH, NOT A HEIGHT. Verified against the live host:
 *
 *     404  https://explorer.runonflux.io/block/2946401
 *     200  https://explorer.runonflux.io/api/block-index/2946401
 *
 * A height is the obvious thing to pass by mistake and it 404s, so anything
 * that is not a 64-character hex hash is refused outright. Callers get null
 * and render plain text -- which is what a row from before the scanner stored
 * hashes must do.
 *
 * Host choice reuses explorer.js's health tracking rather than hardcoding the
 * primary: #347 observes that the explorer sometimes loses block sync, and the
 * pool already benches a host that has been failing.
 */

const BLOCK_HASH = /^[0-9a-fA-F]{64}$/;

/*
 * The host that serves the explorer's human-facing pages, with the /api
 * suffix removed.
 *
 * NOT chosen by health, and that is a correction to #347 rather than an
 * oversight. Health tracking answers "is this host serving us JSON right
 * now", which is the wrong question for a link a person will click: only the
 * PRIMARY host serves the UI at all. Measured against both hosts on
 * 2026-09-16:
 *
 *     200  https://explorer.app.runonflux.io/
 *     200  https://explorer.app.runonflux.io/api/sync
 *     404  https://explorer.app.runonflux.io/tx/<txid>
 *     404  https://explorer.app.runonflux.io/address/<address>
 *
 * So the secondary is API-capable but not UI-capable, and failing over to it
 * turned every link on the page into a 404 exactly when the primary was
 * rate-limiting -- which is often, since the primary is the one the app polls.
 * A link to a rate-limited host still loads for someone clicking a moment
 * later; a link to a 404 never loads at all.
 *
 * This file's own header warns that a broken link ships invisibly because
 * nothing checks a URL until somebody clicks it. That is precisely how this
 * survived: two tests asserted the failover produced an app-host URL, and
 * neither could tell that the URL it asserted does not exist.
 *
 * If the secondary ever starts serving UI pages, restoring health-based
 * failover is the right move -- re-measure the four paths above first.
 */
const UI_HOST = EXPLORER_HOSTS[0].replace(/\/api\/?$/, '');

function uiHost() {
  return UI_HOST;
}

/**
 * The explorer page for a block, or null when there is no hash to link to.
 *
 * @param {string} hash 64-character block hash. A height is NOT accepted.
 */
export function explorerBlockUrl(hash) {
  if (typeof hash !== 'string' || !BLOCK_HASH.test(hash)) return null;
  return `${uiHost()}/block/${hash}`;
}

/**
 * The explorer page for a transaction, or null without one.
 *
 * Used by Chain Activity's transfer rows, and again by Home's donation and
 * cost lists. #322 had removed the Home links so the panel would not expose
 * who donated and from which transaction; the project owner reinstated the
 * transaction link for verifiability, while the donor address stays unlinked
 * text. See TxLink in home/HomeOverview/index.jsx for that reasoning.
 */
export function explorerTxUrl(txid) {
  if (typeof txid !== 'string' || !BLOCK_HASH.test(txid)) return null;
  return `${uiHost()}/tx/${txid}`;
}

/*
 * A Flux transparent address: t1 (P2PKH) or t3 (P2SH), base58, 35 characters.
 *
 * Deliberately NOT the hash pattern above. An address is not a 64-character
 * hex string, so reusing that check would reject every real address -- and
 * accepting anything would put junk straight into a URL. A txid is the obvious
 * thing to pass here by mistake, and this rejects it.
 */
const FLUX_ADDRESS = /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * The explorer page for an address, or null when there is nothing to link to.
 *
 * Used by the Donor tab's activity rows (#358) to open a counterparty. An
 * unknown counterparty returns null and renders as text: the explorer genuinely
 * omits `addr` on some inputs, so "Unknown" is a real answer rather than a
 * missing one, and it must not become a link to nowhere.
 */
export function explorerAddressUrl(address) {
  if (typeof address !== 'string' || !FLUX_ADDRESS.test(address)) return null;
  return `${uiHost()}/address/${address}`;
}
