// Sum of FLUX a wallet must have sent to ADDRESS_FLUX (or OLD_ADDRESS_FLUX,
// see below) within DONOR_WINDOW_DAYS to qualify as a donor. Tunable — not
// hardcoded inline anywhere else.
export const DONOR_THRESHOLD_FLUX = 10;
export const DONOR_WINDOW_DAYS = 365;

// How long a verified donor-status result is trusted before fetch_donor_status
// re-checks the chain, matching fluxinfo.js's cache TTL convention.
export const DONOR_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Safety cap on explorer API pages fetched per check, for wallets whose donation
// address has an unusually long transaction history.
export const DONOR_MAX_PAGES_FETCHED = 20;

/*
 * The donation address has now moved twice.
 *
 *   t1ebxupk...qwLmUG   the long-standing address  -> OLD_ADDRESS_FLUX, below
 *   t1aUmu7H...s4Bumbt  current 2026-09-03 .. 2026-09-12  -> deliberately DROPPED
 *   t3YcVbiQ...u9Zjrr   current from 2026-09-12    -> content/index.js ADDRESS_FLUX
 *
 * Donor status is checked against ADDRESS_FLUX **and** OLD_ADDRESS_FLUX, so the
 * nine people who donated to t1ebxupk keep their credit indefinitely. There is
 * no cutoff date: it costs nothing to keep recognising a real donation, and a
 * date cutoff is one more thing to get wrong.
 *
 * WHY t1aUmu7H IS NOT IN THAT LIST, since dropping an address that once
 * received donations should never be done on assumption -- its full history was
 * read off the explorer before this change:
 *
 *   2026-03-10   85,949.00 FLUX  from t1gesjNJ... (project's own wallet)
 *   2026-02-11    1,180.00 FLUX  from t1gesjNJ...
 *   2026-01-05      918.00 FLUX  from t1gesjNJ...
 *   2025-12-08    1,008.00 FLUX  from t1gesjNJ...
 *   2025-11-07      784.07 FLUX  from t1gesjNJ...
 *   2025-09-28      601.00 FLUX  from t1gesjNJ...
 *   2024-03-11    2,000.00 FLUX  from t1XYUvMA... (914 days ago)
 *
 * Every inbound payment within the 365-day donor window came from the project's
 * own wallet. The single third-party payment predates the window by two and a
 * half years. So the number of people who lose donor status by dropping this
 * address is ZERO -- measured, not assumed. If that ever needs revisiting, the
 * check is one explorer query against t1aUmu7HDr7BtwmdR1Y9i2K6KFRZs4Bumbt.
 */
export const OLD_ADDRESS_FLUX = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';

/*
 * Addresses whose transfers to the donation address are NOT third-party
 * donations -- project-owned wallets moving funds -- and are therefore left out
 * of the network-wide totals on Home (issue #258).
 *
 * As of the 2026-09-12 address move this list is a NO-OP, and it is kept
 * anyway. Measured at the time of the move: over the trailing 365 days
 * t1ebxupk received 785.00 FLUX from 9 wallets and 0.00 from this address, so
 * nothing is currently being filtered. Every project-owned transfer that made
 * this list necessary went to t1aUmu7H, which is no longer scanned.
 *
 * It stays because the hazard has not gone away, only the evidence of it: the
 * original entry existed because ONE address accounted for ~99% of everything
 * the donation addresses had received in a year, and a transparency panel
 * headlining that figure as community backing is the exact failure this
 * prevents. The new address is as capable of receiving a project-owned transfer
 * as the old one was. A no-op guard costs nothing; re-discovering why it was
 * needed costs a wrong number on the front page.
 */
export const EXCLUDED_FROM_DONATION_TOTALS = ['t1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh'];

/*
 * The full donor-gate mechanism (wallet -> chain-donation check -> unlock)
 * is built: DonorContext verifies a wallet's real on-chain donations via
 * fetch_donor_status and gates premium features (currently just /live) on
 * the result. This flag is a dev/QA override that sits ON TOP OF that real
 * verification, not a replacement for it — DonorContext's `isUnlocked` is
 * `isTestingUnlocked() || donorStatus?.isDonor`, so flipping this on
 * unlocks premium features without needing a real donor wallet, while real
 * users are still gated by actual verified donations when it's off.
 *
 * Set via the TESTING Docker environment variable at container
 * start (see service/container-entrypoint.sh, which patches this value into
 * public/runtime/app-content.js before nginx serves it — no rebuild needed).
 * For local `yarn start` testing, flip the value directly in
 * client/public/runtime/app-content.js instead.
 */
export function isTestingUnlocked() {
  return window.gContent?.TESTING === true;
}
