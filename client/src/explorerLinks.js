import { EXPLORER_HOSTS, __explorerHealth } from 'explorer';

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

/** The currently-preferred host, with the /api suffix removed. */
function uiHost() {
  const now = Date.now();
  const health = __explorerHealth();
  /*
   * When every host is benched, fall back to the first rather than returning
   * nothing. A benched host is one that failed us recently, not one known to
   * be gone -- most often it is rate-limiting our JSON polling, which says
   * nothing about whether a person clicking through will get a page. An
   * unlinked number would be the worse answer.
   */
  const host = EXPLORER_HOSTS.find((h) => health[h].benchedUntil <= now) || EXPLORER_HOSTS[0];
  return host.replace(/\/api\/?$/, '');
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
 * Deliberately not used on Home: #322 removed donor transaction links from the
 * donation list, so that the panel does not expose who donated and from which
 * transaction. Chain Activity's transfers are network-wide chain events rather
 * than anybody's donation, so the same reasoning does not apply there.
 */
export function explorerTxUrl(txid) {
  if (typeof txid !== 'string' || !BLOCK_HASH.test(txid)) return null;
  return `${uiHost()}/tx/${txid}`;
}
