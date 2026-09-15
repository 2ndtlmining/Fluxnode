import { explorerBlockUrl, explorerTxUrl, explorerAddressUrl } from './explorerLinks';
import { EXPLORER_HOSTS, __resetExplorerHealth, __explorerHealth } from './explorer';

/*
 * Issue #347: block numbers should open the block in the explorer.
 *
 * TWO THINGS MAKE THIS LESS TRIVIAL THAN IT LOOKS.
 *
 * 1. The explorer's UI path takes a HASH, not a height. Verified against the
 *    live host:
 *
 *        404  https://explorer.runonflux.io/block/2946401
 *        200  https://explorer.runonflux.io/api/block-index/2946401
 *
 *    So a height alone cannot produce a link, and a caller without a hash must
 *    get null rather than a URL that 404s.
 *
 * 2. EXPLORER_HOSTS entries END IN /api, because everything else in the app
 *    uses them for JSON. explorerUrl() therefore yields …/api/block/<hash> --
 *    the API path, not the page a person should land on. Every link would be
 *    broken, and invisibly so, because nothing checks a URL until it is
 *    clicked.
 *
 * The host choice reuses explorer.js's health tracking, which is the point:
 * #347 notes "sometimes the explorer looses block synch", and the pool already
 * benches a host that has been failing.
 */

beforeEach(() => {
  __resetExplorerHealth();
});

const HASH = '4de770137e6a9b357ef3eab793781e5293a05f87f121490643e1c63e4b8c5a5b';

describe('explorerBlockUrl', () => {
  it('builds a UI block URL from a hash', () => {
    expect(explorerBlockUrl(HASH)).toBe(`https://explorer.runonflux.io/block/${HASH}`);
  });

  /*
   * The regression this file exists for. /api/block/<hash> is not a page.
   */
  it('does NOT point at the API path', () => {
    expect(explorerBlockUrl(HASH)).not.toContain('/api/');
  });

  it('returns null without a hash, rather than a URL that 404s', () => {
    // Records written before the scanner stored hashes have none. A row must
    // render as plain text in that case, which it can only do if it is told.
    for (const missing of [null, undefined, '', 0]) {
      expect(explorerBlockUrl(missing)).toBeNull();
    }
  });

  it('refuses anything that is not a block hash', () => {
    // A height is the obvious thing to pass by mistake, and it 404s.
    expect(explorerBlockUrl(2946401)).toBeNull();
    expect(explorerBlockUrl('2946401')).toBeNull();
    expect(explorerBlockUrl('not a hash')).toBeNull();
    expect(explorerBlockUrl(HASH.slice(0, 40))).toBeNull();
  });

  it('accepts an upper-case hash', () => {
    expect(explorerBlockUrl(HASH.toUpperCase())).toContain(HASH.toUpperCase());
  });

  /*
   * DOES NOT FAIL OVER, and that is the fix rather than the bug.
   *
   * This test previously asserted the opposite -- that benching the primary
   * produced an explorer.app.runonflux.io URL. Measured against the live hosts
   * on 2026-09-16, that URL does not exist:
   *
   *     200  https://explorer.app.runonflux.io/
   *     200  https://explorer.app.runonflux.io/api/sync
   *     404  https://explorer.app.runonflux.io/tx/<txid>
   *     404  https://explorer.app.runonflux.io/address/<address>
   *
   * The secondary serves the API but not the UI, so failing over to it turned
   * every link on the page into a 404 precisely when the primary was
   * rate-limiting -- which is routine, because the primary is the host the app
   * polls. The old assertion could not catch it: it compared one string to
   * another, and this file's own header explains why that is not enough
   * ("nothing checks a URL until it is clicked").
   */
  it('does not fail over to the API-only host when the primary is benched', () => {
    __explorerHealth()[EXPLORER_HOSTS[0]].benchedUntil = Date.now() + 60_000;

    expect(explorerBlockUrl(HASH)).toBe(`https://explorer.runonflux.io/block/${HASH}`);
  });

  it('still returns a link when every host is benched', () => {
    // A benched host is one that failed recently, not one known to be gone --
    // most often it is rate-limiting our JSON polling, which says nothing
    // about whether a person clicking through gets a page. No link at all
    // would be the worse answer.
    for (const host of EXPLORER_HOSTS) {
      __explorerHealth()[host].benchedUntil = Date.now() + 60_000;
    }

    expect(explorerBlockUrl(HASH)).toBe(`https://explorer.runonflux.io/block/${HASH}`);
  });
});

describe('explorerTxUrl', () => {
  /*
   * Used by Chain Activity's transfer rows and, since the owner reinstated
   * them for verifiability, by Home's donation and cost lists too. #322 had
   * removed the Home links; the donor ADDRESS remains unlinked, which is the
   * part of #322 that still stands.
   */
  it('builds a UI transaction URL', () => {
    expect(explorerTxUrl(HASH)).toBe(`https://explorer.runonflux.io/tx/${HASH}`);
  });

  it('returns null without a txid', () => {
    expect(explorerTxUrl(null)).toBeNull();
    expect(explorerTxUrl('')).toBeNull();
  });
});

/*
 * Issue #358: the Recent activity panel links a transaction's counterparty
 * through to its address page.
 *
 * A separate validator from the two above, because a Flux address is NOT a
 * 64-character hash -- it is a base58 t1/t3 string of a different length
 * entirely. Reusing the hash check would reject every real address, and
 * accepting anything would put junk in a URL.
 */
describe('explorerAddressUrl', () => {
  const T1 = 't1X1hKAb9rYmsikPKVJXBHueJU4VeuV7Tbb';
  const T3 = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr';

  it('builds an address page URL for both address forms', () => {
    expect(explorerAddressUrl(T1)).toBe(`https://explorer.runonflux.io/address/${T1}`);
    expect(explorerAddressUrl(T3)).toBe(`https://explorer.runonflux.io/address/${T3}`);
  });

  it('does NOT point at the API path', () => {
    expect(explorerAddressUrl(T1)).not.toContain('/api/');
  });

  it('returns null when there is no counterparty to link to', () => {
    // "Unknown" is a real answer in this panel -- the explorer omits `addr` on
    // some inputs -- and it must render as text, not as a link to nowhere.
    for (const missing of [null, undefined, '', 0]) {
      expect(explorerAddressUrl(missing)).toBeNull();
    }
  });

  it('refuses anything that is not a Flux address', () => {
    expect(explorerAddressUrl('not an address')).toBeNull();
    expect(explorerAddressUrl('t2Wrong0000000000000000000000000000')).toBeNull();
    expect(explorerAddressUrl('t1short')).toBeNull();
    // A txid is the obvious thing to pass by mistake here.
    expect(explorerAddressUrl('a'.repeat(64))).toBeNull();
  });

  it('stays on the UI-capable host when the primary is benched, like the others', () => {
    // Same correction as the block test above: the secondary 404s on
    // /address/, so failing over to it produced a dead link.
    __explorerHealth()[EXPLORER_HOSTS[0]].benchedUntil = Date.now() + 60_000;

    expect(explorerAddressUrl(T1)).toBe(`https://explorer.runonflux.io/address/${T1}`);
  });
});
